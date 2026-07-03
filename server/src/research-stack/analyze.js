'use strict';

const { recipeIndexStatus, searchRecipes } = require('./recipe-index');
const { ADAPTER_DEFINITIONS, adapterSummary, buildAdapterRegistry } = require('./adapter-registry');

const OPEN_SOURCE_ADAPTERS = ADAPTER_DEFINITIONS.map((adapter) => ({
  id: adapter.id,
  name: adapter.name,
  project: adapter.project,
  url: adapter.url,
  role: adapter.role,
  integration: adapter.integration,
  status: 'probe-required',
}));

function asText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function unique(items) {
  return [...new Set(items.map(asText).filter(Boolean))];
}

function evidenceText({ prompt, research, selectedIdea }) {
  const papers = Array.isArray(research?.papers) ? research.papers : [];
  return [
    prompt,
    research?.summary,
    research?.user_goal?.interpreted_goal,
    selectedIdea?.title,
    selectedIdea?.material_family,
    selectedIdea?.fit_reason,
    selectedIdea?.literature_basis,
    ...(papers.flatMap((paper) => [paper?.title, paper?.abstract, paper?.source])),
  ].map(asText).join(' ');
}

function detectDomain(text) {
  if (/(熔盐堆|熔盐反应堆|molten salt reactor|MSR|FLiBe|FLiNaK|氟盐|氯盐|核材料|反应堆|辐照|包壳|燃料)/i.test(text)) {
    return 'molten_salt_reactor';
  }
  if (/(CO2|二氧化碳|加氢|hydrogenation|methanol|甲醇|催化)/i.test(text)) {
    return 'co2_hydrogenation';
  }
  if (/(battery|电池|正极|负极|cathode|anode|lithium|sodium|锂|钠|固态电解质)/i.test(text)) {
    return 'battery';
  }
  if (/(alloy|合金|高熵|腐蚀|耐蚀|oxidation|氧化)/i.test(text)) {
    return 'alloy_corrosion';
  }
  if (/(perovskite|钙钛矿|oxide|氧化物|陶瓷|ceramic)/i.test(text)) {
    return 'oxide_ceramic';
  }
  return 'general_materials';
}

const SMALL_MOLECULES = new Set([
  'co2', 'h2', 'o2', 'n2', 'h2o', 'co', 'no', 'no2', 'nh3', 'ch4', 'ar', 'he', 'ne',
]);

const ELEMENT_SYMBOLS = new Set([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu',
]);

function extractTextFormulas(text) {
  const matches = asText(text).match(/\b(?:[A-Z][a-z]?[0-9a-z().+-]*){2,}\b/g) || [];
  return matches.filter((formula) => {
    const normalized = formula.replace(/\s+/g, '').toLowerCase();
    if (SMALL_MOLECULES.has(normalized)) return false;
    const elements = formula.match(/[A-Z][a-z]?/g) || [];
    if (elements.length < 2) return false;
    return elements.every((symbol) => ELEMENT_SYMBOLS.has(symbol));
  });
}

function extractFormulaCandidates({ research, selectedIdea, text }) {
  const structures = Array.isArray(research?.structures) ? research.structures : [];
  const candidates = [
    selectedIdea?.blueprint?.structure_source?.formula,
    selectedIdea?.material_family,
    research?.handoff?.formula,
    ...(structures.map((item) => item?.formula)),
    ...extractTextFormulas(text),
  ];
  return unique(candidates).slice(0, 6);
}

function countVerifiedPapers(papers) {
  return (Array.isArray(papers) ? papers : []).filter((paper) => {
    const title = asText(paper?.title);
    return title.length > 5 && !/^untitled$/i.test(title) && Boolean(paper?.doi || paper?.url || paper?.evidence_url);
  }).length;
}

function bestStructureScore(structures) {
  const values = (Array.isArray(structures) ? structures : [])
    .map((item) => Number(item?.energy_above_hull))
    .filter(Number.isFinite);
  if (!values.length) return 45;
  const best = Math.min(...values);
  if (best <= 0.03) return 92;
  if (best <= 0.08) return 80;
  if (best <= 0.15) return 68;
  if (best <= 0.3) return 52;
  return 38;
}

