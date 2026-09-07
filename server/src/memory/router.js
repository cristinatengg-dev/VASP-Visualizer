const express = require("express");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
function createMemoryRouter(service) {
  const router = express.Router({ mergeParams: true });
  const id = (req) => req.params.id || null,
    role = (req) => req.platformRole || "owner";
  router.get(
    "/source",
    wrap((req, res) =>
      res.json(
        service.source(req.knowledgeOwner, id(req), req.query, role(req)),
      ),
    ),
  );
  router.get(
    "/",
    wrap((req, res) =>
      res.json(service.view(req.knowledgeOwner, id(req), role(req))),
    ),
  );
  router.post(
    "/items",
    wrap((req, res) =>
      res
        .status(201)
        .json(service.add(req.knowledgeOwner, id(req), req.body, role(req))),
    ),
  );
  router.patch(
    "/items/:item",
    wrap((req, res) =>
      res.json(
        service.edit(
          req.knowledgeOwner,
          id(req),
          req.params.item,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.delete(
    "/items/:item",
    wrap((req, res) =>
      res.json(
        service.remove(
          req.knowledgeOwner,
          id(req),
          req.params.item,
          req.body,
          role(req),
        ),
      ),
    ),
  );
  router.get(
    "/items/:item/versions",
    wrap((req, res) =>
      res.json(
        service.versions(
          req.knowledgeOwner,
          id(req),
          req.params.item,
          role(req),
        ),
      ),
    ),
  );
  router.patch(
    "/sources",
    wrap((req, res) =>
      res.json(
        service.suppress(req.knowledgeOwner, id(req), req.body, role(req)),
      ),
    ),
  );
  router.patch(
    "/settings",
    wrap((req, res) =>
      res.json(
        service.settings(req.knowledgeOwner, id(req), req.body, role(req)),
      ),
    ),
  );
  router.post(
    "/search",
    wrap((req, res) =>
      res.json(
        service.search(req.knowledgeOwner, id(req), req.body, role(req)),
      ),
    ),
  );
  router.get(
    "/history",
    wrap((req, res) =>
      res.json(
        service.historyList(req.knowledgeOwner, id(req), req.query, role(req)),
      ),
    ),
  );
  router.get(
    "/history/:history",
    wrap((req, res) =>
      res.json(
        service.history(
          req.knowledgeOwner,
          id(req),
          req.params.history,
          role(req),
        ),
      ),
    ),
  );
  router.post(
    "/grants",
    wrap((req, res) =>
      res.json(service.grant(req.knowledgeOwner, id(req), req.body, role(req))),
    ),
  );
  router.delete(
    "/grants/:grant",
    wrap((req, res) =>
      res.json(
        service.revoke(
          req.knowledgeOwner,
          id(req),
          req.params.grant,
          role(req),
        ),
      ),
    ),
  );
  router.get(
    "/export",
    wrap((req, res) =>
      res.json(service.export(req.knowledgeOwner, id(req), role(req))),
    ),
  );
  return router;
}
module.exports = { createMemoryRouter };
