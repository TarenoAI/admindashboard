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

    return { soul: soulExcerpt, soulTitle, activeSkills, cronCount, hasMemory: !!memoryMd, hasSoul: !!soul };
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
        "/usr/bin/openclaw sessions list --json",
        "/usr/local/bin/openclaw sessions list --json",
        "/usr/bin/openclaw sessions list",
        "/usr/local/bin/openclaw sessions list"
    ]);
    const agents = await runFirstOk([
        "/usr/bin/openclaw agents list --json",
        "/usr/local/bin/openclaw agents list --json",
        "/usr/bin/openclaw agents list",
        "/usr/local/bin/openclaw agents list"
    ]);

    const sessionsJson = tryParseJson(sessions.stdout);
    const agentsJson = tryParseJson(agents.stdout);
    const rawSessions = Array.isArray(sessionsJson?.sessions) ? sessionsJson.sessions : [];
    const rawAgents = Array.isArray(agentsJson?.agents) ? agentsJson.agents : (Array.isArray(agentsJson) ? agentsJson : []);

    // Detect workspaces for meta (SOUL.md etc.)
    const workspaces = detectAgentWorkspaces();

    // Merge: for each agent, attach matching session info + SOUL.md meta
    const safeAgents = rawAgents.map(a => {
        const matchingSession = rawSessions.find(s => s.key === (a.key || a.id) || s.key === a.name);
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
            workspaceDir: ws?.dir || null
        };
    });

    // Also include orphan sessions (sessions without matching agent)
    const orphanSessions = rawSessions
        .filter(s => !rawAgents.find(a => s.key === (a.key || a.id) || s.key === a.name))
        .map(s => ({
            name: s.key || "Session Agent",
            key: s.key || null,
            role: s.kind || "session",
            status: "active",
            model: s.model || null,
            totalTokens: s.totalTokens ?? null,
            updatedAt: s.updatedAt || null,
            ageMs: s.ageMs || null,
            kind: s.kind || null,
            description: null,
            soul: null, activeSkills: [], cronCount: 0, hasMemory: false, hasSoul: false
        }));

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


app.get("/api/cron", async (_, res) => {
    const userCrontab = await runCmd("crontab -l");
    const openclawCron = await runFirstOk(["/usr/bin/openclaw cron list", "/usr/local/bin/openclaw cron list"]);
    ok(res, {
        userCrontab: {
            ok: userCrontab.ok,
            raw: userCrontab.stdout || userCrontab.stderr,
            jobs: parseSimpleCron(userCrontab.stdout || "")
        },
        openclawCron: {
            ok: openclawCron.ok,
            raw: openclawCron.stdout || openclawCron.stderr || openclawCron.error
        }
    });
});

app.get("/api/projects", (_, res) => {
    const projectsDir = path.join(WORKSPACE_ROOT, "projects");
    const files = listFilesSafe(projectsDir).filter(f => f.endsWith(".md"));
    const projects = files.map(f => {
        const full = path.join(projectsDir, f);
        const content = readFileSafe(full) || "";
        return { name: f.replace(/\.md$/, ""), file: full, preview: content.slice(0, 400), content };
    });
    ok(res, { count: projects.length, projects });
});

