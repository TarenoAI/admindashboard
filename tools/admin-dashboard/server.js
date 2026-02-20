const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3477;
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
return { id: idx + 1, raw: line, schedule: parts.slice(0,5).join(" "), command: parts.slice(5).join(" ") };
});
}
function getDiskInfo() {
return new Promise((resolve) => {
exec("df -h /", (err, stdout) => {
if (err || !stdout) return resolve({ ok: false, raw: null });
const line = (stdout.trim().split("\n")[1] || "");
const p = line.split(/\s+/);
resolve({
ok: true, filesystem: p[0] || null, size: p[1] || null, used: p[2] || null,
avail: p[3] || null, usePercent: p[4] || null, mount: p[5] || null, raw: line
});
});
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
return out.sort((a,b) => a.name.localeCompare(b.name));
}

app.get("/api/overview", async (_, res) => {
const disk = await getDiskInfo();
const xvfb = await runCmd("systemctl is-active xvfb");
const openclaw = await runFirstOk([
"/usr/bin/openclaw status",
"/usr/local/bin/openclaw status"
]);
res.json({
hostname: os.hostname(),
uptimeSec: os.uptime(),
workspace: WORKSPACE_ROOT,
now: new Date().toISOString(),
disk,
services: {
xvfb: xvfb.stdout || (xvfb.ok ? "active" : "unknown"),
openclawStatus: openclaw.ok ? openclaw.stdout : (openclaw.stderr || openclaw.error || "unknown")
}
});
});app.get("/api/agents", async (_, res) => {
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

const safeSessions = Array.isArray(sessionsJson?.sessions)
? sessionsJson.sessions.map(s => ({
key: s.key || null, kind: s.kind || null, updatedAt: s.updatedAt || null,
ageMs: s.ageMs || null, model: s.model || null, totalTokens: s.totalTokens ?? null
}))
: [];

const rawAgents = Array.isArray(agentsJson?.agents)
? agentsJson.agents
: (Array.isArray(agentsJson) ? agentsJson : []);

const safeAgents = rawAgents.map(a => ({
name: a.name || a.identityName || a.id || a.key || null,
key: a.key || a.id || null,
role: a.role || "agent",
status: a.status || "unknown"
}));


res.json({
sessions: { count: safeSessions.length, items: safeSessions, rawPreview: (sessions.stdout || "").slice(0, 500) },
agents: { count: safeAgents.length, items: safeAgents, rawPreview: (agents.stdout || "").slice(0, 500) },
security: { note: "No file contents exposed" }
});
});

app.get("/api/cron", async (_, res) => {
const userCrontab = await runCmd("crontab -l");
const openclawCron = await runFirstOk([
"/usr/bin/openclaw cron list",
"/usr/local/bin/openclaw cron list"
]);
res.json({
userCrontab: { ok: userCrontab.ok, raw: userCrontab.stdout || userCrontab.stderr, jobs: parseSimpleCron(userCrontab.stdout) },
openclawCron: { ok: openclawCron.ok, raw: openclawCron.stdout || openclawCron.stderr || openclawCron.error }
});
});

app.get("/api/memory", (_, res) => {
const memoryIndex = readFileSafe(path.join(WORKSPACE_ROOT, "MEMORY.md"));
const files = listFilesSafe(MEMORY_DIR).filter(f => f.endsWith(".md"));
res.json({
memoryMd: { path: path.join(WORKSPACE_ROOT, "MEMORY.md"), content: memoryIndex || "MEMORY.md nicht gefunden" },
daily: files.slice(-7),
countDailyFiles: files.length
});
});

app.get("/api/skills", async (_, res) => {
const skills = await getSkills();
res.json({ count: skills.length, skills });
});

app.get("/api/projects", (_, res) => {
const projectsDir = path.join(WORKSPACE_ROOT, "projects");
const files = listFilesSafe(projectsDir).filter(f => f.endsWith(".md"));
const projects = files.map(f => {
const full = path.join(projectsDir, f);
return { name: f.replace(/\.md$/, ""), file: full, preview: (readFileSafe(full) || "").slice(0, 400) };
});
res.json({ count: projects.length, projects });
});

app.listen(PORT, () => console.log(`OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
