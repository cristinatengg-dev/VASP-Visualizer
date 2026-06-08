import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Archive,
  ArrowRight,
  Atom,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  FolderOpen,
  Gauge,
  Home,
  Library,
  Link2,
  MessageSquarePlus,
  Mic,
  PanelRight,
  Paperclip,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  WandSparkles,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../store/useStore';

type AgentStatus = 'active' | 'ready' | 'handoff' | 'gated';

interface WorkspaceAgent {
  id: string;
  name: string;
  subtitle: string;
  route: string;
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
  route?: string;
  sources: string[];
}

interface TimelineStep {
  id: string;
  agentId: string;
  title: string;
  body: string;
  state: 'done' | 'running' | 'queued';
  tool?: string;
}

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
    name: 'Orchestrator Agent',
    subtitle: 'Task router',
    route: '/workspace',
    status: 'active',
    accent: 'bg-[#0A1128] text-white',
    icon: BrainCircuit,
    tools: ['Task plan', 'Agent handoff', 'Runtime trace'],
    output: 'A staged research workflow with visible tool calls.',
  },
  {
    id: 'retrieval',
    name: 'Idea Agent',
    subtitle: 'Literature and proposal',
    route: '/agent/retrieval',
    status: 'ready',
    accent: 'bg-emerald-600 text-white',
    icon: FileText,
    tools: ['Paper search', 'Blueprint', 'Modeling handoff'],
    output: 'Research ideas with database-backed structure candidates.',
  },
  {
    id: 'database',
    name: 'Database Agent',
    subtitle: 'Six source registry',
    route: '/materials',
    status: 'active',
    accent: 'bg-indigo-600 text-white',
    icon: Database,
    tools: ['Formula search', 'CIF fetch', 'Source ranking'],
    output: 'A single database agent view with source confidence.',
  },
  {
    id: 'modeling',
    name: 'Modeling Agent',
    subtitle: 'Natural-language structures',
    route: '/agent/modeling',
    status: 'ready',
    accent: 'bg-sky-600 text-white',
    icon: Atom,
    tools: ['Bulk', 'Slab', 'Adsorbate'],
    output: 'Deterministic atomistic models and explicit bond orders.',
  },
  {
    id: 'compute',
    name: 'Compute Agent',
    subtitle: 'VASP input and jobs',
    route: '/agent/compute',
    status: 'handoff',
    accent: 'bg-amber-600 text-white',
    icon: Cpu,
    tools: ['INCAR', 'KPOINTS', 'HPC submit'],
    output: 'Validated VASP input sets and queued compute runs.',
  },
  {
    id: 'rendering',
    name: 'Rendering Agent',
    subtitle: 'Structure and trajectory view',
    route: '/app',
    status: 'ready',
    accent: 'bg-violet-600 text-white',
    icon: Gauge,
    tools: ['WebGL scene', 'Styles', 'Export'],
    output: 'Interactive scientific structure visualization.',
  },
  {
    id: 'illustration',
    name: 'Illustration Agent',
    subtitle: 'AI cover and figure',
    route: '/agent/rendering',
    status: 'ready',
    accent: 'bg-rose-600 text-white',
    icon: Sparkles,
    tools: ['Prompt compile', 'Image edit', 'HD export'],
    output: 'Publication cover images with chemistry constraints.',
  },
  {
    id: 'export',
    name: 'Export Agent',
    subtitle: 'Final package',
    route: '/agent/runtime',
    status: 'handoff',
    accent: 'bg-slate-700 text-white',
    icon: Archive,
    tools: ['Artifacts', 'Reports', 'Trace'],
    output: 'A reproducible bundle of files, visuals, and logs.',
  },
];

