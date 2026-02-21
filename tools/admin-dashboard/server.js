const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3477;

// --- SECURITY: Basic Authentication ---
app.use((req, res, next) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    const expectedUser = process.env.DASHBOARD_USER || "admin";
    const expectedPass = process.env.DASHBOARD_PASS || "SecretClaw123!"; // Default fallback

    if (login && password && login === expectedUser && password === expectedPass) {
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
        return { name: f.replace(/\.md$/, ""), file: full, preview: (readFileSafe(full) || "").slice(0, 400) };
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
            icon: '✈️',
            type: 'messaging',
            description: 'Telegram Bot & Gruppen-Chat für Agent-Kommunikation',
            configPaths: ['.env', 'config.json', 'skills/telegram-notify', 'skills/telegram-message'],
            envKeys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TG_BOT_TOKEN']
        },
        {
            id: 'whatsapp',
            name: 'WhatsApp',
            icon: '💬',
            type: 'messaging',
            description: 'WhatsApp Business API für Kundenkommunikation',
            configPaths: ['skills/whatsapp', '.env'],
            envKeys: ['WHATSAPP_TOKEN', 'WA_PHONE_ID', 'WHATSAPP_PHONE_NUMBER_ID']
        },
        {
            id: 'twitter',
            name: 'Twitter / X',
            icon: '🐦',
            type: 'social',
            description: 'Twitter Engagement & Auto-Reply via OpenClaw',
            configPaths: ['skills/twitter-engage', 'skills/twitter-post', '.env'],
            envKeys: ['TWITTER_BEARER_TOKEN', 'TWITTER_API_KEY', 'X_API_KEY']
        },
        {
            id: 'reddit',
            name: 'Reddit',
            icon: '🤖',
            type: 'social',
            description: 'Reddit Karma-Building & Subreddit-Engagement',
            configPaths: ['skills/reddit-cultivate', 'skills/reddit-post', '.env'],
            envKeys: ['REDDIT_CLIENT_ID', 'REDDIT_USER_AGENT']
        },
        {
            id: 'email',
            name: 'E-Mail',
            icon: '📧',
            type: 'messaging',
            description: 'SMTP/IMAP E-Mail Kanal für Benachrichtigungen',
            configPaths: ['.env'],
            envKeys: ['SMTP_HOST', 'MAIL_FROM', 'EMAIL_HOST']
        },
        {
            id: 'slack',
            name: 'Slack',
            icon: '⚡',
            type: 'team',
            description: 'Slack Workspace Integration für Team-Notifications',
            configPaths: ['skills/slack-notify', '.env'],
            envKeys: ['SLACK_TOKEN', 'SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN']
        },
        {
            id: 'discord',
            name: 'Discord',
            icon: '🎮',
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
    const sysLog = await runCmd("tail -n 40 /var/log/syslog 2>/dev/null || journalctl -n 40 --no-pager 2>/dev/null || echo ''");
    const openclawLog = await runFirstOk([
        "/usr/bin/openclaw logs --tail 30",
        "/usr/local/bin/openclaw logs --tail 30",
        "/usr/bin/openclaw status",
        "/usr/local/bin/openclaw status"
    ]);

    // Parse raw log lines into structured activity events
    const parseLogLines = (raw, source) => {
        if (!raw || !raw.trim()) return [];
        return raw.split("\n")
            .filter(l => l.trim())
            .slice(-30)
            .map((line, i) => {
                const isError = /error|fail|exception|critical/i.test(line);
                const isWarning = /warn|timeout|retry/i.test(line);
                const isSuccess = /success|done|started|running|active|ok/i.test(line);
                return {
                    text: line.trim(),
                    type: isError ? "error" : isWarning ? "warning" : isSuccess ? "system" : "bot",
                    time: source,
                    id: `${source}-${i}`
                };
            })
            .reverse(); // newest first
    };

    const dashActivities = parseLogLines(dashLog.stdout, "dashboard.log");
    const clawActivities = parseLogLines(openclawLog.stdout, "openclaw");
    const allActivities = [...clawActivities, ...dashActivities].slice(0, 50);

    // If no log files found, provide a helpful status
    const fallbackActivities = allActivities.length === 0 ? [{
        text: "Kein Log-Output verfügbar. Dashboard läuft lokal – Agenten-Logs erscheinen hier sobald Verbindung zur VPS besteht.",
        type: "system",
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
    const sessionsR = await runFirstOk([
        "/usr/bin/openclaw sessions list --json",
        "/usr/local/bin/openclaw sessions list --json"
    ]);
    const skills = await getSkills();

    const agentsJson = tryParseJson(agentsR.stdout);
    const sessionsJson = tryParseJson(sessionsR.stdout);
    const rawAgents = Array.isArray(agentsJson?.agents) ? agentsJson.agents : (Array.isArray(agentsJson) ? agentsJson : []);
    const rawSessions = Array.isArray(sessionsJson?.sessions) ? sessionsJson.sessions : [];

    // Build a tree hierarchy for the org view
    const agentChildren = rawAgents.map(a => ({
        name: a.name || a.identityName || a.key || "Unknown Agent",
        role: a.role || "agent",
        status: a.status || "unknown",
        children: []
    }));

    const sessionChildren = rawSessions
        .filter(s => !rawAgents.find(a => s.key === (a.key || a.id)))
        .map(s => ({
            name: s.key || "Session",
            role: s.kind || "session",
            status: "active",
            children: []
        }));

    const skillChildren = skills.map(s => ({
        name: s.name,
        role: "skill",
        status: "loaded",
        children: []
    }));

    const hierarchy = {
        name: "OpenClaw Platform",
        role: "root",
        status: statusAll.ok ? "online" : "offline",
        children: [
            {
                name: `Agenten (${agentChildren.length + sessionChildren.length})`,
                role: "group",
                status: agentChildren.length + sessionChildren.length > 0 ? "active" : "idle",
                children: [...agentChildren, ...sessionChildren]
            },
            {
                name: `Skills & Tools (${skillChildren.length})`,
                role: "group",
                status: skillChildren.length > 0 ? "loaded" : "empty",
                children: skillChildren
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
