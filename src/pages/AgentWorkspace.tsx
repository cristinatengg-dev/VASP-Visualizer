import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import {
  RuntimeTaskRequestError,
  createRuntimeWorkspaceTask,
  deleteRuntimeWorkspaceTask,
  getRuntimeIdentity,
  listRuntimeWorkspaceTasks,
  saveRuntimeWorkspaceTask,
  setRuntimeWorkspaceTaskArchived,
  type RuntimeWorkspaceTask,
} from '../services/workspaceTaskRuntime';

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
  runtimeSessionId?: string;
  snapshotRevision?: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  snapshot: AgentWorkflowSnapshot;
}

type AgentEvent = StageEvent | { type: 'error'; content: string } | { type: 'complete'; data: CompleteData };

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'agent', label: 'Research Agent', icon: Bot },
  { id: 'experts', label: 'Expert Library', icon: BriefcaseBusiness },
  { id: 'skills', label: 'Skills', icon: WandSparkles },
  { id: 'explore', label: 'Data Exploration', icon: Search },
  { id: 'connectors', label: 'Connectors', icon: Link2 },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'automation', label: 'Automation', icon: Activity },
];

const agents: WorkspaceAgent[] = [
  {
    id: 'orchestrator',
    name: 'Master Agent',
    subtitle: 'Single-run continuous execution',
    status: 'active',
    accent: 'bg-[#0A1128] text-white',
    icon: BrainCircuit,
    tools: ['plan', 'retrieve', 'model', 'compute', 'ppt'],
    output: 'Continuously orchestrates search, modeling, compute, results, and report output.',
  },
  {
    id: 'retrieval',
    name: 'Literature Evidence',
    subtitle: 'Ground Truth Sources',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: FileText,
    tools: ['CrossRef', 'OpenAlex', 'arXiv', 'PubMed'],
    output: 'Generate modelable candidates from literature and database evidence.',
  },
  {
    id: 'database',
    name: 'Structure Database',
    subtitle: 'Eight Structure Sources',
    status: 'active',
    accent: 'bg-[#0A1128] text-white',
    icon: Database,
    tools: ['MP', 'OQMD', 'AFLOW', 'JARVIS', 'Alexandria', 'NOMAD', 'MC3D', 'OMDB'],
    output: 'Unified view of real-time structure sources and large-scale training/benchmark datasets.',
  },
  {
    id: 'synthesis',
    name: 'Synthetic Route',
    subtitle: 'Routes and Precursors',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: FlaskConical,
    tools: ['ChemDataExtractor2', 'Ceder data', 'rxn_network'],
    output: 'Evaluate routes, conditions, risks, and alternatives prior from literature and synthetic data.',
  },
  {
    id: 'feasibility',
    name: 'Feasibility Score',
    subtitle: 'Seven Evidence Scores',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: Gauge,
    tools: ['evidence', 'stability', 'precursor', 'risk'],
    output: 'Score candidate materials using literature evidence, structure hits, phase stability, and experimental complexity.',
  },
  {
    id: 'experiment',
    name: 'Experimental Protocol',
    subtitle: 'DoE & Next Round',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: Activity,
    tools: ['BayBE', 'BoFire', 'constraints'],
    output: 'Generate variable ranges, constraints, initial experiment matrix, and next-round optimization strategies.',
  },
  {
    id: 'modeling',
    name: 'Deterministic Modeling',
    subtitle: 'Structure Visualization',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: AtomIcon,
    tools: ['bulk', 'slab', 'molecule', 'adsorbate'],
    output: 'Convert candidate systems into computable atomic structures.',
  },
  {
    id: 'compute',
    name: 'Compute Input',
    subtitle: 'Editable Files',
    status: 'handoff',
    accent: 'bg-gray-200 text-gray-500',
    icon: Cpu,
    tools: ['VASP', 'CP2K', 'QE', 'Slurm/PBS'],
    output: 'Generate input files and submit to the selected compute location.',
  },
  {
    id: 'export',
    name: 'Results Reporting',
    subtitle: 'Downloadable PPTX',
    status: 'ready',
    accent: 'bg-gray-200 text-gray-400',
    icon: Archive,
    tools: ['pptx', 'QA', 'download'],
    output: 'Generate downloadable Chinese presentation PPT.',
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
    scope: 'Benchmark and discovery registry for stability prediction Agent.',
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
  { id: 'vasp', label: 'VASP', summary: 'Periodic DFT; recommended by default for surface/adsorption systems' },
  { id: 'quantum_espresso', label: 'Quantum ESPRESSO', summary: 'Open-source plane-wave DFT' },
  { id: 'cp2k', label: 'CP2K', summary: 'Hybrid Gaussian/plane-wave; suitable for large systems' },
  { id: 'lammps', label: 'LAMMPS', summary: 'Classical molecular dynamics' },
  { id: 'orca', label: 'ORCA', summary: 'Molecular quantum compute' },
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
  'Search CO2 hydrogenation catalyst articles',
  'Build Cu(111)+CO2+H2 adsorption model',
  'Generate VASP relaxation input and submit to local demo',
];

const statusMeta: Record<AgentStatus, { label: string; className: string }> = {
  active: { label: 'Running', className: 'bg-white text-[#0A1128] border-gray-200 shadow-sm ring-1 ring-black/5' },
  ready: { label: 'Ready', className: 'bg-gray-50 text-gray-500 border-gray-200' },
  handoff: { label: 'Pending Confirmation', className: 'bg-[#F5F5F0] text-gray-700 border-gray-200' },
  gated: { label: 'Authorization Required', className: 'bg-red-50 text-red-600 border-red-200' },
};

const phaseLabel: Record<WorkflowPhase, string> = {
  idle: 'Pending Start',
  retrieving: 'Search Literature & Databases',
  await_model: 'Confirm Model',
  modeling: 'Generate Structure',
  await_software: 'Select Compute Software',
  compiling: 'Generate Input Files',
  await_input: 'Inspect Input Files',
  await_submit: 'Select Submission Target',
  submitting: 'Submit Job',
  monitoring: 'Awaiting Compute',
  await_ppt: 'Confirm Report Output',
  ppt: 'Generate PPT',
  done: 'Completed',
  error: 'Action Required',
};

const workflowStageIndex: Record<WorkflowPhase, number> = {
  idle: -1,
  retrieving: 0,
  await_model: 1,
  modeling: 1,
  await_software: 2,
  compiling: 2,
  await_input: 2,
  await_submit: 3,
  submitting: 3,
  monitoring: 3,
  await_ppt: 4,
  ppt: 4,
  done: 5,
  error: -1,
};

const workflowStageItems = [
  { label: 'Evidence Search', icon: Search },
  { label: 'Model Confirmation', icon: AtomIcon },
  { label: 'Input Compilation', icon: FileText },
  { label: 'Controlled Compute', icon: Cpu },
  { label: 'Results Reporting', icon: Archive },
];

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

const createWelcomeMessages = (content = 'Chat directly like a standard assistant. When you explicitly request search, modeling, compute, job submission, or PPT generation, I will switch to the continuous research Agent.'): ChatMessage[] => [
  {
    id: 'welcome',
    role: 'assistant',
    title: 'Agent Ready',
    content,
    createdAt: Date.now(),
  },
];

const migrateLegacyInterfaceMessages = (messages: ChatMessage[] = []): ChatMessage[] => messages.map((message) => {
  if (message.id !== 'welcome') return message;
  return {
    ...message,
    title: 'Agent Ready',
    content: 'Chat directly like a standard assistant. When you explicitly request search, modeling, compute, job submission, or PPT generation, I will switch to the continuous research Agent.',
  };
});

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
    || 'New Research Task';
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

const normalizeTaskSnapshot = (snapshot: Partial<AgentWorkflowSnapshot> | null | undefined): AgentWorkflowSnapshot => {
  const base = createEmptyWorkflowSnapshot();
  const phase = snapshot?.phase || 'idle';
  return {
    ...base,
    ...(snapshot || {}),
    version: 1,
    savedAt: Number(snapshot?.savedAt || Date.now()),
    messages: migrateLegacyInterfaceMessages(snapshot?.messages || base.messages),
    modelStructure: cloneWorkflowStructure(snapshot?.modelStructure || null),
    toolEvents: normalizeSnapshotToolEvents(snapshot?.toolEvents || [], phase),
    chatSessionId: snapshot?.chatSessionId || null,
  };
};

const runtimeTaskToRecord = (task: RuntimeWorkspaceTask<AgentWorkflowSnapshot>): AgentTaskRecord => ({
  id: String(task.id),
  runtimeSessionId: String(task.runtimeSessionId),
  snapshotRevision: Number(task.snapshotRevision || 0),
  title: String(task.title || deriveTaskTitle(task.snapshot)),
  createdAt: Number(task.createdAt || task.snapshot?.savedAt || Date.now()),
  updatedAt: Number(task.updatedAt || task.snapshot?.savedAt || Date.now()),
  archived: Boolean(task.archived),
  snapshot: normalizeTaskSnapshot(task.snapshot),
});

const taskServerFingerprint = (task: AgentTaskRecord) => JSON.stringify({
  title: task.title,
  snapshot: task.snapshot,
});

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
  return events.map((event) => {
    const hasRecordedLlmError = event.name === 'agent.chat'
      && event.details.some((detail) => detail.startsWith('LLM note:'));
    if (hasRecordedLlmError && event.status !== 'error') {
      return { ...event, status: 'error' };
    }
    if (phase === 'error' && event.status === 'running') {
      return {
        ...event,
        status: 'error',
        details: [...event.details, 'Agent has entered an error state; this step has stopped.'],
      };
    }
    return event;
  });
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
    atoms: structure.atoms.map((atom) => ({ id: atom.id, element: atom.element, position: atom.position })),
    latticeVectors: structure.latticeVectors,
  },
  meta: {
    formula: structure.filename,
    system: (() => {
      if (!structure.latticeVectors || structure.latticeVectors.length !== 3) return 'molecule';
      const lengths = structure.latticeVectors.map((vector) => Math.hypot(...vector));
      return lengths[2] > Math.max(lengths[0], lengths[1]) * 1.6 && lengths[2] > 12 ? 'slab' : 'bulk';
    })(),
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

  if (!atoms.length) throw new Error('XYZ file contains no parsable atomic coordinates');
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
          <p className="text-sm font-bold text-[#0A1128]">Structure Preview</p>
          <p className="mt-1 text-xs text-gray-500">{structure.filename} · {atoms.length} atoms · {bonds.length} bonds</p>
        </div>
        <button
          type="button"
          onClick={onOpenModeling}
          className="rounded-[32px] border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
        >
          Open Full Modeling Page
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
        This is a projection preview of the structure returned by the deterministic builder. Compute inputs and the full 3D canvas use the same set of atomic coordinates.
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
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const adapterStatusLabel: Record<string, string> = {
  active: 'Connected',
  fallback: 'Degraded',
  missing: 'Missing',
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
          <p className="text-sm font-bold text-[#0A1128]">Materials Scientist Analysis</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Literature evidence, synthetic routes, feasibility scores, and experiment matrices have been chained into the same Agent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-[16px] border border-gray-200 bg-[#F5F5F0] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Ceder Index</p>
            <p className="text-sm font-bold text-[#0A1128]">{hasRecipeHit ? `Hit ${recipeMatches.length}` : 'No Hits'} · {recipeIndexTotal || '-'}</p>
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
            <p className="text-xs font-bold text-[#0A1128]">Synthetic Route</p>
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
                  {firstRoute.dataset_hit ? 'Ceder Hit' : 'Draft Rules'}
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
                      Dataset <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
              <div className="mt-2 grid gap-2 text-[11px] text-gray-600 md:grid-cols-3">
                <div>
                  <span className="font-semibold text-gray-800">Precursor</span>
                  <p className="mt-1 leading-5">{firstRoute.precursors.join('、')}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">Conditions</span>
                  <p className="mt-1 leading-5">{firstRoute.conditions.temperature}；{firstRoute.conditions.time}；{firstRoute.conditions.atmosphere}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-800">Risk</span>
                  <p className="mt-1 leading-5">{firstRoute.risk}</p>
                </div>
              </div>
              {firstRoute.alternatives.length > 0 && (
                <p className="mt-2 text-[11px] leading-5 text-gray-500">Alternative routes:{firstRoute.alternatives.join('、')}</p>
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
            <p className="text-xs font-bold text-[#0A1128]">Feasibility Score</p>
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
          <p className="text-xs font-bold text-[#0A1128]">Initial Experiment Matrix</p>
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
        <p className="mt-3 text-[11px] leading-5 text-gray-500">Next strategy:{report.experiment.next_round_policy}</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Cpu size={15} className="text-gray-500" />
            <p className="text-xs font-bold text-[#0A1128]">Compute bridge</p>
          </div>
          <p className="text-xs leading-5 text-gray-600">{report.compute.structure_status}</p>
          <p className="mt-2 text-[11px] leading-5 text-gray-500">Suggested Agent:{report.compute.recommended_workflows.join('、')}</p>
        </div>
        <div className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-bold text-[#0A1128]">Open-source capabilities integration</p>
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
  alias: 'Alias resolution',
  user_formula: 'User-specified',
  intent_formula: 'Intent recognition',
  literature_formula: 'Literature extraction',
  material_family_seed: 'Material family search',
  domain_fallback: 'Domain fallback',
}[String(reason || '')] || 'Structure search');

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
      ? `; query ${structure.queried_formula}（${structureQueryReasonLabel(structure.query_reason)}）`
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
    const reason = 'No structure database entries matching the retrieved literature were found in this round; LiCoO2 or other irrelevant materials will not be used as recommended models.';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, setMolecularData, setShowBonds } = useStore();
  const runtimeIdentity = useMemo(() => getRuntimeIdentity(user?.phone), [user?.phone]);
  const accountLabel = user?.phone || 'Research user';
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
  const [textModelName, setTextModelName] = useState('Text model');
  const [harnessSession, setHarnessSession] = useState<HarnessSessionState | null>(null);
  const [structureSources, setStructureSources] = useState<StructureSourceRegistry | null>(null);
  const [sourceProbe, setSourceProbe] = useState<SourceProbeState | null>(null);
  const [runtimeSyncState, setRuntimeSyncState] = useState<'connecting' | 'saving' | 'synced' | 'offline'>('connecting');
  const [runtimeSyncError, setRuntimeSyncError] = useState<string | null>(null);
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
  const runtimeTaskHydratedRef = useRef(false);
  const runtimeSaveInFlightRef = useRef(false);
  const lastServerFingerprintRef = useRef<Map<string, string>>(new Map());

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
  const visibleToolEvents = useMemo(
    () => toolEvents.filter((event) => event.name !== 'agent.chat'),
    [toolEvents],
  );
  const configuredProfiles = profiles.filter((profile) => (profile.ready ?? profile.configured) && profile.directSubmitSupported !== false);
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
    const prompt = searchParams.get('prompt')?.trim();
    if (!prompt) return;
    setWorkspacePrompt(prompt);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('prompt');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/agent/chat/status`)
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ model?: string | null }>;
      })
      .then((payload) => {
        if (active && payload?.model) setTextModelName(payload.model);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
    let cancelled = false;

    let records: AgentTaskRecord[] = [];
    let hadStoredRecords = false;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) || '[]');
      if (Array.isArray(parsed)) {
        records = parsed
          .filter((item) => item?.id && item?.snapshot?.version === 1)
          .map((item) => ({
            id: String(item.id),
            runtimeSessionId: item.runtimeSessionId ? String(item.runtimeSessionId) : undefined,
            snapshotRevision: Number(item.snapshotRevision || 0),
            title: String(item.title || deriveTaskTitle(item.snapshot)),
            createdAt: Number(item.createdAt || item.snapshot.savedAt || Date.now()),
            updatedAt: Number(item.updatedAt || item.snapshot.savedAt || Date.now()),
            archived: Boolean(item.archived),
            snapshot: normalizeTaskSnapshot(item.snapshot),
          }));
        hadStoredRecords = records.length > 0;
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

    void (async () => {
      try {
        const serverTasks = await listRuntimeWorkspaceTasks<AgentWorkflowSnapshot>(runtimeIdentity);
        if (cancelled) return;
        const serverRecords = serverTasks.map(runtimeTaskToRecord);
        const serverClientIds = new Set(serverRecords.map((task) => task.id));
        const migrationCandidates = (hadStoredRecords || serverRecords.length === 0 ? records : [])
          .filter((task) => !serverClientIds.has(task.id));
        const migratedResults = await Promise.allSettled(
          migrationCandidates.map((task) => createRuntimeWorkspaceTask(runtimeIdentity, task)),
        );
        if (cancelled) return;
        const migratedRecords: AgentTaskRecord[] = [];
        const localFallbackRecords: AgentTaskRecord[] = [];
        migratedResults.forEach((result, index) => {
          if (result.status === 'fulfilled') migratedRecords.push(runtimeTaskToRecord(result.value));
          else localFallbackRecords.push(migrationCandidates[index]);
        });
        const merged = [...serverRecords, ...migratedRecords, ...localFallbackRecords]
          .filter((task, index, all) => all.findIndex((candidate) => candidate.id === task.id) === index)
          .sort((left, right) => right.updatedAt - left.updatedAt);
        const nextRecords = merged.length ? merged : records;
        for (const task of nextRecords) {
          if (task.runtimeSessionId) lastServerFingerprintRef.current.set(task.id, taskServerFingerprint(task));
        }
        const preferredId = window.localStorage.getItem(ACTIVE_TASK_STORAGE_KEY);
        const nextActive = nextRecords.find((task) => task.id === preferredId && !task.archived)
          || nextRecords.find((task) => !task.archived)
          || nextRecords[0];
        taskPersistPausedRef.current = true;
        setTasks(nextRecords);
        setActiveTaskId(nextActive.id);
        activeTaskIdRef.current = nextActive.id;
        applyWorkflowSnapshot(nextActive.snapshot);
        runtimeTaskHydratedRef.current = true;
        setRuntimeSyncState(localFallbackRecords.length ? 'offline' : 'synced');
        setRuntimeSyncError(localFallbackRecords.length ? 'Some local tasks have not been written to Runtime yet; will retry upon next modification.' : null);
      } catch (error) {
        if (cancelled) return;
        runtimeTaskHydratedRef.current = true;
        setRuntimeSyncState('offline');
        setRuntimeSyncError(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      cancelled = true;
      if (!runtimeTaskHydratedRef.current) {
        taskHydratedRef.current = false;
      }
    };
  }, [applyWorkflowSnapshot, runtimeIdentity]);

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
    if (!runtimeTaskHydratedRef.current || !activeTaskId || runtimeSaveInFlightRef.current) return;
    const task = tasks.find((item) => item.id === activeTaskId);
    if (!task || task.archived) return;
    const fingerprint = taskServerFingerprint(task);
    if (lastServerFingerprintRef.current.get(task.id) === fingerprint) return;

    const timer = window.setTimeout(() => {
      runtimeSaveInFlightRef.current = true;
      setRuntimeSyncState('saving');
      setRuntimeSyncError(null);
      const request = task.runtimeSessionId
        ? saveRuntimeWorkspaceTask(runtimeIdentity, {
            runtimeSessionId: task.runtimeSessionId,
            title: task.title,
            snapshot: task.snapshot,
            snapshotRevision: Number(task.snapshotRevision || 0),
          })
        : createRuntimeWorkspaceTask(runtimeIdentity, task);

      void request
        .then((saved) => {
          lastServerFingerprintRef.current.set(task.id, fingerprint);
          setTasks((prev) => prev.map((item) => (
            item.id === task.id
              ? {
                  ...item,
                  runtimeSessionId: saved.runtimeSessionId,
                  snapshotRevision: saved.snapshotRevision,
                  updatedAt: taskServerFingerprint(item) === fingerprint ? saved.updatedAt : item.updatedAt,
                }
              : item
          )));
          setRuntimeSyncState('synced');
          setRuntimeSyncError(null);
        })
        .catch((error) => {
          setRuntimeSyncState('offline');
          if (error instanceof RuntimeTaskRequestError && error.code === 'snapshot_conflict') {
            setRuntimeSyncError('Task updated in another window; current local modifications did not overwrite the server version. Please refresh and reapply changes.');
          } else {
            setRuntimeSyncError(error instanceof Error ? error.message : String(error));
          }
        })
        .finally(() => {
          runtimeSaveInFlightRef.current = false;
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [activeTaskId, runtimeIdentity, tasks]);

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
          title: 'Model modification confirmed',
          content: [
            `Received modified structure from Modeling Agent:${structure.filename}。`,
            `Current structure contains ${structure.atoms.length} atoms,${structure.bonds.length} bonds.`,
            'Next, proceed to select compute software; I will regenerate input files based on this structure version.',
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
          summary: 'Confirmed return to continuous research Agent from Modeling Agent',
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

  const persistTaskArchiveState = useCallback((task: AgentTaskRecord, archived: boolean) => {
    setRuntimeSyncState('saving');
    const ensureSession = task.runtimeSessionId
      ? Promise.resolve({ runtimeSessionId: task.runtimeSessionId } as RuntimeWorkspaceTask<AgentWorkflowSnapshot>)
      : createRuntimeWorkspaceTask(runtimeIdentity, task);
    void ensureSession
      .then((stored) => setRuntimeWorkspaceTaskArchived<AgentWorkflowSnapshot>(runtimeIdentity, stored.runtimeSessionId, archived))
      .then((saved) => {
        setTasks((prev) => prev.map((item) => (
          item.id === task.id
            ? {
                ...item,
                runtimeSessionId: saved.runtimeSessionId,
                snapshotRevision: saved.snapshotRevision,
                archived: saved.archived,
              }
            : item
        )));
        lastServerFingerprintRef.current.set(task.id, taskServerFingerprint({ ...task, archived }));
        setRuntimeSyncState('synced');
        setRuntimeSyncError(null);
      })
      .catch((error) => {
        setRuntimeSyncState('offline');
        setRuntimeSyncError(error instanceof Error ? error.message : String(error));
      });
  }, [runtimeIdentity]);

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
    const targetTask = tasks.find((task) => task.id === taskId);
    if (targetTask) persistTaskArchiveState(targetTask, true);
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
  }, [activeTaskId, applyWorkflowSnapshot, buildCurrentSnapshot, persistTaskArchiveState, tasks]);

  const deleteTask = useCallback((taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Are you sure you want to delete "${task.title}"? This action cannot be undone.`);
    if (!confirmed) return;

    if (task.runtimeSessionId) {
      setRuntimeSyncState('saving');
      void deleteRuntimeWorkspaceTask(runtimeIdentity, task.runtimeSessionId)
        .then(() => {
          lastServerFingerprintRef.current.delete(task.id);
          setRuntimeSyncState('synced');
          setRuntimeSyncError(null);
        })
        .catch((error) => {
          setRuntimeSyncState('offline');
          setRuntimeSyncError(error instanceof Error ? error.message : String(error));
        });
    }

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
  }, [activeTaskId, applyWorkflowSnapshot, buildCurrentSnapshot, runtimeIdentity, tasks]);

  const restoreTask = useCallback((taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    persistTaskArchiveState(task, false);
    persistActiveTaskNow();
    const restored = { ...task, archived: false, updatedAt: Date.now() };
    setTasks((prev) => prev.map((item) => (item.id === taskId ? restored : item)));
    setShowArchivedTasks(false);
    setActiveTaskId(taskId);
    activeTaskIdRef.current = taskId;
    applyWorkflowSnapshot(restored.snapshot);
  }, [applyWorkflowSnapshot, persistActiveTaskNow, persistTaskArchiveState, tasks]);

  const getAuthHeaders = useCallback((extra?: Record<string, string>) => {
    const token = localStorage.getItem('vasp_token') || '';
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const withUserPayload = useCallback((payload: Record<string, any> = {}) => {
    const token = localStorage.getItem('vasp_token') || '';
    const authenticatedOwner = token
      ? user?.phone || localStorage.getItem('vasp_user_id') || ''
      : '';
    const userId = authenticatedOwner || runtimeIdentity.ownerId;
    return {
      ...payload,
      ...(userId ? { userId, ownerId: userId } : {}),
    };
  }, [runtimeIdentity.ownerId, user?.phone]);

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
        throw new Error(`Request timed out:${path} Within ${Math.round(timeoutMs / 1000)} seconds, did not return`);
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

  const ensureActiveRuntimeSession = useCallback(async () => {
    const taskId = activeTaskIdRef.current;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Active workspace task is unavailable');
    if (task.runtimeSessionId) return task.runtimeSessionId;
    const snapshot = task.id === activeTaskId ? buildCurrentSnapshot() : task.snapshot;
    const record = { ...task, title: deriveTaskTitle(snapshot), snapshot };
    const saved = await createRuntimeWorkspaceTask(runtimeIdentity, record);
    lastServerFingerprintRef.current.set(record.id, taskServerFingerprint(record));
    setTasks((prev) => prev.map((item) => (
      item.id === record.id
        ? {
            ...item,
            runtimeSessionId: saved.runtimeSessionId,
            snapshotRevision: saved.snapshotRevision,
          }
        : item
    )));
    return saved.runtimeSessionId;
  }, [activeTaskId, buildCurrentSnapshot, runtimeIdentity, tasks]);

  const startHarnessSession = useCallback(async (prompt: string) => {
    try {
      const runtimeSessionId = await ensureActiveRuntimeSession();
      const payload = await postJson<{
        success: boolean;
        sessionId: string;
        goalArtifactId?: string | null;
        planArtifactId?: string | null;
        harness?: string;
      }>('/agent/harness/sessions', {
        sessionId: runtimeSessionId,
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
          summary: 'Run record created',
        }],
      });
      return payload.sessionId;
    } catch (error) {
      harnessSessionIdRef.current = null;
      setHarnessSession(null);
      console.warn('[AgentWorkspace] Runtime harness session unavailable', error);
      addMessage({
        role: 'assistant',
        title: 'Runtime currently unavailable',
        content: 'Task did not start because the production Agent requires creating a recoverable Runtime Session first. Please check MongoDB/Runtime services and retry to avoid creating non-auditable isolated results.',
        status: 'error',
      });
      return null;
    }
  }, [addMessage, ensureActiveRuntimeSession, postJson]);

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
      console.warn('[AgentWorkspace] Runtime harness checkpoint unavailable', error);
      appendHarnessCheckpoint({
        id: newId('harness-error'),
        phase: checkpointPhase,
        status: 'info',
        summary: 'Runtime harness checkpoint was skipped; Agent continued.',
      });
    }
  }, [appendHarnessCheckpoint, postJson]);

  const fetchProfiles = useCallback(async (options: { log?: boolean } = {}) => {
    const toolId = options.log ? addTool({
      name: 'compute.profiles',
      agent: 'Compute',
      status: 'running',
      summary: 'Reading submit-ready local/cluster profiles',
      details: [],
    }) : null;
    try {
      const response = await fetch(`${API_BASE_URL}/compute/profiles`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Failed to load compute profiles');
      const nextProfiles: ServerComputeProfile[] = Array.isArray(payload.profiles) ? payload.profiles : [];
      setProfiles(nextProfiles);
      const firstConfigured = nextProfiles.find((profile) => (profile.ready ?? profile.configured) && profile.directSubmitSupported !== false && profile.mode !== 'local_demo')
        || nextProfiles.find((profile) => (profile.ready ?? profile.configured) && profile.directSubmitSupported !== false);
      if (firstConfigured) {
        setSelectedProfileId((prev) => (
          prev && prev !== 'local_demo' && nextProfiles.some((profile) => profile.id === prev)
            ? prev
            : firstConfigured.id
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
      summary: 'Parsing uploaded file and writing to current research task context',
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
          summary: 'File attached, but the current workspace will not pretend to read this format. Please upload PDF, POSCAR/CONTCAR/CIF/VASP/XYZ, or text files instead.',
        });
      } catch (error) {
        digests.push({
          name: file.name,
          kind: 'unsupported',
          summary: `Parsing failed:${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    updateTool(toolId, {
      status: digests.some((digest) => digest.summary.startsWith('Parsing failed')) ? 'error' : 'success',
      details: digests.map((digest) => `${digest.name}: ${digest.summary}`),
    });

    addMessage({
      role: 'tool',
      title: 'Attachment parsing',
      content: digests.map((digest) => `${digest.name}：${digest.summary}`).join('\n'),
      status: digests.some((digest) => digest.summary.startsWith('Parsing failed')) ? 'error' : 'success',
    });

    return digests;
  }, [addMessage, addTool, getAuthHeaders, setMolecularData, setShowBonds, updateTool]);

  const probeStructureSource = useCallback(async (db: DatabaseAgent) => {
    const registryId = sourceRegistryId(db.id);
    const registryEntry = sourceRegistryById.get(registryId);
    const formula = activeSourceFormula;

    if (registryEntry && !registryEntry.liveSearch) {
      const summary = registryEntry.notes || `${registryEntry.label} is a backend-registered dataset source and is not disguised as a real-time structure search.`;
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
        title: `${registryEntry.label} Data source`,
        content: `${summary}
Homepage:${registryEntry.homepage || 'N/A'}`,
      });
      return;
    }

    setSourceProbe({
      sourceId: registryId,
      label: registryEntry?.label || db.name,
      formula,
      status: 'running',
      summary: `Querying with ${registryEntry?.label || db.name} query ${formula}`,
      results: [],
      registryEntry,
    });
    const toolId = addTool({
      name: `structures.${registryId}`,
      agent: 'Database',
      status: 'running',
      summary: `query ${registryEntry?.label || db.name} Structure source`,
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
        ? `Returned ${results.length} items ${formula} structure candidates`
        : `${registryEntry?.label || db.name} No ${formula} available structures returned`;
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
      summary: 'Evaluating synthetic routes, material feasibility, and first-round experimental matrix',
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
        title: 'Synthesis feasibility and experimental design',
        content: [
          `Synthesis evaluation:${report.synthesis.summary}`,
          `Feasibility score:${report.feasibility.score}/100（${report.feasibility.level}）`,
          `Decision:${report.feasibility.decision}`,
          report.recipe_index
            ? `Ceder recipe index：${recipeHitCount ? `Hit ${recipeHitCount} items` : 'No Hits'}(Local ${recipeIndexTotal || 0} items)`
            : 'Ceder recipe index: Disabled',
          '',
          'Preferred route:',
          ...(report.synthesis.routes.slice(0, 2).map((route, index) => `${index + 1}. ${route.title} · ${route.method} · ${route.conditions.temperature}, ${route.conditions.atmosphere}${route.doi ? ` · DOI ${route.doi}` : ''}`)),
          '',
          `Experimental design:${report.experiment.engine}`,
          `First batch of experiments:${report.experiment.first_batch.length} groups; Optimization target:${report.experiment.objective}`,
          report.feasibility.blockers.length ? `Note:${report.feasibility.blockers.slice(0, 2).join('；')}` : 'Currently no low-score blockers; manual verification of experimental safety and material sources is still required.',
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
        title: 'Synthesis feasibility analysis incomplete',
        content: `Literature and modeling Agent can still continue; synthesis/experimental design step failed:${message}`,
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
    if (!sessionId) {
      setPhase('error');
      return;
    }
    void recordHarnessCheckpoint({
      phase: 'retrieving',
      status: 'running',
      agent: 'Orchestrator',
      toolName: 'agent.retrieve',
      summary: 'Started literature and database retrieval',
      details: [prompt],
    });

    addMessage({
      role: 'assistant',
      title: 'Visible reasoning',
      content: [
        '1. First identify the objective as a literature search and candidate model recommendation task.',
        '2. Simultaneously search paper sources and material structure sources to avoid relying solely on generative models to guess systems.',
        '3. Provide a starter model using paper evidence, structure availability, and computability, then wait for your confirmation.',
      ].join('\n'),
    });

    const toolId = addTool({
      name: 'agent.retrieve',
      agent: 'Literature + Databases',
      status: 'running',
      summary: 'Searching papers, materials databases, and modeling candidates',
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
            const noRecommendationReason = data.no_model_recommendation?.reason || 'No structure database entries matching the retrieved literature were found in this round.';
            setResearch(data);
            setSelectedIdeaId(recommendedIdea?.id || null);
            updateTool(toolId, {
              status: 'success',
              details: [
                `${verifiedPapers.length} verifiable literature references`,
                `${data.structures?.length || 0} structures collected`,
                recommendedIdea ? `recommended: ${recommendedIdea.title}` : 'recommended: none; manual modeling required',
              ],
            });
            addMessage({
              role: 'assistant',
              title: 'Search results and model recommendations',
              content: [
                `Target understanding:${data.user_goal?.interpreted_goal || prompt}`,
                '',
                'Verifiable literature:',
                ...(topPaperLines(data.papers || [], 6).length ? topPaperLines(data.papers || [], 6) : ['No literature with DOI or source links returned. Untraceable entries will not be used as evidence in this round.']),
                '',
                'Candidate structures (real databases):',
                ...(topStructureLines(data.structures || [], 6).length ? topStructureLines(data.structures || [], 6) : ['No candidate structures returned from connected structure databases. Models will not be forcibly recommended in this round.']),
                data.structure_query_plan?.sources?.length
                  ? `Structure query:${data.structure_query_plan.sources.slice(0, 6).map((item) => `${item.formula}（${structureQueryReasonLabel(item.reason)}）`).join('、')}`
                  : 'Structure query: No queryable formula currently available; waiting for you to specify material or crystal facet in Modeling Agent.',
                '',
                recommendedIdea ? `Recommended model:${recommendedIdea.title}` : 'Recommended model: None',
                recommendedIdea ? `Recommendation reason:${recommendedIdea.fit_reason}` : `Reason:${noRecommendationReason}`,
                '',
                recommendedIdea
                  ? 'Use this recommended model? You can also directly enter your desired model, crystal facet, adsorbate, or material in the input box.'
                  : 'Next step requires custom modeling: click "Go to Modeling Agent to Build Model", then specify material, crystal facet, molten salt components, adsorbates, or defects based on target papers.'
              ].join('\n'),
            });
            void recordHarnessCheckpoint({
              phase: 'await_model',
              status: 'success',
              agent: 'Retrieval + Database',
              toolName: 'agent.retrieve',
              summary: 'Research bundle ready; waiting for model choice',
              details: [
                `${verifiedPapers.length} verifiable literature references`,
                `${data.structures?.length || 0} structures`,
                `${data.idea_cards?.length || 0} model recommendations`,
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
        title: 'Search failed',
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
      addMessage({ role: 'assistant', title: 'Model description required', content: 'Please specify material, molecule, crystal facet, or adsorbate, e.g., Cu(111) slab with CO2 and H2.' });
      return;
    }

    setPhase('modeling');
    const parseToolId = addTool({
      name: 'modeling.parse-intent',
      agent: 'Modeling',
      status: 'running',
      summary: 'Converting recommended or custom model into structured modeling intent',
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
        summary: 'Calling deterministic structure builder to generate computable structure',
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
        title: 'Model generated',
        content: [
          `Generated ${structure.filename}。`,
          `Number of atoms:${structure.atoms.length}; Number of bonds:${structure.bonds.length}。`,
          'You can open the full modeling page to adjust the structure first; after confirmation, return here for the next step.',
          'Next, please select compute software. For periodic catalysis/surface adsorption systems, VASP relaxation is recommended first, followed by static/DOS.'
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
        ? 'Modeling request timed out: Backend did not respond within the time limit'
        : error instanceof Error ? error.message : String(error);
      updateTool(currentToolId, {
        status: 'error',
        details: [message],
      });
      addMessage({
        role: 'assistant',
        title: 'Modeling failed',
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
        title: 'No editable structure',
        content: 'Please have Agent generate or upload a model structure first before opening Modeling Agent to modify it.',
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
    const prompt = research?.user_goal?.interpreted_goal || messages.find((message) => message.role === 'user')?.content || workspacePrompt || 'Please manually build the model based on target literature';
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
      addMessage({ role: 'assistant', title: 'No structure', content: 'Please confirm or generate a model structure before generating compute input files.', status: 'error' });
      return;
    }
    setPhase('compiling');
    setCompiledInputs(null);
    const toolId = addTool({
      name: 'compute.compile',
      agent: 'Compute',
      status: 'running',
      summary: `Generate ${nextIntent.engine} ${nextIntent.workflow} Input files`,
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
        preview: payload.preview,
        validation: payload.validation,
        audit: payload.audit,
        auditToken: payload.auditToken,
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
        title: 'Input file recommendations',
        content: [
          `Generated ${nextIntent.engine} / ${nextIntent.workflow} Generate ${Object.keys(nextCompiled.files).length} input file(s).`,
          `Recommended parameters: quality=${nextIntent.quality}, spin=${nextIntent.spin_mode}, vdw=${String(nextIntent.vdw)}, kpoints=${nextIntent.kpoints_mode}。`,
          'Use recommended input files? To make changes, specify directly, e.g., ENCUT=520, quality=high, Agent=static.'
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
        title: 'Input file generation failed',
        content: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
      setPhase('error');
    }
  }, [addMessage, addTool, modelStructure, postJson, recordHarnessCheckpoint, updateTool]);

const selectEngine = useCallback((engine: EngineType) => {
    const nextIntent = {
      ...computeIntent,
      engine,
      workflow: engine === 'lammps'
        ? 'irradiation_creep' as const
        : computeIntent.workflow === 'irradiation_creep' ? 'relax' as const : computeIntent.workflow,
    };
    setComputeIntent(nextIntent);
    addMessage({
      role: 'user',
      content: `Select compute software:${engineOptions.find((item) => item.id === engine)?.label || engine}`,
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
    const agentTask = params.Agent || params.agent || params.workflow;
    const nextIntent: ComputeIntent = {
      ...computeIntent,
      workflow: (agentTask as ComputeIntent['workflow']) || computeIntent.workflow,
      quality: (params.quality as ComputeIntent['quality']) || computeIntent.quality,
      custom_params: {
        ...(computeIntent.custom_params || {}),
        ...params,
      },
    };
    delete nextIntent.custom_params?.Agent;
    delete nextIntent.custom_params?.agent;
    delete nextIntent.custom_params?.workflow;
    delete nextIntent.custom_params?.quality;
    setComputeIntent(nextIntent);
    addMessage({ role: 'user', content: `Modify input files:${text}` });
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
    if (!compiledInputs.validation?.submissionReady || !compiledInputs.auditToken) {
      addMessage({
        role: 'assistant',
        title: 'Inputs have not passed scientific validation yet',
        content: compiledInputs.validation?.blockingIssues?.join('\n') || 'Missing server-signed audit manifest; please recompile.',
        status: 'error',
      });
      return;
    }
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
      title: 'Select Submission Target',
      content: configuredProfiles.length
        ? `Can be submitted to:${configuredProfiles.map((profile) => profile.label).join('、')}. Please select a target.`
        : 'No real cluster is currently configured; you can still use Local Demo Runner to materialize input files and run through the Agent.',
    });
    setPhase('await_submit');
  }, [addMessage, compiledInputs, configuredProfiles, recordHarnessCheckpoint]);

  const fetchResults = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/results`, {
        headers: getAuthHeaders(),
      });
      const payload = await response.json();
      if (payload?.success) {
        setComputeResult(payload.metrics ? {
          ...payload.metrics,
          resultSource: payload.resultSource,
          isDemo: payload.isDemo,
          audit: payload.audit,
          potcarProvenance: payload.potcarProvenance,
          resultAudit: payload.resultAudit,
          resultAuditToken: payload.resultAuditToken,
        } : null);
        if (payload.isDemo) {
          addMessage({
            role: 'assistant',
            title: 'Demo Agent completed',
            content: 'This is not a VASP compute result, does not display scientific values, and cannot generate paper PPT presentation. Please select a configured PBS or Slurm environment to run real jobs.',
          });
          setPhase('done');
          return;
        }
        addMessage({
          role: 'assistant',
          title: 'Compute completed',
          content: [
            `Status:${payload.metrics?.converged ? 'converged' : 'finished / check warnings'}`,
            `Energy:${payload.metrics?.totalEnergyEv != null ? `${payload.metrics.totalEnergyEv} eV` : 'N/A'}`,
            `Max force:${payload.metrics?.maxForceEvPerA != null ? `${payload.metrics.maxForceEvPerA} eV/A` : 'N/A'}`,
            'Output results and generate downloadable Chinese PPT?'
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
              resultAudit: payload.resultAudit || null,
            },
          },
        });
        setPhase('await_ppt');
      }
    } catch (error) {
      addMessage({ role: 'assistant', title: 'Failed to read results', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, getAuthHeaders, recordHarnessCheckpoint]);

  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPhase('monitoring');
    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/compute/job/${encodeURIComponent(jobId)}/status`, {
          headers: getAuthHeaders(),
        });
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
            addMessage({ role: 'assistant', title: 'Compute did not complete', content: `Job ${jobId}: ${payload.jobStatus}`, status: 'error' });
            setPhase('error');
          }
        }
      } catch {
        // Keep polling through transient network errors.
      }
    }, 5000);
  }, [addMessage, fetchResults, getAuthHeaders]);

  const submitJob = useCallback(async (profileId: string) => {
    if (!compiledInputs || !modelStructure) return;
    const profile = profiles.find((item) => item.id === profileId) || selectedProfile;
    if (!profile) {
      addMessage({ role: 'assistant', title: 'No submission target', content: 'Please configure or select a compute profile first.', status: 'error' });
      return;
    }
    if (!(profile.ready ?? profile.configured) || profile.directSubmitSupported === false) {
      addMessage({ role: 'assistant', title: 'Compute environment unavailable', content: 'This environment failed real-time check or can only be submitted via an independent proxy queue.', status: 'error' });
      return;
    }
    setSelectedProfileId(profile.id);
    setPhase('submitting');
    const toolId = addTool({
      name: 'compute.submit',
      agent: 'Compute',
      status: 'running',
      summary: `Submit to ${profile.label}`,
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
        auditToken: compiledInputs.auditToken,
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
        title: 'Job submitted',
        content: `Submitted to ${profile.label}. I will continue polling status and ask whether to generate PPT upon completion.`,
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
      addMessage({ role: 'assistant', title: 'Submission failed', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, addTool, compiledInputs, computeIntent, modelStructure, postJson, profiles, recordHarnessCheckpoint, selectedProfile, startPolling, updateTool]);

  const generatePpt = useCallback(async () => {
    setPhase('ppt');
    const toolId = addTool({
      name: 'presentation.generate-ppt',
      agent: 'Presentation',
      status: 'running',
      summary: 'Generate downloadable Chinese PPTX',
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
        title: 'PPT generated',
        content: `Generated downloadable PPT:${payload.filename}`,
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
      addMessage({ role: 'assistant', title: 'PPT generation failed', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, addTool, compiledInputs, computeIntent, computeResult, jobStatus, messages, modelIntent, modelStructure, postJson, recordHarnessCheckpoint, research, researchStack, selectedIdea, updateTool]);

  const resetTask = createNewTask;

  const runChat = useCallback(async (content: string) => {
    const toolId = addTool({
      name: 'agent.chat',
      agent: 'Conversation',
      status: 'running',
      summary: 'Calling chat model and loading long-term memory',
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
        fallbackUsed?: boolean;
        model?: string | null;
      }>('/agent/chat', {
        sessionId: chatSessionIdRef.current,
        message: content,
      });

      chatSessionIdRef.current = payload.sessionId;
      if (payload.model) setTextModelName(payload.model);
      const llmFailed = Boolean(payload.llmError);
      updateTool(toolId, {
        status: llmFailed ? 'error' : 'success',
        details: [
          llmFailed
            ? 'LLM request failed; fallback reply used'
            : payload.llmConfigured ? 'LLM configured' : 'Fallback chat used',
          `${payload.memories?.length || 0} memories available`,
          ...(payload.llmError ? [`LLM note: ${payload.llmError}`] : []),
        ],
      });
      addMessage({
        role: 'assistant',
        title: llmFailed
          ? 'Chat model failed · Fallback response used'
          : payload.memories?.length ? `Chat · Loaded ${payload.memories.length} memories` : 'Chat',
        content: llmFailed
          ? `${payload.reply || 'No valid response generated.'}

Chat model call failed; the above content is a fallback response.`
          : payload.reply || 'I am here, but no valid response was generated this time.',
        status: llmFailed ? 'error' : undefined,
      });
      if (payload.reply && shouldAutoPromoteChatToRetrieval(content, payload.reply)) {
        addMessage({
          role: 'assistant',
          title: 'Retrieval Agent connected',
          content: 'Starting real literature and database search, going beyond conversational responses.',
        });
        void runRetrieval(content);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateTool(toolId, { status: 'error', details: [message] });
      addMessage({
        role: 'assistant',
        title: 'Conversation failed',
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
      prompt || (digests.some((digest) => digest.kind === 'structure') ? 'Continue scientific Agent based on uploaded structure' : 'Processing uploaded attachment'),
      fileNames.length ? `Attachment:${fileNames.join(', ')}` : '',
      attachmentContext ? `Attachment parsing context:
${attachmentContext}` : '',
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
      addMessage({ role: 'system', content: 'Speech input is not supported in the current browser.' });
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
        title: 'Expert Library',
        content: agents.map((agent) => `${agent.name}：${agent.output}`).join('\n'),
      });
      return;
    }
    if (itemId === 'connectors') {
      void (async () => {
        const nextProfiles = await fetchProfiles({ log: true });
        const nextSources = await fetchStructureSources();
        const liveSources = (nextSources?.live || structureSources?.live || []).map((source) => source.label).join('、') || 'Backend structure source registry';
        addMessage({
          role: 'assistant',
          title: 'Connector status',
          content: [
            `Compute submission target:${nextProfiles.length ? nextProfiles.map((profile) => `${profile.label}${profile.configured ? '(Configured)' : '(Unconfigured)'}`).join('、') : 'No profile available'}`,
            `Structure data source:${liveSources}`,
            'To perform a real submission, please proceed to "Input File Inspection" and select a submission location.',
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
                Go to Modeling Agent to Build Model Manually
              </button>
              <span className="text-xs text-gray-400">
                No recommendations available:{research.no_model_recommendation?.reason || 'No structures matched the retrieved literature.'}
              </span>
              {candidateSummary && (
                <span className="max-w-3xl truncate text-xs text-gray-500" title={candidateSummary}>
                  Candidates found:{candidateSummary}
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
                addMessage({ role: 'user', content: 'Use recommended model' });
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
              Use recommended model
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
            <span className="text-xs text-gray-400">You can also directly enter a custom model.</span>
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
                  computeIntent.engine === engine.id
                    ? 'border-[#0A1128] bg-[#0A1128] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-[#0A1128] hover:text-[#0A1128]'
                )}
                title={`${engine.summary} · Input compiler available; execution depends on the selected cluster environment`}
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
              Use recommended input file
            </button>
            <span className="text-xs text-gray-400">To modify, enter parameters directly, e.g., ENCUT=520, Agent=static.</span>
          </div>
        </div>
      );
    }

    if (phase === 'await_submit') {
      return (
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            {(profiles.length ? profiles : [{ id: 'local_demo', label: 'Input demo (Non-scientific compute)', configured: true, ready: true } as ServerComputeProfile]).map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => void submitJob(profile.id)}
                disabled={!(profile.ready ?? profile.configured) || profile.directSubmitSupported === false || !compiledInputs?.validation?.submissionReady || !compiledInputs?.auditToken}
                className={cx(
                  'h-9 rounded-[32px] border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  (profile.ready ?? profile.configured) ? 'border-[#0A1128] bg-[#0A1128] text-white hover:bg-[#162044]' : 'border-gray-200 text-gray-500'
                )}
              >
                {profile.mode === 'local_demo' ? 'Create Demo Record' : `Submit real compute to ${profile.label}`}
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
              Output results and generate PPT
            </button>
            <button
              type="button"
              onClick={() => {
                addMessage({ role: 'user', content: 'End conversation without generating PPT' });
                addMessage({ role: 'assistant', title: 'Ended', content: 'Compute results preserved in current session.' });
                void recordHarnessCheckpoint({
                  phase: 'done',
                  status: 'success',
                  agent: 'Orchestrator',
                  toolName: 'human.skip_presentation',
                  summary: 'User ended the Agent without generating a PPT',
                });
                setPhase('done');
              }}
              className="h-9 rounded-[32px] border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:border-gray-300"
            >
              No PPT needed
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F5F5F0] text-[#1d1d1f]">
      <div className="flex h-full min-w-0">
        <aside className="hidden h-full w-[260px] shrink-0 border-r border-black/5 bg-white/90 md:flex md:flex-col xl:w-[280px]">
          <div className="border-b border-gray-200 px-5 py-5">
            <button type="button" onClick={() => navigate('/workspace')} className="flex w-full items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#0A1128] text-white shadow-sm">
                <Bot size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">Research Workspace</p>
                <p className="truncate text-[11px] text-gray-500">Research Agent</p>
              </div>
            </button>
            <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-black/5 bg-[#F5F5F0] px-3 py-2.5">
              <Search size={15} className="text-gray-400" />
              <input
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
                placeholder="Search tasks"
              />
              <Settings2 size={15} className="text-gray-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
            <button
              type="button"
              onClick={resetTask}
              className="apple-button-primary mb-4 w-full justify-center shadow-none"
            >
              <MessageSquarePlus size={16} />
              New task
            </button>

            <div>
              <div className="flex items-center justify-between gap-2 px-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  {showArchivedTasks ? 'Archived' : 'Records'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowArchivedTasks((value) => !value)}
                  className="rounded-[32px] border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-500 transition hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                >
                  {showArchivedTasks ? `Returned ${activeTasks.length}` : `Archive ${archivedTasks.length}`}
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
                          <span>{phaseLabel[task.snapshot.phase] || 'Tasks'}</span>
                          <span>{messageCount} messages</span>
                          <span>{formatTaskTime(task.updatedAt)}</span>
                        </div>
                      </button>
                      <div className="my-1 mr-1 flex shrink-0 items-center gap-1 opacity-80 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => task.archived ? restoreTask(task.id) : archiveTask(task.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-[16px] text-gray-400 transition hover:bg-white hover:text-[#0A1128]"
                          title={task.archived ? 'Restore task' : 'Archive task'}
                        >
                          {task.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-[16px] border border-transparent text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          title="Delete task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!filteredTasks.length && (
                  <div className="rounded-[16px] border border-gray-100 bg-gray-50 px-3 py-3 text-xs leading-5 text-gray-500">
                    {taskSearchQuery ? 'No matching tasks.' : showArchivedTasks ? 'No archived tasks.' : 'No task history. Created tasks will automatically be saved here.'}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6">
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Tool portals</p>
              <nav className="mt-2 grid grid-cols-2 gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavItem(item.id)}
                      className="flex min-w-0 items-center gap-2 rounded-[14px] px-3 py-2 text-left text-xs text-gray-600 transition hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                    >
                      <Icon size={15} className="shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {!showArchivedTasks && !taskSearchQuery && (
              <div className="mt-6">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">Quick start</p>
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
                      <span className="text-[10px] text-gray-400">Templates</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 px-5 py-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Account</p>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-[16px] bg-[#F5F5F0] text-xs font-bold text-gray-700">
                {accountLabel.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{accountLabel}</p>
                <p className="truncate text-[11px] text-gray-400">Agent Workspace</p>
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
              Home
            </button>
            <div className="hidden min-w-0 flex-1 md:block">
              <p className="truncate text-sm font-semibold">{activeTask?.title || 'Continuous scientific Agent'}</p>
              <p className="truncate text-[11px] text-gray-400">Search &gt; Model Confirmation &gt; Input File Inspection &gt; Submit Compute &gt; Results Reporting</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span
                className={cx(
                  'hidden h-9 items-center gap-2 rounded-[32px] border px-3 text-xs font-semibold sm:flex',
                  runtimeSyncState === 'offline'
                    ? 'border-red-200 bg-red-50 text-red-600'
                    : 'border-gray-200 bg-gray-50 text-gray-700',
                )}
                title={runtimeSyncError || 'Tasks are persisted by server Runtime; local storage is cache only'}
              >
                {runtimeSyncState === 'connecting' || runtimeSyncState === 'saving'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Server size={14} />}
                {runtimeSyncState === 'connecting'
                  ? 'Connecting to Runtime'
                  : runtimeSyncState === 'saving'
                    ? 'Saving to Runtime'
                    : runtimeSyncState === 'synced'
                      ? 'Runtime synchronized'
                      : 'Runtime offline'}
              </span>
              <span className="hidden h-9 items-center gap-2 rounded-[32px] border border-gray-200 bg-gray-50 px-3 text-xs font-semibold text-gray-700 sm:flex">
                <ShieldCheck size={14} className="text-gray-500" />
                Source verification
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsModelMenuOpen((value) => !value)}
                  className="h-9 rounded-[32px] border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:border-gray-300"
                >
                  {textModelName}
                </button>
                {isModelMenuOpen && (
                  <div className="absolute right-0 top-11 z-30 w-[260px] rounded-[16px] border border-gray-200 bg-white p-3 text-xs shadow-[0_4px_30px_rgba(0,0,0,0.08)]">
                    <p className="font-semibold text-[#0A1128]">Text planning model</p>
                    <p className="mt-1 leading-5 text-gray-500">Used for dialogue planning {textModelName}; search, modeling, compute, and PPT are executed by backend tools.</p>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1">
            <section className="flex min-h-0 flex-col overflow-hidden">
              {phase !== 'idle' && <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 md:px-6">
                <div className="mx-auto flex max-w-5xl items-center overflow-x-auto pb-1 custom-scrollbar">
                  {workflowStageItems.map((stage, index) => {
                    const Icon = stage.icon;
                    const activeIndex = workflowStageIndex[phase];
                    const isDone = phase === 'done' || (activeIndex > index);
                    const isActive = activeIndex === index;
                    return (
                      <React.Fragment key={stage.label}>
                        {index > 0 && <span className={cx('mx-2 h-px min-w-5 flex-1', isDone || isActive ? 'bg-[#0A1128]' : 'bg-gray-200')} />}
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={cx(
                            'flex h-8 w-8 items-center justify-center rounded-[16px] border transition',
                            isDone || isActive ? 'border-[#0A1128] bg-[#0A1128] text-white' : 'border-gray-200 bg-gray-50 text-gray-400',
                          )}>
                            {isDone ? <Check size={14} /> : isActive && ['retrieving', 'modeling', 'compiling', 'submitting', 'monitoring', 'ppt'].includes(phase) ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                          </span>
                          <div>
                            <p className={cx('text-[10px] font-bold', isDone || isActive ? 'text-[#0A1128]' : 'text-gray-400')}>{stage.label}</p>
                            <p className="text-[9px] text-gray-400">{isDone ? 'Completed' : isActive ? phaseLabel[phase] : 'Pending'}</p>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>}

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#F5F5F0] px-4 py-5 custom-scrollbar md:px-6">
                <div className="mx-auto max-w-5xl space-y-4">
                  {(phase !== 'idle' || research || researchStack || modelStructure || compiledInputs || jobStatus) && <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#0A1128] text-white">
                        {phase === 'retrieving' || phase === 'modeling' || phase === 'compiling' || phase === 'submitting' || phase === 'monitoring' || phase === 'ppt'
                          ? <Loader2 size={18} className="animate-spin" />
                          : <BrainCircuit size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">Agent progress:{phaseLabel[phase]}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {research ? `${getVerifiedPapers(research.papers || []).length} verifiable papers · ${research.idea_cards?.length || 0} model recommendations` : 'Awaiting new scientific tasks'}
                          {researchStack ? ` · Feasibility ${researchStack.feasibility.score}/100 · ${researchStack.experiment.first_batch.length} experiment sets` : ''}
                          {modelStructure ? ` · ${modelStructure.atoms.length} atoms` : ''}
                          {compiledInputs ? ` · ${compiledFileNames.length} input files` : ''}
                          {jobStatus ? ` · Job ${jobStatus.status}` : ''}
                        </p>
                      </div>
                      {pptUrl && (
                        <a
                          href={pptUrl}
                          className="apple-button-primary min-h-9 px-4 py-2 text-xs"
                        >
                          <Download size={14} />
                          Download PPT
                        </a>
                      )}
                    </div>
                  </div>}

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
                        <p className="text-sm font-bold text-[#0A1128]">Verifiable literature</p>
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
                        <p className="text-xs leading-5 text-gray-500">No literature with DOI or accessible source link was returned in this round, so search results will not be used as paper evidence.</p>
                      )}
                    </div>
                  )}

                  {research && (
                    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Database size={16} className="text-gray-500" />
                          <div>
                            <p className="text-sm font-bold text-[#0A1128]">Candidate structures</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {research.structure_query_plan?.sources?.length
                                ? research.structure_query_plan.sources.slice(0, 5).map((item) => `${item.formula}（${structureQueryReasonLabel(item.reason)}）`).join('、')
                                : 'No queryable formula; material must be specified in Modeling Agent.'}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-[32px] border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-500">
                          {(research.structures || []).length} database candidates
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
                        <p className="text-xs leading-5 text-gray-500">No candidate structures were returned from real structure databases in this round, so no recommendations will be forced. You can enter Modeling Agent to build a model based on target papers.</p>
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
                          <p className="text-sm font-bold text-[#0A1128]">Input File Inspection</p>
                          <p className="mt-1 text-xs text-gray-500">Input files are signed by the server. To modify, please enter parameters below and recompile.</p>
                        </div>
                        <button
                          type="button"
                          onClick={acceptInputs}
                          className="rounded-[32px] bg-[#0A1128] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#162044]"
                        >
                          Confirm input file
                        </button>
                      </div>
                      <div className={cx(
                        'mb-3 rounded-[16px] border p-3',
                        compiledInputs.validation?.submissionReady ? 'border-green-100 bg-green-50' : 'border-red-100 bg-red-50'
                      )}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-[#0A1128]">
                            {compiledInputs.validation?.submissionReady ? 'Scientific Validation Passed' : 'Currently Not Submittable'}
                          </p>
                          <span className="font-mono text-[10px] text-gray-500">
                            {compiledInputs.audit?.auditId ? compiledInputs.audit.auditId.slice(0, 16) : 'unsigned'}
                          </span>
                        </div>
                        {compiledInputs.validation?.blockingIssues?.map((issue) => (
                          <p key={issue} className="mt-2 text-[11px] text-red-700">• {issue}</p>
                        ))}
                        {compiledInputs.validation?.warnings?.map((warning) => (
                          <p key={warning} className="mt-2 text-[11px] text-gray-600">• {warning}</p>
                        ))}
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
                            readOnly
                            spellCheck={false}
                            className="min-h-[260px] w-full resize-y border-0 bg-transparent p-3 font-mono text-xs leading-5 text-gray-800 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {visibleToolEvents.length > 0 && (
                    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                      <div className="mb-3 flex items-center gap-2">
                        <Play size={15} className="text-gray-500" />
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">Execution log</p>
                      </div>
                      <div className="space-y-3">
                        {visibleToolEvents.map((event) => (
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
                      title="Add file"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/materials')}
                      className="flex h-8 w-8 items-center justify-center rounded-[16px] text-gray-500 hover:bg-[#F5F5F0]"
                      title="Open Materials Library"
                    >
                      <FolderOpen size={16} />
                    </button>
                    <div className="ml-auto text-[11px] font-semibold text-gray-400">
                      {attachedFiles.length ? `${attachedFiles.length} attachments` : phaseLabel[phase]}
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
                      placeholder="Enter task or modification, e.g., search CO2 hydrogenation catalyst papers; ENCUT=520; use CP2K..."
                    />
                    <button
                      type="button"
                      onClick={startVoiceInput}
                      className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border text-gray-500 hover:bg-[#F5F5F0]', isListening ? 'border-[#0A1128] bg-white text-[#0A1128] shadow-sm ring-1 ring-black/5' : 'border-gray-200')}
                      title="Speech input"
                    >
                      <Mic size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleComposerSubmit()}
                      disabled={phase === 'retrieving' || phase === 'modeling' || phase === 'compiling' || phase === 'submitting' || phase === 'ppt'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1128] text-white transition hover:bg-[#162044] disabled:cursor-not-allowed disabled:bg-gray-300"
                      title="Send"
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
                    <p className="truncate text-sm font-bold">Run inspection</p>
                    <p className="truncate text-xs text-gray-500">{phaseLabel[phase]}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Literature</p>
                    <p className="mt-1 font-bold">{getVerifiedPapers(research?.papers || []).length}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Atoms</p>
                    <p className="mt-1 font-bold">{modelStructure?.atoms.length || 0}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Input</p>
                    <p className="mt-1 font-bold">{compiledFileNames.length}</p>
                  </div>
                  <div className="rounded-[16px] border border-gray-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Job</p>
                    <p className="mt-1 truncate font-bold">{jobStatus?.status || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="mb-5 rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-gray-600" />
                    <p className="text-sm font-bold">Process log</p>
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
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Node</p>
                          <p className="mt-1 font-bold">{harnessSession.checkpoints.length}</p>
                        </div>
                        <div className="rounded-[16px] border border-gray-200 bg-white p-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Artifacts</p>
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
                      A run record will be created after a new task starts, saving tool calls, user confirmations, and key artifacts.
                    </p>
                  )}
                </div>

                <div className="mb-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Database size={16} className="text-gray-500" />
                      <div>
                        <p className="text-sm font-bold">Data sources</p>
                        <p className="mt-0.5 text-[10px] text-gray-400">Current query:{activeSourceFormula}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void fetchStructureSources()}
                      className="flex h-8 w-8 items-center justify-center rounded-[16px] border border-gray-200 text-gray-500 transition hover:bg-[#F5F5F0]"
                      title="Refresh Backend Data Source Registrations"
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
                            {isLiveSearch ? 'Query current system' : 'View registration'}
                          </button>
                          {registryEntry?.homepage && (
                            <a
                              href={registryEntry.homepage}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-[16px] text-gray-400 hover:bg-[#F5F5F0] hover:text-[#0A1128]"
                              title="Open source homepage"
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
                      <p className="text-xs font-bold">Current model suggestion</p>
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
                      <p className="text-xs font-bold">Input files</p>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-gray-600">
                      <p>Full editor is available in the central area.</p>
                      <p>{compiledFileNames.join('、')}</p>
                    </div>
                  </div>
                )}

                <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-gray-600" />
                    <p className="text-xs font-bold">Submission location</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {profiles.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setSelectedProfileId(profile.id)}
                        disabled={!(profile.ready ?? profile.configured) || profile.directSubmitSupported === false}
                        className={cx(
                          'w-full rounded-[16px] border p-2 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-50',
                          selectedProfileId === profile.id ? 'border-[#0A1128] bg-white text-[#1d1d1f]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{profile.label}</span>
                          <span className={cx('rounded-[16px] border px-1.5 py-0.5 text-[9px] font-bold', (profile.ready ?? profile.configured) && profile.directSubmitSupported !== false ? 'border-gray-200 bg-white text-[#1d1d1f]' : 'border-gray-200 bg-gray-100 text-gray-400')}>
                            {!profile.configured ? 'Not configured' : profile.directSubmitSupported === false ? 'Proxy queue only' : profile.ready === false ? 'Inspection failed' : 'Ready for submission'}
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
