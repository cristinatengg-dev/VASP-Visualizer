const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const express = require("express");
const { KnowledgeStore } = require("../src/knowledge/store");
const { KnowledgeService } = require("../src/knowledge/service");
const { PlatformService } = require("../src/platform/service");
const { createPlatformRouter } = require("../src/platform/router");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eliangmat-memory-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new KnowledgeStore(root),
    p = new PlatformService(store, { development: true }),
    k = new KnowledgeService(store, {});
  const id = p.createProject(
    "A",
    {
      name: "合金记忆测试",
      goal: "研发高强铝合金并检查实验重复性",
      demo: true,
    },
    "owner",
  ).id;
  return { root, store, p, k, m: p.memory, id };
}
const input = (
  title = "铍元素约束",
  content = "所有配方禁止使用铍元素，优先考虑无铍方案。",
) => ({ title, content, kind: "constraint" });
const search = (m, id, query = "铍元素") =>
  m.search("A", id, { query }, "owner");
test("customer memory is inherited by private projects, persists on restart and is independent of model/training selection", (t) => {
  const { root, p, m, id } = setup(t);
  const item = m.add("A", null, input(), "owner");
  assert.equal(
    search(m, id).records.find((r) => r.id === item.id).scope,
    "customer",
  );
  p.selectModel("A", id, { model: "lite" }, "owner");
  const fresh = new PlatformService(new KnowledgeStore(root), { development: true });
  assert.equal(
    search(fresh.memory, id).records.find((r) => r.id === item.id).content,
    item.content,
  );
  assert.equal(fresh.project("A", id, "owner").project.mode, "private");
  assert.equal(search(fresh.memory, id).trainingSubmitted, false);
});
test("same-account project memory is recalled automatically with provenance; tenants remain isolated", (t) => {
  const { p, m, id } = setup(t);
  const other = p.createProject(
    "A",
    { name: "另一个项目", goal: "研究第二种不同材料" },
    "owner",
  ).id;
  const item = m.add(
    "A",
    id,
    input("专有成分", "仅项目甲使用秘方 zirconium-unique-x17。"),
    "owner",
  );
  const ref = search(m, other, "zirconium-unique-x17").records[0];
  assert.equal(ref.id, item.id);
  assert.equal(ref.projectId, id);
  assert.equal(ref.projectName, "合金记忆测试");
  assert.equal(ref.automatic, true);
  assert.throws(() => m.view("B", id, "owner"), { status: 404 });
  assert.throws(() => m.export("B", id, "owner"), { status: 404 });
  assert.throws(
    () => m.edit("B", id, item.id, { ...input(), version: 1 }, "owner"),
    { status: 404 },
  );
});
test("correction uses optimistic versions and excludes obsolete content from new context", (t) => {
  const { m, id } = setup(t);
  const item = m.add(
    "A",
    id,
    input("热处理温度", "热处理温度为 600 °C，等待工艺验证。"),
    "owner",
  );
  m.edit(
    "A",
    id,
    item.id,
    { version: 1, content: "热处理温度改为 520 °C，等待工艺验证。" },
    "owner",
  );
  assert.throws(
    () =>
      m.edit("A", id, item.id, { version: 1, content: "旧页面覆盖" }, "owner"),
    { status: 409 },
  );
  const current = search(m, id, "热处理温度").records.find(
    (r) => r.id === item.id,
  );
  assert.match(current.content, /520/);
  // Check retrieved content, not UUIDs or timestamps that may coincidentally contain 600.
  assert.equal(current.content.includes("600"), false);
  assert.equal(
    m.versions("A", id, item.id, "owner").versions[0].content.includes("600"),
    true,
  );
});
test("assistant actually retrieves prior discussion and cites sources; it never retrieves the current question as evidence", (t) => {
  const { p, m, id } = setup(t);
  p.message(
    "A",
    id,
    "我们约定用低硅试样 QZ-731，在 460 度下进行时效处理。",
    "owner",
  );
  p.message("A", id, "上次低硅试样的时效处理温度和编号是什么？", "owner");
  const last = p.project("A", id, "owner").workflow.messages.at(-1);
  assert.ok(
    last.memoryReferences.some(
      (r) => r.available && r.content.includes("QZ-731"),
    ),
  );
  const question = "不存在的独有代号 abc987654";
  const answer = p.message("A", id, question, "owner").at(-1);
  assert.equal(answer.memoryReferences.length, 0);
  assert.match(answer.method, /未调用语言模型/);
  assert.equal(
    m.view("A", id, "owner").items.filter((r) => r.kind === "discussion")
      .length,
    3,
  );
});
test("deleting a manual memory erases its revisions and invalidates old response citations without modifying original records", (t) => {
  const { p, m, id } = setup(t);
  const item = m.add("A", id, input(), "owner");
  p.message("A", id, "之前的铍元素约束是什么", "owner");
  m.edit(
    "A",
    id,
    item.id,
    { version: 1, content: "禁用铍元素，修订后的约束说明。" },
    "owner",
  );
  m.remove("A", id, item.id, { version: 2 }, "owner");
  assert.equal(
    search(m, id).records.some((r) => r.id === item.id),
    false,
  );
  assert.throws(() => m.versions("A", id, item.id, "owner"), { status: 404 });
  const refs = p
    .project("A", id, "owner")
    .workflow.messages.at(-1).memoryReferences;
  assert.equal(refs.find((r) => r.id === item.id).available, false);
  assert.equal(
    JSON.stringify(m.export("A", id, "owner")).includes("修订后的约束说明"),
    false,
  );
});
test("disabling memory or inheritance changes subsequent context and preserves the stored records", (t) => {
  const { m, id } = setup(t);
  const item = m.add("A", null, input(), "owner");
  let view = m.view("A", id, "owner");
  m.settings(
    "A",
    id,
    { revision: view.revision, enabled: true, inheritCustomer: false },
    "owner",
  );
  assert.equal(
    search(m, id).records.some((r) => r.id === item.id),
    false,
  );
  m.add("A", id, input("局部铍约束", "该项目同样禁止铍。"), "owner");
  view = m.view("A", id, "owner");
  m.settings(
    "A",
    id,
    { revision: view.revision, enabled: false, inheritCustomer: true },
    "owner",
  );
  assert.deepEqual(search(m, id).records, []);
  assert.equal(
    m.view("A", id, "owner").items.some((r) => r.editable),
    true,
  );
});
test("auto-source suppression survives new turns and restart; original discussion remains accessible", (t) => {
  const { root, p, m, id } = setup(t);
  p.message("A", id, "独立检索代号 kappa833 的失败原因是夹具打滑。", "owner");
  const r = search(m, id, "kappa833").records[0];
  m.suppress("A", id, { id: r.id, suppressed: true }, "owner");
  const fresh = new PlatformService(new KnowledgeStore(root), { development: true });
  assert.equal(search(fresh.memory, id, "kappa833").records.length, 0);
  assert.ok(
    fresh
      .project("A", id, "owner")
      .workflow.messages.some((m) => m.text.includes("kappa833")),
  );
  fresh.memory.suppress("A", id, { id: r.id, suppressed: false }, "owner");
  assert.equal(search(fresh.memory, id, "kappa833").records.length, 1);
});
test("explicit cross-project grants resolve live source versions and respect revoke/delete/disable", (t) => {
  const { p, m, id } = setup(t);
  // Compatibility path for an account that explicitly disables automatic cross-project recall.
  const account = m.view("A", null, "owner");
  m.settings(
    "A",
    null,
    { ...account.settings, revision: account.revision, accountWide: false },
    "owner",
  );
  const other = p.createProject(
    "A",
    { name: "目标项目", goal: "研究同一客户的第二个合金" },
    "owner",
  ).id;
  const item = m.add(
    "A",
    id,
    input("加工约束", "编号 gamma981 的加工温度不得超过 400 度。"),
    "owner",
  );
  assert.equal(search(m, other, "gamma981").records.length, 0);
  assert.throws(
    () =>
      m.grant(
        "A",
        other,
        { projectId: id, itemId: item.id, confirm: true },
        "researcher",
      ),
    { status: 403 },
  );
  const grant = m.grant(
    "A",
    other,
    { projectId: id, itemId: item.id, confirm: true },
    "owner",
  );
  assert.equal(search(m, other, "gamma981").records[0].scope, "shared");
  m.edit(
    "A",
    id,
    item.id,
    { version: 1, content: "gamma981 的加工温度改为不超过 350 度。" },
    "owner",
  );
  assert.match(search(m, other, "gamma981").records[0].content, /350/);
  m.revoke("A", other, grant.id, "owner");
  assert.equal(search(m, other, "gamma981").records.length, 0);
  const again = m.grant(
    "A",
    other,
    { projectId: id, itemId: item.id, confirm: true },
    "owner",
  );
  m.remove("A", id, item.id, { version: 2 }, "owner");
  assert.equal(search(m, other, "gamma981").records.length, 0);
  assert.ok(again.id);
});
test("source evidence permission and content version are checked on every recall and historical citation", (t) => {
  const { store, p, m, id } = setup(t);
  store.update("A", (s) => {
    s.documents.push({
      id: "doc1",
      projectId: id,
      title: "可信证据 zeta700",
      rights: { rag: true },
      contentRawHash: "hash1",
      evidence: [
        {
          id: "e1",
          page: 2,
          reviewed: true,
          quote: "zeta700 原始实验记录仅用于许可范围内检索。",
        },
      ],
    });
    return true;
  });
  p.message("A", id, "查找 zeta700 的实验记录", "owner");
  assert.equal(
    p.project("A", id, "owner").workflow.messages.at(-1).memoryReferences[0]
      .available,
    true,
  );
  store.update("A", (s) => {
    s.documents[0].rights.rag = false;
    return true;
  });
  assert.equal(
    search(m, id, "zeta700").records.some((r) => r.kind === "evidence"),
    false,
  );
  assert.equal(
    p.project("A", id, "owner").workflow.messages.at(-1).memoryReferences[0]
      .available,
    false,
  );
  assert.equal(
    JSON.stringify(m.view("A", id, "owner").history).includes("原始实验记录"),
    false,
  );
});
test("goals, reviews, next plans and knowledge privacy changes retain full snapshots, including pre-memory baseline", (t) => {
  const { p, k, m, id } = setup(t);
  p.review(
    "A",
    id,
    { decision: "accepted", confirm: true, note: "已核对测试记录。" },
    "owner",
  );
  p.nextPlan("A", id, "owner");
  p.updateGoal(
    "A",
    id,
    {
      goal: "新目标要求研究耐热性能与塑性",
      family: "铝合金",
      targetStrength: 400,
      targetElongation: 9,
      sampleBudget: 3,
      extraMethods: [],
    },
    "owner",
  );
  k.setMode("A", id, "contribute", true);
  const view = m.view("A", id, "owner");
  const goal = view.history.find((h) => h.kind === "goal" && h.version === 2);
  const detail = m.history("A", id, goal.id, "owner");
  assert.equal(detail.previous.targetStrength, 350);
  assert.equal(detail.snapshot.targetStrength, 400);
  const all = m.export("A", id, "owner").history;
  assert.ok(
    all.some((h) => h.kind === "nextPlan" && h.snapshot?.items?.length),
  );
  assert.ok(
    all.some((h) => h.kind === "review" && h.snapshot.quality === "accepted"),
  );
  assert.ok(
    all.some((h) => h.kind === "privacy" && h.snapshot.mode === "private"),
  );
});
test("customer administrative history is excluded from researcher context and finance cannot read memories", (t) => {
  const { m, id } = setup(t);
  m.add("A", null, input(), "owner");
  assert.equal(m.view("A", null, "researcher").history.length, 0);
  assert.throws(() => m.historyList("A", null, {}, "researcher"), {
    status: 403,
  });
  assert.throws(() => m.view("A", id, "finance"), { status: 403 });
  assert.throws(() => m.add("A", null, input(), "researcher"), { status: 403 });
  assert.equal(
    m.search("A", id, { query: "账户余额支付" }, "researcher").records.length,
    0,
  );
  assert.ok(
    search(m, id, "账户余额支付").records.some(
      (r) => r.kind === "administrative",
    ),
  );
});
test("conversation memory is retained beyond the previous 200-message limit", (t) => {
  const { store, p, id } = setup(t);
  store.update("A", (s) => {
    const w = s.platform.workflows[id];
    w.messages = Array.from({ length: 202 }, (_, i) => ({
      id: "old" + i,
      role: "user",
      text: "旧讨论编号 " + i,
      at: new Date().toISOString(),
    }));
    return true;
  });
  p.message("A", id, "新的研究讨论继续保存", "owner");
  assert.equal(p.project("A", id, "owner").workflow.messages.length, 204);
});
test("HTTP memory endpoints apply role and tenant identity, including grant and exports", async (t) => {
  const { p, id } = setup(t),
    app = express();
  app.use(express.json());
  app.use(
    "/api/platform",
    createPlatformRouter(p, (req, _res, next) => {
      req.knowledgeOwner = req.get("x-owner") || "A";
      req.platformRole = req.get("x-role") || "owner";
      next();
    }),
  );
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => server.close());
  const base =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/platform/projects/" +
    id +
    "/memory";
  for (const suffix of ["", "/export", "/history"]) {
    const response = await fetch(base + suffix, {
      headers: { "x-owner": "B" },
    });
    assert.equal(response.status, 404);
  }
  const denied = await fetch(base, { headers: { "x-role": "finance" } });
  assert.equal(denied.status, 403);
  const created = await fetch(base + "/items", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EliangMat-Client": "knowledge-v1",
    },
    body: JSON.stringify(input()),
  });
  assert.equal(created.status, 201);
  const result = await fetch(base + "/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-EliangMat-Client": "knowledge-v1",
    },
    body: JSON.stringify({ query: "铍元素" }),
  });
  assert.equal((await result.json()).records[0].title, "铍元素约束");
});