function routeFromRecipeMatch(match) {
  const operationVerbs = unique((match.operations || []).map((operation) => operation.verb || operation.type)).slice(0, 5);
  const sourceLabel = match.source || 'Ceder recipe index';
  return {
    id: `ceder-${match.id}`,
    title: `${match.target_formula || match.target_name || 'Target'} · ${match.synthesis_type || 'synthesis'} recipe`,
    method: match.synthesis_type || 'text-mined synthesis recipe',
    target: match.target_formula || match.target_name || 'target material',
    precursors: Array.isArray(match.precursors) && match.precursors.length ? match.precursors : ['precursors not extracted'],
    conditions: {
      temperature: match.conditions?.temperature || 'not extracted',
      time: match.conditions?.time || 'not extracted',
      atmosphere: match.conditions?.atmosphere || 'not extracted',
    },
    evidence: [
      `命中 ${sourceLabel}，匹配分数 ${match.score}/100。`,
      match.doi ? `原始论文 DOI: ${match.doi}。` : '原始论文 DOI 未抽取。',
      match.reaction_string ? `反应式：${match.reaction_string}` : '',
    ].filter(Boolean).join(' '),
    risk: '该路线来自文本挖掘 recipe，能作为可追溯起点；正式实验前仍需打开原论文核对计量、设备、安全条件和段落上下文。',
    alternatives: operationVerbs.length ? operationVerbs : ['人工核对原论文', '用 rxn_network 做反应能排序', '按实验条件做 DoE 微调'],
    dataset_hit: true,
    source: sourceLabel,
    source_project: match.source_project,
    source_url: match.source_url,
    source_citation: match.source_citation,
    source_dataset_doi: match.source_dataset_doi,
    doi: match.doi,
    doi_url: match.doi_url,
    recipe_id: match.id,
    match_score: match.score,
    matched_terms: match.matched_terms || [],
    reaction_string: match.reaction_string,
  };
}

