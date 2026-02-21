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

ok(res, {
agents: safeAgents,
sessions: safeSessions,
count: safeAgents.length,
items: safeAgents
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
const r = await runFirstOk(["/usr/bin/openclaw status", "/usr/local/bin/openclaw status"]);
ok(res, { channels: [{ name: "OpenClaw", detail: (r.stdout || "").slice(0, 1200) }] });
});

app.get("/api/activity", async (_, res) => {
const logs = await runCmd("tail -n 120 dashboard.log");
ok(res, {
activity: {
events: [],
raw: logs.stdout || logs.stderr || ""
}
});
});

app.get("/api/organization", async (_, res) => {
const r = await runFirstOk([
"/usr/bin/openclaw status --all",
"/usr/local/bin/openclaw status --all",
"/usr/bin/openclaw status"
]);

ok(res, {
organization: {
name: "OpenClaw",
status: "ok",
raw: r.stdout || r.stderr || r.error || ""
}
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
ok(res, { count: skills.length, skills });
});


app.listen(PORT, () => console.log(`OpenClaw Admin Dashboard läuft auf http://localhost:${PORT}`));
