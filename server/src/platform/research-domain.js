const { fail } = require("../knowledge/store");
const elements = new Set(
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(
    " ",
  ),
);
const numeric = {
  targetStrength: ["屈服强度 MPa", 0, 5000],
  targetElongation: ["延伸率 %", 0, 200],
  sampleBudget: ["样品预算", 1, 100, true],
  testTemperature: ["测试温度 °C", -273.15, 4000],
  repeats: ["独立试样重复数", 1, 100, true],
  durationWeeks: ["周期（周）", 1, 520, true],
};
const strings = {
  standard: "测试标准及版本",
  strengthDefinition: "屈服定义",
  environment: "测试环境",
};
function extractGoal(goal = "") {
  const patterns = {
    targetStrength:
      /(?:屈服强度|强度)[^\d。；;\n]{0,10}(\d+(?:\.\d+)?)\s*MPa/gi,
    targetElongation: /(?:延伸率|伸长率)[^\d。；;\n]{0,10}(\d+(?:\.\d+)?)\s*%/g,
    testTemperature: /(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃)/gi,
    sampleBudget: /(?:最多|至多|上限|预算)[^\d。；;\n]{0,8}(\d+)\s*个/g,
    durationWeeks: /(?:周期|期限)[^\d。；;\n]{0,8}(\d+)\s*周/g,
    repeats: /(?:重复|复测)[^\d。；;\n]{0,8}(\d+)\s*(?:次|个)/g,
  };
  const values = {},
    conflicts = [];
  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = [
      ...new Set([...goal.matchAll(pattern)].map((m) => Number(m[1]))),
    ];
    if (matches.length === 1) values[key] = matches[0];
    if (matches.length > 1)
      conflicts.push(`${numeric[key][0]}：原文包含多个值，请消除歧义`);
  }
  return { values, conflicts };
}
function requirements(input, previous = {}) {
  const parsed = extractGoal(String(input.goal || ""));
  const out = { requirementIssues: [...parsed.conflicts] };
  for (const [key, [label, min, max, integer]] of Object.entries(numeric)) {
    const value = Object.hasOwn(input, key)
      ? input[key] === "" || input[key] == null
        ? null
        : input[key]
      : (parsed.values[key] ?? previous[key] ?? null);
    out[key] = value === null ? null : Number(value);
    if (
      out[key] !== null &&
      (!Number.isFinite(out[key]) ||
        out[key] < min ||
        out[key] > max ||
        (integer && !Number.isInteger(out[key])) ||
        (["targetStrength", "targetElongation"].includes(key) &&
          out[key] === 0))
    )
      throw fail(`${label}超出有效范围`);
    if (out[key] === null) out.requirementIssues.push(`待补充：${label}`);
    else if (parsed.values[key] != null && parsed.values[key] !== out[key])
      out.requirementIssues.push(
        `${label}：原文 ${parsed.values[key]} 与字段 ${out[key]} 不一致`,
      );
  }
  for (const [key, label] of Object.entries(strings)) {
    out[key] = String(input[key] ?? previous[key] ?? "")
      .trim()
      .slice(0, 200);
    if (!out[key]) out.requirementIssues.push(`待补充：${label}`);
  }
  return out;
}
function composition(text, basis) {
  const errors = [],
    parts = [],
    seen = new Set();
  if (!["wt%", "at%"].includes(basis)) errors.push("配比基准必须为 wt% 或 at%");
  const tokens = String(text || "")
    .trim()
    .split(/\s*[/,，;；]\s*/);
  for (const token of tokens) {
    const m = token.match(
      /^([A-Z][a-z]?)\s*(余量|bal(?:ance)?|[-+]?\d+(?:\.\d+)?(?:\s*[-–~～]\s*\d+(?:\.\d+)?)?)\s*%?$/i,
    );
    if (!m || !elements.has(m[1])) {
      errors.push(`无法识别元素或配比：${token || "空白"}`);
      continue;
    }
    if (seen.has(m[1])) errors.push(`元素重复：${m[1]}`);
    seen.add(m[1]);
    if (/余量|bal/i.test(m[2])) parts.push({ element: m[1], balance: true });
    else {
      const range = m[2].match(
        /^([-+]?\d+(?:\.\d+)?)(?:\s*[-–~～]\s*(\d+(?:\.\d+)?))?$/,
      );
      const min = Number(range[1]),
        max = Number(range[2] ?? range[1]);
      if (min < 0 || max > 100 || min > max)
        errors.push(`${m[1]} 配比或范围无效`);
      parts.push({ element: m[1], min, max });
    }
  }
  const balances = parts.filter((p) => p.balance),
    min = parts.reduce((n, p) => n + (p.min || 0), 0),
    max = parts.reduce((n, p) => n + (p.max || 0), 0);
  if (balances.length > 1) errors.push("只能指定一个余量元素");
  if (min > 100.001 || (balances.length && max > 100.001))
    errors.push(`成分总量超过 100%（${max.toFixed(3)}%）`);
  if (!balances.length && (min > 100.001 || max < 99.999))
    errors.push(
      `成分总量须为 100%，当前 ${min === max ? min : min + "–" + max}%`,
    );
  if (balances.length === 1)
    Object.assign(balances[0], { min: 100 - max, max: 100 - min });
  const ranged = parts.some((p) => p.min !== p.max);
  return {
    parts,
    errors,
    valid: !errors.length,
    executable: !errors.length && !ranged,
    note:
      errors.join("；") ||
      (ranged ? "范围候选：制样前请确定具体配比" : "配比校验通过"),
  };
}
function requireCandidate(candidate) {
  if (!candidate) throw fail("请选择本项目候选");
  const check = composition(candidate.composition, candidate.basis);
  if (!check.executable) throw fail(check.note);
  return check;
}
function measurement(input) {
  const n = (key) =>
    input[key] === "" || input[key] == null ? null : Number(input[key]);
  const m = {
    temperature: n("temperature"),
    standard: String(input.standard || "").trim(),
    environment: String(input.environment || "").trim(),
    strengthDefinition: String(input.strengthDefinition || "").trim(),
    strainRate: n("strainRate"),
    dimensions: String(input.dimensions || "").trim(),
    specimenId: String(input.specimenId || "").trim(),
  };
  if (
    m.temperature !== null &&
    (!Number.isFinite(m.temperature) ||
      m.temperature < -273.15 ||
      m.temperature > 4000)
  )
    throw fail("测试温度无效");
  if (
    m.strainRate !== null &&
    (!Number.isFinite(m.strainRate) || m.strainRate <= 0)
  )
    throw fail("应变速率必须大于 0");
  return m;
}
function assess(w, r = w.result) {
  const reasons = [],
    q = r?.quality || (r === w.result ? w.quality : "pending");
  if (!r) return { status: "missing", label: "等待实验结果", reasons: [] };
  if (q !== "accepted")
    reasons.push(
      q === "excluded" ? "记录已排除，不参与达标判定" : "等待质量复核",
    );
  const req = requirements(w),
    m = r.measurement || {};
  if (req.requirementIssues.length) reasons.push("研究目标尚未完整确认");
  if (r.targetRevision !== (w.goalRevision || w.revision))
    reasons.push("记录对应其他目标版本，请按当前目标重新复核");
  if (m.temperature == null) reasons.push("缺少结构化测试温度");
  else if (w.testTemperature != null && m.temperature !== w.testTemperature)
    reasons.push(
      `工况不符：测试 ${m.temperature}°C，目标 ${w.testTemperature}°C`,
    );
  for (const [key, label] of Object.entries({
    standard: "测试标准及版本",
    environment: "测试环境",
    strengthDefinition: "屈服定义",
  }))
    if (!m[key] || m[key] !== w[key])
      reasons.push(`${label}缺失或与目标不一致`);
  const sample = r.sampleSnapshot || w.samples.find((s) => s.id === r.sampleId);
  const candidate =
    sample?.candidateSnapshot ||
    w.candidates.find((c) => c.id === sample?.candidate);
  if (
    !sample?.candidateVersion ||
    !candidate ||
    !composition(candidate.composition, candidate.basis).executable
  )
    reasons.push("样品成分或候选版本尚未核对");
  if (!r.artifact) reasons.push("尚未关联原始文件");
  if (!m.specimenId || !m.dimensions || !m.strainRate)
    reasons.push("缺少试样编号、尺寸或应变速率");
  if (reasons.length)
    return {
      status: q === "excluded" ? "excluded" : "undetermined",
      label: "不能判定目标达成",
      reasons,
    };
  return {
    status:
      r.strength >= w.targetStrength && r.elongation >= w.targetElongation
        ? "single-pass"
        : "below",
    label: "单条可比测量；达标需结合独立试样统计",
    reasons: [],
  };
}
function nextRoundReadiness(w) {
  if (w.planState !== "approved")
    return { ready: false, reason: "请先确认当前研究路线", action: "plan" };
  if (!w.result)
    return { ready: false, reason: "请先登记实验结果并关联原始文件", action: "experiments" };
  if (w.quality !== "accepted")
    return { ready: false, reason: "请先复核实验记录，排除的记录不能推进下一轮", action: "review" };
  const assessment = assess(w);
  if (!w.demo && !["single-pass", "below"].includes(assessment.status))
    return { ready: false, reason: "当前记录与目标不可比：" + assessment.reasons.join("；"), action: "experiments" };
  return { ready: true, reason: "已有复核通过的可比记录，可以起草下一轮验证设计。", action: "results" };
}
function datasets(w) {
  const groups = new Map();
  for (const r of w.observations || []) {
    if (!["single-pass", "below"].includes(assess(w, r).status)) continue;
    const sample =
      r.sampleSnapshot || w.samples.find((s) => s.id === r.sampleId) || {};
    const m = r.measurement;
    const key = JSON.stringify([
      r.round,
      sample.candidate,
      sample.candidateVersion,
      sample.batch,
      sample.process,
      m.temperature,
      m.standard,
      m.environment,
      m.strengthDefinition,
      m.strainRate,
      m.dimensions,
    ]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        round: r.round,
        candidate: sample.candidate,
        batch: sample.batch,
        process: sample.process,
        temperature: m.temperature,
        records: [],
      });
    const g = groups.get(key);
    // Newest revision of the same physical specimen wins; repeated import cannot inflate n.
    if (!g.records.some((x) => x.measurement.specimenId === m.specimenId))
      g.records.push(r);
  }
  return [...groups.values()].map((g) => {
    const n = g.records.length;
    const stats = (key) => {
      const mean = g.records.reduce((s, r) => s + r[key], 0) / n;
      return {
        mean,
        sd:
          n > 1
            ? Math.sqrt(
                g.records.reduce((s, r) => s + (r[key] - mean) ** 2, 0) /
                  (n - 1),
              )
            : null,
      };
    };
    const strength = stats("strength"),
      elongation = stats("elongation");
    return {
      ...g,
      recordIds: g.records.map((r) => r.id),
      records: undefined,
      n,
      strength,
      elongation,
      label:
        n < w.repeats
          ? `重复数不足（${n}/${w.repeats}）`
          : strength.mean >= w.targetStrength &&
              elongation.mean >= w.targetElongation
            ? "可比组均值达到阈值；仍需研究验收"
            : "可比组均值低于目标",
    };
  });
}
function normalize(w) {
  if (!w) return w;
  w.goalRevision ||= w.revision;
  // Legacy text is retained. Missing structured fields remain unconfirmed.
  for (const key of Object.keys(numeric))
    if (w[key] === undefined) w[key] = null;
  w.requirementIssues = requirements(w).requirementIssues;
  w.tasks.forEach((t) => {
    if (
      !w.demo &&
      t.id === "tensile" &&
      t.status === "completed" &&
      !t.runs?.length
    ) {
      t.legacyStatus = t.status;
      t.status = "pending";
      t.legacyImportOnly = true;
      t.note = "旧版导入结果已保留；尚无平台执行与验收记录";
    }
    if (t.id === "tensile")
      t.name =
        w.testTemperature == null
          ? "拉伸测试（工况待确认）"
          : `${w.testTemperature}°C 拉伸测试`;
    if (t.id === "tensile" && t.contract?.execution === "curve-csv") {
      t.name = "拉伸曲线分析（已有数据）";
      t.method = "工程曲线计算";
      t.note = "分析上传曲线，不代表试验设备已执行；计算输出须独立验收";
    }
  });
  w.candidates.forEach((c) => {
    c.version ||= 1;
    c.validation = composition(c.composition, c.basis);
  });
  w.samples.forEach((s) => {
    s.version ||= 1;
  });
  return w;
}
module.exports = {
  requirements,
  extractGoal,
  composition,
  requireCandidate,
  measurement,
  assess,
  nextRoundReadiness,
  datasets,
  normalize,
};
