const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const express = require("express");
const { KnowledgeStore } = require("../src/knowledge/store");
const { KnowledgeService } = require("../src/knowledge/service");
const { PlatformService } = require("../src/platform/service");
const { createPlatformRouter } = require("../src/platform/router");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eliangmat-platform-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new KnowledgeStore(root),
    service = new PlatformService(store, { development: true }),
    knowledge = new KnowledgeService(store, {});
  const p = service.createProject(
    "A",
    { name: "测试研究", goal: "开发高强合金，检查性能与重复性", demo: true },
    "owner",
  );
  return { root, store, service, knowledge, id: p.id };
}
function fund(service, amount = 10000) {
  const o = service.createOrder(
    "A",
    { amount, requestId: randomUUID() },
    "owner",
  );
  service.payOrder("A", o.id, "owner");
  return o;
}
test("project workflows are private by default, tenant-scoped and survive service restarts", (t) => {
  const { root, service, id } = setup(t);
  assert.equal(service.project("A", id, "owner").project.mode, "private");
  assert.throws(() => service.project("B", id, "owner"), { status: 404 });
  assert.equal(service.overview("B").projects.length, 0);
  const fresh = new PlatformService(new KnowledgeStore(root), { development: true });
  assert.equal(fresh.project("A", id, "owner").workflow.candidates.length, 3);
  assert.throws(
    () =>
      service.createProject(
        "A",
        { name: "bad", goal: "一个材料测试项目", sampleBudget: -1 },
        "owner",
      ),
    { status: 400 },
  );
});
test("task dependencies, plan revision and quality gate cannot be skipped", (t) => {
  const { service, id } = setup(t);
  assert.throws(() => service.nextPlan("A", id, "owner"), { status: 409 });
  service.taskAction("A", id, "sem", "start", "owner");
  service.taskAction("A", id, "sem", "pause", "owner");
  service.updateGoal(
    "A",
    id,
    {
      goal: "新目标要求添加缺陷计算进行筛选",
      family: "铝合金",
      targetStrength: 350,
      targetElongation: 8,
      sampleBudget: 2,
      repeats: 2,
      extraMethods: ["dft"],
    },
    "owner",
  );
  assert.throws(() => service.taskAction("A", id, "sem", "start", "owner"), {
    status: 409,
  });
  assert.throws(
    () => service.approvePlan("A", id, { confirm: true, revision: 1 }, "owner"),
    { status: 409 },
  );
  service.approvePlan("A", id, { confirm: true, revision: 2 }, "owner");
  service.review(
    "A",
    id,
    { decision: "accepted", confirm: true, note: "已核对虚构演练数据" },
    "owner",
  );
  const next = service.nextPlan("A", id, "owner", { estimatedCost: 0 });
  assert.equal(next.sampleCount, 2);
  assert.equal(next.items.length, 2);
  service.confirmNext("A", id, { planId: next.id, confirm: true }, "owner");
  service.observation(
    "A",
    id,
    {
      sampleId: "AL-017-A",
      strength: 350,
      elongation: 8,
      conditions: "室温",
      raw: "人工测试原始记录，样品 AL-017-A，测量数据需要再次复核。",
    },
    "owner",
  );
  assert.equal(service.project("A", id, "owner").workflow.quality, "pending");
  // An already materialized plan is idempotent even if newer observations arrive.
  service.confirmNext("A", id, { planId: next.id, confirm: true }, "owner");
  assert.equal(service.project("A", id, "owner").workflow.round, 3);
});
test("unconnected real tasks never report simulated execution", (t) => {
  const { service } = setup(t);
  const p = service.createProject(
    "A",
    {
      name: "真实记录",
      goal: "验证真实合金工艺与性能",
      targetStrength: 300,
      targetElongation: 8,
      sampleBudget: 6,
      testTemperature: 200,
      standard: "验收标准 v1",
      strengthDefinition: "Rp0.2",
      environment: "空气",
      repeats: 3,
      durationWeeks: 4,
    },
    "owner",
  );
  service.approvePlan("A", p.id, { revision: 1, confirm: true }, "owner");
  assert.throws(
    () => service.taskAction("A", p.id, "screen", "start", "owner"),
    { status: 409 },
  );
  assert.equal(
    service.project("A", p.id, "owner").workflow.tasks[0].status,
    "pending",
  );
  const r = service.report("A", p.id, "owner");
  assert.equal(r.hardwareExecuted, false);
  assert.equal(r.trainingSubmitted, false);
});
test("recharge is idempotent; holds use available balance; settlement releases surplus exactly once", (t) => {
  const { service, id } = setup(t);
  const order = fund(service, 1000);
  service.payOrder("A", order.id, "owner");
  assert.equal(service.overview("A").wallet.balance, 1000);
  const key = randomUUID();
  const input = { budget: 100, requestId: key };
  const run = service.usage("A", id, input, "owner");
  assert.equal(service.usage("A", id, input, "owner").id, run.id);
  assert.throws(
    () => service.usage("A", id, { ...input, budget: 200 }, "owner"),
    { status: 409 },
  );
  assert.deepEqual(service.overview("A").wallet, {
    balance: 1000,
    reserved: 100,
    available: 900,
    monthSpent: 0,
  });
  service.selectModel("A", id, { model: "lite" }, "owner");
  service.settle("A", run.id, false, "owner");
  service.settle("A", run.id, false, "owner");
  const view = service.overview("A");
  assert.equal(view.wallet.balance, 1000 - run.cost);
  assert.equal(view.wallet.reserved, 0);
  assert.equal(view.ledger.filter((l) => l.kind === "usage").length, 1);
  assert.equal(view.usage[0].model.id, "materials");
  assert.equal(run.cost, 16);
});
test("task cap, monthly cap and cancellations protect prepaid wallet", (t) => {
  const { service, id } = setup(t);
  assert.throws(
    () =>
      service.usage("A", id, { budget: 100, requestId: randomUUID() }, "owner"),
    { status: 402 },
  );
  fund(service, 1000);
  service.settings(
    "A",
    { spaceName: "测试", taskCap: 100, monthCap: 150, lowBalance: 0 },
    "owner",
  );
  assert.throws(
    () =>
      service.usage("A", id, { budget: 101, requestId: randomUUID() }, "owner"),
    { status: 400 },
  );
  const run = service.usage(
    "A",
    id,
    { budget: 100, requestId: randomUUID() },
    "owner",
  );
  assert.throws(
    () =>
      service.usage("A", id, { budget: 100, requestId: randomUUID() }, "owner"),
    { status: 402 },
  );
  service.settle("A", run.id, true, "owner");
  service.settle("A", run.id, false, "owner");
  assert.equal(service.overview("A").wallet.balance, 1000);
  assert.equal(service.overview("A").wallet.reserved, 0);
  service.usage("A", id, { budget: 100, requestId: randomUUID() }, "owner");
});
test("roles enforce finance and research boundaries at service layer", (t) => {
  const { service, id } = setup(t);
  fund(service);
  assert.throws(() => service.project("A", id, "finance"), { status: 403 });
  assert.equal(service.overview("A", "finance").projects[0].workflow, null);
  assert.throws(
    () =>
      service.createOrder(
        "A",
        { amount: 100, requestId: randomUUID() },
        "researcher",
      ),
    { status: 403 },
  );
  assert.throws(
    () =>
      service.settings(
        "A",
        { monthCap: 10, taskCap: 1, lowBalance: 0 },
        "researcher",
      ),
    { status: 403 },
  );
  assert.equal(service.overview("A", "researcher").wallet, null);
  assert.equal(service.overview("A", "researcher").orders.length, 0);
  assert.throws(
    () =>
      service.usage(
        "A",
        id,
        { budget: 100, requestId: randomUUID() },
        "finance",
      ),
    { status: 403 },
  );
});
test("external inference consent never changes training mode; revoked evidence disappears from research", (t) => {
  const { service, store, id } = setup(t);
  assert.throws(
    () => service.selectModel("A", id, { model: "reasoning" }, "owner"),
    { status: 400 },
  );
  service.selectModel(
    "A",
    id,
    { model: "reasoning", externalConsent: true },
    "owner",
  );
  assert.equal(service.project("A", id, "owner").project.mode, "private");
  store.update("A", (s) => {
    s.documents.push({
      id: "doc",
      projectId: id,
      title: "测试证据",
      kind: "paper",
      rights: { rag: true },
      contentRawHash: "original",
      evidence: [
        { id: "e1", reviewed: true, page: 1, quote: "已复核的原始摘录" },
      ],
    });
    return true;
  });
  service.syncEvidence("A", id, "owner");
  assert.equal(service.project("A", id, "owner").workflow.links.length, 1);
  store.update("A", (s) => {
    s.documents[0].rights.rag = false;
    return true;
  });
  assert.equal(service.report("A", id, "owner").workflow.links.length, 0);
});
test("HTTP router ignores body owner, requires client header and applies server identity role", async (t) => {
  const { service, id } = setup(t);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/platform",
    createPlatformRouter(service, (req, _res, next) => {
      req.knowledgeOwner = req.get("x-test-owner") || "A";
      req.platformRole = req.get("x-test-role") || "owner";
      next();
    }),
  );
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(() => server.close());
  const root = "http://127.0.0.1:" + server.address().port + "/api/platform";
  let response = await fetch(root + "/projects/" + id, {
    headers: { "x-test-role": "finance" },
  });
  assert.equal(response.status, 403);
  response = await fetch(root + "/projects/" + id, {
    headers: { "x-test-owner": "B" },
  });
  assert.equal(response.status, 404);
  response = await fetch(root + "/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: "A", amount: 100, requestId: randomUUID() }),
  });
  assert.equal(response.status, 403);
  response = await fetch(root + "/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EliangMat-Client": "knowledge-v1",
      "x-test-role": "researcher",
    },
    body: JSON.stringify({
      owner: "A",
      role: "owner",
      amount: 100,
      requestId: randomUUID(),
    }),
  });
  assert.equal(response.status, 403);
});
