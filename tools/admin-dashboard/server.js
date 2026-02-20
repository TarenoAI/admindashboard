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
const firstLine = content.split("\n").find(l => l.trim().length > 0) || "";
out.push({ name: d, path: path.join(SKILLS_DIR, d), title: firstLine.replace(/^#+\s*/, "") });
}
return out.sort((a,b) => a.name.localeCompare(b.name));
}

app.get("/api/overview", async (_, res) => {
const disk = await getDiskInfo();
const xvfb = await runCmd("systemctl is-active xvfb");
const openclaw = await runCmd("openclaw status");
res.json({
hostname: os.hostname(),
uptimeSec: os.uptime(),
disk,
services: {
xvfb: xvfb.stdout || (xvfb.ok ? "active" : "unknown"),
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
raw: userCrontab.stdout || userCrontab.stderr,
jobs: parseSimpleCron(userCrontab.stdout),
},
openclawCron: {
ok: openclawCron.ok,
raw: openclawCron.ok ? openclawCron.stdout : (openclawCron.stderr || openclawCron.error),
},
});
});app.get("/api/memory", (_, res) => {
const memoryIndex = readFileSafe(path.join(WORKSPACE_ROOT, "MEMORY.md"));
const files = listFilesSafe(MEMORY_DIR).filter(f => f.endsWith(".md"));
const daily = files.slice(-7).map((f) => ({
name: f,
path: path.join(MEMORY_DIR, f),
contentPreview: (readFileSafe(path.join(MEMORY_DIR, f)) || "").slice(0, 600),
}));
res.json({
memoryMd: { path: path.join(WORKSPACE_ROOT, "MEMORY.md"), content: memoryIndex || "MEMORY.md nicht gefunden" },
daily,
countDailyFiles: files.length,
});
});

app.get("/api/skills", async (_, res) => {
const skills = await getSkills();
res.json({ count: skills.length, skills });
});

app.get("/api/projects", (_, res) => {
const projectsDir = path.join(WORKSPACE_ROOT, "projects");
const files = listFilesSafe(projectsDir).filter(f => f.endsWith(".md"));
const projects = files.map((f) => {
const full = path.join(projectsDir, f);
return { name: f.replace(/\.md$/, ""), file: full, preview: (readFileSafe(full) || "").slice(0, 800) };
});
res.json({ count: projects.length, projects });
});

app.listen(PORT, () => console.log(`Admin Dashboard läuft auf http://localhost:${PORT}`));
