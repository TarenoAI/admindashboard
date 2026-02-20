const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3477;

// ─── Real Paths on VPS ──────────────────────────────────────────────────────
const WORKSPACE_ROOT = "/root/.openclaw/workspace-tareno";
const AGENTS_DIR = path.join(WORKSPACE_ROOT, "agents");
const AGENTS_SKILLS_DIR = path.join(WORKSPACE_ROOT, ".agents", "skills");
const MEMORY_DIR = path.join(WORKSPACE_ROOT, "memory");
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, "projects");
const OPENCLAW_CRON_DIR = "/root/.openclaw/cron";

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readFileSafe(filePath) {
    try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}
function listFilesSafe(dir) {
    try { return fs.readdirSync(dir).sort(); } catch { return []; }
}
function listDirsSafe(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
    } catch { return []; }
}
function runCmd(cmd) {
    return new Promise(resolve => {
        exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: (stdout || "").trim(), stderr: (stderr || "").trim(), error: err ? err.message : null });
        });
    });
}
function parseSimpleCron(text) {
    const lines = (text || "").split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    return lines.map((line, idx) => {
        const parts = line.split(/\s+/);
        if (parts.length < 6) return { id: idx + 1, schedule: "?", command: line };
        return { id: idx + 1, schedule: parts.slice(0, 5).join(" "), command: parts.slice(5).join(" ") };
    });
}

// ─── /api/overview ───────────────────────────────────────────────────────────
app.get("/api/overview", async (_, res) => {
    const openclaw = await runCmd("openclaw status");
    res.json({
        hostname: os.hostname(),
        uptimeSec: os.uptime(),
        workspace: WORKSPACE_ROOT,
        now: new Date().toISOString(),
        services: {
            openclawStatus: openclaw.ok ? openclaw.stdout : `Fehler: ${openclaw.error || openclaw.stderr}`,
        },
    });
});

// ─── /api/agents ─────────────────────────────────────────────────────────────
app.get("/api/agents", (_, res) => {
    // Special root-level MD files for the main agent (Luna)
    const rootMds = ["SOUL.md", "AGENTS.md", "MEMORY.md", "USER.md", "HEARTBEAT.md", "IDENTITY.md", "TOOLS.md", "INFRASTRUCTURE.md"];
    const rootFiles = rootMds
        .filter(f => fs.existsSync(path.join(WORKSPACE_ROOT, f)))
        .map(f => ({
            name: f,
            content: (readFileSafe(path.join(WORKSPACE_ROOT, f)) || "").slice(0, 800)
        }));

    const agents = [{ name: "Luna (Tareno)", role: "Main OpenClaw Agent", files: rootFiles }];

    // Additional sub-agents from /agents/ dir
    const subDirs = listDirsSafe(AGENTS_DIR);
    for (const d of subDirs) {
        const dir = path.join(AGENTS_DIR, d);
        const files = listFilesSafe(dir).filter(f => f.endsWith(".md")).map(f => ({
            name: f,
            content: (readFileSafe(path.join(dir, f)) || "").slice(0, 800)
        }));
        if (files.length) agents.push({ name: d, role: "Sub-Agent", files });
    }

    res.json({ count: agents.length, agents });
});

// ─── /api/memory ─────────────────────────────────────────────────────────────
app.get("/api/memory", (_, res) => {
    const mainMemory = readFileSafe(path.join(WORKSPACE_ROOT, "MEMORY.md")) || "MEMORY.md nicht gefunden";
    const files = listFilesSafe(MEMORY_DIR).filter(f => f.endsWith(".md") || f.endsWith(".json"));
    const daily = files.map(f => ({
        name: f,
        content: (readFileSafe(path.join(MEMORY_DIR, f)) || "").slice(0, 600)
    }));
    res.json({ mainMemory, daily, countFiles: files.length });
});

// ─── /api/cron ───────────────────────────────────────────────────────────────
app.get("/api/cron", async (_, res) => {
    const userCrontab = await runCmd("crontab -l");
    const openclawCron = await runCmd("openclaw cron list");

    // Also read cron dir files
    const cronFiles = listFilesSafe(OPENCLAW_CRON_DIR).map(f => ({
        name: f,
        content: readFileSafe(path.join(OPENCLAW_CRON_DIR, f)) || ""
    }));

    res.json({
        userCrontab: {
            ok: userCrontab.ok,
            jobs: parseSimpleCron(userCrontab.stdout),
        },
        openclawCron: {
            ok: openclawCron.ok,
            raw: openclawCron.ok ? openclawCron.stdout : (openclawCron.stderr || openclawCron.error),
        },
        cronFiles,
    });
});

