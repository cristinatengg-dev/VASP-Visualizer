'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATASET_SOURCES = {
  ceder_solid_state_20200713: {
    label: 'Ceder text-mined solid-state synthesis',
    project: 'CederGroupHub/text-mined-synthesis_public',
    url: 'https://github.com/CederGroupHub/text-mined-synthesis_public',
    citation: 'Kononova et al., Scientific Data 6, 203 (2019)',
    doi: '10.1038/s41597-019-0224-1',
  },
  ceder_sol_gel_20200713: {
    label: 'Ceder text-mined sol-gel synthesis',
    project: 'CederGroupHub/text-mined-synthesis_public',
    url: 'https://github.com/CederGroupHub/text-mined-synthesis_public',
    citation: 'Kononova et al., Scientific Data 6, 203 (2019)',
    doi: '10.1038/s41597-019-0224-1',
  },
  ceder_solution_20210805: {
    label: 'Ceder text-mined solution synthesis',
    project: 'CederGroupHub/text-mined-solution-synthesis_public',
    url: 'https://github.com/CederGroupHub/text-mined-solution-synthesis_public',
    citation: 'Wang et al., Scientific Data 9, 231 (2022)',
    doi: '10.1038/s41597-022-01317-2',
  },
  ceder_seed: {
    label: 'Ceder recipe seed index',
    project: 'VASP-Visualizer normalized Ceder seed',
    url: 'https://github.com/CederGroupHub/text-mined-synthesis_public',
    citation: 'Normalized examples from the Ceder open synthesis datasets',
    doi: '',
  },
};

const DEFAULT_INDEX_CANDIDATES = [
  process.env.CEDER_RECIPE_INDEX_PATH,
  path.join(__dirname, '../../data/recipe-index/ceder-recipes.jsonl.gz'),
  path.join(__dirname, '../../data/recipe-index/ceder-recipes.jsonl'),
  path.join(__dirname, '../../data/recipe-index/ceder-recipes.seed.jsonl'),
].filter(Boolean);

const DOMAIN_TERMS = {
  battery: ['battery', 'cathode', 'anode', 'lithium', 'sodium', 'electrolyte', 'li', 'na', '电池', '正极', '负极'],
  oxide_ceramic: ['oxide', 'ceramic', 'perovskite', 'titanate', 'ferrite', 'zirconia', 'alumina', '氧化物', '陶瓷', '钙钛矿'],
  co2_hydrogenation: ['methanol', 'hydrogenation', 'cuzno', 'copper zinc', 'in2o3', 'zro2', 'co2 hydrogenation', '甲醇', '加氢'],
  alloy_corrosion: ['alloy', 'corrosion', 'oxidation', 'anneal', '合金', '腐蚀', '氧化'],
  molten_salt_reactor: ['molten salt', 'fli', 'flibe', 'flinak', 'chloride salt', 'reactor', 'corrosion', '熔盐', '熔盐堆'],
};

const STOP_TERMS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'onto', 'that', 'this', 'paper', 'papers',
  'article', 'articles', 'study', 'studies', 'model', 'models', 'material', 'materials',
  'synthesis', 'route', 'recipe', 'catalyst', 'catalysts', 'dft', 'calculation', 'search',
  'research', 'recent', 'literature', 'reaction', 'co2', 'h2', 'o2', 'h2o',
  '文献', '文章', '材料', '检索', '合成', '路线', '模型', '催化剂', '研究', '近期',
]);

let cache = {
  path: null,
  mtimeMs: null,
  records: [],
  loadedAt: null,
  sourceCounts: {},
  error: null,
};

function asText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(items) {
  return [...new Set(items.map(asText).filter(Boolean))];
}

