const DEFAULT_MODELING_PROVIDER_ORDER = [
  'materials_project',
  'atomly',
  'csd',
  'icsd',
  'optimade',
  'fallback',
];

const MODELING_PROVIDER_LABELS = {
  materials_project: 'Materials Project',
  atomly: 'Atomly',
  csd: 'CSD',
  icsd: 'ICSD',
  optimade: 'OPTIMADE',
  fallback: 'Local Fallback',
};

const MODELING_PROVIDER_ALIASES = {
  mp: 'materials_project',
  materialsproject: 'materials_project',
  materials_project: 'materials_project',
  'materials-project': 'materials_project',
  'materials project': 'materials_project',
  atomly: 'atomly',
  csd: 'csd',
  'cambridge structural database': 'csd',
  icsd: 'icsd',
  'inorganic crystal structure database': 'icsd',
  optimade: 'optimade',
  fallback: 'fallback',
  local_fallback: 'fallback',
  'local fallback': 'fallback',
};

function normalizeModelingProviderName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }
  return MODELING_PROVIDER_ALIASES[raw] || null;
}

function normalizeModelingProviderPreferences(value) {
  const rawValues = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = [];
  for (const rawValue of rawValues) {
    const provider = normalizeModelingProviderName(rawValue);
    if (provider && !normalized.includes(provider)) {
      normalized.push(provider);
    }
  }

  if (normalized.length === 0) {
    return [...DEFAULT_MODELING_PROVIDER_ORDER];
  }

  for (const provider of DEFAULT_MODELING_PROVIDER_ORDER) {
    if (!normalized.includes(provider)) {
      normalized.push(provider);
    }
  }

  return normalized;
}

function buildModelingProviderAvailability() {
  return DEFAULT_MODELING_PROVIDER_ORDER.map((provider) => {
    switch (provider) {
      case 'materials_project':
        return {
          provider,
          label: MODELING_PROVIDER_LABELS[provider],
          configured: Boolean(process.env.MP_API_KEY),
          mode: process.env.MP_API_KEY ? 'api' : 'unconfigured',
        };
      case 'atomly':
        return {
          provider,
          label: MODELING_PROVIDER_LABELS[provider],
          configured: Boolean(process.env.ATOMLY_OPTIMADE_BASE_URL || process.env.ATOMLY_CIF_DIR),
          mode: process.env.ATOMLY_OPTIMADE_BASE_URL
            ? 'optimade'
            : (process.env.ATOMLY_CIF_DIR ? 'local_cif' : 'unconfigured'),
        };
      case 'csd':
        return {
          provider,
          label: MODELING_PROVIDER_LABELS[provider],
          configured: Boolean(process.env.CSD_CIF_DIR || process.env.CSD_PYTHON_API === '1'),
          mode: process.env.CSD_CIF_DIR
            ? 'local_cif'
            : (process.env.CSD_PYTHON_API === '1' ? 'python_api' : 'optional'),
        };
      case 'icsd':
        return {
          provider,
          label: MODELING_PROVIDER_LABELS[provider],
          configured: Boolean(process.env.ICSD_OPTIMADE_BASE_URL || process.env.ICSD_CIF_DIR),
          mode: process.env.ICSD_OPTIMADE_BASE_URL
            ? 'optimade'
            : (process.env.ICSD_CIF_DIR ? 'local_cif' : 'unconfigured'),
        };
      case 'optimade':
        return {
          provider,
          label: MODELING_PROVIDER_LABELS[provider],
          configured: true,
          mode: 'public_endpoint',
        };
      case 'fallback':
      default:
        return {
          provider,
          label: MODELING_PROVIDER_LABELS[provider] || provider,
          configured: true,
          mode: 'builtin',
        };
    }
  });
}

module.exports = {
  DEFAULT_MODELING_PROVIDER_ORDER,
  MODELING_PROVIDER_LABELS,
  normalizeModelingProviderName,
  normalizeModelingProviderPreferences,
  buildModelingProviderAvailability,
};
