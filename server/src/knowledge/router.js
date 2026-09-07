const express = require("express");
const multer = require("multer");
const { fail } = require("./store");
const { documentIn } = require("./service");
const {
  createWindowRateLimit,
  createConcurrencyLimit,
} = require("../http/request-guards");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);

function createKnowledgeRouter(
  service,
  identity,
  { development = false } = {},
) {
  if (typeof identity !== "function")
    throw new Error("Knowledge routes require verified identity middleware");
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 6 },
  });
  router.use(identity);
  router.use((req, res, next) => {
    if (!req.knowledgeOwner) return next(fail("请先登录", 401));
    res.set("Cache-Control", "no-store");
    if (
      req.method !== "GET" &&
      req.get("X-EliangMat-Client") !== "knowledge-v1"
    )
      return next(fail("无效的客户端请求", 403));
    next();
  });
  router.use(
    createWindowRateLimit({
      windowMs: 60_000,
      max: 120,
      key: (req) => req.knowledgeOwner,
    }),
  );
  router.get(
    "/",
    wrap((req, res) =>
      res.json({
        ...service.overview(req.knowledgeOwner),
        environment: development ? "development" : "pilot",
        account:
          req.platformIdentity?.displayName ||
          (development
            ? req.knowledgeOwner.endsWith("B")
              ? "客户 B"
              : "客户 A"
            : "当前账号"),
      }),
    ),
  );
  router.post(
    "/projects",
    wrap((req, res) =>
      res
        .status(201)
        .json(service.createProject(req.knowledgeOwner, req.body.name)),
    ),
  );
  router.get(
    "/projects/:project",
    wrap((req, res) =>
      res.json(service.project(req.knowledgeOwner, req.params.project)),
    ),
  );
  router.patch(
    "/projects/:project/privacy",
    wrap((req, res) =>
      res.json(
        service.setMode(
          req.knowledgeOwner,
          req.params.project,
          req.body.mode,
          req.body.consent,
        ),
      ),
    ),
  );
  router.post(
    "/projects/:project/search",
    wrap((req, res) =>
      res
        .status(202)
        .json(
          service.startSearch(req.knowledgeOwner, req.params.project, req.body),
        ),
    ),
  );
  router.post(
    "/projects/:project/import",
    upload.single("file"),
    wrap((req, res) => {
      if (req.body.storageConsent !== "true")
        throw fail("导入前需要确认拥有文件的存储和处理权限");
      if (!req.file) throw fail("请选择 JSONL 文件");
      res
        .status(202)
        .json(
          service.importFile(
            req.knowledgeOwner,
            req.params.project,
            req.file.buffer,
            req.file.originalname,
          ),
        );
    }),
  );
  router.post(
    "/projects/:project/jobs/:job/retry",
    wrap((req, res) =>
      res
        .status(202)
        .json(
          service.retry(
            req.knowledgeOwner,
            req.params.project,
            req.params.job,
            req.body.next === true,
          ),
        ),
    ),
  );
  router.get(
    "/projects/:project/documents/:document",
    wrap((req, res) =>
      res.json(
        service.detail(
          req.knowledgeOwner,
          req.params.project,
          req.params.document,
        ),
      ),
    ),
  );
  router.patch(
    "/projects/:project/documents/:document/rights",
    wrap((req, res) =>
      res.json(
        service.setRights(
          req.knowledgeOwner,
          req.params.project,
          req.params.document,
          req.body,
        ),
      ),
    ),
  );
  router.post(
    "/projects/:project/documents/:document/content",
    createConcurrencyLimit({ max: 2 }),
    upload.single("file"),
    wrap(async (req, res) => {
      if (req.body.storageConsent !== "true")
        throw fail("请确认拥有正文存储与处理权限");
      if (!req.file) throw fail("请选择正文文件");
      res.json(
        await service.uploadContent(
          req.knowledgeOwner,
          req.params.project,
          req.params.document,
          req.file.buffer,
          req.file.originalname,
        ),
      );
    }),
  );
  router.post(
    "/projects/:project/documents/:document/evidence",
    wrap((req, res) =>
      res
        .status(201)
        .json(
          service.addEvidence(
            req.knowledgeOwner,
            req.params.project,
            req.params.document,
            req.body,
          ),
        ),
    ),
  );
  router.patch(
    "/projects/:project/documents/:document/evidence/:evidence",
    wrap((req, res) =>
      res.json(
        service.review(
          req.knowledgeOwner,
          req.params.project,
          req.params.document,
          req.params.evidence,
          req.body.reviewed,
        ),
      ),
    ),
  );
  router.post(
    "/projects/:project/documents/:document/locate",
    createConcurrencyLimit({ max: 2 }),
    wrap(async (req, res) =>
      res.json(
        await service.locate(
          req.knowledgeOwner,
          req.params.project,
          req.params.document,
        ),
      ),
    ),
  );
  router.get(
    "/projects/:project/documents/:document/original/:hash",
    wrap((req, res) => {
      const d = documentIn(
        service.store.read(req.knowledgeOwner),
        req.params.project,
        req.params.document,
      );
      if (
        !d.versions.some((v) => v.rawHash === req.params.hash) &&
        d.contentRawHash !== req.params.hash
      )
        throw fail("原始文件不属于此资料", 404);
      res
        .type("application/octet-stream")
        .set(
          "Content-Disposition",
          'attachment; filename="original-' +
            req.params.hash.slice(0, 12) +
            '"',
        )
        .send(service.store.raw(req.knowledgeOwner, req.params.hash));
    }),
  );
  router.post(
    "/projects/:project/export",
    wrap((req, res) =>
      res.json(
        service.export(
          req.knowledgeOwner,
          req.params.project,
          req.body.purpose,
        ),
      ),
    ),
  );
  router.use((error, _req, res, _next) => {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : error.status || 500;
    res.status(status).json({
      error:
        status === 500 ? "数据服务出错，请查看本地日志后重试" : error.message,
    });
    if (status === 500) console.error("[knowledge]", error);
  });
  return router;
}
module.exports = { createKnowledgeRouter };
