const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { KnowledgeStore } = require("../src/knowledge/store");
const { PlatformService } = require("../src/platform/service");
const { KnowledgeService } = require("../src/knowledge/service");
const domain = require("../src/platform/research-domain");
const { analyzeCurve, rawArtifact } = require("../src/platform/task-execution");
const {
  normalizeCrossref,
  searchSource,
} = require("../src/knowledge/connectors");
const target = {
  goal: "200°C 下屈服强度至少 300 MPa，延伸率至少 8%，最多6个样品，周期4周",
  family: "Al-Cu-Mg",
  targetStrength: 300,
  targetElongation: 8,
  sampleBudget: 6,
  testTemperature: 200,
  standard: "TEST v1",
  environment: "空气",
  strengthDefinition: "Rp0.2",
  repeats: 2,
  durationWeeks: 4,
};
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eliangmat-domain-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new KnowledgeStore(root),
    svc = new PlatformService(store, { development: true }),
    id = svc.createProject(
      "A",
      { name: "AUD-906 regression", ...target },
      "owner",
    ).id;
  return { store, svc, id, root };
}
function candidate(svc, id) {
  return svc.addCandidate(
    "A",
    id,
    {
      composition: "Al 94 / Cu 4 / Mg 2",
      basis: "wt%",
      process: "P1 虚构工艺，不作为实验依据",
    },
    "owner",
  );
}
function sample(svc, id, c) {
  return svc.addSample(
    "A",
    id,
    { id: "S1", candidate: c.id, batch: "B1", process: c.process },
    "owner",
  );
}
function observation(svc, id, overrides = {}) {
  return svc.observation(
    "A",
    id,
    {
      sampleId: "S1",
      strength: 315,
      elongation: 9,
      conditions: "虚构软件回归条件",
      raw: "虚构回归记录，无实际实验，不允许用作材料研发或训练依据。",
      temperature: 200,
      standard: "TEST v1",
      environment: "空气",
      strengthDefinition: "Rp0.2",
      strainRate: 0.001,
      dimensions: "直径5mm 标距25mm",
      specimenId: "T1",
      artifact: {
        name: "fixture.txt",
        content: "fictional original test record",
      },
      ...overrides,
    },
    "owner",
  );
}
function review(svc, id, r, decision = "accepted") {
  return svc.review(
    "A",
    id,
    {
      observationId: r.id,
      decision,
      confirm: true,
      note: "仅软件回归，不用于科学结论",
    },
    "owner",
  );
}
test("requirements preserve extracted values, never insert silent defaults, and block conflicting or incomplete approval", (t) => {
  const { svc, id } = setup(t);
  const p = svc.createProject(
    "A",
    { name: "from text", goal: target.goal },
    "owner",
  );
  const w = svc.project("A", p.id, "owner").workflow;
  assert.equal(w.targetStrength, 300);
  assert.equal(w.testTemperature, 200);
  assert.equal(w.targetElongation, 8);
  assert.equal(w.durationWeeks, 4);
  assert.match(w.tasks.find((t) => t.id === "tensile").name, /200/);
  assert.throws(
    () => svc.approvePlan("A", p.id, { confirm: true, revision: 1 }, "owner"),
    /测试标准/,
  );
  svc.updateGoal("A", id, { ...target, targetStrength: 350 }, "owner");
  assert.throws(
    () => svc.approvePlan("A", id, { confirm: true, revision: 2 }, "owner"),
    /不一致/,
  );
  svc.updateGoal("A", id, { ...target, testTemperature: "" }, "owner");
  assert.throws(
    () => svc.approvePlan("A", id, { confirm: true, revision: 3 }, "owner"),
    /温度/,
  );
  assert.equal(svc.project("A", id, "owner").workflow.goalHistory.length, 2);
});
test("composition rejects 115%, duplicates, negative values, invalid elements and ambiguous balance; ranges cannot execute", (t) => {
  const { svc, id } = setup(t);
  for (const text of [
    "Al 90 / Cu 20 / Mg 5",
    "Al 94 / Al 6",
    "Al 101 / Cu -1",
    "Xx 100",
    "Al 余量 / Cu 余量",
    "Al 90",
  ])
    assert.equal(domain.composition(text, "wt%").valid, false, text);
  assert.throws(
    () =>
      svc.addCandidate(
        "A",
        id,
        { composition: "Al 90 / Cu 20 / Mg 5", basis: "wt%" },
        "owner",
      ),
    /超过/,
  );
  const c = svc.addCandidate(
    "A",
    id,
    { composition: "Al 余量 / Cu 3–5", basis: "wt%" },
    "owner",
  );
  assert.throws(() => sample(svc, id, c), /具体配比/);
  assert.throws(
    () => svc.selectCandidate("A", id, c.id, true, "owner"),
    /具体配比/,
  );
  assert.equal(
    domain.composition("Al 余量 / Cu 4 / Mg 2", "at%").parts[0].min,
    94,
  );
});
test("candidate/sample edits retain immutable measurement snapshots and enforce optimistic versions", (t) => {
  const { svc, id } = setup(t),
    c = candidate(svc, id);
  sample(svc, id, c);
  const r = observation(svc, id);
  svc.editCandidate(
    "A",
    id,
    c.id,
    {
      version: 1,
      composition: "Al 93 / Cu 5 / Mg 2",
      basis: "wt%",
      process: "P2 虚构",
    },
    "owner",
  );
  assert.throws(
    () =>
      svc.editCandidate(
        "A",
        id,
        c.id,
        { version: 1, composition: "Al 100", basis: "wt%" },
        "owner",
      ),
    /已修改/,
  );
  svc.editSample(
    "A",
    id,
    "S1",
    { version: 1, candidate: c.id, batch: "B2", process: "P2" },
    "owner",
  );
  const w = svc.project("A", id, "owner").workflow;
  assert.equal(w.samples[0].candidateVersion, 2);
  assert.equal(
    w.observations[0].sampleSnapshot.candidateSnapshot.composition,
    c.composition,
  );
  assert.equal(r.sampleSnapshot.batch, "B1");
});
test("pending/excluded/mismatched observations never count; independent specimens group with sample standard deviation", (t) => {
  const { svc, id } = setup(t);
  sample(svc, id, candidate(svc, id));
  const r = observation(svc, id, { temperature: 25 });
  assert.equal(
    svc.project("A", id, "owner").workflow.assessment.status,
    "undetermined",
  );
  review(svc, id, r);
  assert.match(
    svc.project("A", id, "owner").workflow.assessment.reasons.join(),
    /工况不符/,
  );
  review(svc, id, r, "excluded");
  assert.equal(
    svc.project("A", id, "owner").workflow.assessment.status,
    "excluded",
  );
  assert.equal(svc.project("A", id, "owner").workflow.datasets.length, 0);
  const r1 = observation(svc, id);
  review(svc, id, r1);
  const duplicate = observation(svc, id, { strength: 310 });
  review(svc, id, duplicate);
  let w = svc.project("A", id, "owner").workflow;
  assert.equal(w.datasets[0].n, 1);
  assert.match(w.datasets[0].label, /重复数不足/);
  assert.equal(w.tasks.find((t) => t.id === "tensile").status, "pending");
  const r2 = observation(svc, id, { specimenId: "T2", strength: 320 });
  review(svc, id, r2);
  w = svc.project("A", id, "owner").workflow;
  assert.equal(w.datasets[0].n, 2);
  assert.equal(w.datasets[0].strength.mean, 315);
  assert.ok(Math.abs(w.datasets[0].strength.sd - Math.sqrt(50)) < 1e-10);
  svc.updateGoal(
    "A",
    id,
    { ...target, goal: target.goal.replace("300", "330"), targetStrength: 330 },
    "owner",
  );
  assert.equal(svc.project("A", id, "owner").workflow.datasets.length, 0);
});
test("next-round confirmation materializes versioned samples and tasks exactly once and preserves prior evidence", (t) => {
  const { svc, id } = setup(t),
    c = candidate(svc, id);
  sample(svc, id, c);
  svc.approvePlan("A", id, { revision: 1, confirm: true }, "owner");
  const r = observation(svc, id);
  review(svc, id, r);
  const plan = svc.nextPlan("A", id, "owner", {
    estimatedCost: 120,
    variable: "时效时间",
    variableValue: "2 h（虚构）",
  });
  assert.equal(plan.rows.length, 3);
  assert.equal(plan.rows[0].temperature, 200);
  svc.confirmNext("A", id, { planId: plan.id, confirm: true }, "owner");
  svc.confirmNext("A", id, { planId: plan.id, confirm: true }, "owner");
  const w = svc.project("A", id, "owner").workflow;
  assert.equal(w.round, 2);
  assert.equal(w.samples.length, 4);
  assert.equal(w.roundHistory[0].result.id, r.id);
  assert.equal(w.observations.length, 1);
  assert.equal(w.result, null);
  assert.equal(w.tasks.find((t) => t.id === "tensile").status, "pending");
});
const contract = {
  execution: "manual",
  inputs: "样品及版本 P1",
  outputs: "实验履历和原始文件",
  methodVersion: "TEST v1",
  resource: "虚构资源 R1",
  assignee: "回归测试执行人",
  dueAt: "2026-10-01T12:00",
  estimatedCost: 0,
  acceptance: "检查原始记录，禁止科研用途",
  dependencies: [],
};
test("manual task requires approval, returns immutable raw evidence and only completes after acceptance; dependencies are version-linked", (t) => {
  const { svc, id } = setup(t);
  svc.configureTask("A", id, "screen", contract, "owner");
  assert.throws(
    () => svc.executeTask("A", id, "screen", { action: "submit" }, "owner"),
    /确认/,
  );
  svc.approvePlan("A", id, { confirm: true, revision: 2 }, "owner");
  svc.executeTask("A", id, "screen", { action: "submit" }, "owner");
  svc.executeTask(
    "A",
    id,
    "screen",
    {
      action: "return",
      artifact: {
        name: "result.txt",
        content: "fictional result only",
        encoding: "text",
      },
      summary: "仅用于软件验证的回传",
    },
    "owner",
  );
  assert.equal(
    svc.project("A", id, "owner").workflow.tasks[0].status,
    "waiting",
  );
  svc.executeTask(
    "A",
    id,
    "screen",
    { action: "accept", confirm: true, note: "回归验收通过" },
    "owner",
  );
  svc.configureTask(
    "A",
    id,
    "prepare",
    { ...contract, dependencies: ["screen"] },
    "owner",
  );
  svc.approvePlan("A", id, { revision: 3, confirm: true }, "owner");
  const tsk = svc.executeTask(
    "A",
    id,
    "prepare",
    { action: "submit" },
    "owner",
  );
  assert.equal(tsk.runs[0].inputs[0].outputVersion, 1);
  assert.ok(tsk.runs[0].inputs[0].runId);
  assert.throws(
    () =>
      svc.executeTask(
        "B",
        id,
        "prepare",
        { action: "cancel", note: "no access" },
        "owner",
      ),
    { status: 404 },
  );
  assert.throws(() => svc.configureTask("A", id, "dft", contract, "finance"), {
    status: 403,
  });
});
test("CSV adapter actually calculates defined quantities, records failures and supports retry without faking yield strength", (t) => {
  const result = analyzeCurve(
    rawArtifact({
      name: "curve.csv",
      content: "strain,stress_mpa\n0,0\n0.01,100\n0.02,200",
      encoding: "text",
    }),
  );
  assert.equal(result.peakStressMPa, 200);
  assert.equal(result.integralMJm3, 2);
  assert.equal(result.strength, undefined);
  const { svc, id } = setup(t);
  svc.configureTask(
    "A",
    id,
    "tensile",
    { ...contract, execution: "curve-csv" },
    "owner",
  );
  svc.approvePlan("A", id, { confirm: true, revision: 2 }, "owner");
  let task = svc.executeTask(
    "A",
    id,
    "tensile",
    { action: "submit", artifact: { name: "bad.csv", content: "invalid csv" } },
    "owner",
  );
  assert.equal(task.status, "failed");
  task = svc.executeTask(
    "A",
    id,
    "tensile",
    {
      action: "submit",
      artifact: {
        name: "curve.csv",
        content: "strain,stress_mpa\n0,0\n0.01,100\n0.02,200",
      },
    },
    "owner",
  );
  assert.equal(task.status, "waiting");
  assert.equal(task.runs.length, 2);
  assert.equal(task.runs[1].output.peakStressMPa, 200);
  assert.throws(
    () =>
      analyzeCurve(
        rawArtifact({
          name: "curve.csv",
          content: "strain,stress_mpa\n0,0\n0.02,100\n0.01,200",
        }),
      ),
    /严格递增/,
  );
});
test("defaults apply only to future projects and do not grant document rights; compound recall respects suppression", (t) => {
  const { svc, id, store } = setup(t);
  svc.defaults(
    "A",
    { mode: "contribute", model: "lite", consent: true },
    "owner",
  );
  const next = svc.createProject(
    "A",
    { name: "new defaults", ...target },
    "owner",
  );
  assert.equal(next.mode, "contribute");
  assert.equal(svc.project("A", id, "owner").project.mode, "private");
  assert.equal(svc.overview("A").projectModels[next.id], "lite");
  assert.equal(svc.overview("B").defaults.mode, "private");
  sample(svc, id, candidate(svc, id));
  review(svc, id, observation(svc, id));
  const answer = svc
    .message("A", null, "AUD-906 目标工况强度和结果是否达标？", "owner")
    .at(-1);
  assert.equal(answer.answerMode, "facts");
  assert.ok(answer.memoryReferences.some((r) => r.id === "auto:goal"));
  assert.ok(answer.memoryReferences.some((r) => r.id === "auto:result"));
  svc.memory.settings(
    "A",
    null,
    {
      enabled: false,
      inheritCustomer: true,
      revision: svc.memory.view("A", null, "owner").revision,
    },
    "owner",
  );
  const off = svc
    .message("A", null, "AUD-906 的结果是否达标？", "owner")
    .at(-1);
  assert.equal(off.memoryReferences.length, 0);
  assert.equal(store.read("A").documents.length, 0);
});
test("search marks peer-review records and combines publication/type filters without replacing incremental indexing date", async () => {
  const review = normalizeCrossref({
    DOI: "10.1234/x/v1/review1",
    title: ["Review for alloy"],
    type: "peer-review",
  });
  assert.equal(review.documentType, "peer-review");
  let called;
  await searchSource(
    "crossref",
    {
      query: "Al Cu Mg",
      limit: 5,
      since: "2026-01-01",
      yearFrom: "2020",
      yearTo: "2025",
      documentType: "journal-article",
    },
    {},
    {
      fetcher: async (url) => {
        called = String(url);
        return new Response(
          JSON.stringify({ message: { items: [], "total-results": 0 } }),
          { status: 200 },
        );
      },
    },
  );
  const filter = new URL(called).searchParams.get("filter");
  assert.match(filter, /type:journal-article/);
  assert.match(filter, /from-index-date:2026-01-01/);
  assert.match(filter, /from-pub-date:2020-01-01/);
  assert.match(filter, /until-pub-date:2025-12-31/);
});

