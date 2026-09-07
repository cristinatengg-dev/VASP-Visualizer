const { randomUUID } = require("node:crypto");
const { fail } = require("../knowledge/store");
const domain = require("./research-domain");
function install(Service, { workflow, platform, roleCan, log, at }) {
  Service.prototype.nextPlan = function (owner, id, role, input = {}) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      const readiness = domain.nextRoundReadiness(w);
      if (!readiness.ready) throw fail(readiness.reason, 409);
      const sample =
        w.result?.sampleSnapshot ||
        w.samples.find((s) => s.id === w.result?.sampleId) ||
        (w.demo ? w.samples[0] : null);
      const candidate = w.candidates.find(
        (c) => c.id === (input.candidateId || sample?.candidate),
      );
      domain.requireCandidate(candidate);
      if (!candidate.process) throw fail("请先定义候选工艺", 409);
      const repeats = w.repeats,
        rows = [];
      for (let i = 0; i < repeats; i++)
        rows.push({
          candidateId: candidate.id,
          candidateVersion: candidate.version || 1,
          composition: candidate.composition,
          process: candidate.process,
          kind: "repeat",
          variable: "同一成分及工艺；独立试样 " + (i + 1),
          temperature: w.testTemperature,
          standard: w.standard,
          environment: w.environment,
          strengthDefinition: w.strengthDefinition,
        });
      if (input.referenceId) {
        const ref = w.candidates.find((c) => c.id === input.referenceId);
        domain.requireCandidate(ref);
        if (ref.id === candidate.id || !ref.process)
          throw fail("请选择另一个具有明确工艺的对照候选");
        rows.push({
          candidateId: ref.id,
          candidateVersion: ref.version || 1,
          composition: ref.composition,
          process: ref.process,
          kind: "control",
          variable: "用户指定参考候选；仅一个试样，不能据此比较统计显著性",
          temperature: w.testTemperature,
          standard: w.standard,
          environment: w.environment,
          strengthDefinition: w.strengthDefinition,
        });
      }
      if (input.variable || input.variableValue) {
        if (
          !String(input.variable || "").trim() ||
          !String(input.variableValue || "").trim()
        )
          throw fail("工艺对照需要变量名称和含单位的明确取值");
        rows.push({
          ...rows[0],
          kind: "variation",
          variable:
            String(input.variable).slice(0, 100) +
            " = " +
            String(input.variableValue).slice(0, 200),
          process:
            candidate.process +
            "；对照变量：" +
            String(input.variable).slice(0, 100) +
            " = " +
            String(input.variableValue).slice(0, 200),
        });
      }
      if (rows.length > w.sampleBudget)
        throw fail(
          `本设计需要 ${rows.length} 个样品，超过预算 ${w.sampleBudget}；请调整预算或对照配置`,
          409,
        );
      const cost =
        input.estimatedCost == null || input.estimatedCost === ""
          ? null
          : Number(input.estimatedCost);
      if (cost !== null && (!Number.isFinite(cost) || cost < 0))
        throw fail("成本预估无效");
      w.nextPlan = {
        id: randomUUID(),
        basedOnRevision: w.revision,
        basedOnObservation: w.result.id || null,
        basedOnReview: w.review?.at,
        status: "draft",
        sampleCount: rows.length,
        generatedAt: at(),
        method: "本地结构化验证设计；非模型优化结果",
        reason:
          "核对当前候选的独立试样重复性。工艺变量与参考材料仅采用用户明确指定的值。",
        hypothesis: input.hypothesis
          ? String(input.hypothesis).slice(0, 1000)
          : "在已确认工况下，当前候选的性能能否重复达到目标？",
        stopCondition: String(
          input.stopCondition ||
            "出现执行异常时暂停并复核；完成本轮后人工决定继续或停止",
        ).slice(0, 1000),
        estimatedCost: cost,
        rows,
        items: rows.map(
          (r) =>
            `${r.candidateId} v${r.candidateVersion} · ${r.variable} · ${r.process} · ${r.temperature}°C / ${r.standard}`,
        ),
      };
      w.tasks.find((t) => t.id === "learn").status = "completed";
      log(platform(s), "生成包含候选、重复和工况的下一轮设计", id);
      return w.nextPlan;
    });
  };
  Service.prototype.confirmNext = function (owner, id, input, role) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id),
        archived = w.roundHistory?.find((r) => r.nextPlan?.id === input.planId);
      if (archived?.nextPlan.status === "approved") return archived.nextPlan;
      const p = w.nextPlan;
      if (
        !p ||
        p.id !== input.planId ||
        p.basedOnRevision !== w.revision ||
        w.quality !== "accepted" ||
        p.basedOnReview !== w.review?.at
      )
        throw fail("草案已过期，请重新生成", 409);
      if (input.confirm !== true) throw fail("请确认下一轮样品分配");
      if (!p.rows?.length)
        throw fail("旧版文字草案不能执行，请重新生成结构化设计", 409);
      if (p.estimatedCost === null)
        throw fail("请在草案中补充实验成本预估（可为 0），再确认", 409);
      for (const row of p.rows) {
        const c = w.candidates.find((c) => c.id === row.candidateId);
        domain.requireCandidate(c);
        if (c.version !== row.candidateVersion)
          throw fail("候选版本已变更，请重新生成草案", 409);
      }
      if (w.samples.length + p.rows.length > 100)
        throw fail("项目样品数量达到上限");
      p.status = "approved";
      p.confirmedAt = at();
      p.materializedRound = w.round + 1;
      (w.roundHistory ||= []).push({
        round: w.round,
        revision: w.revision,
        tasks: structuredClone(w.tasks),
        result: structuredClone(w.result),
        review: structuredClone(w.review),
        nextPlan: structuredClone(p),
        at: at(),
      });
      w.round++;
      const batch = `R${w.round}-${p.id.slice(0, 6)}`;
      p.rows.forEach((row, i) => {
        const candidate = w.candidates.find((c) => c.id === row.candidateId);
        w.samples.push({
          id: batch + "-" + (i + 1),
          candidate: row.candidateId,
          candidateVersion: row.candidateVersion,
          candidateSnapshot: structuredClone(candidate),
          batch,
          process: row.process,
          status: "待制备",
          note: row.variable,
          round: w.round,
          version: 1,
          history: [],
          design: row,
        });
      });
      w.tasks = w.tasks.map((t) => ({
        ...t,
        status: t.id === "learn" ? "blocked" : "pending",
        runs: [],
        assignedSampleIds: w.samples
          .filter((s) => s.round === w.round)
          .map((s) => s.id),
        contract: t.contract
          ? {
              ...t.contract,
              version: t.contract.version + 1,
              inputs: `第 ${w.round} 轮样品：${w.samples
                .filter((s) => s.round === w.round)
                .map((s) => s.id)
                .join(
                  "、",
                )}。按确认设计执行，生成新的数据工件。\n原输入规范：${t.contract.inputs}`,
            }
          : undefined,
        outputVersion: undefined,
        updatedAt: at(),
      }));
      w.quality = "pending";
      w.result = null;
      w.review = null;
      w.nextPlan = null;
      log(
        platform(s),
        `第 ${w.round} 轮已创建：${p.rows.length} 个待制备样品及任务；上一轮已归档`,
        id,
      );
      return p;
    });
  };
}
module.exports = { install };
