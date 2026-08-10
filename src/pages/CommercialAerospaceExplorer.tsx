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
type EvidenceFilter = '全部成熟度' | AerospaceEvidence;

const EVIDENCE_ORDER: AerospaceEvidence[] = ['在役/遗产', '工程成熟', '试验验证', '研发候选'];
const TEMPERATURE_FILTERS = [0, 200, 700, 1200, 1800];

const familyTone: Record<AerospaceMaterialFamily, string> = {
  轻质结构: 'bg-slate-100 text-slate-700 border-slate-200',
  高温合金: 'bg-orange-50 text-orange-700 border-orange-200',
  推进与换热: 'bg-amber-50 text-amber-700 border-amber-200',
  热防护: 'bg-red-50 text-red-700 border-red-200',
  陶瓷与涂层: 'bg-stone-100 text-stone-700 border-stone-200',
  润滑与聚合物: 'bg-blue-50 text-blue-700 border-blue-200',
  光机与热控: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  电子封装: 'bg-violet-50 text-violet-700 border-violet-200',
};

const evidenceTone: Record<AerospaceEvidence, string> = {
  '在役/遗产': 'bg-[#0A1128] text-white border-[#0A1128]',
  工程成熟: 'bg-gray-100 text-gray-700 border-gray-200',
  试验验证: 'bg-white text-gray-600 border-gray-300',
  研发候选: 'bg-[#F5F5F0] text-gray-500 border-gray-200',
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
          <ThermometerSun size={12} /> 工程预选温度
        </div>
        <p className="mt-1 font-mono text-sm font-bold text-[#0A1128]">{material.maxServiceTempC.toLocaleString()} °C</p>
      </div>
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
          <Gauge size={12} /> 密度/形态
        </div>
        <p className="mt-1 truncate font-mono text-xs font-bold text-[#0A1128]" title={material.density}>{material.density}</p>
      </div>
    </div>

    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">适用部位</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {material.applications.slice(0, 3).map((item) => (
          <span key={item} className="rounded-[32px] border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-600">{item}</span>
        ))}
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600"><CheckCircle2 size={12} /> 为什么入选</p>
        <p className="mt-1.5 line-clamp-3 text-[10px] leading-5 text-gray-500">{material.advantages.join(' · ')}</p>
      </div>
      <div className="rounded-[16px] border border-gray-100 bg-gray-50 p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600"><TriangleAlert size={12} /> 关键风险</p>
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
        <Workflow size={13} /> 启动选材分析
      </button>
      {material.searchFormula ? (
        <button
          type="button"
          onClick={() => onStructureSearch(material)}
          disabled={structureLoading}
          className="flex h-9 items-center gap-1.5 rounded-[32px] border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 transition hover:border-gray-300 disabled:opacity-50"
        >
          {structureLoading ? <Loader2 size={13} className="animate-spin" /> : <Atom size={13} />}
          晶体
        </button>
      ) : (
        <a
          href={material.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center gap-1.5 rounded-[32px] border border-gray-200 bg-white px-3 text-[11px] font-semibold text-gray-600 transition hover:border-gray-300"
        >
          证据 <ExternalLink size={12} />
        </a>
      )}
    </div>
  </motion.article>
);