test("repeated questions are not returned as answers and long-memory citations keep the matching passage", (t) => {
  const { p, m, id } = setup(t);
  const item = m.add(
    "A",
    id,
    input(
      "长记录",
      "背景记录。".repeat(450) + "目标代号 therm987 的工艺温度为 475 °C。",
    ),
    "owner",
  );
  p.message("A", id, "therm987 的工艺温度是多少？", "owner");
  p.message("A", id, "therm987 的工艺温度是多少？", "owner");
  const refs = p
    .project("A", id, "owner")
    .workflow.messages.at(-1).memoryReferences;
  assert.equal(refs[0].id, item.id);
  assert.match(refs[0].content, /475/);
  assert.equal(
    refs.some((r) => r.kind === "discussion"),
    false,
  );
  assert.equal(refs[0].truncated, true);
});

test("ordinary account conversation is remembered in a new conversation and another project without saving a memory item", (t) => {
  const { root, p, m, id } = setup(t);
  p.message(
    "A",
    null,
    "验收项目代号 acmem882 的报告采用结论在前、证据在后的格式。",
    "owner",
  );
  const first = p.conversation("A", "owner");
  assert.equal(first.messages.length, 2);
  assert.equal(
    m.view("A", null, "owner").items.filter((r) => r.editable).length,
    0,
  );
  p.selectConversation("A", undefined, "owner");
  assert.equal(p.conversation("A", "owner").messages.length, 0);
  const answer = p
    .message("A", null, "acmem882 的报告格式是什么？", "owner")
    .at(-1);
  assert.ok(
    answer.memoryReferences.some((r) => r.content.includes("结论在前")),
  );
  assert.equal(answer.answerMode, "recall");
  const projectAnswer = p
    .message("A", id, "acmem882 的报告格式是什么？", "owner")
    .at(-1);
  assert.ok(
    projectAnswer.memoryReferences.some(
      (r) => r.scope === "customer" && r.content.includes("结论在前"),
    ),
  );
  const fresh = new PlatformService(new KnowledgeStore(root), { development: true });
  assert.ok(
    fresh
      .conversation("A", "owner")
      .messages.at(-1)
      .memoryReferences.some((r) => r.content.includes("结论在前")),
  );
  assert.equal(fresh.conversation("B", "owner").messages.length, 0);
  assert.equal(
    fresh.memory.search("B", null, { query: "acmem882" }, "owner").records
      .length,
    0,
  );
  assert.throws(() => p.selectConversation("B", first.threadId, "owner"), {
    status: 404,
  });
  p.selectConversation("A", first.threadId, "owner");
  assert.equal(p.conversation("A", "owner").messages.length, 2);
});

