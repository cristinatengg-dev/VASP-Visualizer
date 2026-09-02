import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Atom,
  CheckCircle2,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  Layers3,
  Loader2,
  Orbit,
  Search,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import {
  AEROSPACE_FAMILIES,
  AEROSPACE_MISSIONS,
  AEROSPACE_OFFICIAL_SOURCES,
  COMMERCIAL_AEROSPACE_MATERIALS,
  type AerospaceEvidence,
  type AerospaceMaterialFamily,
  type AerospaceMission,
  type CommercialAerospaceMaterial,
} from '../data/commercialAerospaceMaterials';

interface StructureEntry {
  material_id: string;
  formula: string;
  crystal_system: string;
  space_group: string | null;
  energy_above_hull: string;
  band_gap?: string | null;
  source?: string;
  selection_reason?: string;
}

interface StructureSearchResponse {
  success: boolean;
  error?: string;
  results?: Record<string, StructureEntry[] | undefined>;
}

type LibraryView = 'catalog' | 'sources';
type EvidenceFilter = 'All maturity levels' | AerospaceEvidence;

const EVIDENCE_ORDER: AerospaceEvidence[] = ['In-Service / Legacy', 'Engineering Maturity', 'Experimental Validation', 'R&D Candidate'];
const TEMPERATURE_FILTERS = [0, 200, 700, 1200, 1800];

const familyTone: Record<AerospaceMaterialFamily, string> = {
  'Lightweight Structures': 'bg-gray-50 text-gray-600 border-gray-200',
  'High-Temperature Alloys': 'bg-gray-50 text-gray-600 border-gray-200',
  'Propulsion & Heat Transfer': 'bg-gray-50 text-gray-600 border-gray-200',
  'Thermal Protection': 'bg-gray-50 text-gray-600 border-gray-200',
  'Ceramics & Coatings': 'bg-gray-50 text-gray-600 border-gray-200',
  'Lubricants & Polymers': 'bg-gray-50 text-gray-600 border-gray-200',
  'Optomechanics & Thermal Control': 'bg-gray-50 text-gray-600 border-gray-200',
  'Electronic Packaging': 'bg-gray-50 text-gray-600 border-gray-200',
};

