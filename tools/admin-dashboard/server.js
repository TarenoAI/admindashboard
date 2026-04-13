const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec, execFile, spawn } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3477;

// BasicAuth brute-force protection (in-memory)
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 min
const AUTH_MAX_FAILS = 6;
const AUTH_COOLDOWN_MS = 15 * 60 * 1000; // 15 min lock
const authAttempts = new Map();

// --- SECURITY: Basic Authentication ---
// Reads credentials from dashboard-auth.json in the same folder,
// then falls back to env vars, then to built-in defaults.
function loadAuthConfig() {
    try {
        const configPath = path.join(__dirname, 'dashboard-auth.json');
        if (fs.existsSync(configPath)) {
            const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return { user: cfg.user || 'admin', pass: cfg.pass };
        }
    } catch (e) { /* ignore parse errors */ }
    return {
        user: process.env.DASHBOARD_USER || 'admin',
        pass: process.env.DASHBOARD_PASS || 'SecretClaw123!'
    };
}
const authCfg = loadAuthConfig();
console.log(`[Auth] Dashboard-Login: user="${authCfg.user}", pass-source=${fs.existsSync(path.join(__dirname, 'dashboard-auth.json')) ? 'dashboard-auth.json' : 'env/default'}`);

app.use((req, res, next) => {
    // Public bridge routes are protected by x-bridge-secret instead of BasicAuth
    const p = (req.path || '');
    if (p.startsWith('/api/ytdlp/')) return next();
    // Public screenshot endpoints for quick share in chat
    if (p === '/bulifollows-latest.png' || p === '/bulifollows_update-latest.png') return next();

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const now = Date.now();
    const state = authAttempts.get(ip) || { fails: [], lockedUntil: 0 };

    // active cooldown
    if (state.lockedUntil && now < state.lockedUntil) {
        const retryAfterSec = Math.ceil((state.lockedUntil - now) / 1000);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).send(`Too many failed login attempts. Retry in ${retryAfterSec}s.`);
    }

    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login && password && login === authCfg.user && password === authCfg.pass) {
        authAttempts.delete(ip); // reset on successful auth
        return next();
    }

    // register failure in rolling window
    const freshFails = (state.fails || []).filter(ts => now - ts <= AUTH_WINDOW_MS);
    freshFails.push(now);
    state.fails = freshFails;

    if (freshFails.length >= AUTH_MAX_FAILS) {
        state.lockedUntil = now + AUTH_COOLDOWN_MS;
    } else {
        state.lockedUntil = 0;
    }

    authAttempts.set(ip, state);
    res.set('WWW-Authenticate', 'Basic realm="OpenClaw Admin Dashboard"');
    return res.status(401).send('Authentication required.');
});
// --------------------------------------

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const ALLOWED_WORKSPACES = [
    WORKSPACE_ROOT,
    "/root/.openclaw/workspace-blog"
].map(p => path.resolve(p));
const MEMORY_DIR = path.join(WORKSPACE_ROOT, "memory");
const SKILLS_DIR = "/usr/lib/node_modules/openclaw/skills";
const PROJECT_DATA_DIR = path.join(WORKSPACE_ROOT, "data", "projects");
const SKILL_POLICY_FILE = path.join(WORKSPACE_ROOT, "data", "skills-policy.json");
const NOTEBOOKLM_JOB_DIR = path.join(WORKSPACE_ROOT, "data", "notebooklm", "jobs");
const NOTEBOOKLM_BRIDGE_PATH = path.join(__dirname, "scripts", "notebooklm_audio_bridge.py");
const NOTEBOOKLM_PYTHON_BIN = process.env.NOTEBOOKLM_PYTHON_BIN
    || (fs.existsSync("/opt/homebrew/bin/python3.11") ? "/opt/homebrew/bin/python3.11" : "python3");
const NOTEBOOKLM_AUDIO_FORMATS = new Set(["DEEP_DIVE", "BRIEF", "CRITIQUE", "DEBATE"]);
const NOTEBOOKLM_AUDIO_LENGTHS = new Set(["SHORT", "DEFAULT", "LONG"]);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

function isAllowedWorkspacePath(absPath) {
    const resolved = path.resolve(absPath);
    return ALLOWED_WORKSPACES.some(root => resolved === root || resolved.startsWith(root + path.sep));
}

function readFileSafe(filePath) {
    try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}
function listFilesSafe(dir) {
    try { return fs.readdirSync(dir).sort(); } catch { return []; }
}
function runCmd(cmd, options = {}) {
    const timeout = Number(options.timeoutMs);
    const maxBuffer = Number(options.maxBuffer);
    return new Promise((resolve) => {
        exec(cmd, {
            timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 12000,
            maxBuffer: Number.isFinite(maxBuffer) && maxBuffer > 0 ? maxBuffer : (10 * 1024 * 1024),
        }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                stdout: (stdout || "").trim(),
                stderr: (stderr || "").trim(),
                error: err ? err.message : null,
            });
        });
    });
}
function tryParseJson(s) {
    try { return JSON.parse(s); } catch { return null; }
}
async function runFirstOk(commands) {
    for (const cmd of commands) {
        const r = await runCmd(cmd);
        if (r.ok && (r.stdout || "").length) return { cmd, ...r };
    }
    const last = await runCmd(commands[commands.length - 1]);
    return { cmd: commands[commands.length - 1], ...last };
}
function parseSimpleCron(text) {
    const lines = (text || "").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    return lines.map((line, idx) => {
        const parts = line.split(/\s+/);
        if (parts.length < 6) return { id: idx + 1, raw: line, schedule: "?", command: line };
        return { id: idx + 1, raw: line, schedule: parts.slice(0, 5).join(" "), command: parts.slice(5).join(" ") };
    });
}

function parseOpenClawCronList(text) {
    const lines = (text || "").split("\n").map(l => l.trim()).filter(Boolean);
    const rows = lines.filter(l => !l.startsWith('ID ') && !/^[-]+$/.test(l) && !l.startsWith('🦞') && !l.startsWith('Usage:') && !l.startsWith('Docs:'));
    return rows.map((line) => {
        const parts = line.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
        if (parts.length < 7) return null;
        return {
            id: parts[0],
            name: parts[1],
            schedule: parts[2],
            next: parts[3],
            last: parts[4],
            status: parts[5],
            target: parts[6],
            agent: parts[7] || null,
            raw: line
        };
    }).filter(Boolean);
}

async function getSkills() {
    const dirs = listFilesSafe(SKILLS_DIR);
    const out = [];
    for (const d of dirs) {
        const skillMd = path.join(SKILLS_DIR, d, "SKILL.md");
        const content = readFileSafe(skillMd);
        if (!content) continue;
        const firstLine = content.split("\n").find(l => l.trim()) || "";
        out.push({ name: d, path: path.join(SKILLS_DIR, d), title: firstLine.replace(/^#+\s*/, "") });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

function getProjectFile(projectId) {
    return path.join(PROJECT_DATA_DIR, `${projectId}.json`);
}

function loadProjectMeta(projectId) {
    const file = getProjectFile(projectId);
    const raw = readFileSafe(file);
    if (!raw) return null;
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
}

function saveProjectMeta(projectId, data) {
    const file = getProjectFile(projectId);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getAgentWorkspace(agentId) {
    const cfg = loadOpenClawConfig().data;
    const list = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : [];
    const found = list.find(a => String(a.id || '').toLowerCase() === String(agentId || '').toLowerCase());
    return found?.workspace || WORKSPACE_ROOT;
}

function writeProjectSnapshotToAgent(projectId, data, agentId) {
    const permission = data.permissions?.[agentId] || 'read';
    const ws = getAgentWorkspace(agentId);
    const outDir = path.join(ws, 'projects', '_access');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${projectId}.md`);

    const lines = [
        `# Project Access Snapshot: ${data.name || projectId}`,
        '',
        `- Project ID: ${projectId}`,
        `- Permission: ${permission}`,
        `- Last Sync: ${new Date().toISOString()}`,
        '',
        '## Summary',
        data.summary || '—',
        '',
        '## Tasks',
        ...(Array.isArray(data.tasks) ? data.tasks.map(t => `- [${t.status}] ${t.id}: ${t.title} (prio: ${t.priority || 'n/a'}, assignee: ${t.assignee || '—'})`) : ['- —']),
        '',
        '## References',
        ...(Array.isArray(data.dataRefs) ? data.dataRefs.map(r => `- ${r.label}: ${r.path} (${r.type || 'file'})`) : ['- —'])
    ];

    fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
    return { outFile, permission };
}

function syncAllAssignedAgents(projectId, data) {
    const agents = Array.isArray(data.agents) ? data.agents : [];
    return agents.map(a => {
        try {
            const result = writeProjectSnapshotToAgent(projectId, data, a.id);
            return { agentId: a.id, ok: true, ...result };
        } catch (e) {
            return { agentId: a.id, ok: false, error: e.message };
        }
    });
}

function hasProjectWritePermission(projectData, agentId) {
    if (!agentId) return true; // dashboard/manual calls without actor are allowed
    const perms = (projectData && typeof projectData.permissions === 'object') ? projectData.permissions : {};
    return String(perms[agentId] || 'read').toLowerCase() === 'write';
}

function countTasksByState(tasks = []) {
    const states = { backlog: 0, in_progress: 0, review: 0, done: 0, blocked: 0 };
    tasks.forEach(t => {
        const key = (t.status || '').toLowerCase();
        if (states[key] != null) states[key] += 1;
        if (t.blocker) states.blocked += 1;
    });
    return states;
}

const PIPELINE_CORE_STEP_IDS = [
    'content_research',
    'structure',
    'drafting',
    'feature_inserts',
    'editing',
    'geo_polish',
    'final'
];

const PIPELINE_OPTIONAL_STEP_IDS = [
    'multimedia_enrichment'
];

const PIPELINE_STEP_IDS = [
    ...PIPELINE_CORE_STEP_IDS,
    ...PIPELINE_OPTIONAL_STEP_IDS
];

const PIPELINE_STEP_ALIASES = {
    content_research: 'content_research',
    research: 'content_research',
    recherche: 'content_research',
    structure: 'structure',
    seo: 'structure',
    outline: 'structure',
    drafting: 'drafting',
    draft: 'drafting',
    entwurf: 'drafting',
    feature_inserts: 'feature_inserts',
    features: 'feature_inserts',
    feature: 'feature_inserts',
    editing: 'editing',
    edited: 'editing',
    edit: 'editing',
    redaktion: 'editing',
    geo_polish: 'geo_polish',
    geo: 'geo_polish',
    geopolish: 'geo_polish',
    final: 'final',
    final_review: 'final',
    finalreview: 'final',
    review_final: 'final',
    multimedia_enrichment: 'multimedia_enrichment',
    multimedia: 'multimedia_enrichment',
    multimedia_md: 'multimedia_enrichment',
    assets: 'multimedia_enrichment',
    asset: 'multimedia_enrichment',
    asset_plan: 'multimedia_enrichment',
    assetplan: 'multimedia_enrichment',
    '08_asset_plan': 'multimedia_enrichment',
    '08_multimedia_enrichment': 'multimedia_enrichment',
    media_plan: 'multimedia_enrichment',
    visual_plan: 'multimedia_enrichment'
};

const PIPELINE_STEP_FILE_NAMES = {
    content_research: 'research',
    structure: 'structure',
    drafting: 'draft',
    feature_inserts: 'feature_inserts',
    editing: 'edited',
    geo_polish: 'geo_polish',
    final: 'final',
    multimedia_enrichment: 'asset_plan'
};

const PIPELINE_STEP_DOC_FALLBACKS = {
    content_research: ['02_research.md', '01_kb_pack.md', 'research.md'],
    structure: ['03_outline.md', '02_structure.md', 'seo.md', 'outline.md'],
    drafting: ['04_draft.md', 'draft.md'],
    feature_inserts: ['05_product_inserts.md', 'product_inserts.md'],
    editing: ['06_edited.md', 'editing.md', 'edit.md'],
    geo_polish: ['07_geo_polish.md', 'geo_polish.md'],
    final: ['FINAL.md', '07_final.md', 'final.md'],
    multimedia_enrichment: ['08_asset_plan.md', 'asset_plan.md', '08_multimedia_enrichment.md', 'multimedia_enrichment.md']
};

const PIPELINE_STEP_DISCOVERY_TOKENS = {
    content_research: ['research', 'kb_pack'],
    structure: ['structure', 'outline', 'seo'],
    drafting: ['draft'],
    feature_inserts: ['feature_inserts', 'product_inserts'],
    editing: ['edited', 'editing', 'edit'],
    geo_polish: ['geo_polish'],
    final: ['final'],
    multimedia_enrichment: ['asset_plan', 'multimedia_enrichment']
};

function normalizePipelineStepId(stepId) {
    const key = String(stepId || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return PIPELINE_STEP_ALIASES[key] || null;
}

function pipelineRowId(index) {
    return `TAG-${String(Number(index) + 1).padStart(2, '0')}`;
}

function safeSlug(value, fallback = 'item') {
    const slug = String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || fallback;
}

function normalizeLooseText(input) {
    return String(input || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function getPipelineRowFolder(row, index) {
    const compact = String(row?.id || pipelineRowId(index)).toLowerCase().replace(/[^a-z0-9]/g, '');
    const m = compact.match(/^tag(\d+)$/);
    if (m) return `tag${String(Number(m[1])).padStart(2, '0')}`;
    return compact || `tag${String(Number(index) + 1).padStart(2, '0')}`;
}

function normalizeFileStem(input) {
    return String(input || '')
        .toLowerCase()
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function parseLooseScalarValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        return raw.slice(1, -1);
    }
    if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === 'true';
    if (/^(null|~)$/i.test(raw)) return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
    return raw;
}

function parseSimpleFrontmatter(raw) {
    const text = String(raw || '').replace(/\r\n/g, '\n');
    const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: text };

    const data = {};
    for (const line of match[1].split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!parts) continue;
        data[parts[1]] = parseLooseScalarValue(parts[2]);
    }
    return { data, body: match[2] || '' };
}

function parseSimpleKeyValueFile(raw) {
    const text = String(raw || '').replace(/\r\n/g, '\n');
    const data = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!parts) continue;
        data[parts[1]] = parseLooseScalarValue(parts[2]);
    }
    return data;
}

function countWords(raw) {
    const text = String(raw || '').trim();
    return text ? text.split(/\s+/).length : 0;
}

function isoMtime(absPath) {
    try {
        const stat = fs.statSync(absPath);
        return stat?.mtime ? new Date(stat.mtime).toISOString() : null;
    } catch {
        return null;
    }
}

function detectCompactPagePlaceholders(raw) {
    return /(TODO|TBD|\{\{[^}]+\}\}|<[^>\n]+>)/.test(String(raw || ''));
}

function collectCompactPagesForProject(projectId) {
    const brand = safeSlug(projectId, String(projectId || 'project').toLowerCase());
    const rootAbs = path.join(WORKSPACE_ROOT, 'projects', 'compact-pages', brand);
    const rootRel = path.relative(WORKSPACE_ROOT, rootAbs);
    const templateDirAbs = path.join(rootAbs, '_template');

    const meta = {
        rootAbsPath: rootAbs,
        rootRelPath: rootRel,
        exists: fs.existsSync(rootAbs),
        template: {
            dirRelPath: fs.existsSync(templateDirAbs) ? path.relative(WORKSPACE_ROOT, templateDirAbs) : null,
            finalRelPath: fs.existsSync(path.join(templateDirAbs, 'FINAL.md')) ? path.relative(WORKSPACE_ROOT, path.join(templateDirAbs, 'FINAL.md')) : null,
            stateRelPath: fs.existsSync(path.join(templateDirAbs, 'STATE.md')) ? path.relative(WORKSPACE_ROOT, path.join(templateDirAbs, 'STATE.md')) : null
        }
    };

    if (!meta.exists) {
        return { ...meta, pages: [], counts: { total: 0, ready: 0, uploaded: 0, blocked: 0 } };
    }

    let entries = [];
    try {
        entries = fs.readdirSync(rootAbs, { withFileTypes: true });
    } catch {
        entries = [];
    }

    const pages = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '_template')
        .map((entry) => {
            const dirAbs = path.join(rootAbs, entry.name);
            const dirRel = path.relative(WORKSPACE_ROOT, dirAbs);
            const finalAbs = path.join(dirAbs, 'FINAL.md');
            const stateAbs = path.join(dirAbs, 'STATE.md');
            const assetsAbs = path.join(dirAbs, 'assets');

            const hasFinal = fs.existsSync(finalAbs);
            const hasState = fs.existsSync(stateAbs);
            const hasAssets = fs.existsSync(assetsAbs);

            const finalRaw = hasFinal ? readFileSafe(finalAbs) || '' : '';
            const stateRaw = hasState ? readFileSafe(stateAbs) || '' : '';
            const frontmatter = hasFinal ? parseSimpleFrontmatter(finalRaw) : { data: {}, body: '' };
            const stateData = hasState ? parseSimpleKeyValueFile(stateRaw) : {};

            const stateStatus = String(stateData.status || '').trim().toUpperCase() || 'MISSING';
            const uploadReady = frontmatter.data.upload_ready === true;
            const readyForUpload = hasFinal && hasState && stateStatus === 'READY_FOR_UPLOAD' && uploadReady === true;
            const uploaded = stateStatus === 'UPLOADED';

            const finalModifiedAt = hasFinal ? isoMtime(finalAbs) : null;
            const stateModifiedAt = hasState ? isoMtime(stateAbs) : null;
            const updatedAt = [finalModifiedAt, stateModifiedAt].filter(Boolean).sort().pop() || null;

            return {
                slug: String(frontmatter.data.slug || entry.name).trim() || entry.name,
                dirName: entry.name,
                dirRelPath: dirRel,
                finalRelPath: hasFinal ? path.relative(WORKSPACE_ROOT, finalAbs) : null,
                stateRelPath: hasState ? path.relative(WORKSPACE_ROOT, stateAbs) : null,
                assetsRelPath: hasAssets ? path.relative(WORKSPACE_ROOT, assetsAbs) : null,
                hasFinal,
                hasState,
                hasAssets,
                stateStatus,
                uploadReady,
                readyForUpload,
                uploaded,
                project: String(frontmatter.data.project || projectId || '').trim() || null,
                brand: String(frontmatter.data.brand || brand || '').trim() || null,
                contentType: String(frontmatter.data.content_type || '').trim() || null,
                route: String(frontmatter.data.route || '').trim() || null,
                title: String(frontmatter.data.title || '').trim() || null,
                description: String(frontmatter.data.description || '').trim() || null,
                lastUpdated: String(frontmatter.data.last_updated || '').trim() || null,
                uploadedAt: stateData.uploaded_at ? String(stateData.uploaded_at).trim() : null,
                uploadedBy: stateData.uploaded_by ? String(stateData.uploaded_by).trim() : null,
                notes: stateData.notes ? String(stateData.notes).trim() : null,
                hasPlaceholders: hasFinal ? detectCompactPagePlaceholders(finalRaw) : false,
                bodyWordCount: hasFinal ? countWords(frontmatter.body) : 0,
                finalModifiedAt,
                stateModifiedAt,
                updatedAt
            };
        })
        .sort((a, b) => {
            const timeA = Date.parse(a.updatedAt || '') || 0;
            const timeB = Date.parse(b.updatedAt || '') || 0;
            if (timeA !== timeB) return timeB - timeA;
            return String(a.slug || '').localeCompare(String(b.slug || ''));
        });

    const counts = {
        total: pages.length,
        ready: pages.filter((page) => page.readyForUpload).length,
        uploaded: pages.filter((page) => page.uploaded).length,
        blocked: pages.filter((page) => page.hasFinal && !page.readyForUpload && !page.uploaded).length
    };

    return { ...meta, pages, counts };
}

function hydrateCompactPages(projectData, projectId) {
    const compactPages = collectCompactPagesForProject(projectId);
    projectData.compactPages = compactPages.pages;
    projectData.compactPagesMeta = {
        rootRelPath: compactPages.rootRelPath,
        exists: compactPages.exists,
        counts: compactPages.counts,
        template: compactPages.template
    };
}

function findPipelineStepFileByConvention(folderRoot, rowIndex, stepId) {
    if (!folderRoot || !fs.existsSync(folderRoot)) return null;
    const normalizedStepId = normalizePipelineStepId(stepId);
    if (!normalizedStepId) return null;

    const tokens = (PIPELINE_STEP_DISCOVERY_TOKENS[normalizedStepId] || []).map(normalizeFileStem).filter(Boolean);
    if (tokens.length === 0) return null;

    const rowNo = String(Number(rowIndex) + 1);
    const rowNoPad = rowNo.padStart(2, '0');

    let entries = [];
    try {
        entries = fs.readdirSync(folderRoot, { withFileTypes: true });
    } catch {
        entries = [];
    }

    let best = null;
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = String(path.extname(entry.name || '')).toLowerCase();
        if (ext !== '.md' && ext !== '.txt') continue;

        const stem = normalizeFileStem(entry.name);
        if (!stem) continue;

        let tokenScore = -1;
        for (let idx = 0; idx < tokens.length; idx += 1) {
            const token = tokens[idx];
            if (!token) continue;
            const isExact = stem === token;
            const isBoundary =
                stem.startsWith(`${token}_`)
                || stem.endsWith(`_${token}`)
                || stem.includes(`_${token}_`);
            const isLoose = stem.includes(token);
            if (!isExact && !isBoundary && !isLoose) continue;

            const base = isExact ? 65 : (isBoundary ? 55 : 30);
            const priority = Math.max(0, (tokens.length - idx) * 2);
            tokenScore = Math.max(tokenScore, base + priority);
        }
        if (tokenScore < 0) continue;

        const hasRowPrefix =
            stem.startsWith(`${rowNoPad}_`)
            || stem.startsWith(`${rowNo}_`)
            || stem.startsWith(`tag_${rowNoPad}_`)
            || stem.startsWith(`tag_${rowNo}_`);
        const hasRowInside =
            stem.includes(`_${rowNoPad}_`)
            || stem.includes(`_${rowNo}_`);

        let score = tokenScore + (hasRowPrefix ? 80 : (hasRowInside ? 24 : 0));
        if (normalizedStepId === 'multimedia_enrichment' && String(entry.name).toLowerCase() === '08_asset_plan.md') {
            score += 60;
        }

        const abs = path.join(folderRoot, entry.name);
        if (!isAllowedWorkspacePath(abs)) continue;
        let mtimeMs = 0;
        try {
            mtimeMs = Number(fs.statSync(abs).mtimeMs || 0);
        } catch {
            mtimeMs = 0;
        }

        if (!best || score > best.score || (score === best.score && mtimeMs >= best.mtimeMs)) {
            best = { absPath: abs, score, mtimeMs };
        }
    }

    return best ? best.absPath : null;
}