function routeForDomain(domain, formulas, recipeMatches = []) {
  const datasetRoutes = (Array.isArray(recipeMatches) ? recipeMatches : [])
    .slice(0, 3)
    .map(routeFromRecipeMatch);
  if (datasetRoutes.length) {
    return {
      summary: `Ceder 本地 recipe index 命中 ${datasetRoutes.length} 条可追溯合成记录；优先采用数据集路线，再由人工核对原始论文条件。`,
      routes: datasetRoutes,
      dataset_hit_count: datasetRoutes.length,
      route_source: 'ceder_recipe_index',
    };
  }
  const material = formulas[0] || 'target material';
  if (domain === 'molten_salt_reactor') {
    return {
      summary: '建议先把任务定义为熔盐环境下材料稳定性/腐蚀可行性，而不是直接给单一晶体合成结论。',
      routes: [
        {
          id: 'msr-coupon-corrosion',
          title: '熔盐暴露/腐蚀评价路线',
          method: 'sealed crucible or flowing molten-salt exposure',
          target: material,
          precursors: ['结构材料试样或候选合金片', 'FLiNaK / FLiBe / chloride salt', '高纯 Ar 或惰性气氛'],
          conditions: { temperature: '550-750 C', time: '50-500 h', atmosphere: 'Ar / purified inert gas; strict H2O/O2 control' },
          evidence: '适合熔盐堆结构材料、腐蚀和辐照前筛选；需要把目标从“合成单一材料”拆成材料制备 + 熔盐暴露评价。',
          risk: '高温熔盐吸湿和腐蚀性强，杂质氧/水会主导结果；安全和手套箱条件是主要瓶颈。',
          alternatives: ['先做 DFT/热力学筛选 Cr/Ni/Fe/F/Cl 反应倾向', '小规模静态坩埚实验', '后续再做流动回路或辐照耦合实验'],
          dataset_hit: false,
          source: 'domain heuristic',
        },
        {
          id: 'msr-thermo-screening',
          title: '热力学/反应路径预筛选',
          method: 'phase stability + reaction-network screening',
          target: material,
          precursors: ['候选合金或陶瓷组成', '盐组分化学势窗口', '腐蚀产物数据库'],
          conditions: { temperature: '500-800 C equivalent chemical potential window', time: 'in-silico screening', atmosphere: 'salt redox potential controlled' },
          evidence: '适合接 rxn_network/pymatgen 相图和反应能筛选，避免盲目进入高风险熔盐实验。',
          risk: '结构数据库和热力学数据缺口会导致不确定性；需要人工确认盐组分和目标腐蚀产物。',
          alternatives: ['CALPHAD/FactSage 补充', '手动给定 corrosion products', '用实验文献做校准'],
          dataset_hit: false,
          source: 'domain heuristic',
        },
      ],
    };
  }
  if (domain === 'co2_hydrogenation') {
    return {
      summary: '建议把路线拆成催化剂制备、还原活化、CO2/H2 反应评价和表面吸附计算。',
      routes: [
        {
          id: 'cu-zno-coprecipitation',
          title: 'Cu/ZnO 基催化剂共沉淀路线',
          method: 'co-precipitation + calcination + H2 reduction',
          target: material,
          precursors: ['Cu(NO3)2', 'Zn(NO3)2', 'Al(NO3)3 or ZrO(NO3)2', 'Na2CO3 / NH4OH'],
          conditions: { temperature: 'calcination 300-450 C; reduction 220-300 C', time: '2-6 h each step', atmosphere: 'air calcination; 5-10% H2/N2 reduction' },
          evidence: '符合 CO2 加氢到甲醇常见实验路线，可和 Cu/ZnO 表面吸附模型对应。',
          risk: '铜粒径、界面比例和还原程度强烈影响活性；需要 XRD/XPS/TEM/TPR 校验。',
          alternatives: ['impregnation route', 'Cu-Zn-Zr oxide', 'In2O3/ZrO2 if methanol selectivity is the target'],
          dataset_hit: false,
          source: 'domain heuristic',
        },
      ],
    };
  }
  if (domain === 'battery') {
    return {
      summary: '建议优先查同族材料的固相/溶胶凝胶路线，再用相稳定性和脱嵌电压筛选。',
      routes: [
        {
          id: 'battery-solid-state',
          title: '无机电极/固态电解质固相合成路线',
          method: 'solid-state reaction',
          target: material,
          precursors: ['carbonate/oxide/nitrate precursors', 'stoichiometric alkali source', 'transition-metal oxide'],
          conditions: { temperature: '650-950 C', time: '8-24 h with intermediate grinding', atmosphere: 'air / O2 / Ar depending on oxidation state' },
          evidence: '与 Ceder 固相合成数据集和 reaction-network 路线规划兼容。',
          risk: '挥发性碱金属和多相杂质常见；需要过量 Li/Na 源和多步煅烧优化。',
          alternatives: ['sol-gel/citrate route', 'molten-salt assisted route', 'hydrothermal precursor + calcination'],
          dataset_hit: false,
          source: 'domain heuristic',
        },
      ],
    };
  }
  if (domain === 'alloy_corrosion') {
    return {
      summary: '建议先做合金成分窗口和腐蚀环境定义，再设计制备与加速腐蚀实验。',
      routes: [
        {
          id: 'alloy-arc-melt-anneal',
          title: '合金熔炼-均匀化-腐蚀评价路线',
          method: 'arc melting / induction melting + homogenization + corrosion test',
          target: material,
          precursors: ['high-purity metal elements', 'controlled impurity additions', 'corrosion medium'],
          conditions: { temperature: 'annealing 800-1200 C; corrosion environment specific', time: '12-72 h annealing; 24-500 h exposure', atmosphere: 'Ar/Vacuum for melting; test-specific atmosphere' },
          evidence: '适合合金/耐蚀材料体系，能和 DFT 表面偏析、氧化/腐蚀产物计算对应。',
          risk: '成分偏析、氧含量和样品表面状态会影响可重复性。',
          alternatives: ['powder metallurgy', 'thin-film combinatorial library', 'CALPHAD pre-screening'],
          dataset_hit: false,
          source: 'domain heuristic',
        },
      ],
    };
  }
  return {
    summary: '未识别到明确实验体系；先给出通用材料合成路线，并要求用户确认材料类别和目标性质。',
    routes: [
      {
        id: 'general-solid-state',
        title: '通用无机材料固相合成路线',
        method: 'solid-state reaction',
        target: material,
        precursors: ['stoichiometric oxide/carbonate/nitrate precursors', 'optional flux/mineralizer'],
        conditions: { temperature: '600-1000 C', time: '6-24 h', atmosphere: 'air / Ar / O2 depending on oxidation state' },
        evidence: '可作为 Ceder synthesis dataset 和 rxn_network 的默认接入形态。',
        risk: '材料类别、氧化态和挥发元素未明确，路线只能作为第一版实验草案。',
        alternatives: ['sol-gel', 'hydrothermal', 'combustion synthesis'],
        dataset_hit: false,
        source: 'domain heuristic',
      },
    ],
    dataset_hit_count: 0,
    route_source: 'domain_heuristic',
  };
}

