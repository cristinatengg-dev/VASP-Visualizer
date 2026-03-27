'use strict';

const { geminiChat } = require('../rendering/parse-science');
const https = require('https');
const http = require('http');
const { proxyAgent } = require('../proxy-agent');

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'VASP-IdeaAgent/1.0', ...headers },
    };
    if (proxyAgent && parsed.protocol === 'https:') options.agent = proxyAgent;

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          ok: Boolean(res.statusCode) && res.statusCode < 400,
          status: res.statusCode || 0,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      resolve({ ok: false, status: 0, body: '', error: error.message });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '', error: 'timeout' });
    });

    req.end();
  });
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripHtml(str) {
  return String(str || '').replace(/<[^>]*>/g, '').trim();
}

function truncate(str, limit = 300) {
  const text = String(str || '').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// ─── Literature sources ──────────────────────────────────────────────────────

async function searchCrossRef(query, rows = 4) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&select=DOI,title,author,published,abstract&rows=${rows}`;
  const res = await httpGet(url);
  if (!res.ok) return [];

  const data = safeJson(res.body);
  const items = data?.message?.items || [];

  return items.map((item) => ({
    title: item.title?.[0] || 'Untitled',
    authors: (item.author || [])
      .map((a) => a.family)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ') + ((item.author || []).length > 3 ? ' et al.' : ''),
    year: item.published?.['date-parts']?.[0]?.[0] || 'n.d.',
    doi: item.DOI || null,
    url: item.DOI ? `https://doi.org/${item.DOI}` : null,
    abstract: item.abstract ? truncate(stripHtml(item.abstract), 300) : null,
    source: 'CrossRef',
    source_type: 'peer-reviewed',
  }));
}

async function searchOpenAlex(query, perPage = 4) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${perPage}&select=title,authorships,publication_year,doi,abstract_inverted_index`;
  const res = await httpGet(url, { Accept: 'application/json' });
  if (!res.ok) return [];

  const data = safeJson(res.body);
  const results = data?.results || [];

  return results.map((work) => {
    let abstract = null;

    if (work.abstract_inverted_index) {
      try {
        const positions = [];
        for (const [word, posArray] of Object.entries(work.abstract_inverted_index)) {
          for (const pos of posArray) {
            positions.push({ word, pos });
          }
        }
        positions.sort((a, b) => a.pos - b.pos);
        abstract = truncate(positions.map((item) => item.word).join(' '), 300);
      } catch {
        abstract = null;
      }
    }

    const authors = (work.authorships || [])
      .slice(0, 3)
      .map((entry) => entry.author?.display_name?.split(' ').pop())
      .filter(Boolean)
      .join(', ') + ((work.authorships || []).length > 3 ? ' et al.' : '');

    return {
      title: work.title || 'Untitled',
      authors,
      year: work.publication_year || 'n.d.',
      doi: work.doi ? work.doi.replace('https://doi.org/', '') : null,
      url: work.doi || null,
      abstract,
      source: 'OpenAlex',
      source_type: 'peer-reviewed',
    };
  });
}

async function searchArxiv(query, maxResults = 3) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}&sortBy=relevance`;
  const res = await httpGet(url);
  if (!res.ok) return [];

  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(res.body)) !== null) {
    const chunk = match[1];
    const title = (/<title>([\s\S]*?)<\/title>/.exec(chunk)?.[1] || '').trim();
    const abstract = truncate(stripHtml((/<summary>([\s\S]*?)<\/summary>/.exec(chunk)?.[1] || '').trim()), 300);
    const published = (/<published>([\s\S]*?)<\/published>/.exec(chunk)?.[1] || '').trim();
    const year = published ? new Date(published).getFullYear() : 'n.d.';
    const arxivId = (/<id>([\s\S]*?)<\/id>/.exec(chunk)?.[1] || '')
      .trim()
      .replace('http://arxiv.org/abs/', '')
      .replace('https://arxiv.org/abs/', '');
    const authorMatches = [...chunk.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)];
    const authors = authorMatches
      .slice(0, 3)
      .map((item) => item[1].trim().split(' ').pop())
      .filter(Boolean)
      .join(', ') + (authorMatches.length > 3 ? ' et al.' : '');

    entries.push({
      title,
      authors,
      year,
      doi: arxivId ? `arXiv:${arxivId}` : null,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
      abstract,
      source: 'arXiv',
      source_type: 'preprint',
    });
  }

  return entries;
}