app.get("/api/channels", async (_, res) => {
    // Read channel configs from workspace files - check for Telegram, WhatsApp, etc. configs
    const checkFile = (f) => fs.existsSync(f);
    const knownChannels = [
        {
            id: 'telegram',
            name: 'Telegram',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.892-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
            iconColor: 'text-[#229ED9]',
            type: 'messaging',
            description: 'Telegram Bot & Gruppen-Chat für Agent-Kommunikation',
            configPaths: ['.env', 'config.json', 'skills/telegram-notify', 'skills/telegram-message'],
            envKeys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TG_BOT_TOKEN']
        },
        {
            id: 'whatsapp',
            name: 'WhatsApp',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M11.904 0C5.336 0 0 5.334 0 11.902c0 2.126.551 4.195 1.597 6.02L.15 23.498l5.728-1.5c1.782.956 3.79 1.46 5.86 1.46 6.567 0 11.901-5.334 11.901-11.903C23.639 5.336 18.307 0 11.904 0zm0 21.413c-1.838 0-3.64-.492-5.215-1.425l-.374-.222-3.87 1.013 1.034-3.774-.244-.388c-1.025-1.627-1.567-3.52-1.567-5.462 0-5.592 4.549-10.14 10.14-10.14 5.593 0 10.142 4.548 10.142 10.14 0 5.59-4.549 10.14-10.14 10.14zM17.47 14.155c-.305-.152-1.802-.89-2.08-.992-.279-.101-.482-.152-.685.152-.203.305-.786.992-.962 1.196-.178.203-.356.228-.661.076-1.79-.844-3.14-2.14-4.04-3.704-.177-.305-.019-.47.133-.623.136-.136.305-.355.457-.533.153-.178.203-.304.305-.508.102-.203.051-.38-.025-.533-.076-.153-.685-1.65-.94-2.261-.247-.591-.497-.512-.685-.52-.178-.008-.38-.01-.583-.01-.203 0-.533.076-.812.38s-1.066 1.041-1.066 2.54c0 1.498 1.092 2.945 1.244 3.148.152.203 2.146 3.275 5.19 4.568.723.307 1.287.49 1.728.627.728.228 1.391.195 1.914.118.583-.086 1.802-.736 2.056-1.447.254-.71.254-1.32.178-1.448-.076-.126-.28-.202-.584-.355z"/></svg>',
            iconColor: 'text-[#25D366]',
            type: 'messaging',
            description: 'WhatsApp Business API für Kundenkommunikation',
            configPaths: ['skills/whatsapp', '.env'],
            envKeys: ['WHATSAPP_TOKEN', 'WA_PHONE_ID', 'WHATSAPP_PHONE_NUMBER_ID']
        },
        {
            id: 'twitter',
            name: 'Twitter / X',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
            iconColor: 'text-white',
            type: 'social',
            description: 'Twitter Engagement & Auto-Reply via OpenClaw',
            configPaths: ['skills/twitter-engage', 'skills/twitter-post', '.env'],
            envKeys: ['TWITTER_BEARER_TOKEN', 'TWITTER_API_KEY', 'X_API_KEY']
        },
        {
            id: 'reddit',
            name: 'Reddit',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.688-.561-1.249-1.249-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>',
            iconColor: 'text-[#FF4500]',
            type: 'social',
            description: 'Reddit Karma-Building & Subreddit-Engagement',
            configPaths: ['skills/reddit-cultivate', 'skills/reddit-post', '.env'],
            envKeys: ['REDDIT_CLIENT_ID', 'REDDIT_USER_AGENT']
        },
        {
            id: 'email',
            name: 'E-Mail',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>',
            iconColor: 'text-[#EA4335]',
            type: 'messaging',
            description: 'SMTP/IMAP E-Mail Kanal für Benachrichtigungen',
            configPaths: ['.env'],
            envKeys: ['SMTP_HOST', 'MAIL_FROM', 'EMAIL_HOST']
        },
        {
            id: 'slack',
            name: 'Slack',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.523-2.522v-2.522h2.523zM15.165 17.688a2.527 2.527 0 0 1-2.523-2.523 2.526 2.526 0 0 1 2.523-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.52H15.165z"/></svg>',
            iconColor: 'text-[#4A154B]',
            type: 'team',
            description: 'Slack Workspace Integration für Team-Notifications',
            configPaths: ['skills/slack-notify', '.env'],
            envKeys: ['SLACK_TOKEN', 'SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN']
        },
        {
            id: 'discord',
            name: 'Discord',
            icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
            iconColor: 'text-[#5865F2]',
            type: 'team',
            description: 'Discord Bot & Server-Integration',
            configPaths: ['skills/discord-notify', '.env'],
            envKeys: ['DISCORD_TOKEN', 'DISCORD_WEBHOOK', 'DISCORD_BOT_TOKEN']
        }
    ];

    // Check which channels have config evidence
    const envContent = readFileSafe(path.join(WORKSPACE_ROOT, '.env')) || '';
    const enriched = knownChannels.map(ch => {
        // Check env keys
        const hasEnvKey = ch.envKeys.some(k => envContent.includes(k));
        // Check if skill dir exists
        const hasSkillDir = ch.configPaths.some(p =>
            checkFile(path.join(WORKSPACE_ROOT, p)) ||
            checkFile(path.join(SKILLS_DIR, p.replace('skills/', '')))
        );
        const active = hasEnvKey || hasSkillDir;
        return { ...ch, active, hasEnvKey, hasSkillDir };
    });

    ok(res, { channels: enriched });
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
                    id: `mem-${ws.name}-${i}`
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
                return {
                    text: line.trim(),
                    type: isError ? "error" : isWarning ? "warning" : isSuccess ? "system" : "bot",
                    agent: agentName,
                    time: source,
                    id: `${source}-${i}`
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
        "/usr/bin/openclaw status --all",
        "/usr/local/bin/openclaw status --all",
        "/usr/bin/openclaw status",
        "/usr/local/bin/openclaw status"
    ]);
    const agentsR = await runFirstOk([
        "/usr/bin/openclaw agents list --json",
        "/usr/local/bin/openclaw agents list --json",
        "/usr/bin/openclaw agents list"
    ]);

    const agentsJson = tryParseJson(agentsR.stdout);
    const rawAgents = Array.isArray(agentsJson?.agents) ? agentsJson.agents : (Array.isArray(agentsJson) ? agentsJson : []);

    // Enrich agents with workspace info (SOUL, roles)
    const workspaces = detectAgentWorkspaces();
    const allAgents = rawAgents.map(a => {
        const ws = workspaces.find(w => w.name === (a.key || a.id || a.name));
        const meta = ws ? readAgentMeta(ws.dir) : {};
        return {
            name: meta.soulTitle || a.name || a.identityName || a.id || a.key || "Unknown Agent",
            roleStr: (a.role || a.kind || meta.soul || "assistant").toLowerCase(),
            status: a.status || "idle",
            originalRole: a.role || "Agent"
        };
    });

    // We also want to include workspaces that don't have active sessions but exist in the folder
    workspaces.forEach(ws => {
        if (!allAgents.find(a => a.name === ws.name || a.name.includes(ws.name))) {
            const meta = readAgentMeta(ws.dir);
            allAgents.push({
                name: meta.soulTitle || ws.name,
                roleStr: (meta.soul || "assistant").toLowerCase(),
                status: "offline",
                originalRole: "Agent"
            });
        }
    });

    // Helper to determine department based on agent's role or soul text
    const getDept = (agent) => {
        const text = agent.roleStr;
        if (/frontend|ui|ux|design|css|react/i.test(text)) return 'Design & Frontend';
        if (/backend|api|database|sql|server|cto|architect/i.test(text)) return 'Backend & Architecture (CTO)';
        if (/marketing|social|twitter|reddit|seo|blog/i.test(text)) return 'Marketing & Growth (CMO)';
        if (/support|service|mail|whatsapp/i.test(text)) return 'Cust. Service & Operations (COO)';
        return 'General Assistants';
    };

    // Group agents by department
    const depts = {};
    allAgents.forEach(a => {
        const d = getDept(a);
        if (!depts[d]) depts[d] = [];
        depts[d].push({
            name: a.name,
            role: "agent",
            status: a.status,
            originalRole: a.originalRole,
            children: []
        });
    });

    // Convert grouping to tree children format
    const deptChildren = Object.keys(depts).map(deptName => {
        return {
            name: deptName,
            role: "group",
            status: depts[deptName].some(a => a.status === 'active' || a.status === 'online') ? 'active' : 'idle',
            children: depts[deptName].map(a => ({
                name: a.name,
                role: a.originalRole.length < 20 ? a.originalRole : 'Agent',
                status: a.status,
                children: []
            }))
        };
    });

    // Root is Mert Karaca (CEO)
    const hierarchy = {
        name: "Mert Karaca (CEO)",
        role: "root",
        status: "online",
        children: deptChildren.sort((a, b) => b.children.length - a.children.length) // sort largest departments first
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
    // Enrich skills: check which agent workspaces reference each skill
    const workspaces = detectAgentWorkspaces();
    const enrichedSkills = skills.map(skill => {
        const usedByAgents = workspaces
            .filter(ws => {
                const agentsMd = readFileSafe(path.join(ws.dir, 'AGENTS.md')) || readFileSafe(path.join(ws.dir, 'agents.md')) || '';
                const cronMd = readFileSafe(path.join(ws.dir, 'cron', 'jobs.json')) || '';
                return agentsMd.includes(skill.name) || cronMd.includes(skill.name);
            })
            .map(ws => ws.name);
        // Get more detail from SKILL.md: description lines after title
        const skillMd = readFileSafe(path.join(skill.path, 'SKILL.md')) || '';
        const descLines = skillMd.split('\n').filter(l => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ');
        return { ...skill, usedByAgents, description: descLines.trim().slice(0, 180) || null };
    });
    ok(res, { count: enrichedSkills.length, skills: enrichedSkills });
});


app.listen(PORT, () => console.log(`OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
