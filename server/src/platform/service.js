const { MemoryService, recall, hydrate } = require("../memory/service");
const { randomUUID } = require("node:crypto");
const { fail } = require("../knowledge/store");
const { projectIn } = require("../knowledge/service");
const domain = require("./research-domain");
const { createGeminiGateway } = require("./model-gateway");
const { hydrateMessage } = require("./inference");
const at = () => new Date().toISOString();
const clean = (s, max = 1000) =>
  String(s || "")
    .trim()
    .slice(0, max);
const modelCatalog = [
  {
    id: "materials",
    name: "EliangMat AI 材料模型",
    provider: "EliangMat AI 自有服务",
    purpose: "材料研究规划、证据理解与科研推理",
    input: 8,
    cached: 2,
    output: 24,
    external: false,
    connected: false,
  },
  {
    id: "reasoning",
    name: "通用推理模型 A",
    provider: "外部服务 · 接入位",
    purpose: "复杂推理、长文分析与研究方案比较",
    input: 12,
    cached: 3,
    output: 48,
    external: true,
    connected: false,
  },
  {
    id: "lite",
    name: "EliangMat AI 轻量模型",
    provider: "EliangMat AI 自有服务",
    purpose: "实验记录整理、材料信息抽取",
    input: 2,
    cached: 0.5,
    output: 8,
    external: false,
    connected: false,
  },
];
const resources = [
  {
    id: "calphad",
    name: "CALPHAD / 相平衡",
    kind: "simulation",
    method: "相稳定性与工艺窗口",
    state: "unconfigured",
    channel: "热力学数据库与引擎",
    note: "需配置引擎及数据库许可证，不直接预测拉伸强度。",
  },
  {
    id: "dft",
    name: "DFT / 第一性原理",
    kind: "simulation",
    method: "形成能、缺陷与电子结构",
    state: "unconfigured",
    channel: "VASP / Quantum ESPRESSO",
    note: "仅在原子尺度问题需要时使用；输入、赝势与收敛参数需要审核。",
  },
  {
    id: "md",
    name: "MD / 分子动力学",
    kind: "simulation",
    method: "扩散、界面与变形机理",
    state: "unconfigured",
    channel: "LAMMPS / 合适的势函数",
    note: "须确认势函数适用范围，不能直接等同于宏观性能。",
  },
  {
    id: "cfd",
    name: "CFD / 流体与传热",
    kind: "simulation",
    method: "熔体流动、凝固与温度场",
    state: "unconfigured",
    channel: "OpenFOAM / 求解器",
    note: "涉及熔炼、铸造或增材工艺时，按边界条件选择。",
  },
  {
    id: "furnace",
    name: "熔炼与热处理炉",
    kind: "equipment",
    method: "制备与热处理",
    state: "unconfigured",
    channel: "人工执行 / 设备接口",
    note: "计划、样品编号和温度履历需关联。",
  },
  {
    id: "tensile",
    name: "万能材料试验机",
    kind: "equipment",
    method: "拉伸与压缩测试",
    state: "unconfigured",
    channel: "人工上传 / 设备接口",
    note: "记录试样尺寸、应变速率、温度和原始曲线。",
  },
  {
    id: "sem",
    name: "SEM / EDS",
    kind: "equipment",
    method: "组织与成分表征",
    state: "unconfigured",
    channel: "图像文件 / 工作站",
    note: "图像标尺、样品位置和统计区域需要保存。",
  },
];
function platform(s) {
  if (!s.platform)
    s.platform = {
      version: 1,
      settings: {
        spaceName: "材料研发组",
        monthCap: 50000,
        taskCap: 500,
        lowBalance: 5000,
      },
      models: {},
      externalConsent: {},
      wallets: { balance: 0 },
      orders: [],
      ledger: [],
      usage: [],
      resources: structuredClone(resources),
      members: [],
      workflows: {},
      events: [],
    };
  s.platform.defaults ||= { mode: "private", model: "materials" };
  Object.values(s.platform.workflows).forEach(domain.normalize);
  return s.platform;
}
function workflow(s, id) {
  projectIn(s, id);
  const w = platform(s).workflows[id];
  if (!w) throw fail("该项目还未建立研究计划", 404);
  return domain.normalize(w);
}
function log(p, action, projectId) {
  p.events.unshift({ id: randomUUID(), at: at(), action, projectId });
  p.events = p.events.slice(0, 500);
}
function roleCan(role, scope) {
  if (role === "owner") return true;
  if (
    role === "researcher" &&
    ["read-research", "research", "usage"].includes(scope)
  )
    return true;
  if (role === "finance" && scope === "billing") return true;
  throw fail("当前角色没有此操作权限", 403);
}
function balance(p) {
  const reserved = p.usage
    .filter((u) => u.status === "running")
    .reduce((n, u) => n + u.hold, 0);
  const spent = p.ledger
    .filter((l) => l.kind === "usage" && l.at.slice(0, 7) === at().slice(0, 7))
    .reduce((n, l) => n + l.amount, 0);
  return {
    balance: p.wallets.balance,
    reserved,
    available: p.wallets.balance - reserved,
    monthSpent: spent,
  };
}
function tasks(demo) {
  return [
    {
      id: "screen",
      name: "相稳定性与工艺窗口筛选",
      method: "CALPHAD",
      phase: "simulation",
      dependencies: [],
      status: demo ? "completed" : "pending",
      note: demo
        ? "演练：12 组方案 → 3 个候选"
        : "按研究问题选用；需引擎与数据库授权",
    },
    {
      id: "prepare",
      name: "样品制备与热处理",
      method: "熔炼 / 热处理",
      phase: "experiment",
      dependencies: ["screen"],
      status: demo ? "completed" : "pending",
      note: demo
        ? "演练：H-002 工艺履历已归档"
        : "关联候选、样品编号和工艺履历",
    },
    {
      id: "tensile",
      name: "拉伸测试（工况待确认）",
      method: "拉伸试验",
      phase: "experiment",
      dependencies: ["prepare"],
      status: demo ? "completed" : "pending",
      note: demo ? "演练：3 个试样结果已导入" : "记录试样尺寸、温度与应变速率",
    },
    {
      id: "sem",
      name: "SEM 组织定量分析",
      method: "SEM / EDS",
      phase: "experiment",
      dependencies: ["prepare"],
      status: demo ? "paused" : "pending",
      note: demo ? "演练：8 / 12 张图像，等待继续" : "可与力学测试并行",
    },
    {
      id: "review",
      name: "拉伸数据质量复核",
      method: "人工复核",
      phase: "review",
      dependencies: ["tensile"],
      status: demo ? "waiting" : "pending",
      note: "复核原始证据后才可用于分析",
    },
    {
      id: "learn",
      name: "误差分析与下一轮选择",
      method: "反馈与迭代",
      phase: "feedback",
      dependencies: ["review"],
      status: "blocked",
      note: "等待质量复核；不会自动训练公司模型",
    },
  ];
}
function extraTasks(input, existing = []) {
  const extra = Array.isArray(input.extraMethods)
    ? [...new Set(input.extraMethods)]
    : [];
  if (extra.some((id) => !["dft", "md", "cfd"].includes(id)))
    throw fail("未知仿真方法");
  const names = {
    dft: ["原子尺度能量与缺陷分析", "DFT"],
    md: ["扩散、界面与局部变形分析", "MD"],
    cfd: ["流动、凝固与温度场分析", "CFD"],
  };
  return {
    extraMethods: extra,
    tasks: Object.entries(names)
      .filter(
        ([id]) =>
          extra.includes(id) ||
          existing.some((t) => t.id === id && t.status === "completed"),
      )
      .map(
        ([id, [name, method]]) =>
          existing.find((t) => t.id === id) || {
            id,
            name,
            method,
            phase: "simulation",
            dependencies: [],
            status: "pending",
            note: "按研究问题补充；执行前需核对输入、适用范围与收敛条件",
          },
      ),
  };
}
function createWorkflow(project, input, demo = false) {
  const targets = domain.requirements(
      demo
        ? {
            targetStrength: 350,
            targetElongation: 8,
            sampleBudget: 6,
            testTemperature: 25,
            standard: "演练标准 v1",
            strengthDefinition: "Rp0.2",
            environment: "空气",
            repeats: 3,
            durationWeeks: 4,
            ...input,
          }
        : input,
    ),
    extra = extraTasks(input);
  const allTasks = tasks(demo);
  allTasks.splice(1, 0, ...extra.tasks);
  // Optional mechanism studies run in parallel unless the researcher explicitly adds a dependency.
  return {
    projectId: project.id,
    demo,
    goal: clean(input.goal, 3000),
    family: clean(input.family, 80) || "合金",
    ...targets,
    extraMethods: extra.extraMethods,
    round: demo ? 2 : 1,
    planState: demo ? "approved" : "draft",
    revision: 1,
    goalRevision: 1,
    quality: "pending",
    tasks: allTasks,
    messages: [],
    links: [],
    observations: [],
    nextPlan: null,
    candidates: demo
      ? [
          {
            id: "C-017",
            composition: "Al 余量 / Mg 4.5 / Si 0.8",
            basis: "wt%",
            process: "P-02 · 时效工艺",
            strength: "340–380",
            elongation: "7.0–10.5",
            selected: true,
          },
          {
            id: "C-018",
            composition: "Al 余量 / Mg 4.8 / Si 0.9",
            basis: "wt%",
            process: "P-03 · 工艺探索",
            strength: "345–390",
            elongation: "7.5–11.0",
            selected: false,
          },
          {
            id: "C-019",
            composition: "Al 余量 / Mg 4.2 / Si 0.7",
            basis: "wt%",
            process: "P-01 · 参考方案",
            strength: "330–370",
            elongation: "8.0–11.5",
            selected: false,
          },
        ]
      : [],
    samples: demo
      ? [
          {
            id: "AL-017-A",
            candidate: "C-017",
            batch: "H-002",
            process: "P-02",
            status: "已测试",
            note: "虚构演练记录",
          },
          {
            id: "AL-017-B",
            candidate: "C-017",
            batch: "H-002",
            process: "P-02",
            status: "待组织分析",
            note: "虚构演练记录",
          },
          {
            id: "AL-REF",
            candidate: "参考样",
            batch: "H-002",
            process: "P-01",
            status: "已测试",
            note: "虚构演练记录",
          },
        ]
      : [],
    result: demo
      ? {
          strength: 361,
          strengthError: 12,
          elongation: 7.4,
          elongationError: 1.6,
          conditions: "室温；3 个试样；全部为软件流程演练数据",
          raw: "示例记录：AL-017-A / H-002 / P-02。屈服强度 361 ± 12 MPa，延伸率 7.4 ± 1.6%。这些数值仅用于软件验收，不能作为材料研发依据。",
        }
      : null,
    createdAt: at(),
    updatedAt: at(),
  };
}