test("automatic account recall covers project changes, resource configuration and permitted document pages without manual extraction", (t) => {
  const { store, p, m, id } = setup(t);
  p.resource(
    "A",
    "furnace",
    { channel: "人工执行", note: "设备代号 furnace729 的炉腔容积为 12 升。" },
    "owner",
  );
  store.update("A", (s) => {
    s.projects.push({ id: "data-only", name: "镍基文件项目", mode: "private" });
    s.documents.push({
      id: "doc-auto",
      projectId: "data-only",
      title: "自动采集测试文档",
      kind: "paper",
      rights: { rag: true },
      contentRawHash: "raw-1",
      pages: [
        { page: 1, text: "样品文档 page443 的测量温度为 23°C，未经质量复核。" },
      ],
      evidence: [],
    });
  });
  assert.ok(
    m
      .search("A", null, { query: "furnace729" }, "owner")
      .records.some((r) => r.content.includes("12 升")),
  );
  const answer = p
    .message("A", null, "page443 的测量温度是多少？", "owner")
    .at(-1);
  const ref = answer.memoryReferences.find(
    (r) => r.kind === "document-content",
  );
  assert.equal(ref.projectId, "data-only");
  assert.match(ref.content, /23°C/);
  assert.match(ref.source, /未自动视为复核结论/);
  p.updateGoal(
    "A",
    id,
    {
      goal: "研究自动同步 goal914 的屈服强度和塑性",
      family: "铝合金",
      targetStrength: 430,
      targetElongation: 9,
      sampleBudget: 2,
      extraMethods: [],
    },
    "owner",
  );
  assert.ok(
    m
      .search("A", null, { query: "goal914" }, "owner")
      .records.some((r) => r.content.includes("430")),
  );
  assert.equal(
    m.view("A", id, "owner").items.filter((r) => r.editable).length,
    0,
  );
  store.update("A", (s) => {
    s.documents[0].rights.rag = false;
  });
  assert.equal(
    p
      .conversation("A", "owner")
      .messages.at(-1)
      .memoryReferences.find((r) => r.id === ref.id).available,
    false,
  );
  assert.throws(
    () =>
      m.source(
        "A",
        null,
        { id: ref.id, projectId: ref.projectId, version: ref.version },
        "owner",
      ),
    { status: 404 },
  );
});

