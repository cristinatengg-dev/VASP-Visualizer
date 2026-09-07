const { randomUUID, createHash } = require("node:crypto");
const { fail } = require("../knowledge/store");
const { requireCandidate, composition } = require("./research-domain");
function rawArtifact(input) {
  if (!input) return null;
  if (
    !input.name ||
    typeof input.content !== "string" ||
    input.content.length > 250000 ||
    !input.content.length
  )
    throw fail("原始文件须非空且小于 250 KB");
  if (!["text", "base64"].includes(input.encoding || "text"))
    throw fail("文件编码不支持");
  const bytes = Buffer.from(
    input.content,
    input.encoding === "base64" ? "base64" : "utf8",
  );
  if (!bytes.length || bytes.length > 250000) throw fail("原始文件大小无效");
  return {
    id: randomUUID(),
    name: String(input.name).slice(0, 150),
    content: input.content,
    encoding: input.encoding || "text",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    at: new Date().toISOString(),
  };
}
function parseMetrics(input) {
  if (!input) return [];
  let rows;
  try {
    rows = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw fail("附加指标须为 JSON 数组");
  }
  if (
    !Array.isArray(rows) ||
    rows.length > 30 ||
    rows.some((r) => !r.name || !r.unit || !Number.isFinite(r.value))
  )
    throw fail("每项指标须有 name、unit 和数值 value，最多 30 项");
  return rows.map((r) => ({
    name: String(r.name).slice(0, 100),
    unit: String(r.unit).slice(0, 30),
    value: r.value,
  }));
}
function analyzeCurve(artifact) {
  if (!artifact || artifact.encoding !== "text")
    throw fail("请选择文本 CSV 原始曲线");
  const lines = artifact.content.trim().split(/\r?\n/);
  if (lines.shift().trim() !== "strain,stress_mpa")
    throw fail(
      "CSV 表头须为 strain,stress_mpa；应变为无量纲工程应变，应力单位 MPa",
    );
  if (lines.length < 3 || lines.length > 10000)
    throw fail("曲线须包含 3–10000 个数据点");
  const points = lines.map((line, i) => {
    const cells = line.split(",");
    const x = Number(cells[0]),
      y = Number(cells[1]);
    if (
      cells.length !== 2 ||
      cells.some((c) => !c.trim()) ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0
    )
      throw fail(`CSV 第 ${i + 2} 行数据无效`);
    return { strain: x, stressMPa: y };
  });
  if (points.some((p, i) => i > 0 && p.strain <= points[i - 1].strain))
    throw fail("应变须严格递增；请先检查重采样与卸载段");
  return {
    adapter: "engineering-curve-summary",
    version: "1.0.0",
    inputHash: artifact.sha256,
    points: points.length,
    peakStressMPa: Math.max(...points.map((p) => p.stressMPa)),
    integralMJm3: points
      .slice(1)
      .reduce(
        (v, p, i) =>
          v +
          ((p.strain - points[i].strain) *
            (p.stressMPa + points[i].stressMPa)) /
            2,
        0,
      ),
    note: "实算曲线峰值与积分；不推断屈服强度、断后延伸率或材料达标。无量纲工程应变 × MPa = MJ/m³。",
    curve: points,
  };
}
function install(Service, { workflow, platform, roleCan, log, at, clean }) {
  Service.prototype.editCandidate = function (
    owner,
    id,
    candidateId,
    input,
    role,
  ) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id),
        c = w.candidates.find((c) => c.id === candidateId);
      if (!c) throw fail("候选不存在", 404);
      if (Number(input.version) !== c.version)
        throw fail("候选已修改，请重新打开", 409);
      const check = composition(input.composition, input.basis);
      if (!check.valid) throw fail(check.note);
      (c.history ||= []).push({
        ...c,
        history: undefined,
        validation: undefined,
        at: at(),
      });
      Object.assign(c, {
        composition: clean(input.composition),
        basis: input.basis,
        process: clean(input.process),
        version: c.version + 1,
        selected: false,
        validation: check,
      });
      w.nextPlan = null;
      log(
        platform(s),
        "修订候选 " + c.id + " v" + c.version + "；既有样品保留原版本",
        id,
      );
      return c;
    });
  };
  Service.prototype.editSample = function (owner, id, sampleId, input, role) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id),
        sample = w.samples.find((x) => x.id === sampleId);
      if (!sample) throw fail("样品不存在", 404);
      if (Number(input.version) !== sample.version)
        throw fail("样品已修改，请重新打开", 409);
      const candidate = w.candidates.find((c) => c.id === input.candidate);
      requireCandidate(candidate);
      if (!clean(input.batch) || !clean(input.process))
        throw fail("请填写批次和工艺");
      (sample.history ||= []).push({ ...sample, history: undefined, at: at() });
      Object.assign(sample, {
        candidate: candidate.id,
        candidateVersion: candidate.version,
        candidateSnapshot: structuredClone(candidate),
        batch: clean(input.batch),
        process: clean(input.process),
        note: clean(input.note),
        version: sample.version + 1,
      });
      w.nextPlan = null;
      log(
        platform(s),
        "修订样品 " + sample.id + " v" + sample.version + "；历史测量保留快照",
        id,
      );
      return sample;
    });
  };
  Service.prototype.configureTask = function (owner, id, taskId, input, role) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id),
        t = w.tasks.find((t) => t.id === taskId);
      if (!t || ["review", "learn"].includes(taskId))
        throw fail("任务不可配置");
      if (["running", "waiting", "completed"].includes(t.status))
        throw fail("正在执行或已归档的任务不能覆盖", 409);
      if (Number(input.version || 0) !== (t.contract?.version || 0))
        throw fail("任务定义已变更，请重新打开", 409);
      const dependencies = Array.isArray(input.dependencies)
        ? [...new Set(input.dependencies)]
        : [];
      if (
        dependencies.some(
          (d) =>
            d === taskId ||
            !w.tasks.some((t) => t.id === d) ||
            ["review", "learn"].includes(d),
        )
      )
        throw fail("前置任务无效");
      const walk = (id, seen = new Set()) => {
        if (id === taskId) throw fail("任务依赖不能成环");
        if (seen.has(id)) return;
        seen.add(id);
        for (const d of w.tasks.find((t) => t.id === id)?.dependencies || [])
          walk(d, seen);
      };
      dependencies.forEach((d) => walk(d));
      const contract = {
        version: (t.contract?.version || 0) + 1,
        execution: input.execution,
        inputs: clean(input.inputs, 4000),
        outputs: clean(input.outputs, 2000),
        methodVersion: clean(input.methodVersion, 200),
        resource: clean(input.resource, 200),
        assignee: clean(input.assignee, 100),
        dueAt: clean(input.dueAt, 100),
        estimatedCost: Number(input.estimatedCost),
        acceptance: clean(input.acceptance, 2000),
        candidateId: input.candidateId || null,
      };
      if (
        !["manual", "curve-csv"].includes(contract.execution) ||
        Object.entries(contract).some(
          ([k, v]) =>
            [
              "inputs",
              "outputs",
              "methodVersion",
              "resource",
              "assignee",
              "dueAt",
              "acceptance",
            ].includes(k) && !v,
        ) ||
        !Number.isFinite(contract.estimatedCost) ||
        contract.estimatedCost < 0 ||
        !Number.isFinite(Date.parse(contract.dueAt))
      )
        throw fail(
          "请补齐输入、输出、版本、资源、负责人、期限、成本与验收条件",
        );
      if (contract.execution === "curve-csv" && t.id !== "tensile")
        throw fail("曲线适配器仅用于拉伸数据处理，不执行仿真或设备控制");
      if (contract.candidateId)
        requireCandidate(
          w.candidates.find((c) => c.id === contract.candidateId),
        );
      (t.definitionHistory ||= []).push({
        contract: t.contract,
        dependencies: t.dependencies,
        at: at(),
      });
      t.contract = contract;
      t.dependencies = dependencies;
      t.status = "pending";
      w.planState = "draft";
      w.revision++;
      w.nextPlan = null;
      log(platform(s), "更新任务定义 " + t.name + "；研究路线需重新确认", id);
      return t;
    });
  };
  Service.prototype.executeTask = function (owner, id, taskId, input, role) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id),
        t = w.tasks.find((t) => t.id === taskId);
      if (!t?.contract) throw fail("请先定义任务输入及执行方式", 409);
      const c = t.contract,
        action = input.action;
      if (action === "submit") {
        if (!["pending", "failed", "cancelled", "paused"].includes(t.status))
          throw fail("任务不能重复提交", 409);
        if (w.planState !== "approved") throw fail("请先确认当前研究路线", 409);
        if (
          t.dependencies.some(
            (d) => w.tasks.find((t) => t.id === d)?.status !== "completed",
          )
        )
          throw fail("前置任务尚未验收", 409);
        if (c.candidateId)
          requireCandidate(w.candidates.find((x) => x.id === c.candidateId));
        if ((t.runs?.length || 0) >= 50)
          throw fail("任务执行记录已达 50 条，请归档后建立新轮次");
        const run = {
          id: randomUUID(),
          at: at(),
          targetRevision: w.revision,
          contract: structuredClone(c),
          candidateSnapshot: c.candidateId
            ? structuredClone(w.candidates.find((x) => x.id === c.candidateId))
            : null,
          inputs: t.dependencies.map((d) => {
            const task = w.tasks.find((t) => t.id === d);
            return {
              taskId: d,
              runId: task.runs?.at(-1)?.id || null,
              outputVersion: task.outputVersion || null,
              demo: !!w.demo,
            };
          }),
          status: "running",
        };
        (t.runs ||= []).push(run);
        t.status = "running";
        if (c.execution === "curve-csv") {
          try {
            run.artifact = rawArtifact(input.artifact);
            run.output = analyzeCurve(run.artifact);
            run.status = t.status = "waiting";
          } catch (error) {
            run.error = error.message;
            run.status = t.status = "failed";
          }
        }
      } else {
        const run = t.runs?.at(-1);
        if (!run) throw fail("尚无执行记录", 409);
        if (action === "return") {
          if (t.status !== "running" || c.execution !== "manual")
            throw fail("仅进行中的人工任务可回传", 409);
          const artifact = rawArtifact(input.artifact);
          if (!artifact || clean(input.summary).length < 8)
            throw fail("请上传原始文件并填写回传摘要");
          run.artifact = artifact;
          run.output = {
            summary: clean(input.summary, 4000),
            source: "人工回传",
          };
          run.status = t.status = "waiting";
        } else if (action === "accept") {
          if (
            t.status !== "waiting" ||
            input.confirm !== true ||
            clean(input.note).length < 4
          )
            throw fail("请复核原始文件和输出后确认验收", 409);
          run.review = { by: owner, at: at(), note: clean(input.note) };
          run.status = t.status = "completed";
          t.outputVersion = (t.outputVersion || 0) + 1;
        } else if (["fail", "cancel"].includes(action)) {
          if (
            !["running", "waiting"].includes(t.status) ||
            clean(input.note).length < 4
          )
            throw fail("仅活动任务可停止，需填写原因", 409);
          run.error = clean(input.note);
          run.status = t.status = action === "fail" ? "failed" : "cancelled";
        } else throw fail("未知执行操作");
      }
      t.updatedAt = at();
      log(platform(s), t.name + "：" + action + "（" + c.execution + "）", id);
      return t;
    });
  };
}
module.exports = { install, rawArtifact, parseMetrics, analyzeCurve };
