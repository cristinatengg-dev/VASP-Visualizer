import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Download,
  FileChartColumnIncreasing,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  compileFigureContract,
  generateFigure,
  profileFigureData,
} from './figurePipeline';
import type {
  FigureBriefInput,
  FigureChartType,
  FigureColumnHints,
  FigureContract,
  FigureDataProfile,
  FigureExportOptions,
  FigureRenderResult,
  FigureStatisticalRules,
  JournalPreset,
} from './types';
import { JOURNAL_PRESETS } from './constants';

const CHART_TYPES: Array<{ id: FigureChartType; label: string; description: string }> = [
  { id: 'grouped_bar', label: 'Grouped Bar', description: 'Best for condition/group comparisons.' },
  { id: 'line', label: 'Line + Error Band', description: 'Best for trends, time-series, and dose curves.' },
  { id: 'scatter', label: 'Scatter', description: 'Best for correlation and parity plots.' },
  { id: 'heatmap', label: 'Heatmap', description: 'Best for matrix-like categorical comparisons.' },
  { id: 'multi_panel', label: '2×2 Multi-Panel', description: 'Best for compact figure sets driven by one dataset.' },
];

const DEFAULT_BRIEF: FigureBriefInput = {
  narrative: '',
  captionDraft: '',
  targetJournal: 'Nature Catalysis',
  multiPanel: false,
};

const DEFAULT_HINTS: FigureColumnHints = {
  x: '',
  y: '',
  group: '',
  secondary: '',
};

const DEFAULT_STATS: FigureStatisticalRules = {
  errorMode: 'sem',
  showSignificance: false,
  logScale: false,
  showIndividualPoints: false,
};

const DEFAULT_EXPORT: FigureExportOptions = {
  targetJournal: 'Nature Catalysis',
  widthPx: 3600,
  heightPx: 2700,
  formats: ['svg', 'png', 'script', 'json'],
  layout: 'landscape',
  palette: 'journal-default',
};

function downloadText(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

const SectionCard: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed">{subtitle}</p>
    </div>
    {children}
  </div>
);