function normalizeFormula(value) {
  return asText(value)
    .replace(/[·⋅]/g, '.')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function tokenize(value) {
  return asText(value)
    .toLowerCase()
    .replace(/[·⋅]/g, '.')
    .match(/[a-z0-9+\-_.()]+|[\u4e00-\u9fff]{2,}/g) || [];
}

function meaningfulTerms(value) {
  return unique(tokenize(value).filter((term) => {
    if (STOP_TERMS.has(term)) return false;
    if (term.length < 3 && !/[A-Z]/.test(term)) return false;
    return true;
  })).slice(0, 40);
}

function getMaterialFormula(material) {
  if (!material) return '';
  if (typeof material === 'string') return material;
  return asText(material.material_formula || material.formula || material.material_string || material.material_name);
}

function getTargetFormula(record) {
  return getMaterialFormula(record?.target)
    || (Array.isArray(record?.targets_string) ? record.targets_string[0] : record?.targets_string)
    || '';
}

function conditionValueToString(value) {
  if (!value) return '';
  const values = Array.isArray(value) ? value : [value];
  const parts = values.map((item) => {
    if (!item || typeof item !== 'object') return asText(item);
    const units = asText(item.units);
    const numericValues = Array.isArray(item.values) ? item.values.filter((num) => Number.isFinite(Number(num))) : [];
    if (numericValues.length) return `${unique(numericValues.map((num) => String(num))).join('/')} ${units}`.trim();
    const min = Number(item.min_value);
    const max = Number(item.max_value);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return min === max ? `${min} ${units}`.trim() : `${min}-${max} ${units}`.trim();
    }
    return '';
  });
  return unique(parts).join('; ');
}

function normalizeOperations(operations) {
  return (Array.isArray(operations) ? operations : []).map((operation) => {
    const conditions = operation?.conditions || {};
    const temperature = conditionValueToString(conditions.heating_temperature || conditions.temperature);
    const time = conditionValueToString(conditions.heating_time || conditions.time);
    const atmosphere = unique([]
      .concat(conditions.heating_atmosphere || [])
      .concat(conditions.atmosphere || [])
      .map(asText)).join(', ');
    return {
      type: asText(operation?.type),
      verb: asText(operation?.token || operation?.string),
      temperature,
      time,
      atmosphere,
      mixing_device: asText(conditions.mixing_device),
      mixing_media: asText(conditions.mixing_media),
    };
  }).filter((operation) => operation.type || operation.verb);
}

function collectConditionSummary(operations) {
  const temperatures = unique(operations.map((operation) => operation.temperature));
  const times = unique(operations.map((operation) => operation.time));
  const atmospheres = unique(operations.map((operation) => operation.atmosphere));
  const media = unique(operations.map((operation) => operation.mixing_media));
  return {
    temperature: temperatures.join('; ') || 'not extracted',
    time: times.join('; ') || 'not extracted',
    atmosphere: atmospheres.join('; ') || media.join('; ') || 'not extracted',
  };
}

function normalizeRecipeRecord(record, options = {}) {
  const sourceId = asText(options.sourceId || record?.source_id || 'ceder_seed');
  const source = DATASET_SOURCES[sourceId] || DATASET_SOURCES.ceder_seed;
  const targetFormula = getTargetFormula(record);
  const targetName = asText(record?.target?.material_name || record?.target?.material_string || targetFormula);
  const precursors = (Array.isArray(record?.precursors) ? record.precursors : [])
    .map((material) => getMaterialFormula(material))
    .filter(Boolean);
  const operations = normalizeOperations(record?.operations);
  const conditions = collectConditionSummary(operations);
  const synthesisType = asText(record?.synthesis_type || record?.type || options.synthesisType || 'synthesis');
  const doi = asText(record?.doi);
  const paragraph = asText(record?.paragraph_string);
  const reactionString = asText(record?.reaction_string);
  const idBase = [
    options.idPrefix || sourceId,
    targetFormula || 'target',
    doi || options.index || 'record',
    options.index ?? '',
  ].join(':');
  const id = asText(record?.id) || idBase.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').slice(0, 160);
  const searchText = [
    targetFormula,
    targetName,
    synthesisType,
    reactionString,
    doi,
    ...precursors,
    ...operations.flatMap((operation) => [
      operation.type,
      operation.verb,
      operation.temperature,
      operation.time,
      operation.atmosphere,
      operation.mixing_media,
    ]),
    paragraph,
  ].join(' ');

  return {
    id,
    source_id: sourceId,
    source: source.label,
    source_project: source.project,
    source_url: source.url,
    source_citation: source.citation,
    source_dataset_doi: source.doi,
    doi,
    doi_url: doi ? `https://doi.org/${doi}` : '',
    synthesis_type: synthesisType,
    target_formula: targetFormula,
    target_name: targetName,
    precursors: unique(precursors),
    operations,
    conditions,
    reaction_string: reactionString,
    paragraph,
    search_text: asText(searchText),
  };
}

