const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
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
function runCmd(cmd) {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 12000 }, (err, stdout, stderr) => {
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

const PIPELINE_STEP_IDS = [
    'content_research',
    'structure',
    'drafting',
    'feature_inserts',
    'editing',
    'geo_polish',
    'final'
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
    edit: 'editing',
    redaktion: 'editing',
    geo_polish: 'geo_polish',
    geo: 'geo_polish',
    geopolish: 'geo_polish',
    final: 'final',
    final_review: 'final',
    finalreview: 'final',
    review_final: 'final'
};

const PIPELINE_STEP_FILE_NAMES = {
    content_research: 'research',
    structure: 'structure',
    drafting: 'draft',
    feature_inserts: 'feature_inserts',
    editing: 'edited',
    geo_polish: 'geo_polish',
    final: 'final'
};

const PIPELINE_STEP_DOC_FALLBACKS = {
    content_research: ['02_research.md', '01_kb_pack.md', 'research.md'],
    structure: ['03_outline.md', '02_structure.md', 'seo.md', 'outline.md'],
    drafting: ['04_draft.md', 'draft.md'],
    feature_inserts: ['05_product_inserts.md', 'product_inserts.md'],
    editing: ['06_edited.md', 'editing.md', 'edit.md'],
    geo_polish: ['07_geo_polish.md', 'geo_polish.md'],
    final: ['FINAL.md', '07_final.md', 'final.md']
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

function resolvePipelineDocPath(projectData, cpIndex, stepId) {
    if (!projectData || !Array.isArray(projectData.contentPipeline)) return null;
    const rowIndex = Number(cpIndex);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= projectData.contentPipeline.length) return null;
    const normalizedStepId = normalizePipelineStepId(stepId);
    if (!normalizedStepId) return null;

    const row = projectData.contentPipeline[rowIndex];
    const step = row?.steps?.[normalizedStepId];
    const rawDoc = (typeof step?.doc === 'string' && step.doc.trim()) ? step.doc.trim() : null;
    if (!rawDoc) return null;

    const candidates = [];
    if (path.isAbsolute(rawDoc)) {
        candidates.push(path.resolve(rawDoc));
    } else {
        candidates.push(path.resolve(WORKSPACE_ROOT, rawDoc));
    }

    const docBase = path.basename(rawDoc);
    const docBaseNoExt = path.basename(rawDoc, path.extname(rawDoc));
    const rowFolder = getPipelineRowFolder(row, rowIndex);
    const folderRoot = path.join(WORKSPACE_ROOT, 'projects', 'blog-artifacts', rowFolder);

    if (!rawDoc.includes('/')) {
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

    const byName = findFileByNameRecursive(path.join(WORKSPACE_ROOT, 'projects', 'blog-artifacts'), docBase);
    if (byName && isAllowedWorkspacePath(byName)) {
        return { absPath: byName, relPath: path.relative(WORKSPACE_ROOT, byName) };
    }

    return null;
}

function findPipelineRowIndex(contentPipeline, selector = {}) {
    if (!Array.isArray(contentPipeline) || contentPipeline.length === 0) return -1;

    const directIndex = Number(selector.cpIndex);
    if (Number.isInteger(directIndex) && directIndex >= 0 && directIndex < contentPipeline.length) {
        return directIndex;
    }

    const wantedId = String(selector.rowId || selector.id || selector.tag || '').trim().toLowerCase();
    if (wantedId) {
        const byId = contentPipeline.findIndex((row, idx) => String(row?.id || pipelineRowId(idx)).toLowerCase() === wantedId);
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

    const stepEntries = PIPELINE_STEP_IDS.map(id => row.steps[id] || { status: 'pending' });
    const done = stepEntries.filter(s => String(s.status || '').toLowerCase() === 'done').length;
    const review = stepEntries.filter(s => String(s.status || '').toLowerCase() === 'review').length;
    const started = stepEntries.some(s => String(s.status || '').toLowerCase() !== 'pending');
    const total = PIPELINE_STEP_IDS.length;
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

    const apiKey = String(
        body.apiKey ||
        projectPublish.apiKey ||
        process.env.TARENO_BLOG_API_KEY ||
        ''
    ).trim();

    return {
        apiBase,
        endpoint,
        apiKey,
        mode: String(body.mode || projectPublish.mode || 'live').trim().toLowerCase()
    };
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

            for (let cpIndex = 0; cpIndex < result.contentPipeline.length; cpIndex += 1) {
                const cp = result.contentPipeline[cpIndex];
                for (const stepId of PIPELINE_STEP_IDS) {
                    const step = cp?.steps?.[stepId];
                    if (!step?.doc) continue;
                    const resolved = resolvePipelineDocPath(result, cpIndex, stepId);
                    if (!resolved) continue;

                    step.doc = resolved.relPath;
                    if (step.wordCount == null) {
                        try {
                            const text = fs.readFileSync(resolved.absPath, 'utf8');
                            step.wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
                        } catch {
                            // ignore missing/invalid files
                        }
                    }
                }
            }

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

// Pipeline Status API
app.post("/api/projects/:projectId/pipeline/:cpIndex/:stepId", express.json({ limit: '50mb' }), async (req, res) => {
    const { projectId, cpIndex, stepId } = req.params;
    const { status, reason, actorAgentId } = req.body || {};

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
        for (const stepId of PIPELINE_STEP_IDS) {
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
        for (const stepId of PIPELINE_STEP_IDS) {
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
        const finalDoc = resolvePipelineDocPath(data, rowIndex, 'final');
        if (!finalDoc) {
            return res.status(400).json({ success: false, error: "FINAL.md not found for this pipeline row" });
        }

        const markdown = readFileSafe(finalDoc.absPath);
        if (!markdown || !markdown.trim()) {
            return res.status(400).json({ success: false, error: "FINAL.md is empty" });
        }

        const publishCfg = resolvePublishConfig(data, body);
        if (!publishCfg.apiKey) {
            return res.status(400).json({
                success: false,
                error: "Missing publish API key (set project.publish.apiKey or TARENO_BLOG_API_KEY)"
            });
        }

        let publishUrl;
        try {
            publishUrl = new URL(publishCfg.endpoint);
            publishUrl.searchParams.set('key', publishCfg.apiKey);
        } catch {
            return res.status(400).json({ success: false, error: "Invalid publish endpoint URL" });
        }

        const rowId = String(row.id || pipelineRowId(rowIndex));
        const title = String(body.title || row.topicEn || row.topic || rowId).trim();
        const slug = safeSlug(body.slug || title || rowId, rowId.toLowerCase());
        const fileName = `${slug}.md`;

        const form = new FormData();
        form.append('file', new Blob([markdown], { type: 'text/markdown; charset=utf-8' }), fileName);
        form.append('title', title);
        form.append('slug', slug);
        form.append('projectId', projectId);
        form.append('rowId', rowId);
        form.append('mode', publishCfg.mode);
        form.append('content', markdown);

        const upstream = await fetch(publishUrl.toString(), {
            method: 'POST',
            body: form
        });

        const raw = await upstream.text();
        const parsed = tryParseJson(raw);
        if (!upstream.ok) {
            return res.status(502).json({
                success: false,
                error: "Publish endpoint rejected request",
                status: upstream.status,
                response: parsed || raw
            });
        }

        row.publishedAt = new Date().toISOString();
        row.publishStatus = 'published';
        row.publishResult = parsed || raw;
        if (row.steps?.final) {
            row.steps.final.status = 'done';
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
            endpoint: publishCfg.endpoint,
            response: parsed || raw,
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

app.get("/api/projects", (_, res) => {
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


app.listen(PORT, () => console.log(`OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
