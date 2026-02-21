const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3477;

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
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login && password && login === authCfg.user && password === authCfg.pass) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="OpenClaw Admin Dashboard"');
    res.status(401).send('Authentication required.');
});
// --------------------------------------

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const MEMORY_DIR = path.join(WORKSPACE_ROOT, "memory");
const SKILLS_DIR = "/usr/lib/node_modules/openclaw/skills";
const PROJECT_DATA_DIR = path.join(WORKSPACE_ROOT, "data", "projects");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

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

function loadProjectMeta(projectId) {
    const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
    const raw = readFileSafe(file);
    if (!raw) return null;
    const parsed = tryParseJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
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

function ok(res, payload) {
    return res.json({ success: true, data: payload, ...payload });
}

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

    // Detect workspaces for meta (SOUL.md etc.)
    const workspaces = detectAgentWorkspaces();

    // Merge: for each agent, attach matching session info + SOUL.md meta
    const safeAgents = rawAgents.map(a => {
        const matchingSession = nonCronSessions.find(s => s.key === (a.key || a.id) || s.key === a.name);
        const ws = workspaces.find(w => w.name === (a.key || a.id || a.name));
        const meta = ws ? readAgentMeta(ws.dir) : {};
        return {
            name: meta.soulTitle || a.name || a.identityName || a.id || a.key || "Unknown Agent",
            key: a.key || a.id || null,
            role: a.role || "Autonomous OpenClaw Agent",
            status: a.status || (matchingSession ? "active" : "idle"),
            model: matchingSession?.model || a.model || null,
            totalTokens: matchingSession?.totalTokens ?? null,
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

app.post('/api/projects/task', (req, res) => {
    try {
        const { projectId, taskId, status } = req.body || {};
        if (!projectId || !taskId || !status) return res.status(400).json({ success: false, error: 'projectId, taskId, status required' });
        const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
        const raw = readFileSafe(file);
        if (!raw) return res.status(404).json({ success: false, error: 'Project data file missing' });
        const data = JSON.parse(raw);
        const task = (data.tasks || []).find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
        task.status = status;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return ok(res, { updated: true, projectId, taskId, status });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/projects/task-meta', (req, res) => {
    try {
        const { projectId, taskId, title, priority, due } = req.body || {};
        if (!projectId || !taskId) return res.status(400).json({ success: false, error: 'projectId, taskId required' });
        const file = path.join(PROJECT_DATA_DIR, `${projectId}.json`);
        const raw = readFileSafe(file);
        if (!raw) return res.status(404).json({ success: false, error: 'Project data file missing' });
        const data = JSON.parse(raw);
        const task = (data.tasks || []).find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
        if (typeof title === 'string') task.title = title;
        if (typeof priority === 'string') task.priority = priority;
        if (typeof due === 'string') task.due = due;
        data.lastUpdate = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return ok(res, { updated: true, projectId, taskId, title: task.title, priority: task.priority, due: task.due });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/file', (req, res) => {
    const target = String(req.query.path || '');
    if (!target) return res.status(400).json({ success: false, error: 'Missing ?path=' });
    const abs = path.resolve(target);
    if (!abs.startsWith(WORKSPACE_ROOT)) return res.status(403).json({ success: false, error: 'Path outside workspace blocked' });
    const content = readFileSafe(abs);
    if (content == null) return res.status(404).json({ success: false, error: 'File not found' });
    return ok(res, { path: abs, content });
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

    ok(res, {
        userCrontab: {
            ok: userCrontab.ok,
            raw: userCrontab.stdout || userCrontab.stderr,
            jobs: parseSimpleCron(userCrontab.stdout || "")
        },
        openclawCron: {
            ok: openclawCron.ok,
            raw: openclawRaw,
            jobs: enrichedJobs
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
            milestones: Array.isArray(meta.milestones) ? meta.milestones : [],
            tasks,
            taskStats,
            openTasks,
            dataRefs: Array.isArray(meta.dataRefs) ? meta.dataRefs : [],
            notes: meta.notes || null,
            lastUpdate: meta.lastUpdate || null
        };
    });
    ok(res, { count: projects.length, projects });
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
                    details: line.trim()
                });
            });
        }
    }

    // Extract agent name from a log line using common patterns:
    // [AgentName], {AgentName}, «AgentName», "agent": "name", identity: name
    const extractAgent = (line) => {
        // Try [BracketName]
        const bracketMatch = line.match(/\[([A-Za-z0-9_\-\s]{2,30})\]/);
        if (bracketMatch) {
            // Filter out timestamps like [2024-01-01] or [INFO]
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
                const agentName = extractAgent(line);
                const targetMatch = line.match(/(telegram:[^\s]+|discord:[^\s]+|whatsapp:[^\s]+|to\s+[\w:@\-\.]+)/i);
                return {
                    text: line.trim(),
                    type: isError ? "error" : isWarning ? "warning" : isSuccess ? "system" : "bot",
                    agent: agentName,
                    time: source,
                    id: `${source}-${i}`,
                    target: targetMatch ? targetMatch[1] : null,
                    result: isError ? 'error' : isWarning ? 'warning' : isSuccess ? 'ok' : 'info',
                    details: line.trim()
                };
            })
            .reverse();
    };

    const dashActivities = parseLogLines(dashLog.stdout, "dashboard.log");
    const clawActivities = parseLogLines(openclawLog.stdout, "openclaw");
    const allActivities = [...clawActivities, ...agentMemoryEntries, ...dashActivities].slice(0, 60);

    const fallbackActivities = allActivities.length === 0 ? [{
        text: "Kein Log-Output verfügbar. Agenten-Logs erscheinen hier sobald OpenClaw auf der VPS läuft.",
        type: "system",
        agent: null,
        time: new Date().toISOString(),
        id: "fallback-0"
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

    const norm = (s) => String(s || '').toLowerCase();
    const findAgent = (pred) => rawAgents.find(pred) || null;

    const tarenoblog = findAgent(a => norm(a.id || a.key || a.name).includes('tarenoblog'));
    const tarenosocial = findAgent(a => norm(a.id || a.key || a.name).includes('social'));
    const mainAgent = findAgent(a => norm(a.id || a.key || a.name).includes('main'));

    const nodeFor = (agent, fallbackName, fallbackRole) => ({
        name: (agent?.name || fallbackName),
        role: fallbackRole,
        status: agent?.status || 'idle',
        children: []
    });

    const hierarchy = {
        name: "Mert (Owner)",
        role: "root",
        status: "online",
        children: [
            {
                name: "TarenoBlog",
                role: "group",
                status: (tarenoblog?.status || 'idle'),
                children: [nodeFor(tarenoblog, 'Sam', 'Zuständig für Blogs bei Tareno')]
            },
            {
                name: "TarenoSocial",
                role: "group",
                status: (tarenosocial?.status || 'idle'),
                children: [nodeFor(tarenosocial, 'MiracleSocial', 'Social Marketer für Tareno')]
            },
            {
                name: "Core",
                role: "group",
                status: (mainAgent?.status || 'idle'),
                children: [nodeFor(mainAgent, 'Luna', 'Orchestrierung & Oversight')]
            }
        ]
    };

    ok(res, {
        hierarchy,
        raw: statusAll.stdout || statusAll.stderr || statusAll.error || ""
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

        return {
            ...skill,
            usedByAgents,
            description: descLines.trim().slice(0, 220) || null,
            scope,
            invoke: `Nutze den Skill automatisch durch passende Anfrage; intern via read auf ${skill.path}/SKILL.md`,
            functions: descLines.trim().slice(0, 140) || 'Siehe SKILL.md',
            autoRefresh: true
        };
    });

    ok(res, { count: enrichedSkills.length, skills: enrichedSkills, autoRefresh: true });
});


app.listen(PORT, () => console.log(`OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