// ─── /api/projects ───────────────────────────────────────────────────────────
app.get("/api/projects", (_, res) => {
    const files = listFilesSafe(PROJECTS_DIR).filter(f => f.endsWith(".md"));
    const projects = files.map(f => ({
        name: f.replace(/\.md$/, ""),
        preview: (readFileSafe(path.join(PROJECTS_DIR, f)) || "").slice(0, 1000)
    }));
    res.json({ count: projects.length, projects });
});

// ─── /api/skills ─────────────────────────────────────────────────────────────
app.get("/api/skills", (_, res) => {
    const dirs = listDirsSafe(AGENTS_SKILLS_DIR);
    const skills = dirs.map(d => {
        const skillMd = path.join(AGENTS_SKILLS_DIR, d, "SKILL.md");
        const content = readFileSafe(skillMd) || "";
        // Extract description from YAML frontmatter
        const descMatch = content.match(/description:\s*["']?(.+?)["']?\n/);
        const description = descMatch ? descMatch[1].trim() : "";
        // First heading as title
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : d;
        return { name: d, title, description, path: path.join(AGENTS_SKILLS_DIR, d) };
    }).sort((a, b) => a.name.localeCompare(b.name));
    res.json({ count: skills.length, skills });
});

// ─── /api/organization ───────────────────────────────────────────────────────
app.get("/api/organization", (_, res) => {
    // Read AGENTS.md for the real hierarchy if it exists
    const agentsMd = readFileSafe(path.join(WORKSPACE_ROOT, "AGENTS.md"));
    const subDirs = listDirsSafe(AGENTS_DIR).map(name => ({ name }));
    res.json({
        agentsMd: agentsMd || null,
        hierarchy: {
            name: "OpenClaw System (Tareno)",
            children: [
                {
                    name: "🤖 Luna (Main Agent)",
                    children: subDirs.length > 0 ? subDirs : [{ name: "Keine Sub-Agenten" }]
                }
            ]
        }
    });
});

// ─── /api/activity ───────────────────────────────────────────────────────────
app.get("/api/activity", async (_, res) => {
    // Read recent memory logs as activity
    const files = listFilesSafe(MEMORY_DIR).filter(f => f.endsWith(".md")).slice(-5).reverse();
    const activities = files.map(f => ({
        time: f.replace(".md", ""),
        text: (readFileSafe(path.join(MEMORY_DIR, f)) || "").split("\n").find(l => l.trim().length > 5) || f,
        type: "memory"
    }));

    // Add heartbeat info
    const heartbeat = readFileSafe(path.join(WORKSPACE_ROOT, "HEARTBEAT.md"));
    if (heartbeat) {
        activities.unshift({ time: "Heartbeat", text: heartbeat.split("\n").find(l => l.trim().length > 5) || "–", type: "system" });
    }

    res.json({ activities });
});

// ─── /api/channels ───────────────────────────────────────────────────────────
app.get("/api/channels", (_, res) => {
    // Check for telegram config
    const telegramDir = "/root/.openclaw/telegram";
    const hasTelegram = fs.existsSync(telegramDir);
    const openclawJson = readFileSafe("/root/.openclaw/openclaw.json");
    let channels = [];

    if (openclawJson) {
        try {
            const config = JSON.parse(openclawJson);
            if (config.telegram) channels.push({ name: "Telegram", active: hasTelegram, details: config.telegram.botToken ? "Bot konfiguriert" : "Kein Bot-Token" });
            if (config.slack) channels.push({ name: "Slack", active: true, details: "Webhook konfiguriert" });
            if (config.email) channels.push({ name: "E-Mail", active: true, details: config.email.from || "" });
        } catch { }
    }

    if (channels.length === 0) {
        channels = [
            { name: "Telegram", active: hasTelegram, details: hasTelegram ? "Verzeichnis vorhanden" : "Nicht konfiguriert" },
            { name: "OpenClaw CLI", active: true, details: "Immer aktiv" },
        ];
    }

    res.json({ channels });
});

app.listen(PORT, () => console.log(`✅ OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