const databaseAgents: DatabaseAgent[] = [
  {
    id: 'materials-project',
    name: 'Materials Project',
    shortName: 'MP',
    status: 'active',
    scope: 'Computed crystal structures, stability, energies, symmetry, and materials metadata.',
    agentRole: 'Primary crystal source agent',
    route: '/materials/battery',
    sources: ['API key', 'bulk', 'slab'],
  },
  {
    id: 'pubchem-3d',
    name: 'PubChem 3D',
    shortName: 'PubChem',
    status: 'active',
    scope: 'Small molecules, adsorbates, formula identity, and 3D conformer references.',
    agentRole: 'Molecule identity agent',
    route: '/agent/modeling',
    sources: ['local library', 'SDF', 'bonds'],
  },
  {
    id: 'cod',
    name: 'Crystallography Open Database',
    shortName: 'COD',
    status: 'ready',
    scope: 'Open experimental CIF structures for crystal and phase cross-checking.',
    agentRole: 'Experimental CIF agent',
    route: '/materials/nuclear',
    sources: ['CIF', 'open', 'experimental'],
  },
  {
    id: 'jarvis',
    name: 'JARVIS',
    shortName: 'JARVIS',
    status: 'ready',
    scope: 'DFT structures, surfaces, spectra, and NIST materials records.',
    agentRole: 'DFT expansion agent',
    route: '/materials/supercapacitor',
    sources: ['DFT', 'surfaces', 'NIST'],
  },
  {
    id: 'icsd-csd',
    name: 'ICSD / CSD',
    shortName: 'ICSD+CSD',
    status: 'gated',
    scope: 'Curated inorganic and molecular crystal references behind licensed access.',
    agentRole: 'Licensed structure agent',
    route: '/materials/nuclear',
    sources: ['license-first', 'curated', 'enterprise'],
  },
  {
    id: 'optimade-atomly',
    name: 'OPTIMADE / Atomly',
    shortName: 'OPTIMADE',
    status: 'handoff',
    scope: 'Federated materials API connector and third-party source aggregation.',
    agentRole: 'Connector federation agent',
    route: '/agent/runtime',
    sources: ['connector', 'federated', 'provider chain'],
  },
];

const timeline: TimelineStep[] = [
  {
    id: 'understand',
    agentId: 'orchestrator',
    title: '任务理解',
    body: '将自然语言目标拆成检索、结构、计算、渲染和导出阶段。',
    state: 'done',
    tool: 'Task Planner',
  },
  {
    id: 'database',
    agentId: 'database',
    title: '六大数据库检索',
    body: '按材料、分子、晶体和授权状态选择数据库 Agent，并记录来源可信度。',
    state: 'running',
    tool: 'Database Agent',
  },
  {
    id: 'modeling',
    agentId: 'modeling',
    title: '确定性结构建模',
    body: '将数据库结构送入 Modeling Agent，生成 bulk、slab、adsorbate 或 molecule 结构。',
    state: 'queued',
    tool: 'Model Builder',
  },
  {
    id: 'rendering',
    agentId: 'illustration',
    title: '封面与图像输出',
    body: '先锁定分子与晶面，再进行 AI 美化、局部编辑和出版级导出。',
    state: 'queued',
    tool: 'Image Pipeline',
  },
];

const recentTasks = [
  'CO2 hydrogenation catalyst cover',
  'Cu(111) + adsorbate modeling',
  'Battery cathode search',
];