async function searchCORE(query, limit = 3) {
  const apiKey = process.env.CORE_API_KEY || '';
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await httpGet(url, headers);
  if (!res.ok) return [];

  const data = safeJson(res.body);
  const results = data?.results || [];

  return results.map((work) => ({
    title: work.title || 'Untitled',
    authors: (work.authors || [])
      .slice(0, 3)
      .map((author) => (author.name || '').split(' ').pop())
      .filter(Boolean)
      .join(', ') + ((work.authors || []).length > 3 ? ' et al.' : ''),
    year: work.publishedDate ? new Date(work.publishedDate).getFullYear() : (work.yearPublished || 'n.d.'),
    doi: work.doi || null,
    url: work.downloadUrl || (work.doi ? `https://doi.org/${work.doi}` : null),
    abstract: work.abstract ? truncate(stripHtml(work.abstract), 300) : null,
    source: 'CORE',
    source_type: 'peer-reviewed',
  }));
}

async function searchAllLiterature(query) {
  const [crossref, openalex, arxiv, core] = await Promise.allSettled([
    searchCrossRef(query, 4),
    searchOpenAlex(query, 4),
    searchArxiv(query, 3),
    searchCORE(query, 3),
  ]);

  const gather = (result) => (result.status === 'fulfilled' ? result.value : []);
  const all = [
    ...gather(crossref),
    ...gather(openalex),
    ...gather(arxiv),
    ...gather(core),
  ];

  const seen = new Set();
  const deduped = [];
  for (const paper of all) {
    const key = paper.doi || paper.title.slice(0, 80).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(paper);
    }
  }

  return deduped.slice(0, 10);
}

// ─── Materials Project ───────────────────────────────────────────────────────

