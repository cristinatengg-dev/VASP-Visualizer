const { geminiChat } = require('./parse-science');

const SUPPORTED_CHART_TYPES = new Set(['grouped_bar', 'line', 'scatter', 'heatmap', 'multi_panel']);

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function figureDimensionsFromJournal(journal) {
  const normalized = normalizeString(journal);
  if (normalized === 'JACS') {
    return { widthPx: 3600, heightPx: 3600, layout: 'square' };
  }
  return { widthPx: 3600, heightPx: 2700, layout: 'landscape' };
}

function chooseColumns(profile, figureType, columnHints = {}) {
  const columns = normalizeArray(profile?.columns);
  const numericColumns = columns.filter((column) => column.type === 'numeric').map((column) => column.name);
  const categoricalColumns = columns.filter((column) => column.type === 'categorical').map((column) => column.name);
  const dateColumns = columns.filter((column) => column.type === 'date').map((column) => column.name);

  const x = normalizeString(columnHints.x)
    || (figureType === 'scatter' ? (numericColumns[0] || categoricalColumns[0] || columns[0]?.name || '') : '')
    || (figureType === 'line' ? (dateColumns[0] || numericColumns[0] || categoricalColumns[0] || columns[0]?.name || '') : '')
    || (categoricalColumns[0] || dateColumns[0] || numericColumns[0] || columns[0]?.name || '');

  const y = normalizeString(columnHints.y)
    || (figureType === 'heatmap'
      ? (numericColumns[0] || '')
      : (numericColumns.find((name) => name !== x) || numericColumns[0] || ''));

  const group = normalizeString(columnHints.group)
    || (categoricalColumns.find((name) => name !== x && name !== y) || '');

  const secondary = normalizeString(columnHints.secondary)
    || (figureType === 'heatmap'
      ? (categoricalColumns.find((name) => name !== x) || '')
      : '');

  return {
    x,
    y,
    group,
    secondary,
    numericColumns,
    categoricalColumns,
  };
}

function buildFallbackFigureContract({
  profile,
  figureBrief = {},
  figureType,
  exportOptions = {},
  statisticalRules = {},
  columnHints = {},
}) {
  const normalizedType = SUPPORTED_CHART_TYPES.has(figureType) ? figureType : 'grouped_bar';
  const selected = chooseColumns(profile, normalizedType, columnHints);
  const columnsUsed = [selected.x, selected.y, selected.group, selected.secondary].filter(Boolean);
  const journal = normalizeString(exportOptions.targetJournal) || normalizeString(exportOptions.journal) || 'Nature';
  const dimensions = figureDimensionsFromJournal(journal);
  const panelCount = figureBrief.multiPanel ? Math.min(4, Math.max(1, normalizeArray(profile?.numericColumns).length || 1)) : 1;
  const yCandidates = selected.numericColumns.filter((name) => name !== selected.x);
  const panels = Array.from({ length: panelCount }).map((_, index) => {
    const panelY = index === 0 ? selected.y : (yCandidates[index] || yCandidates[0] || selected.y);
    return {
      id: String.fromCharCode(65 + index),
      title: panelCount > 1 ? `Panel ${String.fromCharCode(65 + index)} · ${panelY || 'metric'}` : (normalizeString(figureBrief.captionDraft) || 'Primary result'),
      chart_type: panelCount > 1 ? (normalizedType === 'multi_panel' ? 'grouped_bar' : normalizedType) : normalizedType,
      x_column: selected.x || null,
      y_column: panelY || null,
      series_column: selected.group || null,
      secondary_column: selected.secondary || null,
      aggregator: normalizedType === 'scatter' ? 'none' : 'mean',
      show_points: Boolean(statisticalRules.showIndividualPoints),
    };
  });

  const risks = [];
  if (!selected.x) risks.push('No x-axis column could be inferred confidently from the uploaded data.');
  if (!selected.y) risks.push('No numeric response column could be inferred confidently from the uploaded data.');
  if (normalizedType === 'heatmap' && !selected.secondary) {
    risks.push('Heatmap mode works best with two categorical axes plus one numeric value column.');
  }

  return {
    version: '0.1',
    render_kind: 'figure',
    core_claim: normalizeString(figureBrief.narrative) || `Show how ${selected.y || 'the response metric'} changes across ${selected.x || 'conditions'}.`,
    figure_title: normalizeString(figureBrief.captionDraft) || `Generated ${normalizedType.replace(/_/g, ' ')} figure`,
    chart_archetype: panelCount > 1 ? 'multi_panel' : normalizedType,
    panel_map: panels,
    columns_used: Array.from(new Set(columnsUsed)),
    grouping: {
      x: selected.x || null,
      y: selected.y || null,
      series: selected.group || null,
      secondary: selected.secondary || null,
    },
    stats_needed: {
      error_mode: normalizeString(statisticalRules.errorMode) || 'none',
      significance: Boolean(statisticalRules.showSignificance),
      log_scale: Boolean(statisticalRules.logScale),
      show_points: Boolean(statisticalRules.showIndividualPoints),
    },
    palette_policy: {
      journal,
      palette: normalizeString(exportOptions.palette) || 'journal-default',
      background: 'white',
      grid: 'soft-gray',
    },
    export_bundle: {
      journal,
      width_px: Number(exportOptions.widthPx) || dimensions.widthPx,
      height_px: Number(exportOptions.heightPx) || dimensions.heightPx,
      formats: normalizeArray(exportOptions.formats).length > 0 ? exportOptions.formats : ['svg', 'png', 'script', 'json'],
      layout: panelCount > 1 ? '2x2' : (exportOptions.layout || dimensions.layout),
    },
    risks,
  };
}

