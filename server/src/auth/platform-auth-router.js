const express = require("express");
const { createWindowRateLimit } = require("../http/request-guards");
const { SESSION_TTL } = require("./platform-auth");
const COOKIE = "eliangmat_session";
const tokenFrom = (req) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1) || "";
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
function createPlatformAuthRouter(auth, { secure = false } = {}) {
  const router = express.Router();
  const cookie = {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/api",
    maxAge: SESSION_TTL,
  };
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      req.method !== "GET" &&
      req.get("X-EliangMat-Client") !== "knowledge-v1"
    )
      return res.status(403).json({ error: "无效客户端请求" });
    next();
  });
  const issue = (req, res, token) => {
    res.cookie(COOKIE, token, cookie);
    // Retire the old development cookies so only one identity source remains active.
    for (const old of ["eliangmat_knowledge_dev", "eliangmat_platform_role"])
      res.clearCookie(old, { path: "/api" });
    res.json(auth.publicSession(token));
  };
  router.get("/session", (req, res) =>
    res.json(auth.publicSession(tokenFrom(req))),
  );
  router.post(
    "/send-phone-code",
    createWindowRateLimit({ windowMs: 600_000, max: 10 }),
    wrap(async (req, res) => res.json(await auth.sendCode(req.body.phone))),
  );
  router.post(
    "/login",
    createWindowRateLimit({ windowMs: 600_000, max: 30 }),
    wrap((req, res) =>
      issue(
        req,
        res,
        auth.login(req.body.phone, req.body.code, tokenFrom(req)),
      ),
    ),
  );
  router.post(
    "/logout",
    wrap((req, res) => {
      auth.logout(tokenFrom(req));
      res.clearCookie(COOKIE, {
        httpOnly: true,
        sameSite: "strict",
        secure,
        path: "/api",
      });
      res.json({ success: true });
    }),
  );
  router.post(
    "/development-login",
    createWindowRateLimit({ windowMs: 60_000, max: 30 }),
    wrap((req, res) =>
      issue(req, res, auth.demoLogin(req.body.account, tokenFrom(req))),
    ),
  );
  router.post(
    "/development-role",
    wrap((req, res) =>
      res.json(auth.setDemoRole(tokenFrom(req), req.body.role)),
    ),
  );
  router.use((e, _req, res, _next) => {
    if (e.retryAfter) res.set("Retry-After", String(e.retryAfter));
    res
      .status(e.status || 500)
      .json({
        error: e.status ? e.message : "登录服务暂不可用，请稍后重试。",
        retryAfter: e.retryAfter,
      });
  });
  return router;
}
function platformIdentity(auth) {
  return (req, res, next) => {
    const identity = auth.session(tokenFrom(req));
    if (!identity) return res.status(401).json({ error: "请登录后继续。" });
    req.knowledgeOwner = identity.ownerKey;
    req.platformRole = identity.role;
    req.platformIdentity = auth.publicSession(tokenFrom(req)).identity;
    next();
  };
}
module.exports = { createPlatformAuthRouter, platformIdentity, tokenFrom };
