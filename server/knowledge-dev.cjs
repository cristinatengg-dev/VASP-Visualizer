// Isolated development runtime. Does not import index.js or server/.env.
// SMS is local by default; optional dedicated configuration reuses the verified SMS adapter.
const path = require("node:path");
const fs = require("node:fs");
const { PlatformAuth } = require("./src/auth/platform-auth");
const {
  createPlatformAuthRouter,
  platformIdentity,
  tokenFrom,
} = require("./src/auth/platform-auth-router");
const { getSmsConfig, sendLoginCode } = require("./src/auth/sms-service");
const express = require("express");
const { KnowledgeStore } = require("./src/knowledge/store");
const { KnowledgeService } = require("./src/knowledge/service");
const { createKnowledgeRouter } = require("./src/knowledge/router");
const { PlatformService } = require("./src/platform/service");
const { createGeminiGateway } = require("./src/platform/model-gateway");
const modelConfigFile = path.join(__dirname, "../.dev/model.env");
const modelConfig = fs.existsSync(modelConfigFile)
  ? require("dotenv").parse(fs.readFileSync(modelConfigFile))
  : {};
const gateway = createGeminiGateway(
  Object.fromEntries(
    ["GEMINI_BASE_URL", "GEMINI_API_KEY", "GEMINI_TEXT_MODEL"].map((k) => [
      k,
      modelConfig[k] || "",
    ]),
  ),
);
const { createPlatformRouter } = require("./src/platform/router");
const configFile = path.join(__dirname, "../.dev/knowledge.env");
const parsed = fs.existsSync(configFile)
  ? require("dotenv").parse(fs.readFileSync(configFile))
  : {};
// Allowlist config: cannot accidentally load payment, compute or production auth settings.
const env = Object.fromEntries(
  ["OPENALEX_API_KEY", "CROSSREF_EMAIL", "UNPAYWALL_EMAIL"].map((k) => [
    k,
    parsed[k] || "",
  ]),
);
const app = express();
const authConfigFile = path.join(__dirname, "../.dev/phone-auth.env");
const authEnv = fs.existsSync(authConfigFile)
  ? require("dotenv").parse(fs.readFileSync(authConfigFile))
  : {};
const smsMode = authEnv.ELIANGMAT_SMS_MODE || "local";
const smsConfig = getSmsConfig(authEnv);
if (
  smsMode === "tencent" &&
  ["secretId", "secretKey", "sdkAppId", "signName", "templateId"].some(
    (k) => !smsConfig[k],
  )
)
  throw new Error("独立短信配置不完整，请检查 .dev/phone-auth.env");
const auth = new PlatformAuth(path.join(__dirname, "../.dev/platform-auth"), {
  mode: smsMode,
  development: true,
  deliver: (phone, code) => sendLoginCode(phone, code, { config: smsConfig }),
});
const identity = platformIdentity(auth);
const allowedHosts = new Set([
  "127.0.0.1:4317",
  "localhost:4317",
  "127.0.0.1:4318",
  "localhost:4318",
]);
app.use((req, res, next) => {
  if (!allowedHosts.has(req.get("host")))
    return res.status(403).json({ error: "开发服务仅支持本机访问" });
  if (req.get("origin")) {
    try {
      if (!allowedHosts.has(new URL(req.get("origin")).host)) throw new Error();
    } catch {
      return res.status(403).json({ error: "拒绝跨站开发请求" });
    }
  }
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "512kb" }));
app.get("/api/knowledge-dev/health", (_req, res) =>
  res.json({
    ok: true,
    service: "eliangmat-knowledge-dev",
    productionConnected: false,
    version: 1,
  }),
);
app.get("/api/knowledge-dev/sample", (_req, res) =>
  res.download(
    path.join(__dirname, "fixtures/knowledge/sample.jsonl"),
    "EliangMat_AI_test_sample.jsonl",
  ),
);
app.get("/api/knowledge-dev/curve", (_req, res) =>
  res.download(
    path.join(__dirname, "fixtures/research/FICTIONAL_SOFTWARE_TEST_curve.csv"),
  ),
);
app.use("/api/auth", createPlatformAuthRouter(auth));
const dataRoot = path.join(__dirname, "../.dev/knowledge-data");
const service = new KnowledgeService(new KnowledgeStore(dataRoot), env);
app.use(
  "/api/platform",
  createPlatformRouter(
    new PlatformService(service.store, { gateway, development: true }),
    identity,
  ),
);
app.use(
  "/api/knowledge",
  createKnowledgeRouter(
    service,
    (req, res, next) =>
      identity(req, res, () => {
        if (req.platformRole === "finance")
          return res
            .status(403)
            .json({ error: "财务测试角色不能访问研发资料" });
        if (
          req.platformRole !== "owner" &&
          /\/(privacy|rights)$/.test(req.path) &&
          req.method !== "GET"
        )
          return res.status(403).json({ error: "用途授权需要所有者角色" });
        next();
      }),
    { development: true },
  ),
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "当前为平台开发环境，此接口尚未接通" }),
);
const server = app.listen(4318, "127.0.0.1", () =>
  console.log(
    "EliangMat AI data API: http://127.0.0.1:4318 (isolated development)",
  ),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