test("global off and project exclusion prevent subsequent recall and invalidate prior citations without deleting records", (t) => {
  const { p, m, id } = setup(t);
  p.message("A", id, "自动记忆验收 auton821 的失败原因是试样打滑。", "owner");
  const ref = p
    .message("A", null, "auton821 的失败原因是什么？", "owner")
    .at(-1).memoryReferences[0];
  let view = m.view("A", id, "owner");
  m.settings(
    "A",
    id,
    { ...view.settings, revision: view.revision, shareWithAccount: false },
    "owner",
  );
  assert.equal(
    m
      .search("A", null, { query: "auton821" }, "owner")
      .records.some((r) => r.id === ref.id),
    false,
  );
  assert.equal(
    p
      .conversation("A", "owner")
      .messages.at(-1)
      .memoryReferences.find((r) => r.id === ref.id).available,
    false,
  );
  assert.ok(search(m, id, "auton821").records.some((r) => r.id === ref.id));
  view = m.view("A", null, "owner");
  m.settings(
    "A",
    null,
    { ...view.settings, revision: view.revision, enabled: false },
    "owner",
  );
  assert.equal(search(m, id, "auton821").enabled, false);
  assert.deepEqual(search(m, id, "auton821").records, []);
  assert.ok(
    p
      .project("A", id, "owner")
      .workflow.messages.some((m) => m.text.includes("试样打滑")),
  );
});