function findIndexPath() {
  return DEFAULT_INDEX_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function readIndexFile(indexPath) {
  const raw = fs.readFileSync(indexPath);
  const text = indexPath.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function loadRecipeIndex() {
  const indexPath = findIndexPath();
  if (!indexPath) {
    return {
      status: 'missing',
      path: null,
      records: [],
      total: 0,
      source_counts: {},
      loaded_at: null,
      error: null,
      candidates: DEFAULT_INDEX_CANDIDATES,
    };
  }

  try {
    const stat = fs.statSync(indexPath);
    if (cache.path === indexPath && cache.mtimeMs === stat.mtimeMs && !cache.error) {
      return {
        status: 'ready',
        path: cache.path,
        records: cache.records,
        total: cache.records.length,
        source_counts: cache.sourceCounts,
        loaded_at: cache.loadedAt,
        error: null,
        candidates: DEFAULT_INDEX_CANDIDATES,
      };
    }
    const records = readIndexFile(indexPath).map((record, index) => {
      if (record?.source && record?.target_formula) return record;
      return normalizeRecipeRecord(record, { index });
    });
    const sourceCounts = records.reduce((acc, record) => {
      const key = record.source_id || record.source || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    cache = {
      path: indexPath,
      mtimeMs: stat.mtimeMs,
      records,
      loadedAt: new Date().toISOString(),
      sourceCounts,
      error: null,
    };
    return {
      status: 'ready',
      path: indexPath,
      records,
      total: records.length,
      source_counts: sourceCounts,
      loaded_at: cache.loadedAt,
      error: null,
      candidates: DEFAULT_INDEX_CANDIDATES,
    };
  } catch (error) {
    cache = { ...cache, error };
    return {
      status: 'error',
      path: indexPath,
      records: [],
      total: 0,
      source_counts: {},
      loaded_at: null,
      error: error.message,
      candidates: DEFAULT_INDEX_CANDIDATES,
    };
  }
}

function recipeIndexStatus() {
  const index = loadRecipeIndex();
  return {
    status: index.status,
    path: index.path,
    total: index.total,
    source_counts: index.source_counts,
    loaded_at: index.loaded_at,
    error: index.error,
  };
}

function compactRecipe(record, score = 0, matchedTerms = []) {
  return {
    id: record.id,
    source_id: record.source_id,
    source: record.source,
    source_project: record.source_project,
    source_url: record.source_url,
    source_citation: record.source_citation,
    source_dataset_doi: record.source_dataset_doi,
    doi: record.doi,
    doi_url: record.doi_url,
    synthesis_type: record.synthesis_type,
    target_formula: record.target_formula,
    target_name: record.target_name,
    precursors: record.precursors || [],
    operations: record.operations || [],
    conditions: record.conditions || {},
    reaction_string: record.reaction_string,
    paragraph: record.paragraph,
    score: Math.max(0, Math.min(100, Math.round(score))),
    matched_terms: matchedTerms,
  };
}

function scoreRecord(record, { query, formulas, domain }) {
  const searchText = asText(record.search_text || [
    record.target_formula,
    record.target_name,
    record.synthesis_type,
    record.reaction_string,
    record.paragraph,
    ...(record.precursors || []),
  ].join(' ')).toLowerCase();
  const target = normalizeFormula(record.target_formula);
  const precursorText = (record.precursors || []).map(normalizeFormula).join(' ');
  const reactionText = normalizeFormula(record.reaction_string);
  const formulaTerms = unique((Array.isArray(formulas) ? formulas : []).map(normalizeFormula));
  const queryTerms = meaningfulTerms(query);
  const domainTerms = DOMAIN_TERMS[domain] || [];
  const matchedTerms = [];
  let score = 0;
  let exactFormulaHit = false;

  for (const formula of formulaTerms) {
    if (!formula) continue;
    if (formula === target) {
      score += 95;
      exactFormulaHit = true;
      matchedTerms.push(formula);
    } else if (reactionText.includes(formula) || precursorText.includes(formula)) {
      score += 36;
      matchedTerms.push(formula);
    }
  }

  let queryHitCount = 0;
  for (const term of queryTerms) {
    const normalized = term.toLowerCase();
    if (!normalized || STOP_TERMS.has(normalized)) continue;
    if (searchText.includes(normalized)) {
      queryHitCount += 1;
      score += normalized.length > 6 ? 8 : 5;
      matchedTerms.push(normalized);
    }
  }

  let domainHitCount = 0;
  for (const term of domainTerms) {
    const normalized = term.toLowerCase();
    if (searchText.includes(normalized)) {
      domainHitCount += 1;
      score += 4;
      matchedTerms.push(normalized);
    }
  }

  if (record.doi) score += 3;
  if (record.conditions?.temperature && record.conditions.temperature !== 'not extracted') score += 2;
  if (record.conditions?.time && record.conditions.time !== 'not extracted') score += 2;

  const hasSpecificFormulaIntent = formulaTerms.some((formula) => formula && formula.length >= 3);
  const conservativeNoHit = !exactFormulaHit && queryHitCount < 2 && domainHitCount < 2;
  if (!hasSpecificFormulaIntent && conservativeNoHit) return null;
  if (hasSpecificFormulaIntent && !exactFormulaHit && queryHitCount < 1 && score < 42) return null;
  if (score < (exactFormulaHit ? 60 : 24)) return null;

  return { score, matchedTerms: unique(matchedTerms).slice(0, 12) };
}

function searchRecipes({ query = '', formulas = [], domain = 'general_materials', limit = 8 } = {}) {
  const index = loadRecipeIndex();
  if (index.status !== 'ready') {
    return {
      index: {
        status: index.status,
        path: index.path,
        total: index.total,
        source_counts: index.source_counts,
        loaded_at: index.loaded_at,
        error: index.error,
      },
      query: asText(query),
      formulas: Array.isArray(formulas) ? formulas : [],
      domain,
      matches: [],
    };
  }

  const scored = [];
  for (const record of index.records) {
    const hit = scoreRecord(record, { query, formulas, domain });
    if (hit) scored.push(compactRecipe(record, hit.score, hit.matchedTerms));
  }
  scored.sort((a, b) => b.score - a.score || String(a.target_formula).localeCompare(String(b.target_formula)));
  return {
    index: {
      status: 'ready',
      path: index.path,
      total: index.total,
      source_counts: index.source_counts,
      loaded_at: index.loaded_at,
      error: null,
    },
    query: asText(query),
    formulas: Array.isArray(formulas) ? formulas : [],
    domain,
    matches: scored.slice(0, Math.max(1, Math.min(Number(limit) || 8, 50))),
  };
}

module.exports = {
  DATASET_SOURCES,
  normalizeRecipeRecord,
  recipeIndexStatus,
  searchRecipes,
};
