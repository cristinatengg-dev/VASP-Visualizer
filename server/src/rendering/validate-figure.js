function decodeBase64(value) {
  try {
    return Buffer.from(String(value || ''), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function validateFigureOutput({ contract, renderResult }) {
  const svgText = decodeBase64(renderResult?.svgBase64);
  const panelCount = Array.isArray(contract?.panel_map) ? contract.panel_map.length : 0;
  const missingColumns = Array.isArray(renderResult?.missingColumns) ? renderResult.missingColumns : [];
  const duplicateLegendLabels = Array.isArray(renderResult?.duplicateLegendLabels)
    ? renderResult.duplicateLegendLabels
    : [];

  const checks = [
    {
      id: 'render_success',
      label: 'Render completed',
      ok: Boolean(renderResult?.renderSuccess),
      detail: renderResult?.renderSuccess ? 'Python worker produced figure assets.' : 'Worker did not finish rendering cleanly.',
    },
    {
      id: 'svg_present',
      label: 'SVG asset present',
      ok: Boolean(renderResult?.svgBase64),
      detail: renderResult?.svgBase64 ? 'SVG asset returned.' : 'SVG asset missing.',
    },
    {
      id: 'png_present',
      label: 'PNG preview present',
      ok: Boolean(renderResult?.pngBase64),
      detail: renderResult?.pngBase64 ? 'PNG preview returned.' : 'PNG preview missing.',
    },
    {
      id: 'editable_text',
      label: 'SVG keeps editable text',
      ok: /<text\b/i.test(svgText),
      detail: /<text\b/i.test(svgText) ? 'SVG contains text nodes for editable labels.' : 'SVG appears to outline text or omit labels.',
    },
    {
      id: 'panel_count',
      label: 'Panel labels match contract',
      ok: (renderResult?.panelLabelCount || 0) === panelCount,
      detail: `Expected ${panelCount} panel labels, received ${renderResult?.panelLabelCount || 0}.`,
    },
    {
      id: 'source_columns',
      label: 'All referenced columns found',
      ok: missingColumns.length === 0,
      detail: missingColumns.length === 0 ? 'All referenced columns resolved.' : `Missing columns: ${missingColumns.join(', ')}`,
    },
    {
      id: 'legend_dedup',
      label: 'Legend labels are unique',
      ok: duplicateLegendLabels.length === 0,
      detail: duplicateLegendLabels.length === 0 ? 'Legend labels look clean.' : `Duplicate legend labels: ${duplicateLegendLabels.join(', ')}`,
    },
  ];

  const warnings = [];
  if (Array.isArray(renderResult?.overflowWarnings) && renderResult.overflowWarnings.length > 0) {
    warnings.push(...renderResult.overflowWarnings);
  }
  if (Array.isArray(renderResult?.notes) && renderResult.notes.length > 0) {
    warnings.push(...renderResult.notes);
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
    warnings: Array.from(new Set(warnings)).slice(0, 12),
  };
}

module.exports = {
  validateFigureOutput,
};