const statusMeta: Record<AgentStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready: { label: 'Ready', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  handoff: { label: 'Handoff', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  gated: { label: 'Gated', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const StatusPill: React.FC<{ status: AgentStatus }> = ({ status }) => {
  const meta = statusMeta[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
      <CircleDot size={9} />
      {meta.label}
    </span>
  );
};

const getSurfaceRoute = (agent: WorkspaceAgent, database: DatabaseAgent) => {
  if (agent.id === 'database') return database.route || agent.route;
  return agent.route;
};

const getSurfaceTitle = (agent: WorkspaceAgent, database: DatabaseAgent) => {
  if (agent.id === 'database') return `${database.name} · Database Agent`;
  return agent.name;
};

const AgentWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useStore();
  const [selectedAgentId, setSelectedAgentId] = useState('database');
  const [selectedDbId, setSelectedDbId] = useState('materials-project');
  const accountLabel = user?.email || 'Research user';

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || agents[0],
    [selectedAgentId]
  );
  const selectedDatabase = useMemo(
    () => databaseAgents.find((db) => db.id === selectedDbId) || databaseAgents[0],
    [selectedDbId]
  );
  const activeSurfaceRoute = getSurfaceRoute(selectedAgent, selectedDatabase);
  const activeSurfaceTitle = getSurfaceTitle(selectedAgent, selectedDatabase);
  const isEmbeddedSurface = selectedAgent.id !== 'orchestrator';

  const activateAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
  };

  const handleNavItem = (itemId: string) => {
    if (itemId === 'home') {
      navigate('/');
      return;
    }
    if (itemId === 'explore') {
      navigate('/explore');
      return;
    }
    const navAgentMap: Record<string, string> = {
      agent: 'orchestrator',
      experts: 'compute',
      skills: 'modeling',
      connectors: 'export',
      library: 'database',
      automation: 'export',
    };
    const nextAgentId = navAgentMap[itemId];
    if (nextAgentId) activateAgent(nextAgentId);
  };

  const openSelectedAgent = () => {
    navigate(activeSurfaceRoute);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F7F8FA] text-[#101828]">
      <div className="flex h-full min-w-0">
        <aside className="hidden h-full w-[280px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-5 py-5">
            <button
              type="button"
              onClick={() => navigate('/workspace')}
              className="flex w-full items-center gap-3 text-left"
            >
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
              <span className="text-xs text-slate-400">Search tasks</span>
              <Settings2 size={15} className="ml-auto text-slate-400" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
            <button
              type="button"
              onClick={() => activateAgent('orchestrator')}
              className="mb-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold shadow-sm transition hover:border-slate-300"
            >
              <MessageSquarePlus size={16} />
              New task
            </button>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  (item.id === 'agent' && selectedAgent.id === 'orchestrator') ||
                  (item.id === 'experts' && selectedAgent.id === 'compute') ||
                  (item.id === 'skills' && selectedAgent.id === 'modeling') ||
                  (item.id === 'connectors' && selectedAgent.id === 'export') ||
                  (item.id === 'library' && selectedAgent.id === 'database') ||
                  (item.id === 'automation' && selectedAgent.id === 'export');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavItem(item.id)}
                    className={cx(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition',
                      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    )}
                  >
                    <Icon size={17} />
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.id === 'library' && <ChevronDown size={14} className="ml-auto" />}
                  </button>
                );
              })}
            </nav>

            <div className="mt-6">
              <p className="px-3 text-[11px] font-semibold uppercase text-slate-400">Tasks</p>
              <div className="mt-2 space-y-1">
                {recentTasks.map((task, index) => (
                  <button
                    key={task}
                    type="button"
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
              <p className="truncate text-sm font-semibold">帮我把 CO2 催化体系从数据库检索、建模、计算到封面输出串起来</p>
              <p className="truncate text-[11px] text-slate-400">Orchestrator is coordinating single-agent handoffs and database agents.</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 sm:flex"
              >
                <PanelRight size={16} />
                Inspector
              </button>
              <button
                type="button"
                onClick={openSelectedAgent}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#0A1128] px-3 text-sm font-semibold text-white transition hover:bg-[#17213D]"
              >
                Open agent
                <ArrowRight size={15} />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="flex min-h-0 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
                <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  const active = selectedAgent.id === agent.id;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => activateAgent(agent.id)}
                      className={cx(
                        'min-h-[86px] w-[184px] shrink-0 rounded-lg border p-3 text-left transition',
                        active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cx('flex h-8 w-8 items-center justify-center rounded-md', active ? 'bg-white/15 text-white' : agent.accent)}>
                          <Icon size={16} />
                        </span>
                        <StatusPill status={agent.status} />
                      </div>
                      <p className="mt-3 truncate text-sm font-bold">{agent.name}</p>
                      <p className={cx('truncate text-[11px]', active ? 'text-slate-300' : 'text-slate-500')}>{agent.subtitle}</p>
                    </button>
                  );
                })}
                </div>
              </div>

              {isEmbeddedSurface ? (
                <div className="min-h-0 flex-1 bg-slate-100 p-3 md:p-4">
                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
                      <div className={cx('flex h-8 w-8 items-center justify-center rounded-md', selectedAgent.accent)}>
                        <selectedAgent.icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{activeSurfaceTitle}</p>
                        <p className="truncate text-[11px] text-slate-400">{activeSurfaceRoute}</p>
                      </div>
                      <StatusPill status={selectedAgent.id === 'database' ? selectedDatabase.status : selectedAgent.status} />
                      <button
                        type="button"
                        onClick={openSelectedAgent}
                        className="hidden h-8 items-center gap-2 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 sm:flex"
                      >
                        Full page
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <iframe
                      key={activeSurfaceRoute}
                      title={activeSurfaceTitle}
                      src={activeSurfaceRoute}
                      className="min-h-0 w-full flex-1 border-0 bg-white"
                    />
                    {selectedAgent.id === 'database' && (
                      <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2 custom-scrollbar xl:hidden">
                        {databaseAgents.map((db) => (
                          <button
                            key={db.id}
                            type="button"
                            onClick={() => setSelectedDbId(db.id)}
                            className={cx(
                              'h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition',
                              selectedDatabase.id === db.id
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            )}
                          >
                            {db.shortName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 custom-scrollbar md:px-6">
                <div className="mx-auto max-w-4xl space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0A1128] text-white">
                        <BrainCircuit size={19} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">Agent AI 工作流</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          这个页面把项目改成任务驱动的总控台：一个 Orchestrator 负责拆解科研任务，单个 Agent 负责执行，六大数据库以 Database Agent 形式呈现并参与检索与建模。
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/agent/runtime')}
                        className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                      >
                        Runtime trace
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  {timeline.map((step, index) => {
                    const agent = agents.find((item) => item.id === step.agentId) || agents[0];
                    const Icon = agent.icon;
                    return (
                      <div key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={cx(
                              'mt-2 flex h-7 w-7 items-center justify-center rounded-md border',
                              step.state === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                              step.state === 'running' && 'border-sky-200 bg-sky-50 text-sky-700',
                              step.state === 'queued' && 'border-slate-200 bg-white text-slate-400'
                            )}
                          >
                            {step.state === 'done' ? <Check size={14} /> : step.state === 'running' ? <Play size={13} /> : <Square size={12} />}
                          </div>
                          {index < timeline.length - 1 && <div className="mt-2 h-full w-px bg-slate-200" />}
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cx('flex h-8 w-8 items-center justify-center rounded-md', agent.accent)}>
                              <Icon size={16} />
                            </span>
                            <p className="text-sm font-bold">{step.title}</p>
                            <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">{agent.name}</span>
                            {step.tool && (
                              <span className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-500">{step.tool}</span>
                            )}
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>
                        </div>
                      </div>
                    );
                  })}

                  <div className="grid gap-3 md:grid-cols-3">
                    {agents.slice(4).map((agent) => {
                      const Icon = agent.icon;
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => activateAgent(agent.id)}
                          className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300"
                        >
                          <div className="flex items-center gap-2">
                            <span className={cx('flex h-8 w-8 items-center justify-center rounded-md', agent.accent)}>
                              <Icon size={16} />
                            </span>
                            <StatusPill status={agent.status} />
                          </div>
                          <p className="mt-3 truncate text-sm font-bold">{agent.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{agent.output}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              )}

              {!isEmbeddedSurface && (
              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 md:px-6">
                <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50">
                      <Paperclip size={16} />
                    </button>
                    <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50">
                      <FolderOpen size={16} />
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      <button type="button" className="hidden h-8 items-center gap-2 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 sm:flex">
                        <ShieldCheck size={14} />
                        Tools ON
                      </button>
                      <button type="button" className="h-8 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600">
                        deepseek-v4-pro
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end gap-3 px-4 py-3">
                    <textarea
                      rows={2}
                      className="min-h-[54px] flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                      placeholder="输入科研任务，例如：检索 CO2 加氢催化剂，构建 Cu(111)+CO2+H2，并生成可编辑封面图..."
                    />
                    <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                      <Mic size={16} />
                    </button>
                    <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0A1128] text-white hover:bg-[#17213D]">
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
              )}
            </section>

            <aside className="hidden min-h-0 border-l border-slate-200 bg-white xl:flex xl:flex-col">
              <div className="border-b border-slate-200 p-5">
                <div className="flex items-start gap-3">
                  <div className={cx('flex h-11 w-11 items-center justify-center rounded-lg', selectedAgent.accent)}>
                    <selectedAgent.icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{selectedAgent.name}</p>
                    <p className="truncate text-xs text-slate-500">{selectedAgent.subtitle}</p>
                    <div className="mt-2">
                      <StatusPill status={selectedAgent.status} />
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{selectedAgent.output}</p>
                <button
                  type="button"
                  onClick={openSelectedAgent}
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0A1128] text-sm font-semibold text-white transition hover:bg-[#17213D]"
                >
                  Open single agent
                  <ArrowRight size={15} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold">Six Database Agents</p>
                    <p className="text-[11px] text-slate-400">Single-source agent view</p>
                  </div>
                  <Database size={18} className="text-slate-400" />
                </div>

                <div className="space-y-2">
                  {databaseAgents.map((db) => (
                    <button
                      key={db.id}
                      type="button"
                      onClick={() => {
                        setSelectedDbId(db.id);
                        setSelectedAgentId('database');
                      }}
                      className={cx(
                        'w-full rounded-lg border p-3 text-left transition',
                        selectedDatabase.id === db.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
                          {db.shortName.slice(0, 3)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{db.name}</p>
                          <p className="truncate text-[11px] text-slate-400">{db.agentRole}</p>
                        </div>
                        <StatusPill status={db.status} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{db.scope}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-2">
                    <FlaskConical size={16} className="text-slate-600" />
                    <p className="text-xs font-bold">{selectedDatabase.name}</p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{selectedDatabase.scope}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedDatabase.sources.map((source) => (
                      <span key={source} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500">
                        {source}
                      </span>
                    ))}
                  </div>
                  {selectedDatabase.route && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgentId('database');
                        setSelectedDbId(selectedDatabase.id);
                      }}
                      className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-300"
                    >
                      Load in workspace
                      <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AgentWorkspace;