class PlatformService {
  constructor(store, { gateway, development = false } = {}) {
    this.store = store;
    this.development = development;
    this.store.platformEnvironment = development ? "development" : "production";
    this.gateway = gateway || createGeminiGateway();
    this.baseModels = development
      ? modelCatalog
      : [
          {
            id: "materials",
            name: "账号记忆检索",
            provider: "EliangMat AI",
            purpose: "检索已有项目与历史记录，不调用生成式模型",
            input: 0,
            cached: 0,
            output: 0,
            external: false,
            connected: true,
          },
        ];
    this.activeInference = new Set();
    this.memory = new MemoryService(store);
  }
  overview(owner, role = "owner") {
    const s = this.store.read(owner);
    const p = platform(s);
    return {
      account: this.development
        ? owner.endsWith("B")
          ? "客户 B"
          : "客户 A"
        : "我的空间",
      role,
      environment: this.development ? "development" : "production",
      capabilities: {
        sandbox: this.development,
        payments: false,
        teamInvites: false,
      },
      settings: p.settings,
      defaults: p.defaults,
      projects: s.projects.map((project) => ({
        ...project,
        workflow:
          role !== "finance" && p.workflows[project.id]
            ? {
                demo: p.workflows[project.id].demo,
                goal: p.workflows[project.id].goal,
                round: p.workflows[project.id].round,
                completed: p.workflows[project.id].tasks.filter(
                  (t) => t.status === "completed",
                ).length,
                tasks: p.workflows[project.id].tasks.length,
              }
            : null,
      })),
      models: this.catalog(),
      inferenceUsage: (p.inferenceCalls || [])
        .filter((c) => role !== "researcher" || c.role === role)
        .map(({ inputHash, ...c }) => c),
      projectModels: p.models,
      externalConsent: p.externalConsent,
      wallet: !this.development || role === "researcher" ? null : balance(p),
      orders: !this.development || role === "researcher" ? [] : p.orders,
      ledger: !this.development || role === "researcher" ? [] : p.ledger,
      usage: this.development ? p.usage : [],
      resources: role === "finance" ? [] : p.resources,
      members:
        role === "owner"
          ? [
              {
                id: "owner",
                name: "你",
                email: "",
                role: "owner",
                projectIds: [],
                status: "active",
                budget: p.settings.monthCap,
              },
              ...(this.development
                ? p.members
                : p.members.filter((m) => m.status === "active")),
            ]
          : [],
      events: p.events
        .filter((e) => role !== "finance" || !e.projectId)
        .slice(0, 30),
    };
  }
  createProject(owner, input, role) {
    if (input.demo && !this.development)
      throw fail("当前服务不提供演练项目", 403);
    roleCan(role, "research");
    if (!clean(input.name, 100)) throw fail("请输入项目名称");
    if (!input.demo && clean(input.goal, 3000).length < 8)
      throw fail("请用至少 8 个字符描述材料目标");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      if (s.projects.length >= 30)
        throw fail("项目数量已达当前空间上限，请联系管理员");
      const project = {
        id: randomUUID(),
        name: clean(input.name, 100),
        mode: p.defaults.mode,
        defaultsSnapshot: structuredClone(p.defaults),
        consent:
          p.defaults.mode === "contribute"
            ? { ...p.defaults.consent, inherited: true }
            : null,
        createdAt: at(),
      };
      s.projects.push(project);
      p.workflows[project.id] = createWorkflow(
        project,
        input,
        input.demo === true,
      );
      p.models[project.id] = p.defaults.model;
      if (p.defaults.externalConsent)
        p.externalConsent[project.id] = structuredClone(
          p.defaults.externalConsent,
        );
      log(p, "创建研发项目：" + project.name, project.id);
      return project;
    });
  }
  attachWorkflow(owner, id, input, role) {
    roleCan(role, "research");
    if (clean(input.goal, 3000).length < 8) throw fail("请补充具体材料目标");
    return this.store.update(owner, (s) => {
      const project = projectIn(s, id);
      const p = platform(s);
      if (p.workflows[id]) throw fail("项目已有研究计划", 409);
      p.workflows[id] = createWorkflow(project, input, false);
      log(p, "建立研究计划", id);
      return p.workflows[id];
    });
  }
  project(owner, id, role) {
    roleCan(role, "read-research");
    const s = this.store.read(owner);
    const project = projectIn(s, id);
    const p = platform(s);
    const documents = s.documents.filter((d) => d.projectId === id);
    const w = domain.normalize(p.workflows[id] || null);
    // Data rights can be revoked in the data center; linked evidence must be filtered on every read.
    const validLinks = (w?.links || []).filter((link) =>
      documents.some(
        (d) =>
          d.id === link.documentId &&
          d.rights.rag &&
          d.contentRawHash === link.contentHash &&
          d.evidence?.some((e) => e.id === link.evidenceId && e.reviewed),
      ),
    );
    return {
      project,
      workflow: w
        ? {
            ...w,
            assessment: domain.assess(w),
            nextRoundReadiness: domain.nextRoundReadiness(w),
            datasets: domain.datasets(w),
            links: validLinks,
            nextPlan: w.nextPlan
              ? {
                  ...w.nextPlan,
                  memoryReferences: hydrate(s, id, w.nextPlan.memoryRefs, role),
                }
              : null,
            messages: w.messages.map((msg) => hydrateMessage(s, id, msg, role)),
            tasks: w.tasks.map((task) => {
              let note = task.note;
              if (task.id === "sem" && w.demo)
                note =
                  task.status === "completed"
                    ? "演练：12 / 12 张图像，结果已归档"
                    : task.status === "running"
                      ? "演练：8 / 12 张图像，分析进行中"
                      : "演练：8 / 12 张图像，等待继续";
              if (task.id === "review")
                note =
                  w.quality === "accepted"
                    ? "复核结论已归档，可用于本项目分析"
                    : w.quality === "excluded"
                      ? "本批记录暂不纳入，等待补充与再次复核"
                      : "核对原始证据、样品对应与测试条件";
              if (task.id === "learn")
                note = w.nextPlan
                  ? w.nextPlan.status === "approved"
                    ? "下一轮计划已确认；执行等待资源接入"
                    : "下一轮草案已生成，等待你确认"
                  : domain.nextRoundReadiness(w).reason;
              const blockedReason =
                !w.demo && ["pending", "paused"].includes(task.status)
                  ? w.planState !== "approved"
                    ? "待确认研究路线"
                    : task.dependencies.some(
                          (dep) =>
                            w.tasks.find((t) => t.id === dep)?.status !==
                            "completed",
                        )
                      ? "等待前置任务验收"
                      : !task.contract
                        ? "待定义输入、负责人及验收条件"
                        : task.contract.execution === "manual"
                          ? "待人工执行并回传"
                          : task.contract.execution === "curve-csv"
                            ? "待上传原始曲线"
                            : "自动执行资源未接通"
                  : "";
              return { ...task, note, blockedReason };
            }),
          }
        : null,
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        reviewed: d.evidence?.filter((e) => e.reviewed).length || 0,
        rag: d.rights.rag,
        demo: !!d.demo,
      })),
      events: p.events.filter((e) => e.projectId === id).slice(0, 40),
    };
  }
  updateGoal(owner, id, input, role) {
    roleCan(role, "research");
    if (clean(input.goal, 3000).length < 8) throw fail("请补充具体材料目标");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      const extra = extraTasks(input, w.tasks);
      w.tasks = w.tasks.filter((t) => !["dft", "md", "cfd"].includes(t.id));
      w.tasks.splice(1, 0, ...extra.tasks);
      w.extraMethods = extra.extraMethods;
      w.tasks.find((t) => t.id === "learn").status =
        w.quality === "accepted" ? "pending" : "blocked";
      w.goalHistory ||= [];
      w.goalHistory.push({
        revision: w.goalRevision,
        routeRevision: w.revision,
        goal: w.goal,
        ...domain.requirements(w),
        at: at(),
      });
      const targets = domain.requirements(input, w);
      Object.assign(w, {
        goal: clean(input.goal, 3000),
        family: clean(input.family, 80),
        ...targets,
        planState: "draft",
        nextPlan: null,
        revision: w.revision + 1,
        goalRevision: w.goalRevision + 1,
        updatedAt: at(),
      });
      log(platform(s), "目标变更；计划需要重新确认", id);
      return w;
    });
  }
  approvePlan(owner, id, input, role) {
    roleCan(role, "research");
    if (input.confirm !== true) throw fail("请确认已审核研究路线");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      if (input.revision !== w.revision)
        throw fail("计划已变更，请重新查看后确认", 409);
      const issues = domain.requirements(w).requirementIssues;
      if (issues.length) throw fail(issues.join("；"), 409);
      w.planState = "approved";
      log(platform(s), "确认研究路线 v" + w.revision, id);
      return w;
    });
  }
  taskAction(owner, id, taskId, action, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "research");
    if (!["start", "pause", "complete-demo"].includes(action))
      throw fail("未知任务操作");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      const task = w.tasks.find((t) => t.id === taskId);
      if (!task || ["review", "learn"].includes(taskId))
        throw fail("该任务需要专门的复核或反馈流程");
      if (!w.demo)
        throw fail(
          "真实计算与设备未接通；可先记录实验结果，或使用独立演练项目体验运行",
          409,
        );
      if (w.planState !== "approved")
        throw fail("请先确认当前版本的研究路线", 409);
      if (
        task.dependencies.some(
          (dep) => w.tasks.find((t) => t.id === dep)?.status !== "completed",
        )
      )
        throw fail("前置任务尚未完成", 409);
      if (action === "start" && !["pending", "paused"].includes(task.status))
        throw fail("此任务不能开始", 409);
      if (action === "pause" && task.status !== "running")
        throw fail("只有进行中的任务可以暂停", 409);
      if (action === "complete-demo" && task.status !== "running")
        throw fail("请先开始演练任务", 409);
      task.status =
        action === "start"
          ? "running"
          : action === "pause"
            ? "paused"
            : "completed";
      task.updatedAt = at();
      log(platform(s), task.name + "：" + task.status + "（流程演练）", id);
      return task;
    });
  }
  review(owner, id, input, role) {
    roleCan(role, "research");
    if (!["accepted", "excluded"].includes(input.decision))
      throw fail("请选择复核结论");
    if (input.confirm !== true || clean(input.note, 2000).length < 4)
      throw fail("请核对记录并填写复核说明");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      if (!w.result) throw fail("请先添加实验结果", 409);
      if (input.observationId) {
        const record = w.observations.find((r) => r.id === input.observationId);
        if (!record) throw fail("记录不存在", 404);
        w.result = record;
      }
      if (input.revision != null && input.revision !== w.revision)
        throw fail("目标已变更，请重新复核", 409);
      w.quality = input.decision;
      w.review = {
        at: at(),
        by: owner,
        note: clean(input.note, 2000),
        decision: input.decision,
      };
      w.result.quality = input.decision;
      w.result.targetRevision = w.goalRevision;
      w.result.reviewHistory ||= [];
      w.result.reviewHistory.push(w.review);
      w.result.review = w.review;
      const stored = w.observations.find((r) => r.id === w.result.id);
      if (stored) Object.assign(stored, w.result);
      w.tasks.find((t) => t.id === "review").status =
        input.decision === "accepted" ? "completed" : "waiting";
      w.tasks.find((t) => t.id === "learn").status =
        input.decision === "accepted" ? "pending" : "blocked";
      w.nextPlan = null;
      log(
        platform(s),
        input.decision === "accepted"
          ? "实验记录已复核，可进入项目分析"
          : "实验记录暂不纳入分析",
        id,
      );
      return w;
    });
  }
  selectCandidate(owner, id, candidateId, selected, role) {
    roleCan(role, "research");
    if (typeof selected !== "boolean") throw fail("请选择候选状态");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      const c = w.candidates.find((c) => c.id === candidateId);
      if (!c) throw fail("候选不存在", 404);
      if (selected) domain.requireCandidate(c);
      c.selected = selected;
      return c;
    });
  }
  addCandidate(owner, id, input, role) {
    roleCan(role, "research");
    if (!clean(input.composition) || !["wt%", "at%"].includes(input.basis))
      throw fail("需要成分及 wt% / at% 基准");
    const validation = domain.composition(input.composition, input.basis);
    if (!validation.valid) throw fail(validation.note);
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      if (w.candidates.length >= 100) throw fail("候选数量达到上限");
      const c = {
        version: 1,
        history: [],
        id: "C-" + randomUUID().slice(0, 8),
        composition: clean(input.composition),
        basis: input.basis,
        process: clean(input.process),
        strength: "待计算",
        elongation: "待计算",
        selected: false,
      };
      w.candidates.push(c);
      log(platform(s), "登记材料候选 " + c.id, id);
      return c;
    });
  }
  addSample(owner, id, input, role) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      const sampleId = clean(input.id, 80);
      if (!sampleId || w.samples.some((x) => x.id === sampleId))
        throw fail("样品编号不能为空或重复");
      const candidate = w.candidates.find((c) => c.id === input.candidate);
      domain.requireCandidate(candidate);
      if (w.samples.length >= 100) throw fail("样品数量达到上限");
      const sample = {
        id: sampleId,
        version: 1,
        candidateVersion: candidate.version || 1,
        candidateSnapshot: structuredClone(candidate),
        round: w.round,
        history: [],
        candidate: input.candidate,
        batch: clean(input.batch, 80),
        process: clean(input.process, 1000),
        status: "已登记",
        note: clean(input.note),
      };
      w.samples.push(sample);
      log(platform(s), "登记样品 " + sampleId, id);
      return sample;
    });
  }
  observation(owner, id, input, role) {
    roleCan(role, "research");
    const strength = Number(input.strength),
      elongation = Number(input.elongation);
    if (
      !Number.isFinite(strength) ||
      strength <= 0 ||
      !Number.isFinite(elongation) ||
      elongation < 0 ||
      !clean(input.conditions) ||
      clean(input.raw, 10000).length < 20
    )
      throw fail("请填写数值、测试条件与至少 20 个字符的原始记录摘录");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      if (!w.samples.some((sample) => sample.id === input.sampleId))
        throw fail("请选择本项目样品");
      if (w.observations.length >= 100) throw fail("记录数量达到上限");
      const record = {
        id: randomUUID(),
        sampleId: input.sampleId,
        strength,
        elongation,
        strengthError: null,
        elongationError: null,
        conditions: clean(input.conditions, 2000),
        raw: clean(input.raw, 10000),
        source: "人工导入；不代表平台执行完成",
        quality: "pending",
        targetRevision: w.goalRevision,
        round: w.round,
        sampleSnapshot: structuredClone(
          w.samples.find((s) => s.id === input.sampleId),
        ),
        measurement: domain.measurement(input.measurement || input),
        metrics: require("./task-execution").parseMetrics(input.metrics),
        artifact: require("./task-execution").rawArtifact(input.artifact),
        recordedAt: at(),
      };
      w.observations.unshift(record);
      w.result = record;
      w.quality = "pending";
      w.nextPlan = null;
      // Importing a measurement never marks instrument execution complete.
      w.tasks.find((t) => t.id === "review").status = "waiting";
      w.tasks.find((t) => t.id === "learn").status = "blocked";
      log(platform(s), "录入实验记录；等待质量复核", id);
      return record;
    });
  }
  syncEvidence(owner, id, role) {
    roleCan(role, "research");
    return this.store.update(owner, (s) => {
      const w = workflow(s, id);
      w.links = s.documents
        .filter((d) => d.projectId === id && d.rights.rag)
        .flatMap((d) =>
          (d.evidence || [])
            .filter((e) => e.reviewed)
            .map((e) => ({
              documentId: d.id,
              evidenceId: e.id,
              title: d.title,
              quote: e.quote,
              page: e.page,
              kind: e.kind,
              contentHash: d.contentRawHash,
              demo: !!d.demo,
            })),
        );
      if (!w.links.length)
        throw fail(
          "没有已获项目检索许可且已复核的证据，请先在材料与证据中处理",
          409,
        );
      log(platform(s), "同步 " + w.links.length + " 条已复核证据到项目", id);
      return w.links;
    });
  }
  conversation(owner, role) {
    roleCan(role, "read-research");
    const s = this.memory.ensure(owner);
    return this.conversationFromState(s, role);
  }

  selectConversation(owner, threadId, role) {
    roleCan(role, "research");
    this.store.update(owner, (s) => {
      const p = platform(s);
      p.accountThreads ||= [];
      p.activeConversations ||= {};
      let t = p.accountThreads.find(
        (t) => t.id === threadId && t.role === role,
      );
      if (threadId && !t) throw fail("对话不存在", 404);
      if (!threadId) {
        t = { id: randomUUID(), title: "新对话", role, at: at() };
        p.accountThreads.unshift(t);
      }
      p.activeConversations[role] = t.id;
    });
    return this.conversation(owner, role);
  }
  message(owner, id, message, role) {
    roleCan(role, "research");
    if (!clean(message, 3000)) throw fail("请输入研究补充");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      const messages = id
        ? workflow(s, id).messages
        : (p.accountMessages ||= []);
      if (!id && !p.activeConversations?.[role]) {
        p.activeConversations ||= {};
        const t = {
          id: randomUUID(),
          title: clean(message, 30),
          role,
          at: at(),
        };
        (p.accountThreads ||= []).unshift(t);
        p.activeConversations[role] = t.id;
      }
      const threadId = id ? undefined : p.activeConversations[role];
      const thread = p.accountThreads?.find((t) => t.id === threadId);
      if (thread?.title === "新对话") thread.title = clean(message, 30);
      // Search before storing the new question: never retrieve the current prompt as its own evidence.
      const context = recall(s, id, message, role);
      const question =
        /[？?]|什么|多少|哪些|怎么|如何|还记|是否|有没有|能不能|^接下来|^继续|^回顾|what|how|where|remember/i.test(
          message,
        );
      const planning =
        /建立|创建|新建|开发.*材料|帮我.*计划|规划|设计.*合金|create.*project/i.test(
          message,
        );
      const factual = /目标|工况|强度|达标|结果|进度|进展|goal|result/i.test(
        message,
      );
      const assistant = {
        id: randomUUID(),
        role: "assistant",
        text: !context.enabled
          ? "对话已保存。自动记忆已关闭，这次没有读取历史内容。"
          : !question
            ? "已自动保留这次补充，后续相关对话会带上这段背景。"
            : context.records.length
              ? "根据账号里已经保存的记录："
              : "目前账号已保存的内容里没有找到相关记录。你可以直接在这里补充，我会自动保留。",
        answerMode: planning
          ? "draft"
          : question && context.records.length
            ? factual
              ? "facts"
              : "recall"
            : "acknowledge",
        actionDraft: planning
          ? { goal: clean(message, 3000), projectId: id || undefined }
          : undefined,
        method: "本地记忆检索 · 未调用语言模型",
        memoryRefs: context.refs,
        modelId: p.models[id] || "materials",
        visibility: id ? undefined : role,
        threadId,
        memoryTrace: {
          at: context.at,
          method: context.method,
          enabled: context.enabled,
          trainingSubmitted: false,
        },
        at: at(),
      };
      if (planning)
        assistant.text =
          "已整理为待确认的研究需求。下一步核对性能阈值、工况、标准、重复数、周期和预算；随后定义候选、按问题选择仿真，并安排制备、表征、复核及下一轮验证。点击下方按钮打开可编辑草稿，确认前不会创建或执行任务。";
      else if (factual && context.enabled && context.records.length)
        assistant.text =
          "下面分别列出可读取的当前目标、实验结果和任务状态。没有对应记录的事项尚无法确认；复核通过也不等于目标达成。";
      messages.push(
        {
          id: randomUUID(),
          role: "user",
          text: clean(message, 3000),
          question,
          visibility: id ? undefined : role,
          threadId,
          at: at(),
        },
        assistant,
      );
      return messages
        .filter(
          (msg) =>
            (!msg.visibility || msg.visibility === role) &&
            (id || msg.threadId === threadId),
        )
        .map((msg) => ({
          ...msg,
          memoryReferences: hydrate(s, id, msg.memoryRefs, role),
        }));
    });
  }
  selectModel(owner, id, input, role) {
    roleCan(role, "research");
    const model = this.catalog().find((m) => m.id === input.model);
    if (!model) throw fail("未知模型");
    return this.store.update(owner, (s) => {
      projectIn(s, id);
      const p = platform(s);
      if (
        model.external &&
        input.externalConsent !== true &&
        (!p.externalConsent[id] ||
          (model.id === "gemini" &&
            p.externalConsent[id].fingerprint !== model.fingerprint))
      )
        throw fail("选择外部服务前需要明确确认数据处理范围");
      if (model.id === "gemini" && input.externalConsent === true)
        roleCan(role, "owner");
      if (model.external && input.externalConsent === true)
        p.externalConsent[id] = {
          at: at(),
          by: owner,
          scope: "future-inference-only",
          fingerprint: model.fingerprint || null,
        };
      if (!model.external) delete p.externalConsent[id];
      p.models[id] = model.id;
      log(
        p,
        "选择研究模型：" +
          model.name +
          (model.connected ? "（接口已配置）" : "（尚待服务接通）"),
        id,
      );
      return model;
    });
  }
  defaults(owner, input, role) {
    roleCan(role, "owner");
    const model = this.catalog().find((m) => m.id === input.model);
    if (!model || !["private", "contribute"].includes(input.mode))
      throw fail("默认选项无效");
    if (input.mode === "contribute" && input.consent !== true)
      throw fail("请确认仅新建项目默认参与优化，逐份资料仍需授权");
    if (model.external && input.externalConsent !== true)
      throw fail("请确认新建项目的外部模型处理范围");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      p.defaults = {
        mode: input.mode,
        model: model.id,
        at: at(),
        consent:
          input.mode === "contribute"
            ? { actor: owner, at: at(), version: "new-project-default-v1" }
            : null,
        externalConsent: model.external
          ? {
              by: owner,
              at: at(),
              scope: "new-project-inference-only",
              fingerprint: model.fingerprint || null,
            }
          : null,
      };
      log(p, "更新新建项目默认设置；已有项目保持原配置");
      return p.defaults;
    });
  }
  settings(owner, input, role) {
    roleCan(role, "owner");
    for (const key of ["monthCap", "taskCap", "lowBalance"])
      if (
        !Number.isInteger(input[key]) ||
        input[key] < 0 ||
        input[key] > 100000000
      )
        throw fail("预算须为有效的非负整数分");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      p.settings = {
        ...p.settings,
        spaceName: clean(input.spaceName, 100) || "材料研发组",
        monthCap: input.monthCap,
        taskCap: input.taskCap,
        lowBalance: input.lowBalance,
      };
      log(p, "更新空间设置");
      return p.settings;
    });
  }
  createOrder(owner, input, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "billing");
    const amount = Number(input.amount);
    if (
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 1000000 ||
      !/^[a-zA-Z0-9-]{12,80}$/.test(input.requestId || "")
    )
      throw fail("请输入 1–10000 元测试充值金额及有效请求标识");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      const existing = p.orders.find((o) => o.requestId === input.requestId);
      if (existing) {
        if (existing.amount !== amount)
          throw fail("充值请求标识已用于其他金额", 409);
        return existing;
      }
      if (p.orders.length >= 500) throw fail("开发环境订单数量达到上限");
      const order = {
        id: "TEST-" + randomUUID(),
        requestId: input.requestId,
        amount,
        status: "pending",
        createdAt: at(),
        testOnly: true,
      };
      p.orders.unshift(order);
      log(p, "创建测试充值订单");
      return order;
    });
  }
  payOrder(owner, id, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "billing");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      const order = p.orders.find((o) => o.id === id);
      if (!order) throw fail("订单不存在", 404);
      if (order.status === "paid") return order;
      if (order.status !== "pending") throw fail("订单不可支付", 409);
      order.status = "paid";
      order.paidAt = at();
      p.wallets.balance += order.amount;
      p.ledger.unshift({
        id: randomUUID(),
        kind: "recharge",
        amount: order.amount,
        at: at(),
        orderId: id,
        note: "模拟支付成功 · 测试余额",
      });
      log(p, "测试充值到账，未发生真实支付");
      return order;
    });
  }
  cancelOrder(owner, id, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "billing");
    return this.store.update(owner, (s) => {
      const order = platform(s).orders.find((o) => o.id === id);
      if (!order) throw fail("订单不存在", 404);
      if (order.status !== "pending") throw fail("只能取消待支付订单", 409);
      order.status = "cancelled";
      return order;
    });
  }
  usage(owner, projectId, input, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "usage");
    if (!/^[a-zA-Z0-9-]{12,80}$/.test(input.requestId || ""))
      throw fail("缺少有效请求标识");
    return this.store.update(owner, (s) => {
      projectIn(s, projectId);
      const p = platform(s);
      const previous = p.usage.find((u) => u.requestId === input.requestId);
      if (previous) {
        if (
          previous.projectId !== projectId ||
          previous.hold !== Number(input.budget)
        )
          throw fail("请求标识已用于其他项目或预算", 409);
        return previous;
      }
      const model = this.catalog().find(
        (m) => m.id === (p.models[projectId] || "materials"),
      );
      if (model.id === "gemini")
        throw fail("Gemini 用量来自真实对话调用，不支持示例 Token 结算", 409);
      const hold = Number(input.budget);
      if (!Number.isInteger(hold) || hold <= 0 || hold > p.settings.taskCap)
        throw fail("本次预算不能超过单任务上限");
      const cost = Math.ceil(
        (10000 * model.input + 2000 * model.cached + 3000 * model.output) /
          10000,
      );
      if (hold < cost) throw fail("预算低于本次测试结算费用");
      const b = balance(p);
      if (b.available < hold) throw fail("测试余额不足，请先充值", 402);
      if (b.monthSpent + b.reserved + hold > p.settings.monthCap)
        throw fail("已达到月度预算上限", 402);
      if (p.usage.length >= 500) throw fail("开发调用数量达到上限");
      const run = {
        id: randomUUID(),
        requestId: input.requestId,
        projectId,
        model: structuredClone(model),
        hold,
        cost,
        status: "running",
        tokens: { input: 12000, cached: 2000, output: 3000 },
        at: at(),
        testOnly: true,
      };
      p.usage.unshift(run);
      log(p, "开始计费演练，预留测试预算", projectId);
      return run;
    });
  }
  settle(owner, id, cancel, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "usage");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      const run = p.usage.find((u) => u.id === id);
      if (!run) throw fail("测试调用不存在", 404);
      if (run.status !== "running") return run;
      run.status = cancel ? "cancelled" : "completed";
      run.finishedAt = at();
      if (!cancel) {
        p.wallets.balance -= run.cost;
        p.ledger.unshift({
          id: randomUUID(),
          kind: "usage",
          amount: run.cost,
          at: at(),
          runId: id,
          projectId: run.projectId,
          model: run.model.name,
          tokens: run.tokens,
          note: "计费演练 · 非真实模型调用",
        });
      }
      log(
        p,
        cancel ? "取消计费演练，释放预留预算" : "完成计费演练，按测试用量结算",
        run.projectId,
      );
      return run;
    });
  }
  member(owner, input, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "owner");
    if (
      !["researcher", "finance"].includes(input.role) ||
      !/^\S+@\S+\.\S+$/.test(input.email || "") ||
      !clean(input.name, 80)
    )
      throw fail("请填写成员名称、有效邮箱和角色");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      if (
        p.members.some(
          (m) => m.email.toLowerCase() === input.email.toLowerCase(),
        )
      )
        throw fail("该邮箱已在成员列表中");
      if (p.members.length >= 50) throw fail("开发成员数量达到上限");
      const projectIds = [
        ...new Set(Array.isArray(input.projectIds) ? input.projectIds : []),
      ];
      projectIds.forEach((id) => projectIn(s, id));
      const member = {
        id: randomUUID(),
        name: clean(input.name, 80),
        email: clean(input.email, 200),
        role: input.role,
        projectIds,
        status: "draft",
        budget: 20000,
        createdAt: at(),
      };
      p.members.push(member);
      log(p, "保存成员邀请草稿；未发送邮件");
      return member;
    });
  }
  removeMember(owner, id, role) {
    if (!this.development) throw fail("此功能尚未开通", 403);
    roleCan(role, "owner");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      if (!p.members.some((m) => m.id === id)) throw fail("成员不存在", 404);
      p.members = p.members.filter((m) => m.id !== id);
      log(p, "删除成员邀请草稿");
      return true;
    });
  }
  resource(owner, id, input, role) {
    roleCan(role, "owner");
    return this.store.update(owner, (s) => {
      const p = platform(s);
      const resource = p.resources.find((r) => r.id === id);
      if (!resource) throw fail("资源不存在", 404);
      resource.channel = clean(input.channel, 200);
      resource.note = clean(input.note, 2000);
      resource.state = "unconfigured";
      resource.updatedAt = at();
      log(p, "保存资源接入说明；尚未连接设备");
      return resource;
    });
  }
  report(owner, id, role) {
    const data = this.project(owner, id, role);
    if (!data.workflow) throw fail("项目尚未建立研究计划");
    return {
      format: "eliangmat-research-report-v1",
      exportedAt: at(),
      ...data,
      trainingSubmitted: false,
      hardwareExecuted: false,
    };
  }
}
require("./task-execution").install(PlatformService, {
  workflow,
  platform,
  roleCan,
  log,
  at,
  clean,
});
require("./rounds").install(PlatformService, {
  workflow,
  platform,
  roleCan,
  log,
  at,
  tasks,
});
require("./inference").install(PlatformService, {
  platform,
  workflow,
  roleCan,
  log,
  at,
  clean,
});
module.exports = { PlatformService, modelCatalog, roleCan, balance };