function buildFeasibility({ research, selectedIdea, domain, synthesisPlan, recipeSearch }) {
  const papers = Array.isArray(research?.papers) ? research.papers : [];
  const structures = Array.isArray(research?.structures) ? research.structures : [];
  const verifiedPaperCount = countVerifiedPapers(papers);
  const recipeHits = Array.isArray(recipeSearch?.matches) ? recipeSearch.matches.length : 0;
  const dimensions = [
    {
      id: 'literature_evidence',
      label: '文献证据',
      score: clamp(verifiedPaperCount * 14 + 20),
      rationale: verifiedPaperCount
        ? `${verifiedPaperCount} 篇文献带 DOI 或可打开来源，可作为初步证据链。`
        : '缺少可核验文献，不应给确定性实验结论。',
    },
    {
      id: 'structure_database',
      label: '结构数据库命中',
      score: clamp(structures.length * 18 + (selectedIdea ? 25 : 0)),
      rationale: structures.length
        ? `结构源返回 ${structures.length} 个候选；仍需人工确认是否对应论文体系。`
        : '没有结构候选，建模应由用户手动确认材料/晶面/吸附物。',
    },
    {
      id: 'phase_stability',
      label: '相稳定性',
      score: bestStructureScore(structures),
      rationale: structures.length
        ? '基于可用 energy_above_hull 做粗筛；没有热力学校准时只作为风险提示。'
        : '无结构热力学数据，先按未知相稳定性处理。',
    },
    {
      id: 'reaction_accessibility',
      label: '反应路径可达性',
      score: clamp(recipeHits ? 82 : domain === 'molten_salt_reactor' ? 56 : domain === 'general_materials' ? 58 : 74),
      rationale: recipeHits
        ? `本地 Ceder recipe index 命中 ${recipeHits} 条可追溯路线，可从真实 DOI 记录进入实验条件核对。`
        : domain === 'molten_salt_reactor'
        ? '熔盐体系更像环境暴露/腐蚀评价，反应路径需要盐组分和腐蚀产物约束。'
        : `已生成 ${synthesisPlan.routes.length} 条可执行路线，可后续接 rxn_network 做反应能排序。`,
    },
    {
      id: 'precursor_availability',
      label: '前驱体可得性',
      score: clamp(recipeHits ? 80 : domain === 'molten_salt_reactor' ? 62 : 78),
      rationale: recipeHits
        ? '前驱体来自文本挖掘 recipe 记录；采购和纯度仍需按原论文核对。'
        : domain === 'molten_salt_reactor'
        ? '盐和高纯结构材料可得，但水氧控制和安全条件要求高。'
        : '默认前驱体多为常见 nitrate/oxide/carbonate；采购前需按目标配方核对纯度。',
    },
    {
      id: 'experimental_complexity',
      label: '实验复杂度',
      score: clamp(domain === 'molten_salt_reactor' ? 42 : domain === 'alloy_corrosion' ? 58 : 70),
      rationale: domain === 'molten_salt_reactor'
        ? '高温熔盐、腐蚀和杂质控制使实验复杂度较高。'
        : '实验难度中等；主要风险来自相纯度、气氛和后处理。',
    },
    {
      id: 'compute_risk',
      label: '计算风险',
      score: clamp(selectedIdea ? 76 : 52),
      rationale: selectedIdea
        ? '已有模型建议，可进入结构搭建和输入文件阶段。'
        : '没有证据绑定模型，必须先手动建模再提交计算。',
    },
  ];
  const score = clamp(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const level = score >= 75 ? 'high' : score >= 58 ? 'medium' : 'low';
  const blockers = dimensions.filter((item) => item.score < 60).map((item) => `${item.label}: ${item.rationale}`);
  return {
    score,
    level,
    decision: level === 'high'
      ? '可以进入结构确认和第一轮实验/计算设计。'
      : level === 'medium'
        ? '可以推进，但需要先补齐低分项，不建议直接给最终实验结论。'
        : '证据不足，应先补文献、确认结构或手动建模。',
    dimensions,
    blockers,
    next_actions: blockers.length
      ? ['补充目标材料/盐组分/晶面/吸附物', '用 Modeling Agent 手动确认结构', '用更多可核验论文校准合成条件']
      : ['确认推荐模型', '生成计算输入', '按实验矩阵启动第一轮验证'],
  };
}

function buildExperimentPlan(domain, synthesisPlan, formulas) {
  const target = formulas[0] || synthesisPlan.routes[0]?.target || 'target material';
  if (domain === 'molten_salt_reactor') {
    return {
      engine: 'BayBE-compatible deterministic DoE',
      objective: '最大化腐蚀抗性/质量变化稳定性，同时约束盐纯度和实验安全。',
      variables: [
        { name: 'salt', type: 'categorical', range: ['FLiNaK', 'FLiBe', 'chloride salt'] },
        { name: 'temperature_C', type: 'continuous', range: [550, 750] },
        { name: 'exposure_h', type: 'continuous', range: [50, 500] },
        { name: 'alloy_or_material', type: 'categorical', range: [target, 'Ni-based alloy', '316H/SS reference'] },
        { name: 'redox_control', type: 'categorical', range: ['uncontrolled baseline', 'low impurity', 'redox buffered'] },
      ],
      constraints: ['水/氧杂质必须记录', '每个温度至少一个 reference coupon', '高温熔盐实验需要安全审批'],
      first_batch: [
        { run: 1, salt: 'FLiNaK', temperature_C: 600, exposure_h: 100, material: target, redox_control: 'low impurity' },
        { run: 2, salt: 'FLiNaK', temperature_C: 700, exposure_h: 100, material: target, redox_control: 'low impurity' },
        { run: 3, salt: 'chloride salt', temperature_C: 650, exposure_h: 100, material: target, redox_control: 'redox buffered' },
        { run: 4, salt: 'FLiNaK', temperature_C: 650, exposure_h: 250, material: '316H/SS reference', redox_control: 'low impurity' },
      ],
      next_round_policy: '用质量变化、截面 EDS/XPS 和表面腐蚀层厚度更新 BayBE/BoFire surrogate，再推荐下一组温度-盐组分-材料组合。',
      stop_conditions: ['reference 样失败时暂停', '质量损失超过安全阈值', '两轮 DoE 后提升小于 5%'],
    };
  }
  if (domain === 'co2_hydrogenation') {
    return {
      engine: 'BayBE-compatible deterministic DoE',
      objective: '最大化目标产物选择性和单位铜质量活性，控制烧结和副产物。',
      variables: [
        { name: 'Cu_loading_wt', type: 'continuous', range: [5, 35] },
        { name: 'Zn_Cu_ratio', type: 'continuous', range: [0.3, 2.0] },
        { name: 'calcination_C', type: 'continuous', range: [300, 450] },
        { name: 'reduction_C', type: 'continuous', range: [220, 320] },
        { name: 'H2_CO2_ratio', type: 'continuous', range: [2, 4] },
      ],
      constraints: ['固定 GHSV 后再比较活性', '每批必须有 commercial Cu/ZnO reference', '先做低压安全验证'],
      first_batch: [
        { run: 1, Cu_loading_wt: 20, Zn_Cu_ratio: 1.0, calcination_C: 350, reduction_C: 250, H2_CO2_ratio: 3 },
        { run: 2, Cu_loading_wt: 15, Zn_Cu_ratio: 1.5, calcination_C: 400, reduction_C: 280, H2_CO2_ratio: 3 },
        { run: 3, Cu_loading_wt: 25, Zn_Cu_ratio: 0.7, calcination_C: 350, reduction_C: 300, H2_CO2_ratio: 4 },
        { run: 4, Cu_loading_wt: 20, Zn_Cu_ratio: 1.0, calcination_C: 450, reduction_C: 250, H2_CO2_ratio: 2 },
      ],
      next_round_policy: '用 CO2 conversion、methanol selectivity 和 Cu dispersion 作为多目标输入，推荐下一轮配比和热处理条件。',
      stop_conditions: ['选择性低于 reference 80%', '重复实验 RSD > 15%', '催化剂明显烧结'],
    };
  }
  return {
    engine: 'BoFire/BayBE-compatible deterministic DoE',
    objective: '在可操作范围内最大化目标性质，同时最小化相杂质和制备复杂度。',
    variables: [
      { name: 'synthesis_method', type: 'categorical', range: synthesisPlan.routes.map((route) => route.method) },
      { name: 'temperature_C', type: 'continuous', range: [600, 950] },
      { name: 'time_h', type: 'continuous', range: [6, 24] },
      { name: 'atmosphere', type: 'categorical', range: ['air', 'O2', 'Ar'] },
      { name: 'precursor_excess_pct', type: 'continuous', range: [0, 10] },
    ],
    constraints: ['先用小批量样品验证相纯度', '每轮保留一个文献基准条件', '所有样品必须记录实际质量和热程序'],
    first_batch: [
      { run: 1, method: synthesisPlan.routes[0]?.method || 'solid-state reaction', temperature_C: 700, time_h: 8, atmosphere: 'air', precursor_excess_pct: 0 },
      { run: 2, method: synthesisPlan.routes[0]?.method || 'solid-state reaction', temperature_C: 850, time_h: 12, atmosphere: 'air', precursor_excess_pct: 5 },
      { run: 3, method: 'sol-gel', temperature_C: 650, time_h: 6, atmosphere: 'O2', precursor_excess_pct: 3 },
      { run: 4, method: 'solid-state reaction', temperature_C: 900, time_h: 18, atmosphere: 'Ar', precursor_excess_pct: 5 },
    ],
    next_round_policy: '把 XRD 相纯度、目标性质和失败原因录入优化器，再收窄温度/时间/前驱体窗口。',
    stop_conditions: ['连续两轮无相纯目标样品', '出现不可接受安全风险', '目标性质低于 baseline 20%'],
  };
}

function buildComputeBridge({ selectedIdea, modelStructure, domain }) {
  const formula = selectedIdea?.blueprint?.structure_source?.formula || selectedIdea?.material_family || modelStructure?.filename || 'confirmed model';
  return {
    engine: 'pymatgen/atomate2-compatible',
    structure_status: modelStructure?.atoms?.length
      ? `已存在结构：${modelStructure.filename} (${modelStructure.atoms.length} atoms)`
      : selectedIdea
        ? `可从推荐模型进入建模：${formula}`
        : '无证据绑定模型，需要先进入 Modeling Agent 自建结构',
    recommended_workflows: domain === 'molten_salt_reactor'
      ? ['bulk/surface stability', 'corrosion product reaction energy', 'defect or segregation screening']
      : domain === 'co2_hydrogenation'
        ? ['slab relaxation', 'adsorbate placement', 'static/DOS follow-up']
        : ['bulk relaxation', 'phase stability', 'property screening'],
    handoff: selectedIdea?.blueprint?.handoff_prompt || null,
  };
}

function analyzeResearchStack({ prompt, research, selectedIdea, modelStructure }) {
  const adapters = buildAdapterRegistry();
  const text = evidenceText({ prompt, research, selectedIdea });
  const domain = detectDomain(text);
  const formulas = extractFormulaCandidates({ research, selectedIdea, text });
  const recipeSearch = searchRecipes({
    query: text || prompt,
    formulas,
    domain,
    limit: 8,
  });
  const synthesis = routeForDomain(domain, formulas, recipeSearch.matches);
  const feasibility = buildFeasibility({ research, selectedIdea, domain, synthesisPlan: synthesis, recipeSearch });
  const experiment = buildExperimentPlan(domain, synthesis, formulas);
  const compute = buildComputeBridge({ selectedIdea, modelStructure, domain });
  const papers = Array.isArray(research?.papers) ? research.papers : [];
  const structures = Array.isArray(research?.structures) ? research.structures : [];

  return {
    version: 'materials-research-stack.v1',
    generated_at: new Date().toISOString(),
    question: asText(prompt || research?.user_goal?.interpreted_goal || ''),
    domain,
    evidence: {
      verified_paper_count: countVerifiedPapers(papers),
      paper_count: papers.length,
      structure_count: structures.length,
      formulas,
      guardrail: '模型、合成路线和实验矩阵必须来自文献/结构/领域规则证据；无结构证据时不自动推荐模型。',
    },
    recipe_index: {
      ...recipeSearch,
      index: {
        ...recipeSearch.index,
        path: recipeSearch.index?.path ? 'server/data/recipe-index/ceder-recipes.jsonl.gz' : null,
      },
    },
    synthesis,
    feasibility,
    experiment,
    compute,
    adapters,
    adapter_summary: adapterSummary(adapters),
  };
}

module.exports = {
  OPEN_SOURCE_ADAPTERS,
  adapterSummary,
  analyzeResearchStack,
  buildAdapterRegistry,
  recipeIndexStatus,
  searchRecipes,
};
