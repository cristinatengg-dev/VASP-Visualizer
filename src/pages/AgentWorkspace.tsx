import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
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
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
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
  formation_energy?: string | null;
  band_gap?: string | null;
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
  recommended_idea_id: string;
  papers: Paper[];
  structures: StructureCandidate[];
  handoff: {
    formula: string;
    material_id: string | null;
    model_type: string;
    supercell: string | null;
    handoff_prompt: string | null;
    rationale: string | null;
  } | null;
}

type AgentEvent = StageEvent | { type: 'error'; content: string } | { type: 'complete'; data: CompleteData };

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'agent', label: 'Agent AI', icon: Bot },
  { id: 'experts', label: 'Experts', icon: BriefcaseBusiness },
  { id: 'skills', label: 'Skills', icon: WandSparkles },
  { id: 'explore', label: 'Explore', icon: Search },
  { id: 'connectors', label: 'Connectors', icon: Link2 },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'automation', label: 'Automation', icon: Activity },
];

const agents: WorkspaceAgent[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    subtitle: 'single conversation',
    status: 'active',
    accent: 'bg-[#0A1128] text-white',
    icon: BrainCircuit,
    tools: ['plan', 'retrieve', 'model', 'compute', 'ppt'],
    output: '连续编排检索、建模、计算、结果与汇报输出。',
  },
  {
    id: 'retrieval',
    name: 'Literature',
    subtitle: 'paper evidence',
    status: 'ready',
    accent: 'bg-emerald-600 text-white',
    icon: FileText,
    tools: ['CrossRef', 'OpenAlex', 'arXiv', 'PubMed'],
    output: '从论文和数据库证据生成可建模候选。',
  },
  {
    id: 'database',
    name: 'Databases',
    subtitle: 'six sources',
    status: 'active',
    accent: 'bg-indigo-600 text-white',
    icon: Database,
    tools: ['MP', 'PubChem', 'COD', 'JARVIS', 'ICSD', 'OPTIMADE'],
    output: '统一呈现六类结构与材料数据源。',
  },
  {
    id: 'modeling',
    name: 'Modeling',
    subtitle: 'deterministic structure',
    status: 'ready',
    accent: 'bg-sky-600 text-white',
    icon: AtomIcon,
    tools: ['bulk', 'slab', 'molecule', 'adsorbate'],
    output: '把候选体系落成可计算原子结构。',
  },
  {
    id: 'compute',
    name: 'Compute',
    subtitle: 'inputs and jobs',
    status: 'handoff',
    accent: 'bg-amber-600 text-white',
    icon: Cpu,
    tools: ['VASP', 'CP2K', 'QE', 'Slurm/PBS'],
    output: '生成输入文件并提交到选定计算位置。',
  },
  {
    id: 'export',
    name: 'Presentation',
    subtitle: 'nature-paper2ppt',
    status: 'ready',
    accent: 'bg-rose-600 text-white',
    icon: Archive,
    tools: ['pptx', 'QA', 'download'],
    output: '按 nature-paper2ppt 逻辑输出中文汇报 PPT。',
  },
];