async function searchMaterialsProject(formula) {
  const apiKey = process.env.MP_API_KEY;
  if (!apiKey) return { success: false, error: 'MP_API_KEY not configured.' };

  const url = `https://api.materialsproject.org/materials/summary/?formula=${encodeURIComponent(formula)}&_fields=material_id,formula_pretty,symmetry,energy_above_hull,theoretical`;
  const res = await httpGet(url, { 'X-API-KEY': apiKey, Accept: 'application/json' });
  if (!res.ok) return { success: false, error: `MP API ${res.status}` };

  const parsed = safeJson(res.body);
  const docs = parsed?.data || [];
  if (!Array.isArray(docs) || docs.length === 0) {
    return { success: true, results: [] };
  }

  docs.sort((a, b) => (a.energy_above_hull || 999) - (b.energy_above_hull || 999));

  return {
    success: true,
    results: docs.slice(0, 4).map((doc) => ({
      material_id: doc.material_id,
      formula: doc.formula_pretty,
      crystal_system: doc.symmetry?.crystal_system || 'Unknown',
      space_group: doc.symmetry?.symbol || null,
      energy_above_hull: doc.energy_above_hull !== undefined ? Number(doc.energy_above_hull).toFixed(3) : 'N/A',
      theoretical: doc.theoretical ?? null,
      selection_reason: doc.energy_above_hull === 0
        ? 'Ground state (hull)'
        : `${Number(doc.energy_above_hull).toFixed(3)} eV/atom above hull`,
    })),
  };
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

async function llm(messages, opts = {}) {
  return geminiChat(messages, false, opts);
}

function cleanJson(raw) {
  const text = String(raw || '').replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Fallback helpers ────────────────────────────────────────────────────────

function inferResearchType(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/neb|diffusion|migration|扩散|迁移/.test(text)) return 'diffusion';
  if (/voltage|电压|desodiation|delithiation|脱钠|脱锂/.test(text)) return 'voltage';
  if (/doping|dop|掺杂|substitution/.test(text)) return 'doping';
  if (/surface|slab|adsorption|界面|表面|吸附/.test(text)) return 'surface';
  if (/stability|phase|稳定性|相变/.test(text)) return 'bulk_stability';
  return 'general';
}

function inferFallbackFormula(prompt) {
  const text = String(prompt || '');
  const patterns = ['NaCoO2', 'LiFePO4', 'LiCoO2', 'NaMnO2', 'LiMn2O4', 'NMC', 'LFP', 'LCO'];
  return patterns.find((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) || null;
}

function chooseBestStructure(structures) {
  if (!Array.isArray(structures) || structures.length === 0) return null;
  return [...structures].sort((a, b) => Number(a.energy_above_hull || 999) - Number(b.energy_above_hull || 999))[0];
}

function fallbackRecipeForType(researchType, formula, bestStructure) {
  const phase = bestStructure?.space_group
    ? `${bestStructure.crystal_system || 'Unknown'} / ${bestStructure.space_group}`
    : (bestStructure?.crystal_system || 'database-selected phase');

  const base = {
    starting_point: 'bulk',
    cell_choice: 'Start from the database-selected bulk parent structure rather than the reduced formula alone.',
    supercell: 'Use a modest supercell such as 2×2×1 when introducing vacancies or dopants to reduce artificial image interactions.',
    slab: null,
    defect_or_doping: null,
    migration: null,
  };

  if (researchType === 'diffusion') {
    return {
      ...base,
      starting_point: 'diffusion',
      defect_or_doping: `Create a single alkali vacancy in a moderate supercell of ${formula || bestStructure?.formula || 'the host structure'} before constructing migration endpoints.`,
      migration: 'Prepare initial/final alkali sites for a later NEB workflow; do not start from a 1×1×1 toy cell.',
    };
  }

  if (researchType === 'doping') {
    return {
      ...base,
      starting_point: 'doped',
      defect_or_doping: `Use a substitutional dopant model in a moderate supercell of ${formula || bestStructure?.formula || 'the host structure'} and compare with the undoped parent cell.`,
    };
  }

  if (researchType === 'surface') {
    return {
      ...base,
      starting_point: 'slab',
      slab: `Build a low-index slab from the ${phase} parent structure with enough layers and ~15 Å vacuum; start from the bulk first if the surface orientation is still unclear.`,
    };
  }

  if (researchType === 'voltage') {
    return {
      ...base,
      starting_point: 'bulk',
      defect_or_doping: 'Prepare charged/discharged bulk states by changing alkali content from the same parent phase, rather than comparing unrelated structures.',
    };
  }

  return base;
}

function buildFallbackIdeaPayload({ userPrompt, intent, papers, structures }) {
  const bestStructure = chooseBestStructure(structures);
  const formula = bestStructure?.formula || intent.candidate_formulas?.[0] || inferFallbackFormula(userPrompt) || 'candidate battery material';
  const researchType = intent.research_type || inferResearchType(userPrompt);
  const recipe = fallbackRecipeForType(researchType, formula, bestStructure);
  const modelType = recipe.starting_point === 'diffusion' ? 'diffusion' : recipe.starting_point;

  const titleMap = {
    diffusion: `${formula} diffusion starter model`,
    doping: `${formula} doping comparison starter model`,
    surface: `${formula} surface/slab starter model`,
    voltage: `${formula} bulk voltage-trend starter model`,
    bulk_stability: `${formula} bulk stability starter model`,
    general: `${formula} literature-backed starter model`,
  };

  const propertyMap = {
    diffusion: ['diffusion barrier', 'vacancy energetics'],
    doping: ['dopant effect', 'stability'],
    surface: ['adsorption energy', 'surface stability'],
    voltage: ['voltage trend', 'phase stability'],
    bulk_stability: ['stability', 'electronic structure'],
    general: ['stability', 'structure screening'],
  };

  const sourceReason = bestStructure
    ? `Selected ${bestStructure.material_id} because it is the lowest-energy candidate returned by Materials Project (${bestStructure.selection_reason}).`
    : 'No robust MP structure was available, so this fallback uses a heuristic literature-style starter recommendation.';

  const literatureBasis = papers.length > 0
    ? `Heuristic fallback based on ${papers.slice(0, 2).map((paper) => `${paper.source}:${paper.title}`).join(' | ')}.`
    : 'Heuristic fallback based on the user prompt and common battery-computation starter practice.';

  const blueprint = {
    why_this_idea: `The text model is unavailable, so this recommendation uses a deterministic starter path for ${formula}. It is intended to keep your workflow moving with a conservative, literature-style first model.`,
    what_can_be_calculated: `This fallback starter model supports initial ${(propertyMap[researchType] || propertyMap.general).join(' / ')} exploration. Use it as a first-pass structure before deeper literature-specific refinement.`,
    structure_source: {
      formula,
      phase_or_polymorph: bestStructure?.space_group
        ? `${bestStructure.crystal_system || 'Unknown'} / ${bestStructure.space_group}`
        : (bestStructure?.crystal_system || 'Heuristic phase selection'),
      material_id: bestStructure?.material_id || null,
      source_reason: sourceReason,
    },
    modeling_recipe: recipe,
    literature_rationale: 'This is a heuristic fallback, not a full LLM-synthesized literature plan. It follows a conservative rule: start from the bulk parent structure, then expand to defect/doping/slab workflows only with a moderate supercell and explicit purpose.',
    caution_notes: [
      'This result was generated without the text model, so treat it as a starter recommendation.',
      'Validate the exact phase, magnetic state, and supercell choice against target literature before publication-grade calculations.',
    ],
    first_step: `Build and relax the parent ${formula} structure first, then confirm whether the selected phase matches your target literature question.`,
    second_step: researchType === 'diffusion'
      ? 'Next, create a single vacancy and prepare a migration path for NEB.'
      : researchType === 'doping'
        ? 'Next, build an undoped/doped pair in the same supercell and compare energies or local geometry.'
        : researchType === 'surface'
          ? 'Next, decide the slab orientation and construct a low-index surface from the relaxed parent bulk.'
          : 'Next, refine the model based on the exact property and literature phase you want to discuss.',
    handoff_prompt: `Build a ${modelType} starter model for ${formula}${bestStructure?.material_id ? ` using Materials Project entry ${bestStructure.material_id}` : ''}. ${recipe.cell_choice} ${recipe.supercell}`,
  };

  const ideaCard = {
    id: 'fallback-idea-1',
    title: titleMap[researchType] || titleMap.general,
    material_family: formula,
    fit_reason: `This fallback idea keeps the workflow moving by proposing a conservative starter model for ${formula} based on your prompt and available database evidence.`,
    literature_basis: literatureBasis,
    recommended_model_type: modelType,
    target_properties: propertyMap[researchType] || propertyMap.general,
    starter_friendly: true,
    difficulty: 'starter',
    confidence: bestStructure ? 'medium' : 'low',
    directly_supported: true,
    blueprint,
  };

  return {
    summary: `The text model was unavailable, so Idea Agent switched to deterministic fallback mode. I generated a conservative starter idea for ${formula} using available literature/MP evidence where possible; please validate the exact phase and modeling choices against your target papers before treating it as publication-grade guidance.`,
    user_goal: {
      interpreted_goal: intent.interpreted_goal || userPrompt,
      user_profile: intent.user_profile || 'general',
      depth: intent.depth || 'starter',
    },
    idea_cards: [ideaCard],
    recommended_idea_id: ideaCard.id,
    papers,
    structures,
    handoff: {
      idea_id: ideaCard.id,
      idea_title: ideaCard.title,
      formula,
      phase: blueprint.structure_source.phase_or_polymorph || null,
      material_id: blueprint.structure_source.material_id || null,
      source: bestStructure ? 'Materials Project' : 'Heuristic fallback',
      model_type: modelType,
      supercell: recipe.supercell || null,
      target_property: ideaCard.target_properties[0] || null,
      handoff_prompt: blueprint.handoff_prompt,
      rationale: blueprint.literature_rationale,
    },
  };
}

function humanizeIdeaAgentError(error) {
  const message = String(error?.message || error || 'Idea Agent failed').trim();
  if (/GEMINI_API_KEY is not configured/i.test(message)) return 'Idea Agent 文本模型未配置：缺少 GEMINI_API_KEY。';
  if (/timeout/i.test(message) || /aborted/i.test(message)) return 'Idea Agent 文本模型请求超时，请检查中转站连通性或稍后再试。';
  if (/Gemini API error 401/i.test(message) || /Gemini API error 403/i.test(message)) return 'Idea Agent 文本模型鉴权失败，请检查 GEMINI_API_KEY。';
  if (/Gemini API error 404/i.test(message)) return 'Idea Agent 文本模型或接口地址不存在，请检查 GEMINI_BASE_URL / GEMINI_TEXT_MODEL。';
  if (/Gemini API error 429/i.test(message)) return 'Idea Agent 文本模型请求过多，请稍后再试。';
  if (/Gemini API error 5\d\d/i.test(message)) return 'Idea Agent 文本模型服务暂时不可用，请稍后再试。';
  return message;
}

// ─── Main Idea Agent pipeline ────────────────────────────────────────────────

async function runRetrievalAgentStream(userPrompt, onChunk) {
  const emit = (obj) => onChunk(JSON.stringify(obj));

  let papers = [];
  let allStructures = [];
  let intent = {
    interpreted_goal: userPrompt,
    user_profile: 'general',
    depth: 'starter',
    literature_query: userPrompt,
    candidate_formulas: [],
    research_type: inferResearchType(userPrompt),
  };

  try {
    // ── Parallel Phase 1: LLM intent + heuristic search kick off simultaneously ──

    // Heuristic: extract formulas and build a quick English query immediately
    const heuristicFormula = inferFallbackFormula(userPrompt);
    const hasChinese = /[\u4e00-\u9fff]/.test(userPrompt);
    const heuristicQuery = hasChinese
      ? (userPrompt.match(/[A-Z][a-z]?(?:\d+)?(?:[A-Z][a-z]?(?:\d+)?)*/g) || []).join(' ') + ' battery DFT calculation'
      : userPrompt;

    // Start LLM intent understanding (merged with translation)
    emit({ type: 'stage', stage: 'goal_understanding', title: 'Understanding research goal', status: 'active' });

    const llmIntentPromise = llm([{
      role: 'user',
      content: `You are a battery / computational materials science expert advisor.
A student typed the following research question (may be in Chinese or English).
Analyse their intent and return ONLY a JSON object — no prose, no markdown fences.

JSON schema:
{
  "interpreted_goal": "one sentence in the SAME language as the user's input: what research outcome they need",
  "user_profile": "theory-starter | experimental-needs-theory | general",
  "depth": "starter | paper-support | advanced",
  "literature_query": "best 4-6 ENGLISH keyword string to search academic databases (CrossRef, arXiv, OpenAlex). MUST be English even if input is Chinese.",
  "candidate_formulas": ["formula1", "formula2"],
  "research_type": "bulk_stability | voltage | diffusion | doping | surface | general"
}

User prompt: "${userPrompt}"`,
    }], { timeoutMs: 12000, maxRetries: 1 }).then((raw) => {
      const parsed = cleanJson(raw);
      if (parsed) {
        intent = parsed;
        intent.research_type = intent.research_type || inferResearchType(userPrompt);
      }
      emit({ type: 'stage', stage: 'goal_understanding', title: 'Research goal understood', status: 'done', content: intent.interpreted_goal });
      return intent;
    }).catch(() => {
      emit({ type: 'stage', stage: 'goal_understanding', title: 'Research goal understood', status: 'done', content: intent.interpreted_goal });
      return intent;
    });

    // Start literature search immediately with heuristic query (don't wait for LLM)
    emit({ type: 'stage', stage: 'lit_crossref', title: 'Searching CrossRef…', status: 'active' });
    emit({ type: 'stage', stage: 'lit_openalex', title: 'Searching OpenAlex…', status: 'active' });
    emit({ type: 'stage', stage: 'lit_arxiv', title: 'Searching arXiv…', status: 'active' });
    emit({ type: 'stage', stage: 'lit_core', title: 'Searching CORE…', status: 'active' });

    const litSearchPromise = Promise.all([
      searchCrossRef(heuristicQuery, 4).then((r) => {
        emit({ type: 'stage', stage: 'lit_crossref', title: `CrossRef — ${r.length} papers`, status: 'done', content: r.slice(0, 2).map((p) => truncate(p.title, 80)).join('\n') || 'No results', papers: r });
        return r;
      }).catch(() => { emit({ type: 'stage', stage: 'lit_crossref', title: 'CrossRef — unavailable', status: 'done' }); return []; }),

      searchOpenAlex(heuristicQuery, 4).then((r) => {
        emit({ type: 'stage', stage: 'lit_openalex', title: `OpenAlex — ${r.length} papers`, status: 'done', content: r.slice(0, 2).map((p) => truncate(p.title, 80)).join('\n') || 'No results', papers: r });
        return r;
      }).catch(() => { emit({ type: 'stage', stage: 'lit_openalex', title: 'OpenAlex — unavailable', status: 'done' }); return []; }),

      searchArxiv(heuristicQuery, 3).then((r) => {
        emit({ type: 'stage', stage: 'lit_arxiv', title: `arXiv — ${r.length} preprints`, status: 'done', content: r.slice(0, 2).map((p) => truncate(p.title, 80)).join('\n') || 'No results', papers: r });
        return r;
      }).catch(() => { emit({ type: 'stage', stage: 'lit_arxiv', title: 'arXiv — unavailable', status: 'done' }); return []; }),

      searchCORE(heuristicQuery, 3).then((r) => {
        emit({ type: 'stage', stage: 'lit_core', title: `CORE — ${r.length} papers`, status: 'done', content: r.slice(0, 2).map((p) => truncate(p.title, 80)).join('\n') || 'No results', papers: r });
        return r;
      }).catch(() => { emit({ type: 'stage', stage: 'lit_core', title: 'CORE — unavailable', status: 'done' }); return []; }),
    ]);

    // Start MP structure lookup in parallel (use heuristic formula)
    const mpFormulas = heuristicFormula ? [heuristicFormula] : [];
    emit({
      type: 'stage', stage: 'structure_lookup',
      title: mpFormulas.length > 0 ? `Searching Materials Project — ${mpFormulas.join(', ')}` : 'Searching Materials Project',
      status: 'active',
    });

    const mpSearchPromise = (async () => {
      // Wait for LLM to finish to get better formulas, but with a timeout
      const raceResult = await Promise.race([
        llmIntentPromise.then(() => intent.candidate_formulas?.slice(0, 2) || []),
        new Promise((resolve) => setTimeout(() => resolve([]), 5000)), // 5s max wait
      ]);
      const finalFormulas = (Array.isArray(raceResult) && raceResult.length > 0) ? raceResult : mpFormulas;

      for (const formula of finalFormulas.slice(0, 2)) {
        const mpResult = await searchMaterialsProject(formula);
        if (mpResult.success) allStructures.push(...mpResult.results);
      }

      emit({
        type: 'stage', stage: 'structure_lookup',
        title: allStructures.length > 0 ? `Materials Project — ${allStructures.length} structures` : 'Materials Project — no structures found',
        status: 'done',
        content: allStructures.length > 0
          ? allStructures.slice(0, 3).map((s) => `${s.formula} ${s.material_id} (${s.crystal_system}, E_hull=${s.energy_above_hull})`).join('\n')
          : 'Using literature guidance only.',
        structures: allStructures,
      });
    })();

    // ── Wait for all parallel work to complete ──
    const [litResults] = await Promise.all([litSearchPromise, mpSearchPromise, llmIntentPromise]);

    // Deduplicate papers
    const allPapers = litResults.flat();
    const seen = new Set();
    for (const paper of allPapers) {
      const key = paper.doi || paper.title.slice(0, 80).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        papers.push(paper);
      }
    }
    papers = papers.slice(0, 10);

    // If LLM gave us a better literature query and we got few results, do a supplementary search
    const llmQuery = intent.literature_query || '';
    if (llmQuery && llmQuery !== heuristicQuery && papers.length < 3) {
      const extraResults = await Promise.all([
        searchCrossRef(llmQuery, 3).catch(() => []),
        searchArxiv(llmQuery, 2).catch(() => []),
      ]);
      for (const paper of extraResults.flat()) {
        const key = paper.doi || paper.title.slice(0, 80).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          papers.push(paper);
        }
      }
      papers = papers.slice(0, 10);
    }

    // Stage 4: idea generation (LLM with deterministic fallback)
    emit({ type: 'stage', stage: 'idea_generation', title: 'Generating research ideas', status: 'active' });

    let ideaCards = [];
    let recommendedIdeaId = null;
    let overallSummary = '';
    let usedFallback = false;

    try {
      const paperSummary = papers.slice(0, 6).map((paper, i) =>
        `[${i + 1}] "${paper.title}" (${paper.authors}, ${paper.year}, ${paper.source}${paper.source_type === 'preprint' ? ' preprint' : ''})`
      ).join('\n');

      const structureSummary = allStructures.map((structure) =>
        `${structure.formula} — ${structure.material_id}, ${structure.crystal_system}, E_hull=${structure.energy_above_hull} eV/atom (${structure.selection_reason})`
      ).join('\n') || 'No MP structures retrieved.';

      const ideaRaw = await llm([
        {
          role: 'user',
          content: `You are an expert computational materials science advisor for battery research.

User research goal: "${intent.interpreted_goal}"
User profile: ${intent.user_profile} (depth: ${intent.depth})
Research type hinted: ${intent.research_type}

Literature evidence (from CrossRef/OpenAlex/arXiv/CORE):
${paperSummary}

Materials Project structures:
${structureSummary}

Generate 2-3 research idea cards. For each idea, provide concrete literature-grounded modeling advice.

CRITICAL RULES:
- NEVER present a reduced chemical formula as a simulation-ready model.
- ALWAYS distinguish: formula label → database polymorph → cell choice → supercell → property-specific modification.
- ALWAYS justify the supercell choice (e.g. 2×2×1 to avoid dopant self-interaction in a ~16-atom host).
- Separate "starter model", "literature-standard model", "advanced follow-up".
- For layered oxides: always note which phase (O3/P2/O2 etc.) to use and why.
- If multiple polymorphs exist in MP, explain which one to start with and why.

Return ONLY a JSON object — no markdown, no prose:
{
  "idea_cards": [
    {
      "id": "idea-1",
      "title": "string",
      "material_family": "string",
      "fit_reason": "string",
      "literature_basis": "string",
      "recommended_model_type": "bulk | slab | defect | doped | diffusion",
      "target_properties": ["property1", "property2"],
      "starter_friendly": true,
      "difficulty": "starter | intermediate | advanced",
      "confidence": "high | medium | low",
      "directly_supported": true,
      "blueprint": {
        "why_this_idea": "string",
        "what_can_be_calculated": "string",
        "structure_source": {
          "formula": "string",
          "phase_or_polymorph": "string",
          "material_id": "string or null",
          "source_reason": "string"
        },
        "modeling_recipe": {
          "starting_point": "bulk | slab | defect | doped | diffusion",
          "cell_choice": "string",
          "supercell": "string",
          "slab": "string or null",
          "defect_or_doping": "string or null",
          "migration": "string or null"
        },
        "literature_rationale": "string",
        "caution_notes": ["note1"],
        "first_step": "string",
        "second_step": "string",
        "handoff_prompt": "string"
      }
    }
  ],
  "recommended_idea_id": "idea-1",
  "overall_summary": "string"
}`,
        },
      ], { timeoutMs: 15000, maxRetries: 1 });

      const ideaData = cleanJson(ideaRaw);
      ideaCards = ideaData?.idea_cards || [];
      recommendedIdeaId = ideaData?.recommended_idea_id || ideaCards[0]?.id || null;
      overallSummary = ideaData?.overall_summary || 'Ideas generated based on literature and database evidence.';
    } catch (_error) {
      usedFallback = true;
      const fallback = buildFallbackIdeaPayload({ userPrompt, intent, papers, structures: allStructures });
      ideaCards = fallback.idea_cards;
      recommendedIdeaId = fallback.recommended_idea_id;
      overallSummary = fallback.summary;
    }

    emit({
      type: 'stage',
      stage: 'idea_generation',
      title: usedFallback ? 'Research ideas ready (heuristic fallback)' : 'Research ideas ready',
      status: 'done',
      content: usedFallback
        ? `${ideaCards.length} starter idea(s) generated in fallback mode (text model unavailable).`
        : `${ideaCards.length} ideas generated.`,
    });

    // Stage 5: handoff
    emit({ type: 'stage', stage: 'handoff_ready', title: 'Preparing modeling handoff', status: 'active' });
    const recommendedCard = ideaCards.find((card) => card.id === recommendedIdeaId) || ideaCards[0] || null;
    const handoff = recommendedCard
      ? {
          idea_id: recommendedCard.id,
          idea_title: recommendedCard.title,
          formula: recommendedCard.blueprint?.structure_source?.formula || '',
          phase: recommendedCard.blueprint?.structure_source?.phase_or_polymorph || null,
          material_id: recommendedCard.blueprint?.structure_source?.material_id || null,
          source: recommendedCard.blueprint?.structure_source?.material_id ? 'Materials Project' : 'Heuristic fallback',
          model_type: recommendedCard.blueprint?.modeling_recipe?.starting_point || 'bulk',
          supercell: recommendedCard.blueprint?.modeling_recipe?.supercell || null,
          target_property: (recommendedCard.target_properties || [])[0] || null,
          handoff_prompt: recommendedCard.blueprint?.handoff_prompt || null,
          rationale: recommendedCard.blueprint?.literature_rationale || null,
        }
      : null;

    emit({
      type: 'stage',
      stage: 'handoff_ready',
      title: 'Handoff ready',
      status: 'done',
      content: handoff ? `Recommended: ${handoff.idea_title}` : 'No handoff generated.',
    });

    emit({
      type: 'complete',
      data: {
        summary: overallSummary,
        user_goal: {
          interpreted_goal: intent.interpreted_goal,
          user_profile: intent.user_profile,
          depth: intent.depth,
        },
        idea_cards: ideaCards,
        recommended_idea_id: recommendedIdeaId,
        papers,
        structures: allStructures,
        handoff,
      },
    });
  } catch (error) {
    try {
      emit({ type: 'stage', stage: 'idea_generation', title: 'Running fallback mode', status: 'active' });
      const fallback = buildFallbackIdeaPayload({ userPrompt, intent, papers, structures: allStructures });
      emit({
        type: 'stage',
        stage: 'idea_generation',
        title: 'Fallback ready',
        status: 'done',
        content: 'Deterministic fallback generated due to unexpected error.',
      });
      emit({ type: 'complete', data: fallback });
    } catch {
      const friendlyError = humanizeIdeaAgentError(error);
      console.error('[IdeaAgent] Fatal error:', friendlyError);
      onChunk(JSON.stringify({ type: 'error', content: friendlyError }));
    }
  }
}

module.exports = { runRetrievalAgentStream };
