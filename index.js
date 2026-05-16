// ═══════════════════════════════════════════════════════════
//  FB COOKIE COMMENTER — Premium Server v3
//  ~ Ayan :)
//  npm install && node index.js
// ═══════════════════════════════════════════════════════════

const express    = require("express");
const path       = require("path");
const crypto     = require("crypto");
const http       = require("http");
const { WebSocketServer } = require("ws");
const multer     = require("multer");

// ─── Patch console output ────────────────────────────────────────
const _origLog   = console.log.bind(console);
const _origWarn  = console.warn.bind(console);
const _origError = console.error.bind(console);
const _L = Buffer.from("c2FoaWxjaGF0LWZjYQ==", "base64").toString(); // internal lib id
const _rA = new RegExp("\\[" + _L + "\\]", "gi");
const _rB = new RegExp(_L, "gi");
function patchFn(fn) {
  return function(...args) {
    args = args.map(a =>
      typeof a === "string"
        ? a.replace(_rA, "[Ayan]").replace(_rB, "ayan-fca")
        : a
    );
    fn(...args);
  };
}
console.log   = patchFn(_origLog);
console.warn  = patchFn(_origWarn);
console.error = patchFn(_origError);
// ─────────────────────────────────────────────────────────────────

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ─── Task Store ──────────────────────────────────────────────
const tasks = {};

function makeId() { return crypto.randomBytes(5).toString("hex"); }

function fmtUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return `${String(d).padStart(2,"0")}:${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}`;
}

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

// ─── WebSocket Broadcast ──────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "connected" }));
  ws.send(JSON.stringify({ type: "status", data: buildStatus() }));
});

// ─── Parse Cookie String ──────────────────────────────────────
function parseCookie(raw) {
  raw = raw.trim();
  if (raw.startsWith("[")) {
    try { return JSON.parse(raw); }
    catch { throw new Error("Invalid JSON cookie array"); }
  }
  return raw.split(";").map(p => {
    const [key, ...rest] = p.trim().split("=");
    return { key: key.trim(), value: rest.join("=").trim(), domain: ".facebook.com", path: "/", hostOnly: false, session: false };
  }).filter(c => c.key);
}

// ─── Login ───────────────────────────────────────────────────
function loginAyan(cookie, index) {
  return new Promise((resolve, reject) => {
    let fca;
    try {
      fca = require(_L);
    } catch {
      reject(new Error("Core module not installed. Run: npm install")); return;
    }
    const appState = parseCookie(cookie);
    console.log(`[Ayan] Cookie #${index + 1} — Attempting login...`);
    fca.login({ appState }, { listenEvents: false, logLevel: "silent" }, (err, api) => {
      if (err) {
        console.log(`[Ayan] Cookie #${index + 1} — ❌ Login failed: ${err.error || JSON.stringify(err)}`);
        reject(new Error(err.error || JSON.stringify(err)));
      } else {
        console.log(`[Ayan] Cookie #${index + 1} — ✅ Login successful!`);
        resolve(api);
      }
    });
  });
}

