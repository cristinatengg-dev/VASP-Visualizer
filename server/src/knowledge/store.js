const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });

// Bounded, single-process pilot storage. Every mutation is synchronous and atomic;
// async connector work happens outside a transaction. Never accept filesystem paths from clients.
class KnowledgeStore {
  constructor(root) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.loaded = new Map();
  }
  directory(owner) {
    if (!owner) throw fail("请先登录", 401);
    const directory = path.join(this.root, hash(owner));
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return directory;
  }
  read(owner) {
    const view = (data) => ({
      ...structuredClone(data),
      ...(this.platformEnvironment
        ? { runtimeProfile: this.platformEnvironment }
        : {}),
    });
    if (this.loaded.has(owner)) return view(this.loaded.get(owner));
    const file = path.join(this.directory(owner), "state.json");
    const data = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8"))
      : { version: 1, projects: [], documents: [], jobs: [], audit: [] };
    if (data.version !== 1) throw fail("数据版本不兼容，请先迁移", 503);
    for (const job of data.jobs) {
      if (["queued", "running"].includes(job.status)) {
        job.status = "interrupted";
        job.error = "服务曾停止。已保存的数据仍在，可以安全重试。";
      }
    }
    for (const call of data.platform?.inferenceCalls || []) {
      if (call.status === "running") {
        call.status = "interrupted";
        call.error =
          "服务重启，本次回复未确认。供应商可能已处理请求，请核对用量后手动重试。";
      }
    }
    this.loaded.set(owner, data);
    return view(data);
  }
  update(owner, mutate) {
    const state = this.read(owner);
    const before = this.beforeWrite ? structuredClone(state) : null;
    const result = mutate(state);
    if (this.beforeWrite) this.beforeWrite(state, before, owner);
    const directory = this.directory(owner);
    const temporary = path.join(directory, "state.tmp");
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, path.join(directory, "state.json"));
    this.loaded.set(owner, state);
    return structuredClone(result);
  }
  putRaw(owner, value) {
    const buffer = Buffer.isBuffer(value)
      ? value
      : Buffer.from(JSON.stringify(value));
    const id = hash(buffer);
    const directory = path.join(this.directory(owner), "originals");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, id);
    if (!fs.existsSync(file))
      fs.writeFileSync(file, buffer, { flag: "wx", mode: 0o600 });
    return id;
  }
  raw(owner, id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw fail("文件不存在", 404);
    return fs.readFileSync(path.join(this.directory(owner), "originals", id));
  }
}
module.exports = { KnowledgeStore, hash, fail };