test("owner administrative references and account conversations cannot be read via researcher role", (t) => {
  const { p, m, id } = setup(t);
  const reply = p.message("A", id, "账户余额和预算是多少？", "owner").at(-1);
  const ref = reply.memoryReferences.find((r) => r.kind === "administrative");
  assert.ok(ref);
  const researcher = p.project("A", id, "researcher").workflow.messages.at(-1);
  assert.equal(
    researcher.memoryReferences.find((r) => r.id === ref.id).available,
    false,
  );
  assert.throws(
    () =>
      m.source(
        "A",
        id,
        { id: ref.id, projectId: "", version: ref.version },
        "researcher",
      ),
    { status: 404 },
  );
  p.message("A", null, "所有者个人内部代号 owner883。", "owner");
  const thread = p.conversation("A", "owner").threadId;
  assert.equal(p.conversation("A", "researcher").messages.length, 0);
  assert.throws(() => p.selectConversation("A", thread, "researcher"), {
    status: 404,
  });
  assert.equal(
    m.search("A", null, { query: "owner883" }, "researcher").records.length,
    0,
  );
  assert.throws(() => p.conversation("A", "finance"), { status: 403 });
});

test("upgrade preserves explicit opt-outs and permits automatic recall of preexisting project discussions", (t) => {
  const { store, root, p, m, id } = setup(t);
  p.message("A", id, "旧会话 migration336 的炉温为 300 度。", "owner");
  store.update("A", (s) => {
    s.memory.version = 1;
    delete s.memory.customer.settings.accountWide;
    s.memory.projects[id].settings.enabled = false;
  });
  const fresh = new PlatformService(new KnowledgeStore(root), { development: true });
  assert.deepEqual(
    fresh.memory.search("A", null, { query: "migration336" }, "owner").records,
    [],
  );
  const v = fresh.memory.view("A", id, "owner");
  fresh.memory.settings(
    "A",
    id,
    { ...v.settings, revision: v.revision, enabled: true },
    "owner",
  );
  assert.ok(
    fresh.memory
      .search("A", null, { query: "migration336" }, "owner")
      .records.some((r) => r.content.includes("300")),
  );
  assert.equal(
    m.view("A", id, "owner").items.filter((r) => r.editable).length,
    0,
  );
});

test("specific identifiers suppress incidental matches and prior questions are not treated as answers", (t) => {
  const { p, m, id } = setup(t);
  p.message(
    "A",
    null,
    "之前我们确认 ELM-902 的测试报告顺序是先结论再证据。",
    "owner",
  );
  p.message("A", null, "测试报告顺序是什么？", "owner");
  const refs = p
    .message("A", null, "ELM-902 的测试报告顺序是什么？", "owner")
    .at(-1).memoryReferences;
  assert.equal(refs.length, 1);
  assert.match(refs[0].content, /先结论再证据/);
  assert.equal(
    m
      .search("A", null, { query: "我们有哪些设备和仿真工具？" }, "owner")
      .records.some((r) => r.kind === "administrative"),
    false,
  );
  assert.ok(
    m
      .search("A", null, { query: "我们有哪些设备和仿真工具？" }, "owner")
      .records.some((r) => r.id.startsWith("auto:resource:")),
  );
  assert.ok(
    search(m, id, "ELM-902").records.some((r) => r.content.includes("先结论")),
  );
});