const evidenceTone: Record<AerospaceEvidence, string> = {
  'In-Service / Legacy': 'bg-[#0A1128] text-white border-[#0A1128]',
  'Engineering Maturity': 'bg-gray-100 text-gray-700 border-gray-200',
  'Experimental Validation': 'bg-white text-gray-600 border-gray-300',
  'R&D Candidate': 'bg-[#F5F5F0] text-gray-500 border-gray-200',
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const MaterialCard: React.FC<{
  material: CommercialAerospaceMaterial;
  onAnalyze: (material: CommercialAerospaceMaterial) => void;
  onStructureSearch: (material: CommercialAerospaceMaterial) => void;
  structureLoading: boolean;
}> = ({ material, onAnalyze, onStructureSearch, structureLoading }) => (
  <motion.article
    layout
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: 0.98 }}
    className="flex h-full flex-col rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx('rounded-[32px] border px-2 py-1 text-[9px] font-bold', familyTone[material.family])}>
            {material.family}
          </span>
          <span className={cx('rounded-[32px] border px-2 py-1 text-[9px] font-bold', evidenceTone[material.evidence])}>
            {material.evidence}
          </span>
        </div>
        <h3 className="mt-3 text-base font-bold text-[#0A1128]">{material.name}</h3>
        <p className="mt-1 font-mono text-[11px] text-gray-400">{material.designation}</p>
      </div>
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[16px] border border-gray-200 bg-[#F5F5F0]">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">TRL</span>
        <span className="font-mono text-base font-black text-[#0A1128]">{material.trl}</span>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-2">
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
          <ThermometerSun size={12} /> Engineering pre-selection temperature
        </div>
        <p className="mt-1 font-mono text-sm font-bold text-[#0A1128]">{material.maxServiceTempC.toLocaleString()} °C</p>
      </div>
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
          <Gauge size={12} /> Density / Morphology
        </div>
        <p className="mt-1 truncate font-mono text-xs font-bold text-[#0A1128]" title={material.density}>{material.density}</p>
      </div>
    </div>

    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Applicable components</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {material.applications.slice(0, 3).map((item) => (
          <span key={item} className="rounded-[32px] border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600">{item}</span>
        ))}
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600"><CheckCircle2 size={12} /> Selection rationale</p>
        <p className="mt-1.5 line-clamp-3 text-[10px] leading-5 text-gray-500">{material.advantages.join(' · ')}</p>
      </div>
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600"><TriangleAlert size={12} /> Key risks</p>
        <p className="mt-1.5 line-clamp-3 text-[10px] leading-5 text-gray-500">{material.watchouts.join(' · ')}</p>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
      {material.qualification.map((item) => (
        <span key={item} className="text-[9px] font-semibold text-gray-400">#{item}</span>
      ))}
    </div>

    <div className="mt-auto flex items-center gap-2 pt-4">
      <button
        type="button"
        onClick={() => onAnalyze(material)}
        className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[32px] bg-[#0A1128] px-3 text-[11px] font-semibold text-white transition hover:bg-[#162044]"
      >
        <Workflow size={13} /> Start material selection analysis
      </button>
      {material.searchFormula ? (
        <button
          type="button"
          onClick={() => onStructureSearch(material)}
          disabled={structureLoading}
          className="flex h-9 items-center gap-1.5 rounded-[32px] border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 transition hover:border-gray-300 disabled:opacity-50"
        >
          {structureLoading ? <Loader2 size={13} className="animate-spin" /> : <Atom size={13} />}
          Crystal
        </button>
      ) : (
        <a
          href={material.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center gap-1.5 rounded-[32px] border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 transition hover:border-gray-300"
        >
          Evidence <ExternalLink size={12} />
        </a>
      )}
    </div>
  </motion.article>
);

const CommercialAerospaceExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<LibraryView>('catalog');
  const [search, setSearch] = useState('');
  const [mission, setMission] = useState<AerospaceMission | 'All tasks'>('All tasks');
  const [family, setFamily] = useState<AerospaceMaterialFamily | 'All material families'>('All material families');
  const [evidence, setEvidence] = useState<EvidenceFilter>('All maturity levels');
  const [minTemperature, setMinTemperature] = useState(0);
  const [structureMaterial, setStructureMaterial] = useState<CommercialAerospaceMaterial | null>(null);
  const [structureResults, setStructureResults] = useState<StructureEntry[]>([]);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return COMMERCIAL_AEROSPACE_MATERIALS.filter((item) => {
      if (mission !== 'All tasks' && !item.missions.includes(mission)) return false;
      if (family !== 'All material families' && item.family !== family) return false;
      if (evidence !== 'All maturity levels' && item.evidence !== evidence) return false;
      if (item.maxServiceTempC < minTemperature) return false;
      if (!query) return true;
      return [item.name, item.designation, item.composition, item.family, ...item.applications, ...item.missions]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [evidence, family, minTemperature, mission, search]);

  const familyCounts = useMemo(() => new Map(
    AEROSPACE_FAMILIES.map((item) => [item, COMMERCIAL_AEROSPACE_MATERIALS.filter((material) => material.family === item).length]),
  ), []);

  const clearFilters = () => {
    setSearch('');
    setMission('All tasks');
    setFamily('All material families');
    setEvidence('All maturity levels');
    setMinTemperature(0);
  };

  const launchAnalysis = (material: CommercialAerospaceMaterial) => {
    const prompt = [
      `Evaluation for commercial space missions ${material.name}（${material.designation}）。`,
      `Candidate components:${material.applications.join('、')}。`,
      `Please provide an evidence-based material selection report covering mission environment, thermal load, vacuum outgassing, radiation/atomic oxygen, fatigue/creep, manufacturing and supply chain, and qualification test matrix, comparing against two alternatives from the same material family.`,
      `Do not directly treat the ${material.maxServiceTempC}°C engineering pre-selected values in the library as design allowables.`,
    ].join('');
    navigate(`/workspace?prompt=${encodeURIComponent(prompt)}`);
  };

  const searchStructures = async (material: CommercialAerospaceMaterial) => {
    if (!material.searchFormula || structureLoading) return;
    setStructureMaterial(material);
    setStructureLoading(true);
    setStructureError(null);
    setStructureResults([]);
    try {
      const params = new URLSearchParams({ formula: material.searchFormula, library: 'aerospace' });
      const response = await fetch(`${API_BASE_URL}/materials/search?${params.toString()}`);
      const payload = await response.json() as StructureSearchResponse;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Structure retrieval failed');
      const entries = Object.values(payload.results || {}).flatMap((items) => items || []);
      const unique = Array.from(new Map(entries.map((item) => [`${item.source || ''}-${item.material_id}`, item])).values());
      setStructureResults(unique.slice(0, 12));
    } catch (error) {
      setStructureError(error instanceof Error ? error.message : String(error));
    } finally {
      setStructureLoading(false);
    }
  };

  const openModeling = (entry: StructureEntry) => {
    const params = new URLSearchParams({
      material: entry.formula,
      phase: entry.space_group || entry.crystal_system,
      prompt: `Build a ( ${entry.formula}（${entry.space_group || entry.crystal_system}) model for commercial space operating conditions, and prepare surface, defect, or high-temperature compute.`,
    });
    if (entry.material_id?.startsWith('mp-')) params.set('mpid', entry.material_id);
    navigate(`/agent/modeling?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] px-4 py-7 text-gray-800">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/materials')}
              className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300"
              aria-label="Back to Library"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Commercial Space Intelligence</p>
              <h1 className="mt-1 text-xl font-bold text-[#0A1128]">Commercial Space Materials Library</h1>
            </div>
          </div>
          <div className="flex rounded-[32px] border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => setView('catalog')} className={cx('rounded-[32px] px-4 py-2 text-xs font-semibold transition', view === 'catalog' ? 'bg-[#0A1128] text-white' : 'text-gray-500 hover:bg-gray-50')}>Candidate materials</button>
            <button type="button" onClick={() => setView('sources')} className={cx('rounded-[32px] px-4 py-2 text-xs font-semibold transition', view === 'sources' ? 'bg-[#0A1128] text-white' : 'text-gray-500 hover:bg-gray-50')}>Official data source</button>
          </div>
        </header>

        <section className="mb-5 overflow-hidden rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
          <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-[32px] border border-gray-200 bg-[#F5F5F0] px-3 py-1 text-[10px] font-bold text-gray-600">Engineering pre-selection library</span>
                <span className="rounded-[32px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold text-gray-500">Real-time crystal retrieval</span>
                <span className="rounded-[32px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold text-gray-500">Qualification verification path</span>
              </div>
              <h2 className="mt-5 max-w-3xl text-xl font-bold leading-8 text-[#0A1128]">Advance from "Material Name" to mission conditions, risk items, and verification matrix.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-500">
                Covering launch vehicles, satellites, liquid engines, re-entry, and deep space scenarios. Temperatures and maturity levels in the library are for early screening and do not replace design allowables under specific grade, batch, thickness, process, and load conditions.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {AEROSPACE_MISSIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { setView('catalog'); setMission(item); }}
                    className={cx('rounded-[32px] border px-3 py-1.5 text-[11px] font-semibold transition', mission === item ? 'border-[#0A1128] bg-[#0A1128] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300')}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-gray-100 bg-[#0A1128] p-6 text-white lg:border-l lg:border-t-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50"><Orbit size={14} /> Coverage</div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  [COMMERCIAL_AEROSPACE_MATERIALS.length, 'Candidate materials'],
                  [AEROSPACE_FAMILIES.length, 'Material family'],
                  [AEROSPACE_OFFICIAL_SOURCES.length, 'Official portal'],
                  [AEROSPACE_MISSIONS.length, 'Mission scenario'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-[16px] border border-white/15 p-3">
                    <p className="font-mono text-xl font-bold">{value}</p>
                    <p className="mt-1 text-[10px] text-white/55">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[16px] border border-white/15 p-3 text-[11px] leading-5 text-white/65">
                <ShieldCheck size={14} className="mb-2 text-white" />
                All candidates include key risks, recommended verification items, and official evidence portals to avoid mistaking a single physical property value for flight qualification.
              </div>
            </div>
          </div>
        </section>

        {view === 'catalog' ? (
          <>
            <section className="mb-5 rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                <label className="flex h-11 items-center gap-2 rounded-[24px] border border-gray-200 bg-gray-50 px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0A1128]/10">
                  <Search size={15} className="text-gray-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Grade, composition, component..." />
                </label>
                <select value={mission} onChange={(event) => setMission(event.target.value as AerospaceMission | 'All tasks')} className="h-11 rounded-[24px] border border-gray-200 bg-gray-50 px-4 text-xs font-semibold text-gray-600 outline-none">
                  <option>All tasks</option>
                  {AEROSPACE_MISSIONS.map((item) => <option key={item}>{item}</option>)}
                </select>
                <select value={family} onChange={(event) => setFamily(event.target.value as AerospaceMaterialFamily | 'All material families')} className="h-11 rounded-[24px] border border-gray-200 bg-gray-50 px-4 text-xs font-semibold text-gray-600 outline-none">
                  <option>All material families</option>
                  {AEROSPACE_FAMILIES.map((item) => <option key={item}>{item} · {familyCounts.get(item)}</option>)}
                </select>
                <select value={evidence} onChange={(event) => setEvidence(event.target.value as EvidenceFilter)} className="h-11 rounded-[24px] border border-gray-200 bg-gray-50 px-4 text-xs font-semibold text-gray-600 outline-none">
                  <option>All maturity levels</option>
                  {EVIDENCE_ORDER.map((item) => <option key={item}>{item}</option>)}
                </select>
                <button type="button" onClick={clearFilters} className="h-11 rounded-[32px] border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-500 transition hover:bg-gray-50">Reset</button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <span className="mr-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400"><Flame size={13} /> Minimum temperature window</span>
                {TEMPERATURE_FILTERS.map((value) => (
                  <button key={value} type="button" onClick={() => setMinTemperature(value)} className={cx('rounded-[32px] border px-3 py-1.5 text-[10px] font-semibold transition', minTemperature === value ? 'border-[#0A1128] bg-[#0A1128] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300')}>
                    {value === 0 ? 'Unrestricted' : `≥ ${value}°C`}
                  </button>
                ))}
                <span className="ml-auto font-mono text-[11px] text-gray-400">{filteredMaterials.length} / {COMMERCIAL_AEROSPACE_MATERIALS.length}</span>
              </div>
            </section>

            {structureMaterial && (
              <section className="mb-5 rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#0A1128] text-white"><Atom size={18} /></span>
                    <div>
                      <p className="text-sm font-bold text-[#0A1128]">{structureMaterial.name} · Crystal candidates</p>
                      <p className="mt-1 text-xs text-gray-500">Querying with <span className="font-mono font-bold">{structureMaterial.searchFormula}</span> connected structure sources; alloy, composite, and coating systems still require modeling based on real composition and process.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setStructureMaterial(null)} className="rounded-[32px] border border-gray-200 px-3 py-1.5 text-[10px] font-semibold text-gray-500">Collapse</button>
                </div>
                {structureLoading ? (
                  <div className="py-8 text-center"><Loader2 size={24} className="mx-auto animate-spin text-[#0A1128]" /><p className="mt-2 text-xs text-gray-500">Searching Materials Project, OQMD, AFLOW, and OPTIMADE sources...</p></div>
                ) : structureError ? (
                  <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 p-3 text-xs text-red-600">{structureError}</div>
                ) : structureResults.length ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {structureResults.map((entry) => (
                      <button key={`${entry.source}-${entry.material_id}`} type="button" onClick={() => openModeling(entry)} className="group rounded-[16px] border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-gray-300 hover:bg-white">
                        <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-bold text-[#0A1128]">{entry.formula}</span><ArrowRight size={13} className="text-gray-400 group-hover:text-[#0A1128]" /></div>
                        <p className="mt-1 truncate font-mono text-[10px] text-gray-400">{entry.material_id} · {entry.source || 'structure DB'}</p>
                        <p className="mt-2 text-[11px] text-gray-600">{entry.space_group || entry.crystal_system} · E<sub>hull</sub> {entry.energy_above_hull}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 rounded-[16px] border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500">Connected data sources returned no structure candidates; please navigate to Modeling Agent to manually define by grade, crystal phase, and process.</p>
                )}
              </section>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence>
                {filteredMaterials.map((material) => (
                  <MaterialCard key={material.id} material={material} onAnalyze={launchAnalysis} onStructureSearch={searchStructures} structureLoading={structureLoading && structureMaterial?.id === material.id} />
                ))}
              </AnimatePresence>
            </div>
            {!filteredMaterials.length && (
              <div className="rounded-[24px] border border-gray-100 bg-white p-12 text-center shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
                <Layers3 size={32} className="mx-auto text-gray-300" />
                <p className="mt-3 text-sm font-bold text-[#0A1128]">No matching candidates</p>
                <button type="button" onClick={clearFilters} className="mt-4 rounded-[32px] bg-[#0A1128] px-5 py-2 text-xs font-semibold text-white">Clear Filter</button>
              </div>
            )}
          </>
        ) : (
          <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Evidence & Qualification</p>
                <h2 className="mt-2 text-lg font-bold text-[#0A1128]">Official Data &amp; Qualification Entry</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">Structural databases are used for atomic-level candidates, while flight material selection still relies on grades, processes, batches, and environmental testing. Public, application-based, and standard licensing pathways are explicitly distinguished here.</p>
              </div>
              <button type="button" onClick={() => navigate('/workspace?prompt=' + encodeURIComponent('Build a complete DML/process/mechanical part list and qualification matrix for commercial aerospace material projects, covering outgassing, thermal vacuum, atomic oxygen, radiation, fatigue, creep, flame retardancy, and propellant compatibility.'))} className="flex h-10 items-center gap-2 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white"><Sparkles size={14} /> Generate Qualification Matrix</button>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {AEROSPACE_OFFICIAL_SOURCES.map((source) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="group rounded-[20px] border border-gray-200 bg-gray-50 p-5 transition hover:border-gray-300 hover:bg-white hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#0A1128] text-white"><Database size={17} /></span>
                    <span className="rounded-[32px] border border-gray-200 bg-white px-2 py-1 text-[9px] font-bold text-gray-500">{source.access}</span>
                  </div>
                  <p className="mt-4 text-sm font-bold text-[#0A1128]">{source.name}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">{source.organization}</p>
                  <p className="mt-3 min-h-[60px] text-xs leading-5 text-gray-500">{source.coverage}</p>
                  <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-gray-600">Open Official Portal <ExternalLink size={11} className="transition group-hover:translate-x-0.5" /></div>
                </a>
              ))}
            </div>
            <div className="mt-6 rounded-[20px] border border-gray-200 bg-[#F5F5F0] p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-[#0A1128]"><ShieldCheck size={16} /> Recommended Qualification Mainline</p>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  ['01', 'Mission Environment', 'Orbit, lifespan, temperature, radiation, atomic oxygen, contamination budget'],
                  ['02', 'Material/Process List', 'DML, DPL, DMPL, and restricted substance check'],
                  ['03', 'Specimens & Witness Coupons', 'Batch, thickness, heat treatment, additive direction, and joining interfaces'],
                  ['04', 'System-Level Closed Loop', 'Thermal vacuum, acoustic/vibration, shock, lifespan, and failure review'],
                ].map(([index, title, detail]) => (
                  <div key={index} className="rounded-[16px] border border-gray-200 bg-white p-4"><span className="font-mono text-[10px] font-bold text-gray-400">{index}</span><p className="mt-2 text-xs font-bold text-[#0A1128]">{title}</p><p className="mt-2 text-[10px] leading-5 text-gray-500">{detail}</p></div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default CommercialAerospaceExplorer;