test("task definition changes do not change the goal version or invalidate comparable measurements", (t) => {
  const { svc, id } = setup(t);
  sample(svc, id, candidate(svc, id));
  review(svc, id, observation(svc, id));
  const before = svc.project("A", id, "owner").workflow;
  svc.configureTask(
    "A",
    id,
    "tensile",
    { ...contract, execution: "curve-csv" },
    "owner",
  );
  const after = svc.project("A", id, "owner").workflow;
  assert.equal(after.goalRevision, before.goalRevision);
  assert.equal(after.revision, before.revision + 1);
  assert.equal(after.planState, "draft");
  assert.equal(after.datasets.length, 1);
  assert.equal(
    after.tasks.find((t) => t.id === "tensile").name,
    "拉伸曲线分析（已有数据）",
  );
});

test("legacy imported results cannot continue to masquerade as instrument execution", (t) => {
  const { svc, id, store } = setup(t);
  store.update("A", (s) => {
    const w = s.platform.workflows[id];
    w.tasks.find((t) => t.id === "tensile").status = "completed";
  });
  const w = svc.project("A", id, "owner").workflow;
  assert.equal(w.tasks.find((t) => t.id === "tensile").status, "pending");
  assert.equal(
    w.tasks.find((t) => t.id === "tensile").legacyStatus,
    "completed",
  );
  assert.match(w.tasks.find((t) => t.id === "tensile").note, /旧版导入/);
});

