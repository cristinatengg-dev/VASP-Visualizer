const HARD_SCIENTIFIC_CONSTRAINTS = `
ABSOLUTE HARD SCIENTIFIC CONSTRAINTS — NON-NEGOTIABLE:
- The generated image must contain zero text, zero labels, zero numbers, and zero arrows.
- Molecules must preserve exact atom counts, bond topology, and chemically valid geometry.
- Use standard CPK color logic wherever species are explicitly rendered.
- Keep the image publication-grade, full-bleed, and focused on the scientific subject only.
`.trim();

const JOURNAL_PRESETS = {
  Nature: {
    name: 'Nature',
    widthPx: 4800,
    heightPx: 6400,
    aspectRatio: '3:4',
    style: 'dramatic, editorial, high-contrast, symbolic scientific visualization',
  },
  'Nature Catalysis': {
    name: 'Nature Catalysis',
    widthPx: 4800,
    heightPx: 6400,
    aspectRatio: '3:4',
    style: 'mechanism-focused catalysis visualization with active-site emphasis',
  },
  'Nature Materials': {
    name: 'Nature Materials',
    widthPx: 4800,
    heightPx: 6400,
    aspectRatio: '3:4',
    style: 'materials-texture forward, nanoscale structure, futuristic scientific rendering',
  },
  JACS: {
    name: 'JACS',
    widthPx: 4800,
    heightPx: 4800,
    aspectRatio: '1:1',
    style: 'clean molecular visualization, ACS-style, precise chemistry, crisp composition',
  },
  'Angewandte Chemie': {
    name: 'Angewandte Chemie',
    widthPx: 4500,
    heightPx: 6000,
    aspectRatio: '3:4',
    style: 'elegant chemistry cover aesthetic, mechanism clarity, refined composition',
  },
  'ACS Catalysis': {
    name: 'ACS Catalysis',
    widthPx: 4800,
    heightPx: 6400,
    aspectRatio: '3:4',
    style: 'catalytic cycle emphasis, reaction selectivity, clean catalytic visual narrative',
  },
  'Advanced Materials': {
    name: 'Advanced Materials',
    widthPx: 4800,
    heightPx: 6400,
    aspectRatio: '3:4',
    style: 'futuristic materials science, device-scale drama, nanoscale engineering precision',
  },
  Custom: {
    name: 'Custom',
    widthPx: 4800,
    heightPx: 6400,
    aspectRatio: 'Custom',
    style: 'custom scientific visualization',
  },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeScience(science) {
  return {
    domain: science?.domain || 'Chemistry',
    subdomain: science?.subdomain || 'Scientific Visualization',
    core_theme: science?.core_theme || 'scientific discovery',
    central_object: science?.central_object || 'scientific focal object',
    support_or_substrate: science?.support_or_substrate || null,
    active_site: science?.active_site || null,
    environment: science?.environment || 'scientific environment',
    scale_level: science?.scale_level || 'nanoscale',
    key_mechanism: science?.key_mechanism || 'key scientific mechanism',
    visual_keywords: asArray(science?.visual_keywords),
    must_show_elements: asArray(science?.must_show_elements),
    forbidden_elements: asArray(science?.forbidden_elements),
    reactants: asArray(science?.reactants),
    intermediates: asArray(science?.intermediates),
    products: asArray(science?.products),
  };
}

function getJournalPreset(name) {
  const normalized = String(name || '').trim();
  return JOURNAL_PRESETS[normalized] || JOURNAL_PRESETS.Nature;
}

function buildOutputConstraints(journalConfig, options) {
  const aspectRatio = String(options.aspectRatio || journalConfig.aspectRatio || '3:4').trim();
  if (aspectRatio === 'Custom') {
    const width = Number(options.customWidth || journalConfig.widthPx || 4800);
    const height = Number(options.customHeight || journalConfig.heightPx || 6400);
    return `Target output: ${width} x ${height} pixels, 600 DPI publication-grade quality, full-bleed scientific cover image.`;
  }

  return `Target output: ${journalConfig.widthPx} x ${journalConfig.heightPx} pixels, aspect ratio ${aspectRatio}, 600 DPI publication-grade quality, full-bleed scientific cover image.`;
}

function formatSpecies(species) {
  const formula = String(species?.formula_en || '').trim() || 'unknown species';
  const geometry = String(species?.geometry_hint || '').trim() || 'scientifically plausible geometry';
  const topology = String(species?.bond_topology || '').trim() || 'correct bond topology';
  return `${formula} (${geometry}; bonds: ${topology})`;
}

function collectRequiredSpecies(science) {
  return [
    ...asArray(science.reactants),
    ...asArray(science.intermediates),
    ...asArray(science.products),
  ].map((species) => ({
    formula_en: species.formula_en,
    atoms: asArray(species.atoms),
    bond_topology: species.bond_topology,
    geometry_hint: species.geometry_hint,
    color_rule: species.color_rule || {},
    role: species.role,
    priority: species.priority,
  }));
}

function joinOrFallback(items, fallback) {
  const safe = asArray(items).map((item) => String(item || '').trim()).filter(Boolean);
  return safe.length > 0 ? safe.join(', ') : fallback;
}

function compileRenderingPrompt({ science: rawScience, options = {} }) {
  const science = normalizeScience(rawScience);
  const journalConfig = getJournalPreset(options.journal);
  const requiredSpecies = collectRequiredSpecies(science);
  const strictNoText = options.strictNoText !== false;
  const strictChemistry = options.strictChemistry !== false;
  const visualMetaphor = String(options.visualMetaphor || '').trim();
  const compositionType = String(options.compositionType || '').trim() || 'center-weighted cover composition';
  const styleNotes = String(options.styleNotes || '').trim();
  const backgroundStyle = String(options.backgroundStyle || '').trim();
  const additionalInstructions = String(options.additionalInstructions || '').trim();

  const sections = [
    `[SCIENTIFIC COVER PROMPT — RUNTIME COMPILED]`,
    ``,
    `[JOURNAL TARGET]`,
    `Journal target: ${journalConfig.name}. House style: ${journalConfig.style}.`,
    ``,
    `[MAIN SCIENCE]`,
    `Core theme: ${science.core_theme}. Domain: ${science.domain}. Subdomain: ${science.subdomain}.`,
    ``,
    `[PRIMARY SUBJECT]`,
    `Primary subject: ${science.central_object}. Support/substrate: ${science.support_or_substrate || 'none specified'}. Active site: ${science.active_site || 'none specified'}.`,
    ``,
    `[MECHANISM AND ENVIRONMENT]`,
    `Environment: ${science.environment}. Scale: ${science.scale_level}. Mechanism: ${science.key_mechanism}.`,
    ``,
    `[VISUAL PLAN]`,
    `Composition: ${compositionType}. Visual metaphor: ${visualMetaphor || 'scientifically grounded, visually striking cover composition'}.`,
    ``,
    `[MANDATORY ELEMENTS]`,
    `Must show: ${joinOrFallback(science.must_show_elements, 'core scientific entities only')}. Visual keywords: ${joinOrFallback(science.visual_keywords, 'scientific precision, depth, clarity')}.`,
    ``,
    `[CHEMICAL SPECIES]`,
    requiredSpecies.length > 0
      ? `The following species must be represented accurately: ${requiredSpecies.map(formatSpecies).join('; ')}.`
      : `No explicit molecular species list is required, but preserve scientific plausibility.`,
    ``,
    `[SCIENTIFIC CONSTRAINTS]`,
    strictChemistry
      ? `Strict chemistry mode is ON. Keep atom counts, connectivity, bond orders, and molecular geometry correct. Forbidden elements: ${joinOrFallback(science.forbidden_elements, 'none specified')}.`
      : `Chemistry accuracy should remain plausible and consistent. Forbidden elements: ${joinOrFallback(science.forbidden_elements, 'none specified')}.`,
    ``,
    `[TEXT AND CLUTTER CONTROL]`,
    strictNoText
      ? `Strict zero-text mode is ON. Render absolutely no labels, captions, formulas, arrows, symbols, or typography.`
      : `Prefer a clean text-free image with minimal clutter and no explanatory labels.`,
    ``,
    `[STYLE AND LIGHTING]`,
    `Lighting and material mood: ${styleNotes || journalConfig.style}. Background treatment: ${backgroundStyle || 'clean atmospheric scientific backdrop with depth and restraint'}.`,
    ``,
    `[OUTPUT CONSTRAINTS]`,
    buildOutputConstraints(journalConfig, options),
    additionalInstructions ? `\n[ADDITIONAL INSTRUCTIONS]\n${additionalInstructions}` : '',
    ``,
    `[HARD CONSTRAINTS]`,
    HARD_SCIENTIFIC_CONSTRAINTS,
  ].filter(Boolean);

  const fullPrompt = sections.join('\n');

  return {
    journal: journalConfig.name,
    aspectRatio: String(options.aspectRatio || journalConfig.aspectRatio || '3:4').trim(),
    strictNoText,
    strictChemistry,
    requiredSpecies,
    outputConstraints: buildOutputConstraints(journalConfig, options),
    fullPrompt,
    metadata: {
      compositionType,
      visualMetaphor: visualMetaphor || null,
      styleNotes: styleNotes || null,
      backgroundStyle: backgroundStyle || null,
      requiredSpeciesCount: requiredSpecies.length,
    },
  };
}

module.exports = {
  HARD_SCIENTIFIC_CONSTRAINTS,
  JOURNAL_PRESETS,
  collectRequiredSpecies,
  compileRenderingPrompt,
};
