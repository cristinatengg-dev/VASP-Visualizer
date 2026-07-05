import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Atom as AtomIcon,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleDot,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  FolderOpen,
  Gauge,
  Home,
  Library,
  Link2,
  Loader2,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useStore } from '../store/useStore';
import { getAtomProperties } from '../utils/atomData';
import type { Atom, Bond, MolecularStructure } from '../types';
import type {
  CompiledInputs,
  ComputeIntent,
  ComputeResult,
  EngineType,
  JobStatus,
  ServerComputeProfile,
} from '../agents/compute/types';

type AgentStatus = 'active' | 'ready' | 'handoff' | 'gated';
type MessageRole = 'user' | 'assistant' | 'tool' | 'system';
type ToolStatus = 'running' | 'success' | 'error';
type WorkflowPhase =
  | 'idle'
  | 'retrieving'
  | 'await_model'
  | 'modeling'
  | 'await_software'
  | 'compiling'
  | 'await_input'
  | 'await_submit'
  | 'submitting'
  | 'monitoring'
  | 'await_ppt'
  | 'ppt'
  | 'done'
  | 'error';

interface WorkspaceAgent {
  id: string;
  name: string;
  subtitle: string;
  status: AgentStatus;
  accent: string;
  icon: LucideIcon;
  tools: string[];
  output: string;
}

interface DatabaseAgent {
  id: string;
  name: string;
  shortName: string;
  status: AgentStatus;
  scope: string;
  agentRole: string;
  sources: string[];
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  title?: string;
  content: string;
  createdAt: number;
  status?: ToolStatus;
}

interface ToolEvent {
  id: string;
  name: string;
  agent: string;
  status: ToolStatus;
  summary: string;
  details: string[];
}

interface HarnessArtifact {
  id: string;
  kind: string;
  summary: string;
}

interface HarnessCheckpoint {
  id: string;
  phase: WorkflowPhase | 'system';
  status: ToolStatus | 'info' | 'waiting';
  summary: string;
  artifact?: HarnessArtifact;
}

interface HarnessSessionState {
  sessionId: string;
  goalArtifactId: string | null;
  planArtifactId: string | null;
  harness: string;
  checkpoints: HarnessCheckpoint[];
}

interface StageEvent {
  type: 'stage';
  stage: string;
  title: string;
  status: 'active' | 'done';
  content?: string;
  papers?: Paper[];
  structures?: StructureCandidate[];
}

interface Paper {
  title: string;
  authors: string;
  year: string | number;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  source: string;
  source_type: 'peer-reviewed' | 'preprint';
  ablesci_url?: string;
  evidence_url?: string | null;
  source_label?: string;
  verified_source?: boolean;
}

interface StructureCandidate {
  material_id: string;
  formula: string;
  crystal_system: string;
  space_group: string | null;
  energy_above_hull: string;
  theoretical: boolean | null;
  selection_reason: string;
  source?: string;
  source_id?: string;
  source_url?: string;
  queried_formula?: string;
  query_reason?: string;
  query_family?: string | null;
  formation_energy?: string | null;
  band_gap?: string | null;
  nsites?: number | null;
}

interface StructureQueryItem {
  formula: string;
  reason: string;
  family_id?: string | null;
  family_label?: string | null;
}

interface StructureQueryPlan {
  formulas: string[];
  searched_formulas?: string[];
  sources: StructureQueryItem[];
  families?: Array<{ id: string; label: string; seed_formulas: string[] }>;
}

interface StructureSourceEntry {
  id: string;
  label: string;
  kind: string;
  liveSearch: boolean;
  access: string;
  homepage?: string;
  endpoint?: string;
  notes?: string;
}

interface StructureSourceRegistry {
  live: StructureSourceEntry[];
  datasets: StructureSourceEntry[];
}

interface SourceProbeState {
  sourceId: string;
  label: string;
  formula: string;
  status: 'idle' | 'running' | 'success' | 'error';
  summary: string;
  results: StructureCandidate[];
  registryEntry?: StructureSourceEntry;
}

interface AttachedFileDigest {
  name: string;
  kind: 'pdf' | 'structure' | 'text' | 'unsupported';
  summary: string;
  context?: string;
  structure?: MolecularStructure;
}

interface Blueprint {
  why_this_idea: string;
  what_can_be_calculated: string;
  structure_source: {
    formula: string;
    phase_or_polymorph: string;
    material_id: string | null;
    source_reason: string;
  };
  modeling_recipe: {
    starting_point: string;
    cell_choice: string;
    supercell: string;
    slab: string | null;
    defect_or_doping: string | null;
    migration: string | null;
  };
  literature_rationale: string;
  caution_notes: string[];
  first_step: string;
  second_step: string;
  handoff_prompt: string;
}

interface IdeaCard {
  id: string;
  title: string;
  material_family: string;
  fit_reason: string;
  literature_basis: string;
  recommended_model_type: string;
  target_properties: string[];
  starter_friendly: boolean;
  difficulty: 'starter' | 'intermediate' | 'advanced';
  confidence: 'high' | 'medium' | 'low';
  directly_supported: boolean;
  blueprint: Blueprint;
}

interface CompleteData {
  summary: string;
  user_goal: { interpreted_goal: string; user_profile: string; depth: string };
  idea_cards: IdeaCard[];
  recommended_idea_id: string | null;
  papers: Paper[];
  structures: StructureCandidate[];
  structure_query_plan?: StructureQueryPlan | null;
  handoff: {
    idea_id?: string;
    idea_title?: string;
    formula: string;
    material_id: string | null;
    source?: string;
    model_type: string;
    supercell: string | null;
    handoff_prompt: string | null;
    rationale: string | null;
  } | null;
  no_model_recommendation?: {
    reason: string;
    action: string;
  } | null;
}

interface SynthesisRoute {
  id: string;
  title: string;
  method: string;
  target: string;
  precursors: string[];
  conditions: {
    temperature: string;
    time: string;
    atmosphere: string;
  };
  evidence: string;
  risk: string;
  alternatives: string[];
  dataset_hit?: boolean;
  source?: string;
  source_project?: string;
  source_url?: string;
  source_citation?: string;
  source_dataset_doi?: string;
  doi?: string;
  doi_url?: string;
  recipe_id?: string;
  match_score?: number;
  matched_terms?: string[];
  reaction_string?: string;
}

interface FeasibilityDimension {
  id: string;
  label: string;
  score: number;
  rationale: string;
}

interface ExperimentVariable {
  name: string;
  type: string;
  range: Array<string | number> | [number, number];
}

interface RecipeIndexMatch {
  id: string;
  source: string;
  source_project: string;
  source_url: string;
  source_citation: string;
  source_dataset_doi: string;
  doi: string;
  doi_url: string;
  synthesis_type: string;
  target_formula: string;
  target_name: string;
  precursors: string[];
  conditions: {
    temperature?: string;
    time?: string;
    atmosphere?: string;
  };
  reaction_string: string;
  paragraph: string;
  score: number;
  matched_terms: string[];
}

interface ResearchStackReport {
  version: string;
  generated_at: string;
  question: string;
  domain: string;
  evidence: {
    verified_paper_count: number;
    paper_count: number;
    structure_count: number;
    formulas: string[];
    guardrail: string;
  };
  synthesis: {
    summary: string;
    routes: SynthesisRoute[];
  };
  recipe_index?: {
    index: {
      status: string;
      path: string | null;
      total: number;
      source_counts: Record<string, number>;
      loaded_at: string | null;
      error: string | null;
    };
    query: string;
    formulas: string[];
    domain: string;
    matches: RecipeIndexMatch[];
  };
  feasibility: {
    score: number;
    level: 'high' | 'medium' | 'low';
    decision: string;
    dimensions: FeasibilityDimension[];
    blockers: string[];
    next_actions: string[];
  };
  experiment: {
    engine: string;
    objective: string;
    variables: ExperimentVariable[];
    constraints: string[];
    first_batch: Array<Record<string, string | number>>;
    next_round_policy: string;
    stop_conditions: string[];
  };
  compute: {
    engine: string;
    structure_status: string;
    recommended_workflows: string[];
    handoff: string | null;
  };
  adapters: Array<{
    id: string;
    name: string;
    project: string;
    url: string;
    role: string;
    integration: string;
    status: string;
    available?: boolean;
    backing?: string;
    kind?: string;
    probe?: Record<string, any>;
  }>;
  adapter_summary?: Record<string, number>;
}

interface AgentWorkflowSnapshot {
  version: 1;
  savedAt: number;
  phase: WorkflowPhase;
  messages: ChatMessage[];
  toolEvents: ToolEvent[];
  research: CompleteData | null;
  researchStack: ResearchStackReport | null;
  selectedIdeaId: string | null;
  modelIntent: Record<string, any> | null;
  modelStructure: MolecularStructure | null;
  computeIntent: ComputeIntent;
  profiles: ServerComputeProfile[];
  selectedProfileId: string;
  compiledInputs: CompiledInputs | null;
  selectedInputFileName: string | null;
  jobStatus: JobStatus | null;
  computeResult: ComputeResult | null;
  pptUrl: string | null;
  pptQa: string | null;
  harnessSession: HarnessSessionState | null;
  chatSessionId: string | null;
}

interface ModelingReturnPayload {
  savedAt: number;
  structure: MolecularStructure;
}

interface AgentTaskRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  snapshot: AgentWorkflowSnapshot;
}

type AgentEvent = StageEvent | { type: 'error'; content: string } | { type: 'complete'; data: CompleteData };

const navItems = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'agent', label: '科研流程', icon: Bot },
  { id: 'experts', label: '专家库', icon: BriefcaseBusiness },
  { id: 'skills', label: '技能', icon: WandSparkles },
  { id: 'explore', label: '数据探索', icon: Search },
  { id: 'connectors', label: '连接器', icon: Link2 },
  { id: 'library', label: '资料库', icon: Library },
  { id: 'automation', label: '自动化', icon: Activity },
];

const agents: WorkspaceAgent[] = [
  {
    id: 'orchestrator',
    name: '总控流程',
    subtitle: '单轮连续执行',
    status: 'active',
    accent: 'bg-[#0A1128] text-white',
    icon: BrainCircuit,
    tools: ['plan', 'retrieve', 'model', 'compute', 'ppt'],
    output: '连续编排检索、建模、计算、结果与汇报输出。',
  },
  {
    id: 'retrieval',
    name: '文献证据',
    subtitle: '真实来源',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: FileText,
    tools: ['CrossRef', 'OpenAlex', 'arXiv', 'PubMed'],
    output: '从论文和数据库证据生成可建模候选。',
  },
  {
    id: 'database',
    name: '结构数据库',
    subtitle: '八个结构源',
    status: 'active',
    accent: 'bg-[#0A1128] text-white',
    icon: Database,
    tools: ['MP', 'OQMD', 'AFLOW', 'JARVIS', 'Alexandria', 'NOMAD', 'MC3D', 'OMDB'],
    output: '统一呈现实时结构源和大规模训练/评测数据集。',
  },
  {
    id: 'synthesis',
    name: '合成路线',
    subtitle: '路线与前驱体',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: FlaskConical,
    tools: ['ChemDataExtractor2', 'Ceder data', 'rxn_network'],
    output: '从文献和合成数据先验评估路线、条件、风险和替代方案。',
  },
  {
    id: 'feasibility',
    name: '可行性评分',
    subtitle: '七项证据评分',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: Gauge,
    tools: ['evidence', 'stability', 'precursor', 'risk'],
    output: '用文献证据、结构命中、相稳定性和实验复杂度给候选材料打分。',
  },
  {
    id: 'experiment',
    name: '实验方案',
    subtitle: 'DoE 与下一轮',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: Activity,
    tools: ['BayBE', 'BoFire', 'constraints'],
    output: '生成变量范围、约束、第一批实验矩阵和下一轮优化策略。',
  },
  {
    id: 'modeling',
    name: '确定性建模',
    subtitle: '结构可视化',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: AtomIcon,
    tools: ['bulk', 'slab', 'molecule', 'adsorbate'],
    output: '把候选体系落成可计算原子结构。',
  },
  {
    id: 'compute',
    name: '计算输入',
    subtitle: '文件可编辑',
    status: 'handoff',
    accent: 'bg-gray-200 text-gray-500',
    icon: Cpu,
    tools: ['VASP', 'CP2K', 'QE', 'Slurm/PBS'],
    output: '生成输入文件并提交到选定计算位置。',
  },
  {
    id: 'export',
    name: '结果汇报',
    subtitle: '可下载 PPTX',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: Archive,
    tools: ['pptx', 'QA', 'download'],
    output: '生成可下载中文汇报 PPT。',
  },
];

const databaseAgents: DatabaseAgent[] = [
  {
    id: 'jarvis',
    name: 'JARVIS',
    shortName: 'JARVIS',
    status: 'active',
    scope: 'NIST JARVIS-DFT structures and property metadata through the JARVIS OPTIMADE endpoint.',
    agentRole: 'Live OPTIMADE structure source',
    sources: ['structure', 'properties', 'OPTIMADE'],
  },
  {
    id: 'alexandria',
    name: 'Alexandria',
    shortName: 'ALX',
    status: 'active',
    scope: 'Alexandria PBE structures exposed through an OPTIMADE-compatible endpoint.',
    agentRole: 'Live OPTIMADE structure source',
    sources: ['PBE', 'structure', 'OPTIMADE'],
  },
  {
    id: 'mptrj',
    name: 'MPtrj',
    shortName: 'MPtrj',
    status: 'ready',
    scope: 'Materials Project relaxation trajectory dataset for training and benchmarking.',
    agentRole: 'Dataset registry',
    sources: ['trajectories', 'training', 'MP'],
  },
  {
    id: 'matbench-discovery',
    name: 'Matbench Discovery',
    shortName: 'MBD',
    status: 'ready',
    scope: 'Benchmark and discovery registry for stability prediction workflows.',
    agentRole: 'Benchmark registry',
    sources: ['benchmark', 'leaderboard', 'discovery'],
  },
  {
    id: 'omat24',
    name: 'OMat24',
    shortName: 'OMat24',
    status: 'ready',
    scope: 'Large-scale Open Materials 2024 training data from FAIRChem/Hugging Face.',
    agentRole: 'Dataset registry',
    sources: ['LMDB', 'training', 'FAIRChem'],
  },
  {
    id: 'nomad',
    name: 'NOMAD',
    shortName: 'NOMAD',
    status: 'active',
    scope: 'NOMAD Archive structures and provenance-rich metadata through OPTIMADE.',
    agentRole: 'Live OPTIMADE structure source',
    sources: ['archive', 'provenance', 'OPTIMADE'],
  },
  {
    id: 'mcloud_mc3d',
    name: 'Materials Cloud MC3D',
    shortName: 'MC3D',
    status: 'active',
    scope: 'Materials Cloud MC3D PBE structures exposed through OPTIMADE.',
    agentRole: 'Live OPTIMADE structure source',
    sources: ['MC3D', 'structure', 'OPTIMADE'],
  },
  {
    id: 'omdb',
    name: 'Open Materials Database',
    shortName: 'OMDB',
    status: 'active',
    scope: 'Open Materials Database production endpoint exposed through OPTIMADE.',
    agentRole: 'Live OPTIMADE structure source',
    sources: ['structure', 'properties', 'OPTIMADE'],
  },
  {
    id: 'cod',
    name: 'Crystallography Open Database',
    shortName: 'COD',
    status: 'ready',
    scope: 'Open experimental CIF repository registered as metadata until exact formula search is normalized.',
    agentRole: 'CIF repository registry',
    sources: ['CIF', 'experimental', 'CC0'],
  },
];

const engineOptions: Array<{ id: EngineType; label: string; summary: string }> = [
  { id: 'vasp', label: 'VASP', summary: '周期性 DFT；默认推荐用于表面/吸附体系' },
  { id: 'quantum_espresso', label: 'Quantum ESPRESSO', summary: '开源平面波 DFT' },
  { id: 'cp2k', label: 'CP2K', summary: '混合 Gaussian/平面波；适合大体系' },
  { id: 'lammps', label: 'LAMMPS', summary: '经典分子动力学' },
  { id: 'orca', label: 'ORCA', summary: '分子量化计算' },
];

const defaultComputeIntent: ComputeIntent = {
  engine: 'vasp',
  workflow: 'relax',
  quality: 'standard',
  spin_mode: 'auto',
  vdw: true,
  u_correction: false,
  kpoints_mode: 'auto',
  restart_policy: 'custodian',
};

const WORKFLOW_STORAGE_KEY = 'sci-agent-workflow-v1';
const MODELING_RETURN_KEY = 'sci-agent-modeling-return-v1';
const TASK_STORAGE_KEY = 'sci-agent-tasks-v1';
const ACTIVE_TASK_STORAGE_KEY = 'sci-agent-active-task-v1';

const recentTasks = [
  '检索 CO2 加氢催化剂文章',
  '构建 Cu(111)+CO2+H2 吸附模型',
  '生成 VASP relaxation 输入并提交 local demo',
];

const statusMeta: Record<AgentStatus, { label: string; className: string }> = {
  active: { label: '运行中', className: 'bg-white text-[#0A1128] border-gray-200 shadow-sm ring-1 ring-black/5' },
  ready: { label: '就绪', className: 'bg-gray-50 text-gray-500 border-gray-200' },
  handoff: { label: '待确认', className: 'bg-[#F5F5F0] text-gray-700 border-gray-200' },
  gated: { label: '需授权', className: 'bg-red-50 text-red-600 border-red-200' },
};

