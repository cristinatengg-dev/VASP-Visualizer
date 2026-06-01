import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  Beaker,
  Database,
  ExternalLink,
  Loader2,
  Search,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import type { SimpleExplorerConfig } from '../../data/simpleExplorerConfigs';

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

type ResultsTab = 'all' | 'mp' | 'oqmd' | 'aflow';

const DB_META: Record<'mp' | 'oqmd' | 'aflow', { label: string; color: string; bg: string; border: string; icon: React.ReactNode; url: string }> = {
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

const MaterialCard: React.FC<{
  entry: MaterialEntry;
  dbKey: 'mp' | 'oqmd' | 'aflow';
  onViewStructure: (entry: MaterialEntry) => void;
}> = ({ entry, dbKey, onViewStructure }) => {
  const meta = DB_META[dbKey];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-[16px] border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:border-gray-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold text-[#0A1128]">{entry.formula}</span>
          <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${meta.bg} ${meta.color} ${meta.border}`}>
            {meta.label}
          </span>
        </div>
        <span className="shrink-0 text-[10px] font-mono text-gray-400">{entry.material_id}</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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

      <p className="mb-3 text-[10px] leading-relaxed text-gray-400">{entry.selection_reason}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onViewStructure(entry)}
          className="flex items-center gap-1.5 rounded-full bg-[#0A1128] px-3 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#162044]"
        >
          <Zap size={10} />
          Send to Modeling
        </button>
        {dbKey === 'mp' && entry.material_id && (
          <a
            href={`https://materialsproject.org/materials/${entry.material_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-mono text-[10px] text-indigo-500 hover:text-indigo-700"
          >
            View on MP <ExternalLink size={9} />
          </a>
        )}
      </div>
    </motion.div>
  );
};

const SimpleMaterialsExplorer: React.FC<{ config: SimpleExplorerConfig }> = ({ config }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchedFormula, setSearchedFormula] = useState('');
  const [activeTab, setActiveTab] = useState<ResultsTab>('all');
  const [error, setError] = useState<string | null>(null);

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

  const filtered = !results
    ? []
    : activeTab === 'all'
      ? [
        ...results.mp.map((entry) => ({ entry, dbKey: 'mp' as const })),
        ...results.oqmd.map((entry) => ({ entry, dbKey: 'oqmd' as const })),
        ...results.aflow.map((entry) => ({ entry, dbKey: 'aflow' as const })),
      ]
      : results[activeTab].map((entry) => ({ entry, dbKey: activeTab }));

  const totalCount = results ? results.mp.length + results.oqmd.length + results.aflow.length : 0;

  return (
    <div className="min-h-screen bg-[#F5F5F0] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-3">
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
        </div>

        <div className="mb-6 rounded-[24px] bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
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
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 px-4 pr-12 text-sm transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
        </div>

        {error && (
          <div className="mb-6 rounded-[16px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {results && (
          <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
            <div className="border-b border-gray-100 px-6 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-black text-[#0A1128]">
                  Results for <span className="font-mono text-indigo-600">{searchedFormula}</span>
                </h2>
                <span className="font-mono text-[10px] text-gray-400">{totalCount} entries across 3 databases</span>
              </div>

              <div className="flex gap-1.5">
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
            </div>

            <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2">
              <AnimatePresence>
                {filtered.length === 0 && (
                  <div className="col-span-2 py-12 text-center opacity-40">
                    <Database size={40} className="mx-auto mb-3 text-gray-400" />
                    <p className="text-sm font-bold text-gray-400">No entries found</p>
                    <p className="mt-1 text-xs text-gray-400">Try a different formula</p>
                  </div>
                )}
                {filtered.map(({ entry, dbKey }, index) => (
                  <MaterialCard
                    key={`${dbKey}-${entry.material_id}-${index}`}
                    entry={entry}
                    dbKey={dbKey}
                    onViewStructure={handleViewStructure}
                  />
                ))}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-4 border-t border-gray-100 bg-gray-50/50 px-6 py-3">
              <span className="text-[10px] text-gray-400">Data sources:</span>
              {Object.entries(DB_META).map(([key, meta]) => (
                <a
                  key={key}
                  href={meta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1 text-[10px] font-medium ${meta.color} hover:underline`}
                >
                  {meta.icon} {meta.label} <ExternalLink size={8} />
                </a>
              ))}
            </div>
          </div>
        )}

        {!results && !isSearching && !error && (
          <div className="rounded-[24px] bg-white p-12 text-center shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <Database size={28} className="text-indigo-500" />
            </div>
            <h3 className="mb-2 text-base font-bold text-[#0A1128]">{config.emptyTitle}</h3>
            <p className="mx-auto mb-4 max-w-md text-xs leading-relaxed text-gray-500">
              {config.emptyDescription}
            </p>
            <button
              onClick={() => {
                setQuery(config.ctaFormula);
                handleSearch(config.ctaFormula);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#0A1128] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#162044]"
            >
              Try {config.ctaFormula} <ArrowRight size={14} />
            </button>
          </div>
        )}

        {isSearching && (
          <div className="rounded-[24px] bg-white p-12 text-center shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <Loader2 size={32} className="mx-auto mb-4 animate-spin text-indigo-500" />
            <p className="text-sm font-bold text-[#0A1128]">Searching 3 databases...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleMaterialsExplorer;
