import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
process.chdir(root);
// Fixed ports make the bookmarked URL stable; fail instead of silently falling back.
for (const port of [4317, 4318])
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          "端口 " +
            port +
            " 已被占用。请先打开 http://127.0.0.1:4317/ 检查现有开发服务。",
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
fs.mkdirSync(".dev", { recursive: true, mode: 0o700 });
if (!fs.existsSync(".dev/knowledge.env"))
  fs.copyFileSync(
    "scripts/knowledge/knowledge.env.example",
    ".dev/knowledge.env",
  );
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1500).unref();
}
const backend = spawn(process.execPath, ["server/knowledge-dev.cjs"], {
  stdio: "inherit",
});
children.push(backend);
backend.on("exit", (code) => stop(code || 0));
backend.on("error", () => stop(1));
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const r = await fetch("http://127.0.0.1:4318/api/knowledge-dev/health");
    if (r.ok) break;
  } catch {
    /* wait for bind */
  }
  if (attempt === 39) {
    stop(1);
    throw new Error("开发 API 未能启动");
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}
const frontend = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "4317",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ELIANGMAT_DATA_DEV: "1",
      VITE_KNOWLEDGE_DEV: "true",
    },
  },
);
children.push(frontend);
frontend.on("exit", (code) => stop(code || 0));
frontend.on("error", () => stop(1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
console.log(
  "\nEliangMat AI 开发测试：http://127.0.0.1:4317/\n数据保存在 .dev/knowledge-data，停止服务不会删除。Ctrl+C 停止。\n",
);