const phaseLabel: Record<WorkflowPhase, string> = {
  idle: '待开始',
  retrieving: '检索文献与数据库',
  await_model: '确认模型',
  modeling: '生成结构',
  await_software: '选择计算软件',
  compiling: '生成输入文件',
  await_input: '检查输入文件',
  await_submit: '选择提交位置',
  submitting: '提交作业',
  monitoring: '等待计算',
  await_ppt: '确认汇报输出',
  ppt: '生成 PPT',
  done: '已完成',
  error: '需要处理',
};

const isWorkflowPrompt = (content: string, hasFiles = false) => {
  if (hasFiles) return true;
  const text = content.trim();
  if (!text) return false;
  const explicitWorkflow = /(检索|搜索|查找|文献|论文|文章|资料|数据库|材料库|建模|模型|结构|晶体|晶面|吸附|计算|VASP|DFT|CP2K|QE|LAMMPS|提交|作业|PPT|汇报|生成|构建|优化|弛豫|能带|态密度|扩散|NEB|催化|电池|储氢|热储能|液流|航天材料|supercapacitor|battery|hydrogen|aerospace|literature|paper|review|modeling|compute|presentation)/i.test(text);
  if (explicitWorkflow) return true;

  const researchTopic = /(材料|体系|催化|催化剂|合金|晶体|分子|结构|电池|核能|反应堆|熔盐|腐蚀|辐照|燃料|堆芯|吸附|扩散|molten\s*salt|reactor|nuclear|corrosion|irradiation|catalyst|alloy|materials?)/i.test(text);
  const researchIntent = /(方向|课题|选题|主题|近期|最近|前沿|进展|综述|调研|找一找|看一下|帮我看|推荐|paper|literature|review|survey|state\s+of\s+the\s+art)/i.test(text);
  return researchTopic && researchIntent;
};

const shouldAutoPromoteChatToRetrieval = (prompt: string, reply: string) => {
  const promisedRetrieval = /(启动|开始|马上|立即|将|会|为你|帮你|接下来|稍候)[\s\S]{0,36}(检索|搜索|查找|文献|论文|文章|资料|数据库|工作流|workflow)/i.test(reply);
  return Boolean(prompt.trim()) && promisedRetrieval;
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createWelcomeMessages = (content = '可以像普通助手一样直接聊天；当你明确要求检索、建模、计算、提交作业或生成 PPT 时，我会切换到连续科研流程。'): ChatMessage[] => [
  {
    id: 'welcome',
    role: 'assistant',
    title: '流程已就绪',
    content,
    createdAt: Date.now(),
  },
];

const createEmptyWorkflowSnapshot = (): AgentWorkflowSnapshot => ({
  version: 1,
  savedAt: Date.now(),
  phase: 'idle',
  messages: createWelcomeMessages(),
  toolEvents: [],
  research: null,
  researchStack: null,
  selectedIdeaId: null,
  modelIntent: null,
  modelStructure: null,
  computeIntent: defaultComputeIntent,
  profiles: [],
  selectedProfileId: 'local_demo',
  compiledInputs: null,
  selectedInputFileName: null,
  jobStatus: null,
  computeResult: null,
  pptUrl: null,
  pptQa: null,
  harnessSession: null,
  chatSessionId: null,
});

const truncateTaskTitle = (value: string, max = 34) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const deriveTaskTitle = (snapshot: AgentWorkflowSnapshot) => {
  const firstUserMessage = snapshot.messages.find((message) => message.role === 'user' && message.content.trim());
  const title = firstUserMessage?.content
    || snapshot.research?.user_goal?.interpreted_goal
    || snapshot.research?.summary
    || snapshot.modelStructure?.filename
    || '新科研任务';
  return truncateTaskTitle(title);
};

const createTaskRecord = (snapshot: AgentWorkflowSnapshot = createEmptyWorkflowSnapshot()): AgentTaskRecord => {
  const now = Date.now();
  return {
    id: newId('task'),
    title: deriveTaskTitle(snapshot),
    createdAt: now,
    updatedAt: now,
    archived: false,
    snapshot: { ...snapshot, savedAt: now },
  };
};

const taskSearchText = (task: AgentTaskRecord) => [
  task.title,
  task.snapshot.phase,
  task.snapshot.research?.summary,
  task.snapshot.research?.user_goal?.interpreted_goal,
  task.snapshot.researchStack?.synthesis?.summary,
  task.snapshot.researchStack?.feasibility?.decision,
  task.snapshot.researchStack?.experiment?.objective,
  task.snapshot.modelStructure?.filename,
  task.snapshot.messages.map((message) => `${message.title || ''} ${message.content}`).join(' '),
  task.snapshot.toolEvents.map((event) => `${event.name} ${event.summary} ${event.details.join(' ')}`).join(' '),
].filter(Boolean).join(' ').toLowerCase();

const formatTaskTime = (value: number) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const normalizeSnapshotToolEvents = (events: ToolEvent[] = [], phase: WorkflowPhase): ToolEvent[] => {
  if (phase !== 'error') return events;
  return events.map((event) => (
    event.status === 'running'
      ? {
          ...event,
          status: 'error',
          details: [...event.details, '流程已进入错误状态，此步骤已停止。'],
        }
      : event
  ));
};

const StatusPill: React.FC<{ status: AgentStatus }> = ({ status }) => {
  const meta = statusMeta[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-[32px] border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
      <CircleDot size={9} />
      {meta.label}
    </span>
  );
};

const computeBoundingBox = (atoms: Atom[]): MolecularStructure['boundingBox'] => {
  if (!atoms.length) {
    return { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } };
  }
  return atoms.reduce(
    (box, atom) => ({
      min: {
        x: Math.min(box.min.x, atom.position.x),
        y: Math.min(box.min.y, atom.position.y),
        z: Math.min(box.min.z, atom.position.z),
      },
      max: {
        x: Math.max(box.max.x, atom.position.x),
        y: Math.max(box.max.y, atom.position.y),
        z: Math.max(box.max.z, atom.position.z),
      },
    }),
    {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity },
    },
  );
};

const normalizeAtoms = (raw: any[]): Atom[] => (Array.isArray(raw) ? raw : []).map((atom, index) => {
  const element = String(atom?.element || atom?.symbol || 'C');
  const defaults = getAtomProperties(element);
  const position = atom?.position || atom || {};
  return {
    id: String(atom?.id || `atom-${index}`),
    element,
    position: {
      x: Number(position.x || 0),
      y: Number(position.y || 0),
      z: Number(position.z || 0),
    },
    radius: Number(atom?.radius || defaults.radius),
    color: String(atom?.color || defaults.color),
    renderStyle: atom?.renderStyle,
  };
});

const normalizeBonds = (raw: any[], atoms: Atom[]): Bond[] => {
  const atomIds = new Set(atoms.map((atom) => atom.id));
  return (Array.isArray(raw) ? raw : [])
    .map((bond, index): Bond | null => {
      const atom1Id = typeof bond?.atom1Id === 'string'
        ? bond.atom1Id
        : (Number.isInteger(bond?.from) ? atoms[bond.from]?.id : undefined);
      const atom2Id = typeof bond?.atom2Id === 'string'
        ? bond.atom2Id
        : (Number.isInteger(bond?.to) ? atoms[bond.to]?.id : undefined);
      if (!atom1Id || !atom2Id || !atomIds.has(atom1Id) || !atomIds.has(atom2Id)) return null;
      const order = Math.max(1, Math.min(3, Math.round(Number(bond?.order || 1))));
      return {
        id: String(bond?.id || `bond-${index}`),
        atom1Id,
        atom2Id,
        length: Number(bond?.length || 0),
        type: order >= 3 ? 'triple' : order === 2 ? 'double' : 'single',
        order,
      };
    })
    .filter((bond): bond is Bond => Boolean(bond));
};

const cloneWorkflowStructure = (structure: MolecularStructure | null): MolecularStructure | null => {
  if (!structure) return null;
  const atoms = normalizeAtoms(structure.atoms || []);
  const bonds = normalizeBonds(structure.bonds || [], atoms);
  return {
    id: String(structure.id || `workflow-structure-${Date.now()}`),
    filename: String(structure.filename || 'workflow-structure.vasp'),
    atoms,
    bonds,
    boundingBox: computeBoundingBox(atoms),
    latticeVectors: Array.isArray(structure.latticeVectors)
      ? structure.latticeVectors.map((row) => row.map((value) => Number(value)))
      : undefined,
  };
};

const buildMolecularStructure = (result: any, taskType: string): MolecularStructure => {
  const atoms = normalizeAtoms(result?.data?.atoms || []);
  const bonds = normalizeBonds(result?.data?.bonds || [], atoms);
  return {
    id: `orchestrator-model-${Date.now()}`,
    filename: `Agent_${taskType || 'structure'}_${atoms.length}atoms.vasp`,
    atoms,
    bonds,
    boundingBox: computeBoundingBox(atoms),
    latticeVectors: result?.data?.latticeVectors,
  };
};

const structurePayloadFromModel = (structure: MolecularStructure, intent: ComputeIntent) => ({
  data: {
    atoms: structure.atoms.map((atom) => ({ element: atom.element, position: atom.position })),
    latticeVectors: structure.latticeVectors,
  },
  meta: {
    formula: structure.filename,
    system: structure.latticeVectors ? 'periodic' : 'molecule',
    taskType: intent.workflow,
  },
});

