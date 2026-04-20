import React, { useState } from 'react';
import {
  ArrowLeft, Database, Search, Loader2, ExternalLink,
  Beaker, Atom, Zap, ChevronRight, ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../config';

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

const DB_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; url: string }> = {
  mp: {
    label: 'Materials Project',
    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',
    icon: <Database size={14} />,
    url: 'https://materialsproject.org',
  },
  oqmd: {
    label: 'OQMD',
    color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200',
    icon: <Beaker size={14} />,
    url: 'https://oqmd.org',
  },
  aflow: {
    label: 'AFLOW',
    color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200',
    icon: <Atom size={14} />,
    url: 'https://aflow.org',
  },
};

const POPULAR_FORMULAS = [
  { formula: 'LiFePO4', label: 'LFP cathode' },
  { formula: 'LiCoO2', label: 'LCO cathode' },
  { formula: 'NaCoO2', label: 'Na cathode' },
  { formula: 'LiMn2O4', label: 'Spinel cathode' },
  { formula: 'Li3PS4', label: 'Sulfide SE' },
  { formula: 'Li7La3Zr2O12', label: 'Garnet SE' },
  { formula: 'LiTiO2', label: 'Anode' },
  { formula: 'Na3V2(PO4)3', label: 'NASICON' },
];

const MaterialCard: React.FC<{
  entry: MaterialEntry;
  dbKey: string;
  onViewStructure: (entry: MaterialEntry) => void;
}> = ({ entry, dbKey, onViewStructure }) => {
  const meta = DB_META[dbKey];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-[16px] border border-gray-100 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:border-gray-200 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-base text-[#0A1128]">{entry.formula}</span>
          <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
            {meta.label}
          </span>
        </div>
        <span className="text-[10px] font-mono text-gray-400 shrink-0">{entry.material_id}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Crystal:</span>
          <span className="text-gray-700 font-medium">{entry.crystal_system}</span>
        </div>
        {entry.space_group && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">SG:</span>
            <span className="text-gray-700 font-mono">{entry.space_group}</span>
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
            <span className="text-gray-700 font-mono">{entry.formation_energy} eV/at</span>
          </div>
        )}
        {entry.band_gap && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">E<sub>g</sub>:</span>
            <span className="text-gray-700 font-mono">{entry.band_gap} eV</span>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 leading-relaxed mb-3">{entry.selection_reason}</p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onViewStructure(entry)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0A1128] text-white text-[10px] font-semibold rounded-full hover:bg-[#162044] transition-colors"
        >
          <Zap size={10} /> Send to Modeling
        </button>
        {dbKey === 'mp' && entry.material_id && (
          <a
            href={`https://materialsproject.org/materials/${entry.material_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 font-mono"
          >
            View on MP <ExternalLink size={9} />
          </a>
        )}
      </div>
    </motion.div>
  );
};

const MaterialsExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searchedFormula, setSearchedFormula] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'mp' | 'oqmd' | 'aflow'>('all');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    params.set('prompt', `Build a bulk model for ${entry.formula} (${entry.crystal_system}, ${entry.space_group || 'unknown SG'})`);
    navigate(`/agent/modeling?${params.toString()}`);
  };

  const getFilteredEntries = (): { entries: MaterialEntry[]; dbKey: string }[] => {
    if (!results) return [];
    if (activeTab === 'all') {
      return [
        ...results.mp.map(e => ({ entries: [e], dbKey: 'mp' })),
        ...results.oqmd.map(e => ({ entries: [e], dbKey: 'oqmd' })),
        ...results.aflow.map(e => ({ entries: [e], dbKey: 'aflow' })),
      ];
    }
    return (results[activeTab] || []).map(e => ({ entries: [e], dbKey: activeTab }));
  };

  const filtered = getFilteredEntries();
  const totalCount = results ? results.mp.length + results.oqmd.length + results.aflow.length : 0;

  return (
    <div className="min-h-screen bg-[#F5F5F0] px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/')} className="p-1.5 hover:bg-white rounded-full transition-colors text-gray-400">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Database size={16} className="text-indigo-600" />
            <h1 className="text-lg font-black text-[#0A1128] tracking-wide">Battery Materials Explorer</h1>
          </div>
          <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
            MP + OQMD + AFLOW
          </span>
        </div>

        {/* Search */}
        <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 p-6 mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                placeholder="Enter a chemical formula (e.g. LiFePO4, NaCoO2, Li3PS4)..."
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
                disabled={isSearching}
              />
              <button
                onClick={() => handleSearch()}
                disabled={isSearching || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>
          </div>

          {/* Quick search chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {POPULAR_FORMULAS.map((item) => (
              <button
                key={item.formula}
                onClick={() => { setQuery(item.formula); handleSearch(item.formula); }}
                disabled={isSearching}
                className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <span className="font-mono font-bold">{item.formula}</span>
                <span className="text-gray-400 ml-1">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-[16px] px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
            {/* Tab header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-black text-[#0A1128]">
                  Results for <span className="font-mono text-indigo-600">{searchedFormula}</span>
                </h2>
                <span className="text-[10px] text-gray-400 font-mono">{totalCount} entries across 3 databases</span>
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
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-full transition-all ${
                      activeTab === tab.key
                        ? 'bg-[#0A1128] text-white'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label} <span className="font-mono ml-0.5">{tab.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Entry list */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
              <AnimatePresence>
                {filtered.length === 0 && (
                  <div className="col-span-2 text-center py-12 opacity-40">
                    <Database size={40} className="text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-bold text-gray-400">No entries found</p>
                    <p className="text-xs text-gray-400 mt-1">Try a different formula</p>
                  </div>
                )}
                {filtered.map(({ entries, dbKey }, i) =>
                  entries.map((entry) => (
                    <MaterialCard
                      key={`${dbKey}-${entry.material_id}-${i}`}
                      entry={entry}
                      dbKey={dbKey}
                      onViewStructure={handleViewStructure}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Footer with DB links */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4">
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

        {/* Empty state */}
        {!results && !isSearching && !error && (
          <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 p-12 text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Database size={28} className="text-indigo-500" />
            </div>
            <h3 className="text-base font-bold text-[#0A1128] mb-2">Search Battery Materials</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed mb-4">
              Search across Materials Project, OQMD, and AFLOW simultaneously.
              Find crystal structures, formation energies, band gaps, and stability data
              for cathodes, anodes, and solid electrolytes.
            </p>
            <button
              onClick={() => { setQuery('LiFePO4'); handleSearch('LiFePO4'); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0A1128] text-white text-sm font-semibold rounded-full hover:bg-[#162044] transition-colors"
            >
              Try LiFePO4 <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Loading state */}
        {isSearching && (
          <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 p-12 text-center">
            <Loader2 size={32} className="text-indigo-500 animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-[#0A1128]">Searching 3 databases...</p>
            <p className="text-xs text-gray-400 mt-1">Materials Project + OQMD + AFLOW</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialsExplorer;