function ensurePipelineShape(projectData) {
    if (!projectData || typeof projectData !== 'object') return;
    const rows = Array.isArray(projectData.contentPipeline) ? projectData.contentPipeline : [];
    projectData.contentPipeline = rows.map((row, index) => {
        const current = (row && typeof row === 'object') ? row : {};
        const rawSteps = (current.steps && typeof current.steps === 'object') ? current.steps : {};
        const normalized = {};

        for (const [rawStep, rawValue] of Object.entries(rawSteps)) {
            const stepId = normalizePipelineStepId(rawStep);
            if (!stepId) continue;
            const value = (rawValue && typeof rawValue === 'object') ? rawValue : { status: String(rawValue || '') };
            normalized[stepId] = { ...(normalized[stepId] || {}), ...value };
        }

        for (const stepId of PIPELINE_STEP_IDS) {
            const step = { ...(normalized[stepId] || {}) };
            if (typeof step.status !== 'string' || !step.status.trim()) step.status = 'pending';
            step.status = String(step.status).trim().toLowerCase();
            step.doc = (typeof step.doc === 'string' && step.doc.trim()) ? step.doc.trim() : null;
            normalized[stepId] = step;
        }

        return {
            ...current,
            id: String(current.id || pipelineRowId(index)),
            steps: normalized
        };
    });
}

function resolvePathFromAnyInput(targetPath) {
    const raw = String(targetPath || '').trim();
    if (!raw) return null;

    const candidates = [];
    if (path.isAbsolute(raw)) {
        candidates.push(path.resolve(raw));
    } else {
        candidates.push(path.resolve(WORKSPACE_ROOT, raw));
        candidates.push(path.resolve(raw));
    }

    for (const abs of candidates) {
        if (!isAllowedWorkspacePath(abs)) continue;
        if (!fs.existsSync(abs)) continue;
        return { absPath: abs, relPath: path.relative(WORKSPACE_ROOT, abs), exists: true };
    }

    const fallback = candidates.find(abs => isAllowedWorkspacePath(abs));
    if (!fallback) return null;
    return { absPath: fallback, relPath: path.relative(WORKSPACE_ROOT, fallback), exists: false };
}

function findFileByNameRecursive(rootDir, fileName, limit = 5000) {
    if (!fileName || !fs.existsSync(rootDir)) return null;
    const queue = [rootDir];
    let seen = 0;

    while (queue.length > 0 && seen < limit) {
        const dir = queue.shift();
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            seen += 1;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                queue.push(full);
                continue;
            }
            if (entry.isFile() && entry.name.toLowerCase() === String(fileName).toLowerCase()) {
                return full;
            }
            if (seen >= limit) break;
        }
    }
    return null;
}

function findNewestFileByPredicateRecursive(rootDir, predicate, limit = 5000) {
    if (!rootDir || !fs.existsSync(rootDir) || typeof predicate !== 'function') return null;
    const queue = [rootDir];
    let seen = 0;
    let newestPath = null;
    let newestMtime = 0;

    while (queue.length > 0 && seen < limit) {
        const dir = queue.shift();
        let entries = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            seen += 1;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                queue.push(full);
                continue;
            }
            if (!entry.isFile()) continue;

            let matches = false;
            try {
                matches = !!predicate(full, entry.name);
            } catch {
                matches = false;
            }
            if (!matches) {
                if (seen >= limit) break;
                continue;
            }

            let mtimeMs = 0;
            try {
                mtimeMs = Number(fs.statSync(full).mtimeMs || 0);
            } catch {
                mtimeMs = 0;
            }
            if (!newestPath || mtimeMs >= newestMtime) {
                newestPath = full;
                newestMtime = mtimeMs;
            }
            if (seen >= limit) break;
        }
    }

    return newestPath;
}

function resolvePipelineDocPath(projectData, cpIndex, stepId) {
    if (!projectData || !Array.isArray(projectData.contentPipeline)) return null;
    const rowIndex = Number(cpIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= projectData.contentPipeline.length) return null;
    const normalizedStepId = normalizePipelineStepId(stepId);
    if (!normalizedStepId) return null;

    const row = projectData.contentPipeline[rowIndex];
    const step = row?.steps?.[normalizedStepId];
    const rawDoc = (typeof step?.doc === 'string' && step.doc.trim()) ? step.doc.trim() : null;

    const candidates = [];
    if (rawDoc) {
        if (path.isAbsolute(rawDoc)) {
            candidates.push(path.resolve(rawDoc));
        } else {
            candidates.push(path.resolve(WORKSPACE_ROOT, rawDoc));
        }
    }

    const docBase = rawDoc ? path.basename(rawDoc) : null;
    const docBaseNoExt = rawDoc ? path.basename(rawDoc, path.extname(rawDoc)) : null;
    const rowFolder = getPipelineRowFolder(row, rowIndex);
    const folderRoot = path.join(WORKSPACE_ROOT, 'projects', 'blog-artifacts', rowFolder);

    if (rawDoc && !rawDoc.includes('/')) {
        candidates.push(path.join(folderRoot, rawDoc));
        if (!path.extname(rawDoc)) {
            candidates.push(path.join(folderRoot, `${rawDoc}.md`));
            candidates.push(path.join(folderRoot, `${rawDoc}.txt`));
        }
        if (docBaseNoExt) {
            candidates.push(path.join(folderRoot, `${docBaseNoExt}.md`));
            candidates.push(path.join(folderRoot, `${docBaseNoExt}.txt`));
        }
    }

    const stepFallbacks = PIPELINE_STEP_DOC_FALLBACKS[normalizedStepId] || [];
    for (const fallbackName of stepFallbacks) {
        candidates.push(path.join(folderRoot, fallbackName));
    }

    for (const abs of candidates) {
        const resolved = path.resolve(abs);
        if (!isAllowedWorkspacePath(resolved)) continue;
        if (!fs.existsSync(resolved)) continue;
        return { absPath: resolved, relPath: path.relative(WORKSPACE_ROOT, resolved) };
    }

    const byConvention = findPipelineStepFileByConvention(folderRoot, rowIndex, normalizedStepId);
    if (byConvention && isAllowedWorkspacePath(byConvention)) {
        return { absPath: byConvention, relPath: path.relative(WORKSPACE_ROOT, byConvention) };
    }

    if (docBase) {
        const byName = findFileByNameRecursive(path.join(WORKSPACE_ROOT, 'projects', 'blog-artifacts'), docBase);
        if (byName && isAllowedWorkspacePath(byName)) {
            return { absPath: byName, relPath: path.relative(WORKSPACE_ROOT, byName) };
        }
    }

    return null;
}

function readWordCountFromFile(absPath) {
    try {
        const text = fs.readFileSync(absPath, 'utf8');
        return text.trim() ? text.trim().split(/\s+/).length : 0;
    } catch {
        return null;
    }
}

function hydratePipelineDocsAndWordCounts(projectData) {
    if (!projectData || !Array.isArray(projectData.contentPipeline)) return;
    for (let cpIndex = 0; cpIndex < projectData.contentPipeline.length; cpIndex += 1) {
        const cp = projectData.contentPipeline[cpIndex];
        for (const stepId of PIPELINE_STEP_IDS) {
            const step = cp?.steps?.[stepId];
            if (!step || typeof step !== 'object') continue;
            const resolved = resolvePipelineDocPath(projectData, cpIndex, stepId);
            if (!resolved) continue;
            step.doc = resolved.relPath;
            const wordCount = readWordCountFromFile(resolved.absPath);
            if (wordCount != null) step.wordCount = wordCount;
        }
    }
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectNotebookLmAudioFiles(projectId, limit = 8000) {
    const projectDir = path.join(WORKSPACE_ROOT, 'media', 'notebooklm-audio', String(projectId || '').trim());
    const globalDir = path.join(WORKSPACE_ROOT, 'media', 'notebooklm-audio');
    const roots = [projectDir, globalDir];

    const files = [];
    const seen = new Set();
    for (const root of roots) {
        if (!root || !fs.existsSync(root)) continue;
        const queue = [root];
        let visited = 0;
        while (queue.length > 0 && visited < limit) {
            const dir = queue.shift();
            let entries = [];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const entry of entries) {
                visited += 1;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    queue.push(full);
                    continue;
                }
                if (!entry.isFile()) continue;
                if (seen.has(full)) continue;
                seen.add(full);

                const lower = String(entry.name || '').toLowerCase();
                if (!lower.endsWith('.mp3') && !lower.endsWith('.wav') && !lower.endsWith('.m4a')) continue;
                if (!lower.includes('notebooklm')) continue;
                if (!isAllowedWorkspacePath(full)) continue;

                let stat = null;
                try {
                    stat = fs.statSync(full);
                } catch {
                    stat = null;
                }
                files.push({
                    absPath: full,
                    relPath: path.relative(WORKSPACE_ROOT, full),
                    fileName: entry.name,
                    lowerName: lower,
                    mtimeMs: Number(stat?.mtimeMs || 0),
                    generatedAt: stat?.mtime ? new Date(stat.mtime).toISOString() : null,
                    size: Number(stat?.size || 0)
                });
            }
        }
    }

    files.sort((a, b) => Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0));
    return files;
}

