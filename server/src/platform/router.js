const { replyHttp } = require("./reply-http");
const { createMemoryRouter } = require("../memory/router");
const express = require("express");
const { createWindowRateLimit } = require("../http/request-guards");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
function createPlatformRouter(service, identity) {
  const router = express.Router();
  router.use(identity);
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!req.knowledgeOwner)
      return res.status(401).json({ error: "请登录后继续" });
    if (
      req.method !== "GET" &&
      req.get("X-EliangMat-Client") !== "knowledge-v1"
    )
      return res.status(403).json({ error: "无效客户端请求" });
    next();
  });
  router.use((req, res, next) => {
    if (
      !service.development &&
      req.method !== "GET" &&
      (/^\/(orders|usage|members)(\/|$)/.test(req.path) ||
        /^\/projects\/[^/]+\/usage$/.test(req.path) ||
        (/^\/projects\/[^/]+\/tasks\/[^/]+$/.test(req.path) &&
          req.method === "POST"))
    )
      return res.status(403).json({ error: "此功能尚未开通" });
    next();
  });
  router.use(
    createWindowRateLimit({
      windowMs: 60000,
      max: 180,
      key: (req) => req.knowledgeOwner,
    }),
  );
  const role = (req) => req.platformRole || "owner";
  router.use("/memory", createMemoryRouter(service.memory));
  router.use("/projects/:id/memory", createMemoryRouter(service.memory));
  router.get(
    "/conversation",
    wrap((req, res) =>
      res.json(service.conversation(req.knowledgeOwner, role(req))),
    ),
  );
  router.post("/conversation", wrap(replyHttp(service, false)));
  router.patch(
    "/conversation/model",
    wrap((req, res) =>
      res.json(
        service.selectAssistantModel(req.knowledgeOwner, req.body, role(req)),
      ),
    ),
  );
  router.post(
    "/conversation/select",
    wrap((req, res) =>
      res.json(
        service.selectConversation(
          req.knowledgeOwner,
          req.body.threadId,
          role(req),
        ),
      ),
    ),
  );
  router.get(
    "/",
    wrap((req, res) =>
      res.json({
        ...service.overview(req.knowledgeOwner, role(req)),
        ...(req.platformIdentity
          ? {
              account: req.platformIdentity.displayName,
              identity: req.platformIdentity,
            }
          : {}),
      }),
    ),
  );
  router.post(
    "/projects",
    wrap((req, res) =>
      res
        .status(201)
        .json(service.createProject(req.knowledgeOwner, req.body, role(req))),
    ),
  );
  router.get(
    "/projects/:id",
    wrap((req, res) =>
      res.json(service.project(req.knowledgeOwner, req.params.id, role(req))),
    ),
  );
  router.post(
    "/projects/:id/initialize",
    wrap((req, res) =>
      res.json(
        service.attachWorkflow(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.patch(
    "/projects/:id/goal",
    wrap((req, res) =>
      res.json(
        service.updateGoal(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/approve",
    wrap((req, res) =>
      res.json(
        service.approvePlan(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/tasks/:task",
    wrap((req, res) =>
      res.json(
        service.taskAction(
          req.knowledgeOwner,
          req.params.id,
          req.params.task,
          req.body.action,
          role(req),
        ),
      ),
    ),
  );
  router.patch(
    "/projects/:id/tasks/:task",
    wrap((req, res) =>
      res.json(
        service.configureTask(
          req.knowledgeOwner,
          req.params.id,
          req.params.task,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/tasks/:task/execute",
    wrap((req, res) =>
      res.json(
        service.executeTask(
          req.knowledgeOwner,
          req.params.id,
          req.params.task,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.patch(
    "/projects/:id/samples/:sample",
    wrap((req, res) =>
      res.json(
        service.editSample(
          req.knowledgeOwner,
          req.params.id,
          req.params.sample,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/requirements/preview",
    wrap((req, res) =>
      res.json(require("./research-domain").requirements(req.body)),
    ),
  );
  router.post(
    "/projects/:id/review",
    wrap((req, res) =>
      res.json(
        service.review(req.knowledgeOwner, req.params.id, req.body, role(req)),
      ),
    ),
  );
  router.post(
    "/projects/:id/next-plan",
    wrap((req, res) =>
      res.json(
        service.nextPlan(
          req.knowledgeOwner,
          req.params.id,
          role(req),
          req.body,
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/next-plan/approve",
    wrap((req, res) =>
      res.json(
        service.confirmNext(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/candidates",
    wrap((req, res) =>
      res.json(
        service.addCandidate(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.patch(
    "/projects/:id/candidates/:candidate",
    wrap((req, res) =>
      res.json(
        req.body.selected !== undefined
          ? service.selectCandidate(
              req.knowledgeOwner,
              req.params.id,
              req.params.candidate,
              req.body.selected,
              role(req),
            )
          : service.editCandidate(
              req.knowledgeOwner,
              req.params.id,
              req.params.candidate,
              req.body,
              role(req),
            ),
      ),
    ),
  );
  router.post(
    "/projects/:id/samples",
    wrap((req, res) =>
      res.json(
        service.addSample(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/observations",
    wrap((req, res) =>
      res.json(
        service.observation(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/evidence",
    wrap((req, res) =>
      res.json(
        service.syncEvidence(req.knowledgeOwner, req.params.id, role(req)),
      ),
    ),
  );
  router.post("/projects/:id/messages", wrap(replyHttp(service, true)));
  router.patch(
    "/projects/:id/model",
    wrap((req, res) =>
      res.json(
        service.selectModel(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/projects/:id/usage",
    wrap((req, res) =>
      res.json(
        service.usage(req.knowledgeOwner, req.params.id, req.body, role(req)),
      ),
    ),
  );
  router.get(
    "/projects/:id/report",
    wrap((req, res) =>
      res.json(service.report(req.knowledgeOwner, req.params.id, role(req))),
    ),
  );
  router.patch(
    "/defaults",
    wrap((req, res) =>
      res.json(service.defaults(req.knowledgeOwner, req.body, role(req))),
    ),
  );
  router.patch(
    "/settings",
    wrap((req, res) =>
      res.json(service.settings(req.knowledgeOwner, req.body, role(req))),
    ),
  );
  router.post(
    "/orders",
    wrap((req, res) =>
      res
        .status(201)
        .json(service.createOrder(req.knowledgeOwner, req.body, role(req))),
    ),
  );
  router.post(
    "/orders/:id/pay-test",
    wrap((req, res) =>
      res.json(service.payOrder(req.knowledgeOwner, req.params.id, role(req))),
    ),
  );
  router.post(
    "/orders/:id/cancel",
    wrap((req, res) =>
      res.json(
        service.cancelOrder(req.knowledgeOwner, req.params.id, role(req)),
      ),
    ),
  );
  router.post(
    "/usage/:id/settle",
    wrap((req, res) =>
      res.json(
        service.settle(
          req.knowledgeOwner,
          req.params.id,
          req.body.cancel === true,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/members",
    wrap((req, res) =>
      res
        .status(201)
        .json(service.member(req.knowledgeOwner, req.body, role(req))),
    ),
  );
  router.delete(
    "/members/:id",
    wrap((req, res) =>
      res.json(
        service.removeMember(req.knowledgeOwner, req.params.id, role(req)),
      ),
    ),
  );
  router.patch(
    "/resources/:id",
    wrap((req, res) =>
      res.json(
        service.resource(
          req.knowledgeOwner,
          req.params.id,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.use((error, _req, res, _next) => {
    if (!error.status) console.error("[platform]", error);
    res.status(error.status || 500).json({
      error: error.status ? error.message : "服务暂不可用，请稍后重试",
    });
  });
  return router;
}
module.exports = { createPlatformRouter };