function sanitizePanel(panel, fallbackPanel, availableColumns) {
  const available = new Set(availableColumns);
  const chartType = SUPPORTED_CHART_TYPES.has(normalizeString(panel?.chart_type))
    ? normalizeString(panel.chart_type)
    : fallbackPanel.chart_type;

  const pickColumn = (value, fallback) => {
    const candidate = normalizeString(value);
    if (candidate && available.has(candidate)) return candidate;
    return fallback || null;
  };

  return {
    id: normalizeString(panel?.id) || fallbackPanel.id,
    title: normalizeString(panel?.title) || fallbackPanel.title,
    chart_type: chartType,
    x_column: pickColumn(panel?.x_column, fallbackPanel.x_column),
    y_column: pickColumn(panel?.y_column, fallbackPanel.y_column),
    series_column: pickColumn(panel?.series_column, fallbackPanel.series_column),
    secondary_column: pickColumn(panel?.secondary_column, fallbackPanel.secondary_column),
    aggregator: normalizeString(panel?.aggregator) || fallbackPanel.aggregator,
    show_points: typeof panel?.show_points === 'boolean' ? panel.show_points : fallbackPanel.show_points,
  };
}

function sanitizeFigureContract(rawContract, fallbackContract, profile) {
  const availableColumns = normalizeArray(profile?.columns).map((column) => column.name);
  const rawPanels = normalizeArray(rawContract?.panel_map);
  const fallbackPanels = normalizeArray(fallbackContract.panel_map);
  const panelMap = (rawPanels.length > 0 ? rawPanels : fallbackPanels)
    .slice(0, 4)
    .map((panel, index) => sanitizePanel(panel, fallbackPanels[index] || fallbackPanels[0], availableColumns));

  const columnsUsed = Array.from(new Set(
    normalizeArray(rawContract?.columns_used).filter((name) => availableColumns.includes(name))
      .concat(panelMap.flatMap((panel) => [panel.x_column, panel.y_column, panel.series_column, panel.secondary_column]).filter(Boolean))
  ));

  return {
    ...fallbackContract,
    version: normalizeString(rawContract?.version) || fallbackContract.version,
    core_claim: normalizeString(rawContract?.core_claim) || fallbackContract.core_claim,
    figure_title: normalizeString(rawContract?.figure_title) || fallbackContract.figure_title,
    chart_archetype: SUPPORTED_CHART_TYPES.has(normalizeString(rawContract?.chart_archetype))
      ? normalizeString(rawContract.chart_archetype)
      : fallbackContract.chart_archetype,
    panel_map: panelMap,
    columns_used: columnsUsed,
    grouping: {
      ...fallbackContract.grouping,
      ...(rawContract?.grouping && typeof rawContract.grouping === 'object' ? rawContract.grouping : {}),
    },
    stats_needed: {
      ...fallbackContract.stats_needed,
      ...(rawContract?.stats_needed && typeof rawContract.stats_needed === 'object' ? rawContract.stats_needed : {}),
    },
    palette_policy: {
      ...fallbackContract.palette_policy,
      ...(rawContract?.palette_policy && typeof rawContract.palette_policy === 'object' ? rawContract.palette_policy : {}),
    },
    export_bundle: {
      ...fallbackContract.export_bundle,
      ...(rawContract?.export_bundle && typeof rawContract.export_bundle === 'object' ? rawContract.export_bundle : {}),
    },
    risks: normalizeArray(rawContract?.risks).map((value) => normalizeString(value)).filter(Boolean).slice(0, 8),
  };
}

