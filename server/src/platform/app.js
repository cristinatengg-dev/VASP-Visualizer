const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { KnowledgeStore } = require("../knowledge/store");
const { KnowledgeService } = require("../knowledge/service");
const { createKnowledgeRouter } = require("../knowledge/router");
const { PlatformService } = require("./service");
const { createPlatformRouter } = require("./router");
const {
  createPlatformAuthRouter,
  platformIdentity,
} = require("../auth/platform-auth-router");

// Serves the built product and authenticated APIs from one origin. No Vite or fixtures.
function createProductApp({
  auth,
  root,
  gateway,
  env = {},
  origins,
  dist,
  secure = true,
  smsReady = false,
}) {
  if (auth.development)
    throw new Error("Product authentication must disable development access");
  const allowed = new Set(origins);
  if (!allowed.size) throw new Error("Explicit application origins required");
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const origin = req.get("origin");
    const hostAllowed = [...allowed].some(
      (o) => new URL(o).host === req.get("host"),
    );
    if (!hostAllowed || (origin && !allowed.has(origin)))
      return res.status(403).json({ error: "无效请求来源" });
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "eliangmat-platform" }),
  );
  app.use(express.json({ limit: "512kb" }));
  app.use(
    "/api/auth",
    (req, res, next) => {
      if (req.path.startsWith("/development-"))
        return res.status(404).json({ error: "接口不存在" });
      if (!smsReady && ["/send-phone-code", "/login"].includes(req.path))
        return res
          .status(503)
          .json({ error: "短信登录暂不可用，请稍后重试或联系管理员" });
      next();
    },
    createPlatformAuthRouter(auth, { secure }),
  );
  const identity = platformIdentity(auth);
  const knowledge = new KnowledgeService(new KnowledgeStore(root), env);
  const platform = new PlatformService(knowledge.store, {
    gateway,
    development: false,
  });
  app.use("/api/platform", createPlatformRouter(platform, identity));
  app.use(
    "/api/knowledge",
    createKnowledgeRouter(knowledge, (req, res, next) =>
      identity(req, res, () => {
        if (req.platformRole === "finance")
          return res.status(403).json({ error: "当前角色无法访问研发资料" });
        if (
          req.platformRole !== "owner" &&
          /\/(privacy|rights)$/.test(req.path) &&
          req.method !== "GET"
        )
          return res.status(403).json({ error: "用途授权需要所有者角色" });
        next();
      }),
    ),
  );
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  if (dist) {
    if (!fs.existsSync(path.join(dist, "index.html")))
      throw new Error("Build the frontend before starting the product");
    app.use(
      express.static(dist, {
        index: false,
        dotfiles: "deny",
        setHeaders(res, file) {
          res.set(
            "Cache-Control",
            file.includes(path.sep + "assets" + path.sep)
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          );
        },
      }),
    );
    app.get("*", (req, res) => {
      if (path.extname(req.path)) return res.status(404).end();
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(dist, "index.html"));
    });
  }
  app.use((error, _req, res, _next) => {
    console.error("[platform]", error.message);
    res.status(error.status || 500).json({ error: "服务暂不可用，请稍后重试" });
  });
  return { app, platform, knowledge };
}
module.exports = { createProductApp };