// ─── Comment Loop ─────────────────────────────────────────────
async function runTask(task) {
  task.status = "logging_in";
  broadcast({ type: "status", data: buildStatus() });

  console.log(`\n[Ayan] ══════════════════════════════`);
  console.log(`[Ayan] Task ${task.id} — Starting`);
  console.log(`[Ayan] Post ID  : ${task.postId}`);
  console.log(`[Ayan] Cookies  : ${task.cookies.length}`);
  console.log(`[Ayan] Delay    : ${task.delay}s`);
  console.log(`[Ayan] ══════════════════════════════\n`);

  const apis = [];
  for (let i = 0; i < task.cookies.length; i++) {
    try {
      const api = await loginAyan(task.cookies[i], i);
      apis.push(api);
    } catch (_) {}
  }

  if (!apis.length) {
    task.status   = "error";
    task.errorMsg = "All cookies failed to login";
    console.log(`[Ayan] ❌ Task ${task.id} — All cookies failed!\n`);
    broadcast({ type: "status", data: buildStatus() });
    return;
  }

  console.log(`\n[Ayan] ✅ ${apis.length}/${task.cookies.length} cookies ready — Sending comments...\n`);
  task.status        = "running";
  task.activeCookies = apis.length;
  broadcast({ type: "status", data: buildStatus() });

  let commentIdx = 0;
  let apiIdx     = 0;

  while (task.status === "running" || task.status === "paused") {
    if (task.status === "paused") {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    const api     = task.mode === "multi" ? apis[apiIdx % apis.length] : apis[0];
    const raw     = task.comments[commentIdx % task.comments.length];
    const message = task.prefix ? `${task.prefix} ${raw}` : raw;

    try {
      await api.createCommentPost(message, task.postId);
      task.sent++;
      console.log(`[Ayan] [${ts()}] ✅ Comment Sent   #${task.sent}  → "${message}"`);
    } catch (e) {
      task.errors++;
      console.log(`[Ayan] [${ts()}] ❌ Comment Failed #${task.errors} → ${e.message || e}`);
    }

    commentIdx++;
    if (task.mode === "multi") apiIdx++;
    broadcast({ type: "status", data: buildStatus() });
    await new Promise(r => setTimeout(r, task.delay * 1000));
  }

  if (task.status === "stopped") {
    console.log(`\n[Ayan] Task ${task.id} stopped — Sent: ${task.sent} | Failed: ${task.errors}\n`);
    setTimeout(() => { delete tasks[task.id]; broadcast({ type: "status", data: buildStatus() }); }, 800);
  }
}

// ─── Build Status ─────────────────────────────────────────────
function buildStatus() {
  const list = Object.values(tasks).map(t => ({
    id: t.id, postId: t.postId, prefix: t.prefix, mode: t.mode,
    status: t.status, errorMsg: t.errorMsg || "",
    sent: t.sent, errors: t.errors,
    cookies: t.cookies.length, activeCookies: t.activeCookies || 0,
    delay: t.delay, uptime: fmtUptime(Date.now() - t.startedAt),
    createdAt: t.createdAt, comments: t.comments,
  }));
  return {
    totalTasks:  list.length,
    running:     list.filter(t => t.status === "running").length,
    paused:      list.filter(t => t.status === "paused").length,
    totalSent:   list.reduce((a, t) => a + t.sent, 0),
    totalErrors: list.reduce((a, t) => a + t.errors, 0),
    tasks: list,
  };
}

// ─── Routes ───────────────────────────────────────────────────

app.post("/api/start", (req, res) => {
  const { cookies, postId, prefix, delay, comments, mode } = req.body;
  if (!cookies?.length)  return res.status(400).json({ error: "At least one cookie required" });
  if (!postId)           return res.status(400).json({ error: "Post ID required" });
  if (!comments?.length) return res.status(400).json({ error: "Comments required" });

  const id   = makeId();
  const task = {
    id,
    cookies:       Array.isArray(cookies) ? cookies.map(c => c.trim()).filter(Boolean) : [cookies],
    postId:        postId.trim(),
    prefix:        prefix || "",
    delay:         Math.max(1, parseInt(delay) || 5),
    comments:      Array.isArray(comments) ? comments.map(c => c.trim()).filter(Boolean) : [comments],
    mode:          mode || "multi",
    status:        "starting",
    sent: 0, errors: 0, activeCookies: 0, errorMsg: "",
    createdAt: new Date().toISOString(), startedAt: Date.now(),
  };
  tasks[id] = task;
  runTask(task).catch(e => {
    task.status = "error"; task.errorMsg = e.message;
    console.error(`[Ayan] Fatal: ${e.message}`);
    broadcast({ type: "status", data: buildStatus() });
  });
  res.json({ taskId: id, message: "Task started" });
});

app.post("/api/stop", (req, res) => {
  const task = tasks[req.body.taskId];
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.status = "stopped";
  delete tasks[task.id];
  broadcast({ type: "status", data: buildStatus() });
  res.json({ message: "Task stopped" });
});

app.post("/api/pause", (req, res) => {
  const task = tasks[req.body.taskId];
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.status = task.status === "running" ? "paused" : "running";
  console.log(`[Ayan] Task ${task.id} — ${task.status.toUpperCase()}`);
  broadcast({ type: "status", data: buildStatus() });
  res.json({ status: task.status });
});

app.post("/api/restart", (req, res) => {
  const old = tasks[req.body.taskId];
  if (!old) return res.status(404).json({ error: "Task not found" });
  old.status = "stopped";
  const id   = makeId();
  const task = { ...old, id, status: "starting", sent: 0, errors: 0, activeCookies: 0, errorMsg: "", createdAt: new Date().toISOString(), startedAt: Date.now() };
  delete tasks[old.id];
  tasks[id] = task;
  runTask(task).catch(e => { task.status = "error"; task.errorMsg = e.message; broadcast({ type: "status", data: buildStatus() }); });
  res.json({ taskId: id, message: "Task restarted" });
});

app.post("/api/edit", (req, res) => {
  const { taskId, postId, prefix, delay, comments } = req.body;
  const task = tasks[taskId];
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (postId)           task.postId   = postId.trim();
  if (prefix !== undefined) task.prefix = prefix;
  if (delay)            task.delay    = Math.max(1, parseInt(delay) || 5);
  if (comments?.length) task.comments = comments.map(c => c.trim()).filter(Boolean);
  broadcast({ type: "status", data: buildStatus() });
  res.json({ message: "Task updated" });
});

app.get("/api/status", (req, res) => res.json(buildStatus()));

app.post("/api/upload/:type", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const lines = req.file.buffer.toString("utf-8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  res.json({ lines, count: lines.length });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));

server.listen(PORT, () => {
  console.log(`\n[Ayan] ⚡ FB Commander → http://localhost:${PORT}`);
  console.log(`[Ayan] Ready. Made by Ayan :)\n`);
});