const FigureMode: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [figureType, setFigureType] = useState<FigureChartType>('grouped_bar');
  const [profile, setProfile] = useState<FigureDataProfile | null>(null);
  const [brief, setBrief] = useState<FigureBriefInput>(DEFAULT_BRIEF);
  const [columnHints, setColumnHints] = useState<FigureColumnHints>(DEFAULT_HINTS);
  const [statsRules, setStatsRules] = useState<FigureStatisticalRules>(DEFAULT_STATS);
  const [exportOptions, setExportOptions] = useState<FigureExportOptions>(DEFAULT_EXPORT);
  const [contract, setContract] = useState<FigureContract | null>(null);
  const [renderResult, setRenderResult] = useState<FigureRenderResult | null>(null);
  const [contractMeta, setContractMeta] = useState<{ usedFallback: boolean; llmError: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<'profile' | 'contract' | 'render' | null>(null);

  useEffect(() => {
    const config = JOURNAL_PRESETS[brief.targetJournal as JournalPreset];
    setExportOptions((prev) => ({
      ...prev,
      targetJournal: brief.targetJournal,
      widthPx: prev.targetJournal === brief.targetJournal ? prev.widthPx : (brief.targetJournal === 'JACS' ? 3600 : 3600),
      heightPx: prev.targetJournal === brief.targetJournal ? prev.heightPx : (brief.targetJournal === 'JACS' ? 3600 : 2700),
      layout: brief.multiPanel ? '2x2' : (brief.targetJournal === 'JACS' ? 'square' : 'landscape'),
    }));
    if (config) {
      setExportOptions((prev) => ({
        ...prev,
        targetJournal: brief.targetJournal,
      }));
    }
  }, [brief.multiPanel, brief.targetJournal]);

  useEffect(() => {
    if (!profile) return;
    const mappingKey = figureType === 'multi_panel' ? 'grouped_bar' : figureType;
    const recommended = profile.recommendedMappings[mappingKey] || {};
    setColumnHints((prev) => ({
      x: prev.x || recommended.x || '',
      y: prev.y || recommended.y || recommended.value || '',
      group: prev.group || recommended.group || '',
      secondary: prev.secondary || (figureType === 'heatmap' ? recommended.y || '' : ''),
    }));
  }, [figureType, profile]);

  const visibleColumns = useMemo(() => profile?.columns || [], [profile]);

  const resetDownstream = () => {
    setContract(null);
    setRenderResult(null);
    setContractMeta(null);
  };

  const handleProfile = async () => {
    if (!file) {
      setError('请先上传 CSV、TSV 或 JSON 数据文件。');
      return;
    }
    setLoadingKey('profile');
    setError(null);
    try {
      const result = await profileFigureData(file);
      setProfile(result);
      setColumnHints(DEFAULT_HINTS);
      resetDownstream();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Figure data profiling failed');
    } finally {
      setLoadingKey(null);
    }
  };

  const handleCompile = async () => {
    if (!profile) {
      setError('请先完成数据 profiling。');
      return;
    }
    setLoadingKey('contract');
    setError(null);
    try {
      const result = await compileFigureContract({
        profile,
        figureBrief: brief,
        figureType,
        exportOptions,
        statisticalRules: statsRules,
        columnHints,
      });
      setContract(result.contract);
      setContractMeta({ usedFallback: result.usedFallback, llmError: result.llmError });
      setRenderResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Figure contract compilation failed');
    } finally {
      setLoadingKey(null);
    }
  };

  const handleRender = async () => {
    if (!file || !contract) {
      setError('请先准备数据文件并生成 figure contract。');
      return;
    }
    setLoadingKey('render');
    setError(null);
    try {
      const result = await generateFigure(file, contract, exportOptions);
      setRenderResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Figure rendering failed');
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[#D8E4F0] bg-[linear-gradient(135deg,#F7FBFF_0%,#EEF5FB_100%)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6C86A0]">Data Figure Agent</p>
            <h1 className="mt-1 text-2xl font-black text-[#0A1128] tracking-tight">Publication-Ready Scientific Figures</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#4C6278] leading-relaxed">
              Upload structured data, let the agent draft a conservative figure contract, then render reproducible SVG/PNG assets with a script and QA summary.
            </p>
          </div>
          <div className="rounded-[18px] border border-white/80 bg-white/70 px-4 py-3 text-right shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#6C86A0]">MVP Flow</p>
            <p className="mt-1 text-sm font-semibold text-[#0A1128]">Profile → Contract → Render</p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-[20px] border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <SectionCard
            title="A · Data Source"
            subtitle="Upload a structured table. MVP currently supports CSV, TSV, and JSON row arrays."
          >
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center justify-between rounded-[20px] border border-dashed border-gray-300 bg-gray-50 px-4 py-4 hover:border-gray-400 hover:bg-gray-100/60">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white shadow-sm">
                    <FileSpreadsheet size={18} className="text-[#0A1128]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0A1128]">{file ? file.name : 'Select data file'}</p>
                    <p className="text-[11px] text-gray-500">CSV / TSV / JSON</p>
                  </div>
                </div>
                <span className="rounded-[32px] border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-600">
                  Browse
                </span>
                <input
                  type="file"
                  accept=".csv,.tsv,.json"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] || null;
                    setFile(nextFile);
                    setProfile(null);
                    setColumnHints(DEFAULT_HINTS);
                    resetDownstream();
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleProfile}
                disabled={!file || loadingKey === 'profile'}
                className="inline-flex items-center gap-2 rounded-[32px] bg-[#0A1128] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
              >
                {loadingKey === 'profile' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Profile Data
              </button>

              {profile ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[18px] border border-gray-100 bg-white px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Rows</p>
                      <p className="mt-1 text-lg font-bold text-[#0A1128]">{profile.rowCount}</p>
                    </div>
                    <div className="rounded-[18px] border border-gray-100 bg-white px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Numeric</p>
                      <p className="mt-1 text-lg font-bold text-[#0A1128]">{profile.numericColumns.length}</p>
                    </div>
                    <div className="rounded-[18px] border border-gray-100 bg-white px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Categorical</p>
                      <p className="mt-1 text-lg font-bold text-[#0A1128]">{profile.categoricalColumns.length}</p>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-gray-100 overflow-hidden">
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Detected Columns</p>
                    </div>
                    <div className="grid gap-2 p-4 md:grid-cols-2">
                      {visibleColumns.map((column) => (
                        <div key={column.name} className="rounded-[16px] border border-gray-100 bg-white px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#0A1128] truncate">{column.name}</p>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                              {column.type}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-gray-500">
                            Missing {column.missingCount} · Unique {column.uniqueCount}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-[18px] border border-gray-100">
                    <table className="min-w-full text-left text-[11px]">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          {visibleColumns.slice(0, 6).map((column) => (
                            <th key={column.name} className="px-3 py-2 font-semibold">{column.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {profile.previewRows.slice(0, 5).map((row, rowIndex) => (
                          <tr key={rowIndex} className="border-t border-gray-100">
                            {visibleColumns.slice(0, 6).map((column) => (
                              <td key={column.name} className="px-3 py-2 text-gray-600">{row[column.name] || '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="B · Figure Brief"
            subtitle="Describe the scientific claim and give the agent enough context to draft a conservative figure contract."
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">One-line Claim</label>
                <textarea
                  value={brief.narrative}
                  onChange={(event) => setBrief((prev) => ({ ...prev, narrative: event.target.value }))}
                  rows={3}
                  placeholder="Example: The Ni-loaded support improves CO oxidation conversion relative to the undoped control."
                  className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Caption Draft</label>
                <textarea
                  value={brief.captionDraft}
                  onChange={(event) => setBrief((prev) => ({ ...prev, captionDraft: event.target.value }))}
                  rows={3}
                  placeholder="Example: Figure 3 | Catalytic conversion across temperature and composition windows."
                  className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Target Journal</label>
                  <select
                    value={brief.targetJournal}
                    onChange={(event) => setBrief((prev) => ({ ...prev, targetJournal: event.target.value as JournalPreset }))}
                    className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                  >
                    {Object.keys(JOURNAL_PRESETS).map((journal) => (
                      <option key={journal} value={journal}>{journal}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setBrief((prev) => ({ ...prev, multiPanel: !prev.multiPanel }))}
                  className={`mt-5 rounded-[18px] border px-4 py-3 text-left text-sm transition-colors ${
                    brief.multiPanel
                      ? 'border-[#0A1128] bg-[#0A1128] text-white'
                      : 'border-gray-100 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-semibold">Multi-panel Layout</p>
                  <p className={`mt-1 text-[11px] ${brief.multiPanel ? 'text-white/80' : 'text-gray-400'}`}>
                    Enable 2×2 layout planning when the dataset supports it.
                  </p>
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="C · Figure Type"
            subtitle="Choose the target chart archetype and optionally pin the columns the contract should use."
          >
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {CHART_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFigureType(item.id);
                      resetDownstream();
                    }}
                    className={`rounded-[20px] border px-4 py-4 text-left transition-colors ${
                      figureType === item.id
                        ? 'border-[#0A1128] bg-[#0A1128] text-white'
                        : 'border-gray-100 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className={`mt-1 text-[11px] leading-relaxed ${figureType === item.id ? 'text-white/80' : 'text-gray-400'}`}>
                      {item.description}
                    </p>
                  </button>
                ))}
              </div>

              {profile ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { key: 'x', label: 'X Column' },
                    { key: 'y', label: 'Y Column' },
                    { key: 'group', label: 'Group / Hue' },
                    { key: 'secondary', label: figureType === 'heatmap' ? 'Secondary Axis' : 'Secondary Column' },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">{field.label}</label>
                      <select
                        value={columnHints[field.key as keyof FigureColumnHints]}
                        onChange={(event) => {
                          const value = event.target.value;
                          setColumnHints((prev) => ({ ...prev, [field.key]: value }));
                          resetDownstream();
                        }}
                        className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                      >
                        <option value="">Auto infer</option>
                        {visibleColumns.map((column) => (
                          <option key={column.name} value={column.name}>{column.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            title="D · Style & Export"
            subtitle="Set target dimensions and export bundle. SVG and script stay enabled by default for reproducibility."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Width (px)</label>
                <input
                  type="number"
                  min={1200}
                  max={6400}
                  step={100}
                  value={exportOptions.widthPx}
                  onChange={(event) => setExportOptions((prev) => ({ ...prev, widthPx: Number(event.target.value) || prev.widthPx }))}
                  className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Height (px)</label>
                <input
                  type="number"
                  min={1200}
                  max={6400}
                  step={100}
                  value={exportOptions.heightPx}
                  onChange={(event) => setExportOptions((prev) => ({ ...prev, heightPx: Number(event.target.value) || prev.heightPx }))}
                  className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(['landscape', 'square', '2x2'] as FigureExportOptions['layout'][]).map((layout) => (
                <button
                  key={layout}
                  type="button"
                  onClick={() => setExportOptions((prev) => ({ ...prev, layout }))}
                  className={`rounded-[32px] border px-3 py-1.5 text-[11px] font-semibold ${
                    exportOptions.layout === layout
                      ? 'border-[#0A1128] bg-[#0A1128] text-white'
                      : 'border-gray-100 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {layout}
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="E · Statistical Rules"
            subtitle="Tune uncertainty rendering and whether raw observations should be visible."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">Error Bars / Band</label>
                <select
                  value={statsRules.errorMode}
                  onChange={(event) => setStatsRules((prev) => ({ ...prev, errorMode: event.target.value as FigureStatisticalRules['errorMode'] }))}
                  className="w-full rounded-[18px] border border-gray-100 px-4 py-3 text-sm text-gray-700 focus:border-gray-300 focus:outline-none"
                >
                  <option value="none">None</option>
                  <option value="std">Standard deviation</option>
                  <option value="sem">Standard error</option>
                  <option value="ci95">95% confidence interval</option>
                </select>
              </div>
              <div className="space-y-2 pt-5">
                {[
                  { key: 'showIndividualPoints', label: 'Show individual points' },
                  { key: 'logScale', label: 'Use log scale where appropriate' },
                  { key: 'showSignificance', label: 'Reserve space for significance annotation' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatsRules((prev) => ({ ...prev, [item.key]: !prev[item.key as keyof FigureStatisticalRules] }))}
                    className={`block w-full rounded-[16px] border px-4 py-2.5 text-left text-sm ${
                      statsRules[item.key as keyof FigureStatisticalRules]
                        ? 'border-[#0A1128] bg-[#0A1128] text-white'
                        : 'border-gray-100 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>

          <button
            type="button"
            onClick={handleCompile}
            disabled={!profile || loadingKey === 'contract'}
            className="inline-flex items-center gap-2 rounded-[32px] bg-[#0A1128] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
          >
            {loadingKey === 'contract' ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Generate Figure Contract
          </button>
        </div>

        <div className="space-y-6">
          <SectionCard
            title="Contract Review"
            subtitle="This is the reproducible planning artifact. Review it before the worker renders any SVG or PNG."
          >
            {contract ? (
              <div className="space-y-4">
                {contractMeta?.usedFallback ? (
                  <div className="rounded-[18px] border border-amber-100 bg-amber-50 px-4 py-3 text-[11px] text-amber-700">
                    Contract used the deterministic fallback planner.
                    {contractMeta.llmError ? ` LLM note: ${contractMeta.llmError}` : ''}
                  </div>
                ) : null}

                <div className="rounded-[18px] border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Core Claim</p>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">{contract.core_claim}</p>
                </div>
                <div className="rounded-[18px] border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Figure Archetype</p>
                  <p className="mt-1 text-sm text-gray-700">{contract.chart_archetype}</p>
                </div>
                <div className="rounded-[18px] border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Columns Used</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {contract.columns_used.map((column) => (
                      <span key={column} className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600">
                        {column}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  {contract.panel_map.map((panel) => (
                    <div key={panel.id} className="rounded-[18px] border border-gray-100 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[#0A1128]">{panel.id} · {panel.title}</p>
                          <p className="mt-1 text-[11px] text-gray-500">
                            {panel.chart_type} · x={panel.x_column || 'auto'} · y={panel.y_column || 'auto'}
                            {panel.series_column ? ` · group=${panel.series_column}` : ''}
                            {panel.secondary_column ? ` · secondary=${panel.secondary_column}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {contract.risks.length > 0 ? (
                  <div className="rounded-[18px] border border-amber-100 bg-amber-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Risks</p>
                    <div className="mt-2 space-y-2 text-[11px] text-amber-700">
                      {contract.risks.map((risk) => (
                        <p key={risk}>{risk}</p>
                      ))}
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={handleRender}
                  disabled={!file || loadingKey === 'render'}
                  className="inline-flex items-center gap-2 rounded-[32px] bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200"
                >
                  {loadingKey === 'render' ? <Loader2 size={15} className="animate-spin" /> : <FileChartColumnIncreasing size={15} />}
                  Render Figure Assets
                </button>
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Generate a figure contract to review the planned panels, columns, and export bundle here.
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Figure Output"
            subtitle="The worker returns script, SVG, PNG preview, and a QA bundle you can reuse downstream."
          >
            {renderResult ? (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-[20px] border border-gray-100 bg-white">
                  <img src={renderResult.svgDataUrl} alt="Rendered scientific figure" className="w-full bg-white" />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => downloadDataUrl('figure.svg', renderResult.svgDataUrl)}
                    className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Download size={14} /> SVG
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadDataUrl('figure.png', renderResult.pngDataUrl)}
                    className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Download size={14} /> PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText('figure.py', renderResult.figureScript, 'text/x-python')}
                    className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Code2 size={14} /> Script
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText('figure_spec.json', JSON.stringify(renderResult.figureSpec, null, 2), 'application/json')}
                    className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Download size={14} /> Spec JSON
                  </button>
                </div>

                <div className="rounded-[18px] border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={14} className="text-[#0A1128]" />
                    <p className="text-sm font-semibold text-[#0A1128]">Figure QA</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(renderResult.qaReport.validation?.checks || []).map((check) => (
                      <div key={check.id} className="rounded-[14px] border border-white bg-white px-3 py-3">
                        <div className="flex items-start gap-2">
                          {check.ok ? (
                            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                          ) : (
                            <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-[#0A1128]">{check.label}</p>
                            <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">{check.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(renderResult.qaReport.validation?.warnings || []).length ? (
                    <div className="mt-3 rounded-[14px] border border-amber-100 bg-amber-50 px-3 py-3 text-[11px] text-amber-700">
                      {(renderResult.qaReport.validation?.warnings || []).map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <details className="rounded-[18px] border border-gray-100 bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[#0A1128]">Generated Script</summary>
                  <pre className="mt-3 overflow-x-auto rounded-[16px] bg-[#0A1128] p-4 text-[11px] leading-relaxed text-[#E5EDF5]">
                    {renderResult.figureScript}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Rendered figure assets will appear here once the contract is approved and executed.
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default FigureMode;
