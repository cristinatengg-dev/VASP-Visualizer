import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  Beaker,
  BookOpen,
  ChevronRight,
  Database,
  ExternalLink,
  Globe2,
  Loader2,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import type {
  ExplorerDatabaseRecord,
  ExplorerIntegrationStage,
  ExplorerTier,
  RegistryExplorerConfig,
} from '../../data/explorerTypes';

interface MaterialEntry {
  material_id: string;
  formula: string;
  crystal_system: string;
  space_group: string | null;
  energy_above_hull: string;
  formation_energy?: string | null;
  band_gap?: string | null;
  theoretical?: boolean | null;
  source?: string;
  selection_reason: string;
}

interface SearchResults {
  mp: MaterialEntry[];
  oqmd: MaterialEntry[];
  aflow: MaterialEntry[];
}

type StructureDbKey = keyof SearchResults;
type ResultsTab = 'all' | StructureDbKey;
type AccessFilter = 'all' | ExplorerTier;
type CategoryFilter = 'all' | string;

const DB_META: Record<StructureDbKey, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; url: string }> = {
  mp: {
    label: 'Materials Project',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <Database size={14} />,
    url: 'https://materialsproject.org',
  },
  oqmd: {
    label: 'OQMD',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    icon: <Beaker size={14} />,
    url: 'https://oqmd.org',
  },
  aflow: {
    label: 'AFLOW',
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    icon: <Atom size={14} />,
    url: 'https://aflowlib.org',
  },
};

const TIER_META: Record<ExplorerTier, { label: string; icon: typeof Globe2; chip: string; panel: string }> = {
  open: {
    label: 'Open',
    icon: Globe2,
    chip: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    panel: 'bg-emerald-50/70 border-emerald-100',
  },
  controlled: {
    label: 'Controlled',
    icon: ShieldCheck,
    chip: 'bg-amber-50 border-amber-200 text-amber-700',
    panel: 'bg-amber-50/70 border-amber-100',
  },
  commercial: {
    label: 'Commercial',
    icon: LockKeyhole,
    chip: 'bg-rose-50 border-rose-200 text-rose-700',
    panel: 'bg-rose-50/70 border-rose-100',
  },
};