function resolveNotebookLmAudioForRow(projectId, row, rowIndex, audioFiles = null) {
    if (!row || typeof row !== 'object') return null;

    const rowId = String(row.id || pipelineRowId(rowIndex));
    const rowIdSlug = safeSlug(rowId, `tag-${String(Number(rowIndex) + 1).padStart(2, '0')}`).toLowerCase();
    const rowIdCompact = rowIdSlug.replace(/-/g, '');
    const topicToken = safeSlug(row.topicEn || row.topic || '', '').toLowerCase();

    const resolvedFromRow = [];
    const nlm = (row.notebooklm && typeof row.notebooklm === 'object') ? row.notebooklm : {};
    const candidateAbs = nlm.lastAudioAbsPath ? path.resolve(String(nlm.lastAudioAbsPath)) : null;
    const candidateRel = nlm.lastAudioRelPath ? path.resolve(WORKSPACE_ROOT, String(nlm.lastAudioRelPath)) : null;
    for (const abs of [candidateAbs, candidateRel]) {
        if (!abs) continue;
        if (!isAllowedWorkspacePath(abs)) continue;
        if (!fs.existsSync(abs)) continue;
        let stat = null;
        try {
            stat = fs.statSync(abs);
        } catch {
            stat = null;
        }
        resolvedFromRow.push({
            absPath: abs,
            relPath: path.relative(WORKSPACE_ROOT, abs),
            fileName: path.basename(abs),
            mtimeMs: Number(stat?.mtimeMs || 0),
            generatedAt: stat?.mtime ? new Date(stat.mtime).toISOString() : null,
            size: Number(stat?.size || 0),
            source: 'row'
        });
    }
    if (resolvedFromRow.length > 0) {
        resolvedFromRow.sort((a, b) => Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0));
        return resolvedFromRow[0];
    }

    const files = Array.isArray(audioFiles) ? audioFiles : collectNotebookLmAudioFiles(projectId);
    const boundaryTokenMatch = (name, token) => {
        if (!token) return false;
        const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}([^a-z0-9]|$)`, 'i');
        return re.test(String(name || ''));
    };

    const matches = files.filter((file) => {
        const name = file?.lowerName || '';
        if (!name) return false;
        if (boundaryTokenMatch(name, rowIdSlug)) return true;
        if (boundaryTokenMatch(name, rowIdCompact)) return true;
        if (topicToken && topicToken.length >= 10 && name.includes(topicToken.slice(0, 18))) return true;
        return false;
    });

    if (matches.length === 0) return null;
    matches.sort((a, b) => Number(b.mtimeMs || 0) - Number(a.mtimeMs || 0));
    return { ...matches[0], source: 'filesystem' };
}

function hydrateNotebookLmAudioRows(projectData, projectId) {
    if (!projectData || !Array.isArray(projectData.contentPipeline)) return;
    const audioFiles = collectNotebookLmAudioFiles(projectId);
    for (let cpIndex = 0; cpIndex < projectData.contentPipeline.length; cpIndex += 1) {
        const row = projectData.contentPipeline[cpIndex];
        const resolved = resolveNotebookLmAudioForRow(projectId, row, cpIndex, audioFiles);
        if (!resolved) continue;
        row.notebooklm = {
            ...(row.notebooklm && typeof row.notebooklm === 'object' ? row.notebooklm : {}),
            lastAudioAbsPath: resolved.absPath,
            lastAudioRelPath: resolved.relPath,
            lastGeneratedAt: row?.notebooklm?.lastGeneratedAt || resolved.generatedAt || null
        };
    }
}

function findPipelineRowIndex(contentPipeline, selector = {}) {
    if (!Array.isArray(contentPipeline) || contentPipeline.length === 0) return -1;

    const directIndex = Number(selector.cpIndex);
    if (Number.isInteger(directIndex) && directIndex >= 0 && directIndex < contentPipeline.length) {
        return directIndex;
    }

    const wantedId = String(selector.rowId || selector.id || selector.tag || '').trim().toLowerCase();
    if (wantedId) {
        const wantedIdCompact = wantedId.replace(/[^a-z0-9]/g, '');
        const byId = contentPipeline.findIndex((row, idx) => {
            const rowIdRaw = String(row?.id || pipelineRowId(idx)).toLowerCase();
            if (rowIdRaw === wantedId) return true;
            const rowIdCompact = rowIdRaw.replace(/[^a-z0-9]/g, '');
            return rowIdCompact && rowIdCompact === wantedIdCompact;
        });
        if (byId >= 0) return byId;
    }

    const wantedDay = normalizeLooseText(selector.day);
    if (wantedDay) {
        const byDay = contentPipeline.findIndex(row => normalizeLooseText(row?.day) === wantedDay);
        if (byDay >= 0) return byDay;
    }

    const wantedKeyword = normalizeLooseText(selector.keyword);
    if (wantedKeyword) {
        const byKeyword = contentPipeline.findIndex(row => normalizeLooseText(row?.keyword) === wantedKeyword);
        if (byKeyword >= 0) return byKeyword;
    }

    const wantedTopic = normalizeLooseText(selector.topic || selector.title);
    if (wantedTopic) {
        const byExactTopic = contentPipeline.findIndex(row => {
            const options = [row?.topic, row?.topicEn].map(normalizeLooseText).filter(Boolean);
            return options.some(candidate => candidate === wantedTopic);
        });
        if (byExactTopic >= 0) return byExactTopic;

        const byContainsTopic = contentPipeline.findIndex(row => {
            const options = [row?.topic, row?.topicEn].map(normalizeLooseText).filter(Boolean);
            return options.some(candidate => candidate.includes(wantedTopic) || wantedTopic.includes(candidate));
        });
        if (byContainsTopic >= 0) return byContainsTopic;
    }

    return -1;
}

function parsePipelineTagToIndex(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const m = raw.match(/(\d{1,3})/);
    if (!m) return null;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 1) return null;
    return n - 1;
}

function buildPipelineArtifactName(cpIndex, stepId, ext, title) {
    const stepBase = PIPELINE_STEP_FILE_NAMES[stepId] || safeSlug(stepId, 'step');
    const rowNo = String(Number(cpIndex) + 1).padStart(2, '0');
    const topicSuffix = title ? safeSlug(title, '') : '';
    const stem = topicSuffix ? `${rowNo}_${stepBase}_${topicSuffix.slice(0, 48)}` : `${rowNo}_${stepBase}`;
    return `${stem}.${ext}`;
}

function updateBlogPipelineProgress(projectData, cpIndex) {
    if (!projectData || !Array.isArray(projectData.contentPipeline)) return;
    const row = projectData.contentPipeline[cpIndex];
    if (!row?.steps) return;

    // Keep progress semantics stable: core editorial flow remains the KPI.
    const stepEntries = PIPELINE_CORE_STEP_IDS.map(id => row.steps[id] || { status: 'pending' });
    const done = stepEntries.filter(s => String(s.status || '').toLowerCase() === 'done').length;
    const review = stepEntries.filter(s => String(s.status || '').toLowerCase() === 'review').length;
    const started = stepEntries.some(s => String(s.status || '').toLowerCase() !== 'pending');
    const total = PIPELINE_CORE_STEP_IDS.length;
    const progress = Math.max(0, Math.min(100, Math.round(((done + review * 0.5) / total) * 100)));
    const status = done === total ? 'done' : (started ? 'in_progress' : 'planned');

    const rowId = String(row.id || pipelineRowId(cpIndex));
    const list = Array.isArray(projectData.blogPipeline?.blogs) ? projectData.blogPipeline.blogs : [];
    const blog = list.find(item => String(item?.id || '').toLowerCase() === rowId.toLowerCase());
    if (blog) {
        blog.status = status;
        blog.progress = progress;
        blog.stepsCompleted = done;
        blog.stepsTotal = total;
    }

    if (projectData.blogPipeline && Array.isArray(projectData.blogPipeline.blogs)) {
        const all = projectData.blogPipeline.blogs;
        projectData.blogPipeline.totalBlogs = all.length;
        projectData.blogPipeline.completed = all.filter(b => b.status === 'done').length;
        projectData.blogPipeline.inProgress = all.filter(b => b.status === 'in_progress').length;
        projectData.blogPipeline.planned = all.filter(b => b.status === 'planned').length;
    }
}

function resolvePublishConfig(projectData, body = {}) {
    const projectPublish = (projectData && typeof projectData.publish === 'object') ? projectData.publish : {};
    const apiBase = String(
        body.apiBase ||
        projectPublish.apiBase ||
        process.env.TARENO_BLOG_API_BASE ||
        'https://tareno.co'
    ).trim().replace(/\/+$/, '');

    const endpoint = String(
        body.endpoint ||
        projectPublish.endpoint ||
        `${apiBase}/api/blog/publish`
    ).trim();

    const apiSecret = String(
        body.apiSecret ||
        projectPublish.apiSecret ||
        process.env.BLOG_API_SECRET ||
        process.env.TARENO_BLOG_API_SECRET ||
        process.env.TARENO_BLOG_API_KEY ||
        ''
    ).trim();

    const incomingMode = String(body.mode || projectPublish.mode || 'publish').trim().toLowerCase();
    const mode = incomingMode === 'draft' ? 'draft' : 'publish';

    return {
        apiBase,
        endpoint,
        apiSecret,
        mode
    };
}

function responseHasSlugConflict(statusCode, parsed, raw) {
    if (Number(statusCode) === 409) return true;
    const fragments = [];
    if (typeof raw === 'string') fragments.push(raw);
    if (parsed && typeof parsed === 'object') {
        for (const key of ['error', 'message', 'detail', 'reason']) {
            if (typeof parsed[key] === 'string') fragments.push(parsed[key]);
        }
        if (parsed.response && typeof parsed.response === 'object') {
            for (const key of ['error', 'message', 'detail', 'reason']) {
                if (typeof parsed.response[key] === 'string') fragments.push(parsed.response[key]);
            }
        }
    }
    const haystack = fragments.join(' ').toLowerCase();
    if (!haystack) return false;
    const hasSlug = haystack.includes('slug');
    const hasConflict = haystack.includes('exist')
        || haystack.includes('already')
        || haystack.includes('duplicate')
        || haystack.includes('conflict')
        || haystack.includes('bereits')
        || haystack.includes('konflikt');
    return hasSlug && hasConflict;
}

const BLOG_DIRECT_UPLOAD_THRESHOLD_BYTES = (() => {
    const mb = Number(process.env.BLOG_DIRECT_UPLOAD_THRESHOLD_MB || '4');
    if (!Number.isFinite(mb) || mb <= 0) return 4 * 1024 * 1024;
    return Math.max(1, Math.floor(mb)) * 1024 * 1024;
})();

function inferMimeType(fileName, fallback = 'application/octet-stream') {
    const ext = String(path.extname(String(fileName || '')).toLowerCase());
    const table = {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.md': 'text/markdown; charset=utf-8',
        '.txt': 'text/plain; charset=utf-8'
    };
    return table[ext] || fallback;
}

function formatBytesLabel(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function uploadFileDirectToBlogStorage(publishCfg, absPath, fileName, kind = 'audio') {
    const contentType = inferMimeType(fileName, kind === 'audio' ? 'audio/mpeg' : 'application/octet-stream');

    const signResp = await fetch(`${publishCfg.apiBase}/api/blog/upload/sign`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${publishCfg.apiSecret}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fileName: fileName || path.basename(absPath),
            contentType,
            kind
        })
    });

    const signRaw = await signResp.text();
    const signParsed = tryParseJson(signRaw);
    if (!signResp.ok) {
        throw new Error(`Direct upload sign failed (${signResp.status}): ${(signParsed && signParsed.error) || signRaw || signResp.statusText}`);
    }

    const signedUrl = signParsed?.signedUrl;
    const publicUrl = signParsed?.publicUrl;
    if (!signedUrl || !publicUrl) {
        throw new Error('Direct upload sign response missing signedUrl/publicUrl');
    }

    const binary = fs.readFileSync(absPath);
    const uploadResp = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: binary
    });
    if (!uploadResp.ok) {
        const uploadRaw = await uploadResp.text();
        throw new Error(`Direct upload failed (${uploadResp.status}): ${uploadRaw || uploadResp.statusText}`);
    }

    return {
        publicUrl,
        bytes: binary.length,
        contentType
    };
}

function renderTemplate(template, vars = {}) {
    const source = String(template || '');
    return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const value = vars[key];
        return value == null ? '' : String(value);
    });
}

function expandUserPath(rawPath) {
    const p = String(rawPath || '').trim();
    if (!p) return '';
    if (p === '~') return os.homedir();
    if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
    return p;
}

function normalizeNotebookLmLanguage(raw) {
    const value = String(raw || 'de').trim().toLowerCase();
    return /^[a-z]{2}(?:-[a-z]{2})?$/.test(value) ? value : 'de';
}

function normalizeNotebookLmAudioFormat(raw) {
    const value = String(raw || '').trim().toUpperCase();
    const aliases = {
        SUMMARY: 'BRIEF',
        SUMMARY_SHORT: 'BRIEF',
        DETAILED_ANALYSIS: 'DEEP_DIVE'
    };
    const mapped = aliases[value] || value || 'DEEP_DIVE';
    return NOTEBOOKLM_AUDIO_FORMATS.has(mapped) ? mapped : 'DEEP_DIVE';
}

function normalizeNotebookLmAudioLength(raw) {
    const value = String(raw || '').trim().toUpperCase() || 'DEFAULT';
    if (value === 'SHORT') return 'DEFAULT';
    return NOTEBOOKLM_AUDIO_LENGTHS.has(value) ? value : 'DEFAULT';
}

function normalizeNotebookLmConfig(raw = {}) {
    const input = (raw && typeof raw === 'object') ? raw : {};
    const waitTimeout = Number(input.waitTimeoutSec);
    return {
        storagePath: String(input.storagePath || '~/.notebooklm/storage_state.json').trim(),
        notebookTitleTemplate: String(input.notebookTitleTemplate || 'Tareno {{rowId}} - {{title}}').trim(),
        sourceTitleTemplate: String(input.sourceTitleTemplate || '{{rowId}} FINAL.md').trim(),
        instructionsTemplate: String(
            input.instructionsTemplate ||
            'Create a podcast-style audio overview in German with practical takeaways and a clear structure.'
        ).trim(),
        outputDir: String(input.outputDir || 'media/notebooklm-audio/{{projectId}}').trim(),
        fileNameTemplate: String(input.fileNameTemplate || '{{rowId}}-{{slugTitle}}-notebooklm.mp3').trim(),
        reuseNotebook: input.reuseNotebook !== false,
        newVersionOnGenerate: input.newVersionOnGenerate === true,
        language: normalizeNotebookLmLanguage(input.language),
        audioFormat: normalizeNotebookLmAudioFormat(input.audioFormat),
        audioLength: normalizeNotebookLmAudioLength(input.audioLength),
        waitTimeoutSec: Number.isFinite(waitTimeout) && waitTimeout > 0 ? Math.min(Math.max(waitTimeout, 60), 3600) : 900
    };
}

function pickJsonFromOutput(stdout = '') {
    const trimmed = String(stdout || '').trim();
    if (!trimmed) return null;
    const direct = tryParseJson(trimmed);
    if (direct) return direct;
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean).reverse();
    for (const line of lines) {
        const parsed = tryParseJson(line);
        if (parsed) return parsed;
    }
    return null;
}

function ok(res, payload) {
    return res.json({ success: true, data: payload, ...payload });
}

function loadOpenClawConfig() {
    const p = '/root/.openclaw-tareno/openclaw.json';
    const raw = readFileSafe(p);
    const data = tryParseJson(raw || '{}') || {};
    return { path: p, data };
}

function loadSkillPolicy() {
    const raw = readFileSafe(SKILL_POLICY_FILE);
    const data = tryParseJson(raw || '{}') || {};
    return {
        globalEnabled: data.globalEnabled !== false,
        skills: (data.skills && typeof data.skills === 'object') ? data.skills : {}
    };
}

function saveSkillPolicy(policy) {
    fs.mkdirSync(path.dirname(SKILL_POLICY_FILE), { recursive: true });
    fs.writeFileSync(SKILL_POLICY_FILE, JSON.stringify(policy, null, 2) + '\n', 'utf8');
}

app.get("/api/projects", async (_, res) => {
    const projectsDir = path.join(WORKSPACE_ROOT, "data", "projects");
    fs.mkdirSync(projectsDir, { recursive: true });

    // Wir unterstützen jetzt primär JSON Projekte für die volle Funktionalität
    const files = listFilesSafe(projectsDir).filter(f => f.endsWith(".json"));
    const projects = files.map(f => {
        const full = path.join(projectsDir, f);
        const content = readFileSafe(full) || "{}";
        const projectId = f.replace(/\.json$/, "");
        try {
            const data = JSON.parse(content);
            const result = {
                id: projectId,
                name: data.name || projectId,
                summary: data.summary || "",
                status: data.status || "planned",
                agents: data.agents || [],
                subagents: data.subagents || [],
                tasks: data.tasks || [],
                milestones: data.milestones || [],
                dataRefs: data.dataRefs || [],
                contentPipeline: data.contentPipeline || [],
            };

            ensurePipelineShape(result);
            hydratePipelineDocsAndWordCounts(result);
            hydrateNotebookLmAudioRows(result, projectId);
            hydrateCompactPages(result, projectId);

            return result;
        } catch (e) {
            return {
                id: projectId,
                name: projectId,
                summary: "Fehler beim Parsen der JSON",
                status: "error",
                agents: [], tasks: [], milestones: [], dataRefs: [], file: full
            };
        }
    });
    ok(res, { count: projects.length, projects, workspaceRoot: WORKSPACE_ROOT });
});

app.get("/api/projects/:projectId", (req, res) => {
    try {
        const { projectId } = req.params;
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });

        const project = {
            id: projectId,
            name: data.name || projectId,
            summary: data.summary || "",
            status: data.status || "planned",
            agents: data.agents || [],
            subagents: data.subagents || [],
            tasks: data.tasks || [],
            milestones: data.milestones || [],
            dataRefs: data.dataRefs || [],
            contentPipeline: data.contentPipeline || [],
            permissions: (data.permissions && typeof data.permissions === 'object') ? data.permissions : {},
            integrations: (data.integrations && typeof data.integrations === 'object') ? data.integrations : {},
            lastUpdate: data.lastUpdate || null
        };

        ensurePipelineShape(project);
        hydratePipelineDocsAndWordCounts(project);
        hydrateNotebookLmAudioRows(project, projectId);
        hydrateCompactPages(project, projectId);

        return ok(res, { project, workspaceRoot: WORKSPACE_ROOT });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get("/api/projects/:projectId/compact-pages", (req, res) => {
    try {
        const { projectId } = req.params;
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });

        const compactPages = collectCompactPagesForProject(projectId);
        return ok(res, {
            projectId,
            compactPages: compactPages.pages,
            meta: {
                rootRelPath: compactPages.rootRelPath,
                exists: compactPages.exists,
                counts: compactPages.counts,
                template: compactPages.template
            },
            workspaceRoot: WORKSPACE_ROOT
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Pipeline Status API
app.post("/api/projects/:projectId/pipeline/:cpIndex/:stepId", express.json({ limit: '50mb' }), async (req, res, next) => {
    const { projectId, cpIndex, stepId } = req.params;
    const { status, reason, actorAgentId } = req.body || {};

    // Let dedicated endpoints handle these action routes.
    if (stepId === 'accept-all' || stepId === 'publish-now' || stepId === 'notebooklm-audio') {
        return next();
    }

    const projectFile = path.join(WORKSPACE_ROOT, "data", "projects", `${projectId}.json`);
    if (!fs.existsSync(projectFile)) return res.status(404).json({ success: false, error: "Project not found" });

    try {
        const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        ensurePipelineShape(data);
        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }

        const rowIndex = Number(cpIndex);
        if (!Number.isInteger(rowIndex) || !data.contentPipeline || !data.contentPipeline[rowIndex]) {
            return res.status(404).json({ success: false, error: "Pipeline row not found" });
        }
        const normalizedStepId = normalizePipelineStepId(stepId);
        if (!normalizedStepId) {
            return res.status(400).json({ success: false, error: "Invalid stepId" });
        }
        const step = data.contentPipeline[rowIndex].steps[normalizedStepId];
        if (!step) {
            return res.status(404).json({ success: false, error: "Step not found" });
        }

        if (typeof status === 'string' && status.trim()) {
            step.status = status.trim().toLowerCase();
        }
        if (reason !== undefined) {
            step.rejectReason = reason;
        } else if (String(step.status || '').toLowerCase() !== 'rejected' && step.rejectReason != null) {
            delete step.rejectReason;
        }
        step.updatedAt = new Date().toISOString();
        if (actorAgentId) step.updatedBy = actorAgentId;

        updateBlogPipelineProgress(data, rowIndex);
        data.lastUpdate = new Date().toISOString().slice(0, 10);

        fs.writeFileSync(projectFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
        const sync = syncAllAssignedAgents(projectId, data);
        ok(res, { message: "Pipeline status updated successfully", rowIndex, stepId: normalizedStepId, sync });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get("/api/projects/:projectId/pipeline/:cpIndex/:stepId/doc", (req, res) => {
    try {
        const { projectId, cpIndex, stepId } = req.params;
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });

        ensurePipelineShape(data);
        const rowIndex = Number(cpIndex);
        if (!Number.isInteger(rowIndex) || !data.contentPipeline || !data.contentPipeline[rowIndex]) {
            return res.status(404).json({ success: false, error: "Pipeline row not found" });
        }

        const normalizedStepId = normalizePipelineStepId(stepId);
        if (!normalizedStepId) return res.status(400).json({ success: false, error: "Invalid stepId" });

        const resolved = resolvePipelineDocPath(data, rowIndex, normalizedStepId);
        if (!resolved) {
            const doc = data.contentPipeline[rowIndex]?.steps?.[normalizedStepId]?.doc || null;
            return res.status(404).json({ success: false, error: "Document not found", rowIndex, stepId: normalizedStepId, doc });
        }

        return ok(res, {
            projectId,
            rowIndex,
            rowId: data.contentPipeline[rowIndex].id,
            stepId: normalizedStepId,
            path: resolved.absPath,
            relPath: resolved.relPath
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/api/projects/:projectId/pipeline/upload", express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { projectId } = req.params;
        const body = req.body || {};
        const {
            actorAgentId,
            cpIndex,
            rowId,
            day,
            topic,
            title,
            keyword,
            stepId,
            status,
            reason,
            language,
            content,
            docPath,
            fileName,
            format
        } = body;

        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });

        ensurePipelineShape(data);
        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }

        const normalizedStepId = normalizePipelineStepId(stepId);
        if (!normalizedStepId) return res.status(400).json({ success: false, error: "Valid stepId required" });

        const rowIndex = findPipelineRowIndex(data.contentPipeline, { cpIndex, rowId, day, topic, title, keyword, id: body.id, tag: body.tag });
        if (rowIndex < 0) {
            return res.status(404).json({ success: false, error: "Pipeline row not found (use cpIndex, rowId/TAG-xx, day, topic, or keyword)" });
        }

        const row = data.contentPipeline[rowIndex];
        const step = row.steps[normalizedStepId];
        let resolvedAbs = null;
        let resolvedRel = null;
        let wroteFile = false;

        if (typeof docPath === 'string' && docPath.trim()) {
            const resolved = resolvePathFromAnyInput(docPath.trim());
            if (!resolved || !resolved.exists) {
                return res.status(400).json({ success: false, error: "docPath does not exist or is outside allowed workspaces" });
            }
            resolvedAbs = resolved.absPath;
            resolvedRel = resolved.relPath;
        }

        if (typeof content === 'string' && content.trim()) {
            const extRaw = String(format || path.extname(String(fileName || '')).replace('.', '') || 'md').toLowerCase();
            const ext = extRaw === 'txt' ? 'txt' : 'md';
            const outDir = path.join(WORKSPACE_ROOT, 'projects', 'blog-artifacts', getPipelineRowFolder(row, rowIndex));
            fs.mkdirSync(outDir, { recursive: true });

            let outName;
            if (typeof fileName === 'string' && fileName.trim()) {
                const parsed = path.parse(fileName.trim());
                outName = `${safeSlug(parsed.name || 'artifact', 'artifact')}.${ext}`;
            } else {
                outName = buildPipelineArtifactName(rowIndex, normalizedStepId, ext, title || row.topicEn || row.topic || '');
            }

            const outAbs = path.join(outDir, outName);
            const payload = content.endsWith('\n') ? content : `${content}\n`;
            fs.writeFileSync(outAbs, payload, 'utf8');
            resolvedAbs = outAbs;
            resolvedRel = path.relative(WORKSPACE_ROOT, outAbs);
            wroteFile = true;
        }

        if (!resolvedRel) {
            return res.status(400).json({ success: false, error: "Either content or docPath is required" });
        }

        step.doc = resolvedRel;
        step.status = (typeof status === 'string' && status.trim()) ? status.trim().toLowerCase() : 'review';
        if (reason !== undefined) {
            step.rejectReason = reason;
        } else if (step.status !== 'rejected' && step.rejectReason != null) {
            delete step.rejectReason;
        }
        step.updatedAt = new Date().toISOString();
        if (actorAgentId) step.updatedBy = actorAgentId;
        if (typeof language === 'string' && language.trim()) step.language = language.trim().toLowerCase();

        if (resolvedAbs) {
            try {
                const text = fs.readFileSync(resolvedAbs, 'utf8');
                step.wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
            } catch {
                // keep existing count when file cannot be read
            }
        }

        const submittedTitle = String(title || topic || '').trim();
        if (submittedTitle) {
            if (String(language || '').toLowerCase().startsWith('en')) {
                row.topicEn = submittedTitle;
            } else {
                row.topic = submittedTitle;
            }
        }

        updateBlogPipelineProgress(data, rowIndex);
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);

        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, {
            uploaded: true,
            projectId,
            rowIndex,
            rowId: row.id,
            stepId: normalizedStepId,
            status: step.status,
            path: resolvedRel,
            wroteFile,
            sync
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/api/projects/:projectId/pipeline/sync-artifacts", express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { projectId } = req.params;
        const body = req.body || {};
        const actorAgentId = body.actorAgentId;

        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });
        ensurePipelineShape(data);

        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }

        const selectedStepIds = Array.isArray(body.steps)
            ? body.steps.map(normalizePipelineStepId).filter(Boolean)
            : PIPELINE_STEP_IDS.slice();
        if (selectedStepIds.length === 0) {
            return res.status(400).json({ success: false, error: "No valid step ids provided in steps[]" });
        }

        const selectorProvided = ['cpIndex', 'rowId', 'day', 'topic', 'title', 'keyword', 'id', 'tag']
            .some((key) => body[key] !== undefined && String(body[key]).trim() !== '');
        const rowIndexes = [];

        if (Array.isArray(body.rowIds) && body.rowIds.length > 0) {
            for (const candidate of body.rowIds) {
                const idx = findPipelineRowIndex(data.contentPipeline, { rowId: candidate });
                if (idx >= 0 && !rowIndexes.includes(idx)) rowIndexes.push(idx);
            }
        } else if (selectorProvided) {
            const idx = findPipelineRowIndex(data.contentPipeline, {
                cpIndex: body.cpIndex,
                rowId: body.rowId,
                day: body.day,
                topic: body.topic,
                title: body.title,
                keyword: body.keyword,
                id: body.id,
                tag: body.tag
            });
            if (idx < 0) {
                return res.status(404).json({ success: false, error: "Pipeline row not found (use cpIndex, rowId/TAG-xx, day, topic, or keyword)" });
            }
            rowIndexes.push(idx);
        } else {
            let fromIndex = Number.isInteger(Number(body.fromCpIndex)) ? Number(body.fromCpIndex) : null;
            let toIndex = Number.isInteger(Number(body.toCpIndex)) ? Number(body.toCpIndex) : null;

            const fromTagIndex = parsePipelineTagToIndex(body.fromTag ?? body.tagFrom ?? body.startTag);
            const toTagIndex = parsePipelineTagToIndex(body.toTag ?? body.tagTo ?? body.endTag);
            if (fromIndex == null && fromTagIndex != null) fromIndex = fromTagIndex;
            if (toIndex == null && toTagIndex != null) toIndex = toTagIndex;

            if (fromIndex == null) fromIndex = 0;
            if (toIndex == null) toIndex = data.contentPipeline.length - 1;
            if (fromIndex > toIndex) {
                const tmp = fromIndex;
                fromIndex = toIndex;
                toIndex = tmp;
            }

            fromIndex = Math.max(0, Math.min(data.contentPipeline.length - 1, fromIndex));
            toIndex = Math.max(0, Math.min(data.contentPipeline.length - 1, toIndex));
            for (let i = fromIndex; i <= toIndex; i += 1) {
                rowIndexes.push(i);
            }
        }

        if (rowIndexes.length === 0) {
            return res.status(404).json({ success: false, error: "No pipeline rows selected for sync" });
        }

        const statusRaw = String(body.statusOnFound ?? body.status ?? 'review').trim().toLowerCase();
        const statusOnFound = statusRaw === 'keep' ? null : (statusRaw || 'review');
        const onlyIfMissingDoc = body.onlyIfMissingDoc === true;
        const nowIso = new Date().toISOString();

        const rows = [];
        let totalStepsUpdated = 0;
        for (const rowIndex of rowIndexes) {
            const row = data.contentPipeline[rowIndex];
            if (!row || !row.steps) continue;

            let rowUpdated = 0;
            const steps = {};
            for (const stepId of selectedStepIds) {
                const step = row.steps[stepId];
                if (!step || typeof step !== 'object') continue;

                if (onlyIfMissingDoc && step.doc) {
                    steps[stepId] = {
                        found: true,
                        path: step.doc,
                        skipped: true,
                        reason: 'doc_already_set',
                        wordCount: step.wordCount ?? null,
                        status: step.status
                    };
                    continue;
                }

                const resolved = resolvePipelineDocPath(data, rowIndex, stepId);
                if (!resolved) {
                    steps[stepId] = { found: false };
                    continue;
                }

                step.doc = resolved.relPath;
                const wordCount = readWordCountFromFile(resolved.absPath);
                if (wordCount != null) step.wordCount = wordCount;
                if (statusOnFound) step.status = statusOnFound;
                if (step.status !== 'rejected' && step.rejectReason != null) delete step.rejectReason;
                step.updatedAt = nowIso;
                if (actorAgentId) step.updatedBy = actorAgentId;

                rowUpdated += 1;
                totalStepsUpdated += 1;
                steps[stepId] = {
                    found: true,
                    path: resolved.relPath,
                    wordCount: step.wordCount ?? null,
                    status: step.status
                };
            }

            updateBlogPipelineProgress(data, rowIndex);
            rows.push({
                rowIndex,
                rowId: String(row.id || pipelineRowId(rowIndex)),
                updatedSteps: rowUpdated,
                steps
            });
        }

        if (totalStepsUpdated > 0) {
            data.lastUpdate = new Date().toISOString().slice(0, 10);
            saveProjectMeta(projectId, data);
        }

        const sync = totalStepsUpdated > 0 ? syncAllAssignedAgents(projectId, data) : [];
        return ok(res, {
            synced: true,
            projectId,
            rowsProcessed: rowIndexes.length,
            rowsUpdated: rows.filter(r => Number(r.updatedSteps || 0) > 0).length,
            stepsUpdated: totalStepsUpdated,
            statusOnFound: statusOnFound || 'keep',
            onlyIfMissingDoc,
            rows,
            sync
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/api/projects/:projectId/pipeline/:cpIndex/accept-all", express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { projectId, cpIndex } = req.params;
        const { actorAgentId } = req.body || {};
        const rowIndex = Number(cpIndex);

        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });
        ensurePipelineShape(data);

        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= data.contentPipeline.length) {
            return res.status(404).json({ success: false, error: "Pipeline row not found" });
        }

        const missingDocs = [];
        for (const stepId of PIPELINE_CORE_STEP_IDS) {
            const resolved = resolvePipelineDocPath(data, rowIndex, stepId);
            if (!resolved) missingDocs.push(stepId);
        }
        if (missingDocs.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Cannot accept all: one or more step documents are missing",
                missingSteps: missingDocs
            });
        }

        const row = data.contentPipeline[rowIndex];
        for (const stepId of PIPELINE_CORE_STEP_IDS) {
            row.steps[stepId].status = 'done';
            delete row.steps[stepId].rejectReason;
            row.steps[stepId].updatedAt = new Date().toISOString();
            if (actorAgentId) row.steps[stepId].updatedBy = actorAgentId;
        }

        updateBlogPipelineProgress(data, rowIndex);
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);

        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, {
            acceptedAll: true,
            projectId,
            rowIndex,
            rowId: row.id,
            sync
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/api/projects/:projectId/pipeline/:cpIndex/publish-now", express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { projectId, cpIndex } = req.params;
        const body = req.body || {};
        const rowIndex = Number(cpIndex);
        const actorAgentId = body.actorAgentId;

        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });
        ensurePipelineShape(data);

        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= data.contentPipeline.length) {
            return res.status(404).json({ success: false, error: "Pipeline row not found" });
        }

        const row = data.contentPipeline[rowIndex];

        const publishCfg = resolvePublishConfig(data, body);
        if (!publishCfg.apiSecret) {
            return res.status(400).json({
                success: false,
                error: "Missing BLOG_API_SECRET (set project.publish.apiSecret or BLOG_API_SECRET env)"
            });
        }

        let publishUrl;
        try {
            publishUrl = new URL(publishCfg.endpoint);
        } catch {
            return res.status(400).json({ success: false, error: "Invalid publish endpoint URL" });
        }

        const rowId = String(row.id || pipelineRowId(rowIndex));
        const title = String(body.title || row.topicEn || row.topic || rowId).trim();
        const slug = safeSlug(body.slug || title || rowId, rowId.toLowerCase());
        const authorName = String(body.authorName || String(row.author || '').split('(')[0].trim() || 'Tareno Editorial').trim();
        const previewHours = Number.isFinite(Number(body.previewHours)) ? Math.max(1, Number(body.previewHours)) : 72;
        const fileName = `${slug}.md`;
        const rowFolder = getPipelineRowFolder(row, rowIndex);
        const rowFolderAbs = path.join(WORKSPACE_ROOT, 'projects', 'blog-artifacts', rowFolder);
        const rowIdSlug = safeSlug(rowId, `tag-${String(rowIndex + 1).padStart(2, '0')}`).toLowerCase();
        const slugToken = safeSlug(slug, rowIdSlug).toLowerCase();
        const notebookLmAudioDir = path.join(WORKSPACE_ROOT, 'media', 'notebooklm-audio', projectId);
        const notebookLmAudioRoot = path.join(WORKSPACE_ROOT, 'media', 'notebooklm-audio');
        const audioCandidates = [
            row?.notebooklm?.lastAudioAbsPath ? path.resolve(row.notebooklm.lastAudioAbsPath) : null,
            row?.notebooklm?.lastAudioRelPath ? path.resolve(WORKSPACE_ROOT, row.notebooklm.lastAudioRelPath) : null,
            path.join(rowFolderAbs, 'blog-audio.mp3'),
            path.join(notebookLmAudioDir, `${rowIdSlug}-${slugToken}-notebooklm.mp3`)
        ].filter(Boolean);
        const foundAudioBySearch = findFileByNameRecursive(rowFolderAbs, 'blog-audio.mp3', 2000);
        if (foundAudioBySearch) audioCandidates.push(foundAudioBySearch);
        const foundNotebookLmByPrefix = findNewestFileByPredicateRecursive(
            notebookLmAudioDir,
            (_, fileName) => {
                const lower = String(fileName || '').toLowerCase();
                if (!lower.endsWith('.mp3')) return false;
                if (!lower.includes('notebooklm')) return false;
                return lower.includes(`${rowIdSlug}-`) || lower.includes(`-${rowIdSlug}-`) || lower.includes(slugToken);
            },
            5000
        );
        if (foundNotebookLmByPrefix) audioCandidates.push(foundNotebookLmByPrefix);
        const foundNotebookLmGlobal = findNewestFileByPredicateRecursive(
            notebookLmAudioRoot,
            (_, fileName) => {
                const lower = String(fileName || '').toLowerCase();
                if (!lower.endsWith('.mp3')) return false;
                if (!lower.includes('notebooklm')) return false;
                return lower.includes(`${rowIdSlug}-`) || lower.includes(`-${rowIdSlug}-`) || lower.includes(slugToken);
            },
            8000
        );
        if (foundNotebookLmGlobal) audioCandidates.push(foundNotebookLmGlobal);

        let blogAudio = null;
        for (const candidate of [...new Set(audioCandidates)]) {
            const abs = path.resolve(candidate);
            if (!isAllowedWorkspacePath(abs)) continue;
            if (!fs.existsSync(abs)) continue;
            blogAudio = {
                absPath: abs,
                relPath: path.relative(WORKSPACE_ROOT, abs),
                fileName: path.basename(abs)
            };
            break;
        }

        const audioOnlyPatchRequested = body.audioOnly === true || body.uploadAudioOnly === true;
        if (audioOnlyPatchRequested) {
            if (!blogAudio) {
                return res.status(400).json({ success: false, error: "Audio-only patch requested but no audio file found (NotebookLM or blog-audio.mp3)." });
            }
            const patchEndpointRaw = String(
                body.audioPatchEndpoint || `${publishCfg.apiBase}/api/blog/admin/posts/${encodeURIComponent(slug)}`
            ).trim();
            let patchUrl;
            try {
                patchUrl = new URL(patchEndpointRaw);
            } catch {
                return res.status(400).json({ success: false, error: "Invalid audio patch endpoint URL" });
            }

            const patchForm = new FormData();
            const audioStats = fs.statSync(blogAudio.absPath);
            const uploadedAudio = await uploadFileDirectToBlogStorage(
                publishCfg,
                blogAudio.absPath,
                blogAudio.fileName || 'blog-audio.mp3',
                'audio'
            );
            console.log('[publish-now] audio-only direct upload', {
                file: blogAudio.relPath,
                sizeBytes: audioStats.size,
                sizeLabel: formatBytesLabel(audioStats.size),
                publicUrl: uploadedAudio.publicUrl
            });
            patchForm.append('audioUrl', uploadedAudio.publicUrl);
            patchForm.append('audioPath', blogAudio.relPath);

            const patchResp = await fetch(patchUrl.toString(), {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${publishCfg.apiSecret}`
                },
                body: patchForm
            });
            const patchRaw = await patchResp.text();
            const patchParsed = tryParseJson(patchRaw);
            if (!patchResp.ok) {
                return res.status(502).json({
                    success: false,
                    error: "Audio patch endpoint rejected request",
                    status: patchResp.status,
                    response: patchParsed || patchRaw
                });
            }

            row.publishedAt = new Date().toISOString();
            row.publishStatus = 'draft';
            row.publishResult = patchParsed || patchRaw;
            row.publishMeta = {
                mode: 'draft',
                operation: 'audio_patch',
                endpoint: patchUrl.toString(),
                authorName,
                slug,
                blogAudio: blogAudio.relPath
            };
            updateBlogPipelineProgress(data, rowIndex);
            data.lastUpdate = new Date().toISOString().slice(0, 10);
            saveProjectMeta(projectId, data);

            const sync = syncAllAssignedAgents(projectId, data);
            return ok(res, {
                audioPatched: true,
                projectId,
                rowIndex,
                rowId,
                endpoint: patchUrl.toString(),
                response: patchParsed || patchRaw,
                sentFiles: {
                    blogAudio: blogAudio.relPath
                },
                sync
            });
        }

        const finalDoc = resolvePipelineDocPath(data, rowIndex, 'final');
        if (!finalDoc) {
            return res.status(400).json({ success: false, error: "FINAL.md not found for this pipeline row" });
        }
        const multimediaDoc = resolvePipelineDocPath(data, rowIndex, 'multimedia_enrichment');
        if (!multimediaDoc) {
            return res.status(400).json({ success: false, error: "08_asset_plan.md (multimedia_enrichment) not found for this pipeline row" });
        }

        const markdown = readFileSafe(finalDoc.absPath);
        if (!markdown || !markdown.trim()) {
            return res.status(400).json({ success: false, error: "FINAL.md is empty" });
        }
        const assetPlanMarkdown = readFileSafe(multimediaDoc.absPath);
        if (!assetPlanMarkdown || !assetPlanMarkdown.trim()) {
            return res.status(400).json({ success: false, error: "08_asset_plan.md is empty" });
        }

        let attachedAudioUrl = null;
        let attachedBlogAudio = null;
        let audioTransferMode = 'none';
        let audioUploadWarning = null;
        if (blogAudio) {
            const audioStats = fs.statSync(blogAudio.absPath);
            try {
                const uploadedAudio = await uploadFileDirectToBlogStorage(
                    publishCfg,
                    blogAudio.absPath,
                    blogAudio.fileName || 'blog-audio.mp3',
                    'audio'
                );
                console.log('[publish-now] direct audio upload', {
                    file: blogAudio.relPath,
                    sizeBytes: audioStats.size,
                    sizeLabel: formatBytesLabel(audioStats.size),
                    publicUrl: uploadedAudio.publicUrl
                });
                attachedAudioUrl = uploadedAudio.publicUrl;
                attachedBlogAudio = blogAudio.relPath;
                audioTransferMode = 'direct_url';
            } catch (uploadErr) {
                const uploadMsg = String(uploadErr?.message || uploadErr || 'direct upload failed');
                if (audioStats.size <= BLOG_DIRECT_UPLOAD_THRESHOLD_BYTES) {
                    attachedBlogAudio = blogAudio.relPath;
                    audioTransferMode = 'inline_file_fallback';
                    audioUploadWarning = `Direct audio upload failed, fell back to inline file: ${uploadMsg}`;
                    console.warn('[publish-now] direct audio upload failed, using inline file fallback', {
                        file: blogAudio.relPath,
                        sizeBytes: audioStats.size,
                        sizeLabel: formatBytesLabel(audioStats.size),
                        error: uploadMsg
                    });
                } else {
                    audioTransferMode = 'skipped_large_audio';
                    audioUploadWarning = `Audio upload skipped (${formatBytesLabel(audioStats.size)}): ${uploadMsg}`;
                    console.warn('[publish-now] direct audio upload failed, skipping large audio', {
                        file: blogAudio.relPath,
                        sizeBytes: audioStats.size,
                        sizeLabel: formatBytesLabel(audioStats.size),
                        error: uploadMsg
                    });
                }
            }
        }
        const contentFormat = String(body.contentFormat || 'markdown').trim().toLowerCase() || 'markdown';
        const scheduledFor = body.scheduledFor ? String(body.scheduledFor).trim() : null;
        const createPublishForm = () => {
            const out = new FormData();
            out.append('file', new Blob([markdown], { type: 'text/markdown; charset=utf-8' }), fileName);
            out.append('assetPlanFile', new Blob([assetPlanMarkdown], { type: 'text/markdown; charset=utf-8' }), path.basename(multimediaDoc.absPath) || '08_asset_plan.md');
            out.append('assetPlanContent', assetPlanMarkdown);
            out.append('assetPlanPath', multimediaDoc.relPath);

            if (attachedAudioUrl) {
                out.append('audioUrl', attachedAudioUrl);
                if (attachedBlogAudio) out.append('audioPath', attachedBlogAudio);
            } else if (audioTransferMode === 'inline_file_fallback' && blogAudio) {
                const audioBuffer = fs.readFileSync(blogAudio.absPath);
                out.append('audioFile', new Blob([audioBuffer], { type: 'audio/mpeg' }), blogAudio.fileName || 'blog-audio.mp3');
                out.append('audioPath', blogAudio.relPath);
            } else if (attachedBlogAudio) {
                out.append('audioPath', attachedBlogAudio);
            }

            out.append('title', title);
            out.append('slug', slug);
            out.append('mode', publishCfg.mode);
            out.append('authorName', authorName);
            out.append('contentFormat', contentFormat);
            if (scheduledFor) out.append('scheduledFor', scheduledFor);
            if (publishCfg.mode === 'draft') out.append('previewHours', String(previewHours));
            out.append('content', markdown);
            return out;
        };

        const upstream = await fetch(publishUrl.toString(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${publishCfg.apiSecret}`
            },
            body: createPublishForm()
        });

        const raw = await upstream.text();
        const parsed = tryParseJson(raw);
        let publishOperation = 'create';
        let publishEndpoint = publishUrl.toString();
        let publishResponse = parsed || raw;
        let publishStatusCode = upstream.status;
        if (!upstream.ok) {
            const shouldTryUpsert = body.upsert !== false && body.updateExisting !== false;
            const slugConflict = responseHasSlugConflict(upstream.status, parsed, raw);
            if (!shouldTryUpsert || !slugConflict) {
                return res.status(502).json({
                    success: false,
                    error: "Publish endpoint rejected request",
                    status: upstream.status,
                    response: parsed || raw
                });
            }

            const patchEndpointRaw = String(
                body.patchEndpoint || `${publishCfg.apiBase}/api/blog/admin/posts/${encodeURIComponent(slug)}`
            ).trim();
            let patchUrl;
            try {
                patchUrl = new URL(patchEndpointRaw);
            } catch {
                return res.status(400).json({ success: false, error: "Invalid patch endpoint URL for slug-conflict upsert fallback" });
            }

            const patchResp = await fetch(patchUrl.toString(), {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${publishCfg.apiSecret}`
                },
                body: createPublishForm()
            });
            const patchRaw = await patchResp.text();
            const patchParsed = tryParseJson(patchRaw);
            if (!patchResp.ok) {
                return res.status(502).json({
                    success: false,
                    error: "Publish create conflicted and patch update failed",
                    createStatus: upstream.status,
                    createResponse: parsed || raw,
                    patchStatus: patchResp.status,
                    patchResponse: patchParsed || patchRaw
                });
            }

            publishOperation = 'upsert_patch';
            publishEndpoint = patchUrl.toString();
            publishResponse = patchParsed || patchRaw;
            publishStatusCode = patchResp.status;
        }

        row.publishedAt = new Date().toISOString();
        row.publishStatus = publishCfg.mode === 'draft' ? 'draft' : 'published';
        row.publishResult = publishResponse;
        row.publishMeta = {
            mode: publishCfg.mode,
            operation: publishOperation,
            endpoint: publishEndpoint,
            authorName,
            previewHours: publishCfg.mode === 'draft' ? previewHours : null,
            scheduledFor,
            contentFormat,
            finalDoc: finalDoc.relPath,
            assetPlanDoc: multimediaDoc.relPath,
            blogAudio: attachedBlogAudio || null,
            audioTransferMode,
            audioUploadWarning,
            status: publishStatusCode
        };
        if (row.steps?.final) {
            row.steps.final.status = publishCfg.mode === 'publish' ? 'done' : row.steps.final.status;
            row.steps.final.updatedAt = new Date().toISOString();
            if (actorAgentId) row.steps.final.updatedBy = actorAgentId;
        }
        updateBlogPipelineProgress(data, rowIndex);
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);

        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, {
            published: true,
            projectId,
            rowIndex,
            rowId,
            operation: publishOperation,
            endpoint: publishEndpoint,
            response: publishResponse,
            sentFiles: {
                finalDoc: finalDoc.relPath,
                assetPlanDoc: multimediaDoc.relPath,
                blogAudio: attachedBlogAudio || null
            },
            warnings: audioUploadWarning ? [audioUploadWarning] : [],
            sync
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get("/api/projects/:projectId/notebooklm/config", (req, res) => {
    try {
        const { projectId } = req.params;
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });

        const cfg = normalizeNotebookLmConfig(data.integrations?.notebooklm || {});
        return ok(res, {
            projectId,
            config: cfg,
            bridgePath: NOTEBOOKLM_BRIDGE_PATH,
            bridgeAvailable: fs.existsSync(NOTEBOOKLM_BRIDGE_PATH)
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/api/projects/:projectId/notebooklm/config", express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { projectId } = req.params;
        const body = req.body || {};
        const actorAgentId = body.actorAgentId;

        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });
        ensurePipelineShape(data);

        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }

        const existing = normalizeNotebookLmConfig(data.integrations?.notebooklm || {});
        const incoming = normalizeNotebookLmConfig(body.config || body);
        const merged = normalizeNotebookLmConfig({ ...existing, ...incoming });

        data.integrations = (data.integrations && typeof data.integrations === 'object') ? data.integrations : {};
        data.integrations.notebooklm = merged;
        data.lastUpdate = new Date().toISOString().slice(0, 10);

        saveProjectMeta(projectId, data);
        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { projectId, config: merged, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Stream the last generated NotebookLM audio for a pipeline row
app.get("/api/projects/:projectId/pipeline/:cpIndex/notebooklm-audio/stream", (req, res) => {
    try {
        const { projectId, cpIndex } = req.params;
        const rowIndex = Number(cpIndex);
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ error: "Project not found" });
        ensurePipelineShape(data);

        const row = data.contentPipeline?.[rowIndex];
        if (!row) return res.status(404).json({ error: "Pipeline row not found" });
        const resolvedAudio = resolveNotebookLmAudioForRow(projectId, row, rowIndex);
        if (!resolvedAudio?.absPath) {
            return res.status(404).json({ error: "No audio available for this row. Generate it first via NotebookLM." });
        }
        const audioAbs = path.resolve(resolvedAudio.absPath);

        if (!fs.existsSync(audioAbs)) {
            return res.status(404).json({ error: `Audio file not found on disk: ${audioAbs}` });
        }
        if (!isAllowedWorkspacePath(audioAbs)) {
            return res.status(403).json({ error: "Path not allowed" });
        }

        const stat = fs.statSync(audioAbs);
        const range = req.headers.range;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Disposition', `inline; filename="${path.basename(audioAbs)}"`);

        if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
            const chunkSize = end - start + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', chunkSize);
            fs.createReadStream(audioAbs, { start, end }).pipe(res);
        } else {
            res.setHeader('Content-Length', stat.size);
            fs.createReadStream(audioAbs).pipe(res);
        }
    } catch (e) {
        console.error('[audio/stream]', e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/projects/:projectId/pipeline/:cpIndex/notebooklm-audio", express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { projectId, cpIndex } = req.params;
        const body = req.body || {};
        const actorAgentId = body.actorAgentId;
        const rowIndex = Number(cpIndex);

        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: "Project not found" });
        ensurePipelineShape(data);

        if (!hasProjectWritePermission(data, actorAgentId)) {
            return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        }
        if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= data.contentPipeline.length) {
            return res.status(404).json({ success: false, error: "Pipeline row not found" });
        }

        const row = data.contentPipeline[rowIndex];
        const rowId = String(row.id || pipelineRowId(rowIndex));
        const title = String(body.title || row.topicEn || row.topic || rowId).trim();
        const finalDoc = resolvePipelineDocPath(data, rowIndex, 'final');
        if (!finalDoc) {
            return res.status(400).json({ success: false, error: "FINAL.md not found for this pipeline row" });
        }

        const sourceContent = readFileSafe(finalDoc.absPath);
        if (!sourceContent || !sourceContent.trim()) {
            return res.status(400).json({ success: false, error: "FINAL.md is empty" });
        }

        const today = new Date().toISOString().slice(0, 10);
        const vars = {
            project: data.name || projectId,
            projectId,
            rowId,
            rowIndex: String(rowIndex),
            title,
            slugTitle: safeSlug(title || rowId, rowId.toLowerCase()),
            date: String(row.date || today),
            today
        };

        const existingCfg = normalizeNotebookLmConfig(data.integrations?.notebooklm || {});
        const incomingCfg = normalizeNotebookLmConfig(body.config || body);
        const cfg = normalizeNotebookLmConfig({ ...existingCfg, ...incomingCfg });
        const saveConfig = body.saveConfig !== false;
        const dryRun = body.dryRun === true;

        const notebookTitle = renderTemplate(body.notebookTitle || cfg.notebookTitleTemplate, vars).trim() || `${vars.project} ${rowId}`;
        const sourceTitle = renderTemplate(body.sourceTitle || cfg.sourceTitleTemplate, vars).trim() || `${rowId} FINAL.md`;
        const instructions = renderTemplate(body.instructions || cfg.instructionsTemplate, vars).trim();

        const outputDirTpl = renderTemplate(body.outputDir || cfg.outputDir, vars).trim() || `media/notebooklm-audio/${projectId}`;
        const outputDirRaw = expandUserPath(outputDirTpl);
        const outputDirAbs = path.isAbsolute(outputDirRaw) ? path.resolve(outputDirRaw) : path.resolve(WORKSPACE_ROOT, outputDirRaw);
        if (!isAllowedWorkspacePath(outputDirAbs)) {
            return res.status(400).json({ success: false, error: "outputDir must be inside an allowed workspace" });
        }

        const fileNameTpl = renderTemplate(body.fileName || cfg.fileNameTemplate, vars).trim() || `${rowId}-${vars.slugTitle}-notebooklm.mp3`;
        const parsedName = path.parse(fileNameTpl);
        const stem = safeSlug(parsedName.name || `${rowId}-${vars.slugTitle}-notebooklm`, `${rowId.toLowerCase()}-notebooklm`);
        const extRaw = String(parsedName.ext || '.mp3').toLowerCase();
        const ext = ['.mp3', '.wav', '.m4a'].includes(extRaw) ? extRaw : '.mp3';
        const createNewVersion = body.createNewVersion === true || cfg.newVersionOnGenerate === true;
        const versionTag = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
        const outputStem = createNewVersion ? `${stem}-${versionTag}` : stem;
        const outputFileName = `${outputStem}${ext}`;
        const outputAbsPath = path.join(outputDirAbs, outputFileName);
        const outputRelPath = path.relative(WORKSPACE_ROOT, outputAbsPath);

        const storagePathRaw = String(body.storagePath || cfg.storagePath || '').trim();
        const payload = {
            projectId,
            projectName: data.name || projectId,
            rowId,
            rowIndex,
            finalDocPath: finalDoc.absPath,
            notebookTitle,
            sourceTitle,
            sourceContent,
            instructions,
            outputPath: outputAbsPath,
            storagePath: storagePathRaw,
            reuseNotebook: cfg.reuseNotebook !== false,
            language: normalizeNotebookLmLanguage(body.language || cfg.language),
            audioFormat: normalizeNotebookLmAudioFormat(body.audioFormat || cfg.audioFormat),
            audioLength: normalizeNotebookLmAudioLength(body.audioLength || cfg.audioLength),
            waitTimeoutSec: cfg.waitTimeoutSec
        };

        const jobDir = dryRun
            ? path.join(os.tmpdir(), 'notebooklm-jobs', projectId)
            : path.join(NOTEBOOKLM_JOB_DIR, projectId);
        fs.mkdirSync(jobDir, { recursive: true });
        fs.mkdirSync(path.dirname(outputAbsPath), { recursive: true });
        const jobId = `${Date.now()}-${safeSlug(rowId, `row-${rowIndex + 1}`)}`;
        const payloadPath = path.join(jobDir, `${jobId}.json`);
        fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
        const payloadPathForResponse = isAllowedWorkspacePath(payloadPath)
            ? path.relative(WORKSPACE_ROOT, payloadPath)
            : payloadPath;

        if (saveConfig) {
            data.integrations = (data.integrations && typeof data.integrations === 'object') ? data.integrations : {};
            data.integrations.notebooklm = cfg;
        }

        if (!dryRun && !fs.existsSync(NOTEBOOKLM_BRIDGE_PATH)) {
            return res.status(500).json({
                success: false,
                error: "NotebookLM bridge script is missing",
                bridgePath: NOTEBOOKLM_BRIDGE_PATH
            });
        }

        let bridgeOutput = null;
        const cmd = `${JSON.stringify(NOTEBOOKLM_PYTHON_BIN)} ${JSON.stringify(NOTEBOOKLM_BRIDGE_PATH)} ${JSON.stringify(payloadPath)}`;
        if (!dryRun) {
            const timeoutMs = (Number(cfg.waitTimeoutSec) * 1000) + (2 * 60 * 1000);
            const run = await runCmd(cmd, { timeoutMs, maxBuffer: 20 * 1024 * 1024 });
            const parsed = pickJsonFromOutput(run.stdout);
            if (!run.ok) {
                return res.status(502).json({
                    success: false,
                    error: parsed?.error || "NotebookLM bridge command failed",
                    command: cmd,
                    bridge: parsed || null,
                    stderr: run.stderr || run.error || null,
                    stdout: run.stdout || null
                });
            }
            if (!parsed || parsed.success === false) {
                return res.status(502).json({
                    success: false,
                    error: parsed?.error || "NotebookLM bridge returned invalid output",
                    command: cmd,
                    bridge: parsed || null,
                    stdout: run.stdout || null,
                    stderr: run.stderr || null
                });
            }
            bridgeOutput = parsed;

            row.notebooklm = {
                ...(row.notebooklm && typeof row.notebooklm === 'object' ? row.notebooklm : {}),
                lastJobId: jobId,
                lastGeneratedAt: new Date().toISOString(),
                lastAudioRelPath: outputRelPath,
                lastAudioAbsPath: outputAbsPath,
                notebookTitle,
                notebookId: parsed.notebookId || null,
                artifactId: parsed.artifactId || null,
                taskId: parsed.taskId || null
            };

            const history = Array.isArray(row.notebooklm.history) ? row.notebooklm.history : [];
            history.unshift({
                generatedAt: row.notebooklm.lastGeneratedAt,
                outputRelPath,
                outputAbsPath,
                notebookTitle,
                notebookId: row.notebooklm.notebookId,
                artifactId: row.notebooklm.artifactId,
                taskId: row.notebooklm.taskId,
                language: payload.language,
                audioFormat: payload.audioFormat,
                audioLength: payload.audioLength,
                createNewVersion
            });
            row.notebooklm.history = history.slice(0, 25);

            const refs = Array.isArray(data.dataRefs) ? data.dataRefs : [];
            const existsRef = refs.find(r => String(r?.path || '') === outputRelPath);
            if (!existsRef) {
                refs.push({
                    label: `${rowId} NotebookLM Audio`,
                    path: outputRelPath,
                    type: ext.replace('.', ''),
                    category: `Audio ${rowId}`,
                    addedAt: new Date().toISOString()
                });
            }
            data.dataRefs = refs;
        }

        const shouldPersist = (!dryRun) || saveConfig;
        let sync = [];
        if (shouldPersist) {
            data.lastUpdate = new Date().toISOString().slice(0, 10);
            saveProjectMeta(projectId, data);
            sync = syncAllAssignedAgents(projectId, data);
        }

        return ok(res, {
            projectId,
            rowIndex,
            rowId,
            title,
            dryRun,
            notebookTitle,
            sourceTitle,
            finalDoc: finalDoc.relPath,
            outputPath: outputRelPath,
            payloadPath: payloadPathForResponse,
            bridge: bridgeOutput,
            language: payload.language,
            audioFormat: payload.audioFormat,
            audioLength: payload.audioLength,
            createNewVersion,
            command: dryRun ? cmd : undefined,
            config: cfg,
            sync
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});
// Kanban Task Move API
app.post("/api/projects/:projectId/tasks/:taskId/move", express.json({ limit: '50mb' }), async (req, res) => {
    const { projectId, taskId } = req.params;
    const { newStatus } = req.body;
    if (!newStatus) return res.status(400).json({ success: false, error: "newStatus missing" });

    const projectFile = path.join(WORKSPACE_ROOT, "data", "projects", `${projectId}.json`);
    if (!fs.existsSync(projectFile)) return res.status(404).json({ success: false, error: "Project not found" });

    try {
        const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        const task = data.tasks.find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, error: "Task not found" });

        task.status = newStatus;
        fs.writeFileSync(projectFile, JSON.stringify(data, null, 2), 'utf8');
        syncAllAssignedAgents(projectId, data); // from existing sync logic
        ok(res, { message: "Task moved successfully" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Knowledge Upload API
// Remove Data Source from project
app.post("/api/projects/:projectId/data-refs/remove", express.json({ limit: '50mb' }), async (req, res) => {
    const { projectId } = req.params;
    const { path: refPath } = req.body;

    if (!refPath) return res.status(400).json({ success: false, error: "path missing" });

    const projectFile = path.join(WORKSPACE_ROOT, "data", "projects", `${projectId}.json`);
    if (!fs.existsSync(projectFile)) return res.status(404).json({ success: false, error: "Project not found" });

    try {
        const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        const before = (data.dataRefs || []).length;
        data.dataRefs = (data.dataRefs || []).filter(r => r.path !== refPath);

        if (data.dataRefs.length === before) {
            return res.status(404).json({ success: false, error: "Data source not found in project" });
        }

        fs.writeFileSync(projectFile, JSON.stringify(data, null, 2), 'utf8');
        ok(res, { message: "Data source removed successfully" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post("/api/projects/:projectId/knowledge", express.json({ limit: '50mb' }), async (req, res) => {
    const { projectId } = req.params;
    const { title, content, type, category } = req.body; // type e.g. 'md' or 'txt'

    if (!title || !content) return res.status(400).json({ success: false, error: "title and content required" });

    const projectFile = path.join(WORKSPACE_ROOT, "data", "projects", `${projectId}.json`);
    if (!fs.existsSync(projectFile)) return res.status(404).json({ success: false, error: "Project not found" });

    try {
        const ext = type === 'txt' ? 'txt' : 'md';
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '-');
        const fileName = `${ts}-${safeTitle}.${ext}`;
        const knowledgeDir = path.join(WORKSPACE_ROOT, "projects", "_knowledge", projectId);
        fs.mkdirSync(knowledgeDir, { recursive: true });

        const filePath = path.join(knowledgeDir, fileName);
        fs.writeFileSync(filePath, content, 'utf8');

        // Update Project JSON Data Refs
        const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
        if (!data.dataRefs) data.dataRefs = [];
        data.dataRefs.push({
            label: title,
            path: `projects/_knowledge/${projectId}/${fileName}`,
            type: ext,
            category: category || 'Wissensbank',
            addedAt: new Date().toISOString()
        });

        fs.writeFileSync(projectFile, JSON.stringify(data, null, 2), 'utf8');
        syncAllAssignedAgents(projectId, data);

        ok(res, { message: "Knowledge added", file: filePath });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
app.get("/api/overview", async (_, res) => {
    const xvfb = await runCmd("systemctl is-active xvfb");
    const openclaw = await runFirstOk(["/usr/bin/openclaw status", "/usr/local/bin/openclaw status"]);
    ok(res, {
        hostname: os.hostname(),
        uptimeSec: os.uptime(),
        workspace: WORKSPACE_ROOT,
        now: new Date().toISOString(),
        services: {
            xvfb: xvfb.stdout || (xvfb.ok ? "active" : "unknown"),
            openclawStatus: openclaw.ok ? openclaw.stdout : (openclaw.stderr || openclaw.error || "unknown")
        }
    });
});

// Helper: read SOUL.md, AGENTS.md for an agent workspace dir
function readAgentMeta(agentDir) {
    const soul = readFileSafe(path.join(agentDir, 'SOUL.md')) || readFileSafe(path.join(agentDir, 'soul.md'));
    const agentsMd = readFileSafe(path.join(agentDir, 'AGENTS.md')) || readFileSafe(path.join(agentDir, 'agents.md'));
    const userMd = readFileSafe(path.join(agentDir, 'USER.md')) || readFileSafe(path.join(agentDir, 'user.md'));
    const memoryMd = readFileSafe(path.join(agentDir, 'MEMORY.md')) || readFileSafe(path.join(agentDir, 'memory.md'));
    const heartbeatMd = readFileSafe(path.join(agentDir, 'HEARTBEAT.md')) || readFileSafe(path.join(agentDir, 'heartbeat.md'));
    const identityMd = readFileSafe(path.join(agentDir, 'IDENTITY.md')) || readFileSafe(path.join(agentDir, 'identity.md'));

    // Parse soul: grab first few meaningful lines as description
    const soulLines = (soul || '').split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 3);
    const soulExcerpt = soulLines.join(' ').trim().slice(0, 200) || null;

    // Parse AGENTS.md for active skills (lines containing skill names in bullet/table format)
    const skillMatches = (agentsMd || '').match(/(?:skill[s]?|tool)[:\s]+([\w\-]+)/gi) || [];
    const activeSkills = [...new Set(skillMatches.map(m => m.replace(/.*?[:\s]+/i, '').trim()))].slice(0, 8);

    // Count cron jobs mentioned
    const cronLines = (agentsMd || '').split('\n').filter(l => /\*.*\*.*\*/.test(l) || /cron|schedule/i.test(l));
    const cronCount = cronLines.length;

    // Parse soul header for agent title/name
    const soulTitle = (soul || '').split('\n').find(l => l.startsWith('#'))?.replace(/^#+\s*/, '').trim() || null;

    const knowledgeFiles = {
        soul: !!soul,
        memory: !!memoryMd,
        agents: !!agentsMd,
        user: !!userMd,
        heartbeat: !!heartbeatMd,
        identity: !!identityMd
    };
    const knowledgePaths = {
        soul: path.join(agentDir, 'SOUL.md'),
        memory: path.join(agentDir, 'MEMORY.md'),
        agents: path.join(agentDir, 'AGENTS.md'),
        user: path.join(agentDir, 'USER.md'),
        heartbeat: path.join(agentDir, 'HEARTBEAT.md'),
        identity: path.join(agentDir, 'IDENTITY.md')
    };

    return {
        soul: soulExcerpt,
        soulTitle,
        activeSkills,
        cronCount,
        hasMemory: !!memoryMd,
        hasSoul: !!soul,
        knowledgeFiles,
        knowledgePaths,
        knowledgeScore: Object.values(knowledgeFiles).filter(Boolean).length
    };
}

// Detect known agent workspaces in WORKSPACE_ROOT
function detectAgentWorkspaces() {
    const result = [];
    const subdirs = listFilesSafe(WORKSPACE_ROOT);
    for (const d of subdirs) {
        const agentDir = path.join(WORKSPACE_ROOT, d);
        try {
            const stat = fs.statSync(agentDir);
            if (!stat.isDirectory()) continue;
            const hasSoul = fs.existsSync(path.join(agentDir, 'SOUL.md')) || fs.existsSync(path.join(agentDir, 'soul.md'));
            const hasAgents = fs.existsSync(path.join(agentDir, 'AGENTS.md')) || fs.existsSync(path.join(agentDir, 'agents.md'));
            if (hasSoul || hasAgents) {
                result.push({ dir: agentDir, name: d });
            }
        } catch { /* skip */ }
    }
    return result;
}

app.get("/api/agents", async (_, res) => {
    const sessions = await runFirstOk([
        "/usr/bin/openclaw --profile tareno sessions list --json",
        "/usr/local/bin/openclaw --profile tareno sessions list --json",
        "/usr/bin/openclaw sessions list --json",
        "/usr/local/bin/openclaw sessions list --json",
        "/usr/bin/openclaw --profile tareno sessions list",
        "/usr/local/bin/openclaw --profile tareno sessions list",
        "/usr/bin/openclaw sessions list",
        "/usr/local/bin/openclaw sessions list"
    ]);
    const agents = await runFirstOk([
        "/usr/bin/openclaw --profile tareno agents list --json",
        "/usr/local/bin/openclaw --profile tareno agents list --json",
        "/usr/bin/openclaw agents list --json",
        "/usr/local/bin/openclaw agents list --json",
        "/usr/bin/openclaw --profile tareno agents list",
        "/usr/local/bin/openclaw --profile tareno agents list",
        "/usr/bin/openclaw agents list",
        "/usr/local/bin/openclaw agents list"
    ]);

    const sessionsJson = tryParseJson(sessions.stdout);
    const agentsJson = tryParseJson(agents.stdout);
    const rawSessions = Array.isArray(sessionsJson?.sessions) ? sessionsJson.sessions : [];
    const nonCronSessions = rawSessions.filter(s => !String(s.key || '').includes(':cron:'));
    const rawAgents = Array.isArray(agentsJson?.agents) ? agentsJson.agents : (Array.isArray(agentsJson) ? agentsJson : []);

    const configJson = tryParseJson(readFileSafe('/root/.openclaw-tareno/openclaw.json') || '{}') || {};
    const globalFallbacks = Array.isArray(configJson?.agents?.defaults?.model?.fallbacks)
        ? configJson.agents.defaults.model.fallbacks
        : [];

    // Detect workspaces for meta (SOUL.md etc.)
    const workspaces = detectAgentWorkspaces();

    const resolveWorkspaceForAgent = (agent) => {
        const key = String(agent?.key || agent?.id || agent?.name || '').toLowerCase();
        const byName = workspaces.find(w => w.name.toLowerCase() === key);
        if (byName) return byName;
        if (key === 'main' || key.endsWith(':main')) return { name: 'main', dir: WORKSPACE_ROOT };
        return null;
    };

    // Merge: for each agent, attach matching session info + SOUL.md meta
    const safeAgents = rawAgents.map(a => {
        const matchingSession = nonCronSessions.find(s => s.key === (a.key || a.id) || s.key === a.name);
        const ws = resolveWorkspaceForAgent(a) || { name: String(a.key || a.id || a.name || 'workspace'), dir: WORKSPACE_ROOT };
        const meta = readAgentMeta(ws.dir) || {};
        const totalTokens = matchingSession?.totalTokens ?? null;
        const contextTokens = matchingSession?.contextTokens ?? null;
        const tokenUsagePercent = (typeof totalTokens === 'number' && typeof contextTokens === 'number' && contextTokens > 0)
            ? Math.round((totalTokens / contextTokens) * 100)
            : null;
        const tokenRemainingPercent = (typeof tokenUsagePercent === 'number')
            ? Math.max(0, 100 - tokenUsagePercent)
            : null;

        return {
            name: a.name || a.identityName || a.id || a.key || meta.soulTitle || "Unknown Agent",
            key: a.key || a.id || null,
            agentId: a.id || a.key || null,
            role: a.role || "Autonomous OpenClaw Agent",
            status: a.status || (matchingSession ? "active" : "idle"),
            model: matchingSession?.model || a.model || null,
            fallbackModel: globalFallbacks[0] || a.fallbackModel || a.defaultModel || a.model || 'gpt-5.3-codex',
            fallbackModels: globalFallbacks,
            totalTokens,
            contextTokens,
            tokenUsagePercent,
            tokenRemainingPercent,
            updatedAt: matchingSession?.updatedAt || null,
            ageMs: matchingSession?.ageMs || null,
            kind: matchingSession?.kind || a.kind || null,
            description: a.description || null,
            soul: meta.soul || null,
            activeSkills: meta.activeSkills || [],
            cronCount: meta.cronCount || 0,
            hasMemory: meta.hasMemory || false,
            hasSoul: meta.hasSoul || false,
            knowledgeFiles: meta.knowledgeFiles || {},
            knowledgePaths: meta.knowledgePaths || {},
            knowledgeScore: meta.knowledgeScore || 0,
            workspaceDir: ws?.dir || null
        };
    });

    // UX decision: "Alle Agenten" should show only configured agents (no session clones).
    const orphanSessions = [];

    // Fall back: show discovered workspaces even if openclaw CLI returns nothing
    const workspaceAgents = safeAgents.length + orphanSessions.length === 0
        ? workspaces.map(ws => {
            const meta = readAgentMeta(ws.dir);
            return {
                name: meta.soulTitle || ws.name,
                key: ws.name, role: 'agent', status: 'idle',
                model: null, totalTokens: null, updatedAt: null, ageMs: null,
                kind: 'workspace', description: null,
                soul: meta.soul, activeSkills: meta.activeSkills,
                cronCount: meta.cronCount, hasMemory: meta.hasMemory, hasSoul: meta.hasSoul,
                knowledgeFiles: meta.knowledgeFiles, knowledgePaths: meta.knowledgePaths, knowledgeScore: meta.knowledgeScore,
                workspaceDir: ws.dir
            };
        })
        : [];

    const allAgents = [...safeAgents, ...orphanSessions, ...workspaceAgents];

    ok(res, {
        agents: allAgents,
        sessions: rawSessions,
        sessionCount: rawSessions.length,
        count: allAgents.length,
        rawAgentOutput: agents.stdout || agents.stderr || agents.error || "No openclaw output",
        rawSessionOutput: sessions.stdout || sessions.stderr || sessions.error || "No session output"
    });
});

app.get('/api/agent-files', (req, res) => {
    const key = String(req.query.agent || '').trim();
    if (!key) return res.status(400).json({ success: false, error: 'Missing ?agent=' });

    const workspaces = detectAgentWorkspaces();
    let ws = workspaces.find(w => w.name === key || key.includes(w.name));
    if (!ws) {
        ws = { name: key, dir: WORKSPACE_ROOT };
    }

    const meta = readAgentMeta(ws.dir);
    const files = Object.entries(meta.knowledgePaths || {}).map(([kind, filePath]) => {
        const content = readFileSafe(filePath);
        return {
            kind,
            path: filePath,
            exists: !!content,
            preview: content ? content.slice(0, 2400) : null
        };
    });

    return ok(res, {
        agent: ws.name,
        workspace: ws.dir,
        files
    });
});

app.get('/api/agent-builder/meta', async (_, res) => {
    const { data } = loadOpenClawConfig();
    const models = Object.keys(data?.agents?.defaults?.models || {});
    const primary = data?.agents?.defaults?.model?.primary || null;
    const fallbacks = Array.isArray(data?.agents?.defaults?.model?.fallbacks) ? data.agents.defaults.model.fallbacks : [];
    return ok(res, { models, primary, fallbacks });
});

app.get('/api/agent-builder', async (_, res) => {
    const { data } = loadOpenClawConfig();
    const models = Object.keys(data?.agents?.defaults?.models || {});
    const primary = data?.agents?.defaults?.model?.primary || null;
    const fallbacks = Array.isArray(data?.agents?.defaults?.model?.fallbacks) ? data.agents.defaults.model.fallbacks : [];
    return ok(res, { models, primary, fallbacks });
});

app.post('/api/agent-builder/create', async (req, res) => {
    try {
        const { agentId, agentName, model, telegramChatId, telegramToken } = req.body || {};
        const id = String(agentId || '').trim();
        const name = String(agentName || '').trim() || id;
        const chosenModel = String(model || '').trim();
        const chatId = String(telegramChatId || '').trim();

        if (!id || !/^[a-z0-9_-]+$/i.test(id)) return res.status(400).json({ success: false, error: 'Ungültige agentId (nur a-z0-9_-)' });
        if (!chosenModel) return res.status(400).json({ success: false, error: 'Model required' });
        if (!chatId) return res.status(400).json({ success: false, error: 'telegramChatId required (separater Channel/Gruppe)' });

        const workspace = `/root/.openclaw/workspace-${id}`;
        await runCmd(`mkdir -p ${workspace}`);

        // Create agent (name uses id for deterministic key generation in OpenClaw)
        const addR = await runCmd(`/usr/bin/openclaw --profile tareno agents add ${id} --non-interactive --workspace ${workspace} --model ${chosenModel} --json`);
        if (!addR.ok) return res.status(500).json({ success: false, error: addR.stderr || addR.error || 'agents add failed' });

        // Try to set display name
        await runCmd(`/usr/bin/openclaw --profile tareno agents set-identity ${id} --name "${name.replace(/"/g, '')}"`);

        // Update bindings (+ optional telegram token)
        const cfg = loadOpenClawConfig();
        cfg.data.bindings = Array.isArray(cfg.data.bindings) ? cfg.data.bindings : [];
        cfg.data.bindings.push({
            agentId: id,
            match: {
                channel: 'telegram',
                accountId: 'default',
                peer: {
                    kind: String(chatId).startsWith('-100') ? 'group' : 'direct',
                    id: chatId
                }
            }
        });

        if (telegramToken) {
            cfg.data.channels = cfg.data.channels || {};
            cfg.data.channels.telegram = cfg.data.channels.telegram || { enabled: true };
            cfg.data.channels.telegram.botToken = String(telegramToken).trim();
        }

        fs.writeFileSync(cfg.path, JSON.stringify(cfg.data, null, 2) + '\n', 'utf8');

        await runCmd('/usr/bin/openclaw gateway restart');

        return ok(res, {
            created: true,
            agentId: id,
            agentName: name,
            workspace,
            model: chosenModel,
            telegramChatId: chatId,
            note: telegramToken ? 'Telegram token updated (global account default)' : 'Existing Telegram token reused'
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/task', (req, res) => {
    try {
        const { projectId, taskId, status, actorAgentId } = req.body || {};
        if (!projectId || !taskId || !status) return res.status(400).json({ success: false, error: 'projectId, taskId, status required' });
        const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
        const raw = readFileSafe(file);
        if (!raw) return res.status(404).json({ success: false, error: 'Project data file missing' });
        const data = JSON.parse(raw);
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        const task = (data.tasks || []).find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
        task.status = status;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { updated: true, projectId, taskId, status, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// Drag & Drop Task Move Endpoint
app.post('/api/projects/:projectId/tasks/:taskId/move', (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        const { newStatus, actorAgentId } = req.body || {};
        if (!newStatus) return res.status(400).json({ success: false, error: 'newStatus required' });
        const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
        const raw = readFileSafe(file);
        if (!raw) return res.status(404).json({ success: false, error: 'Project data file missing' });
        const data = JSON.parse(raw);
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        const task = (data.tasks || []).find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
        const oldStatus = task.status;
        task.status = newStatus;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { moved: true, projectId, taskId, oldStatus, newStatus, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/task-meta', (req, res) => {
    try {
        const { projectId, taskId, title, priority, due, actorAgentId } = req.body || {};
        if (!projectId || !taskId) return res.status(400).json({ success: false, error: 'projectId, taskId required' });
        const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
        const raw = readFileSafe(file);
        if (!raw) return res.status(404).json({ success: false, error: 'Project data file missing' });
        const data = JSON.parse(raw);
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        const task = (data.tasks || []).find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
        if (typeof title === 'string') task.title = title;
        if (typeof priority === 'string') task.priority = priority;
        if (typeof due === 'string') task.due = due;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { updated: true, projectId, taskId, title: task.title, priority: task.priority, due: task.due, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/task-delete', (req, res) => {
    try {
        const { projectId, taskId, actorAgentId } = req.body || {};
        if (!projectId || !taskId) return res.status(400).json({ success: false, error: 'projectId, taskId required' });
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: 'Project data file missing' });
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });

        const before = Array.isArray(data.tasks) ? data.tasks.length : 0;
        data.tasks = (data.tasks || []).filter(t => t.id !== taskId);
        if (data.tasks.length === before) return res.status(404).json({ success: false, error: 'Task not found' });

        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);
        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { deleted: true, projectId, taskId, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/task-move', (req, res) => {
    try {
        const { fromProjectId, toProjectId, taskId, actorAgentId } = req.body || {};
        if (!fromProjectId || !toProjectId || !taskId) return res.status(400).json({ success: false, error: 'fromProjectId, toProjectId, taskId required' });
        if (fromProjectId === toProjectId) return res.status(400).json({ success: false, error: 'Source and target project must differ' });

        const source = loadProjectMeta(fromProjectId);
        const target = loadProjectMeta(toProjectId);
        if (!source || !target) return res.status(404).json({ success: false, error: 'Project data file missing' });
        if (!hasProjectWritePermission(source, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${fromProjectId}` });

        const idx = (source.tasks || []).findIndex(t => t.id === taskId);
        if (idx < 0) return res.status(404).json({ success: false, error: 'Task not found in source project' });

        const [task] = source.tasks.splice(idx, 1);
        target.tasks = Array.isArray(target.tasks) ? target.tasks : [];
        target.tasks.push(task);

        const now = new Date().toISOString().slice(0, 10);
        source.lastUpdate = now;
        target.lastUpdate = now;
        saveProjectMeta(fromProjectId, source);
        saveProjectMeta(toProjectId, target);

        const syncFrom = syncAllAssignedAgents(fromProjectId, source);
        const syncTo = syncAllAssignedAgents(toProjectId, target);

        return ok(res, { moved: true, fromProjectId, toProjectId, taskId, syncFrom, syncTo });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/knowledge', (req, res) => {
    try {
        const { projectId, title, content, kind, actorAgentId } = req.body || {};
        if (!projectId || !content) return res.status(400).json({ success: false, error: 'projectId, content required' });
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: 'Project data file missing' });
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });

        const knowledgeDir = path.join(WORKSPACE_ROOT, 'projects', '_knowledge', projectId);
        fs.mkdirSync(knowledgeDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeTitle = String(title || 'knowledge').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40) || 'knowledge';
        const ext = String(kind || '').toLowerCase() === 'md' ? 'md' : 'txt';
        const fileName = `${stamp}-${safeTitle}.${ext}`;
        const abs = path.join(knowledgeDir, fileName);
        fs.writeFileSync(abs, content + '\n', 'utf8');

        const rel = path.relative(WORKSPACE_ROOT, abs);
        data.dataRefs = Array.isArray(data.dataRefs) ? data.dataRefs : [];
        data.dataRefs.push({
            label: title || `Knowledge ${stamp}`,
            path: rel,
            type: ext,
            addedAt: new Date().toISOString()
        });
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);

        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { added: true, projectId, path: rel, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/milestone', (req, res) => {
    try {
        const { projectId, index, title, due, status, actorAgentId } = req.body || {};
        if (!projectId || index == null) return res.status(400).json({ success: false, error: 'projectId, index required' });
        const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
        const raw = readFileSafe(file);
        if (!raw) return res.status(404).json({ success: false, error: 'Project data file missing' });
        const data = JSON.parse(raw);
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });
        const m = (data.milestones || [])[Number(index)];
        if (!m) return res.status(404).json({ success: false, error: 'Milestone not found' });
        if (typeof title === 'string') m.title = title;
        if (typeof due === 'string') m.due = due;
        if (typeof status === 'string') m.status = status;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { updated: true, projectId, index, milestone: m, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/agent', (req, res) => {
    try {
        const { projectId, agentId, agentName, role, permission } = req.body || {};
        if (!projectId || !agentId) return res.status(400).json({ success: false, error: 'projectId, agentId required' });
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: 'Project data file missing' });

        data.agents = Array.isArray(data.agents) ? data.agents : [];
        data.permissions = (data.permissions && typeof data.permissions === 'object') ? data.permissions : {};

        const existing = data.agents.find(a => String(a.id).toLowerCase() === String(agentId).toLowerCase());
        if (existing) {
            if (agentName) existing.name = agentName;
            if (role) existing.role = role;
        } else {
            data.agents.push({ id: agentId, name: agentName || agentId, role: role || 'support' });
        }

        const perm = ['read', 'write'].includes(String(permission || '').toLowerCase()) ? String(permission).toLowerCase() : 'read';
        data.permissions[agentId] = perm;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);

        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { updated: true, projectId, agentId, permission: perm, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/capability-check', (req, res) => {
    try {
        const { projectId, agentId, action } = req.body || {};
        if (!projectId || !agentId) return res.status(400).json({ success: false, error: 'projectId, agentId required' });
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: 'Project data file missing' });

        const assigned = (data.agents || []).some(a => String(a.id).toLowerCase() === String(agentId).toLowerCase());
        const permission = (data.permissions && data.permissions[agentId]) ? data.permissions[agentId] : 'read';
        const canWrite = hasProjectWritePermission(data, agentId);

        const ws = getAgentWorkspace(agentId);
        const accessDir = path.join(ws, 'projects', '_access');
        let writable = false;
        let writeProbeError = null;
        try {
            fs.mkdirSync(accessDir, { recursive: true });
            const probe = path.join(accessDir, `.capability-${projectId}.tmp`);
            fs.writeFileSync(probe, `probe ${new Date().toISOString()}\n`, 'utf8');
            fs.unlinkSync(probe);
            writable = true;
        } catch (e) {
            writeProbeError = e.message;
        }

        const okAction = (action || 'write') === 'write' ? (assigned && canWrite && writable) : assigned;

        return ok(res, {
            projectId,
            agentId,
            action: action || 'write',
            assigned,
            permission,
            canWrite,
            writable,
            ok: okAction,
            reason: okAction ? 'ok' : (assigned ? (canWrite ? (writeProbeError || 'workspace not writable') : 'permission is read-only') : 'agent not assigned to project')
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/reference', (req, res) => {
    try {
        const { projectId, label, sourcePath, type, actorAgentId } = req.body || {};
        if (!projectId || !sourcePath) return res.status(400).json({ success: false, error: 'projectId, sourcePath required' });
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: 'Project data file missing' });
        if (!hasProjectWritePermission(data, actorAgentId)) return res.status(403).json({ success: false, error: `Agent ${actorAgentId} has no write permission for project ${projectId}` });

        const absSource = path.resolve(sourcePath);
        if (!isAllowedWorkspacePath(absSource)) {
            return res.status(403).json({ success: false, error: 'sourcePath outside allowed workspaces blocked' });
        }
        if (!fs.existsSync(absSource)) {
            return res.status(404).json({ success: false, error: 'sourcePath not found' });
        }

        const refsDir = path.join(PROJECT_DATA_DIR, '..', 'project-refs', projectId);
        fs.mkdirSync(refsDir, { recursive: true });

        const baseName = path.basename(absSource);
        const dest = path.join(refsDir, baseName);
        const isDir = fs.statSync(absSource).isDirectory();
        if (!isDir) fs.copyFileSync(absSource, dest);

        const rel = path.relative(WORKSPACE_ROOT, isDir ? absSource : dest);
        data.dataRefs = Array.isArray(data.dataRefs) ? data.dataRefs : [];
        data.dataRefs.push({
            label: label || baseName,
            path: rel,
            type: type || (isDir ? 'folder' : 'file'),
            addedAt: new Date().toISOString()
        });
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        saveProjectMeta(projectId, data);

        const sync = syncAllAssignedAgents(projectId, data);
        return ok(res, { added: true, projectId, referencePath: rel, sync });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/sync-agent', (req, res) => {
    try {
        const { projectId, agentId } = req.body || {};
        if (!projectId || !agentId) return res.status(400).json({ success: false, error: 'projectId, agentId required' });
        const data = loadProjectMeta(projectId);
        if (!data) return res.status(404).json({ success: false, error: 'Project data file missing' });

        const { outFile, permission } = writeProjectSnapshotToAgent(projectId, data, agentId);
        return ok(res, { synced: true, projectId, agentId, permission, outFile });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/file', (req, res) => {
    const target = String(req.query.path || '');
    if (!target) return res.status(400).json({ success: false, error: 'Missing ?path=' });
    const resolved = resolvePathFromAnyInput(target);
    if (!resolved) return res.status(403).json({ success: false, error: 'Path outside allowed workspaces blocked' });
    if (!resolved.exists) return res.status(404).json({ success: false, error: 'File not found' });
    const content = readFileSafe(resolved.absPath);
    if (content == null) return res.status(404).json({ success: false, error: 'File not found' });
    return ok(res, { path: resolved.absPath, relPath: resolved.relPath, content });
});

app.get('/api/file/raw', (req, res) => {
    const target = String(req.query.path || '');
    if (!target) return res.status(400).send('Missing ?path=');
    const resolved = resolvePathFromAnyInput(target);
    if (!resolved) return res.status(403).send('Path outside allowed workspaces blocked');
    if (!resolved.exists) return res.status(404).send('File not found');
    return res.sendFile(resolved.absPath);
});

app.get("/api/cron", async (_, res) => {
    const userCrontab = await runCmd("crontab -l");
    const openclawCron = await runFirstOk([
        "/usr/bin/openclaw --profile tareno cron list",
        "/usr/local/bin/openclaw --profile tareno cron list",
        "/usr/bin/openclaw cron list",
        "/usr/local/bin/openclaw cron list"
    ]);
    const openclawRaw = openclawCron.stdout || openclawCron.stderr || openclawCron.error;
    const jobs = parseOpenClawCronList(openclawRaw);

    // enrich with objective + last run summary
    let jobsConfig = null;
    try {
        const cfgRaw = readFileSafe('/root/.openclaw-tareno/cron/jobs.json');
        jobsConfig = cfgRaw ? JSON.parse(cfgRaw) : null;
    } catch { jobsConfig = null; }

    const enrichedJobs = [];
    for (const job of jobs) {
        const cfg = (jobsConfig?.jobs || []).find(j => j.id === job.id);
        const objective = cfg?.payload?.message ? String(cfg.payload.message).slice(0, 180) : null;
        const runs = await runCmd(`/usr/bin/openclaw --profile tareno cron runs --id ${job.id} --limit 1`);
        const runsJson = tryParseJson(runs.stdout);
        const lastEntry = Array.isArray(runsJson?.entries) ? runsJson.entries[0] : null;
        enrichedJobs.push({
            ...job,
            objective,
            lastRunSummary: lastEntry?.summary ? String(lastEntry.summary).slice(0, 220) : null,
            lastRunStatus: lastEntry?.status || null,
            lastRunAtMs: lastEntry?.runAtMs || null
        });
    }

    const byAgentMap = {};
    enrichedJobs.forEach(job => {
        const agent = job.agent || 'unknown';
        if (!byAgentMap[agent]) {
            byAgentMap[agent] = {
                agent,
                total: 0,
                ok: 0,
                warning: 0,
                error: 0,
                jobs: []
            };
        }
        byAgentMap[agent].total += 1;
        if (job.status === 'ok') byAgentMap[agent].ok += 1;
        else if (job.status === 'error') byAgentMap[agent].error += 1;
        else byAgentMap[agent].warning += 1;
        byAgentMap[agent].jobs.push({
            id: job.id,
            name: job.name,
            schedule: job.schedule,
            next: job.next,
            status: job.status
        });
    });

    ok(res, {
        userCrontab: {
            ok: userCrontab.ok,
            raw: userCrontab.stdout || userCrontab.stderr,
            jobs: parseSimpleCron(userCrontab.stdout || "")
        },
        openclawCron: {
            ok: openclawCron.ok,
            raw: openclawRaw,
            jobs: enrichedJobs,
            byAgent: Object.values(byAgentMap)
        }
    });
});

// Legacy markdown-based projects endpoint (kept for backward compatibility)
app.get("/api/projects-md-legacy", (_, res) => {
    const projectsDir = path.join(WORKSPACE_ROOT, "projects");
    const files = listFilesSafe(projectsDir).filter(f => f.endsWith(".md"));
    const projects = files.map(f => {
        const full = path.join(projectsDir, f);
        const content = readFileSafe(full) || "";
        const id = f.replace(/\.md$/, "");
        const meta = loadProjectMeta(id) || {};
        const tasks = Array.isArray(meta.tasks) ? meta.tasks : [];
        const taskStats = countTasksByState(tasks);
        const openTasks = Math.max(tasks.length - (taskStats.done || 0), 0);
        const leadAgent = (meta.agents || []).find(a => (a.role || '').toLowerCase() === 'lead') || (meta.agents || [])[0] || null;

        return {
            id,
            name: meta.name || id,
            file: full,
            preview: (meta.summary || content).slice(0, 400),
            content,
            status: meta.status || 'planning',
            priority: meta.priority || 'medium',
            leadAgent,
            agents: Array.isArray(meta.agents) ? meta.agents : [],
            permissions: (meta.permissions && typeof meta.permissions === 'object') ? meta.permissions : {},
            milestones: Array.isArray(meta.milestones) ? meta.milestones : [],
            tasks,
            taskStats,
            openTasks,
            dataRefs: Array.isArray(meta.dataRefs) ? meta.dataRefs : [],
            notes: meta.notes || null,
            lastUpdate: meta.lastUpdate || null
        };
    });

    const workloadByAgent = {};
    projects.forEach(p => {
        (p.tasks || []).forEach(t => {
            const who = t.assignee || 'Unassigned';
            if (!workloadByAgent[who]) workloadByAgent[who] = { assignee: who, total: 0, open: 0, done: 0, blocked: 0 };
            workloadByAgent[who].total += 1;
            if (t.status === 'done') workloadByAgent[who].done += 1; else workloadByAgent[who].open += 1;
            if (t.blocker) workloadByAgent[who].blocked += 1;
        });
    });

    ok(res, { count: projects.length, projects, workload: Object.values(workloadByAgent) });
});

app.get('/api/cron/runs', async (req, res) => {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Missing ?id=' });
    const runs = await runCmd(`/usr/bin/openclaw --profile tareno cron runs --id ${id} --limit 10 --json`);
    const parsed = tryParseJson(runs.stdout);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return ok(res, { id, entries, raw: runs.stdout || runs.stderr || runs.error });
});

app.get("/api/channels", async (_, res) => {
    const statusAll = await runFirstOk([
        "/usr/bin/openclaw --profile tareno status --all",
        "/usr/local/bin/openclaw --profile tareno status --all",
        "/usr/bin/openclaw status --all",
        "/usr/local/bin/openclaw status --all"
    ]);

    const raw = statusAll.stdout || statusAll.stderr || statusAll.error || "";
    const channelState = {};
    raw.split('\n').forEach(line => {
        // Table lines: │ Telegram │ ON │ OK │ ...
        const m = line.match(/│\s*([A-Za-z0-9\/_ -]+)\s*│\s*(ON|OFF)\s*│\s*(OK|ERROR|WARN|UNKNOWN)\s*│/i);
        if (m) {
            channelState[m[1].trim().toLowerCase()] = { enabled: m[2].toUpperCase() === 'ON', state: m[3].toUpperCase() };
        }
    });

    const knownChannels = [
        { id: 'telegram', name: 'Telegram', icon: '💬', type: 'messaging', description: 'Telegram Bot Kommunikation' },
        { id: 'whatsapp', name: 'WhatsApp', icon: '🟢', type: 'messaging', description: 'WhatsApp Kanal' },
        { id: 'discord', name: 'Discord', icon: '🎮', type: 'team', description: 'Discord Server/Bot' },
        { id: 'slack', name: 'Slack', icon: '🧩', type: 'team', description: 'Slack Workspace' },
        { id: 'twitter', name: 'Twitter / X', icon: '𝕏', type: 'social', description: 'Social Posting / Monitoring' }
    ];

    const enriched = knownChannels.map(ch => {
        const st = channelState[ch.name.toLowerCase()] || channelState[ch.id] || null;
        const active = !!(st && st.enabled && st.state === 'OK');
        return {
            ...ch,
            active,
            enabled: st ? st.enabled : false,
            state: st ? st.state : 'UNKNOWN'
        };
    });

    ok(res, { channels: enriched, raw });
});

app.get('/api/capabilities', async (_, res) => {
    const [agentsResp, channelsResp, cronResp, skillsResp] = await Promise.all([
        runFirstOk([
            '/usr/bin/openclaw --profile tareno agents list --json',
            '/usr/local/bin/openclaw --profile tareno agents list --json',
            '/usr/bin/openclaw agents list --json'
        ]),
        runFirstOk([
            '/usr/bin/openclaw --profile tareno status --all',
            '/usr/local/bin/openclaw --profile tareno status --all',
            '/usr/bin/openclaw status --all'
        ]),
        runFirstOk([
            '/usr/bin/openclaw --profile tareno cron list',
            '/usr/local/bin/openclaw --profile tareno cron list',
            '/usr/bin/openclaw cron list'
        ]),
        runFirstOk([
            '/usr/bin/openclaw --profile tareno skills list',
            '/usr/local/bin/openclaw --profile tareno skills list',
            '/usr/bin/openclaw skills list'
        ])
    ]);

    const agentsJson = tryParseJson(agentsResp.stdout);
    const agentCount = Array.isArray(agentsJson?.agents) ? agentsJson.agents.length : 0;

    const channelRaw = channelsResp.stdout || channelsResp.stderr || '';
    const activeChannels = [];
    channelRaw.split('\n').forEach(line => {
        const m = line.match(/│\s*([A-Za-z0-9\/_ -]+)\s*│\s*ON\s*│\s*OK\s*│/i);
        if (m) activeChannels.push(m[1].trim());
    });

    const cronJobs = parseOpenClawCronList(cronResp.stdout || cronResp.stderr || '');
    const skillLines = (skillsResp.stdout || '').split('\n').filter(l => l.trim());

    const blocks = [
        {
            title: 'Agent Control',
            items: [
                `${agentCount} Agenten erkannt (Config/Runtime).`,
                'Agenten-Detailansicht inkl. Knowledge-Bank (SOUL, MEMORY, AGENTS, USER, HEARTBEAT, IDENTITY).',
                'Agent Builder für neue Telegram-gebundene Agenten.'
            ]
        },
        {
            title: 'Projektsteuerung',
            items: [
                'Projekt-Hub mit Status, Teamrollen, Task-Fortschritt und Blockern.',
                'Kanban Drag&Drop inkl. API-Update.',
                'Capability-Checks pro Agent (read/write) vor Write-Aktionen.',
                'Data-Refs, Wissens-Uploads, Pipeline- und Markdown-Dokument-Handling.'
            ]
        },
        {
            title: 'Automation / Cron',
            items: [
                `${cronJobs.length} OpenClaw Cron-Jobs erkannt.`,
                'Cron-Liveübersicht inkl. nächster Lauf, letzter Lauf und Run-Details.',
                'System-Crontab + Syslog Verlauf einsehbar.'
            ]
        },
        {
            title: 'Channels live',
            items: activeChannels.length
                ? activeChannels.map(c => `${c} ist aktiv verbunden.`)
                : ['Aktuell kein Channel als ON/OK erkannt.']
        },
        {
            title: 'Content Pipeline',
            items: [
                'Review/Approve/Reject pro Step (Research → Multimedia).',
                'Accept-All, Draft/Publish-now, Download einzelner oder aller Step-Artefakte.',
                'NotebookLM Audio-Workflow (Config, Generate, Stream/Download).'
            ]
        },
        {
            title: 'Skills & Docs',
            items: [
                `Skills-Endpunkt aktiv (${skillLines.length || 'mehrere'} Einträge erkannt).`,
                'Globale Skill-Policy + Agent-spezifische Aktivierung aus dem Dashboard.',
                'Integration-Hinweise (ClawHub, Docs, Skill Creator) sichtbar.'
            ]
        }
    ];

    return ok(res, {
        generatedAt: new Date().toISOString(),
        blocks
    });
});

app.get("/api/activity", async (_, res) => {
    const dashLog = await runCmd("tail -n 80 dashboard.log");
    const openclawLog = await runFirstOk([
        "/usr/bin/openclaw logs --tail 40",
        "/usr/local/bin/openclaw logs --tail 40",
        "/usr/bin/openclaw status",
        "/usr/local/bin/openclaw status"
    ]);

    // Known agent workspace names (used to match agent names in log lines)
    const workspaces = detectAgentWorkspaces();
    const agentNames = workspaces.map(w => {
        const meta = readAgentMeta(w.dir);
        return { key: w.name, displayName: meta.soulTitle || w.name };
    });

    // Also scan each agent's memory folder for today's daily log
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const agentMemoryEntries = [];
    for (const ws of workspaces) {
        const memDir = path.join(ws.dir, 'memory');
        const todayLog = readFileSafe(path.join(memDir, `${today}.md`));
        if (todayLog) {
            const meta = readAgentMeta(ws.dir);
            const agentDisplayName = meta.soulTitle || ws.name;
            todayLog.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(-15).forEach((line, i) => {
                const isError = /error|fail|exception/i.test(line);
                const isWarning = /warn|timeout|retry/i.test(line);
                agentMemoryEntries.push({
                    text: line.trim(),
                    type: isError ? 'error' : isWarning ? 'warning' : 'bot',
                    agent: agentDisplayName,
                    time: `${agentDisplayName} Memory`,
                    id: `mem-${ws.name}-${i}`,
                    target: ws.name,
                    result: isError ? 'error' : isWarning ? 'warning' : 'ok',
                    details: line.trim(),
                    timestamp: new Date().toISOString(),
                    taskType: 'routine'
                });
            });
        }
    }

    // Extract agent name from a log line using common patterns.
    const extractAgent = (line) => {
        // Most reliable: session key pattern lane=session:agent:<agentId>:...
        const sessionAgentMatch = line.match(/session:agent:([a-zA-Z0-9_-]+):/i);
        if (sessionAgentMatch) {
            const id = sessionAgentMatch[1].trim();
            const mapped = agentNames.find(a => a.key.toLowerCase() === id.toLowerCase());
            return mapped?.displayName || id;
        }

        // Try [BracketName]
        const bracketMatch = line.match(/\[([A-Za-z0-9_\-\s]{2,30})\]/);
        if (bracketMatch) {
            const candidate = bracketMatch[1].trim();
            if (!/^\d{4}[-\/]/.test(candidate) && !/^(info|debug|warn|error|ok)$/i.test(candidate)) {
                return candidate;
            }
        }
        // Try {BracketName}
        const curlyMatch = line.match(/\{([A-Za-z][A-Za-z0-9_\-\s]{1,25})\}/);
        if (curlyMatch) return curlyMatch[1].trim();
        // Try "agent":"name" or agent: name
        const agentKeyMatch = line.match(/(?:agent|bot|identity)["\s:]+["']?([A-Za-z0-9_\-]{2,30})/i);
        if (agentKeyMatch) return agentKeyMatch[1].trim();
        // Try matching known workspace names in the line
        for (const ws of agentNames) {
            if (line.toLowerCase().includes(ws.key.toLowerCase())) return ws.displayName;
        }
        return null;
    };

    // Parse raw log lines into structured activity events
    const parseLogLines = (raw, source) => {
        if (!raw || !raw.trim()) return [];
        return raw.split("\n")
            .filter(l => l.trim())
            .slice(-35)
            .map((line, i) => {
                const isError = /error|fail|exception|critical/i.test(line);
                const isWarning = /warn|timeout|retry/i.test(line);
                const isSuccess = /success|done|started|running|active|ok|posted|sent|completed/i.test(line);
                const isCron = /\bcron\b/i.test(line) || /cron:/i.test(line);
                const isFix = /\bfix\b|bug|repair|hotfix/i.test(line);
                const agentName = extractAgent(line);
                const targetMatch = line.match(/(telegram:[^\s]+|discord:[^\s]+|whatsapp:[^\s]+|to\s+[\w:@\-\.]+)/i);
                const tsMatch = line.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)/);
                return {
                    text: line.trim(),
                    type: isError ? "error" : isWarning ? "warning" : isSuccess ? "system" : "bot",
                    agent: agentName || 'System',
                    time: source,
                    id: `${source}-${i}`,
                    target: targetMatch ? targetMatch[1] : null,
                    result: isError ? 'error' : isWarning ? 'warning' : isSuccess ? 'ok' : 'info',
                    details: line.trim(),
                    timestamp: tsMatch ? tsMatch[1].replace(' ', 'T') : new Date().toISOString(),
                    taskType: isCron ? 'cron' : isFix ? 'fix' : 'routine'
                };
            })
            .reverse();
    };

    const dashActivities = parseLogLines(dashLog.stdout, "dashboard.log");
    const clawActivities = parseLogLines(openclawLog.stdout, "openclaw");

    // Include recent local fixes/changes from git commits
    const gitLog = await runCmd(`git -C ${WORKSPACE_ROOT} log -n 12 --pretty=format:'%H|%cI|%s'`);
    const gitActivities = (gitLog.stdout || '').split('\n').filter(Boolean).map((line, i) => {
        const [hash, ts, msg] = line.split('|');
        const isFix = /fix|bug|repair|hotfix|dashboard/i.test(msg || '');
        return {
            id: `git-${i}-${hash?.slice(0, 7)}`,
            text: msg || 'commit',
            details: `commit ${hash}`,
            type: 'system',
            agent: 'Luna',
            target: 'workspace',
            result: 'ok',
            time: 'git',
            timestamp: ts || new Date().toISOString(),
            taskType: isFix ? 'fix' : 'routine'
        };
    });

    const allActivities = [...gitActivities, ...clawActivities, ...agentMemoryEntries, ...dashActivities]
        .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
        .slice(0, 80);

    const fallbackActivities = allActivities.length === 0 ? [{
        text: "Kein Log-Output verfügbar. Agenten-Logs erscheinen hier sobald OpenClaw auf der VPS läuft.",
        type: "system",
        agent: null,
        time: new Date().toISOString(),
        id: "fallback-0",
        timestamp: new Date().toISOString(),
        taskType: 'routine',
        target: null,
        result: 'info'
    }] : allActivities;

    ok(res, {
        activities: fallbackActivities,
        rawDashLog: dashLog.stdout || "",
        rawOpenclawLog: openclawLog.stdout || openclawLog.stderr || ""
    });
});

app.get("/api/organization", async (_, res) => {
    const statusAll = await runFirstOk([
        "/usr/bin/openclaw --profile tareno status --all",
        "/usr/local/bin/openclaw --profile tareno status --all",
        "/usr/bin/openclaw status --all",
        "/usr/local/bin/openclaw status --all"
    ]);
    const agentsR = await runFirstOk([
        "/usr/bin/openclaw --profile tareno agents list --json",
        "/usr/local/bin/openclaw --profile tareno agents list --json",
        "/usr/bin/openclaw agents list --json"
    ]);

    const agentsJson = tryParseJson(agentsR.stdout);
    const rawAgents = Array.isArray(agentsJson?.agents) ? agentsJson.agents : (Array.isArray(agentsJson) ? agentsJson : []);

    const toAgentNode = (agent) => ({
        name: agent?.name || agent?.id || agent?.key || 'Unknown Agent',
        role: 'agent',
        status: agent?.status || 'idle',
        children: []
    });

    const groups = {
        core: [],
        content: [],
        social: [],
        ops: [],
        other: []
    };

    rawAgents.forEach(agent => {
        const id = String(agent?.id || agent?.key || agent?.name || '').toLowerCase();
        if (id.includes('main')) groups.core.push(agent);
        else if (id.includes('blog') || id.includes('content')) groups.content.push(agent);
        else if (id.includes('social')) groups.social.push(agent);
        else if (id.includes('kimi') || id.includes('ops') || id.includes('guard')) groups.ops.push(agent);
        else groups.other.push(agent);
    });

    const toGroupNode = (name, items) => ({
        name,
        role: 'group',
        status: items.some(a => String(a.status || '').toLowerCase() === 'active') ? 'active' : (items.length ? 'loaded' : 'empty'),
        children: items.map(toAgentNode)
    });

    const hierarchy = {
        name: "Mert (Owner)",
        role: "root",
        status: "online",
        children: [
            toGroupNode('Core', groups.core),
            toGroupNode('Content', groups.content),
            toGroupNode('Social', groups.social),
            toGroupNode('Ops', groups.ops),
            toGroupNode('Weitere Agenten', groups.other)
        ].filter(group => group.children.length > 0)
    };

    if (hierarchy.children.length === 0) {
        hierarchy.children.push({ name: 'Keine Agenten erkannt', role: 'group', status: 'empty', children: [] });
    }

    ok(res, {
        hierarchy,
        raw: statusAll.stdout || statusAll.stderr || statusAll.error || "",
        agentCount: rawAgents.length
    });
});

app.get("/api/skills-docs", async (_, res) => {
    const skills = await getSkills();
    ok(res, { count: skills.length, skills });
});

// UI compatibility aliases
app.get("/api/cron-jobs", async (req, res) => {
    const userCrontab = await runCmd("crontab -l");
    const openclawCron = await runFirstOk(["/usr/bin/openclaw cron list", "/usr/local/bin/openclaw cron list"]);
    // Hole die exakten Ausführungs-Logs aus dem Syslog (nur zeilen die CRON enthalten)
    const sysCronLog = await runCmd("grep CRON /var/log/syslog | grep -v 'CRON\\[[0-9]*\\]: (root) CMD (   cd /' | tail -n 25 2>/dev/null || echo 'Keine System-Cron-Logs gefunden oder keine Rechte für /var/log/syslog.'");

    ok(res, {
        userCrontab: {
            ok: userCrontab.ok,
            raw: userCrontab.stdout || userCrontab.stderr,
            jobs: parseSimpleCron(userCrontab.stdout || "")
        },
        openclawCron: {
            ok: openclawCron.ok,
            raw: openclawCron.stdout || openclawCron.stderr || openclawCron.error
        },
        executionHistory: sysCronLog.stdout
    });
});

app.get("/api/skills", async (req, res) => {
    const skills = await getSkills();
    const workspaces = detectAgentWorkspaces();
    const policy = loadSkillPolicy();
    const cfg = loadOpenClawConfig().data;
    const agents = Array.isArray(cfg?.agents?.list) ? cfg.agents.list.map(a => ({ id: a.id, name: a.name || a.id })) : [];

    const enrichedSkills = skills.map(skill => {
        const usedByAgents = workspaces
            .filter(ws => {
                const agentsMd = readFileSafe(path.join(ws.dir, 'AGENTS.md')) || readFileSafe(path.join(ws.dir, 'agents.md')) || '';
                const cronMd = readFileSafe(path.join(ws.dir, 'cron', 'jobs.json')) || '';
                return agentsMd.includes(skill.name) || cronMd.includes(skill.name);
            })
            .map(ws => ws.name);

        const skillMd = readFileSafe(path.join(skill.path, 'SKILL.md')) || '';
        const descLines = skillMd.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ');
        const scope = skill.path.includes('/usr/lib/node_modules/openclaw/skills') ? 'global' : 'agent-specific';
        const skillPolicy = policy.skills?.[skill.name] || { enabled: true, agents: ['*'] };

        return {
            ...skill,
            usedByAgents,
            description: descLines.trim().slice(0, 220) || null,
            scope,
            invoke: `Nutze den Skill automatisch durch passende Anfrage; intern via read auf ${skill.path}/SKILL.md`,
            functions: descLines.trim().slice(0, 140) || 'Siehe SKILL.md',
            autoRefresh: true,
            activation: {
                globalEnabled: policy.globalEnabled,
                enabled: skillPolicy.enabled !== false,
                agents: Array.isArray(skillPolicy.agents) ? skillPolicy.agents : ['*']
            }
        };
    });

    const integrations = [
        { name: 'ClawHub Skill Registry', ref: 'https://clawhub.com', note: 'Neue Skills suchen und versioniert integrieren' },
        { name: 'OpenClaw Skill Creator', ref: '/skill_creator', note: 'Interne Skills strukturieren und erweitern' },
        { name: 'OpenClaw Docs Skills', ref: 'https://docs.openclaw.ai', note: 'Kompatible Patterns und Tooling-Standards' }
    ];

    ok(res, {
        count: enrichedSkills.length,
        skills: enrichedSkills,
        autoRefresh: true,
        agents,
        policy,
        integrations
    });
});

app.post('/api/skills/policy', (req, res) => {
    try {
        const { globalEnabled, skill, enabled, agents } = req.body || {};
        const policy = loadSkillPolicy();

        if (typeof globalEnabled === 'boolean') policy.globalEnabled = globalEnabled;

        if (skill) {
            policy.skills[skill] = {
                enabled: enabled !== false,
                agents: Array.isArray(agents) && agents.length ? agents : ['*']
            };
        }

        saveSkillPolicy(policy);
        return ok(res, { updated: true, policy });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// ---- yt-dlp bridge (for Vercel -> VPS media download) ----
const YTDLP_BRIDGE_SECRET = process.env.YTDLP_BRIDGE_SECRET || '';
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_BIN || (fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const YTDLP_TIMEOUT_MS = Number(process.env.YTDLP_TIMEOUT_MS || 45000);
const YTDLP_COOKIES_FROM_BROWSER = process.env.YTDLP_COOKIES_FROM_BROWSER || 'chromium:/root/InstaFollow/data/browser-profiles/instagram';
const YTDLP_COOKIES_FALLBACKS = process.env.YTDLP_COOKIES_FALLBACKS || 'chromium:/root/InstaFollow/data/browser-profiles/instagram_2';
const YTDLP_COOKIE_SOURCES = [
    YTDLP_COOKIES_FROM_BROWSER,
    ...String(YTDLP_COOKIES_FALLBACKS || '').split(',').map(s => s.trim()).filter(Boolean)
].filter((v, i, arr) => arr.indexOf(v) === i);
const YTDLP_LOG_FILE = process.env.YTDLP_LOG_FILE || path.join(__dirname, 'logs', 'ytdlp-bridge.log');
const YTDLP_OUT_DIR = process.env.YTDLP_OUT_DIR || path.join(__dirname, 'downloads', 'bridge');
const MP4_TO_MP3_MAX_BYTES = Number(process.env.MP4_TO_MP3_MAX_BYTES || 300 * 1024 * 1024);
const ytdlpRateBucket = new Map();

function bridgeReqId() {
    return `yd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function bridgeLog(entry) {
    try {
        const dir = path.dirname(YTDLP_LOG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(YTDLP_LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
    } catch (_) { }
}

function safeFileName(name) {
    return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function buildMp3DownloadName(fileName) {
    const safeInput = safeFileName(fileName || 'audio.mp4');
    const base = safeInput.replace(/\.[^.]+$/, '') || 'audio';
    return `${base}.mp3`;
}

if (!fs.existsSync(YTDLP_OUT_DIR)) fs.mkdirSync(YTDLP_OUT_DIR, { recursive: true });

function ytdlpBridgeAuth(req, res, next) {
    if (!YTDLP_BRIDGE_SECRET) {
        return res.status(503).json({ success: false, error: 'Bridge secret not configured on server.' });
    }
    const provided = req.headers['x-bridge-secret'] || req.body?.secret;
    if (!provided || String(provided) !== String(YTDLP_BRIDGE_SECRET)) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Secret' });
    }
    return next();
}

function ytdlpRateLimit(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const now = Date.now();
    const winMs = 60 * 1000;
    const max = 30;
    const state = ytdlpRateBucket.get(ip) || { ts: now, count: 0 };
    if (now - state.ts > winMs) {
        state.ts = now;
        state.count = 0;
    }
    state.count += 1;
    ytdlpRateBucket.set(ip, state);
    if (state.count > max) return res.status(429).json({ success: false, error: 'Rate limit exceeded' });
    next();
}

function isInstagramUrl(url) {
    try {
        const u = new URL(String(url || ''));
        return /(^|\.)instagram\.com$/i.test(u.hostname);
    } catch {
        return false;
    }
}

const execFileAsync = (bin, args, options = {}) => new Promise((resolve, reject) => {
    execFile(bin, args, options, (err, stdout, stderr) => {
        if (err) return reject({ err, stdout: stdout || '', stderr: stderr || '' });
        resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
});

function isYtdlpAuthOrRateLimitError(errText) {
    const t = String(errText || '').toLowerCase();
    return t.includes('login required') || t.includes('rate-limit reached') || t.includes('instagram api is not granting access');
}

async function runYtdlpWithCookieFallback(makeArgs, options) {
    const attempts = [];
    let lastError = null;

    for (const cookieSource of YTDLP_COOKIE_SOURCES) {
        try {
            const args = makeArgs(cookieSource);
            const result = await execFileAsync(YTDLP_BIN, args, options);
            return { ...result, cookieSource, attempts };
        } catch (e) {
            const errText = e?.stderr || e?.err?.message || String(e || 'yt-dlp failed');
            attempts.push({ cookieSource, error: String(errText).slice(0, 700) });
            lastError = e;
            if (!isYtdlpAuthOrRateLimitError(errText)) break;
        }
    }

    throw { ...(lastError || {}), attempts };
}

app.get('/api/ytdlp/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        service: 'yt-dlp-bridge',
        ytdlpBin: YTDLP_BIN,
        cookiesMode: YTDLP_COOKIES_FROM_BROWSER,
        cookieSources: YTDLP_COOKIE_SOURCES,
        secretConfigured: Boolean(YTDLP_BRIDGE_SECRET)
    });
});

app.post('/api/projects/media/mp4-to-mp3', (req, res) => {
    const reqId = bridgeReqId();
    const started = Date.now();
    const fileName = String(req.query.fileName || req.query.filename || req.headers['x-file-name'] || 'video.mp4');
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const contentLength = Number(req.headers['content-length'] || 0);
    const downloadName = buildMp3DownloadName(fileName);
    const acceptedType = contentType.startsWith('video/') || contentType === 'application/octet-stream';

    if (!acceptedType) {
        bridgeLog({ reqId, ok: false, phase: 'mp4-to-mp3-validate', error: 'Unsupported content type', contentType, fileName });
        return res.status(415).json({
            success: false,
            reqId,
            error: 'Nur Video-Uploads werden akzeptiert (z.B. video/mp4).'
        });
    }

    if (contentLength > MP4_TO_MP3_MAX_BYTES) {
        bridgeLog({
            reqId,
            ok: false,
            phase: 'mp4-to-mp3-validate',
            error: 'Upload too large',
            contentLength,
            fileName
        });
        return res.status(413).json({
            success: false,
            reqId,
            error: `Datei ist zu groß. Maximal ${Math.round(MP4_TO_MP3_MAX_BYTES / (1024 * 1024))} MB erlaubt.`
        });
    }

    const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-vn',
        '-map', '0:a:0',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-f', 'mp3',
        'pipe:1'
    ];

    const ffmpegProc = spawn(FFMPEG_BIN, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    let uploadedBytes = 0;
    let stderr = '';
    let responseStarted = false;
    let requestAborted = false;

    const abortWithJson = (status, errorMessage) => {
        if (res.headersSent) {
            res.destroy();
            return;
        }
        res.status(status).json({ success: false, reqId, error: errorMessage });
    };

    const normalizeConvertError = (message) => {
        const raw = String(message || '').trim();
        if (!raw) return 'Konvertierung fehlgeschlagen. Prüfe, ob die MP4 eine Audiospur enthält.';
        if (/matches no streams/i.test(raw) || (/option 'map'/i.test(raw) && /invalid argument/i.test(raw))) {
            return 'Konvertierung fehlgeschlagen: Die MP4 enthält keine lesbare Audiospur.';
        }
        return raw;
    };

    const killFfmpeg = () => {
        if (!ffmpegProc.killed) {
            try { ffmpegProc.kill('SIGKILL'); } catch (_) { }
        }
    };

    ffmpegProc.stderr.on('data', chunk => {
        stderr += String(chunk || '');
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    ffmpegProc.stdin.on('error', err => {
        if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') return;
        stderr += `\n${String(err?.message || err || 'stdin pipe failed')}`;
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    ffmpegProc.stdout.on('data', chunk => {
        if (!responseStarted) {
            responseStarted = true;
            res.status(200);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Convert-Req-Id', reqId);
        }
        res.write(chunk);
    });

    ffmpegProc.on('error', err => {
        bridgeLog({
            reqId,
            ok: false,
            phase: 'mp4-to-mp3-spawn',
            error: String(err?.message || err || 'ffmpeg spawn failed').slice(0, 1000),
            fileName
        });
        abortWithJson(500, 'FFmpeg konnte nicht gestartet werden.');
    });

    ffmpegProc.on('close', code => {
        const errorText = stderr.trim().split('\n').slice(-3).join(' ').trim();
        const normalizedError = normalizeConvertError(errorText);
        if (code === 0) {
            if (!responseStarted) {
                res.status(200).setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
                res.setHeader('Cache-Control', 'no-store');
            }
            res.end();
            bridgeLog({
                reqId,
                ok: true,
                phase: 'mp4-to-mp3',
                fileName,
                downloadName,
                bytesIn: uploadedBytes,
                ms: Date.now() - started
            });
            return;
        }

        if (requestAborted) {
            bridgeLog({
                reqId,
                ok: false,
                phase: 'mp4-to-mp3-aborted',
                fileName,
                bytesIn: uploadedBytes,
                ms: Date.now() - started
            });
            return;
        }

        bridgeLog({
            reqId,
            ok: false,
            phase: 'mp4-to-mp3-ffmpeg',
            fileName,
            bytesIn: uploadedBytes,
            ms: Date.now() - started,
            code,
            error: normalizedError || 'ffmpeg conversion failed'
        });

        if (!responseStarted) {
            return abortWithJson(422, normalizedError);
        }
        res.destroy();
    });

    req.on('data', chunk => {
        uploadedBytes += chunk.length;
        if (uploadedBytes > MP4_TO_MP3_MAX_BYTES) {
            requestAborted = true;
            bridgeLog({
                reqId,
                ok: false,
                phase: 'mp4-to-mp3-limit',
                fileName,
                bytesIn: uploadedBytes,
                error: 'Upload exceeded byte limit'
            });
            req.unpipe(ffmpegProc.stdin);
            ffmpegProc.stdin.destroy();
            killFfmpeg();
            abortWithJson(413, `Datei ist zu groß. Maximal ${Math.round(MP4_TO_MP3_MAX_BYTES / (1024 * 1024))} MB erlaubt.`);
            req.destroy();
        }
    });

    req.on('aborted', () => {
        requestAborted = true;
        killFfmpeg();
    });

    req.on('close', () => {
        if (!res.writableEnded && !requestAborted) return;
        killFfmpeg();
    });

    req.on('error', err => {
        requestAborted = true;
        bridgeLog({
            reqId,
            ok: false,
            phase: 'mp4-to-mp3-request',
            fileName,
            bytesIn: uploadedBytes,
            error: String(err?.message || err || 'request stream failed').slice(0, 1000)
        });
        killFfmpeg();
        abortWithJson(400, 'Upload-Stream wurde unterbrochen.');
    });

    req.pipe(ffmpegProc.stdin);
});

app.post('/api/ytdlp/download', ytdlpRateLimit, ytdlpBridgeAuth, async (req, res) => {
    const reqId = bridgeReqId();
    const started = Date.now();
    const { url } = req.body || {};

    if (!isInstagramUrl(url)) {
        bridgeLog({ reqId, ok: false, phase: 'validate', error: 'Invalid Instagram URL', url: String(url || '') });
        return res.status(400).json({ success: false, reqId, error: 'Invalid Instagram URL' });
    }

    try {
        const { stdout, stderr, cookieSource, attempts } = await runYtdlpWithCookieFallback(
            (cookieSource) => [
                '-j',
                '--no-playlist',
                '--socket-timeout', '20',
                '--extractor-retries', '2',
                '--cookies-from-browser', cookieSource,
                String(url)
            ],
            { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }
        );
        const lines = String(stdout || '').split('\n').map(s => s.trim()).filter(Boolean);
        const last = lines[lines.length - 1];
        const data = JSON.parse(last || '{}');

        bridgeLog({
            reqId,
            ok: true,
            url,
            ms: Date.now() - started,
            id: data.id || null,
            duration: data.duration || null,
            cookieSource,
            fallbackAttempts: attempts,
            stderr: String(stderr || '').slice(0, 600)
        });

        const out = {
            success: true,
            reqId,
            id: data.id || null,
            title: data.title || null,
            duration: data.duration || null,
            webpage_url: data.webpage_url || url,
            uploader: data.uploader || null,
            thumbnail: data.thumbnail || null,
            ext: data.ext || null,
            format: data.format || null,
            requested_downloads: data.requested_downloads || null,
            url: data.url || null,
            cookieSource,
            raw: data
        };
        return res.json(out);
    } catch (e) {
        const stderr = e?.stderr || e?.err?.message || 'yt-dlp failed';
        bridgeLog({
            reqId,
            ok: false,
            url,
            ms: Date.now() - started,
            attempts: e?.attempts || [],
            error: String(stderr).slice(0, 1500)
        });
        return res.status(502).json({ success: false, reqId, attempts: e?.attempts || [], error: String(stderr).slice(0, 8000) });
    }
});

app.post('/api/ytdlp/fetch', ytdlpRateLimit, ytdlpBridgeAuth, async (req, res) => {
    const reqId = bridgeReqId();
    const started = Date.now();
    const { url } = req.body || {};

    if (!isInstagramUrl(url)) {
        bridgeLog({ reqId, ok: false, phase: 'validate', error: 'Invalid Instagram URL', url: String(url || '') });
        return res.status(400).json({ success: false, reqId, error: 'Invalid Instagram URL' });
    }

    const baseName = safeFileName(reqId);
    const rawPattern = path.join(YTDLP_OUT_DIR, `${baseName}.%(ext)s`);
    const rawMp4 = path.join(YTDLP_OUT_DIR, `${baseName}.mp4`);
    const outMp4 = path.join(YTDLP_OUT_DIR, `${baseName}_telegram.mp4`);

    try {
        const { cookieSource, attempts } = await runYtdlpWithCookieFallback(
            (cookieSource) => [
                '--force-overwrites',
                '--cookies-from-browser', cookieSource,
                '-o', rawPattern,
                String(url)
            ],
            { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
        );

        await execFileAsync('ffmpeg', [
            '-y', '-i', rawMp4,
            '-vf', 'scale=720:-2',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', '96k',
            outMp4
        ], { timeout: 180000, maxBuffer: 10 * 1024 * 1024 });

        const stat = fs.statSync(outMp4);
        const fileName = path.basename(outMp4);
        bridgeLog({ reqId, ok: true, phase: 'fetch', url, ms: Date.now() - started, fileName, size: stat.size, cookieSource, fallbackAttempts: attempts });

        return res.json({
            success: true,
            reqId,
            fileName,
            size: stat.size,
            cookieSource,
            downloadUrl: `/api/ytdlp/file/${encodeURIComponent(fileName)}`,
            expiresHint: 'Temporary local file on VPS'
        });
    } catch (e) {
        const errText = (e?.stderr || e?.err?.message || String(e || 'failed')).toString().slice(0, 4000);
        bridgeLog({ reqId, ok: false, phase: 'fetch', url, ms: Date.now() - started, attempts: e?.attempts || [], error: errText });
        return res.status(502).json({ success: false, reqId, attempts: e?.attempts || [], error: errText });
    }
});

app.get('/api/ytdlp/file/:fileName', (req, res) => {
    const fileName = safeFileName(req.params.fileName || '');
    const abs = path.join(YTDLP_OUT_DIR, fileName);
    if (!abs.startsWith(path.resolve(YTDLP_OUT_DIR))) {
        return res.status(400).json({ success: false, error: 'Invalid file path' });
    }
    if (!fs.existsSync(abs)) {
        return res.status(404).json({ success: false, error: 'File not found' });
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.sendFile(abs);
});

function parseVttToText(content) {
 return content.replace(/^WEBVTT.*\n\n/s,'').split('\n').filter(line => {
 const t=line.trim();
 if(!t) return false;
 if(/^\d{2}:\d{2}/.test(t)) return false;
 if(/^NOTE/.test(t)) return false;
 return true;
 }).map(l=>l.replace(/<[^>]*>/g,'').trim()).filter(Boolean)
 .reduce((a,l)=>{if(a[a.length-1]!==l)a.push(l);return a;},[]).join('\n');
}

function parseSrtToText(content) {
 return content.split('\n').filter(l=>{
 const t=l.trim();
 return t && !/^\d+$/.test(t) && !/^\d{2}:\d{2}:\d{2}/.test(t);
 }).join(' ').replace(/\s+/g,' ').trim();
}

app.post('/api/ytdlp/transcript', ytdlpRateLimit, ytdlpBridgeAuth, async (req, res) => {
 const reqId = `tr_${Date.now().toString(36)}`;
 const { url } = req.body || {};
 if (!url) return res.status(400).json({ success: false, error: 'url required' });

 try {
  const host = new URL(url).hostname.toLowerCase();
  if (!['tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch', 'youtube.com', 'youtu.be'].some(h => host.includes(h))) {
   return res.status(400).json({ success: false, error: 'Unsupported URL' });
  }
 } catch {
  return res.status(400).json({ success: false, error: 'Invalid URL' });
 }

 const transcriptDir = path.join(YTDLP_OUT_DIR, 'transcripts');
 if (!fs.existsSync(transcriptDir)) fs.mkdirSync(transcriptDir, { recursive: true });
 const baseName = reqId;

 try {
  const carg = YTDLP_COOKIES_FROM_BROWSER ? ['--cookies-from-browser', YTDLP_COOKIES_FROM_BROWSER] : [];
  await execFileAsync(
   YTDLP_BIN,
   [
    '--no-playlist',
    '--impersonate', 'chrome',
    '--skip-download',
    '--write-auto-subs',
    '--write-subs',
    '--sub-format', 'vtt/srt/best',
    '--sub-langs', 'en.*,en',
    ...carg,
    '-o', path.join(transcriptDir, `${baseName}.%(ext)s`),
    url,
   ],
   { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
  );

  const files = fs.readdirSync(transcriptDir).filter(
   f => f.startsWith(baseName) && (f.endsWith('.vtt') || f.endsWith('.srt'))
  );

  if (files.length > 0) {
   const picked = files[0];
   const content = fs.readFileSync(path.join(transcriptDir, picked), 'utf-8');
   const transcript = picked.endsWith('.vtt') ? parseVttToText(content) : parseSrtToText(content);
   files.forEach(f => fs.unlink(path.join(transcriptDir, f), () => {}));

   if (transcript && transcript.length > 30) {
    console.log(`[transcript ${reqId}] auto-subs OK: ${transcript.length} chars`);
    return res.json({
     success: true,
     reqId,
     transcript: transcript.slice(0, 32000),
     source: 'auto-subs',
     lineCount: transcript.split('\n').filter(l => l.trim()).length,
    });
   }
  }
 } catch (err) {
  console.warn(`[transcript ${reqId}] auto-subs failed:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
 }

 const whisperBin = process.env.WHISPER_BIN || '/usr/local/bin/whisper';
 const audioFile = path.join(transcriptDir, `${baseName}_audio.mp3`);
 try {
  const carg = YTDLP_COOKIES_FROM_BROWSER ? ['--cookies-from-browser', YTDLP_COOKIES_FROM_BROWSER] : [];
  await execFileAsync(
   YTDLP_BIN,
   [
    '--no-playlist',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    ...carg,
    '-o', path.join(transcriptDir, `${baseName}_raw.%(ext)s`),
    url,
   ],
   { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
  );

  const dlFiles = fs.readdirSync(transcriptDir).filter(f => f.startsWith(`${baseName}_raw`));
  if (!dlFiles.length) throw new Error('no output');

  const dlFile = path.join(transcriptDir, dlFiles[0]);
  await execFileAsync('ffmpeg', ['-y', '-i', dlFile, '-vn', '-ar', '16000', '-ac', '1', '-f', 'mp3', audioFile], {
   timeout: 60000,
  });
  fs.unlink(dlFile, () => {});

  await execFileAsync(
   whisperBin,
   [audioFile, '--output_format', 'txt', '--output_dir', transcriptDir, '--language', 'en', '--model', 'base', '--fp16', 'False'],
   { timeout: 300000, maxBuffer: 50 * 1024 * 1024 }
  );

  const whisperTxt = path.join(transcriptDir, `${baseName}_audio.txt`);
  fs.unlink(audioFile, () => {});

  if (fs.existsSync(whisperTxt)) {
   const transcript = fs.readFileSync(whisperTxt, 'utf-8').trim();
   fs.unlink(whisperTxt, () => {});
   if (transcript.length > 20) {
    console.log(`[transcript ${reqId}] Whisper OK: ${transcript.length} chars`);
    return res.json({
     success: true,
     reqId,
     transcript: transcript.slice(0, 32000),
     source: 'whisper',
     lineCount: transcript.split('\n').filter(l => l.trim()).length,
    });
   }
  }
 } catch (err) {
  console.error(`[transcript ${reqId}] Whisper failed:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
  if (fs.existsSync(audioFile)) fs.unlink(audioFile, () => {});
 }

 return res.status(502).json({ success: false, reqId, error: 'No transcript found.' });
});

app.listen(PORT, () => console.log(`OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