const databaseAgents: DatabaseAgent[] = [
  {
    id: 'materials-project',
    name: 'Materials Project',
    shortName: 'MP',
    status: 'active',
    scope: 'Computed crystal structures, stability, energies, symmetry, and materials metadata.',
    agentRole: 'Primary crystal source',
    sources: ['bulk', 'slab', 'stability'],
  },
  {
    id: 'pubchem-3d',
    name: 'PubChem 3D',
    shortName: 'PubChem',
    status: 'active',
    scope: 'Small molecules, adsorbates, formula identity, and conformer references.',
    agentRole: 'Molecule identity',
    sources: ['SDF', 'formula', 'bonds'],
  },
  {
    id: 'cod',
    name: 'Crystallography Open Database',
    shortName: 'COD',
    status: 'ready',
    scope: 'Open experimental CIF structures for crystal and phase cross-checking.',
    agentRole: 'Experimental CIF',
    sources: ['CIF', 'open', 'experimental'],
  },
  {
    id: 'jarvis',
    name: 'JARVIS',
    shortName: 'JARVIS',
    status: 'ready',
    scope: 'DFT structures, surfaces, spectra, and NIST materials records.',
    agentRole: 'DFT expansion',
    sources: ['DFT', 'surfaces', 'NIST'],
  },
  {
    id: 'icsd-csd',
    name: 'ICSD / CSD',
    shortName: 'ICSD+CSD',
    status: 'gated',
    scope: 'Curated inorganic and molecular crystal references behind licensed access.',
    agentRole: 'Licensed source',
    sources: ['license', 'curated', 'enterprise'],
  },
  {
    id: 'optimade-atomly',
    name: 'OPTIMADE / Atomly',
    shortName: 'OPTIMADE',
    status: 'handoff',
    scope: 'Federated materials API connector and third-party source aggregation.',
    agentRole: 'Federation',
    sources: ['connector', 'federated', 'provider chain'],
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

const recentTasks = [
  '检索 CO2 加氢催化剂文章',
  '构建 Cu(111)+CO2+H2 吸附模型',
  '生成 VASP relaxation 输入并提交 local demo',
];

const statusMeta: Record<AgentStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready: { label: 'Ready', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  handoff: { label: 'Handoff', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  gated: { label: 'Gated', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const phaseLabel: Record<WorkflowPhase, string> = {
  idle: 'Ready',
  retrieving: 'Retrieving',
  await_model: 'Model choice',
  modeling: 'Modeling',
  await_software: 'Software choice',
  compiling: 'Compiling inputs',
  await_input: 'Review inputs',
  await_submit: 'Submit choice',
  submitting: 'Submitting',
  monitoring: 'Monitoring',
  await_ppt: 'Report choice',
  ppt: 'Creating PPT',
  done: 'Done',
  error: 'Needs attention',
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const StatusPill: React.FC<{ status: AgentStatus }> = ({ status }) => {
  const meta = statusMeta[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
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

const topPaperLines = (papers: Paper[], limit = 5) => papers.slice(0, limit).map((paper, index) => {
  const title = paper.title || 'Untitled';
  const year = paper.year ? ` (${paper.year})` : '';
  return `${index + 1}. ${title}${year} · ${paper.source}${paper.doi ? ` · DOI ${paper.doi}` : ''}`;
});

const shouldReplaceIrrelevantCatalystFallback = (prompt: string, data: CompleteData) => {
  const text = `${prompt} ${data.user_goal?.interpreted_goal || ''}`.toLowerCase();
  if (!/(co2|二氧化碳).*(hydrogenation|加氢|methanol|甲醇)/i.test(text)) return false;
  const idea = data.idea_cards?.find((item) => item.id === data.recommended_idea_id) || data.idea_cards?.[0];
  const formula = `${idea?.blueprint?.structure_source?.formula || ''} ${idea?.title || ''} ${idea?.material_family || ''}`;
  return !idea || /LiCoO2|NaCoO2|battery|电池|cathode|^H2$|^CO2$|literature-backed starter model/i.test(formula.trim());
};

const applyChemistryAwareRecommendation = (prompt: string, data: CompleteData): CompleteData => {
  if (!shouldReplaceIrrelevantCatalystFallback(prompt, data)) return data;
  const evidencePaper = (data.papers || []).find((paper) => /CuZn|ZrO2|methanol|hydrogenation|加氢|甲醇/i.test(`${paper.title} ${paper.abstract}`));
  const catalystIdea: IdeaCard = {
    id: 'co2-hydrogenation-cuzn-zro2-starter',
    title: 'Cu(111)+CO2/H2 literature-guided starter model',
    material_family: 'Cu / CuZn-ZrO2 CO2 hydrogenation catalyst',
    fit_reason: evidencePaper
      ? `检索到与 CO2 加氢相关的铜基/氧化物界面文献，因此推荐先用 Cu(111)+CO2/H2 作为可计算 starter model，而不是使用无关的电池材料 fallback。`
      : '目标是 CO2 加氢催化，优先使用铜基表面和 CO2/H2 吸附物作为 starter model，避免把无关电池材料传入建模。',
    literature_basis: evidencePaper
      ? `${evidencePaper.title} (${evidencePaper.year || 'n.d.'})`
      : 'CO2 hydrogenation catalyst screening starter model',
    recommended_model_type: 'slab + adsorbates',
    target_properties: ['adsorption energy', 'surface relaxation', 'CO2 activation'],
    starter_friendly: true,
    difficulty: 'starter',
    confidence: evidencePaper ? 'medium' : 'low',
    directly_supported: true,
    blueprint: {
      why_this_idea: 'CO2 加氢通常需要表面位点和 CO2/H2 吸附构型；先用铜基表面 starter model 能保证建模和计算链路化学相关。',
      what_can_be_calculated: 'CO2/H2 adsorption energy, relaxed geometry, charge transfer, initial activation descriptors.',
      structure_source: {
        formula: 'Cu',
        phase_or_polymorph: 'fcc copper surface',
        material_id: null,
        source_reason: 'No robust database catalyst interface was returned, so Orchestrator selected a deterministic Cu(111) surface starter model.',
      },
      modeling_recipe: {
        starting_point: 'slab',
        cell_choice: 'Cu(111) slab',
        supercell: '3x3x4',
        slab: '(111), 4 layers, 15 A vacuum',
        defect_or_doping: null,
        migration: null,
      },
      literature_rationale: evidencePaper
        ? `Evidence anchor: ${evidencePaper.title}.`
        : 'Copper-based surfaces are a safer starter path for CO2 hydrogenation than battery oxides.',
      caution_notes: ['This is a starter model. Validate exact catalyst phase/interface against target papers before publication-grade conclusions.'],
      first_step: 'Build and relax Cu(111)+CO2/H2 adsorbate structure.',
      second_step: 'Compare CO2, H2, COOH/formate intermediates on the same surface model.',
      handoff_prompt: 'Build a Cu(111) slab with 4 layers, 3x3 supercell, 15 A vacuum, then place CO2 and H2 adsorbates on top sites for CO2 hydrogenation catalyst screening.',
    },
  };

  return {
    ...data,
    summary: `${data.summary || ''}\nOrchestrator replaced an irrelevant fallback with a chemistry-aware CO2 hydrogenation starter model.`.trim(),
    recommended_idea_id: catalystIdea.id,
    idea_cards: [catalystIdea, ...(data.idea_cards || [])],
    handoff: {
      formula: 'Cu',
      material_id: null,
      model_type: 'slab + adsorbates',
      supercell: '3x3x4',
      handoff_prompt: catalystIdea.blueprint.handoff_prompt,
      rationale: catalystIdea.fit_reason,
    },
  };
};

const AgentWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user, setMolecularData, setShowBonds } = useStore();
  const accountLabel = user?.email || 'Research user';
  const [workspacePrompt, setWorkspacePrompt] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [phase, setPhase] = useState<WorkflowPhase>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      title: 'Orchestrator ready',
      content: '把检索、论文证据、模型选择、计算输入、集群提交和 PPT 输出放在同一个对话里执行。你可以直接输入：检索 CO2 加氢催化剂文章。',
      createdAt: Date.now(),
    },
  ]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [research, setResearch] = useState<CompleteData | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [modelIntent, setModelIntent] = useState<Record<string, any> | null>(null);
  const [modelStructure, setModelStructure] = useState<MolecularStructure | null>(null);
  const [computeIntent, setComputeIntent] = useState<ComputeIntent>(defaultComputeIntent);
  const [profiles, setProfiles] = useState<ServerComputeProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('local_demo');
  const [compiledInputs, setCompiledInputs] = useState<CompiledInputs | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [computeResult, setComputeResult] = useState<ComputeResult | null>(null);
  const [pptUrl, setPptUrl] = useState<string | null>(null);
  const [pptQa, setPptQa] = useState<string | null>(null);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [harnessSession, setHarnessSession] = useState<HarnessSessionState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const harnessSessionIdRef = useRef<string | null>(null);

  const selectedIdea = useMemo(() => {
    if (!research?.idea_cards?.length) return null;
    return research.idea_cards.find((idea) => idea.id === selectedIdeaId)
      || research.idea_cards.find((idea) => idea.id === research.recommended_idea_id)
      || research.idea_cards[0];
  }, [research, selectedIdeaId]);

  const filteredRecentTasks = recentTasks.filter((task) => task.toLowerCase().includes(taskSearch.trim().toLowerCase()));
  const configuredProfiles = profiles.filter((profile) => profile.configured);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || configuredProfiles[0] || profiles[0] || null;

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

  const postJson = useCallback(async <T,>(path: string, payload: Record<string, any> = {}): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(withUserPayload(payload)),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    }
    return data as T;
  }, [getAuthHeaders, withUserPayload]);

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
          summary: 'Agent harness session created',
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

  const fetchProfiles = useCallback(async () => {
    const toolId = addTool({
      name: 'compute.profiles',
      agent: 'Compute',
      status: 'running',
      summary: '读取可提交的本地/集群 profile',
      details: [],
    });
    try {
      const response = await fetch(`${API_BASE_URL}/compute/profiles`);
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Failed to load compute profiles');
      const nextProfiles: ServerComputeProfile[] = Array.isArray(payload.profiles) ? payload.profiles : [];
      setProfiles(nextProfiles);
      const firstConfigured = nextProfiles.find((profile) => profile.configured);
      if (firstConfigured) setSelectedProfileId(firstConfigured.id);
      updateTool(toolId, {
        status: 'success',
        details: nextProfiles.map((profile) => `${profile.label}: ${profile.configured ? 'configured' : 'not configured'}`),
      });
      return nextProfiles;
    } catch (error) {
      updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      return [];
    }
  }, [addTool, updateTool]);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

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
            const data = applyChemistryAwareRecommendation(prompt, event.data);
            setResearch(data);
            setSelectedIdeaId(data.recommended_idea_id || data.idea_cards?.[0]?.id || null);
            updateTool(toolId, {
              status: 'success',
              details: [
                `${data.papers?.length || 0} papers collected`,
                `${data.structures?.length || 0} structures collected`,
                `recommended: ${data.idea_cards?.find((idea) => idea.id === data.recommended_idea_id)?.title || data.idea_cards?.[0]?.title || 'none'}`,
              ],
            });
            addMessage({
              role: 'assistant',
              title: '检索结果和模型建议',
              content: [
                `目标理解：${data.user_goal?.interpreted_goal || prompt}`,
                '',
                '具体文章：',
                ...(topPaperLines(data.papers || [], 6).length ? topPaperLines(data.papers || [], 6) : ['没有返回可用文章，请换一个检索表达。']),
                '',
                `推荐模型：${data.idea_cards?.find((idea) => idea.id === data.recommended_idea_id)?.title || data.idea_cards?.[0]?.title || '暂无推荐'}`,
                `推荐原因：${data.idea_cards?.find((idea) => idea.id === data.recommended_idea_id)?.fit_reason || data.summary || '基于当前检索结果生成。'}`,
                '',
                '是否使用这个推荐模型？也可以直接在输入框写你想改成的模型、晶面、吸附物或材料。'
              ].join('\n'),
            });
            void recordHarnessCheckpoint({
              phase: 'await_model',
              status: 'success',
              agent: 'Retrieval + Database',
              toolName: 'agent.retrieve',
              summary: 'Research bundle ready; waiting for model choice',
              details: [
                `${data.papers?.length || 0} papers`,
                `${data.structures?.length || 0} structures`,
                `${data.idea_cards?.length || 0} model ideas`,
              ],
              artifact: {
                kind: 'research_bundle',
                summary: `Research bundle for ${prompt}`,
                producedBySkill: 'retrieve_literature_and_structures',
                payload: data as unknown as Record<string, any>,
              },
            });
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
  }, [addMessage, addTool, getAuthHeaders, recordHarnessCheckpoint, startHarnessSession, updateTool, withUserPayload]);

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

    try {
      const parsePayload = await postJson<{ success: boolean; intent: Record<string, any> }>('/modeling/parse-intent', {
        prompt,
        providerPreferences: ['mp', 'ase', 'builtin'],
      });
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
      const buildResponse = await fetch(`${API_BASE_URL}/modeling/build`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(intent),
      });
      const buildPayload = await buildResponse.json();
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
      addMessage({
        role: 'assistant',
        title: '建模失败',
        content: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
      setPhase('error');
    }
  }, [addMessage, addTool, getAuthHeaders, postJson, recordHarnessCheckpoint, research, selectedIdea, setMolecularData, setShowBonds, updateTool]);

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
            '是否输出结果并用 nature-paper2ppt 生成 PPT？'
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
      name: 'presentation.nature-paper2ppt',
      agent: 'Presentation',
      status: 'running',
      summary: '按 nature-paper2ppt 证据链生成中文 PPTX',
      details: ['Collecting papers, model, compute inputs and results...'],
    });
    try {
      const payload = await postJson<any>('/agent/presentation/nature-ppt', {
        prompt: messages.find((message) => message.role === 'user')?.content || '',
        research,
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
      setPptUrl(payload.downloadUrl);
      setPptQa(payload.qa || null);
      updateTool(toolId, {
        status: 'success',
        details: [payload.filename, payload.qa || 'PPTX package generated'],
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
        toolName: 'presentation.nature-paper2ppt',
        summary: 'Presentation generated',
        details: [payload.filename, payload.qa || 'PPTX package generated'],
        artifact: {
          kind: 'presentation',
          summary: payload.filename,
          producedBySkill: 'create_nature_presentation',
          payload: {
            filename: payload.filename,
            downloadUrl: payload.downloadUrl,
            qa: payload.qa || null,
            skillSource: payload.skillSource || null,
          },
        },
      });
      setPhase('done');
    } catch (error) {
      updateTool(toolId, { status: 'error', details: [error instanceof Error ? error.message : String(error)] });
      addMessage({ role: 'assistant', title: 'PPT 生成失败', content: error instanceof Error ? error.message : String(error), status: 'error' });
      setPhase('error');
    }
  }, [addMessage, addTool, compiledInputs, computeIntent, computeResult, jobStatus, messages, modelIntent, modelStructure, postJson, recordHarnessCheckpoint, research, selectedIdea, updateTool]);

  const resetTask = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      title: 'New task',
      content: '新的连续 Agent 对话已准备好。',
      createdAt: Date.now(),
    }]);
    setToolEvents([]);
    setResearch(null);
    setSelectedIdeaId(null);
    setModelIntent(null);
    setModelStructure(null);
    setCompiledInputs(null);
    setJobStatus(null);
    setComputeResult(null);
    setPptUrl(null);
    setPptQa(null);
    setHarnessSession(null);
    harnessSessionIdRef.current = null;
    setPhase('idle');
  };

  const handleComposerSubmit = () => {
    const prompt = workspacePrompt.trim();
    const fileNames = attachedFiles.map((file) => file.name);
    if (!prompt && !fileNames.length) return;
    const content = [prompt || 'Process attached files.', fileNames.length ? `附件：${fileNames.join(', ')}` : ''].filter(Boolean).join('\n');
    setWorkspacePrompt('');

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
    if (itemId === 'home') navigate('/');
    if (itemId === 'explore') navigate('/explore');
  };

  const renderDecisionPanel = () => {
    if (phase === 'await_model' && research) {
      return (
        <div className="border-t border-slate-200 bg-white px-4 py-3">
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
              className="h-9 rounded-lg bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#17213D]"
            >
              使用推荐模型
            </button>
            {research.idea_cards.slice(0, 4).map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => setSelectedIdeaId(idea.id)}
                className={cx(
                  'h-9 rounded-lg border px-3 text-xs font-semibold transition',
                  selectedIdeaId === idea.id ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {idea.blueprint?.structure_source?.formula || idea.material_family || idea.title.slice(0, 24)}
              </button>
            ))}
            <span className="text-xs text-slate-400">也可以直接输入自定义模型。</span>
          </div>
        </div>
      );
    }

    if (phase === 'await_software') {
      return (
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            {engineOptions.map((engine) => (
              <button
                key={engine.id}
                type="button"
                onClick={() => selectEngine(engine.id)}
                className={cx(
                  'h-9 rounded-lg border px-3 text-xs font-semibold transition',
                  engine.id === 'vasp' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'
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
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={acceptInputs}
              className="h-9 rounded-lg bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#17213D]"
            >
              使用推荐输入文件
            </button>
            <span className="text-xs text-slate-400">需要更改就直接输入参数，例如 ENCUT=520, workflow=static。</span>
          </div>
        </div>
      );
    }

    if (phase === 'await_submit') {
      return (
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            {(profiles.length ? profiles : [{ id: 'local_demo', label: 'Local Demo Runner', configured: true } as ServerComputeProfile]).map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => void submitJob(profile.id)}
                disabled={!profile.configured}
                className={cx(
                  'h-9 rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                  profile.configured ? 'border-slate-900 bg-slate-900 text-white hover:bg-[#17213D]' : 'border-slate-200 text-slate-500'
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
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void generatePpt()}
              className="h-9 rounded-lg bg-[#0A1128] px-4 text-xs font-semibold text-white hover:bg-[#17213D]"
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
              className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-slate-300"
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
    <div className="h-screen w-screen overflow-hidden bg-[#F7F8FA] text-[#101828]">
      <div className="flex h-full min-w-0">
        <aside className="hidden h-full w-[280px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-5 py-5">
            <button type="button" onClick={() => navigate('/workspace')} className="flex w-full items-center gap-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A1128] text-white">
                <Bot size={20} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">SCI Agent AI</p>
                <p className="truncate text-[11px] text-slate-500">Research workspace</p>
              </div>
            </button>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={15} className="text-slate-400" />
              <input
                value={taskSearch}
                onChange={(event) => setTaskSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                placeholder="Search tasks"
              />
              <Settings2 size={15} className="text-slate-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
            <button
              type="button"
              onClick={resetTask}
              className="mb-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold shadow-sm transition hover:border-slate-300"
            >
              <MessageSquarePlus size={16} />
              New task
            </button>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavItem(item.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Icon size={17} />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6">
              <p className="px-3 text-[11px] font-semibold uppercase text-slate-400">Tasks</p>
              <div className="mt-2 space-y-1">
                {filteredRecentTasks.map((task, index) => (
                  <button
                    key={task}
                    type="button"
                    onClick={() => setWorkspacePrompt(task)}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition',
                      index === 0 ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50'
                    )}
                  >
                    {index === 0 ? <Zap size={14} className="text-emerald-600" /> : <Check size={14} className="text-slate-400" />}
                    <span className="min-w-0 flex-1 truncate">{task}</span>
                    {index === 0 && <span className="text-[10px] text-slate-400">live</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">
                {accountLabel.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{accountLabel}</p>
                <p className="truncate text-[11px] text-slate-400">Agent workspace</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 md:px-6">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
            >
              <Home size={16} />
              Home
            </button>
            <div className="hidden min-w-0 flex-1 md:block">
              <p className="truncate text-sm font-semibold">连续科研 Agent</p>
              <p className="truncate text-[11px] text-slate-400">检索 &gt; 模型确认 &gt; 输入文件确认 &gt; 集群提交 &gt; 结果/PPT</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 sm:flex">
                <ShieldCheck size={14} />
                Tools ON
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsModelMenuOpen((value) => !value)}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-slate-300"
                >
                  deepseek-v4-pro
                </button>
                {isModelMenuOpen && (
                  <div className="absolute right-0 top-11 z-30 w-[240px] rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg">
                    <p className="font-semibold text-slate-900">文本 Orchestrator</p>
                    <p className="mt-1 leading-5 text-slate-500">当前文本规划和对话入口绑定 deepseek-v4-pro；工具调用走后端 API。</p>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="flex min-h-0 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 md:px-6">
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {agents.map((agent) => {
                    const Icon = agent.icon;
                    return (
                      <div key={agent.id} className="min-h-[78px] w-[168px] shrink-0 rounded-lg border border-slate-200 bg-white p-3 text-left">
                        <div className="flex items-center gap-2">
                          <span className={cx('flex h-8 w-8 items-center justify-center rounded-md', agent.accent)}>
                            <Icon size={16} />
                          </span>
                          <StatusPill status={agent.status} />
                        </div>
                        <p className="mt-2 truncate text-xs font-bold">{agent.name}</p>
                        <p className="truncate text-[11px] text-slate-500">{agent.subtitle}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8FA] px-4 py-5 custom-scrollbar md:px-6">
                <div className="mx-auto max-w-5xl space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0A1128] text-white">
                        {phase === 'retrieving' || phase === 'modeling' || phase === 'compiling' || phase === 'submitting' || phase === 'monitoring' || phase === 'ppt'
                          ? <Loader2 size={18} className="animate-spin" />
                          : <BrainCircuit size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">Workflow: {phaseLabel[phase]}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {research ? `${research.papers?.length || 0} papers · ${research.idea_cards?.length || 0} model ideas` : 'No active research bundle yet'}
                          {modelStructure ? ` · ${modelStructure.atoms.length} atoms` : ''}
                          {compiledInputs ? ` · ${Object.keys(compiledInputs.files).length} input files` : ''}
                          {jobStatus ? ` · job ${jobStatus.status}` : ''}
                        </p>
                      </div>
                      {pptUrl && (
                        <a
                          href={pptUrl}
                          className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <Download size={14} />
                          Download PPT
                        </a>
                      )}
                    </div>
                  </div>

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cx(
                        'rounded-lg border p-4 shadow-sm',
                        message.role === 'user' ? 'ml-auto max-w-3xl border-slate-900 bg-slate-900 text-white' : 'max-w-4xl border-slate-200 bg-white text-slate-800',
                        message.status === 'error' && 'border-rose-200 bg-rose-50 text-rose-800'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md', message.role === 'user' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600')}>
                          {message.role === 'user' ? <MessageSquarePlus size={15} /> : <Bot size={15} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          {message.title && <p className="text-xs font-bold uppercase tracking-widest opacity-70">{message.title}</p>}
                          <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {toolEvents.length > 0 && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2">
                        <Play size={15} className="text-slate-500" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Tool Calls</p>
                      </div>
                      <div className="space-y-3">
                        {toolEvents.map((event) => (
                          <div key={event.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center gap-2">
                              {event.status === 'running' ? <Loader2 size={14} className="animate-spin text-sky-600" /> : event.status === 'success' ? <Check size={14} className="text-emerald-600" /> : <CircleDot size={14} className="text-rose-600" />}
                              <p className="text-xs font-bold text-slate-800">{event.name}</p>
                              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">{event.agent}</span>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">{event.summary}</p>
                            {event.details.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {event.details.slice(-8).map((detail, index) => (
                                  <p key={`${event.id}-${index}`} className="truncate font-mono text-[10px] text-slate-400" title={detail}>
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

              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 md:px-6">
                <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
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
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
                      title="Attach files"
                    >
                      <Paperclip size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/materials/battery')}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
                      title="Open database explorer"
                    >
                      <FolderOpen size={16} />
                    </button>
                    <div className="ml-auto text-[11px] font-semibold text-slate-400">
                      {attachedFiles.length ? `${attachedFiles.length} attachments` : phaseLabel[phase]}
                    </div>
                  </div>
                  {attachedFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-2">
                      {attachedFiles.map((file) => (
                        <button
                          key={`${file.name}-${file.size}`}
                          type="button"
                          onClick={() => setAttachedFiles((prev) => prev.filter((item) => item !== file))}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-rose-200 hover:text-rose-600"
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
                          handleComposerSubmit();
                        }
                      }}
                      rows={2}
                      className="min-h-[54px] flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                      placeholder="输入任务或修改，例如：检索 CO2 加氢催化剂文章；ENCUT=520；使用 CP2K..."
                    />
                    <button
                      type="button"
                      onClick={startVoiceInput}
                      className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-slate-500 hover:bg-slate-50', isListening ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200')}
                      title="Voice input"
                    >
                      <Mic size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={handleComposerSubmit}
                      disabled={phase === 'retrieving' || phase === 'modeling' || phase === 'compiling' || phase === 'submitting' || phase === 'ppt'}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0A1128] text-white hover:bg-[#17213D] disabled:cursor-not-allowed disabled:bg-slate-300"
                      title="Send"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="hidden min-h-0 border-l border-slate-200 bg-white xl:flex xl:flex-col">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0A1128] text-white">
                    <BrainCircuit size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">Run Inspector</p>
                    <p className="truncate text-xs text-slate-500">{phaseLabel[phase]}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Papers</p>
                    <p className="mt-1 font-bold">{research?.papers?.length || 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Atoms</p>
                    <p className="mt-1 font-bold">{modelStructure?.atoms.length || 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inputs</p>
                    <p className="mt-1 font-bold">{compiledInputs ? Object.keys(compiledInputs.files).length : 0}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Job</p>
                    <p className="mt-1 truncate font-bold">{jobStatus?.status || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-slate-600" />
                    <p className="text-sm font-bold">Agent Harness</p>
                  </div>
                  {harnessSession ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-md border border-slate-200 bg-white p-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Session</p>
                        <p className="mt-1 truncate font-mono text-[11px] text-slate-700" title={harnessSession.sessionId}>{harnessSession.sessionId}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{harnessSession.harness}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-md border border-slate-200 bg-white p-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Checkpoints</p>
                          <p className="mt-1 font-bold">{harnessSession.checkpoints.length}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-white p-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Artifacts</p>
                          <p className="mt-1 font-bold">{harnessSession.checkpoints.filter((item) => item.artifact && item.artifact.id !== 'pending').length}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {harnessSession.checkpoints.slice(-5).map((checkpoint) => (
                          <div key={checkpoint.id} className="rounded-md border border-slate-200 bg-white p-2">
                            <div className="flex items-center gap-2">
                              <span className={cx(
                                'h-2 w-2 rounded-full',
                                checkpoint.status === 'success' ? 'bg-emerald-500' : checkpoint.status === 'running' ? 'bg-sky-500' : checkpoint.status === 'error' ? 'bg-rose-500' : 'bg-slate-300'
                              )} />
                              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{checkpoint.summary}</p>
                            </div>
                            {checkpoint.artifact && (
                              <p className="mt-1 truncate font-mono text-[10px] text-slate-400" title={checkpoint.artifact.id}>
                                {checkpoint.artifact.kind}: {checkpoint.artifact.id}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      新任务开始后会创建 runtime session，记录工具调用、用户确认和关键 artifact。
                    </p>
                  )}
                </div>

                <div className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Database size={16} className="text-slate-500" />
                    <p className="text-sm font-bold">Six Databases</p>
                  </div>
                  <div className="space-y-2">
                    {databaseAgents.map((db) => (
                      <div key={db.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[9px] font-bold text-white">{db.shortName.slice(0, 3)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold">{db.name}</p>
                            <p className="truncate text-[11px] text-slate-400">{db.agentRole}</p>
                          </div>
                          <StatusPill status={db.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedIdea && (
                  <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2">
                      <FlaskConical size={16} className="text-slate-600" />
                      <p className="text-xs font-bold">Selected Model</p>
                    </div>
                    <p className="mt-3 text-sm font-bold">{selectedIdea.title}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{selectedIdea.fit_reason}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
                        {selectedIdea.blueprint?.structure_source?.formula || selectedIdea.material_family}
                      </span>
                      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
                        {selectedIdea.recommended_model_type}
                      </span>
                    </div>
                  </div>
                )}

                {compiledInputs && (
                  <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-slate-600" />
                      <p className="text-xs font-bold">Input Preview</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {Object.entries(compiledInputs.files).slice(0, 4).map(([name, content]) => (
                        <details key={name} className="rounded-md border border-slate-200 bg-white p-2">
                          <summary className="cursor-pointer text-xs font-bold text-slate-700">{name}</summary>
                          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-slate-500">{content.slice(0, 1200)}</pre>
                        </details>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-slate-600" />
                    <p className="text-xs font-bold">Compute Profiles</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {profiles.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setSelectedProfileId(profile.id)}
                        className={cx(
                          'w-full rounded-md border p-2 text-left text-xs transition',
                          selectedProfileId === profile.id ? 'border-slate-900 bg-white text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{profile.label}</span>
                          <span className={cx('rounded px-1.5 py-0.5 text-[9px] font-bold', profile.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
                            {profile.configured ? 'configured' : 'missing'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{profile.summary}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {pptQa && (
                  <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-bold text-emerald-800">PPT QA</p>
                    <p className="mt-2 text-xs leading-5 text-emerald-700">{pptQa}</p>
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