const STAGE_META: Record<ExplorerIntegrationStage, { label: string; chip: string }> = {
  connected: {
    label: 'Connected now',
    chip: 'bg-[#0A1128] text-white border-[#0A1128]',
  },
  ready: {
    label: 'Ready next',
    chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  'metadata-first': {
    label: 'Metadata first',
    chip: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  'apply-first': {
    label: 'Apply first',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  'license-first': {
    label: 'License first',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const STAGE_PRIORITY: Record<ExplorerIntegrationStage, number> = {
  connected: 0,
  ready: 1,
  'metadata-first': 2,
  'apply-first': 3,
  'license-first': 4,
};

const ACCESS_FILTER_META: Record<AccessFilter, string> = {
  all: 'All access modes',
  open: 'Open',
  controlled: 'Controlled',
  commercial: 'Commercial',
};

const MaterialCard: React.FC<{
  entry: MaterialEntry;
  dbKey: StructureDbKey;
  onViewStructure: (entry: MaterialEntry) => void;
}> = ({ entry, dbKey, onViewStructure }) => {
  const meta = DB_META[dbKey];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-[18px] border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:border-gray-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] transition-all"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold text-[#0A1128]">{entry.formula}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${meta.bg} ${meta.color} ${meta.border}`}>
              {meta.icon}
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">{entry.selection_reason}</p>
        </div>
        <span className="shrink-0 text-[10px] font-mono text-gray-400">{entry.material_id}</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Crystal:</span>
          <span className="font-medium text-gray-700">{entry.crystal_system}</span>
        </div>
        {entry.space_group && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">SG:</span>
            <span className="font-mono text-gray-700">{entry.space_group}</span>
          </div>
        )}
        {entry.energy_above_hull !== 'N/A' && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">E<sub>hull</sub>:</span>
            <span className={`font-mono font-medium ${entry.energy_above_hull === '0.000' ? 'text-emerald-600' : 'text-gray-700'}`}>
              {entry.energy_above_hull} eV/at
            </span>
          </div>
        )}
        {entry.formation_energy && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">ΔH<sub>f</sub>:</span>
            <span className="font-mono text-gray-700">{entry.formation_energy} eV/at</span>
          </div>
        )}
        {entry.band_gap && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">E<sub>g</sub>:</span>
            <span className="font-mono text-gray-700">{entry.band_gap} eV</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onViewStructure(entry)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0A1128] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#162044]"
        >
          <Zap size={10} />
          Send to Modeling
        </button>
        {dbKey === 'mp' ? (
          <a
            href={`https://materialsproject.org/materials/${entry.material_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-700"
          >
            View MP entry <ExternalLink size={9} />
          </a>
        ) : (
          <a
            href={meta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700"
          >
            Open source site <ExternalLink size={9} />
          </a>
        )}
      </div>
    </motion.div>
  );
};

const SourceCard: React.FC<{
  source: ExplorerDatabaseRecord;
  config: RegistryExplorerConfig;
}> = ({ source, config }) => {
  const categoryMeta = config.categoryMeta[source.category];
  const tierMeta = TIER_META[source.tier];
  const stageMeta = STAGE_META[source.integrationStage];
  const TierIcon = tierMeta.icon;
  const CategoryIcon = categoryMeta.icon;

  return (
    <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-all hover:border-gray-200 hover:shadow-[0_6px_24px_rgba(0,0,0,0.06)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-[#0A1128]">{source.name}</h3>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${tierMeta.chip}`}>
              <TierIcon size={10} />
              {tierMeta.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">{source.summary}</p>
        </div>
        <a
          href={source.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-gray-200 p-2 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-700"
          aria-label={`Open ${source.name}`}
        >
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${categoryMeta.chip}`}>
          <CategoryIcon size={11} />
          {source.category}
        </span>
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-600">
          {source.access}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${stageMeta.chip}`}>
          {stageMeta.label}
        </span>
      </div>

      <div className="space-y-2 text-[11px] leading-relaxed text-gray-500">
        <p>
          <span className="font-semibold text-gray-700">Scope:</span> {source.scope}
        </p>
        <p>
          <span className="font-semibold text-gray-700">Official status:</span> {source.statusNote}
        </p>
        <p>
          <span className="font-semibold text-gray-700">Project fit:</span> {source.projectFit}
        </p>
      </div>
    </div>
  );
};

const RegistryMaterialsExplorer: React.FC<{ config: RegistryExplorerConfig }> = ({ config }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchedFormula, setSearchedFormula] = useState('');
  const [activeTab, setActiveTab] = useState<ResultsTab>('all');
  const [error, setError] = useState<string | null>(null);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const handleSearch = async (formula?: string) => {
    const searchFormula = formula || query.trim();
    if (!searchFormula || isSearching) return;

    setIsSearching(true);
    setError(null);
    setResults(null);
    setSearchedFormula(searchFormula);

    try {
      const res = await fetch(`${API_BASE_URL}/materials/search?formula=${encodeURIComponent(searchFormula)}`);
      const data = await res.json();
      if (data.success) {
        setResults(data.results);
        setActiveTab('all');
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleViewStructure = (entry: MaterialEntry) => {
    const params = new URLSearchParams();
    params.set('material', entry.formula);
    if (entry.material_id && !entry.material_id.startsWith('oqmd-') && !entry.material_id.startsWith('aflow:')) {
      params.set('mpid', entry.material_id);
    }
    if (entry.space_group) params.set('phase', entry.space_group);
    params.set('prompt', `${config.modelingPromptPrefix} ${entry.formula} (${entry.crystal_system}, ${entry.space_group || 'unknown SG'})`);
    navigate(`/agent/modeling?${params.toString()}`);
  };

  const totalCount = results ? results.mp.length + results.oqmd.length + results.aflow.length : 0;

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (activeTab === 'all') {
      return [
        ...results.mp.map((entry) => ({ entry, dbKey: 'mp' as const })),
        ...results.oqmd.map((entry) => ({ entry, dbKey: 'oqmd' as const })),
        ...results.aflow.map((entry) => ({ entry, dbKey: 'aflow' as const })),
      ];
    }

    return results[activeTab].map((entry) => ({ entry, dbKey: activeTab }));
  }, [activeTab, results]);

  const filteredSources = useMemo(
    () => [...config.databases]
      .filter((source) => accessFilter === 'all' || source.tier === accessFilter)
      .filter((source) => categoryFilter === 'all' || source.category === categoryFilter)
      .sort((left, right) => {
        const stageGap = STAGE_PRIORITY[left.integrationStage] - STAGE_PRIORITY[right.integrationStage];
        if (stageGap !== 0) return stageGap;
        return left.name.localeCompare(right.name);
      }),
    [accessFilter, categoryFilter, config.databases],
  );

  const readyNow = useMemo(
    () => config.databases.filter((source) => source.integrationStage === 'connected' || source.integrationStage === 'ready'),
    [config.databases],
  );
  const applyFirst = useMemo(
    () => config.databases.filter((source) => source.integrationStage === 'apply-first'),
    [config.databases],
  );
  const licenseFirst = useMemo(
    () => config.databases.filter((source) => source.integrationStage === 'license-first'),
    [config.databases],
  );

  const sourceCounts = useMemo(
    () => ({
      open: config.databases.filter((source) => source.tier === 'open').length,
      controlled: config.databases.filter((source) => source.tier === 'controlled').length,
      commercial: config.databases.filter((source) => source.tier === 'commercial').length,
      connected: config.databases.filter((source) => source.integrationStage === 'connected').length,
    }),
    [config.databases],
  );

  const categoryOptions = ['all', ...config.categoryOrder];

  return (
    <div className="min-h-screen bg-[#F5F5F0] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Database size={16} className="text-indigo-600" />
            <h1 className="text-lg font-black tracking-wide text-[#0A1128]">{config.title}</h1>
          </div>
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-indigo-400">
            {config.badge}
          </span>
        </div>

        <section className="mb-6 rounded-[28px] border border-white/70 bg-white px-6 py-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                  {sourceCounts.open} open
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                  {sourceCounts.controlled} controlled
                </span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-700">
                  {sourceCounts.commercial} commercial
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-700">
                  {sourceCounts.connected} already connected
                </span>
              </div>

              <h2 className="max-w-3xl text-2xl font-black leading-tight text-[#0A1128]">
                {config.heroHeadline}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-500">
                {config.heroDescription}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Immediate wave</p>
                <p className="mt-2 text-sm font-bold text-[#0A1128]">{config.immediateWaveText}</p>
              </div>
              <div className="rounded-[22px] border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Access path</p>
                <p className="mt-2 text-sm font-bold text-[#0A1128]">{config.closedPathText}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Connected now</p>
                <h2 className="mt-1 text-lg font-black text-[#0A1128]">Live structure search</h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  {config.searchDescription}
                </p>
              </div>
              <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold text-gray-500">
                MP + OQMD + AFLOW
              </div>
            </div>

            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSearch();
                  }}
                  placeholder={config.searchPlaceholder}
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-4 pr-12 text-sm transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  disabled={isSearching}
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={isSearching || !query.trim()}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {config.popularFormulas.map((item) => (
                <button
                  key={item.formula}
                  onClick={() => {
                    setQuery(item.formula);
                    handleSearch(item.formula);
                  }}
                  disabled={isSearching}
                  className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                >
                  <span className="font-mono font-bold">{item.formula}</span>
                  <span className="ml-1 text-gray-400">{item.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[20px] border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-indigo-700">
                <Sparkles size={12} />
                <span className="font-semibold">Next public wave:</span>
                {config.nextWave.map((item, index) => (
                  <React.Fragment key={item}>
                    {index > 0 && <span>·</span>}
                    <span>{item}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0A1128]">How we handle closed data</p>
              <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-gray-500">
                <p><span className="font-semibold text-gray-700">1.</span> Use the institution’s existing license or subscription.</p>
                <p><span className="font-semibold text-gray-700">2.</span> Apply through the official portal, member route, or account workflow.</p>
                <p><span className="font-semibold text-gray-700">3.</span> Ask for redistribution or mirror rights before shipping data in product features.</p>
                <p><span className="font-semibold text-gray-700">4.</span> If rights stay unclear, keep the integration at outbound-link or metadata level only.</p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0A1128]">Access buckets</p>
              <div className="mt-4 space-y-3">
                <div className={`rounded-[18px] border p-4 ${TIER_META.open.panel}`}>
                  <p className="text-xs font-bold text-[#0A1128]">Open</p>
                  <p className="mt-1 text-[11px] text-gray-500">{config.openBucketText}</p>
                </div>
                <div className={`rounded-[18px] border p-4 ${TIER_META.controlled.panel}`}>
                  <p className="text-xs font-bold text-[#0A1128]">Controlled</p>
                  <p className="mt-1 text-[11px] text-gray-500">{config.controlledBucketText}</p>
                </div>
                <div className={`rounded-[18px] border p-4 ${TIER_META.commercial.panel}`}>
                  <p className="text-xs font-bold text-[#0A1128]">Commercial</p>
                  <p className="mt-1 text-[11px] text-gray-500">{config.commercialBucketText}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-[18px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <section className="mb-6 rounded-[28px] border border-white/70 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-black text-[#0A1128]">
                {results ? (
                  <>
                    Results for <span className="font-mono text-indigo-600">{searchedFormula}</span>
                  </>
                ) : (
                  'Search results'
                )}
              </h2>
              <span className="text-[10px] font-mono text-gray-400">
                {results ? `${totalCount} entries across 3 connected databases` : 'Run a structure search to populate this panel'}
              </span>
            </div>

            {results && (
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'all' as const, label: 'All', count: totalCount },
                  { key: 'mp' as const, label: 'Materials Project', count: results.mp.length },
                  { key: 'oqmd' as const, label: 'OQMD', count: results.oqmd.length },
                  { key: 'aflow' as const, label: 'AFLOW', count: results.aflow.length },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                      activeTab === tab.key
                        ? 'bg-[#0A1128] text-white'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label} <span className="ml-0.5 font-mono">{tab.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6">
            {isSearching ? (
              <div className="py-14 text-center">
                <Loader2 size={32} className="mx-auto mb-4 animate-spin text-indigo-500" />
                <p className="text-sm font-bold text-[#0A1128]">Searching connected structure sources...</p>
                <p className="mt-1 text-xs text-gray-400">Materials Project + OQMD + AFLOW</p>
              </div>
            ) : results ? (
              <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto xl:grid-cols-2">
                <AnimatePresence>
                  {filteredResults.length === 0 ? (
                    <div className="xl:col-span-2 py-14 text-center opacity-50">
                      <Database size={42} className="mx-auto mb-3 text-gray-400" />
                      <p className="text-sm font-bold text-gray-500">No entries found</p>
                      <p className="mt-1 text-xs text-gray-400">Try another formula or broaden the search term.</p>
                    </div>
                  ) : (
                    filteredResults.map(({ entry, dbKey }, index) => (
                      <MaterialCard
                        key={`${dbKey}-${entry.material_id}-${index}`}
                        entry={entry}
                        dbKey={dbKey}
                        onViewStructure={handleViewStructure}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="rounded-[24px] border border-gray-100 bg-[#FAFAF8] p-6">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-indigo-50">
                    <Database size={26} className="text-indigo-500" />
                  </div>
                  <h3 className="text-base font-black text-[#0A1128]">{config.emptyStateTitle}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
                    {config.emptyStateDescription}
                  </p>
                  <button
                    onClick={() => {
                      setQuery(config.ctaFormula);
                      handleSearch(config.ctaFormula);
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0A1128] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#162044]"
                  >
                    Try {config.ctaFormula} <ArrowRight size={14} />
                  </button>
                </div>

                <div className="rounded-[24px] border border-gray-100 bg-[#FAFAF8] p-6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Why this explorer is split</p>
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">
                    Structure databases plug into formula search cleanly. Domain archives, property references,
                    and device datasets usually need metadata-first handling because the identifiers, files,
                    and access terms are different.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Ready now</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {readyNow.map((source) => (
                <span
                  key={source.id}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700"
                >
                  {source.shortName}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Need approval</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {applyFirst.map((source) => (
                <span
                  key={source.id}
                  className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
                >
                  {source.shortName}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Need license</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {licenseFirst.map((source) => (
                <span
                  key={source.id}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700"
                >
                  {source.shortName}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.05)] ring-1 ring-black/5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Current landscape</p>
              <h2 className="mt-1 text-lg font-black text-[#0A1128]">Official domain source registry</h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                Filter by access model and data family. The point here is to separate plug-in candidates from sources that still need a formal access conversation first.
              </p>
            </div>
            <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold text-gray-500">
              {filteredSources.length} sources shown
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(ACCESS_FILTER_META) as AccessFilter[]).map((value) => (
              <button
                key={value}
                onClick={() => setAccessFilter(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  accessFilter === value
                    ? 'bg-[#0A1128] text-white'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {ACCESS_FILTER_META[value]}
              </button>
            ))}
          </div>

          <div className="mb-6 flex flex-wrap gap-2">
            {categoryOptions.map((value) => (
              <button
                key={value}
                onClick={() => setCategoryFilter(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  categoryFilter === value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                }`}
              >
                {value === 'all' ? 'All categories' : value}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {filteredSources.map((source) => (
              <SourceCard key={source.id} source={source} config={config} />
            ))}
          </div>

          {filteredSources.length === 0 && (
            <div className="py-12 text-center">
              <ChevronRight size={24} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-bold text-gray-500">No sources match this filter combination.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default RegistryMaterialsExplorer;