const CommercialAerospaceExplorer: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<LibraryView>('catalog');
  const [search, setSearch] = useState('');
  const [mission, setMission] = useState<AerospaceMission | '全部任务'>('全部任务');
  const [family, setFamily] = useState<AerospaceMaterialFamily | '全部材料族'>('全部材料族');
  const [evidence, setEvidence] = useState<EvidenceFilter>('全部成熟度');
  const [minTemperature, setMinTemperature] = useState(0);
  const [structureMaterial, setStructureMaterial] = useState<CommercialAerospaceMaterial | null>(null);
  const [structureResults, setStructureResults] = useState<StructureEntry[]>([]);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);

  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return COMMERCIAL_AEROSPACE_MATERIALS.filter((item) => {
      if (mission !== '全部任务' && !item.missions.includes(mission)) return false;
      if (family !== '全部材料族' && item.family !== family) return false;
      if (evidence !== '全部成熟度' && item.evidence !== evidence) return false;
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
    setMission('全部任务');
    setFamily('全部材料族');
    setEvidence('全部成熟度');
    setMinTemperature(0);
  };

  const launchAnalysis = (material: CommercialAerospaceMaterial) => {
    const prompt = [
      `为商业航天任务评估 ${material.name}（${material.designation}）。`,
      `候选部位：${material.applications.join('、')}。`,
      `请按任务环境、温度载荷、真空放气、辐照/原子氧、疲劳/蠕变、制造与供应链、验证试验矩阵给出证据化选材报告，并与同材料族的两个替代方案比较。`,
      `不要把库中的 ${material.maxServiceTempC}°C 工程预选值直接当作设计许用值。`,
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
      if (!response.ok || !payload.success) throw new Error(payload.error || '结构检索失败');
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
      prompt: `为商业航天工况构建 ${entry.formula}（${entry.space_group || entry.crystal_system}）模型，并准备表面、缺陷或高温计算。`,
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
              aria-label="返回资料库"
            >
              <ArrowLeft size={17} />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Commercial Space Intelligence</p>
              <h1 className="mt-1 text-xl font-bold text-[#0A1128]">商业航天材料库</h1>
            </div>
          </div>
          <div className="flex rounded-[32px] border border-gray-200 bg-white p-1">
            <button type="button" onClick={() => setView('catalog')} className={cx('rounded-[32px] px-4 py-2 text-xs font-semibold transition', view === 'catalog' ? 'bg-[#0A1128] text-white' : 'text-gray-500 hover:bg-gray-50')}>候选材料</button>
            <button type="button" onClick={() => setView('sources')} className={cx('rounded-[32px] px-4 py-2 text-xs font-semibold transition', view === 'sources' ? 'bg-[#0A1128] text-white' : 'text-gray-500 hover:bg-gray-50')}>官方数据源</button>
          </div>
        </header>

        <section className="mb-5 overflow-hidden rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
          <div className="grid lg:grid-cols-[1.35fr_0.65fr]">
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-[32px] border border-gray-200 bg-[#F5F5F0] px-3 py-1 text-[10px] font-bold text-gray-600">工程预选库</span>
                <span className="rounded-[32px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold text-gray-500">实时晶体检索</span>
                <span className="rounded-[32px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold text-gray-500">资格验证路径</span>
              </div>
              <h2 className="mt-5 max-w-3xl text-xl font-bold leading-8 text-[#0A1128]">从“材料名字”推进到任务工况、风险项与验证矩阵。</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-500">
                覆盖运载、卫星、液体发动机、再入与深空场景。库中温度和成熟度用于早期筛选，不替代牌号、批次、厚度、工艺和载荷条件下的设计许用值。
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
                  [COMMERCIAL_AEROSPACE_MATERIALS.length, '候选材料'],
                  [AEROSPACE_FAMILIES.length, '材料族'],
                  [AEROSPACE_OFFICIAL_SOURCES.length, '官方入口'],
                  [AEROSPACE_MISSIONS.length, '任务场景'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-[16px] border border-white/15 p-3">
                    <p className="font-mono text-xl font-bold">{value}</p>
                    <p className="mt-1 text-[10px] text-white/55">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-[16px] border border-white/15 p-3 text-[11px] leading-5 text-white/65">
                <ShieldCheck size={14} className="mb-2 text-white" />
                所有候选都附带关键风险、建议验证项与官方证据入口，避免把单一物性值误当成飞行资格。
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
                  <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="牌号、成分、部位…" />
                </label>
                <select value={mission} onChange={(event) => setMission(event.target.value as AerospaceMission | '全部任务')} className="h-11 rounded-[24px] border border-gray-200 bg-gray-50 px-4 text-xs font-semibold text-gray-600 outline-none">
                  <option>全部任务</option>
                  {AEROSPACE_MISSIONS.map((item) => <option key={item}>{item}</option>)}
                </select>
                <select value={family} onChange={(event) => setFamily(event.target.value as AerospaceMaterialFamily | '全部材料族')} className="h-11 rounded-[24px] border border-gray-200 bg-gray-50 px-4 text-xs font-semibold text-gray-600 outline-none">
                  <option>全部材料族</option>
                  {AEROSPACE_FAMILIES.map((item) => <option key={item}>{item} · {familyCounts.get(item)}</option>)}
                </select>
                <select value={evidence} onChange={(event) => setEvidence(event.target.value as EvidenceFilter)} className="h-11 rounded-[24px] border border-gray-200 bg-gray-50 px-4 text-xs font-semibold text-gray-600 outline-none">
                  <option>全部成熟度</option>
                  {EVIDENCE_ORDER.map((item) => <option key={item}>{item}</option>)}
                </select>
                <button type="button" onClick={clearFilters} className="h-11 rounded-[32px] border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-500 transition hover:bg-gray-50">重置</button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                <span className="mr-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400"><Flame size={13} /> 最低温度窗口</span>
                {TEMPERATURE_FILTERS.map((value) => (
                  <button key={value} type="button" onClick={() => setMinTemperature(value)} className={cx('rounded-[32px] border px-3 py-1.5 text-[10px] font-semibold transition', minTemperature === value ? 'border-[#0A1128] bg-[#0A1128] text-white' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300')}>
                    {value === 0 ? '不限' : `≥ ${value}°C`}
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
                      <p className="text-sm font-bold text-[#0A1128]">{structureMaterial.name} · 晶体候选</p>
                      <p className="mt-1 text-xs text-gray-500">正在以 <span className="font-mono font-bold">{structureMaterial.searchFormula}</span> 查询已连接结构源；合金、复材和涂层体系仍需按真实成分与工艺建模。</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setStructureMaterial(null)} className="rounded-[32px] border border-gray-200 px-3 py-1.5 text-[10px] font-semibold text-gray-500">收起</button>
                </div>
                {structureLoading ? (
                  <div className="py-8 text-center"><Loader2 size={24} className="mx-auto animate-spin text-[#0A1128]" /><p className="mt-2 text-xs text-gray-500">检索 Materials Project、OQMD、AFLOW 与 OPTIMADE 源…</p></div>
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
                  <p className="mt-4 rounded-[16px] border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500">已连接数据源没有返回结构候选，请转到建模智能体按牌号、晶相和工艺手动定义。</p>
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
                <p className="mt-3 text-sm font-bold text-[#0A1128]">没有匹配的候选</p>
                <button type="button" onClick={clearFilters} className="mt-4 rounded-[32px] bg-[#0A1128] px-5 py-2 text-xs font-semibold text-white">清除筛选</button>
              </div>
            )}
          </>
        ) : (
          <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)] md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Evidence & Qualification</p>
                <h2 className="mt-2 text-lg font-bold text-[#0A1128]">官方数据与资格验证入口</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">结构数据库用于原子级候选，飞行选材仍需回到牌号、工艺、批次和环境试验。这里明确区分公开、申请和标准许可路径。</p>
              </div>
              <button type="button" onClick={() => navigate('/workspace?prompt=' + encodeURIComponent('为商业航天材料项目建立完整的 DML/工艺/机械部件清单与资格验证矩阵，覆盖放气、热真空、原子氧、辐照、疲劳、蠕变、阻燃和推进剂相容性。'))} className="flex h-10 items-center gap-2 rounded-[32px] bg-[#0A1128] px-4 text-xs font-semibold text-white"><Sparkles size={14} /> 生成验证矩阵</button>
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
                  <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-gray-600">打开官方入口 <ExternalLink size={11} className="transition group-hover:translate-x-0.5" /></div>
                </a>
              ))}
            </div>
            <div className="mt-6 rounded-[20px] border border-gray-200 bg-[#F5F5F0] p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-[#0A1128]"><ShieldCheck size={16} /> 建议资格验证主线</p>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  ['01', '任务环境', '轨道、寿命、温度、辐照、原子氧、污染预算'],
                  ['02', '材料/工艺清单', 'DML、DPL、DMPL 与受限物质检查'],
                  ['03', '试样与见证件', '批次、厚度、热处理、增材方向和连接界面'],
                  ['04', '系统级闭环', '热真空、声振、冲击、寿命与失效复盘'],
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
