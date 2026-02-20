const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3477;

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const AGENTS_DIR = path.join(WORKSPACE_ROOT, ".agents");
const PROJECTS_DIR = path.join(WORKSPACE_ROOT, "projects");

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function readFileSafe(filePath) {
    try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}

function listFilesSafe(dir) {
    try { return fs.readdirSync(dir).sort(); } catch { return []; }
}

function listDirsSafe(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    } catch { return []; }
}

function runCmd(cmd) {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
            resolve({
                ok: !err,
                stdout: (stdout || "").trim(),
                stderr: (stderr || "").trim(),
                error: err ? err.message : null,
            });
        });
    });
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
    const skillsDir = path.join(AGENTS_DIR, "skills");
    const dirs = listDirsSafe(skillsDir);
    const out = [];
    for (const d of dirs) {
        const skillMd = path.join(skillsDir, d, "SKILL.md");
        const content = readFileSafe(skillMd);
        if (!content) continue;
        const firstLine = content.split("\n").find(l => l.trim().length > 0) || "";
        out.push({ name: d, path: path.join(skillsDir, d), title: firstLine.replace(/^#+\s*/, "") });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

app.get("/api/overview", async (_, res) => {
    const openclaw = await runCmd("openclaw status");
    res.json({
        hostname: os.hostname(),
        uptimeSec: os.uptime(),
        services: {
            openclawStatus: openclaw.ok ? openclaw.stdout : `Fehler: ${openclaw.error}`,
        },
        workspace: WORKSPACE_ROOT,
        now: new Date().toISOString(),
    });
});

app.get("/api/cron", async (_, res) => {
    const userCrontab = await runCmd("crontab -l");
    const openclawCron = await runCmd("openclaw cron list");
    res.json({
        userCrontab: {
            ok: userCrontab.ok,
            jobs: parseSimpleCron(userCrontab.stdout),
        },
        openclawCron: {
            ok: openclawCron.ok,
            raw: openclawCron.ok ? openclawCron.stdout : (openclawCron.stderr || openclawCron.error),
        },
    });
});

app.get("/api/agents", (_, res) => {
    // Mock finding agents: an agent has a folder in .agents (e.g. .agents/luna) with .md files
    const agents = [];
    const dirs = listDirsSafe(AGENTS_DIR).filter(d => d !== "skills" && d !== "workflows");

    // If no dirs exist, we will mock one for presentation
    if (dirs.length === 0) {
        agents.push({
            name: "Luna",
            role: "Admin Agent",
            files: [
                { name: "Soul.md", content: "# Soul\nIch bin Luna, verantworlich für das System." },
                { name: "Memory.md", content: "# Memory\nLetzte Aktion: Skills aktualisiert." },
                { name: "Knowledge.md", content: "Kenne alle Pfade im System." }
            ]
        });
    } else {
        for (const d of dirs) {
            const agentDir = path.join(AGENTS_DIR, d);
            const files = listFilesSafe(agentDir).filter(f => f.endsWith('.md'));
            const fileData = files.map(f => ({
                name: f,
                content: (readFileSafe(path.join(agentDir, f)) || "").slice(0, 500)
            }));
            agents.push({ name: d, files: fileData });
        }
    }
    res.json({ count: agents.length, agents });
});

app.get("/api/skills", async (_, res) => {
    const skills = await getSkills();
    res.json({ count: skills.length, skills });
});

app.get("/api/projects", (_, res) => {
    const files = listFilesSafe(PROJECTS_DIR).filter(f => f.endsWith(".md"));
    let projects = files.map((f) => {
        const full = path.join(PROJECTS_DIR, f);
        return { name: f.replace(/\.md$/, ""), file: full, preview: (readFileSafe(full) || "").slice(0, 800) };
    });

    if (projects.length === 0) {
        projects = [
            { name: "ClawBots UI", preview: "# ClawBots UI Redesign\nAlle Knowledge-Daten für dieses Projekt sind hier gebündelt." },
            { name: "Social Auto-Poster", preview: "# Auto-Poster\nProjekt für Instagram & Twitter Automatisierung." }
        ];
    }
    res.json({ count: projects.length, projects });
});

app.get("/api/organization", (_, res) => {
    res.json({
        hierarchy: {
            name: "OpenClaw CEO",
            children: [
                { name: "Luna (Admin)", children: [{ name: "Monitoring Bot" }] },
                { name: "Social Media Manager", children: [{ name: "Insta Bot" }, { name: "Twitter Bot" }] }
            ]
        }
    });
});

app.get("/api/activity", (_, res) => {
    res.json({
        activities: [
            { time: "vor 2 Min", text: "Luna hat die UI aktualisiert", type: "system" },
            { time: "vor 15 Min", text: "Insta Bot hat neue Follower gescraped", type: "bot" },
            { time: "vor 1 Std", text: "Cronjob 'Weekly Reset' erfolgreich", type: "cron" }
        ]
    });
});

app.get("/api/channels", (_, res) => {
    res.json({
        channels: [
            { name: "#general", active: true },
            { name: "#social-media-alerts", active: true },
            { name: "#system-errors", active: false }
        ]
    });
});

app.listen(PORT, () => console.log(`Admin Dashboard läuft auf http://localhost:${PORT}`));