test("dependency cycles and stale task contracts cannot be submitted", (t) => {
  const { svc, id } = setup(t);
  assert.throws(
    () =>
      svc.configureTask(
        "A",
        id,
        "screen",
        { ...contract, dependencies: ["prepare"] },
        "owner",
      ),
    /成环/,
  );
  svc.configureTask("A", id, "screen", contract, "owner");
  assert.throws(
    () => svc.configureTask("A", id, "screen", contract, "owner"),
    /已变更/,
  );
  assert.throws(
    () =>
      svc.configureTask(
        "A",
        id,
        "prepare",
        { ...contract, dependencies: ["review"] },
        "owner",
      ),
    /无效/,
  );
});

test("next-round affordance and server action share approval, quality and comparability gates", t => {
  const {svc,id}=setup(t);
  const ready=()=>svc.project("A",id,"owner").workflow.nextRoundReadiness;
  assert.deepEqual(ready(),{ready:false,reason:"请先确认当前研究路线",action:"plan"});
  sample(svc,id,candidate(svc,id));
  svc.approvePlan("A",id,{revision:1,confirm:true},"owner");
  assert.equal(ready().action,"experiments");
  const bad=observation(svc,id,{temperature:25});
  assert.equal(ready().action,"review");
  review(svc,id,bad);
  assert.equal(ready().ready,false);
  assert.match(ready().reason,/不可比.*工况不符/);
  assert.throws(()=>svc.nextPlan("A",id,"owner",{estimatedCost:0}),e=>e.status===409 && e.message===ready().reason);
  review(svc,id,bad,"excluded");
  assert.equal(ready().ready,false);
  const comparable=observation(svc,id,{specimenId:"T200"});
  review(svc,id,comparable);
  assert.equal(ready().ready,true);
  assert.equal(svc.nextPlan("A",id,"owner",{estimatedCost:0}).status,"draft");
});