function buildFigureContractPrompt({ profile, fallbackContract, figureBrief, figureType, exportOptions, statisticalRules, columnHints }) {
  return [
    {
      role: 'system',
      content: `You are a scientific figure planning engine. Return ONLY valid JSON. No markdown, no code fences, no prose.
Given a profiled dataset and a figure brief, produce a figure contract that is conservative, publication-oriented, and executable.

Schema:
{
  "version": "string",
  "core_claim": "string",
  "figure_title": "string",
  "chart_archetype": "grouped_bar | line | scatter | heatmap | multi_panel",
  "panel_map": [
    {
      "id": "A | B | C | D",
      "title": "string",
      "chart_type": "grouped_bar | line | scatter | heatmap",
      "x_column": "string | null",
      "y_column": "string | null",
      "series_column": "string | null",
      "secondary_column": "string | null",
      "aggregator": "mean | median | none",
      "show_points": true
    }
  ],
  "columns_used": ["string"],
  "grouping": { "x": "string | null", "y": "string | null", "series": "string | null", "secondary": "string | null" },
  "stats_needed": { "error_mode": "none | std | sem | ci95", "significance": true, "log_scale": false, "show_points": false },
  "palette_policy": { "journal": "string", "palette": "string", "background": "white", "grid": "soft-gray" },
  "export_bundle": { "journal": "string", "width_px": 3600, "height_px": 2700, "formats": ["svg","png","script","json"], "layout": "landscape | square | 2x2" },
  "risks": ["string"]
}

Rules:
- Use only columns present in the profile.
- Prefer a single panel unless the brief explicitly needs multi-panel output.
- Never invent columns or statistical tests.
- Keep the contract conservative and directly supported by the uploaded dataset.`
    },
    {
      role: 'user',
      content: JSON.stringify({
        profile,
        figureBrief,
        requestedFigureType: figureType,
        exportOptions,
        statisticalRules,
        columnHints,
        fallbackSuggestion: fallbackContract,
      }),
    },
  ];
}

async function compileFigureContract({
  profile,
  figureBrief = {},
  figureType = 'grouped_bar',
  exportOptions = {},
  statisticalRules = {},
  columnHints = {},
}) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Figure data profile is required');
  }

  const fallbackContract = buildFallbackFigureContract({
    profile,
    figureBrief,
    figureType,
    exportOptions,
    statisticalRules,
    columnHints,
  });

  let usedFallback = true;
  let llmError = null;
  let contract = fallbackContract;

  try {
    if (process.env.GEMINI_API_KEY) {
      const content = await geminiChat(
        buildFigureContractPrompt({
          profile,
          fallbackContract,
          figureBrief,
          figureType,
          exportOptions,
          statisticalRules,
          columnHints,
        }),
        true,
        { timeoutMs: 45000, maxRetries: 2 }
      );
      const raw = JSON.parse(content);
      contract = sanitizeFigureContract(raw, fallbackContract, profile);
      usedFallback = false;
    }
  } catch (error) {
    llmError = error instanceof Error ? error.message : String(error);
    contract = fallbackContract;
    usedFallback = true;
  }

  return {
    contract,
    usedFallback,
    llmError,
  };
}

module.exports = {
  SUPPORTED_CHART_TYPES,
  buildFallbackFigureContract,
  compileFigureContract,
  sanitizeFigureContract,
};