const parseCustomParams = (text: string) => {
  const params: Record<string, string | number | boolean> = {};
  const matches = text.matchAll(/([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*([^\n,;]+)/g);
  for (const match of matches) {
    const raw = match[2].trim();
    const numeric = Number(raw);
    params[match[1].trim()] = Number.isFinite(numeric) && raw !== '' ? numeric : raw;
  }
  if (/高精度|high/i.test(text)) params.quality = 'high';
  if (/快速|fast/i.test(text)) params.quality = 'fast';
  if (/静态|static/i.test(text)) params.workflow = 'static';
  if (/dos/i.test(text)) params.workflow = 'dos';
  if (/band|能带/i.test(text)) params.workflow = 'band';
  return params;
};

const paperEvidenceUrl = (paper: Paper) => paper.evidence_url || paper.url || (paper.doi && !/^arXiv:/i.test(paper.doi) ? `https://doi.org/${paper.doi}` : null);

const isSourceBackedPaper = (paper: Paper) => {
  const title = String(paper.title || '').trim();
  return title.length > 5 && !/^untitled$/i.test(title) && Boolean(paperEvidenceUrl(paper) || paper.doi);
};

const getVerifiedPapers = (papers: Paper[] = []) => papers.filter(isSourceBackedPaper);

const topPaperLines = (papers: Paper[], limit = 5) => getVerifiedPapers(papers).slice(0, limit).map((paper, index) => {
  const year = paper.year ? ` (${paper.year})` : '';
  const source = paper.source_label || paper.source || 'scholarly index';
  const evidence = paper.doi ? `DOI ${paper.doi}` : paperEvidenceUrl(paper);
  return `${index + 1}. ${paper.title}${year} · ${source}${evidence ? ` · ${evidence}` : ''}`;
});

const sourceRegistryId = (id: string) => id === 'matbench-discovery' ? 'matbench_discovery' : id;

const isPdfFile = (file: File) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
const isStructureFile = (file: File) => /\.(vasp|poscar|contcar|cif|xyz)$/i.test(file.name) || /^(POSCAR|CONTCAR)$/i.test(file.name);
const isXyzFile = (file: File) => /\.xyz$/i.test(file.name);

const summarizeParsedScience = (data: any) => {
  const parts = [
    data?.core_theme && `theme=${data.core_theme}`,
    data?.central_object && `central=${data.central_object}`,
    data?.support_or_substrate && `substrate=${data.support_or_substrate}`,
    Array.isArray(data?.reactants) && data.reactants.length ? `reactants=${data.reactants.map((item: any) => item.formula_en || item.name_cn || item.name).filter(Boolean).join(', ')}` : '',
    Array.isArray(data?.products) && data.products.length ? `products=${data.products.map((item: any) => item.formula_en || item.name_cn || item.name).filter(Boolean).join(', ')}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : 'PDF parsed into a scientific brief';
};

const parsedScienceContext = (data: any) => [
  data?.core_theme ? `Core theme: ${data.core_theme}` : '',
  data?.central_object ? `Central object: ${data.central_object}` : '',
  data?.support_or_substrate ? `Support/substrate: ${data.support_or_substrate}` : '',
  data?.active_site ? `Active site: ${data.active_site}` : '',
  Array.isArray(data?.reactants) && data.reactants.length
    ? `Reactants: ${data.reactants.map((item: any) => item.formula_en || item.name_cn || item.name).filter(Boolean).join(', ')}`
    : '',
  Array.isArray(data?.intermediates) && data.intermediates.length
    ? `Intermediates: ${data.intermediates.map((item: any) => item.formula_en || item.name_cn || item.name).filter(Boolean).join(', ')}`
    : '',
  Array.isArray(data?.products) && data.products.length
    ? `Products: ${data.products.map((item: any) => item.formula_en || item.name_cn || item.name).filter(Boolean).join(', ')}`
    : '',
  data?.key_mechanism ? `Mechanism: ${data.key_mechanism}` : '',
].filter(Boolean).join('\n');

const parseXyzStructure = async (file: File): Promise<MolecularStructure> => {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const declaredCount = Number(lines[0]);
  const atomLines = Number.isFinite(declaredCount) && declaredCount > 0
    ? lines.slice(2, 2 + declaredCount)
    : lines;
  const atoms: Atom[] = atomLines.map((line, index) => {
    const [elementRaw, xRaw, yRaw, zRaw] = line.split(/\s+/);
    const element = String(elementRaw || 'C').replace(/[^A-Za-z]/g, '') || 'C';
    const props = getAtomProperties(element);
    return {
      id: `atom-${index}`,
      element,
      position: {
        x: Number(xRaw) || 0,
        y: Number(yRaw) || 0,
        z: Number(zRaw) || 0,
      },
      radius: props.radius,
      color: props.color,
    };
  }).filter((atom) => atom.element && Number.isFinite(atom.position.x) && Number.isFinite(atom.position.y) && Number.isFinite(atom.position.z));

  if (!atoms.length) throw new Error('XYZ 文件没有可解析的原子坐标');
  return {
    id: `xyz-${Date.now()}`,
    filename: file.name,
    atoms,
    bonds: [],
    boundingBox: computeBoundingBox(atoms),
  };
};

const StructurePreview: React.FC<{ structure: MolecularStructure; onOpenModeling: () => void }> = ({ structure, onOpenModeling }) => {
  const atoms = structure.atoms || [];
  const bonds = structure.bonds || [];
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const minX = Math.min(...atoms.map((atom) => atom.position.x), -1);
  const maxX = Math.max(...atoms.map((atom) => atom.position.x), 1);
  const minY = Math.min(...atoms.map((atom) => atom.position.y), -1);
  const maxY = Math.max(...atoms.map((atom) => atom.position.y), 1);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const width = 720;
  const height = 360;
  const pad = 34;
  const project = (atom: Atom) => ({
    x: pad + ((atom.position.x - minX) / spanX) * (width - pad * 2),
    y: height - pad - ((atom.position.y - minY) / spanY) * (height - pad * 2),
  });

  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#0A1128]">结构预览</p>
          <p className="mt-1 text-xs text-gray-500">{structure.filename} · {atoms.length} atoms · {bonds.length} bonds</p>
        </div>
        <button
          type="button"
          onClick={onOpenModeling}
          className="rounded-[32px] border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
        >
          打开完整建模页
        </button>
      </div>
      <div className="overflow-hidden rounded-[16px] border border-gray-100 bg-[#0A1128]">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full">
          <rect width={width} height={height} fill="#0A1128" />
          <g opacity="0.9">
            {bonds.map((bond) => {
              const left = atomById.get(bond.atom1Id);
              const right = atomById.get(bond.atom2Id);
              if (!left || !right) return null;
              const a = project(left);
              const b = project(right);
              return (
                <line
                  key={bond.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#D7DEE8"
                  strokeWidth={bond.order && bond.order > 1 ? 5 : 3}
                  strokeLinecap="round"
                  opacity="0.72"
                />
              );
            })}
          </g>
          <g>
            {atoms.map((atom) => {
              const point = project(atom);
              const props = getAtomProperties(atom.element);
              const radius = Math.max(7, Math.min(17, (atom.radius || props.radius) * 10));
              return (
                <g key={atom.id}>
                  <circle cx={point.x + 2} cy={point.y + 3} r={radius + 2} fill="rgba(0,0,0,0.24)" />
                  <circle cx={point.x} cy={point.y} r={radius} fill={atom.color || props.color} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
                  {atoms.length <= 80 && (
                    <text x={point.x} y={point.y + 3.5} textAnchor="middle" className="fill-white text-[10px] font-bold">
                      {atom.element}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        这是确定性构建器返回结构的投影预览，计算输入和完整三维画布使用同一份原子坐标。
      </p>
    </div>
  );
};

const formatExperimentValue = (value: string | number) => (
  typeof value === 'number' ? Number(value.toFixed ? value.toFixed(3) : value).toString() : value
);

const scoreTone = (score: number) => {
  if (score >= 75) return 'bg-[#0A1128]';
  if (score >= 58) return 'bg-gray-500';
  return 'bg-gray-300';
};

const levelLabel: Record<ResearchStackReport['feasibility']['level'], string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const adapterStatusLabel: Record<string, string> = {
  active: '已接入',
  fallback: '降级',
  missing: '缺失',
};

const adapterStatusTone = (status: string) => {
  if (status === 'active') return 'border-[#0A1128] bg-[#0A1128] text-white';
  if (status === 'fallback') return 'border-gray-200 bg-gray-50 text-gray-600';
  return 'border-red-200 bg-red-50 text-red-600';
};

const ResearchStackPanel: React.FC<{ report: ResearchStackReport }> = ({ report }) => {
  const firstRoute = report.synthesis.routes[0];
  const experimentColumns = Object.keys(report.experiment.first_batch[0] || {}).slice(0, 7);
  const recipeMatches = report.recipe_index?.matches || [];
  const recipeIndexTotal = report.recipe_index?.index?.total || 0;
  const hasRecipeHit = recipeMatches.length > 0;

  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#0A1128]">材料学家分析</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            文献证据、合成路线、可行性评分和实验矩阵已经串入同一个工作流。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-[16px] border border-gray-200 bg-[#F5F5F0] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Ceder Index</p>
            <p className="text-sm font-bold text-[#0A1128]">{hasRecipeHit ? `命中 ${recipeMatches.length}` : '无命中'} · {recipeIndexTotal || '-'}</p>
          </div>
          <div className="rounded-[16px] border border-gray-200 bg-[#F5F5F0] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Feasibility</p>
            <p className="text-sm font-bold text-[#0A1128]">{report.feasibility.score}/100 · {levelLabel[report.feasibility.level]}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <FlaskConical size={15} className="text-gray-500" />
            <p className="text-xs font-bold text-[#0A1128]">合成路线</p>
          </div>
          <p className="text-xs leading-5 text-gray-600">{report.synthesis.summary}</p>
          {firstRoute && (
            <div className="mt-3 rounded-[14px] border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-[#0A1128]">{firstRoute.title}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{firstRoute.method}</p>
                </div>
                <span className={cx(
                  'rounded-full border px-2 py-1 text-[10px] font-bold',
                  firstRoute.dataset_hit
                    ? 'border-[#0A1128] bg-[#0A1128] text-white'
                    : 'border-gray-200 bg-[#F5F5F0] text-gray-500',
                )}>
                  {firstRoute.dataset_hit ? 'Ceder 命中' : '规则草案'}
                </span>
              </div>
              {firstRoute.source && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <span>{firstRoute.source}</span>
                  {typeof firstRoute.match_score === 'number' && <span>score {firstRoute.match_score}</span>}
                  {firstRoute.doi_url && (
                    <a
                      className="inline-flex items-center gap-1 font-semibold text-[#0A1128] hover:text-[#162044]"
                      href={firstRoute.doi_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      DOI <ExternalLink size={12} />
                    </a>
                  )}
                  {firstRoute.source_url && (
                    <a
                      className="inline-flex items-center gap-1 font-semibold text-[#0A1128] hover:text-[#162044]"
                      href={firstRoute.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      数据集 <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
              <div className="mt-2 grid gap-2 text-[11px] text-gray-600 md:grid-cols-3">
                <div>
                  <span className="font-semibold text-gray-800">前驱体</span>
                  <p className="mt-1 leading-5">{firstRoute.precursors.join('、')}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">条件</span>
                  <p className="mt-1 leading-5">{firstRoute.conditions.temperature}；{firstRoute.conditions.time}；{firstRoute.conditions.atmosphere}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">风险</span>
                  <p className="mt-1 leading-5">{firstRoute.risk}</p>
                </div>
              </div>
              {firstRoute.alternatives.length > 0 && (
                <p className="mt-2 text-[11px] leading-5 text-gray-500">替代路线：{firstRoute.alternatives.join('、')}</p>
              )}
              {firstRoute.reaction_string && (
                <p className="mt-2 rounded-[10px] bg-[#F5F5F0] px-2 py-1.5 font-mono text-[10px] leading-4 text-gray-600">
                  {firstRoute.reaction_string}
                </p>
              )}
            </div>
          )}
          {recipeMatches.length > 1 && (
            <div className="mt-3 space-y-2">
              {recipeMatches.slice(1, 4).map((match) => (
                <div key={match.id} className="rounded-[12px] border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#0A1128]">{match.target_formula || match.target_name}</span>
                    <span className="font-mono text-gray-400">score {match.score}</span>
                  </div>
                  <p className="mt-1 leading-5">{match.synthesis_type} · {match.precursors.slice(0, 4).join('、') || 'precursors not extracted'}</p>
                  {match.doi_url && (
                    <a className="mt-1 inline-flex items-center gap-1 font-semibold text-[#0A1128] hover:text-[#162044]" href={match.doi_url} target="_blank" rel="noreferrer">
                      {match.doi} <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Gauge size={15} className="text-gray-500" />
            <p className="text-xs font-bold text-[#0A1128]">可行性评分</p>
          </div>
          <p className="text-xs leading-5 text-gray-600">{report.feasibility.decision}</p>
          <div className="mt-3 space-y-2">
            {report.feasibility.dimensions.map((item) => (
              <div key={item.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-gray-700">{item.label}</span>
                  <span className="font-mono text-gray-400">{item.score}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className={cx('h-full rounded-full', scoreTone(item.score))} style={{ width: `${Math.max(8, Math.min(100, item.score))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[16px] border border-gray-200 bg-gray-50 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Activity size={15} className="text-gray-500" />
          <p className="text-xs font-bold text-[#0A1128]">第一轮实验矩阵</p>
          <span className="rounded-[32px] border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">{report.experiment.engine}</span>
        </div>
        <p className="mb-3 text-xs leading-5 text-gray-600">{report.experiment.objective}</p>
        <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white custom-scrollbar">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-[#F5F5F0] text-gray-500">
              <tr>
                {experimentColumns.map((key) => (
                  <th key={key} className="whitespace-nowrap px-3 py-2 font-semibold">{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.experiment.first_batch.map((row, index) => (
                <tr key={`exp-${index}`} className="border-t border-gray-100">
                  {experimentColumns.map((key) => (
                    <td key={key} className="whitespace-nowrap px-3 py-2 text-gray-700">{formatExperimentValue(row[key] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-gray-500">下一轮策略：{report.experiment.next_round_policy}</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Cpu size={15} className="text-gray-500" />
            <p className="text-xs font-bold text-[#0A1128]">计算桥接</p>
          </div>
          <p className="text-xs leading-5 text-gray-600">{report.compute.structure_status}</p>
          <p className="mt-2 text-[11px] leading-5 text-gray-500">建议 workflow：{report.compute.recommended_workflows.join('、')}</p>
        </div>
        <div className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-bold text-[#0A1128]">开源能力接入</p>
          <div className="mt-2 grid gap-2">
            {report.adapters.slice(0, 8).map((adapter) => (
              <div
                key={adapter.id}
                className="rounded-[16px] border border-gray-200 bg-white px-3 py-2 text-[11px]"
                title={adapter.role}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a
                    href={adapter.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#0A1128] transition hover:text-[#162044]"
                  >
                    {adapter.name}
                    <ExternalLink size={10} />
                  </a>
                  <span className={cx('rounded-[32px] border px-2 py-0.5 text-[10px] font-semibold', adapterStatusTone(adapter.status))}>
                    {adapterStatusLabel[adapter.status] || adapter.status}
                  </span>
                </div>
                <p className="mt-1 leading-5 text-gray-500">{adapter.backing || adapter.role}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-gray-500">{report.evidence.guardrail}</p>
        </div>
      </div>
    </div>
  );
};

const normalizeFormulaToken = (value: string | null | undefined) => String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();

const structureQueryReasonLabel = (reason: string | null | undefined) => ({
  alias: '别名解析',
  user_formula: '用户指定',
  intent_formula: '意图识别',
  literature_formula: '文献抽取',
  material_family_seed: '材料族检索',
  domain_fallback: '领域回退',
}[String(reason || '')] || '结构检索');

const isFormulaInStructurePlan = (data: CompleteData, formula: string | null | undefined) => {
  const token = normalizeFormulaToken(formula);
  if (!token) return false;
  const formulas = [
    ...(data.structure_query_plan?.formulas || []),
    ...(data.structure_query_plan?.searched_formulas || []),
    ...(data.structure_query_plan?.sources || []).map((item) => item.formula),
  ];
  return formulas.some((item) => normalizeFormulaToken(item) === token);
};

const topStructureLines = (structures: StructureCandidate[] = [], limit = 6) => (
  structures.slice(0, limit).map((structure, index) => {
    const source = structure.source || structure.source_id || 'Structure DB';
    const energy = structure.energy_above_hull && structure.energy_above_hull !== 'N/A'
      ? `E_hull=${structure.energy_above_hull}`
      : (structure.formation_energy ? `ΔHf=${structure.formation_energy}` : 'energy=N/A');
    const query = structure.queried_formula
      ? `；查询 ${structure.queried_formula}（${structureQueryReasonLabel(structure.query_reason)}）`
      : '';
    return `${index + 1}. ${structure.formula} · ${structure.material_id || 'no id'} · ${source} · ${structure.space_group || structure.crystal_system || 'structure'} · ${energy}${query}`;
  })
);

const recommendationEvidenceText = (prompt: string, data: CompleteData) => [
  prompt,
  data.user_goal?.interpreted_goal,
  data.user_goal?.depth,
  ...(data.structure_query_plan?.formulas || []),
  ...(data.structure_query_plan?.searched_formulas || []),
  ...(data.papers || []).flatMap((paper) => [paper.title, paper.abstract]),
].filter(Boolean).join(' ');

const evidenceMentionsFormula = (text: string, formula: string | null | undefined) => {
  const formulaToken = normalizeFormulaToken(formula);
  if (!formulaToken || formulaToken.length < 2) return false;
  return normalizeFormulaToken(text).includes(formulaToken);
};

const findEvidenceBackedStructure = (prompt: string, data: CompleteData, idea: IdeaCard | null) => {
  if (!idea || !Array.isArray(data.structures) || !data.structures.length) return null;
  const evidenceText = recommendationEvidenceText(prompt, data);
  const formula = idea.blueprint?.structure_source?.formula || idea.material_family || '';
  const materialId = idea.blueprint?.structure_source?.material_id || '';
  return data.structures.find((structure) => {
    const sameFormula = formula && normalizeFormulaToken(structure.formula) === normalizeFormulaToken(formula);
    const sameMaterialId = materialId && String(structure.material_id || '').toLowerCase() === String(materialId).toLowerCase();
    const queryBacked = isFormulaInStructurePlan(data, structure.formula) || isFormulaInStructurePlan(data, structure.queried_formula);
    const mentioned = evidenceMentionsFormula(evidenceText, structure.formula) || evidenceMentionsFormula(evidenceText, structure.material_id);
    return (sameFormula || sameMaterialId) && (mentioned || queryBacked);
  }) || null;
};

const isBatteryFallbackForOtherTopic = (prompt: string, data: CompleteData, idea: IdeaCard) => {
  const ideaText = `${idea.blueprint?.structure_source?.formula || ''} ${idea.title || ''} ${idea.material_family || ''}`;
  if (!/LiCoO2|NaCoO2|LiFePO4|NaMnO2|LiMn2O4|battery|cathode|电池|正极/i.test(ideaText)) return false;
  return !/(LiCoO2|NaCoO2|LiFePO4|NaMnO2|LiMn2O4|battery|cathode|电池|正极)/i.test(recommendationEvidenceText(prompt, data));
};

const getRecommendedIdea = (data: CompleteData | null) => {
  if (!data?.idea_cards?.length) return null;
  return data.idea_cards.find((item) => item.id === data.recommended_idea_id) || data.idea_cards[0] || null;
};

const applyEvidenceBackedRecommendation = (prompt: string, data: CompleteData): CompleteData => {
  if (data.no_model_recommendation) {
    return {
      ...data,
      idea_cards: [],
      recommended_idea_id: null,
      handoff: null,
    };
  }

  const safeIdeas = (data.idea_cards || []).filter((idea) => (
    !isBatteryFallbackForOtherTopic(prompt, data, idea) && Boolean(findEvidenceBackedStructure(prompt, data, idea))
  ));

  if (!safeIdeas.length) {
    const reason = '本轮没有找到能和检索文献对应的结构数据库条目；不会使用 LiCoO2 或其他无关材料作为推荐模型。';
    return {
      ...data,
      summary: `${data.summary || ''}\n${reason}`.trim(),
      idea_cards: [],
      recommended_idea_id: null,
      handoff: null,
      no_model_recommendation: {
        reason,
        action: 'manual_modeling_required',
      },
    };
  }

  const recommended = safeIdeas.find((idea) => idea.id === data.recommended_idea_id) || safeIdeas[0];
  return {
    ...data,
    idea_cards: safeIdeas,
    recommended_idea_id: recommended.id,
    handoff: data.handoff && data.handoff.idea_id === recommended.id ? data.handoff : {
      formula: recommended.blueprint?.structure_source?.formula || recommended.material_family,
      material_id: recommended.blueprint?.structure_source?.material_id || null,
      model_type: recommended.blueprint?.modeling_recipe?.starting_point || recommended.recommended_model_type || 'bulk',
      supercell: recommended.blueprint?.modeling_recipe?.supercell || null,
      handoff_prompt: recommended.blueprint?.handoff_prompt || null,
      rationale: recommended.fit_reason,
    },
    no_model_recommendation: null,
  };
};

const AgentWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user, setMolecularData, setShowBonds } = useStore();
  const accountLabel = user?.email || 'Research user';
  const [workspacePrompt, setWorkspacePrompt] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [tasks, setTasks] = useState<AgentTaskRecord[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [showArchivedTasks, setShowArchivedTasks] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [phase, setPhase] = useState<WorkflowPhase>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>(() => createWelcomeMessages());
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [research, setResearch] = useState<CompleteData | null>(null);
  const [researchStack, setResearchStack] = useState<ResearchStackReport | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [modelIntent, setModelIntent] = useState<Record<string, any> | null>(null);
  const [modelStructure, setModelStructure] = useState<MolecularStructure | null>(null);
  const [computeIntent, setComputeIntent] = useState<ComputeIntent>(defaultComputeIntent);
  const [profiles, setProfiles] = useState<ServerComputeProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('local_demo');
  const [compiledInputs, setCompiledInputs] = useState<CompiledInputs | null>(null);
  const [selectedInputFileName, setSelectedInputFileName] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [computeResult, setComputeResult] = useState<ComputeResult | null>(null);
  const [pptUrl, setPptUrl] = useState<string | null>(null);
  const [pptQa, setPptQa] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [harnessSession, setHarnessSession] = useState<HarnessSessionState | null>(null);
  const [structureSources, setStructureSources] = useState<StructureSourceRegistry | null>(null);
  const [sourceProbe, setSourceProbe] = useState<SourceProbeState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const harnessSessionIdRef = useRef<string | null>(null);
  const chatSessionIdRef = useRef<string | null>(null);
  const workflowRestoreRef = useRef(false);
  const taskHydratedRef = useRef(false);
  const taskInitialSaveSkippedRef = useRef(false);
  const taskPersistPausedRef = useRef(false);

  const selectedIdea = useMemo(() => {
    if (!research?.idea_cards?.length) return null;
    return research.idea_cards.find((idea) => idea.id === selectedIdeaId)
      || getRecommendedIdea(research);
  }, [research, selectedIdeaId]);

  const taskSearchQuery = taskSearch.trim().toLowerCase();
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || null, [activeTaskId, tasks]);
  const activeTasks = useMemo(() => tasks.filter((task) => !task.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((task) => task.archived), [tasks]);
  const filteredTasks = useMemo(() => {
    const source = showArchivedTasks ? archivedTasks : activeTasks;
    return source
      .filter((task) => !taskSearchQuery || taskSearchText(task).includes(taskSearchQuery))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }, [activeTasks, archivedTasks, showArchivedTasks, taskSearchQuery]);
  const configuredProfiles = profiles.filter((profile) => profile.configured);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || configuredProfiles[0] || profiles[0] || null;
  const compiledFileNames = useMemo(() => Object.keys(compiledInputs?.files || {}), [compiledInputs]);
  const selectedInputContent = selectedInputFileName && compiledInputs?.files[selectedInputFileName]
    ? compiledInputs.files[selectedInputFileName]
    : '';
  const sourceRegistryById = useMemo(() => {
    const entries = [...(structureSources?.live || []), ...(structureSources?.datasets || [])];
    return new Map(entries.map((entry) => [entry.id, entry]));
  }, [structureSources]);
  const activeSourceFormula = useMemo(() => {
    const formula = selectedIdea?.blueprint?.structure_source?.formula
      || research?.handoff?.formula
      || modelIntent?.substrate?.material
      || modelIntent?.material
      || '';
    return String(formula || '').trim() || 'Si';
  }, [modelIntent, research?.handoff?.formula, selectedIdea]);

  useEffect(() => {
    if (!compiledInputs) {
      setSelectedInputFileName(null);
      return;
    }
    const names = Object.keys(compiledInputs.files || {});
    if (!names.length) {
      setSelectedInputFileName(null);
      return;
    }
    if (!selectedInputFileName || !names.includes(selectedInputFileName)) {
      setSelectedInputFileName(names[0]);
    }
  }, [compiledInputs, selectedInputFileName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, toolEvents, phase]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    setMessages((prev) => [...prev, { ...message, id: newId('msg'), createdAt: Date.now() }]);
  }, []);

  const addTool = useCallback((event: Omit<ToolEvent, 'id'>) => {
    const id = newId('tool');
    setToolEvents((prev) => [...prev, { ...event, id }]);
    return id;
  }, []);

  const updateTool = useCallback((id: string, patch: Partial<ToolEvent>) => {
    setToolEvents((prev) => prev.map((event) => (event.id === id ? { ...event, ...patch } : event)));
  }, []);

  const updateCompiledInputFile = useCallback((fileName: string, content: string) => {
    setCompiledInputs((prev) => {
      if (!prev || !prev.files[fileName]) return prev;
      return {
        ...prev,
        files: {
          ...prev.files,
          [fileName]: content,
        },
      };
    });
  }, []);

  const applyWorkflowSnapshot = useCallback((snapshot: AgentWorkflowSnapshot) => {
    taskPersistPausedRef.current = true;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPhase(snapshot.phase || 'idle');
    setMessages(snapshot.messages?.length ? snapshot.messages : createWelcomeMessages());
    setToolEvents(normalizeSnapshotToolEvents(snapshot.toolEvents || [], snapshot.phase || 'idle'));
    setResearch(snapshot.research || null);
    setResearchStack(snapshot.researchStack || null);
    setSelectedIdeaId(snapshot.selectedIdeaId || null);
    setModelIntent(snapshot.modelIntent || null);
    const structure = cloneWorkflowStructure(snapshot.modelStructure);
    setModelStructure(structure);
    setMolecularData(structure);
    setShowBonds(Boolean(structure?.bonds?.length));
    setComputeIntent(snapshot.computeIntent || defaultComputeIntent);
    setProfiles(snapshot.profiles || []);
    setSelectedProfileId(snapshot.selectedProfileId || 'local_demo');
    setCompiledInputs(snapshot.compiledInputs || null);
    setSelectedInputFileName(snapshot.selectedInputFileName || null);
    setJobStatus(snapshot.jobStatus || null);
    setComputeResult(snapshot.computeResult || null);
    setPptUrl(snapshot.pptUrl || null);
    setPptQa(snapshot.pptQa || null);
    setHarnessSession(snapshot.harnessSession || null);
    setSourceProbe(null);
    harnessSessionIdRef.current = snapshot.harnessSession?.sessionId || null;
    chatSessionIdRef.current = snapshot.chatSessionId || null;
    window.setTimeout(() => {
      taskPersistPausedRef.current = false;
    }, 0);
  }, [setMolecularData, setShowBonds]);

  const buildCurrentSnapshot = useCallback((patch: Partial<AgentWorkflowSnapshot> = {}): AgentWorkflowSnapshot => {
    const nextStructure = Object.prototype.hasOwnProperty.call(patch, 'modelStructure')
      ? patch.modelStructure || null
      : modelStructure;
    const baseSnapshot: AgentWorkflowSnapshot = {
      version: 1,
      savedAt: Date.now(),
      phase,
      messages,
      toolEvents,
      research,
      researchStack,
      selectedIdeaId,
      modelIntent,
      modelStructure: cloneWorkflowStructure(nextStructure),
      computeIntent,
      profiles,
      selectedProfileId,
      compiledInputs,
      selectedInputFileName,
      jobStatus,
      computeResult,
      pptUrl,
      pptQa,
      harnessSession,
      chatSessionId: chatSessionIdRef.current,
    };
    const snapshot: AgentWorkflowSnapshot = {
      ...baseSnapshot,
      ...patch,
      version: 1,
      savedAt: Date.now(),
      modelStructure: cloneWorkflowStructure(nextStructure),
    };
    return snapshot;
  }, [
    compiledInputs,
    computeIntent,
    computeResult,
    harnessSession,
    jobStatus,
    messages,
    modelIntent,
    modelStructure,
    phase,
    pptQa,
    pptUrl,
    profiles,
    research,
    researchStack,
    selectedIdeaId,
    selectedInputFileName,
    selectedProfileId,
    toolEvents,
  ]);

  const saveWorkflowSnapshot = useCallback((patch: Partial<AgentWorkflowSnapshot> = {}) => {
    if (typeof window === 'undefined') return;
    const snapshot = buildCurrentSnapshot(patch);
    try {
      window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Session storage is an enhancement; the active global structure still carries the model to the editor.
    }
  }, [buildCurrentSnapshot]);

  useEffect(() => {
    if (taskHydratedRef.current || typeof window === 'undefined') return;
    taskHydratedRef.current = true;

    let records: AgentTaskRecord[] = [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) {
        records = parsed
          .filter((item) => item?.id && item?.snapshot?.version === 1)
          .map((item) => ({
            id: String(item.id),
            title: String(item.title || deriveTaskTitle(item.snapshot)),
            createdAt: Number(item.createdAt || item.snapshot.savedAt || Date.now()),
            updatedAt: Number(item.updatedAt || item.snapshot.savedAt || Date.now()),
            archived: Boolean(item.archived),
            snapshot: {
              ...createEmptyWorkflowSnapshot(),
              ...item.snapshot,
              version: 1,
              modelStructure: cloneWorkflowStructure(item.snapshot.modelStructure || null),
              toolEvents: normalizeSnapshotToolEvents(item.snapshot.toolEvents || [], item.snapshot.phase || 'idle'),
              chatSessionId: item.snapshot.chatSessionId || null,
            },
          }));
      }
    } catch {
      records = [];
    }

    if (!records.length) {
      records = [createTaskRecord()];
    }

    const storedActiveId = window.localStorage.getItem(ACTIVE_TASK_STORAGE_KEY);
    const initialTask = records.find((task) => task.id === storedActiveId && !task.archived)
      || records.find((task) => !task.archived)
      || records[0];

    setTasks(records);
    setActiveTaskId(initialTask.id);
    activeTaskIdRef.current = initialTask.id;
    applyWorkflowSnapshot(initialTask.snapshot);
  }, [applyWorkflowSnapshot]);

  useEffect(() => {
    if (!taskHydratedRef.current || typeof window === 'undefined') return;
    if (!taskInitialSaveSkippedRef.current) {
      taskInitialSaveSkippedRef.current = true;
      return;
    }
    try {
      window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
      if (activeTaskId) {
        window.localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, activeTaskId);
      }
    } catch {
      // Local history is best-effort; failed writes should not interrupt the research workflow.
    }
  }, [activeTaskId, tasks]);

  useEffect(() => {
    if (!taskHydratedRef.current || taskPersistPausedRef.current || !activeTaskId) return;
    const timer = window.setTimeout(() => {
      const snapshot = buildCurrentSnapshot();
      setTasks((prev) => prev.map((task) => (
        task.id === activeTaskId
          ? {
              ...task,
              title: deriveTaskTitle(snapshot),
              updatedAt: Date.now(),
              snapshot,
            }
          : task
      )));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [activeTaskId, buildCurrentSnapshot]);

  useEffect(() => {
    if (workflowRestoreRef.current || typeof window === 'undefined') return;
    workflowRestoreRef.current = true;

    let snapshot: AgentWorkflowSnapshot | null = null;
    let returnedStructure: MolecularStructure | null = null;
    try {
      const rawSnapshot = window.sessionStorage.getItem(WORKFLOW_STORAGE_KEY);
      if (rawSnapshot) {
        const parsed = JSON.parse(rawSnapshot) as AgentWorkflowSnapshot;
        if (parsed?.version === 1) snapshot = parsed;
      }
      const rawReturn = window.sessionStorage.getItem(MODELING_RETURN_KEY);
      if (rawReturn) {
        const parsedReturn = JSON.parse(rawReturn) as ModelingReturnPayload;
        returnedStructure = cloneWorkflowStructure(parsedReturn?.structure || null);
        window.sessionStorage.removeItem(MODELING_RETURN_KEY);
      }
    } catch {
      snapshot = null;
      returnedStructure = null;
    }

    if (!snapshot && !returnedStructure) return;

    if (!returnedStructure) {
      if (snapshot) applyWorkflowSnapshot(snapshot);
      return;
    }

    const structure = returnedStructure;
    const baseSnapshot: AgentWorkflowSnapshot = {
      ...createEmptyWorkflowSnapshot(),
      ...(snapshot || {}),
      version: 1,
    };
    const nextSnapshot: AgentWorkflowSnapshot = {
      ...baseSnapshot,
      version: 1,
      savedAt: Date.now(),
      phase: 'await_software',
      modelStructure: structure,
      compiledInputs: null,
      selectedInputFileName: null,
      jobStatus: null,
      computeResult: null,
      pptUrl: null,
      pptQa: null,
      messages: [
        ...(baseSnapshot.messages?.length ? baseSnapshot.messages : createWelcomeMessages()),
        {
          id: newId('msg'),
          role: 'assistant',
          title: '模型修改已确认',
          content: [
            `已从 Modeling Agent 接收修改后的结构：${structure.filename}。`,
            `当前结构包含 ${structure.atoms.length} 个原子、${structure.bonds.length} 条键。`,
            '下一步继续选择计算软件；我会基于这版结构重新生成输入文件。',
          ].join('\n'),
          createdAt: Date.now(),
          status: 'success',
        },
      ],
      toolEvents: [
        ...(baseSnapshot.toolEvents || []),
        {
          id: newId('tool'),
          name: 'modeling.confirm-return',
          agent: 'Modeling',
          status: 'success',
          summary: '从 Modeling Agent 确认返回连续科研流程',
          details: [`${structure.atoms.length} atoms`, `${structure.bonds.length} bonds`, structure.filename],
        },
      ],
      chatSessionId: baseSnapshot.chatSessionId || chatSessionIdRef.current,
    };
    applyWorkflowSnapshot(nextSnapshot);

    const taskId = activeTaskIdRef.current;
    if (taskId) {
      setTasks((prev) => prev.map((task) => (
        task.id === taskId
          ? {
              ...task,
              title: deriveTaskTitle(nextSnapshot),
              updatedAt: Date.now(),
              snapshot: nextSnapshot,
            }
          : task
      )));
    }

    try {
      window.sessionStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(nextSnapshot));
    } catch {
      // Best-effort resume cache.
    }
  }, [
    applyWorkflowSnapshot,
  ]);

  const persistActiveTaskNow = useCallback((snapshotOverride?: AgentWorkflowSnapshot) => {
    if (!activeTaskId) return;
    const snapshot = snapshotOverride || buildCurrentSnapshot();
    setTasks((prev) => prev.map((task) => (
      task.id === activeTaskId
        ? {
            ...task,
            title: deriveTaskTitle(snapshot),
            updatedAt: Date.now(),
            snapshot,
          }
        : task
    )));
  }, [activeTaskId, buildCurrentSnapshot]);

  const openTask = useCallback((taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    persistActiveTaskNow();
    setActiveTaskId(task.id);
    activeTaskIdRef.current = task.id;
    applyWorkflowSnapshot(task.snapshot);
  }, [applyWorkflowSnapshot, persistActiveTaskNow, tasks]);

  const createNewTask = useCallback(() => {
    persistActiveTaskNow();
    const record = createTaskRecord();
    setTasks((prev) => [record, ...prev]);
    setActiveTaskId(record.id);
    activeTaskIdRef.current = record.id;
    setShowArchivedTasks(false);
    applyWorkflowSnapshot(record.snapshot);
  }, [applyWorkflowSnapshot, persistActiveTaskNow]);

  const archiveTask = useCallback((taskId: string) => {
    const currentSnapshot = buildCurrentSnapshot();
    const currentSavedAt = Date.now();
    const archivedAt = Date.now();
    const nextRecords = tasks.map((task) => {
      let nextTask = task;
      if (task.id === activeTaskId) {
        nextTask = {
          ...nextTask,
          title: deriveTaskTitle(currentSnapshot),
          updatedAt: currentSavedAt,
          snapshot: currentSnapshot,
        };
      }
      if (task.id === taskId) {
        nextTask = { ...nextTask, archived: true, updatedAt: archivedAt };
      }
      return nextTask;
    });
    if (taskId !== activeTaskId) {
      setTasks(nextRecords);
      return;
    }

    const nextOpenTask = nextRecords.find((task) => !task.archived && task.id !== taskId);
    if (nextOpenTask) {
      setTasks(nextRecords);
      setActiveTaskId(nextOpenTask.id);
      activeTaskIdRef.current = nextOpenTask.id;
      applyWorkflowSnapshot(nextOpenTask.snapshot);
      return;
    }

    const replacement = createTaskRecord();
    setTasks([replacement, ...nextRecords]);
    setActiveTaskId(replacement.id);
    activeTaskIdRef.current = replacement.id;
    setShowArchivedTasks(false);
    applyWorkflowSnapshot(replacement.snapshot);
  }, [activeTaskId, applyWorkflowSnapshot, buildCurrentSnapshot, tasks]);

  const deleteTask = useCallback((taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`确定删除“${task.title}”？此操作不可恢复。`);
    if (!confirmed) return;

    const currentSnapshot = buildCurrentSnapshot();
    const currentSavedAt = Date.now();
    const nextRecords = tasks
      .filter((item) => item.id !== taskId)
      .map((item) => (
        item.id === activeTaskId
          ? {
              ...item,
              title: deriveTaskTitle(currentSnapshot),
              updatedAt: currentSavedAt,
              snapshot: currentSnapshot,
            }
          : item
      ));

    if (taskId !== activeTaskId) {
      setTasks(nextRecords);
      return;
    }

    const nextOpenTask = nextRecords.find((item) => !item.archived);
    if (nextOpenTask) {
      setTasks(nextRecords);
      setActiveTaskId(nextOpenTask.id);
      activeTaskIdRef.current = nextOpenTask.id;
      setShowArchivedTasks(false);
      applyWorkflowSnapshot(nextOpenTask.snapshot);
      return;
    }

    const replacement = createTaskRecord();
    setTasks([replacement, ...nextRecords]);
    setActiveTaskId(replacement.id);
    activeTaskIdRef.current = replacement.id;
    setShowArchivedTasks(false);
    applyWorkflowSnapshot(replacement.snapshot);
  }, [activeTaskId, applyWorkflowSnapshot, buildCurrentSnapshot, tasks]);

  const restoreTask = useCallback((taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    persistActiveTaskNow();
    const restored = { ...task, archived: false, updatedAt: Date.now() };
    setTasks((prev) => prev.map((item) => (item.id === taskId ? restored : item)));
    setShowArchivedTasks(false);
    setActiveTaskId(taskId);
    activeTaskIdRef.current = taskId;
    applyWorkflowSnapshot(restored.snapshot);
  }, [applyWorkflowSnapshot, persistActiveTaskNow, tasks]);

  const getAuthHeaders = useCallback((extra?: Record<string, string>) => {
    const token = localStorage.getItem('vasp_token') || '';
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const withUserPayload = useCallback((payload: Record<string, any> = {}) => {
    const userId = user?.email || localStorage.getItem('vasp_user_id') || '';
    return {
      ...payload,
      ...(userId ? { userId, ownerId: userId } : {}),
    };
  }, [user?.email]);

  const postJson = useCallback(async <T,>(
    path: string,
    payload: Record<string, any> = {},
    options: { timeoutMs?: number } = {},
  ): Promise<T> => {
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || 0);
    const timeoutId = timeoutMs > 0
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(withUserPayload(payload)),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
      }
      return data as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`请求超时：${path} 在 ${Math.round(timeoutMs / 1000)} 秒内没有返回`);
      }
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }, [getAuthHeaders, withUserPayload]);

  const fetchStructureSources = useCallback(async () => {
    const load = async (path: string) => {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: getAuthHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !payload?.sources) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      return payload.sources as StructureSourceRegistry;
    };

    try {
      const sources = await load('/agent/structure-sources');
      setStructureSources(sources);
      return sources;
    } catch {
      try {
        const sources = await load('/materials/sources');
        setStructureSources(sources);
        return sources;
      } catch {
        setStructureSources(null);
        return null;
      }
    }
  }, [getAuthHeaders]);

  const appendHarnessCheckpoint = useCallback((checkpoint: HarnessCheckpoint) => {
    setHarnessSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        checkpoints: [...prev.checkpoints.slice(-24), checkpoint],
      };
    });
  }, []);

  const startHarnessSession = useCallback(async (prompt: string) => {
    try {
      const payload = await postJson<{
        success: boolean;
        sessionId: string;
        goalArtifactId?: string | null;
        planArtifactId?: string | null;
        harness?: string;
      }>('/agent/harness/sessions', {
        prompt,
        projectId: 'workspace-agent',
      });
      if (!payload?.sessionId) throw new Error('Harness session was not created');
      harnessSessionIdRef.current = payload.sessionId;
      setHarnessSession({
        sessionId: payload.sessionId,
        goalArtifactId: payload.goalArtifactId || null,
        planArtifactId: payload.planArtifactId || null,
        harness: payload.harness || 'research-orchestrator.v1',
        checkpoints: [{
          id: newId('harness'),
          phase: 'system',
          status: 'success',
          summary: '运行记录已创建',
        }],
      });
      return payload.sessionId;
    } catch (error) {
      harnessSessionIdRef.current = null;
      setHarnessSession(null);
      addMessage({
        role: 'assistant',
        title: 'Harness 记录失败',
        content: `连续 agent 仍会执行，但本次无法写入 runtime harness：${error instanceof Error ? error.message : String(error)}`,
        status: 'error',
      });
      return null;
    }
  }, [addMessage, postJson]);

  const recordHarnessCheckpoint = useCallback(async ({
    phase: checkpointPhase,
    status,
    agent,
    toolName,
    summary,
    details,
    artifact,
    payload,
  }: {
    phase: WorkflowPhase | 'system';
    status: ToolStatus | 'info' | 'waiting';
    agent: string;
    toolName: string;
    summary: string;
    details?: string[];
    artifact?: {
      kind: string;
      summary: string;
      payload: Record<string, any>;
      preview?: Record<string, any>;
      producedBySkill?: string;
    };
    payload?: Record<string, any>;
  }) => {
    const sessionId = harnessSessionIdRef.current;
    if (!sessionId) return;

    const checkpointId = newId('harness');
    appendHarnessCheckpoint({
      id: checkpointId,
      phase: checkpointPhase,
      status,
      summary,
      artifact: artifact ? { id: 'pending', kind: artifact.kind, summary: artifact.summary } : undefined,
    });

    try {
      const result = await postJson<{ success: boolean; artifactId?: string | null }>('/agent/harness/events', {
        sessionId,
        phase: checkpointPhase,
        status,
        agent,
        toolName,
        summary,
        details: details || [],
        payload: payload || {},
        artifact,
      });
      if (artifact && result?.artifactId) {
        setHarnessSession((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            checkpoints: prev.checkpoints.map((item) => (
              item.id === checkpointId && item.artifact
                ? { ...item, artifact: { ...item.artifact, id: result.artifactId || item.artifact.id } }
                : item
            )),
          };
        });
      }
    } catch (error) {
      appendHarnessCheckpoint({
        id: newId('harness-error'),
        phase: checkpointPhase,
        status: 'error',
        summary: `Harness write failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }, [appendHarnessCheckpoint, postJson]);

  const fetchProfiles = useCallback(async (options: { log?: boolean } = {}) => {
    const toolId = options.log ? addTool({
      name: 'compute.profiles',
      agent: 'Compute',
      status: 'running',
      summary: '读取可提交的本地/集群 profile',
      details: [],
    }) : null;
    try {
      const response = await fetch(`${API_BASE_URL}/compute/profiles`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Failed to load compute profiles');
      const nextProfiles: ServerComputeProfile[] = Array.isArray(payload.profiles) ? payload.profiles : [];
      setProfiles(nextProfiles);
      const firstConfigured = nextProfiles.find((profile) => profile.configured);
      if (firstConfigured) {
        setSelectedProfileId((prev) => (
          prev && nextProfiles.some((profile) => profile.id === prev) ? prev : firstConfigured.id
        ));
      }
      if (toolId) updateTool(toolId, {
        status: 'success',
        details: nextProfiles.map((profile) => `${profile.label}: ${profile.configured ? 'configured' : 'not configured'}`),
      });
      return nextProfiles;
    } catch (error) {
      if (toolId) updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      return [];
    }
  }, [addTool, updateTool]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    void fetchStructureSources();
  }, [fetchStructureSources]);

  const processAttachedFiles = useCallback(async (files: File[]): Promise<AttachedFileDigest[]> => {
    if (!files.length) return [];
    const toolId = addTool({
      name: 'workspace.attachments',
      agent: 'Orchestrator',
      status: 'running',
      summary: '解析上传文件并写入当前科研任务上下文',
      details: files.map((file) => `${file.name} (${Math.round(file.size / 1024)} KB)`),
    });
    const digests: AttachedFileDigest[] = [];

    for (const file of files) {
      try {
        if (isPdfFile(file)) {
          const formData = new FormData();
          formData.append('file', file);
          const response = await fetch(`${API_BASE_URL}/agent/parse-pdf`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: formData,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload?.success) throw new Error(payload?.error || `PDF parse failed (${response.status})`);
          const summary = summarizeParsedScience(payload.data);
          digests.push({
            name: file.name,
            kind: 'pdf',
            summary,
            context: parsedScienceContext(payload.data),
          });
          continue;
        }

        if (isStructureFile(file)) {
          const structure = isXyzFile(file)
            ? await parseXyzStructure(file)
            : await (await import('../utils/fileParser')).parseVASPFile(file);
          setModelStructure(structure);
          setMolecularData(structure);
          setShowBonds(Boolean(structure.bonds?.length));
          digests.push({
            name: file.name,
            kind: 'structure',
            summary: `${structure.atoms.length} atoms${structure.latticeVectors ? ' · periodic cell' : ''}`,
            structure,
            context: `Uploaded structure ${file.name}: ${structure.atoms.length} atoms, ${structure.bonds.length} bonds.`,
          });
          continue;
        }

        if (/\.(txt|md|csv)$/i.test(file.name) && file.size <= 1024 * 1024) {
          const text = await file.text();
          digests.push({
            name: file.name,
            kind: 'text',
            summary: `${text.trim().length.toLocaleString()} chars read`,
            context: text.slice(0, 4000),
          });
          continue;
        }

        digests.push({
          name: file.name,
          kind: 'unsupported',
          summary: '文件已附加，但当前工作台不会假装读取该格式；请改传 PDF、POSCAR/CONTCAR/CIF/VASP/XYZ 或文本文件。',
        });
      } catch (error) {
        digests.push({
          name: file.name,
          kind: 'unsupported',
          summary: `解析失败：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    updateTool(toolId, {
      status: digests.some((digest) => digest.summary.startsWith('解析失败')) ? 'error' : 'success',
      details: digests.map((digest) => `${digest.name}: ${digest.summary}`),
    });

    addMessage({
      role: 'tool',
      title: '附件解析',
      content: digests.map((digest) => `${digest.name}：${digest.summary}`).join('\n'),
      status: digests.some((digest) => digest.summary.startsWith('解析失败')) ? 'error' : 'success',
    });

    return digests;
  }, [addMessage, addTool, getAuthHeaders, setMolecularData, setShowBonds, updateTool]);

  const probeStructureSource = useCallback(async (db: DatabaseAgent) => {
    const registryId = sourceRegistryId(db.id);
    const registryEntry = sourceRegistryById.get(registryId);
    const formula = activeSourceFormula;

    if (registryEntry && !registryEntry.liveSearch) {
      const summary = registryEntry.notes || `${registryEntry.label} 是后台登记的数据集来源，不伪装成实时结构搜索。`;
      setSourceProbe({
        sourceId: registryId,
        label: registryEntry.label,
        formula,
        status: 'success',
        summary,
        results: [],
        registryEntry,
      });
      addMessage({
        role: 'assistant',
        title: `${registryEntry.label} 数据源`,
        content: `${summary}\n主页：${registryEntry.homepage || 'N/A'}`,
      });
      return;
    }

    setSourceProbe({
      sourceId: registryId,
      label: registryEntry?.label || db.name,
      formula,
      status: 'running',
      summary: `正在用 ${registryEntry?.label || db.name} 查询 ${formula}`,
      results: [],
      registryEntry,
    });
    const toolId = addTool({
      name: `structures.${registryId}`,
      agent: 'Database',
      status: 'running',
      summary: `查询 ${registryEntry?.label || db.name} 结构源`,
      details: [`formula=${formula}`],
    });

    try {
      const query = `formula=${encodeURIComponent(formula)}&sources=${encodeURIComponent(registryId)}&limit=4`;
      let response = await fetch(`${API_BASE_URL}/agent/structures/search?${query}`, {
        headers: getAuthHeaders(),
      });
      if (response.status === 401 || response.status === 403) {
        response = await fetch(`${API_BASE_URL}/materials/search?${query}`);
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      const results: StructureCandidate[] = payload.results?.[registryId] || [];
      const summary = results.length
        ? `返回 ${results.length} 个 ${formula} 结构候选`
        : `${registryEntry?.label || db.name} 没有返回 ${formula} 的可用结构`;
      setSourceProbe({
        sourceId: registryId,
        label: registryEntry?.label || db.name,
        formula,
        status: 'success',
        summary,
        results,
        registryEntry,
      });
      updateTool(toolId, {
        status: 'success',
        details: results.length
          ? results.map((item) => `${item.material_id} · ${item.formula} · ${item.crystal_system || 'unknown'}`)
          : [summary],
      });
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      setSourceProbe({
        sourceId: registryId,
        label: registryEntry?.label || db.name,
        formula,
        status: 'error',
        summary,
        results: [],
        registryEntry,
      });
      updateTool(toolId, { status: 'error', details: [summary] });
    }
  }, [activeSourceFormula, addMessage, addTool, getAuthHeaders, sourceRegistryById, updateTool]);

  const runResearchStackAnalysis = useCallback(async (
    prompt: string,
    data: CompleteData,
    recommendedIdea: IdeaCard | null,
  ) => {
    const toolId = addTool({
      name: 'research-stack.analyze',
      agent: 'Synthesis + Feasibility + Experiment',
      status: 'running',
      summary: '评估合成路线、材料可行性和第一轮实验矩阵',
      details: [
        `${getVerifiedPapers(data.papers || []).length} verified papers`,
        `${data.structures?.length || 0} structures`,
        recommendedIdea ? `model=${recommendedIdea.title}` : 'model=manual required',
      ],
    });

    try {
      const payload = await postJson<{ success: boolean; report: ResearchStackReport }>('/agent/research-stack/analyze', {
        prompt,
        research: data,
        selectedIdea: recommendedIdea,
        modelStructure,
      }, { timeoutMs: 20000 });
      if (!payload?.success || !payload.report) throw new Error('Research stack analysis failed');
      const report = payload.report;
      setResearchStack(report);
      const recipeHitCount = report.recipe_index?.matches?.length || 0;
      const recipeIndexTotal = report.recipe_index?.index?.total || 0;
      const adapterSummaryText = report.adapter_summary
        ? `adapters active=${report.adapter_summary.active || 0}, fallback=${report.adapter_summary.fallback || 0}, missing=${report.adapter_summary.missing || 0}`
        : 'adapters=not reported';
      updateTool(toolId, {
        status: 'success',
        details: [
          `domain=${report.domain}`,
          `feasibility=${report.feasibility.score}/100 (${report.feasibility.level})`,
          `ceder_recipe_hits=${recipeHitCount}/${recipeIndexTotal || 0}`,
          adapterSummaryText,
          `${report.synthesis.routes.length} synthesis route(s)`,
          `${report.experiment.first_batch.length} first-batch experiment(s)`,
        ],
      });
      addMessage({
        role: 'assistant',
        title: '合成可行性与实验方案',
        content: [
          `合成判断：${report.synthesis.summary}`,
          `可行性评分：${report.feasibility.score}/100（${report.feasibility.level}）`,
          `决策：${report.feasibility.decision}`,
          report.recipe_index
            ? `Ceder recipe index：${recipeHitCount ? `命中 ${recipeHitCount} 条` : '无命中'}（本地 ${recipeIndexTotal || 0} 条）`
            : 'Ceder recipe index：未启用',
          '',
          '首选路线：',
          ...(report.synthesis.routes.slice(0, 2).map((route, index) => `${index + 1}. ${route.title} · ${route.method} · ${route.conditions.temperature}, ${route.conditions.atmosphere}${route.doi ? ` · DOI ${route.doi}` : ''}`)),
          '',
          `实验设计：${report.experiment.engine}`,
          `第一批实验：${report.experiment.first_batch.length} 组；优化目标：${report.experiment.objective}`,
          report.feasibility.blockers.length ? `需要注意：${report.feasibility.blockers.slice(0, 2).join('；')}` : '当前没有低分阻塞项；仍需人工确认实验安全和材料来源。',
        ].join('\n'),
      });
      void recordHarnessCheckpoint({
        phase: 'retrieving',
        status: 'success',
        agent: 'Synthesis + Feasibility + Experiment',
        toolName: 'research_stack.analyze',
        summary: 'Synthesis feasibility and experiment plan generated',
        details: [
          `domain=${report.domain}`,
          `score=${report.feasibility.score}`,
          `ceder_recipe_hits=${recipeHitCount}`,
          `${report.synthesis.routes.length} synthesis routes`,
          `${report.experiment.first_batch.length} first-batch experiments`,
        ],
        artifact: {
          kind: 'materials_research_stack',
          summary: `Materials research stack for ${prompt}`,
          producedBySkill: 'analyze_synthesis_feasibility',
          payload: report as unknown as Record<string, any>,
        },
      });
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateTool(toolId, { status: 'error', details: [message] });
      addMessage({
        role: 'assistant',
        title: '合成可行性分析未完成',
        content: `文献和建模流程仍可继续；合成/实验设计这一步失败：${message}`,
        status: 'error',
      });
      return null;
    }
  }, [addMessage, addTool, modelStructure, postJson, recordHarnessCheckpoint, updateTool]);

  const runRetrieval = useCallback(async (prompt: string) => {
    setPhase('retrieving');
    harnessSessionIdRef.current = null;
    setHarnessSession(null);
    setResearch(null);
    setSelectedIdeaId(null);
    setModelIntent(null);
    setModelStructure(null);
    setCompiledInputs(null);
    setJobStatus(null);
    setComputeResult(null);
    setPptUrl(null);
    setPptQa(null);
    setResearchStack(null);

    const sessionId = await startHarnessSession(prompt);
    if (sessionId) {
      void recordHarnessCheckpoint({
        phase: 'retrieving',
        status: 'running',
        agent: 'Orchestrator',
        toolName: 'agent.retrieve',
        summary: 'Started literature and database retrieval',
        details: [prompt],
      });
    }

    addMessage({
      role: 'assistant',
      title: '可见思路',
      content: [
        '1. 先把目标识别为文献检索和候选模型推荐任务。',
        '2. 同步检索论文源和材料结构源，避免只凭生成模型猜体系。',
        '3. 用论文证据、结构可得性和可计算性给出 starter model，再等你确认。',
      ].join('\n'),
    });

    const toolId = addTool({
      name: 'agent.retrieve',
      agent: 'Literature + Databases',
      status: 'running',
      summary: '检索论文、材料数据库和建模候选',
      details: ['Connecting to retrieval stream...'],
    });

    try {
      const response = await fetch(`${API_BASE_URL}/agent/retrieve`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(withUserPayload({ prompt })),
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;
          const event: AgentEvent = JSON.parse(raw);
          if (event.type === 'stage') {
            const stageLine = `${event.status === 'done' ? 'done' : 'running'} · ${event.title}${event.content ? ` · ${event.content.split('\n')[0]}` : ''}`;
            setToolEvents((prev) => prev.map((tool) => (
              tool.id === toolId
                ? { ...tool, details: [...tool.details.slice(-11), stageLine] }
                : tool
            )));
          }
          if (event.type === 'error') {
            throw new Error(event.content);
          }
          if (event.type === 'complete') {
            const data = applyEvidenceBackedRecommendation(prompt, event.data);
            const verifiedPapers = getVerifiedPapers(data.papers || []);
            const recommendedIdea = getRecommendedIdea(data);
            const noRecommendationReason = data.no_model_recommendation?.reason || '本轮没有找到能和检索文献对应的结构数据库条目。';
            setResearch(data);
            setSelectedIdeaId(recommendedIdea?.id || null);
            updateTool(toolId, {
              status: 'success',
              details: [
                `${verifiedPapers.length} 篇可核验文献`,
                `${data.structures?.length || 0} structures collected`,
                recommendedIdea ? `recommended: ${recommendedIdea.title}` : 'recommended: none; manual modeling required',
              ],
            });
            addMessage({
              role: 'assistant',
              title: '检索结果和模型建议',
              content: [
                `目标理解：${data.user_goal?.interpreted_goal || prompt}`,
                '',
                '可核验文献：',
                ...(topPaperLines(data.papers || [], 6).length ? topPaperLines(data.papers || [], 6) : ['没有返回带 DOI 或来源链接的文献。本轮不会把不可追溯条目当作证据。']),
                '',
                '候选结构（真实数据库）：',
                ...(topStructureLines(data.structures || [], 6).length ? topStructureLines(data.structures || [], 6) : ['没有从已连接结构数据库返回候选结构。本轮不会强行推荐模型。']),
                data.structure_query_plan?.sources?.length
                  ? `结构查询：${data.structure_query_plan.sources.slice(0, 6).map((item) => `${item.formula}（${structureQueryReasonLabel(item.reason)}）`).join('、')}`
                  : '结构查询：暂无可查公式，等待你在 Modeling Agent 中指定材料或晶面。',
                '',
                recommendedIdea ? `推荐模型：${recommendedIdea.title}` : '推荐模型：暂无推荐',
                recommendedIdea ? `推荐原因：${recommendedIdea.fit_reason}` : `原因：${noRecommendationReason}`,
                '',
                recommendedIdea
                  ? '是否使用这个推荐模型？也可以直接在输入框写你想改成的模型、晶面、吸附物或材料。'
                  : '下一步需要你自己建模：可以点击“去 Modeling Agent 自建模型”，然后按目标论文确定材料、晶面、熔盐组分、吸附物或缺陷。'
              ].join('\n'),
            });
            void recordHarnessCheckpoint({
              phase: 'await_model',
              status: 'success',
              agent: 'Retrieval + Database',
              toolName: 'agent.retrieve',
              summary: 'Research bundle ready; waiting for model choice',
              details: [
                `${verifiedPapers.length} 篇可核验文献`,
                `${data.structures?.length || 0} structures`,
                `${data.idea_cards?.length || 0} 个模型建议`,
              ],
              artifact: {
                kind: 'research_bundle',
                summary: `Research bundle for ${prompt}`,
                producedBySkill: 'retrieve_literature_and_structures',
                payload: data as unknown as Record<string, any>,
              },
            });
            await runResearchStackAnalysis(prompt, data, recommendedIdea);
            setPhase('await_model');
          }
        }
      }
    } catch (error) {
      updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      addMessage({
        role: 'assistant',
        title: '检索失败',
        content: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
      setPhase('error');
    }
  }, [addMessage, addTool, getAuthHeaders, recordHarnessCheckpoint, runResearchStackAnalysis, startHarnessSession, updateTool, withUserPayload]);

  const buildModel = useCallback(async (customPrompt?: string) => {
    const prompt = customPrompt?.trim()
      || selectedIdea?.blueprint?.handoff_prompt
      || selectedIdea?.blueprint?.structure_source?.formula
      || research?.handoff?.handoff_prompt
      || research?.handoff?.formula
      || '';
    if (!prompt) {
      addMessage({ role: 'assistant', title: '需要模型描述', content: '请告诉我材料、分子、晶面或吸附物，例如：Cu(111) slab with CO2 and H2.' });
      return;
    }

    setPhase('modeling');
    const parseToolId = addTool({
      name: 'modeling.parse-intent',
      agent: 'Modeling',
      status: 'running',
      summary: '把推荐或自定义模型转换成结构化建模意图',
      details: [prompt],
    });
    let currentToolId = parseToolId;

    try {
      const parsePayload = await postJson<{ success: boolean; intent: Record<string, any> }>('/modeling/parse-intent', {
        prompt,
        providerPreferences: ['mp', 'ase', 'builtin'],
      }, { timeoutMs: 20000 });
      if (!parsePayload?.success) throw new Error('Modeling intent parse failed');
      const parsedIntent = parsePayload.intent || {};
      const intent: Record<string, any> = {
        ...parsedIntent,
        provider_preferences: parsedIntent.provider_preferences?.length
          ? parsedIntent.provider_preferences
          : ['mp', 'ase', 'builtin'],
      };
      setModelIntent(intent);
      updateTool(parseToolId, {
        status: 'success',
        details: [
          `task_type: ${intent.task_type || 'unknown'}`,
          `material: ${intent.substrate?.material || intent.adsorbates?.[0]?.formula || 'n/a'}`,
          `providers: ${(intent.provider_preferences || []).join(', ')}`,
        ],
      });
      void recordHarnessCheckpoint({
        phase: 'modeling',
        status: 'success',
        agent: 'Modeling',
        toolName: 'modeling.parse-intent',
        summary: 'Structured modeling intent parsed',
        details: [
          `task_type=${intent.task_type || 'unknown'}`,
          `providers=${(intent.provider_preferences || []).join(', ')}`,
        ],
        artifact: {
          kind: 'modeling_intent',
          summary: `Modeling intent for ${intent.task_type || 'structure'}`,
          producedBySkill: 'modeling_build_structure',
          payload: intent,
        },
      });

      const buildToolId = addTool({
        name: 'modeling.build',
        agent: 'Modeling',
        status: 'running',
        summary: '调用确定性结构构建器生成可计算结构',
        details: [],
      });
      currentToolId = buildToolId;
      const buildController = new AbortController();
      const buildTimeoutId = window.setTimeout(() => buildController.abort(), 45000);
      const buildResponse = await fetch(`${API_BASE_URL}/modeling/build`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        signal: buildController.signal,
        body: JSON.stringify(intent),
      }).finally(() => window.clearTimeout(buildTimeoutId));
      const buildPayload = await buildResponse.json().catch(() => ({}));
      if (!buildResponse.ok || !(buildPayload?.success || buildPayload?.ok) || !buildPayload?.data) {
        throw new Error(buildPayload?.error || 'Modeling build failed');
      }
      const structure = buildMolecularStructure(buildPayload, intent.task_type || 'model');
      setModelStructure(structure);
      setMolecularData(structure);
      if (structure.bonds.length) setShowBonds(true);
      updateTool(buildToolId, {
        status: 'success',
        details: [
          `${structure.atoms.length} atoms`,
          `${structure.bonds.length} bonds`,
          buildPayload?.meta?.source || buildPayload?.meta?.builder || 'deterministic builder',
        ].filter(Boolean),
      });
      addMessage({
        role: 'assistant',
        title: '模型已生成',
        content: [
          `已生成 ${structure.filename}。`,
          `原子数：${structure.atoms.length}；键数：${structure.bonds.length}。`,
          '你可以先打开完整建模页调整结构，确认后会回到这里继续下一步。',
          '下一步请选择计算软件。我建议周期性催化/表面吸附体系先用 VASP relaxation，之后可追加 static/DOS。'
        ].join('\n'),
      });
      void recordHarnessCheckpoint({
        phase: 'await_software',
        status: 'success',
        agent: 'Modeling',
        toolName: 'modeling.build',
        summary: 'Deterministic structure generated; waiting for software choice',
        details: [
          `${structure.atoms.length} atoms`,
          `${structure.bonds.length} bonds`,
          structure.filename,
        ],
        artifact: {
          kind: 'structure',
          summary: structure.filename,
          producedBySkill: 'modeling_build_structure',
          payload: {
            filename: structure.filename,
            atomCount: structure.atoms.length,
            bondCount: structure.bonds.length,
            atoms: structure.atoms.map((atom) => ({ element: atom.element, position: atom.position })),
            bonds: structure.bonds,
            latticeVectors: structure.latticeVectors,
            intent,
          },
        },
      });
      setPhase('await_software');
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? '建模请求超时：后端在限定时间内没有返回'
        : error instanceof Error ? error.message : String(error);
      updateTool(currentToolId, {
        status: 'error',
        details: [message],
      });
      addMessage({
        role: 'assistant',
        title: '建模失败',
        content: message,
        status: 'error',
      });
      setPhase('error');
    }
  }, [addMessage, addTool, getAuthHeaders, postJson, recordHarnessCheckpoint, research, selectedIdea, setMolecularData, setShowBonds, updateTool]);

  const openModelingForWorkflow = useCallback(() => {
    if (!modelStructure) {
      addMessage({
        role: 'assistant',
        title: '没有可编辑结构',
        content: '请先让 Agent 生成或上传一个模型结构，再进入 Modeling Agent 修改。',
        status: 'error',
      });
      return;
    }
    saveWorkflowSnapshot({ phase: 'await_software', modelStructure });
    setMolecularData(modelStructure);
    setShowBonds(Boolean(modelStructure.bonds?.length));
    navigate('/agent/modeling?return=agent-workflow');
  }, [addMessage, modelStructure, navigate, saveWorkflowSnapshot, setMolecularData, setShowBonds]);

  const openManualModelingForWorkflow = useCallback(() => {
    const prompt = research?.user_goal?.interpreted_goal || messages.find((message) => message.role === 'user')?.content || workspacePrompt || '请根据目标文献手动建立模型';
    saveWorkflowSnapshot({
      phase: 'await_model',
      selectedIdeaId: null,
      modelStructure: null,
      compiledInputs: null,
      selectedInputFileName: null,
    });
    setMolecularData(null);
    setShowBonds(false);
    const params = new URLSearchParams({
      return: 'agent-workflow',
      prompt,
    });
    navigate(`/agent/modeling?${params.toString()}`);
  }, [messages, navigate, research?.user_goal?.interpreted_goal, saveWorkflowSnapshot, setMolecularData, setShowBonds, workspacePrompt]);

  const compileInputs = useCallback(async (nextIntent: ComputeIntent) => {
    if (!modelStructure) {
      addMessage({ role: 'assistant', title: '没有结构', content: '请先确认或生成模型结构，再生成计算输入。', status: 'error' });
      return;
    }
    setPhase('compiling');
    setCompiledInputs(null);
    const toolId = addTool({
      name: 'compute.compile',
      agent: 'Compute',
      status: 'running',
      summary: `生成 ${nextIntent.engine} ${nextIntent.workflow} 输入文件`,
      details: [`quality=${nextIntent.quality}`, `vdw=${nextIntent.vdw}`, `spin=${nextIntent.spin_mode}`],
    });
    try {
      const payload = await postJson<any>('/compute/compile', {
        structure: structurePayloadFromModel(modelStructure, nextIntent),
        intent: nextIntent,
      });
      if (!payload?.success || !payload?.files) {
        throw new Error(payload?.error || 'Compute input compilation failed');
      }
      const nextCompiled: CompiledInputs = {
        files: payload.files,
        normalizedIntent: payload.normalizedIntent,
        success: true,
      };
      setCompiledInputs(nextCompiled);
      setSelectedInputFileName(Object.keys(nextCompiled.files)[0] || null);
      updateTool(toolId, {
        status: 'success',
        details: Object.keys(nextCompiled.files).map((fileName) => fileName),
      });
      addMessage({
        role: 'assistant',
        title: '输入文件建议',
        content: [
          `已为 ${nextIntent.engine} / ${nextIntent.workflow} 生成 ${Object.keys(nextCompiled.files).length} 个输入文件。`,
          `推荐参数：quality=${nextIntent.quality}, spin=${nextIntent.spin_mode}, vdw=${String(nextIntent.vdw)}, kpoints=${nextIntent.kpoints_mode}。`,
          '是否使用推荐输入文件？如果要改，请直接告诉我具体修改，例如：ENCUT=520, quality=high, workflow=static。'
        ].join('\n'),
      });
      void recordHarnessCheckpoint({
        phase: 'await_input',
        status: 'success',
        agent: 'Compute',
        toolName: 'compute.compile',
        summary: 'Compute input set compiled; waiting for user review',
        details: Object.keys(nextCompiled.files),
        artifact: {
          kind: 'compute_input_set',
          summary: `${nextIntent.engine} ${nextIntent.workflow} input set`,
          producedBySkill: 'compile_input_set',
          payload: {
            files: nextCompiled.files,
            normalizedIntent: payload.normalizedIntent,
            intent: nextIntent,
            sourceStructure: {
              filename: modelStructure.filename,
              atomCount: modelStructure.atoms.length,
              latticeVectors: modelStructure.latticeVectors,
            },
          },
        },
      });
      setPhase('await_input');
    } catch (error) {
      updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      addMessage({
        role: 'assistant',
        title: '输入文件生成失败',
        content: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
      setPhase('error');
    }
  }, [addMessage, addTool, modelStructure, postJson, recordHarnessCheckpoint, updateTool]);

  const selectEngine = useCallback((engine: EngineType) => {
    const nextIntent = { ...computeIntent, engine };
    setComputeIntent(nextIntent);
    addMessage({
      role: 'user',
      content: `选择计算软件：${engineOptions.find((item) => item.id === engine)?.label || engine}`,
    });
    void recordHarnessCheckpoint({
      phase: 'await_software',
      status: 'success',
      agent: 'Orchestrator',
      toolName: 'human.choose_software',
      summary: `User selected ${engine}`,
      details: [engineOptions.find((item) => item.id === engine)?.summary || engine],
    });
    void compileInputs(nextIntent);
  }, [addMessage, compileInputs, computeIntent, recordHarnessCheckpoint]);

  const applyInputModification = useCallback((text: string) => {
    const params = parseCustomParams(text);
    const nextIntent: ComputeIntent = {
      ...computeIntent,
      workflow: (params.workflow as ComputeIntent['workflow']) || computeIntent.workflow,
      quality: (params.quality as ComputeIntent['quality']) || computeIntent.quality,
      custom_params: {
        ...(computeIntent.custom_params || {}),
        ...params,
      },
    };
    delete nextIntent.custom_params?.workflow;
    delete nextIntent.custom_params?.quality;
    setComputeIntent(nextIntent);
    addMessage({ role: 'user', content: `修改输入文件：${text}` });
    void recordHarnessCheckpoint({
      phase: 'await_input',
      status: 'success',
      agent: 'Orchestrator',
      toolName: 'human.modify_inputs',
      summary: 'User requested input-file changes',
      details: [text],
      payload: { parsedParams: params },
    });
    void compileInputs(nextIntent);
  }, [addMessage, compileInputs, computeIntent, recordHarnessCheckpoint]);

  const acceptInputs = useCallback(() => {
    if (!compiledInputs) return;
    void recordHarnessCheckpoint({
      phase: 'await_input',
      status: 'success',
      agent: 'Orchestrator',
      toolName: 'human.accept_inputs',
      summary: 'User accepted the recommended input files',
      details: Object.keys(compiledInputs.files),
    });
    addMessage({
      role: 'assistant',
      title: '选择提交位置',
      content: configuredProfiles.length
        ? `可以提交到：${configuredProfiles.map((profile) => profile.label).join('、')}。请选择目标。`
        : '当前没有配置真实集群，仍可使用 Local Demo Runner 物化输入文件并跑通流程。',
    });
    setPhase('await_submit');
  }, [addMessage, compiledInputs, configuredProfiles, recordHarnessCheckpoint]);

  const fetchResults = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/results`);
      const payload = await response.json();
      if (payload?.success) {
        setComputeResult(payload.metrics || null);
        addMessage({
          role: 'assistant',
          title: '计算结束',
          content: [
            `状态：${payload.metrics?.converged ? 'converged' : 'finished / check warnings'}`,
            `能量：${payload.metrics?.totalEnergyEv != null ? `${payload.metrics.totalEnergyEv} eV` : 'N/A'}`,
            `最大力：${payload.metrics?.maxForceEvPerA != null ? `${payload.metrics.maxForceEvPerA} eV/A` : 'N/A'}`,
            '是否输出结果并生成可下载中文 PPT？'
          ].join('\n'),
        });
        void recordHarnessCheckpoint({
          phase: 'await_ppt',
          status: 'success',
          agent: 'Compute',
          toolName: 'compute.results',
          summary: 'Compute result bundle ready; waiting for presentation choice',
          details: [
            `converged=${String(payload.metrics?.converged ?? 'unknown')}`,
            `energy=${payload.metrics?.totalEnergyEv ?? 'N/A'}`,
            `maxForce=${payload.metrics?.maxForceEvPerA ?? 'N/A'}`,
          ],
          artifact: {
            kind: 'result_bundle',
            summary: `Results for job ${jobId}`,
            producedBySkill: 'harvest_local_result',
            payload: {
              jobId,
              metrics: payload.metrics || null,
              warnings: payload.warnings || [],
              hasContcar: Boolean(payload.hasContcar),
              contcar: payload.contcar || null,
            },
          },
        });
        setPhase('await_ppt');
      }
    } catch (error) {
      addMessage({ role: 'assistant', title: '结果读取失败', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, recordHarnessCheckpoint]);

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase('monitoring');
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/status`);
        const payload = await response.json();
        if (!payload?.success) return;
        setJobStatus((prev) => prev ? {
          ...prev,
          status: payload.jobStatus,
          updated_at: Date.now(),
          message: payload.schedulerState || payload.jobStatus,
        } : prev);
        if (['completed', 'failed', 'cancelled'].includes(payload.jobStatus)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (payload.jobStatus === 'completed') {
            void fetchResults(jobId);
          } else {
            addMessage({ role: 'assistant', title: '计算没有完成', content: `Job ${jobId}: ${payload.jobStatus}`, status: 'error' });
            setPhase('error');
          }
        }
      } catch {
        // Keep polling through transient network errors.
      }
    }, 5000);
  }, [addMessage, fetchResults]);

  const submitJob = useCallback(async (profileId: string) => {
    if (!compiledInputs || !modelStructure) return;
    const profile = profiles.find((item) => item.id === profileId) || selectedProfile;
    if (!profile) {
      addMessage({ role: 'assistant', title: '没有提交目标', content: '请先配置或选择计算 profile。', status: 'error' });
      return;
    }
    setSelectedProfileId(profile.id);
    setPhase('submitting');
    const toolId = addTool({
      name: 'compute.submit',
      agent: 'Compute',
      status: 'running',
      summary: `提交到 ${profile.label}`,
      details: [profile.summary],
    });
    try {
      void recordHarnessCheckpoint({
        phase: 'await_submit',
        status: 'success',
        agent: 'Orchestrator',
        toolName: 'human.choose_submit_target',
        summary: `User selected submit target ${profile.label}`,
        details: [profile.summary],
      });
      const payload = await postJson<any>('/compute/submit', {
        profileId: profile.id,
        structure: { meta: { formula: modelStructure.filename } },
        intent: computeIntent,
        compiledFiles: compiledInputs.files,
      });
      if (!payload?.success) throw new Error(payload?.error || 'Job submission failed');
      const job: JobStatus = {
        id: payload.jobId,
        status: 'queued',
        job_id: payload.externalJobId,
        externalJobId: payload.externalJobId,
        profileId: profile.id,
        submissionMode: payload.submissionMode,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      setJobStatus(job);
      updateTool(toolId, {
        status: 'success',
        details: [`jobId=${payload.jobId}`, `external=${payload.externalJobId || 'local'}`, `mode=${payload.submissionMode || profile.mode}`],
      });
      addMessage({
        role: 'assistant',
        title: '作业已提交',
        content: `已提交到 ${profile.label}。我会继续轮询状态，完成后询问是否生成 PPT。`,
      });
      void recordHarnessCheckpoint({
        phase: 'monitoring',
        status: 'success',
        agent: 'Compute',
        toolName: 'compute.submit',
        summary: `Job submitted to ${profile.label}`,
        details: [`jobId=${payload.jobId}`, `external=${payload.externalJobId || 'local'}`, `mode=${payload.submissionMode || profile.mode}`],
        payload: {
          jobId: payload.jobId,
          externalJobId: payload.externalJobId || null,
          profileId: profile.id,
          submissionMode: payload.submissionMode || profile.mode,
        },
      });
      startPolling(payload.jobId);
    } catch (error) {
      updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      addMessage({ role: 'assistant', title: '提交失败', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, addTool, compiledInputs, computeIntent, modelStructure, postJson, profiles, recordHarnessCheckpoint, selectedProfile, startPolling, updateTool]);

  const generatePpt = useCallback(async () => {
    setPhase('ppt');
    const toolId = addTool({
      name: 'presentation.generate-ppt',
      agent: 'Presentation',
      status: 'running',
      summary: '生成可下载中文 PPTX',
      details: ['Collecting papers, model, compute inputs and results...'],
    });
    try {
      const payload = await postJson<any>('/agent/presentation/nature-ppt', {
        prompt: messages.find((message) => message.role === 'user')?.content || '',
        research,
        researchStack,
        selectedIdea,
        modelIntent,
        modelStructure: modelStructure ? {
          filename: modelStructure.filename,
          atomCount: modelStructure.atoms.length,
          bondCount: modelStructure.bonds.length,
          latticeVectors: modelStructure.latticeVectors,
        } : null,
        computeIntent,
        compiledFiles: compiledInputs?.files || {},
        jobStatus,
        computeResult,
      });
      if (!payload?.success) throw new Error(payload?.error || 'PPT generation failed');
      if (!payload?.downloadUrl || !payload?.downloadVerified) {
        throw new Error('PPT was generated but the downloadable file could not be verified');
      }
      setPptUrl(payload.downloadUrl);
      setPptQa(payload.qa || null);
      updateTool(toolId, {
        status: 'success',
        details: [payload.filename, payload.fileSize ? `${payload.fileSize} bytes` : 'PPTX package generated'],
      });
      addMessage({
        role: 'assistant',
        title: 'PPT 已生成',
        content: `已生成可下载 PPT：${payload.filename}`,
      });
      void recordHarnessCheckpoint({
        phase: 'done',
        status: 'success',
        agent: 'Presentation',
        toolName: 'presentation.generate_ppt',
        summary: 'Downloadable PPT generated',
        details: [payload.filename, payload.fileSize ? `${payload.fileSize} bytes` : 'PPTX package generated'],
        artifact: {
          kind: 'presentation',
          summary: payload.filename,
          producedBySkill: 'create_presentation',
          payload: {
            filename: payload.filename,
            downloadUrl: payload.downloadUrl,
            qa: payload.qa || null,
            downloadVerified: Boolean(payload.downloadVerified),
            fileSize: payload.fileSize || null,
          },
        },
      });
      setPhase('done');
    } catch (error) {
      updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      addMessage({ role: 'assistant', title: 'PPT 生成失败', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, addTool, compiledInputs, computeIntent, computeResult, jobStatus, messages, modelIntent, modelStructure, postJson, recordHarnessCheckpoint, research, researchStack, selectedIdea, updateTool]);

  const resetTask = createNewTask;

  const runChat = useCallback(async (content: string) => {
    const toolId = addTool({
      name: 'agent.chat',
      agent: 'Conversation',
      status: 'running',
      summary: '调用对话模型并读取长期记忆',
      details: ['mode=chat', chatSessionIdRef.current ? `session=${chatSessionIdRef.current}` : 'new session'],
    });

    try {
      const payload = await postJson<{
        success: boolean;
        sessionId: string;
        reply: string;
        memories?: Array<{ id: string; text: string }>;
        llmConfigured?: boolean;
        llmError?: string | null;
      }>('/agent/chat', {
        sessionId: chatSessionIdRef.current,
        message: content,
      });

      chatSessionIdRef.current = payload.sessionId;
      updateTool(toolId, {
        status: 'success',
        details: [
          payload.llmConfigured ? 'LLM configured' : 'Fallback chat used',
          `${payload.memories?.length || 0} memories available`,
          ...(payload.llmError ? [`LLM note: ${payload.llmError}`] : []),
        ],
      });
      addMessage({
        role: 'assistant',
        title: payload.memories?.length ? `对话 · 已载入 ${payload.memories.length} 条记忆` : '对话',
        content: payload.reply || '我在，但这次没有生成有效回复。',
      });
      if (payload.reply && shouldAutoPromoteChatToRetrieval(content, payload.reply)) {
        addMessage({
          role: 'assistant',
          title: '已接入检索流程',
          content: '我现在开始执行真实文献和数据库检索，不只停留在对话回复。',
        });
        void runRetrieval(content);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateTool(toolId, { status: 'error', details: [message] });
      addMessage({
        role: 'assistant',
        title: '对话失败',
        content: message,
        status: 'error',
      });
    }
  }, [addMessage, addTool, postJson, runRetrieval, updateTool]);

  const handleComposerSubmit = async () => {
    const prompt = workspacePrompt.trim();
    const filesToProcess = attachedFiles;
    const fileNames = filesToProcess.map((file) => file.name);
    if (!prompt && !fileNames.length) return;
    setWorkspacePrompt('');
    setAttachedFiles([]);

    const digests = filesToProcess.length ? await processAttachedFiles(filesToProcess) : [];
    const attachmentContext = digests
      .map((digest) => digest.context ? `### ${digest.name}\n${digest.context}` : `### ${digest.name}\n${digest.summary}`)
      .join('\n\n');
    const content = [
      prompt || (digests.some((digest) => digest.kind === 'structure') ? '基于上传结构继续科研流程' : '处理上传附件'),
      fileNames.length ? `附件：${fileNames.join(', ')}` : '',
      attachmentContext ? `附件解析上下文：\n${attachmentContext}` : '',
    ].filter(Boolean).join('\n\n');

    if (phase === 'await_model') {
      addMessage({ role: 'user', content });
      void recordHarnessCheckpoint({
        phase: 'await_model',
        status: 'success',
        agent: 'Orchestrator',
        toolName: 'human.custom_model',
        summary: 'User provided a custom model instruction',
        details: [content],
      });
      void buildModel(content);
      return;
    }
    if (phase === 'await_input') {
      applyInputModification(content);
      return;
    }
    if (phase === 'await_software') {
      const engine = engineOptions.find((item) => content.toLowerCase().includes(item.id) || content.toLowerCase().includes(item.label.toLowerCase()))?.id || 'vasp';
      selectEngine(engine);
      return;
    }

    addMessage({ role: 'user', content });
    if (phase === 'idle' && !isWorkflowPrompt(content, filesToProcess.length > 0)) {
      void runChat(content);
      return;
    }
    void runRetrieval(content);
  };

  const handleAttachFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length) setAttachedFiles((prev) => [...prev, ...files]);
    event.target.value = '';
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addMessage({ role: 'system', content: '当前浏览器不支持语音输入。' });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) setWorkspacePrompt((prev) => [prev, transcript].filter(Boolean).join(prev ? ' ' : ''));
    };
    recognition.start();
  };

  const handleNavItem = (itemId: string) => {
    if (itemId === 'home') {
      navigate('/');
      return;
    }
    if (itemId === 'agent') {
      navigate('/workspace');
      return;
    }
    if (itemId === 'explore') {
      navigate('/explore');
      return;
    }
    if (itemId === 'library') {
      navigate('/materials');
      return;
    }
    if (itemId === 'skills' || itemId === 'automation') {
      navigate('/agent/runtime');
      return;
    }
    if (itemId === 'experts') {
      addMessage({
        role: 'assistant',
        title: '专家库',
        content: agents.map((agent) => `${agent.name}：${agent.output}`).join('\n'),
      });
      return;
    }
    if (itemId === 'connectors') {
      void (async () => {
        const nextProfiles = await fetchProfiles({ log: true });
        const nextSources = await fetchStructureSources();
        const liveSources = (nextSources?.live || structureSources?.live || []).map((source) => source.label).join('、') || '后台结构源 registry';
        addMessage({
          role: 'assistant',
          title: '连接器状态',
          content: [
            `计算提交位置：${nextProfiles.length ? nextProfiles.map((profile) => `${profile.label}${profile.configured ? '(已配置)' : '(未配置)'}`).join('、') : '暂无 profile'}`,
            `结构数据源：${liveSources}`,
            '需要真实提交时，请先走到“输入文件检查”并选择提交位置。',
          ].join('\n'),
        });
      })();
    }
  };

  const renderDecisionPanel = () => {
    if (phase === 'await_model' && research) {
      const recommendedIdea = getRecommendedIdea(research);
      if (!recommendedIdea) {
        const candidateSummary = topStructureLines(research.structures || [], 3).join('；');
        return (
          <div className="border-t border-gray-200 bg-white px-4 py-3">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openManualModelingForWorkflow}
                className="h-9 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#162044]"
              >
                去 Modeling Agent 自建模型
              </button>
              <span className="text-xs text-gray-400">
                无可用推荐：{research.no_model_recommendation?.reason || '没有和检索文献匹配的结构。'}
              </span>
              {candidateSummary && (
                <span className="max-w-3xl truncate text-xs text-gray-500" title={candidateSummary}>
                  已查到候选：{candidateSummary}
                </span>
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                addMessage({ role: 'user', content: '使用推荐模型' });
                void recordHarnessCheckpoint({
                  phase: 'await_model',
                  status: 'success',
                  agent: 'Orchestrator',
                  toolName: 'human.accept_model',
                  summary: `User accepted recommended model: ${selectedIdea?.title || 'recommended model'}`,
                  details: selectedIdea ? [selectedIdea.fit_reason] : [],
                });
                void buildModel();
              }}
              className="h-9 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#162044]"
            >
              使用推荐模型
            </button>
            {research.idea_cards.slice(0, 4).map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => setSelectedIdeaId(idea.id)}
                className={cx(
                  'h-9 rounded-[32px] border px-3 text-xs font-semibold transition',
                  selectedIdeaId === idea.id ? 'border-[#0A1128] bg-[#F5F5F0] text-[#0A1128]' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                {idea.blueprint?.structure_source?.formula || idea.material_family || idea.title.slice(0, 24)}
              </button>
            ))}
            <span className="text-xs text-gray-400">也可以直接输入自定义模型。</span>
          </div>
        </div>
      );
    }

    if (phase === 'await_software') {
      return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            {engineOptions.map((engine) => (
              <button
                key={engine.id}
                type="button"
                onClick={() => selectEngine(engine.id)}
                className={cx(
                  'h-9 rounded-[32px] border px-3 text-xs font-semibold transition',
                  engine.id === 'vasp' ? 'border-[#0A1128] bg-[#0A1128] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
                title={engine.summary}
              >
                {engine.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (phase === 'await_input') {
      return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acceptInputs}
              className="h-9 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#162044]"
            >
              使用推荐输入文件
            </button>
            <span className="text-xs text-gray-400">需要更改就直接输入参数，例如 ENCUT=520, workflow=static。</span>
          </div>
        </div>
      );
    }

    if (phase === 'await_submit') {
      return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            {(profiles.length ? profiles : [{ id: 'local_demo', label: 'Local Demo Runner', configured: true } as ServerComputeProfile]).map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => void submitJob(profile.id)}
                disabled={!profile.configured}
                className={cx(
                  'h-9 rounded-[32px] border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  profile.configured ? 'border-[#0A1128] bg-[#0A1128] text-white hover:bg-[#162044]' : 'border-gray-200 text-gray-500'
                )}
              >
                提交到 {profile.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (phase === 'await_ppt') {
      return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void generatePpt()}
              className="h-9 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#162044]"
            >
              输出结果并生成 PPT
            </button>
            <button
              type="button"
              onClick={() => {
                addMessage({ role: 'user', content: '不生成 PPT，结束对话' });
                addMessage({ role: 'assistant', title: '已结束', content: '计算结果已保留在当前会话中。' });
                void recordHarnessCheckpoint({
                  phase: 'done',
                  status: 'success',
                  agent: 'Orchestrator',
                  toolName: 'human.skip_presentation',
                  summary: 'User ended the workflow without generating a PPT',
                });
                setPhase('done');
              }}
              className="h-9 rounded-[32px] border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:border-gray-300"
            >
              不需要 PPT
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F5F5F0] text-gray-800">
      <div className="flex h-full min-w-0">
        <aside className="hidden h-full w-[280px] shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-gray-200 px-5 py-5">
            <button type="button" onClick={() => navigate('/workspace')} className="flex w-full items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#0A1128] text-white">
                <Bot size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">科研工作台</p>
                <p className="truncate text-[11px] text-gray-500">Research workflow</p>
              </div>
            </button>
            <div className="mt-4 flex items-center gap-2 rounded-[24px] border border-gray-200 bg-[#F5F5F0] px-3 py-2">
              <Search size={15} className="text-gray-400" />
              <input
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
                placeholder="搜索任务"
              />
              <Settings2 size={15} className="text-gray-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
            <button
              type="button"
              onClick={resetTask}
              className="mb-3 flex w-full items-center gap-2 rounded-[32px] border border-gray-200 bg-white px-4 py-2.5 text-left text-sm font-semibold shadow-[0_4px_30px_rgba(0,0,0,0.04)] transition hover:border-gray-300"
            >
              <MessageSquarePlus size={16} />
              新任务
            </button>

            <div>
              <div className="flex items-center justify-between gap-2 px-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  {showArchivedTasks ? '已归档' : '任务记录'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowArchivedTasks((value) => !value)}
                  className="rounded-[32px] border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 transition hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                >
                  {showArchivedTasks ? `返回 ${activeTasks.length}` : `归档 ${archivedTasks.length}`}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {filteredTasks.map((task) => {
                  const isActive = activeTaskId === task.id;
                  const messageCount = task.snapshot.messages.filter((message) => message.role !== 'system').length;
                  return (
                    <div
                      key={task.id}
                      className={cx(
                        'group flex items-stretch gap-1 rounded-[16px] transition',
                        isActive && !showArchivedTasks ? 'bg-[#F5F5F0]' : 'hover:bg-[#F5F5F0]'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        className="min-w-0 flex-1 px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className={cx('h-2 w-2 shrink-0 rounded-full', isActive ? 'bg-[#0A1128]' : 'bg-gray-300')} />
                          <span className={cx('min-w-0 flex-1 truncate text-xs font-semibold', isActive ? 'text-[#0A1128]' : 'text-gray-700')}>
                            {task.title}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 pl-4 text-[10px] text-gray-400">
                          <span>{phaseLabel[task.snapshot.phase] || '任务'}</span>
                          <span>{messageCount} 条对话</span>
                          <span>{formatTaskTime(task.updatedAt)}</span>
                        </div>
                      </button>
                      <div className="my-1 mr-1 flex shrink-0 items-center gap-1 opacity-80 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => task.archived ? restoreTask(task.id) : archiveTask(task.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-[16px] text-gray-400 transition hover:bg-white hover:text-[#0A1128]"
                          title={task.archived ? '恢复任务' : '归档任务'}
                        >
                          {task.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-[16px] border border-transparent text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          title="删除任务"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!filteredTasks.length && (
                  <div className="rounded-[16px] border border-gray-100 bg-gray-50 px-3 py-3 text-xs leading-5 text-gray-500">
                    {taskSearchQuery ? '没有匹配的任务。' : showArchivedTasks ? '暂无归档任务。' : '暂无历史任务，创建新任务后会自动保存在这里。'}
                  </div>
                )}
              </div>
            </div>

            {!showArchivedTasks && !taskSearchQuery && (
              <div className="mt-6">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">快速开始</p>
                <div className="mt-2 space-y-1">
                  {recentTasks.map((task, index) => (
                    <button
                      key={task}
                      type="button"
                      onClick={() => {
                        createNewTask();
                        setWorkspacePrompt(task);
                      }}
                      className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2 text-left text-xs text-gray-500 transition hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                    >
                      {index === 0 ? <Zap size={14} className="text-[#0A1128]" /> : <Check size={14} className="text-gray-400" />}
                      <span className="min-w-0 flex-1 truncate">{task}</span>
                      <span className="text-[10px] text-gray-400">模板</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">工具入口</p>
              <nav className="mt-2 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavItem(item.id)}
                      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm text-gray-600 transition hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                    >
                      <Icon size={17} />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="border-t border-gray-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[16px] bg-[#F5F5F0] text-xs font-bold text-gray-700">
                {accountLabel.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{accountLabel}</p>
                <p className="truncate text-[11px] text-gray-400">科研工作区</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-4 md:px-6">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 items-center gap-2 rounded-[32px] border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:border-gray-300"
            >
              <Home size={16} />
              首页
            </button>
            <div className="hidden min-w-0 flex-1 md:block">
              <p className="truncate text-sm font-semibold">{activeTask?.title || '连续科研流程'}</p>
              <p className="truncate text-[11px] text-gray-400">检索 &gt; 模型确认 &gt; 输入文件检查 &gt; 提交计算 &gt; 结果汇报</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden h-9 items-center gap-2 rounded-[32px] border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 sm:flex">
                <ShieldCheck size={14} className="text-gray-500" />
                来源校验
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsModelMenuOpen((value) => !value)}
                  className="h-9 rounded-[32px] border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:border-gray-300"
                >
                  deepseek-v4-pro
                </button>
                {isModelMenuOpen && (
                  <div className="absolute right-0 top-11 z-30 w-[260px] rounded-[16px] border border-gray-200 bg-white p-3 text-xs shadow-[0_4px_30px_rgba(0,0,0,0.08)]">
                    <p className="font-semibold text-[#0A1128]">文本规划模型</p>
                    <p className="mt-1 leading-5 text-gray-500">对话规划使用 deepseek-v4-pro；检索、建模、计算和 PPT 由后端工具执行。</p>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1">
            <section className="flex min-h-0 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {agents.map((agent) => {
                    const Icon = agent.icon;
                    return (
                      <div key={agent.id} className="min-h-[78px] w-[168px] shrink-0 rounded-[16px] border border-gray-200 bg-white p-3 text-left">
                        <div className="flex items-center gap-2">
                          <span className={cx('flex h-8 w-8 items-center justify-center rounded-[16px]', agent.accent)}>
                            <Icon size={16} />
                          </span>
                          <StatusPill status={agent.status} />
                        </div>
                        <p className="mt-2 truncate text-xs font-bold">{agent.name}</p>
                        <p className="truncate text-[11px] text-gray-500">{agent.subtitle}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#F5F5F0] px-4 py-5 custom-scrollbar md:px-6">
                <div className="mx-auto max-w-5xl space-y-4">
                  <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#0A1128] text-white">
                        {phase === 'retrieving' || phase === 'modeling' || phase === 'compiling' || phase === 'submitting' || phase === 'monitoring' || phase === 'ppt'
                          ? <Loader2 size={18} className="animate-spin" />
                          : <BrainCircuit size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">流程进度：{phaseLabel[phase]}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {research ? `${getVerifiedPapers(research.papers || []).length} 篇可核验文献 · ${research.idea_cards?.length || 0} 个模型建议` : '等待新的科研任务'}
                          {researchStack ? ` · 可行性 ${researchStack.feasibility.score}/100 · ${researchStack.experiment.first_batch.length} 组实验` : ''}
                          {modelStructure ? ` · ${modelStructure.atoms.length} 个原子` : ''}
                          {compiledInputs ? ` · ${compiledFileNames.length} 个输入文件` : ''}
                          {jobStatus ? ` · 作业 ${jobStatus.status}` : ''}
                        </p>
                      </div>
                      {pptUrl && (
                        <a
                          href={pptUrl}
                          className="flex h-9 items-center gap-2 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#162044]"
                        >
                          <Download size={14} />
                          下载 PPT
                        </a>
                      )}
                    </div>
                  </div>

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cx(
                        'rounded-[24px] border p-4 shadow-[0_4px_30px_rgba(0,0,0,0.04)]',
                        message.role === 'user' ? 'ml-auto max-w-3xl border-gray-200 bg-white text-[#0A1128]' : 'max-w-4xl border-gray-100 bg-white text-gray-800',
                        message.status === 'error' && 'border-red-200 bg-red-50 text-red-600'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[16px]', message.role === 'user' ? 'bg-[#0A1128] text-white' : 'bg-[#F5F5F0] text-gray-600')}>
                          {message.role === 'user' ? <MessageSquarePlus size={15} /> : <Bot size={15} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          {message.title && <p className="text-xs font-bold uppercase tracking-widest opacity-70">{message.title}</p>}
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {research && (
                    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                      <div className="mb-3 flex items-center gap-2">
                        <Library size={16} className="text-gray-500" />
                        <p className="text-sm font-bold text-[#0A1128]">可核验文献</p>
                      </div>
                      {getVerifiedPapers(research.papers || []).length ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {getVerifiedPapers(research.papers || []).slice(0, 6).map((paper) => {
                            const evidenceUrl = paperEvidenceUrl(paper);
                            return (
                              <a
                                key={`${paper.source}-${paper.doi || paper.url || paper.title}`}
                                href={evidenceUrl || paper.ablesci_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-[16px] border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-300 hover:bg-white"
                              >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-[32px] border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                                    {paper.source_label || paper.source}
                                  </span>
                                  <span className="text-[10px] text-gray-400">{paper.year || 'n.d.'}</span>
                                  {paper.doi && <span className="truncate font-mono text-[10px] text-gray-400">DOI {paper.doi}</span>}
                                </div>
                                <p className="line-clamp-2 text-xs font-bold leading-5 text-[#0A1128]">{paper.title}</p>
                                {paper.abstract && <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-gray-500">{paper.abstract}</p>}
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs leading-5 text-gray-500">本轮没有返回带 DOI 或可打开来源链接的文献，因此不会把检索结果当作论文证据。</p>
                      )}
                    </div>
                  )}

                  {research && (
                    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Database size={16} className="text-gray-500" />
                          <div>
                            <p className="text-sm font-bold text-[#0A1128]">候选结构</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {research.structure_query_plan?.sources?.length
                                ? research.structure_query_plan.sources.slice(0, 5).map((item) => `${item.formula}（${structureQueryReasonLabel(item.reason)}）`).join('、')
                                : '没有可查询公式；需要在 Modeling Agent 中指定材料。'}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-[32px] border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-500">
                          {(research.structures || []).length} 个数据库候选
                        </span>
                      </div>
                      {(research.structures || []).length ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {(research.structures || []).slice(0, 8).map((structure) => (
                            <div
                              key={`${structure.source_id || structure.source || 'db'}-${structure.material_id}-${structure.formula}`}
                              className="rounded-[16px] border border-gray-200 bg-gray-50 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-xs font-bold text-[#0A1128]">{structure.formula}</p>
                                  <p className="mt-1 truncate text-[11px] text-gray-500">{structure.material_id || 'no material id'} · {structure.source || structure.source_id || 'Structure DB'}</p>
                                </div>
                                <span className="rounded-[32px] border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                                  {structureQueryReasonLabel(structure.query_reason)}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-2 text-[11px] text-gray-500 sm:grid-cols-3">
                                <span>{structure.space_group || structure.crystal_system || 'space group N/A'}</span>
                                <span>{structure.energy_above_hull && structure.energy_above_hull !== 'N/A' ? `E_hull ${structure.energy_above_hull}` : 'E_hull N/A'}</span>
                                <span>{structure.nsites ? `${structure.nsites} sites` : (structure.band_gap ? `gap ${structure.band_gap}` : 'sites N/A')}</span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-gray-500">{structure.selection_reason}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs leading-5 text-gray-500">本轮没有从真实结构数据库返回候选结构，因此不会强行给模型推荐。可以进入 Modeling Agent 按目标论文自建模型。</p>
                      )}
                    </div>
                  )}

                  {researchStack && (
                    <ResearchStackPanel report={researchStack} />
                  )}

                  {modelStructure && (
                    <StructurePreview structure={modelStructure} onOpenModeling={openModelingForWorkflow} />
                  )}

                  {compiledInputs && (
                    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-[#0A1128]">输入文件检查</p>
                          <p className="mt-1 text-xs text-gray-500">这些内容可直接编辑；提交计算和生成 PPT 会使用编辑后的版本。</p>
                        </div>
                        <button
                          type="button"
                          onClick={acceptInputs}
                          className="rounded-[32px] bg-[#0A1128] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#162044]"
                        >
                          确认输入文件
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {compiledFileNames.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setSelectedInputFileName(name)}
                            className={cx(
                              'rounded-[32px] border px-3 py-1.5 text-xs font-semibold transition',
                              selectedInputFileName === name
                                ? 'border-[#0A1128] bg-[#0A1128] text-white'
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            )}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                      {selectedInputFileName && (
                        <div className="mt-3 overflow-hidden rounded-[16px] border border-gray-200 bg-gray-50">
                          <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                            <span className="font-mono text-xs font-semibold text-gray-700">{selectedInputFileName}</span>
                            <span className="text-[11px] text-gray-400">{selectedInputContent.length.toLocaleString()} chars</span>
                          </div>
                          <textarea
                            value={selectedInputContent}
                            onChange={(event) => updateCompiledInputFile(selectedInputFileName, event.target.value)}
                            onBlur={() => {
                              void recordHarnessCheckpoint({
                                phase: 'await_input',
                                status: 'success',
                                agent: 'Orchestrator',
                                toolName: 'human.edit_input_file',
                                summary: `User edited ${selectedInputFileName}`,
                                details: [`${selectedInputContent.length} chars`],
                              });
                            }}
                            spellCheck={false}
                            className="min-h-[260px] w-full resize-y border-0 bg-transparent p-3 font-mono text-xs leading-5 text-gray-800 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {toolEvents.length > 0 && (
                    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                      <div className="mb-3 flex items-center gap-2">
                        <Play size={15} className="text-gray-500" />
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">执行记录</p>
                      </div>
                      <div className="space-y-3">
                        {toolEvents.map((event) => (
                          <div key={event.id} className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
                            <div className="flex items-center gap-2">
                              {event.status === 'running' ? <Loader2 size={14} className="animate-spin text-[#0A1128]" /> : event.status === 'success' ? <Check size={14} className="text-[#0A1128]" /> : <CircleDot size={14} className="text-red-600" />}
                              <p className="text-xs font-bold text-gray-800">{event.name}</p>
                              <span className="rounded-[16px] border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">{event.agent}</span>
                            </div>
                            <p className="mt-2 text-xs text-gray-600">{event.summary}</p>
                            {event.details.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {event.details.slice(-8).map((detail, index) => (
                                  <p key={`${event.id}-${index}`} className="truncate font-mono text-[10px] text-gray-400" title={detail}>
                                    {detail}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              </div>

              {renderDecisionPanel()}

              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4 md:px-6">
                <div className="mx-auto max-w-5xl rounded-[24px] border border-gray-200 bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".vasp,.poscar,.contcar,.cif,.xyz,.xdatcar,.pdf,.pptx,image/*"
                      onChange={handleAttachFiles}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-8 w-8 items-center justify-center rounded-[16px] text-gray-500 hover:bg-[#F5F5F0]"
                      title="添加文件"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/materials')}
                      className="flex h-8 w-8 items-center justify-center rounded-[16px] text-gray-500 hover:bg-[#F5F5F0]"
                      title="打开材料库"
                    >
                      <FolderOpen size={16} />
                    </button>
                    <div className="ml-auto text-[11px] font-semibold text-gray-400">
                      {attachedFiles.length ? `${attachedFiles.length} 个附件` : phaseLabel[phase]}
                    </div>
                  </div>
                  {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-2">
                      {attachedFiles.map((file) => (
                        <button
                          key={`${file.name}-${file.size}`}
                          type="button"
                          onClick={() => setAttachedFiles((prev) => prev.filter((item) => item !== file))}
                          className="rounded-[32px] border border-gray-200 bg-[#F5F5F0] px-2 py-1 text-[10px] font-semibold text-gray-600 hover:border-red-200 hover:text-red-600"
                        >
                          {file.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-3 px-4 py-3">
                    <textarea
                      value={workspacePrompt}
                      onChange={(event) => setWorkspacePrompt(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void handleComposerSubmit();
                        }
                      }}
                      rows={2}
                      className="min-h-[54px] flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-gray-400"
                      placeholder="输入任务或修改，例如：检索 CO2 加氢催化剂文章；ENCUT=520；使用 CP2K..."
                    />
                    <button
                      type="button"
                      onClick={startVoiceInput}
                      className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border text-gray-500 hover:bg-[#F5F5F0]', isListening ? 'border-[#0A1128] bg-white text-[#0A1128] shadow-sm ring-1 ring-black/5' : 'border-gray-200')}
                      title="语音输入"
                    >
                      <Mic size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleComposerSubmit()}
                      disabled={phase === 'retrieving' || phase === 'modeling' || phase === 'compiling' || phase === 'submitting' || phase === 'ppt'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[#0A1128] text-white hover:bg-[#162044] disabled:cursor-not-allowed disabled:bg-gray-300"
                      title="发送"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="hidden">
              <div className="border-b border-gray-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#0A1128] text-white">
                    <BrainCircuit size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">运行检查</p>
                    <p className="truncate text-xs text-gray-500">{phaseLabel[phase]}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">文献</p>
                    <p className="mt-1 font-bold">{getVerifiedPapers(research?.papers || []).length}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">原子</p>
                    <p className="mt-1 font-bold">{modelStructure?.atoms.length || 0}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">输入</p>
                    <p className="mt-1 font-bold">{compiledFileNames.length}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">作业</p>
                    <p className="mt-1 truncate font-bold">{jobStatus?.status || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="mb-5 rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-gray-600" />
                    <p className="text-sm font-bold">过程记录</p>
                  </div>
                  {harnessSession ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-[16px] border border-gray-200 bg-white p-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Session</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-gray-700" title={harnessSession.sessionId}>{harnessSession.sessionId}</p>
                        <p className="mt-1 text-[10px] text-gray-400">{harnessSession.harness}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-[16px] border border-gray-200 bg-white p-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">节点</p>
                          <p className="mt-1 font-bold">{harnessSession.checkpoints.length}</p>
                        </div>
                        <div className="rounded-[16px] border border-gray-200 bg-white p-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">产物</p>
                          <p className="mt-1 font-bold">{harnessSession.checkpoints.filter((item) => item.artifact && item.artifact.id !== 'pending').length}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {harnessSession.checkpoints.slice(-5).map((checkpoint) => (
                          <div key={checkpoint.id} className="rounded-[16px] border border-gray-200 bg-white p-2">
                            <div className="flex items-center gap-2">
                              <span className={cx(
                                'h-2 w-2 rounded-full',
                                checkpoint.status === 'success' ? 'bg-[#0A1128]' : checkpoint.status === 'running' ? 'bg-gray-500' : checkpoint.status === 'error' ? 'bg-red-500' : 'bg-gray-300'
                              )} />
                              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-700">{checkpoint.summary}</p>
                            </div>
                            {checkpoint.artifact && (
                              <p className="mt-1 truncate font-mono text-[10px] text-gray-400" title={checkpoint.artifact.id}>
                                {checkpoint.artifact.kind}: {checkpoint.artifact.id}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-gray-500">
                      新任务开始后会创建运行记录，保存工具调用、用户确认和关键产物。
                    </p>
                  )}
                </div>

                <div className="mb-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Database size={16} className="text-gray-500" />
                      <div>
                        <p className="text-sm font-bold">数据来源</p>
                        <p className="mt-0.5 text-[10px] text-gray-400">当前查询式：{activeSourceFormula}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchStructureSources()}
                      className="flex h-8 w-8 items-center justify-center rounded-[16px] border border-gray-200 text-gray-500 transition hover:bg-[#F5F5F0]"
                      title="刷新后台数据源登记"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {databaseAgents.map((db) => {
                      const registryEntry = sourceRegistryById.get(sourceRegistryId(db.id));
                      const isLiveSearch = registryEntry?.liveSearch ?? db.status === 'active';
                      return (
                      <div key={db.id} className="rounded-[16px] border border-gray-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-[16px] bg-[#0A1128] text-[9px] font-bold text-white">{db.shortName.slice(0, 3)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{db.name}</p>
                            <p className="truncate text-[11px] text-gray-400">{registryEntry?.kind || db.agentRole}</p>
                          </div>
                          <StatusPill status={db.status} />
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-gray-500">{registryEntry?.notes || db.scope}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void probeStructureSource(db)}
                            className="rounded-[32px] border border-gray-200 px-2.5 py-1.5 text-[10px] font-semibold text-gray-600 transition hover:border-gray-300 hover:bg-[#F5F5F0]"
                          >
                            {isLiveSearch ? '查当前体系' : '查看登记'}
                          </button>
                          {registryEntry?.homepage && (
                            <a
                              href={registryEntry.homepage}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-[16px] text-gray-400 hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                              title="打开来源主页"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                  {sourceProbe && (
                    <div className="mt-3 rounded-[16px] border border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center gap-2">
                        {sourceProbe.status === 'running' ? <Loader2 size={14} className="animate-spin text-[#0A1128]" /> : sourceProbe.status === 'error' ? <CircleDot size={14} className="text-red-600" /> : <Check size={14} className="text-[#0A1128]" />}
                        <p className="min-w-0 flex-1 truncate text-xs font-bold text-[#0A1128]">{sourceProbe.label}</p>
                        <span className="rounded-[16px] border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-gray-500">{sourceProbe.formula}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-gray-600">{sourceProbe.summary}</p>
                      {sourceProbe.results.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {sourceProbe.results.slice(0, 4).map((item) => (
                            <div key={`${sourceProbe.sourceId}-${item.material_id}`} className="rounded-[16px] border border-gray-200 bg-white px-2 py-1.5">
                              <p className="truncate font-mono text-[10px] font-semibold text-gray-700">{item.material_id}</p>
                              <p className="mt-0.5 truncate text-[10px] text-gray-400">{item.formula} · {item.crystal_system || 'unknown'} · hull {item.energy_above_hull || 'N/A'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedIdea && (
                  <div className="mb-5 rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center gap-2">
                      <FlaskConical size={16} className="text-gray-600" />
                      <p className="text-xs font-bold">当前模型建议</p>
                    </div>
                    <p className="mt-3 text-sm font-bold">{selectedIdea.title}</p>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{selectedIdea.fit_reason}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-[32px] border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-500">
                        {selectedIdea.blueprint?.structure_source?.formula || selectedIdea.material_family}
                      </span>
                      <span className="rounded-[32px] border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-500">
                        {selectedIdea.recommended_model_type}
                      </span>
                    </div>
                  </div>
                )}

                {compiledInputs && (
                  <div className="mb-5 rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-gray-600" />
                      <p className="text-xs font-bold">输入文件</p>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-gray-600">
                      <p>中间区域已经提供完整编辑器。</p>
                      <p>{compiledFileNames.join('、')}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-gray-600" />
                    <p className="text-xs font-bold">提交位置</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {profiles.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={cx(
                          'w-full rounded-[16px] border p-2 text-left text-xs transition',
                          selectedProfileId === profile.id ? 'border-[#0A1128] bg-white text-[#0A1128]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{profile.label}</span>
                          <span className={cx('rounded-[16px] border px-1.5 py-0.5 text-[9px] font-bold', profile.configured ? 'border-gray-200 bg-white text-[#0A1128]' : 'border-gray-200 bg-gray-100 text-gray-400')}>
                            {profile.configured ? '已配置' : '未配置'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-gray-400">{profile.summary}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {pptQa && (
                  <div className="mt-5 rounded-[24px] border border-gray-200 bg-white p-4">
                    <p className="text-xs font-bold text-[#0A1128]">PPT QA</p>
                    <p className="mt-2 text-xs leading-5 text-gray-600">{pptQa}</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AgentWorkspace;
