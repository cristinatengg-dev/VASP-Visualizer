import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const directory = path.join(root, ".dev");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const stateFile = path.join(directory, "knowledge-process.json");
const logFile = path.join(directory, "knowledge.log");
const url = "http://127.0.0.1:4317/";
let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
} catch {
  /* not started */
}
function alive() {
  if (!Number.isInteger(state?.pid)) return false;
  try {
    const command = execFileSync(
      "ps",
      ["-p", String(state.pid), "-o", "args="],
      { encoding: "utf8" },
    ).trim();
    return (
      command ===
      process.execPath + " " + path.join(root, "scripts/knowledge/dev.mjs")
    );
  } catch {
    return false;
  }
}
async function healthy() {
  try {
    const backend = await fetch(
      "http://127.0.0.1:4318/api/knowledge-dev/health",
      { signal: AbortSignal.timeout(1500) },
    );
    const frontend = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return (
      (await backend.json()).service === "eliangmat-knowledge-dev" &&
      frontend.ok
    );
  } catch {
    return false;
  }
}
const mode = process.argv[2] || "status";
if (mode === "status") {
  console.log(
    ((await healthy()) ? "开发服务运行中：" : "开发服务未就绪：") + url,
  );
  console.log("日志：" + logFile);
} else if (mode === "stop") {
  if (alive()) {
    process.kill(state.pid, "SIGTERM");
    for (let attempt = 0; attempt < 50 && alive(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log(
      alive()
        ? "停止尚未完成，请查看开发日志。"
        : "开发服务已停止。数据保留在 .dev/knowledge-data。",
    );
  } else console.log("没有由此启动器管理的服务。前台服务请使用 Ctrl+C 停止。");
} else if (mode === "start") {
  if (await healthy()) {
    console.log("开发服务已运行：" + url);
    process.exit(0);
  }
  if (alive()) {
    console.error("开发进程已存在但尚未就绪，请查看 " + logFile);
    process.exit(1);
  }
  // Lock prevents two simultaneous launchers from replacing the recorded process.
  const lockFile = path.join(directory, "knowledge-start.lock");
  let lock;
  try {
    lock = fs.openSync(lockFile, "wx", 0o600);
  } catch {
    console.error(
      "已有启动操作进行中。若上次启动被强制中止，可删除 .dev/knowledge-start.lock 后重试。",
    );
    process.exit(1);
  }
  try {
    const log = fs.openSync(logFile, "a", 0o600);
    const child = spawn(
      process.execPath,
      [path.join(root, "scripts/knowledge/dev.mjs")],
      { cwd: root, detached: true, stdio: ["ignore", log, log] },
    );
    child.unref();
    fs.closeSync(log);
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    state = { pid: child.pid, startedAt: new Date().toISOString(), url };
    fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await healthy()) {
        ready = true;
        break;
      }
      if (!alive()) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      if (alive()) process.kill(state.pid, "SIGTERM");
      throw new Error("启动失败。请查看 " + logFile);
    }
    console.log(
      "开发环境已在后台启动：" +
        url +
        "\n停止：npm run dev:platform:stop\n数据保留在 .dev/knowledge-data；电脑重启后重新运行此启动器。",
    );
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  }
} else {
  console.error("Usage: node scripts/knowledge/manage.mjs start|stop|status");
  process.exit(1);
}
