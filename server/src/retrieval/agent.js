'use strict';

const { geminiChat } = require('../rendering/parse-science');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const { proxyAgent } = require('../proxy-agent');

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpGet(url, headers = {}, requestOptions = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const redirectsRemaining = requestOptions.redirects ?? 3;
    const useProxy = Boolean(proxyAgent && parsed.protocol === 'https:' && requestOptions.proxy !== false);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;

      if (
        result?.status === 0 &&
        useProxy &&
        !requestOptions.directRetry
      ) {
        resolve(httpGet(url, headers, {
          ...requestOptions,
          proxy: false,
          directRetry: true,
        }));
        return;
      }

      resolve(result);
    };

    const httpOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: { 'User-Agent': 'VASP-IdeaAgent/1.0', ...headers },
    };
    if (useProxy) {
      httpOptions.agent = proxyAgent;
    }

    const req = lib.request(httpOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (
          [301, 302, 303, 307, 308].includes(status) &&
          res.headers.location &&
          redirectsRemaining > 0
        ) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          if (settled) return;
          settled = true;
          resolve(httpGet(redirectUrl, headers, {
            ...requestOptions,
            redirects: redirectsRemaining - 1,
          }));
          return;
        }
        finish({
          ok: Boolean(status) && status < 400,
          status,
          body: data,
        });
      });
    });

    req.on('error', (error) => {
      finish({ ok: false, status: 0, body: '', error: error.message });
    });

    req.setTimeout(requestOptions.timeoutMs || 15000, () => {
      req.destroy();
      finish({ ok: false, status: 0, body: '', error: 'timeout' });
    });

    req.end();
  });
}

function pythonHttpGet(url, headers = {}, timeoutMs = 15000) {
  const script = `
import json
import sys
import urllib.request

url = sys.argv[1]
timeout = max(1, float(sys.argv[2]) / 1000.0)
headers = json.loads(sys.argv[3])
request = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", "replace")
        print(json.dumps({"ok": 200 <= response.status < 400, "status": response.status, "body": body}))
except Exception as exc:
    print(json.dumps({"ok": False, "status": 0, "body": "", "error": f"{type(exc).__name__}: {exc}"}))
`.trim();

  return new Promise((resolve) => {
    execFile(
      'python3',
      ['-c', script, url, String(timeoutMs), JSON.stringify(headers)],
      { timeout: timeoutMs + 3000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve({ ok: false, status: 0, body: '', error: error.message });
          return;
        }
        const parsed = safeJson(stdout);
        resolve(parsed || { ok: false, status: 0, body: '', error: 'python fallback parse failed' });
      }
    );
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

function compactAuthors(authors, pickName) {
  const items = Array.isArray(authors) ? authors : [];
  const names = items
    .slice(0, 3)
    .map((item) => pickName(item))
    .filter(Boolean);
  return names.join(', ') + (items.length > 3 ? ' et al.' : '');
}

function buildAbleSciLookupUrl(paper) {
  const query = paper?.doi || paper?.title || '';
  return query
    ? `https://www.ablesci.com/so?q=${encodeURIComponent(query)}`
    : 'https://www.ablesci.com/so';
}

function withLiteratureLookup(paper) {
  return {
    ...paper,
    ablesci_url: buildAbleSciLookupUrl(paper),
  };
}

function normalizeDoi(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^arXiv:/i.test(raw)) return raw.replace(/^arxiv:/i, 'arXiv:');
  return raw
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim() || null;
}

function normalizePaperUrl(value, doi) {
  const raw = String(value || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (doi && !/^arXiv:/i.test(doi)) return `https://doi.org/${doi}`;
  return null;
}

function isPlaceholderTitle(title) {
  const text = String(title || '').trim();
  return !text || /^untitled$/i.test(text) || text.length < 6;
}

function normalizeEvidencePaper(paper) {
  const title = String(paper?.title || '').replace(/\s+/g, ' ').trim();
  if (isPlaceholderTitle(title)) return null;

  const doi = normalizeDoi(paper?.doi);
  const url = normalizePaperUrl(paper?.url, doi);
  if (!doi && !url) return null;

  const source = String(paper?.source || '').trim() || 'Scholarly index';
  const normalized = {
    ...paper,
    title,
    authors: String(paper?.authors || '').replace(/\s+/g, ' ').trim(),
    year: paper?.year || 'n.d.',
    doi,
    url,
    abstract: paper?.abstract ? truncate(stripHtml(paper.abstract), 300) : null,
    source,
    source_label: source,
    source_type: paper?.source_type === 'preprint' ? 'preprint' : 'peer-reviewed',
    evidence_url: url || (doi ? `https://doi.org/${doi}` : null),
    verified_source: true,
  };

  return withLiteratureLookup(normalized);
}

function dedupeVerifiedPapers(input, limit = 10) {
  const seen = new Set();
  const papers = [];
  for (const rawPaper of Array.isArray(input) ? input : []) {
    const paper = normalizeEvidencePaper(rawPaper);
    if (!paper) continue;
    const key = (paper.doi || paper.url || paper.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    papers.push(paper);
  }
  return papers.slice(0, limit);
}

// ─── Literature sources ──────────────────────────────────────────────────────

async function searchCrossRef(query, rows = 4) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&select=DOI,title,author,published,abstract&rows=${rows}`;
  const res = await httpGet(url, {}, { timeoutMs: 8000 });
  if (!res.ok) return [];

  const data = safeJson(res.body);
  const items = data?.message?.items || [];

  return items.map((item) => withLiteratureLookup({
    title: item.title?.[0] || 'Untitled',
    authors: compactAuthors(item.author, (a) => a.family || a.given || ''),
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
  const res = await httpGet(url, { Accept: 'application/json' }, { timeoutMs: 8000 });
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

    const authors = compactAuthors(work.authorships, (entry) => entry.author?.display_name || '');

    return withLiteratureLookup({
      title: work.title || 'Untitled',
      authors,
      year: work.publication_year || 'n.d.',
      doi: work.doi ? work.doi.replace('https://doi.org/', '') : null,
      url: work.doi || null,
      abstract,
      source: 'OpenAlex',
      source_type: 'peer-reviewed',
    });
  });
}

async function searchArxiv(query, maxResults = 3) {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}&sortBy=relevance`;
  const res = await httpGet(url, {}, { timeoutMs: 8000 });
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

    entries.push(withLiteratureLookup({
      title,
      authors,
      year,
      doi: arxivId ? `arXiv:${arxivId}` : null,
      url: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
      abstract,
      source: 'arXiv',
      source_type: 'preprint',
    }));
  }

  return entries;
}

async function searchCORE(query, limit = 3) {
  const apiKey = process.env.CORE_API_KEY || '';
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await httpGet(url, headers, { timeoutMs: 8000 });
  if (!res.ok) return [];

  const data = safeJson(res.body);
  const results = data?.results || [];

  return results.map((work) => withLiteratureLookup({
    title: work.title || 'Untitled',
    authors: compactAuthors(work.authors, (author) => author.name || ''),
    year: work.publishedDate ? new Date(work.publishedDate).getFullYear() : (work.yearPublished || 'n.d.'),
    doi: work.doi || null,
    url: work.downloadUrl || (work.doi ? `https://doi.org/${work.doi}` : null),
    abstract: work.abstract ? truncate(stripHtml(work.abstract), 300) : null,
    source: 'CORE',
    source_type: 'peer-reviewed',
  }));
}

async function searchSemanticScholar(query, limit = 4) {
  const fields = [
    'title',
    'authors',
    'year',
    'abstract',
    'externalIds',
    'url',
    'publicationTypes',
    'venue',
    'citationCount',
  ].join(',');
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${encodeURIComponent(fields)}`;
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || process.env.S2_API_KEY || '';
  const headers = apiKey ? { 'x-api-key': apiKey } : {};
  const res = await httpGet(url, headers, { timeoutMs: 8000 });
  if (!res.ok) return [];

  const parsed = safeJson(res.body);
  const docs = parsed?.data || [];
  if (!Array.isArray(docs)) return [];

  return docs.map((paper) => withLiteratureLookup({
    title: paper.title || 'Untitled',
    authors: compactAuthors(paper.authors, (author) => author.name || ''),
    year: paper.year || 'n.d.',
    doi: paper.externalIds?.DOI || null,
    url: paper.url || (paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : null),
    abstract: paper.abstract ? truncate(stripHtml(paper.abstract), 300) : null,
    source: 'Semantic Scholar',
    source_type: Array.isArray(paper.publicationTypes) && paper.publicationTypes.includes('Review')
      ? 'peer-reviewed'
      : 'peer-reviewed',
  }));
}

async function searchEuropePMC(query, limit = 4) {
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${limit}`;
  const res = await httpGet(url, { Accept: 'application/json' }, { timeoutMs: 8000 });
  if (!res.ok) return [];

  const parsed = safeJson(res.body);
  const docs = parsed?.resultList?.result || [];
  if (!Array.isArray(docs)) return [];

  return docs.map((paper) => withLiteratureLookup({
    title: paper.title || 'Untitled',
    authors: paper.authorString || '',
    year: paper.pubYear || (paper.firstPublicationDate ? new Date(paper.firstPublicationDate).getFullYear() : 'n.d.'),
    doi: paper.doi || null,
    url: paper.doi
      ? `https://doi.org/${paper.doi}`
      : (paper.pmid ? `https://europepmc.org/article/MED/${paper.pmid}` : null),
    abstract: paper.abstractText ? truncate(stripHtml(paper.abstractText), 300) : null,
    source: 'Europe PMC',
    source_type: paper.source === 'PPR' ? 'preprint' : 'peer-reviewed',
  }));
}

async function searchPubMed(query, limit = 4) {
  const apiKey = process.env.NCBI_API_KEY ? `&api_key=${encodeURIComponent(process.env.NCBI_API_KEY)}` : '';
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=${limit}&sort=relevance${apiKey}`;
  const searchRes = await httpGet(searchUrl, { Accept: 'application/json' }, { timeoutMs: 8000 });
  if (!searchRes.ok) return [];

  const searchParsed = safeJson(searchRes.body);
  const ids = searchParsed?.esearchresult?.idlist || [];
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${apiKey}`;
  const summaryRes = await httpGet(summaryUrl, { Accept: 'application/json' }, { timeoutMs: 8000 });
  if (!summaryRes.ok) return [];

  const summaryParsed = safeJson(summaryRes.body);
  const result = summaryParsed?.result || {};

  return ids
    .map((id) => result[id])
    .filter(Boolean)
    .map((paper) => {
      const doi = (paper.articleids || []).find((item) => item.idtype === 'doi')?.value || null;
      return withLiteratureLookup({
        title: paper.title || 'Untitled',
        authors: compactAuthors(paper.authors, (author) => author.name || ''),
        year: paper.pubdate ? String(paper.pubdate).slice(0, 4) : 'n.d.',
        doi,
        url: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}/`,
        abstract: null,
        source: 'PubMed',
        source_type: 'peer-reviewed',
      });
    });
}

async function searchAllLiterature(query, relevanceContext = null) {
  const [crossref, openalex, arxiv, core, semanticScholar, europePmc, pubmed] = await Promise.allSettled([
    searchCrossRef(query, 4),
    searchOpenAlex(query, 4),
    searchArxiv(query, 3),
    searchCORE(query, 3),
    searchSemanticScholar(query, 4),
    searchEuropePMC(query, 4),
    searchPubMed(query, 4),
  ]);

  const gather = (result) => (result.status === 'fulfilled' ? result.value : []);
  const all = [
    ...gather(crossref),
    ...gather(openalex),
    ...gather(arxiv),
    ...gather(core),
    ...gather(semanticScholar),
    ...gather(europePmc),
    ...gather(pubmed),
  ];

  return relevanceContext
    ? rankAndFilterEvidencePapers(all, relevanceContext, 10, { allowFallback: false })
    : dedupeVerifiedPapers(all, 10);
}

// ─── Materials Project ───────────────────────────────────────────────────────

async function searchMaterialsProject(formula) {
  const apiKey = process.env.MP_API_KEY;
  if (!apiKey) return { success: false, error: 'MP_API_KEY not configured.' };

  const url = `https://api.materialsproject.org/materials/summary/?formula=${encodeURIComponent(formula)}&_fields=material_id,formula_pretty,symmetry,energy_above_hull,theoretical`;
  const res = await httpGet(url, { 'X-API-KEY': apiKey, Accept: 'application/json' }, { timeoutMs: 8000 });
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
      source: 'Materials Project',
      source_id: 'mp',
      selection_reason: doc.energy_above_hull === 0
        ? 'Ground state (hull)'
        : `${Number(doc.energy_above_hull).toFixed(3)} eV/atom above hull`,
    })),
  };
}

// ─── OQMD (Open Quantum Materials Database) ──────────────────────────────────

async function searchOQMD(formula, limit = 4) {
  const url = `https://oqmd.org/oqmdapi/formationenergy?composition=${encodeURIComponent(formula)}&fields=name,entry_id,spacegroup,delta_e,stability,band_gap&limit=${limit}`;
  let res = await httpGet(url, {}, { timeoutMs: 12000, proxy: false });
  if (!res.ok && proxyAgent) {
    res = await httpGet(url, {}, { timeoutMs: 12000 });
  }
  if (!res.ok && res.status === 0) {
    res = await pythonHttpGet(url, { 'User-Agent': 'VASP-IdeaAgent/1.0', Accept: 'application/json' }, 20000);
  }
  if (!res.ok) return { success: false, error: `OQMD API ${res.status}` };

  const parsed = safeJson(res.body);
  const docs = parsed?.data || [];
  if (!Array.isArray(docs) || docs.length === 0) {
    return { success: true, results: [] };
  }

  docs.sort((a, b) => (a.stability ?? 999) - (b.stability ?? 999));

  return {
    success: true,
    results: docs.slice(0, 4).map((doc) => ({
      material_id: `oqmd-${doc.entry_id}`,
      formula: doc.name || formula,
      crystal_system: doc.spacegroup || 'Unknown',
      space_group: doc.spacegroup || null,
      energy_above_hull: doc.stability !== undefined && doc.stability !== null ? Number(doc.stability).toFixed(3) : 'N/A',
      formation_energy: doc.delta_e !== undefined ? Number(doc.delta_e).toFixed(3) : null,
      band_gap: doc.band_gap !== undefined ? Number(doc.band_gap).toFixed(2) : null,
      theoretical: null,
      source: 'OQMD',
      source_id: 'oqmd',
      selection_reason: doc.stability === 0
        ? 'Ground state (OQMD hull)'
        : doc.stability !== undefined
          ? `${Number(doc.stability).toFixed(3)} eV/atom above hull (OQMD)`
          : 'OQMD entry',
    })),
  };
}

// ─── AFLOW ───────────────────────────────────────────────────────────────────

function formulaToSpecies(formula) {
  const matches = formula.match(/[A-Z][a-z]?/g);
  return matches ? [...new Set(matches)] : [];
}

async function searchAFLOW(formula, limit = 4) {
  const species = formulaToSpecies(formula);
  if (species.length === 0) return { success: false, error: 'No species extracted.' };

  const speciesStr = species.join(',');
  const url = `https://aflow.org/API/aflux/?species(${speciesStr}),nspecies(${species.length}),paging(1),format(json)`;
  const res = await httpGet(url, {}, { timeoutMs: 8000 });
  if (!res.ok) return { success: false, error: `AFLOW API ${res.status}` };

  const parsed = safeJson(res.body);
  if (!parsed || typeof parsed !== 'object') return { success: true, results: [] };

  const entries = Object.values(parsed).filter((e) => e && typeof e === 'object' && e.compound);

  const seen = new Set();
  const deduped = [];
  for (const entry of entries) {
    const key = `${entry.compound}_${entry.spacegroup_relax}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }

  return {
    success: true,
    results: deduped.slice(0, limit).map((entry) => ({
      material_id: entry.auid || 'N/A',
      formula: entry.compound || formula,
      crystal_system: entry.Pearson_symbol_relax || 'Unknown',
      space_group: entry.spacegroup_relax ? String(entry.spacegroup_relax) : null,
      energy_above_hull: 'N/A',
      theoretical: null,
      source: 'AFLOW',
      source_id: 'aflow',
      selection_reason: `AFLOW entry — spacegroup ${entry.spacegroup_relax || '?'}, Pearson ${entry.Pearson_symbol_relax || '?'}`,
    })),
  };
}

// ─── OPTIMADE structure sources ──────────────────────────────────────────────

function gcd(left, right) {
  let a = Math.abs(Number(left) || 0);
  let b = Math.abs(Number(right) || 0);
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function formulaToOptimadeReduced(formula) {
  const text = String(formula || '').replace(/\s+/g, '');
  const matches = [...text.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (matches.length === 0) return null;

  const counts = new Map();
  for (const match of matches) {
    const element = match[1];
    const count = match[2] ? Number(match[2]) : 1;
    if (!Number.isFinite(count) || count <= 0) return null;
    counts.set(element, (counts.get(element) || 0) + count);
  }

  const divisor = [...counts.values()].reduce((acc, count) => gcd(acc, count), 0) || 1;
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([element, count]) => {
      const reduced = count / divisor;
      return `${element}${reduced === 1 ? '' : reduced}`;
    })
    .join('');
}

function formatOptionalNumber(value, digits = 3) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : 'N/A';
}

const STANDARD_OPTIMADE_FIELDS = [
  'id',
  'chemical_formula_reduced',
  'chemical_formula_descriptive',
  'chemical_formula_hill',
  'nperiodic_dimensions',
  'lattice_vectors',
  'cartesian_site_positions',
  'species_at_sites',
  'nsites',
  'space_group_symbol',
  'space_group_it_number',
].join(',');

const JARVIS_OPTIMADE_FIELDS = [
  STANDARD_OPTIMADE_FIELDS,
  '_jarvis_jid',
  '_jarvis_crys',
  '_jarvis_spg',
  '_jarvis_spg_symbol',
  '_jarvis_ehull',
  '_jarvis_formation_energy_peratom',
  '_jarvis_optb88vdw_bandgap',
].join(',');

const ALEXANDRIA_OPTIMADE_FIELDS = [
  'id',
  'chemical_formula_reduced',
  'chemical_formula_descriptive',
  'lattice_vectors',
  'cartesian_site_positions',
  'species_at_sites',
  'nperiodic_dimensions',
].join(',');

const NOMAD_OPTIMADE_FIELDS = [
  'id',
  'chemical_formula_reduced',
  'chemical_formula_descriptive',
].join(',');

const MATERIALS_CLOUD_MC3D_FIELDS = [
  'id',
  'chemical_formula_reduced',
  'chemical_formula_descriptive',
  'nsites',
  'space_group_symbol',
  'space_group_it_number',
  '_mcloud_source_db',
  '_mcloud_mc3d_id',
  '_mcloud_band_gap',
].join(',');

const OMDB_OPTIMADE_FIELDS = [
  'id',
  'chemical_formula_reduced',
  'chemical_formula_descriptive',
  'chemical_formula_hill',
  'nsites',
  'elements',
  'nelements',
  'space_group_it_number',
].join(',');

function buildOptimadeUrl(source, formula, limit) {
  const reduced = formulaToOptimadeReduced(formula);
  if (!reduced) return null;
  const value = source.quoteFormula === false ? reduced : `"${reduced}"`;
  const filter = `chemical_formula_reduced=${encodeURIComponent(value)}`;
  if (source.responseFields === false) {
    return `${source.endpoint}?filter=${filter}&page_limit=${limit}`;
  }
  const responseFields = source.responseFields || STANDARD_OPTIMADE_FIELDS;
  return `${source.endpoint}?filter=${filter}&page_limit=${limit}&response_fields=${encodeURIComponent(responseFields)}`;
}

function mapOptimadeStructure(doc, source, fallbackFormula) {
  const attrs = doc?.attributes || {};
  const docId = String(doc?.id || '');
  const jarvisId = attrs._jarvis_jid || docId.replace(/^dft_3d_/, '');
  const formula =
    fallbackFormula ||
    attrs.chemical_formula_reduced ||
    attrs.chemical_formula_descriptive ||
    attrs.chemical_formula_hill ||
    'OPTIMADE structure';
  const crystalSystem =
    attrs._jarvis_crys ||
    attrs.crystal_system ||
    (attrs.nperiodic_dimensions ? `${attrs.nperiodic_dimensions}D periodic` : 'Structure');
  const spaceGroup =
    attrs._jarvis_spg ||
    attrs._jarvis_spg_symbol ||
    attrs.space_group_symbol ||
    attrs.space_group_it_number ||
    null;
  const rawHullEnergy = attrs._jarvis_ehull ?? attrs._alexandria_hull_distance;
  const hullEnergy = rawHullEnergy !== undefined
    ? formatOptionalNumber(rawHullEnergy, 3)
    : 'N/A';
  const rawFormationEnergy = attrs._jarvis_formation_energy_peratom ?? attrs._alexandria_formation_energy_per_atom;
  const formationEnergy = rawFormationEnergy !== undefined
    ? formatOptionalNumber(rawFormationEnergy, 3)
    : null;
  const rawBandGap = attrs._jarvis_optb88vdw_bandgap ?? attrs._alexandria_band_gap;
  const bandGap = rawBandGap !== undefined
    ? formatOptionalNumber(rawBandGap, 3)
    : null;
  const materialId = source.key === 'jarvis'
    ? jarvisId
    : source.key === 'alexandria'
      ? `alexandria-${docId}`
      : docId;
  const selectionReason = source.key === 'jarvis'
    ? `JARVIS OPTIMADE entry${hullEnergy !== 'N/A' ? ` — ${hullEnergy} eV/atom above hull` : ''}`
    : source.key === 'alexandria'
      ? `Alexandria PBE OPTIMADE entry${hullEnergy !== 'N/A' ? ` — ${hullEnergy} eV/atom hull distance` : ''}`
      : `${source.label} OPTIMADE entry with provenance-backed structure metadata`;

  return {
    material_id: materialId,
    formula,
    crystal_system: crystalSystem,
    space_group: spaceGroup ? String(spaceGroup) : null,
    energy_above_hull: hullEnergy,
    formation_energy: formationEnergy,
    band_gap: bandGap,
    theoretical: null,
    source: source.label,
    source_id: source.key,
    source_url: source.homepage,
    nsites: attrs.nsites || (Array.isArray(attrs.species_at_sites) ? attrs.species_at_sites.length : null),
    has_lattice_vectors: Array.isArray(attrs.lattice_vectors),
    has_cartesian_positions: Array.isArray(attrs.cartesian_site_positions),
    selection_reason: selectionReason,
  };
}

async function searchOptimadeStructures(source, formula, limit = 4) {
  const url = buildOptimadeUrl(source, formula, limit);
  if (!url) return { success: false, error: 'Could not normalize formula for OPTIMADE.' };

  let res = await httpGet(url, { Accept: 'application/json' }, { proxy: false, timeoutMs: source.timeoutMs || 8000 });
  if (!res.ok && proxyAgent) {
    res = await httpGet(url, { Accept: 'application/json' }, { timeoutMs: source.timeoutMs || 8000 });
  }
  if (!res.ok) return { success: false, error: `${source.label} OPTIMADE API ${res.status}` };

  const parsed = safeJson(res.body);
  const docs = parsed?.data || [];
  if (!Array.isArray(docs) || docs.length === 0) {
    return { success: true, results: [] };
  }

  return {
    success: true,
    results: docs.slice(0, limit).map((doc) => mapOptimadeStructure(doc, source, formula)),
  };
}

async function searchJARVIS(formula, limit = 4) {
  return searchOptimadeStructures({
    key: 'jarvis',
    label: 'JARVIS',
    endpoint: 'https://jarvis.nist.gov/optimade/jarvisdft/v1/structures/',
    homepage: 'https://jarvis.nist.gov/',
    quoteFormula: false,
    responseFields: JARVIS_OPTIMADE_FIELDS,
  }, formula, limit);
}

async function searchAlexandria(formula, limit = 4) {
  return searchOptimadeStructures({
    key: 'alexandria',
    label: 'Alexandria',
    endpoint: 'https://alexandria.icams.rub.de/pbe/v1/structures',
    homepage: 'https://alexandria.icams.rub.de/',
    responseFields: ALEXANDRIA_OPTIMADE_FIELDS,
  }, formula, limit);
}

async function searchNOMAD(formula, limit = 4) {
  return searchOptimadeStructures({
    key: 'nomad',
    label: 'NOMAD',
    endpoint: 'https://nomad-lab.eu/prod/v1/optimade/v1/structures',
    homepage: 'https://nomad-lab.eu/nomad-lab/',
    responseFields: NOMAD_OPTIMADE_FIELDS,
    timeoutMs: 12000,
  }, formula, limit);
}

async function searchMaterialsCloudMC3D(formula, limit = 4) {
  return searchOptimadeStructures({
    key: 'mcloud_mc3d',
    label: 'Materials Cloud MC3D',
    endpoint: 'https://optimade.materialscloud.org/main/mc3d-pbe-v1/v1/structures',
    homepage: 'https://mc3d.materialscloud.org/',
    responseFields: false,
    timeoutMs: 10000,
  }, formula, limit);
}

async function searchOpenMaterialsDatabase(formula, limit = 4) {
  return searchOptimadeStructures({
    key: 'omdb',
    label: 'Open Materials Database',
    endpoint: 'https://optimade.openmaterialsdb.se/v1/structures',
    homepage: 'https://openmaterialsdb.se/',
    responseFields: false,
    timeoutMs: 10000,
  }, formula, limit);
}

const STRUCTURE_SOURCE_REGISTRY = {
  live: [
    {
      id: 'mp',
      label: 'Materials Project',
      kind: 'structure_api',
      liveSearch: true,
      access: process.env.MP_API_KEY ? 'configured' : 'requires MP_API_KEY',
      homepage: 'https://materialsproject.org/',
      endpoint: 'https://api.materialsproject.org/materials/summary/',
    },
    {
      id: 'oqmd',
      label: 'OQMD',
      kind: 'structure_api',
      liveSearch: true,
      access: 'public',
      homepage: 'https://oqmd.org/',
      endpoint: 'https://oqmd.org/oqmdapi/formationenergy',
    },
    {
      id: 'aflow',
      label: 'AFLOW',
      kind: 'structure_api',
      liveSearch: true,
      access: 'public',
      homepage: 'https://aflow.org/',
      endpoint: 'https://aflow.org/API/aflux/',
    },
    {
      id: 'jarvis',
      label: 'JARVIS',
      kind: 'optimade',
      liveSearch: true,
      access: 'public',
      homepage: 'https://jarvis.nist.gov/',
      endpoint: 'https://jarvis.nist.gov/optimade/jarvisdft/v1/structures/',
    },
    {
      id: 'alexandria',
      label: 'Alexandria',
      kind: 'optimade',
      liveSearch: true,
      access: 'public',
      homepage: 'https://alexandria.icams.rub.de/',
      endpoint: 'https://alexandria.icams.rub.de/pbe/v1/structures',
    },
    {
      id: 'nomad',
      label: 'NOMAD',
      kind: 'optimade',
      liveSearch: true,
      access: 'public',
      homepage: 'https://nomad-lab.eu/nomad-lab/',
      endpoint: 'https://nomad-lab.eu/prod/v1/optimade/v1/structures',
    },
    {
      id: 'mcloud_mc3d',
      label: 'Materials Cloud MC3D',
      kind: 'optimade',
      liveSearch: true,
      access: 'public',
      homepage: 'https://mc3d.materialscloud.org/',
      endpoint: 'https://optimade.materialscloud.org/main/mc3d-pbe-v1/v1/structures',
    },
    {
      id: 'omdb',
      label: 'Open Materials Database',
      kind: 'optimade',
      liveSearch: true,
      access: 'public',
      homepage: 'https://openmaterialsdb.se/',
      endpoint: 'https://optimade.openmaterialsdb.se/v1/structures',
    },
  ],
  datasets: [
    {
      id: 'cod',
      label: 'Crystallography Open Database',
      kind: 'cif_repository',
      liveSearch: false,
      access: 'open CIF download / CC0',
      homepage: 'https://www.crystallography.net/cod/',
      notes: 'Open experimental CIF repository. Registered as metadata because public formula JSON search is noisy for exact reduced-formula lookup.',
    },
    {
      id: 'mptrj',
      label: 'MPtrj',
      kind: 'trajectory_dataset',
      liveSearch: false,
      access: 'dataset download / training metadata',
      homepage: 'https://matbench-discovery.materialsproject.org/',
      notes: 'Materials Project relaxation trajectories. Registry-only until a local mirror is configured.',
    },
    {
      id: 'matbench_discovery',
      label: 'Matbench Discovery',
      kind: 'benchmark_registry',
      liveSearch: false,
      access: 'public leaderboard and dataset registry',
      homepage: 'https://matbench-discovery.materialsproject.org/',
      notes: 'Benchmark and data registry, not a formula-search structure API.',
    },
    {
      id: 'omat24',
      label: 'OMat24',
      kind: 'large_training_dataset',
      liveSearch: false,
      access: 'Hugging Face / FAIRChem dataset files',
      homepage: 'https://huggingface.co/datasets/facebook/OMAT24',
      notes: 'Large LMDB/ASE dataset. Registry-only here; use a local mirror for direct structure pulls.',
    },
  ],
};

const STRUCTURE_SEARCHERS = {
  mp: searchMaterialsProject,
  oqmd: searchOQMD,
  aflow: searchAFLOW,
  jarvis: searchJARVIS,
  alexandria: searchAlexandria,
  nomad: searchNOMAD,
  mcloud_mc3d: searchMaterialsCloudMC3D,
  omdb: searchOpenMaterialsDatabase,
};

function listStructureSources() {
  return STRUCTURE_SOURCE_REGISTRY;
}

async function searchStructureDatabases(formula, limit = 6, sourceIds = null) {
  const requested = Array.isArray(sourceIds) && sourceIds.length
    ? sourceIds.map((id) => String(id).toLowerCase()).filter((id) => STRUCTURE_SEARCHERS[id])
    : Object.keys(STRUCTURE_SEARCHERS);
  const settled = await Promise.allSettled(requested.map(async (id) => {
    const result = await STRUCTURE_SEARCHERS[id](formula, limit);
    return { id, result };
  }));
  const results = {};
  const errors = {};

  for (const id of requested) results[id] = [];
  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value?.result?.success) {
      results[item.value.id] = item.value.result.results || [];
    } else if (item.status === 'fulfilled') {
      errors[item.value.id] = item.value.result?.error || 'search failed';
    } else {
      errors.unknown = item.reason?.message || String(item.reason);
    }
  }

  return {
    formula,
    sources: listStructureSources(),
    results,
    errors,
    structures: Object.values(results).flat(),
  };
}

function annotateStructureCandidate(structure, { sourceId, formula, reason, familyLabel }) {
  return {
    ...structure,
    source_id: structure.source_id || sourceId,
    queried_formula: formula,
    query_reason: reason,
    query_family: familyLabel || null,
  };
}

function dedupeStructures(input, limit = 40) {
  const seen = new Set();
  const entries = [];
  for (const structure of Array.isArray(input) ? input : []) {
    const key = [
      structure?.source_id || structure?.source || 'source',
      structure?.material_id || 'id',
      normalizeFormulaToken(structure?.formula || structure?.queried_formula),
    ].join(':').toLowerCase();
    if (!structure?.formula || seen.has(key)) continue;
    seen.add(key);
    entries.push(structure);
  }
  return entries
    .sort((a, b) => numericHullEnergy(a) - numericHullEnergy(b))
    .slice(0, limit);
}

function summarizeStructureCandidates(structures, limit = 4) {
  return (structures || []).slice(0, limit).map((structure) => {
    const hull = structure.energy_above_hull && structure.energy_above_hull !== 'N/A'
      ? `E_hull=${structure.energy_above_hull}`
      : (structure.formation_energy ? `ΔHf=${structure.formation_energy}` : 'energy=N/A');
    const source = structure.source || structure.source_id || 'DB';
    return `${structure.formula} ${structure.material_id || ''} · ${source} · ${structure.space_group || structure.crystal_system || 'structure'} · ${hull}`;
  }).join('\n');
}

function queryReasonLabel(reason) {
  return {
    alias: 'alias',
    user_formula: 'user formula',
    intent_formula: 'intent formula',
    literature_formula: 'literature formula',
    material_family_seed: 'material-family seed',
    domain_fallback: 'domain fallback',
  }[reason] || reason || 'query';
}

async function searchStructureSourceForPlan(sourceId, plan, { formulaLimit = 4, perFormulaLimit = 3 } = {}) {
  const searcher = STRUCTURE_SEARCHERS[sourceId];
  if (!searcher) return { sourceId, results: [], error: 'Unknown source' };
  const items = (plan?.sources || [])
    .filter((item) => item?.formula)
    .slice(0, formulaLimit);
  const results = [];
  const errors = [];

  for (const item of items) {
    try {
      const result = await searcher(item.formula, perFormulaLimit);
      if (result?.success) {
        results.push(...(result.results || []).map((structure) => annotateStructureCandidate(structure, {
          sourceId,
          formula: item.formula,
          reason: item.reason,
          familyLabel: item.family_label,
        })));
      } else if (result?.error) {
        errors.push(`${item.formula}: ${result.error}`);
      }
    } catch (error) {
      errors.push(`${item.formula}: ${error?.message || String(error)}`);
    }
  }

  return { sourceId, results: dedupeStructures(results, formulaLimit * perFormulaLimit), error: errors.join('; ') || null };
}

async function searchStructuresForPlan(plan, sourceIds = STRUCTURE_QUERY_SOURCE_IDS, options = {}) {
  const settled = await Promise.allSettled(sourceIds.map((sourceId) => searchStructureSourceForPlan(sourceId, plan, options)));
  const sourceResults = {};
  const errors = {};
  const structures = [];
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      sourceResults[item.value.sourceId] = item.value.results || [];
      if (item.value.error) errors[item.value.sourceId] = item.value.error;
      structures.push(...(item.value.results || []));
    } else {
      errors.unknown = item.reason?.message || String(item.reason);
    }
  }
  return {
    sourceResults,
    errors,
    structures: dedupeStructures(structures),
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

const VALID_ELEMENT_SYMBOLS = new Set([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn',
  'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr',
  'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn',
  'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd',
  'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb',
  'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg',
  'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
  'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm',
  'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds',
  'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);

const SMALL_MOLECULE_FORMULAS = new Set([
  'CO2', 'H2', 'O2', 'N2', 'H2O', 'CO', 'NO', 'NO2', 'NH3',
  'CH4', 'SO2', 'SO3', 'H2S', 'OH', 'CO2H',
]);

const NON_FORMULA_TOKENS = new Set([
  'AI', 'ML', 'DFT', 'VASP', 'PBE', 'GGA', 'UHF', 'RHF', 'NEB', 'AIMD',
  'XRD', 'XPS', 'SEM', 'TEM', 'STM', 'AFM', 'PDF', 'DOI', 'URL', 'UV',
  'IR', 'NMR', 'FTIR', 'BET', 'TOF', 'REST', 'JSON', 'POSS', 'MOF', 'COF',
]);

const ELEMENT_NAME_BY_SYMBOL = {
  H: 'hydrogen',
  Li: 'lithium',
  Be: 'beryllium',
  B: 'boron',
  C: 'carbon',
  N: 'nitrogen',
  O: 'oxygen',
  F: 'fluorine',
  Na: 'sodium',
  Mg: 'magnesium',
  Al: 'aluminum',
  Si: 'silicon',
  P: 'phosphorus',
  S: 'sulfur',
  Cl: 'chlorine',
  K: 'potassium',
  Ca: 'calcium',
  Sc: 'scandium',
  Ti: 'titanium',
  V: 'vanadium',
  Cr: 'chromium',
  Mn: 'manganese',
  Fe: 'iron',
  Co: 'cobalt',
  Ni: 'nickel',
  Cu: 'copper',
  Zn: 'zinc',
  Ga: 'gallium',
  Ge: 'germanium',
  As: 'arsenic',
  Se: 'selenium',
  Br: 'bromine',
  Rb: 'rubidium',
  Sr: 'strontium',
  Y: 'yttrium',
  Zr: 'zirconium',
  Nb: 'niobium',
  Mo: 'molybdenum',
  Ru: 'ruthenium',
  Rh: 'rhodium',
  Pd: 'palladium',
  Ag: 'silver',
  Cd: 'cadmium',
  In: 'indium',
  Sn: 'tin',
  Sb: 'antimony',
  Te: 'tellurium',
  I: 'iodine',
  Cs: 'cesium',
  Ba: 'barium',
  La: 'lanthanum',
  Ce: 'cerium',
  Pr: 'praseodymium',
  Nd: 'neodymium',
  Sm: 'samarium',
  Eu: 'europium',
  Gd: 'gadolinium',
  Tb: 'terbium',
  Dy: 'dysprosium',
  Ho: 'holmium',
  Er: 'erbium',
  Tm: 'thulium',
  Yb: 'ytterbium',
  Lu: 'lutetium',
  Hf: 'hafnium',
  Ta: 'tantalum',
  W: 'tungsten',
  Re: 'rhenium',
  Os: 'osmium',
  Ir: 'iridium',
  Pt: 'platinum',
  Au: 'gold',
  Hg: 'mercury',
  Tl: 'thallium',
  Pb: 'lead',
  Bi: 'bismuth',
  Th: 'thorium',
  U: 'uranium',
};

const FORMULA_LITERAL_ALIASES = {
  nacoo2: ['NaxCoO2', 'sodium cobalt oxide', 'sodium cobaltate', 'layered sodium cobalt oxide', 'sodium cobalt dioxide'],
  licoo2: ['LixCoO2', 'lithium cobalt oxide', 'lithium cobaltate', 'layered lithium cobalt oxide', 'lithium cobalt dioxide'],
  lifepo4: ['LFP', 'lithium iron phosphate', 'olivine lithium iron phosphate'],
  nafepo4: ['sodium iron phosphate', 'olivine sodium iron phosphate'],
  limn2o4: ['lithium manganese oxide', 'spinel lithium manganese oxide'],
  namn2o4: ['sodium manganese oxide', 'spinel sodium manganese oxide'],
  namno2: ['sodium manganese oxide', 'layered sodium manganese oxide'],
  linio2: ['lithium nickel oxide', 'layered lithium nickel oxide'],
  tio2: ['titanium dioxide', 'titania', 'rutile', 'anatase'],
  ceo2: ['cerium dioxide', 'ceria'],
  zro2: ['zirconium dioxide', 'zirconia'],
  uo2: ['uranium dioxide'],
  tho2: ['thorium dioxide'],
};

const UNRELATED_LITERATURE_PATTERN = /\b(pulsar|telescope|observatory|cosmology|galax|planet|stellar|supernova|quasar|astrophys|clinical|patient|tumou?r|cancer|cell line|protein|gene expression|enzyme|crop yield|soil microbi|social media|stock market)\b/i;

const STRUCTURE_QUERY_SOURCE_IDS = ['mp', 'oqmd', 'aflow', 'jarvis', 'alexandria', 'nomad'];
const SUPPLEMENTAL_STRUCTURE_SOURCE_IDS = ['jarvis', 'alexandria', 'nomad', 'oqmd'];

const MATERIAL_FAMILY_RULES = [
  {
    id: 'halide_perovskite',
    label: '卤化物钙钛矿',
    pattern: /(卤化物钙钛矿|无铅钙钛矿|太阳能|光伏|halide\s+perovskite|lead[-\s]?halide|CsPb|MAPb|FAPb|perovskite\s+solar)/i,
    seeds: ['CsPbBr3', 'CsPbI3', 'CsSnI3', 'CsPbCl3'],
  },
  {
    id: 'oxide_perovskite',
    label: '氧化物钙钛矿',
    pattern: /(氧化物钙钛矿|铁电|oxide\s+perovskite|perovskite\s+oxide|titanate|manganite|ferrite)/i,
    seeds: ['SrTiO3', 'BaTiO3', 'CaTiO3', 'LaMnO3'],
  },
  {
    id: 'perovskite',
    label: '钙钛矿材料',
    pattern: /(钙钛矿|perovskite)/i,
    seeds: ['SrTiO3', 'BaTiO3', 'CaTiO3', 'CsPbBr3'],
  },
  {
    id: 'spinel',
    label: '尖晶石材料',
    pattern: /(尖晶石|spinel)/i,
    seeds: ['MgAl2O4', 'LiMn2O4', 'NiFe2O4', 'CoFe2O4'],
  },
  {
    id: 'garnet',
    label: '石榴石结构材料',
    pattern: /(石榴石|garnet|LLZO|固态电解质)/i,
    seeds: ['Li7La3Zr2O12', 'Y3Al5O12', 'Li5La3Ta2O12'],
  },
  {
    id: 'olivine',
    label: '橄榄石结构材料',
    pattern: /(橄榄石|olivine|LFP|磷酸铁锂)/i,
    seeds: ['LiFePO4', 'NaFePO4', 'Mg2SiO4'],
  },
  {
    id: 'layered_oxide',
    label: '层状氧化物',
    pattern: /(层状氧化物|layered\s+oxide|正极|cathode|脱锂|脱钠|储钠|储锂|battery|电池)/i,
    seeds: ['LiCoO2', 'NaCoO2', 'LiNiO2', 'NaMnO2'],
  },
  {
    id: 'fluorite',
    label: '萤石结构氧化物',
    pattern: /(萤石|fluorite|氧空位|ceria|zirconia|核燃料|fuel\s+oxide)/i,
    seeds: ['CeO2', 'ZrO2', 'UO2', 'ThO2'],
  },
  {
    id: 'rutile_anatase',
    label: '二氧化钛/金红石体系',
    pattern: /(金红石|锐钛矿|rutile|anatase|titania|TiO2|光催化)/i,
    seeds: ['TiO2', 'SnO2', 'RuO2'],
  },
  {
    id: 'rocksalt',
    label: '岩盐结构材料',
    pattern: /(岩盐|rock[-\s]?salt|halite|NaCl|MgO|NiO)/i,
    seeds: ['NaCl', 'MgO', 'NiO', 'CoO'],
  },
  {
    id: 'molten_salt_reactor',
    label: '熔盐堆/熔盐体系',
    pattern: /(熔盐堆|熔盐反应堆|molten\s*salt\s*reactor|MSR\b|氟盐|氯盐|FLiBe|FLiNaK|熔盐腐蚀)/i,
    seeds: ['LiF', 'BeF2', 'NaF', 'KF', 'ZrF4', 'ThF4', 'UF4', 'SiC'],
  },
  {
    id: 'co2_hydrogenation',
    label: 'CO2 加氢/催化表面',
    pattern: /(CO2|二氧化碳).*(加氢|hydrogenation|催化|catalyst|甲醇|methanol)|加氢.*(CO2|二氧化碳)/i,
    seeds: ['Cu', 'ZnO', 'CeO2', 'In2O3', 'ZrO2', 'TiO2'],
  },
  {
    id: 'alloy_corrosion',
    label: '合金/腐蚀材料',
    pattern: /(合金|alloy|腐蚀|corrosion|耐蚀|stainless|镍基|高熵)/i,
    seeds: ['Fe', 'Ni', 'Cr', 'Ni3Al', 'FeCr2O4'],
  },
  {
    id: 'semiconductor',
    label: '半导体材料',
    pattern: /(半导体|semiconductor|光电|optoelectronic|photovoltaic|GaN|SiC|ZnO)/i,
    seeds: ['Si', 'GaN', 'SiC', 'ZnO', 'CdTe'],
  },
];

const MATERIAL_FAMILY_SEEDS = Object.fromEntries(MATERIAL_FAMILY_RULES.map((rule) => [rule.id, rule.seeds]));

function parseFormulaElements(value) {
  const token = String(value || '').trim();
  if (!token) return [];
  const matches = [...token.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (!matches.length || matches.map((match) => match[0]).join('') !== token) return [];
  if (matches.some((match) => !VALID_ELEMENT_SYMBOLS.has(match[1]))) return [];
  return matches.map((match) => match[1]);
}

function isValidStructureFormula(value, { allowSmallMolecules = false, allowSingleElement = false } = {}) {
  const token = String(value || '').trim();
  if (NON_FORMULA_TOKENS.has(token.toUpperCase())) return false;
  const elements = parseFormulaElements(token);
  if (!elements.length) return false;
  if (!allowSmallMolecules && SMALL_MOLECULE_FORMULAS.has(token.toUpperCase())) return false;
  const uniqueElements = new Set(elements);
  const hasCount = /\d/.test(token);
  if (uniqueElements.size === 1 && !hasCount && !allowSingleElement) return false;
  return true;
}

function detectMaterialFamilies(input) {
  const text = String(input || '');
  return MATERIAL_FAMILY_RULES.filter((item) => item.pattern.test(text));
}

function detectMaterialFamily(prompt) {
  return detectMaterialFamilies(prompt)[0] || null;
}

function materialFamilySeedFormulas(familyId) {
  return MATERIAL_FAMILY_SEEDS[familyId] || [];
}

function pushUniqueFormula(list, formula, reason, family = null) {
  if (!isValidStructureFormula(formula, { allowSingleElement: true })) return;
  const normalized = normalizeFormulaToken(formula);
  if (!normalized || list.some((item) => normalizeFormulaToken(item.formula) === normalized)) return;
  list.push({
    formula,
    reason,
    family_id: family?.id || null,
    family_label: family?.label || null,
  });
}

function extractFormulaCandidatesFromText(text, { limit = 8, allowSingleElement = false } = {}) {
  const source = String(text || '');
  const formulas = [];
  const surfaceMatches = [...source.matchAll(/\b([A-Z][a-z]?)\s*\(\s*\d{3}\s*\)/g)];
  for (const match of surfaceMatches) {
    if (isValidStructureFormula(match[1], { allowSingleElement: true })) formulas.push(match[1]);
  }
  const matches = source.match(/\b(?:[A-Z][a-z]?\d*){1,10}\b/g) || [];
  for (const formula of matches) {
    if (isValidStructureFormula(formula, { allowSingleElement })) formulas.push(formula);
  }
  return [...new Set(formulas)].slice(0, limit);
}

function extractExplicitFormulas(prompt) {
  return extractFormulaCandidatesFromText(prompt, { limit: 8, allowSingleElement: true });
}

function inferAliasFormulas(text) {
  const source = String(text || '');
  const formulas = [];
  if (/\bFLiBe\b/i.test(source)) formulas.push('LiF', 'BeF2');
  if (/\bFLiNaK\b/i.test(source)) formulas.push('LiF', 'NaF', 'KF');
  if (/\bLFP\b|磷酸铁锂/i.test(source)) formulas.push('LiFePO4');
  if (/\bLCO\b/i.test(source)) formulas.push('LiCoO2');
  if (/\bLLZO\b/i.test(source)) formulas.push('Li7La3Zr2O12');
  if (/\bNMC\b/i.test(source)) formulas.push('LiNiO2');
  return formulas;
}

function buildStructureQueryPlan({ userPrompt, intent, papers = [], maxFormulas = 6 } = {}) {
  const queryItems = [];
  const promptText = String(userPrompt || '');
  const intentText = [intent?.interpreted_goal, intent?.literature_query, intent?.material_family].filter(Boolean).join(' ');
  const evidenceText = [
    promptText,
    intentText,
    ...(Array.isArray(papers) ? papers.flatMap((paper) => [paper?.title, paper?.abstract]) : []),
  ].filter(Boolean).join(' ');

  const promptFormulas = extractExplicitFormulas(promptText);
  const intentFormulas = intent?.candidate_formulas || [];
  const families = detectMaterialFamilies([promptText, intentText].filter(Boolean).join(' '));

  for (const formula of inferAliasFormulas(evidenceText)) pushUniqueFormula(queryItems, formula, 'alias');
  for (const formula of promptFormulas) pushUniqueFormula(queryItems, formula, 'user_formula');
  for (const formula of intentFormulas) pushUniqueFormula(queryItems, formula, 'intent_formula');
  for (const family of families) {
    for (const formula of family.seeds) pushUniqueFormula(queryItems, formula, 'material_family_seed', family);
  }

  const fallback = inferFallbackFormula(promptText);
  if (fallback) pushUniqueFormula(queryItems, fallback, 'domain_fallback');

  const shouldUseLiteratureFormulas = families.length === 0 || promptFormulas.length > 0 || intentFormulas.length > 0;
  if (shouldUseLiteratureFormulas) {
    for (const formula of extractFormulaCandidatesFromText(evidenceText, { limit: 10, allowSingleElement: false })) {
      pushUniqueFormula(queryItems, formula, 'literature_formula');
    }
  }

  const selected = queryItems.slice(0, maxFormulas);
  return {
    formulas: selected.map((item) => item.formula),
    sources: selected,
    families: families.map((item) => ({
      id: item.id,
      label: item.label,
      seed_formulas: item.seeds,
    })),
  };
}

function inferStructureSeedFormulas(prompt) {
  return buildStructureQueryPlan({ userPrompt: prompt, maxFormulas: 4 }).formulas;
}

function inferFallbackFormula(prompt) {
  const text = String(prompt || '');
  const lower = text.toLowerCase();
  const patterns = ['NaCoO2', 'LiFePO4', 'LiCoO2', 'NaMnO2', 'LiMn2O4', 'NMC', 'LFP', 'LCO'];
  const matched = patterns.find((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
  if (matched === 'NMC') return 'LiNiO2';
  if (matched === 'LFP') return 'LiFePO4';
  if (matched === 'LCO') return 'LiCoO2';
  if (matched) return matched;

  const electrodeContext = /(cathode|positive|正极|电极|battery|电池|倍率)/i.test(text);
  if (electrodeContext && /(na\+?|sodium|钠|脱钠|储钠)/i.test(lower)) return 'NaCoO2';
  if (electrodeContext && /(li\+?|lithium|锂|脱锂|储锂)/i.test(lower)) return 'LiCoO2';
  if (electrodeContext) return 'LiCoO2';
  return null;
}

function normalizeFormulaToken(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function buildEvidenceText({ userPrompt, intent, papers }) {
  return [
    userPrompt,
    intent?.interpreted_goal,
    intent?.literature_query,
    intent?.material_family,
    ...(intent?.structure_query_plan?.formulas || []),
    ...(Array.isArray(papers) ? papers.flatMap((paper) => [paper?.title, paper?.abstract]) : []),
  ].filter(Boolean).join(' ');
}

function uniqueStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

function splitFormulaSegments(formula) {
  return [...String(formula || '').matchAll(/([A-Z][a-z]?)(\d*)/g)]
    .map((match) => ({ symbol: match[1], count: match[2] || '' }))
    .filter((item) => VALID_ELEMENT_SYMBOLS.has(item.symbol));
}

function formulaSearchAliases(formula) {
  const token = String(formula || '').trim();
  if (!token) return [];
  const normalized = normalizeFormulaToken(token);
  const segments = splitFormulaSegments(token);
  const aliases = new Set([token]);
  for (const alias of FORMULA_LITERAL_ALIASES[normalized] || []) aliases.add(alias);

  if (segments.length) {
    aliases.add(segments.map((item) => `${item.symbol}${item.count}`).join(' '));
    aliases.add(segments.map((item) => `${item.symbol}${item.count}`).join('-'));

    const names = segments.map((item) => ELEMENT_NAME_BY_SYMBOL[item.symbol]).filter(Boolean);
    if (names.length >= 2) aliases.add(names.join(' '));
    if (segments.some((item) => item.symbol === 'O') && names.length >= 2) {
      const nonOxygenNames = segments
        .filter((item) => item.symbol !== 'O')
        .map((item) => ELEMENT_NAME_BY_SYMBOL[item.symbol])
        .filter(Boolean);
      if (nonOxygenNames.length) aliases.add(`${nonOxygenNames.join(' ')} oxide`);
    }
    if (segments.some((item) => item.symbol === 'F')) {
      const nonFluorineNames = segments
        .filter((item) => item.symbol !== 'F')
        .map((item) => ELEMENT_NAME_BY_SYMBOL[item.symbol])
        .filter(Boolean);
      if (nonFluorineNames.length) aliases.add(`${nonFluorineNames.join(' ')} fluoride`);
    }
    if (segments.some((item) => item.symbol === 'Cl')) {
      const nonChlorineNames = segments
        .filter((item) => item.symbol !== 'Cl')
        .map((item) => ELEMENT_NAME_BY_SYMBOL[item.symbol])
        .filter(Boolean);
      if (nonChlorineNames.length) aliases.add(`${nonChlorineNames.join(' ')} chloride`);
    }
    if (segments.some((item) => item.symbol === 'P') && segments.some((item) => item.symbol === 'O')) {
      const nonPhosphateNames = segments
        .filter((item) => !['P', 'O'].includes(item.symbol))
        .map((item) => ELEMENT_NAME_BY_SYMBOL[item.symbol])
        .filter(Boolean);
      if (nonPhosphateNames.length) aliases.add(`${nonPhosphateNames.join(' ')} phosphate`);
    }
  }

  return uniqueStrings([...aliases]);
}

function buildFormulaSearchTerms(formulas, maxTerms = 8) {
  return uniqueStrings(
    formulas.flatMap((formula) => formulaSearchAliases(formula).slice(0, 4))
  ).slice(0, maxTerms).join(' ');
}

function inferFormulaDomainTerms(formulas) {
  const normalized = formulas.map(normalizeFormulaToken);
  if (normalized.some((formula) => ['nacoo2', 'licoo2', 'linio2', 'namno2', 'limn2o4'].includes(formula))) {
    return 'layered oxide cathode';
  }
  if (normalized.some((formula) => ['lifepo4', 'nafepo4'].includes(formula))) {
    return 'olivine phosphate cathode';
  }
  if (normalized.some((formula) => ['ceo2', 'zro2', 'uo2', 'tho2'].includes(formula))) {
    return 'oxide defect materials';
  }
  return '';
}

function buildLiteratureRelevanceContext({ userPrompt, intent, query, structureQueryPlan } = {}) {
  const promptText = String(userPrompt || '');
  const intentText = [
    intent?.interpreted_goal,
    intent?.literature_query,
    intent?.material_family,
    ...(intent?.candidate_formulas || []),
    ...(intent?.structure_query_plan?.formulas || []),
    ...(structureQueryPlan?.formulas || []),
    query,
  ].filter(Boolean).join(' ');
  const combinedText = [promptText, intentText].filter(Boolean).join(' ');
  const explicitFormulas = uniqueStrings([
    ...extractExplicitFormulas(promptText),
    ...(intent?.candidate_formulas || []),
  ]);
  const plannedFormulas = uniqueStrings([
    ...(structureQueryPlan?.formulas || []),
    ...(intent?.structure_query_plan?.formulas || []),
  ]);
  const fallbackFormula = inferFallbackFormula(promptText);
  const inferredFormulas = uniqueStrings([
    ...explicitFormulas,
    ...plannedFormulas,
    ...inferAliasFormulas(combinedText),
    fallbackFormula,
  ]).filter((formula) => isValidStructureFormula(formula, { allowSingleElement: true }));
  const formulas = explicitFormulas.length ? explicitFormulas : inferredFormulas;
  const formulaAliases = Object.fromEntries(formulas.map((formula) => [formula, formulaSearchAliases(formula)]));
  const families = detectMaterialFamilies(combinedText);
  return {
    promptText,
    query: String(query || ''),
    formulas,
    explicitFormulas,
    formulaAliases,
    families,
    researchType: intent?.research_type || inferResearchType(combinedText),
    requiresMaterialMatch: explicitFormulas.length > 0,
    wantsComputation: /(DFT|VASP|first[-\s]?principles|ab\s*initio|density functional|理论|计算|第一性原理|补充计算)/i.test(combinedText),
    wantsBattery: /(battery|cathode|anode|electrode|电池|正极|负极|储钠|储锂|脱钠|脱锂|层状氧化物)/i.test(combinedText),
  };
}

function normalizedContains(haystack, needle) {
  const normalizedNeedle = normalizeFormulaToken(needle);
  if (!normalizedNeedle || normalizedNeedle.length < 2) return false;
  return normalizeFormulaToken(haystack).includes(normalizedNeedle);
}

function phraseInText(text, phrase) {
  const source = String(text || '').toLowerCase();
  const target = String(phrase || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!target || target.length < 3) return false;
  return source.includes(target) || normalizedContains(source, target);
}

function countFormulaElementNameHits(text, formula) {
  const source = String(text || '').toLowerCase();
  const names = splitFormulaSegments(formula)
    .map((item) => ELEMENT_NAME_BY_SYMBOL[item.symbol])
    .filter(Boolean);
  const uniqueNames = [...new Set(names)];
  let hits = 0;
  for (const name of uniqueNames) {
    if (source.includes(name)) hits += 1;
    if (name === 'oxygen' && /\boxides?\b/i.test(source)) hits += 1;
  }
  return hits;
}

function formulaVariantInText(text, formula) {
  const normalizedText = normalizeFormulaToken(text);
  const normalizedFormula = normalizeFormulaToken(formula);
  const variantPatterns = {
    nacoo2: /na(?:x|\d+)?coo2/,
    licoo2: /li(?:x|\d+)?coo2/,
    linio2: /li(?:x|\d+)?nio2/,
    namno2: /na(?:x|\d+)?mno2/,
    limn2o4: /li(?:x|\d+)?mn2o4/,
  };
  return Boolean(variantPatterns[normalizedFormula]?.test(normalizedText));
}

function scorePaperRelevance(paper, context) {
  const text = [paper?.title, paper?.abstract, paper?.authors, paper?.source].filter(Boolean).join(' ');
  const formulas = context?.formulas || [];
  const reasons = [];
  let score = 0;
  let materialHit = false;
  let strongMaterialHit = false;

  for (const formula of formulas) {
    if (normalizedContains(text, formula) || formulaVariantInText(text, formula)) {
      score += 14;
      materialHit = true;
      strongMaterialHit = true;
      reasons.push(`formula:${formula}`);
      continue;
    }

    const aliases = context?.formulaAliases?.[formula] || [];
    const aliasHit = aliases.find((alias) => alias !== formula && phraseInText(text, alias));
    if (aliasHit) {
      score += 10;
      materialHit = true;
      strongMaterialHit = true;
      reasons.push(`alias:${aliasHit}`);
      continue;
    }

    const elementHits = countFormulaElementNameHits(text, formula);
    const elementCount = new Set(splitFormulaSegments(formula).map((item) => item.symbol)).size;
    if (elementHits >= Math.min(2, elementCount)) {
      score += elementHits >= elementCount ? 6 : 4;
      materialHit = true;
      reasons.push(`elements:${formula}`);
    }
  }

  for (const family of context?.families || []) {
    if (family.pattern.test(text)) {
      score += 3;
      materialHit = true;
      reasons.push(`family:${family.id}`);
    }
  }

  if (context?.wantsComputation) {
    const matches = text.match(/\b(DFT|VASP|first[-\s]?principles|ab\s*initio|density functional|computational|calculation|theoretical)\b/gi) || [];
    if (matches.length) {
      score += Math.min(5, matches.length * 2);
      reasons.push('calculation');
    }
  }

  if (context?.wantsBattery) {
    const matches = text.match(/\b(battery|batteries|cathode|anode|electrode|sodium[-\s]?ion|lithium[-\s]?ion|intercalation|deintercalation|desodiation|delithiation|layered oxide)\b/gi) || [];
    if (matches.length) {
      score += Math.min(5, matches.length * 2);
      reasons.push('battery');
    }
  }

  if (context?.researchType === 'diffusion' && /\b(diffusion|migration|NEB|barrier|vacanc)/i.test(text)) score += 3;
  if (context?.researchType === 'surface' && /\b(surface|slab|adsorption|facet|interface)\b/i.test(text)) score += 3;
  if (context?.researchType === 'doping' && /\b(dop|substitution|defect)\w*/i.test(text)) score += 3;
  if (context?.researchType === 'voltage' && /\b(voltage|deintercalation|desodiation|delithiation|redox)\b/i.test(text)) score += 3;

  if (UNRELATED_LITERATURE_PATTERN.test(text)) {
    score -= 12;
    reasons.push('unrelated-domain');
  }

  const paperFormulas = extractFormulaCandidatesFromText(text, { limit: 8, allowSingleElement: false });
  if (context?.requiresMaterialMatch && !materialHit) score -= 10;
  if (context?.requiresMaterialMatch && paperFormulas.length && !materialHit) {
    const targetElements = new Set(formulas.flatMap((formula) => parseFormulaElements(formula)));
    const paperElements = new Set(paperFormulas.flatMap((formula) => parseFormulaElements(formula)));
    const overlap = [...paperElements].filter((element) => targetElements.has(element));
    if (overlap.length <= 1) {
      score -= 5;
      reasons.push('formula-mismatch');
    }
  }

  return { score, materialHit, strongMaterialHit, reasons };
}

function rankAndFilterEvidencePapers(input, context, limit = 10, options = {}) {
  const candidates = dedupeVerifiedPapers(input, Math.max(50, limit * 6))
    .map((paper) => {
      const relevance = scorePaperRelevance(paper, context);
      return {
        ...paper,
        relevance_score: relevance.score,
        relevance_reasons: relevance.reasons,
        material_relevance_confirmed: context?.requiresMaterialMatch ? relevance.strongMaterialHit : relevance.materialHit,
      };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);

  const requiresMaterialMatch = Boolean(context?.requiresMaterialMatch);
  const minScore = requiresMaterialMatch ? 4 : 1;
  const filtered = candidates.filter((paper) => {
    if (paper.relevance_score < minScore) return false;
    if (requiresMaterialMatch && !paper.material_relevance_confirmed) return false;
    return true;
  });

  if (filtered.length || options.allowFallback === false) return filtered.slice(0, limit);
  return candidates
    .filter((paper) => paper.relevance_score > -8)
    .slice(0, limit);
}

function textMentionsFormula(text, formula) {
  const normalizedFormula = normalizeFormulaToken(formula);
  if (!normalizedFormula || normalizedFormula.length < 2) return false;
  const normalizedText = normalizeFormulaToken(text);
  return normalizedText.includes(normalizedFormula);
}

function structureMatchesMaterialFamily(structure, evidenceText) {
  const family = detectMaterialFamily(evidenceText);
  if (!family) return false;
  const formula = structure?.formula || structure?.formula_pretty || '';
  const normalized = normalizeFormulaToken(formula);
  return materialFamilySeedFormulas(family.id).some((seed) => normalizeFormulaToken(seed) === normalized);
}

function isStructureEvidenceRelated(structure, context) {
  if (!structure) return false;
  const evidenceText = buildEvidenceText(context);
  const formula = structure.formula || structure.formula_pretty || '';
  const materialId = structure.material_id || '';
  const queryFormulas = context?.structureQueryPlan?.formulas || context?.intent?.structure_query_plan?.formulas || [];
  const queriedFormula = structure.queried_formula || '';
  const queriedByPlan = queryFormulas.some((item) => {
    const normalized = normalizeFormulaToken(item);
    return normalized && (
      normalized === normalizeFormulaToken(formula) ||
      normalized === normalizeFormulaToken(queriedFormula)
    );
  });
  return textMentionsFormula(evidenceText, formula)
    || (materialId && textMentionsFormula(evidenceText, materialId))
    || queriedByPlan
    || structureMatchesMaterialFamily(structure, evidenceText);
}

function findEvidenceBackedStructureForIdea(idea, structures, context) {
  if (!idea || !Array.isArray(structures) || structures.length === 0) return null;
  const source = idea.blueprint?.structure_source || {};
  const formula = source.formula || idea.material_family || '';
  const materialId = source.material_id || '';

  const matched = structures.find((structure) => {
    const sameMaterialId = materialId && String(structure.material_id || '').toLowerCase() === String(materialId).toLowerCase();
    const sameFormula = formula && normalizeFormulaToken(structure.formula) === normalizeFormulaToken(formula);
    return (sameMaterialId || sameFormula) && isStructureEvidenceRelated(structure, context);
  });

  return matched || null;
}

function buildNoModelRecommendationPayload({ userPrompt, intent, papers, structures, reason, structureQueryPlan }) {
  const message = reason || '本轮没有找到能和检索文献对应的结构数据库条目，因此不推荐 starter model。';
  return {
    summary: `${message} 请进入 Modeling Agent 根据目标文献手动建立模型，确认材料、晶面、吸附物或熔盐组分后再继续计算。`,
    user_goal: {
      interpreted_goal: intent?.interpreted_goal || userPrompt,
      user_profile: intent?.user_profile || 'general',
      depth: intent?.depth || 'starter',
    },
    idea_cards: [],
    recommended_idea_id: null,
    papers,
    structures,
    structure_query_plan: structureQueryPlan || null,
    handoff: null,
    no_model_recommendation: {
      reason: message,
      action: 'manual_modeling_required',
    },
  };
}

function sanitizeIdeaRecommendations({ userPrompt, intent, papers, structures, ideaCards, recommendedIdeaId, overallSummary, structureQueryPlan }) {
  const context = { userPrompt, intent, papers, structureQueryPlan };
  const explicitTargets = explicitTargetFormulasFromContext(context);
  const safeCards = (Array.isArray(ideaCards) ? ideaCards : []).filter((idea) => {
    const ideaFormula = idea?.blueprint?.structure_source?.formula || idea?.material_family || '';
    if (
      explicitTargets.length &&
      ideaFormula &&
      !explicitTargets.some((formula) => normalizeFormulaToken(formula) === normalizeFormulaToken(ideaFormula))
    ) {
      return false;
    }

    const formulaText = `${ideaFormula} ${idea?.title || ''} ${idea?.material_family || ''}`;
    if (/LiCoO2|NaCoO2|LiFePO4|NaMnO2|LiMn2O4|battery|cathode|电池|正极/i.test(formulaText)) {
      const evidenceText = buildEvidenceText(context);
      if (!/(LiCoO2|NaCoO2|LiFePO4|NaMnO2|LiMn2O4|battery|cathode|电池|正极)/i.test(evidenceText)) return false;
    }
    return Boolean(findEvidenceBackedStructureForIdea(idea, structures, context));
  });

  if (!safeCards.length) {
    const fallback = buildFallbackIdeaPayload({ userPrompt, intent, papers, structures, structureQueryPlan });
    if (fallback.idea_cards?.length) {
      return {
        ...fallback,
        summary: fallback.summary || overallSummary,
      };
    }
    return buildNoModelRecommendationPayload({
      userPrompt,
      intent,
      papers,
      structures,
      structureQueryPlan,
      reason: '已检索到文献，但没有找到与这些文献主题相匹配的结构数据库条目；不会用无关材料充当推荐模型。',
    });
  }

  const safeRecommendedId = safeCards.some((idea) => idea.id === recommendedIdeaId)
    ? recommendedIdeaId
    : safeCards[0].id;
  const recommendedCard = safeCards.find((idea) => idea.id === safeRecommendedId) || safeCards[0];
  const matchedStructure = findEvidenceBackedStructureForIdea(recommendedCard, structures, { userPrompt, intent, papers, structureQueryPlan });

  return {
    summary: overallSummary || 'Ideas generated based on literature and database evidence.',
    user_goal: {
      interpreted_goal: intent.interpreted_goal,
      user_profile: intent.user_profile,
      depth: intent.depth,
    },
    idea_cards: safeCards,
    recommended_idea_id: safeRecommendedId,
    papers,
    structures,
    handoff: {
      idea_id: recommendedCard.id,
      idea_title: recommendedCard.title,
      formula: recommendedCard.blueprint?.structure_source?.formula || matchedStructure?.formula || '',
      phase: recommendedCard.blueprint?.structure_source?.phase_or_polymorph || matchedStructure?.space_group || null,
      material_id: recommendedCard.blueprint?.structure_source?.material_id || matchedStructure?.material_id || null,
      source: matchedStructure?.source || 'Structure database',
      model_type: recommendedCard.blueprint?.modeling_recipe?.starting_point || 'bulk',
      supercell: recommendedCard.blueprint?.modeling_recipe?.supercell || null,
      target_property: (recommendedCard.target_properties || [])[0] || null,
      handoff_prompt: recommendedCard.blueprint?.handoff_prompt || null,
      rationale: recommendedCard.blueprint?.literature_rationale || recommendedCard.fit_reason || null,
    },
  };
}

function buildHeuristicLiteratureQuery(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return '';
  const formulas = uniqueStrings([
    ...extractExplicitFormulas(text),
    ...inferAliasFormulas(text),
    inferFallbackFormula(text),
  ]).filter((item) => item && isValidStructureFormula(item, { allowSingleElement: true }));
  const formulaTerms = buildFormulaSearchTerms(formulas, 8);
  const formulaDomainTerms = inferFormulaDomainTerms(formulas);
  if (!/[\u4e00-\u9fff]/.test(text)) return text;

  const lower = text.toLowerCase();
  if (/(co2|二氧化碳).*(加氢|hydrogenation|催化|catalyst)|加氢.*(co2|二氧化碳)/i.test(text)) {
    return `${formulaTerms} ${formulaDomainTerms} CO2 hydrogenation catalyst DFT surface adsorption methanol`.trim();
  }
  if (/(熔盐堆|熔盐反应堆|molten\s*salt\s*reactor|msr|氟盐|氯盐|FLiBe|FLiNaK)/i.test(text)) {
    return `${formulaTerms} ${formulaDomainTerms} molten salt reactor materials corrosion fuel salt fluoride chloride`.trim();
  }
  if (/(核材料|反应堆|辐照|包壳|燃料)/.test(text)) {
    return `${formulaTerms} ${formulaDomainTerms} nuclear reactor materials irradiation corrosion DFT`.trim();
  }
  const family = detectMaterialFamily(text);
  if (family) {
    const familyQueries = {
      halide_perovskite: 'halide perovskite materials crystal structure stability solar cells DFT',
      oxide_perovskite: 'oxide perovskite materials crystal structure properties DFT',
      perovskite: 'perovskite materials crystal structure properties DFT review',
      spinel: 'spinel oxide materials crystal structure properties DFT',
      garnet: 'garnet solid electrolyte materials crystal structure DFT',
      olivine: 'olivine phosphate materials crystal structure DFT',
      layered_oxide: 'layered oxide cathode materials crystal structure DFT',
      fluorite: 'fluorite oxide materials oxygen vacancy DFT',
      rutile_anatase: 'TiO2 rutile anatase materials crystal structure photocatalysis DFT',
      rocksalt: 'rock salt oxide materials crystal structure DFT',
      alloy_corrosion: 'alloy corrosion resistant materials DFT structure',
      semiconductor: 'semiconductor materials crystal structure properties DFT',
    };
    return `${formulaTerms} ${formulaDomainTerms} ${familyQueries[family.id] || `${family.label} materials crystal structure DFT`}`.trim();
  }
  if (/(吸附|表面|晶面|催化)/.test(text)) {
    return `${formulaTerms} ${formulaDomainTerms} catalyst surface adsorption DFT`.trim();
  }
  if (/(电池|正极|负极|脱锂|脱钠|储锂|储钠)/.test(text)) {
    return `${formulaTerms} ${formulaDomainTerms} battery electrode DFT calculation first principles`.trim();
  }
  if (/(扩散|迁移|neb)/i.test(lower)) {
    return `${formulaTerms} ${formulaDomainTerms} diffusion migration NEB DFT`.trim();
  }
  return `${formulaTerms} ${formulaDomainTerms} materials science DFT calculation`.trim();
}

function numericHullEnergy(structure) {
  const value = Number(structure?.energy_above_hull);
  return Number.isFinite(value) ? value : 999;
}

function chooseBestStructure(structures) {
  if (!Array.isArray(structures) || structures.length === 0) return null;
  return [...structures].sort((a, b) => numericHullEnergy(a) - numericHullEnergy(b))[0];
}

function explicitTargetFormulasFromContext(context) {
  return uniqueStrings([
    ...extractExplicitFormulas(context?.userPrompt || ''),
    ...(context?.intent?.candidate_formulas || []),
  ]).filter((formula) => isValidStructureFormula(formula, { allowSingleElement: true }));
}

function structureMatchesFormula(structure, formula) {
  const target = normalizeFormulaToken(formula);
  if (!target) return false;
  return [
    structure?.formula,
    structure?.formula_pretty,
    structure?.queried_formula,
  ].some((value) => normalizeFormulaToken(value) === target);
}

function chooseBestStructureForContext(structures, context) {
  const explicitTargets = explicitTargetFormulasFromContext(context);
  if (explicitTargets.length) {
    const exactMatches = (Array.isArray(structures) ? structures : [])
      .filter((structure) => explicitTargets.some((formula) => structureMatchesFormula(structure, formula)));
    if (exactMatches.length) return chooseBestStructure(exactMatches);
    return null;
  }
  return chooseBestStructure(structures);
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

function extractSupercellSpec(value) {
  const match = String(value || '').match(/(\d+)\s*[x×X]\s*(\d+)(?:\s*[x×X]\s*(\d+))?/);
  if (!match) return '2x2x1';
  return `${match[1]}x${match[2]}x${match[3] || 1}`;
}

function buildSafeHandoffPrompt({ formula, modelType, recipe, bestStructure }) {
  const safeFormula = formula && formula !== 'candidate battery material' ? formula : null;
  if (!safeFormula) return null;
  const supercell = extractSupercellSpec(recipe?.supercell);
  const databaseEntry = bestStructure?.material_id
    ? ` using ${bestStructure.source || 'structure database'} entry ${bestStructure.material_id}`
    : '';
  if (modelType === 'slab') {
    return `Build a ${safeFormula}(001) slab with a ${supercell} supercell and 15 A vacuum`;
  }
  return `Build a bulk ${safeFormula} crystal${databaseEntry} with a ${supercell} supercell`;
}

function buildFallbackIdeaPayload({ userPrompt, intent, papers, structures, structureQueryPlan }) {
  const context = { userPrompt, intent, papers, structureQueryPlan };
  const bestStructure = chooseBestStructureForContext(structures, context);
  if (!bestStructure || !isStructureEvidenceRelated(bestStructure, { userPrompt, intent, papers, structureQueryPlan })) {
    return buildNoModelRecommendationPayload({
      userPrompt,
      intent,
      papers,
      structures,
      structureQueryPlan,
      reason: '文本模型不可用，且本轮没有找到与用户目标材料和检索文献同时匹配的结构条目；不会用 LiCoO2 或其他无关材料作为兜底模型。',
    });
  }

  const formula = bestStructure.formula || intent.candidate_formulas?.[0] || inferFallbackFormula(userPrompt);
  const researchType = intent.research_type || inferResearchType(userPrompt);
  const recipe = fallbackRecipeForType(researchType, formula, bestStructure);
  const modelType = recipe.starting_point === 'diffusion' ? 'diffusion' : recipe.starting_point;
  const handoffModelType = modelType === 'slab' ? 'slab' : 'bulk';

  const titleMap = {
    diffusion: `${formula} diffusion starter model`,
    doping: `${formula} doping comparison starter model`,
    surface: `${formula} surface/slab starter model`,
    voltage: `${formula} bulk voltage-trend starter model`,
    bulk_stability: `${formula} bulk stability starter model`,
    general: `${formula} database-backed starter model`,
  };

  const propertyMap = {
    diffusion: ['diffusion barrier', 'vacancy energetics'],
    doping: ['dopant effect', 'stability'],
    surface: ['adsorption energy', 'surface stability'],
    voltage: ['voltage trend', 'phase stability'],
    bulk_stability: ['stability', 'electronic structure'],
    general: ['stability', 'structure screening'],
  };

  const bestSourceLabel = bestStructure?.source || 'a structure database';
  const sourceReason = bestStructure
    ? `Selected ${bestStructure.material_id} because it is the lowest-energy candidate returned by ${bestSourceLabel} (${bestStructure.selection_reason}).`
    : 'No robust MP structure was available, so this fallback uses a heuristic literature-style starter recommendation.';

  const literatureBasis = papers.length > 0
    ? `Heuristic fallback based on ${papers.slice(0, 2).map((paper) => `${paper.source}:${paper.title}`).join(' | ')}.`
    : `Database fallback based on real structure hits for ${structureQueryPlan?.formulas?.slice(0, 4).join(', ') || formula}.`;

  const blueprint = {
    why_this_idea: `This recommendation uses a deterministic starter path for ${formula} from a real structure database hit. It is intended to keep your workflow moving with a conservative first model.`,
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
      'This result was selected from structure-database evidence, so treat it as a starter structure until the exact target paper phase is checked.',
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
    handoff_prompt: buildSafeHandoffPrompt({
      formula,
      modelType: handoffModelType,
      recipe,
      bestStructure,
    }),
  };

  const ideaCard = {
    id: 'fallback-idea-1',
    title: titleMap[researchType] || titleMap.general,
    material_family: formula,
    fit_reason: `This database-backed idea keeps the workflow moving by proposing a conservative starter model for ${formula} from the returned structure candidates.`,
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
    summary: `I generated a conservative starter idea for ${formula} using real structure-database evidence; please validate the exact phase and modeling choices against your target papers before treating it as publication-grade guidance.`,
    user_goal: {
      interpreted_goal: intent.interpreted_goal || userPrompt,
      user_profile: intent.user_profile || 'general',
      depth: intent.depth || 'starter',
    },
    idea_cards: [ideaCard],
    recommended_idea_id: ideaCard.id,
    papers,
    structures,
    structure_query_plan: structureQueryPlan || null,
    handoff: {
      idea_id: ideaCard.id,
      idea_title: ideaCard.title,
      formula,
      phase: blueprint.structure_source.phase_or_polymorph || null,
      material_id: blueprint.structure_source.material_id || null,
      source: bestStructure ? bestSourceLabel : 'Heuristic fallback',
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
  if (/(TEXT_LLM_API_KEY|GEMINI_API_KEY).*not configured/i.test(message)) return 'Idea Agent 文本模型未配置：缺少 TEXT_LLM_API_KEY 或 GEMINI_API_KEY。';
  if (/timeout/i.test(message) || /aborted/i.test(message)) return 'Idea Agent 文本模型请求超时，请检查中转站连通性或稍后再试。';
  if (/(Text LLM|Gemini) API error 401/i.test(message) || /(Text LLM|Gemini) API error 403/i.test(message)) return 'Idea Agent 文本模型鉴权失败，请检查 TEXT_LLM_API_KEY。';
  if (/(Text LLM|Gemini) API error 404/i.test(message)) return 'Idea Agent 文本模型或接口地址不存在，请检查 TEXT_LLM_BASE_URL / TEXT_LLM_MODEL。';
  if (/(Text LLM|Gemini) API error 429/i.test(message)) return 'Idea Agent 文本模型请求过多，请稍后再试。';
  if (/(Text LLM|Gemini) API error 5\d\d/i.test(message)) return 'Idea Agent 文本模型服务暂时不可用，请稍后再试。';
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
    material_family: null,
    structure_query_plan: null,
    research_type: inferResearchType(userPrompt),
  };

  try {
    // ── Parallel Phase 1: LLM intent + heuristic search kick off simultaneously ──

    // Heuristic: extract formulas and build a quick English query immediately
    const heuristicQuery = buildHeuristicLiteratureQuery(userPrompt);
    let structureQueryPlan = buildStructureQueryPlan({ userPrompt, intent, maxFormulas: 6 });
    intent.structure_query_plan = structureQueryPlan;
    const heuristicRelevanceContext = buildLiteratureRelevanceContext({
      userPrompt,
      intent,
      query: heuristicQuery,
      structureQueryPlan,
    });

    // Start LLM intent understanding (merged with translation)
    emit({ type: 'stage', stage: 'goal_understanding', title: 'Understanding research goal', status: 'active' });

    const llmIntentPromise = llm([{
      role: 'user',
      content: `You are a computational materials science advisor covering catalysis, batteries, nuclear materials, molten salts, ceramics, alloys, and surfaces.
A student typed the following research question (may be in Chinese or English).
Analyse their intent and return ONLY a JSON object — no prose, no markdown fences.

Rules:
- candidate_formulas MUST be empty unless the user explicitly names a concrete chemical formula, composition, alloy, crystal, or material.
- Do not infer LiCoO2, NaCoO2, LFP, NMC, or any battery material from a non-battery topic.
- For literature_query, translate Chinese domain terms precisely, e.g. 熔盐堆 -> molten salt reactor.

JSON schema:
{
  "interpreted_goal": "one sentence in the SAME language as the user's input: what research outcome they need",
  "user_profile": "theory-starter | experimental-needs-theory | general",
  "depth": "starter | paper-support | advanced",
  "literature_query": "best 4-6 ENGLISH keyword string to search academic databases. MUST be English even if input is Chinese.",
  "candidate_formulas": ["formula1", "formula2"],
  "material_family": "specific material family or empty string",
  "research_type": "bulk_stability | voltage | diffusion | doping | surface | general"
}

User prompt: "${userPrompt}"`,
    }], { timeoutMs: 12000, maxRetries: 1 }).then((raw) => {
      const parsed = cleanJson(raw);
      if (parsed) {
        intent = parsed;
        intent.research_type = intent.research_type || inferResearchType(userPrompt);
        structureQueryPlan = buildStructureQueryPlan({ userPrompt, intent, maxFormulas: 6 });
        intent.structure_query_plan = structureQueryPlan;
      }
      emit({ type: 'stage', stage: 'goal_understanding', title: 'Research goal understood', status: 'done', content: intent.interpreted_goal });
      return intent;
    }).catch(() => {
      emit({ type: 'stage', stage: 'goal_understanding', title: 'Research goal understood', status: 'done', content: intent.interpreted_goal });
      return intent;
    });

    // Start literature search immediately with heuristic query (don't wait for LLM)
    const literatureSources = [
      { stage: 'lit_crossref', label: 'CrossRef', kind: 'papers', search: () => searchCrossRef(heuristicQuery, 4) },
      { stage: 'lit_openalex', label: 'OpenAlex', kind: 'papers', search: () => searchOpenAlex(heuristicQuery, 4) },
      { stage: 'lit_arxiv', label: 'arXiv', kind: 'preprints', search: () => searchArxiv(heuristicQuery, 3) },
      { stage: 'lit_core', label: 'CORE', kind: 'papers', search: () => searchCORE(heuristicQuery, 3) },
      { stage: 'lit_semantic_scholar', label: 'Semantic Scholar', kind: 'papers', search: () => searchSemanticScholar(heuristicQuery, 4) },
      { stage: 'lit_europe_pmc', label: 'Europe PMC', kind: 'papers', search: () => searchEuropePMC(heuristicQuery, 4) },
      { stage: 'lit_pubmed', label: 'PubMed', kind: 'papers', search: () => searchPubMed(heuristicQuery, 4) },
    ];

    for (const source of literatureSources) {
      emit({ type: 'stage', stage: source.stage, title: `Searching ${source.label}…`, status: 'active' });
    }

    const litSearchPromise = Promise.all(literatureSources.map((source) => (
      source.search().then((r) => {
        const verified = rankAndFilterEvidencePapers(r, heuristicRelevanceContext, 4, { allowFallback: false });
        emit({
          type: 'stage',
          stage: source.stage,
          title: verified.length
            ? `${source.label} — ${verified.length} relevant ${source.kind}`
            : `${source.label} — no relevant ${source.kind}`,
          status: 'done',
          content: verified.slice(0, 2).map((p) => truncate(p.title, 80)).join('\n') || 'No source-backed results matched the target material closely enough.',
          papers: verified,
        });
        return verified;
      }).catch(() => {
        emit({ type: 'stage', stage: source.stage, title: `${source.label} — unavailable`, status: 'done' });
        return [];
      })
    )));

    // Start structure database lookups in parallel from a single query plan.
    const sourceStages = [
      { id: 'mp', stage: 'structure_lookup', label: 'Materials Project', formulaLimit: 4, perFormulaLimit: 3 },
      { id: 'oqmd', stage: 'db_oqmd', label: 'OQMD', formulaLimit: 4, perFormulaLimit: 3 },
      { id: 'aflow', stage: 'db_aflow', label: 'AFLOW', formulaLimit: 2, perFormulaLimit: 3 },
      { id: 'jarvis', stage: 'db_jarvis', label: 'JARVIS', formulaLimit: 4, perFormulaLimit: 3 },
      { id: 'alexandria', stage: 'db_alexandria', label: 'Alexandria', formulaLimit: 4, perFormulaLimit: 3 },
      { id: 'nomad', stage: 'db_nomad', label: 'NOMAD', formulaLimit: 4, perFormulaLimit: 3 },
    ];

    const getFinalStructurePlan = async (limit = 6) => {
      await Promise.race([
        llmIntentPromise,
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      const nextPlan = buildStructureQueryPlan({ userPrompt, intent, maxFormulas: limit });
      structureQueryPlan = nextPlan;
      intent.structure_query_plan = nextPlan;
      return nextPlan;
    };

    emit({
      type: 'stage',
      stage: 'structure_query_plan',
      title: structureQueryPlan.formulas.length
        ? `Structure query plan — ${structureQueryPlan.formulas.join(', ')}`
        : 'Structure query plan — waiting for literature formulas',
      status: 'done',
      content: structureQueryPlan.sources.map((item) => `${item.formula} (${queryReasonLabel(item.reason)})`).join('\n') || 'No concrete structure query yet.',
    });

    for (const source of sourceStages) {
      emit({ type: 'stage', stage: source.stage, title: `Searching ${source.label}…`, status: 'active' });
    }

    const structureSourcePromises = sourceStages.map((source) => (async () => {
      const plan = await getFinalStructurePlan(6);
      if (!plan.formulas.length) {
        emit({
          type: 'stage',
          stage: source.stage,
          title: `${source.label} — no formula query yet`,
          status: 'done',
          content: 'Will retry after literature formula extraction.',
          structures: [],
        });
        return [];
      }
      const result = await searchStructureSourceForPlan(source.id, plan, {
        formulaLimit: source.formulaLimit,
        perFormulaLimit: source.perFormulaLimit,
      });
      emit({
        type: 'stage',
        stage: source.stage,
        title: result.results.length > 0 ? `${source.label} — ${result.results.length} structure candidates` : `${source.label} — no matching structures`,
        status: 'done',
        content: result.results.length > 0 ? summarizeStructureCandidates(result.results, 3) : (result.error || `No ${source.label} results.`),
        structures: result.results,
      });
      return result.results;
    })().catch((error) => {
      emit({ type: 'stage', stage: source.stage, title: `${source.label} — unavailable`, status: 'done', content: error?.message || String(error) });
      return [];
    }));

    // ── Wait for all parallel work to complete ──
    const [litResults, structureResults] = await Promise.all([
      litSearchPromise,
      Promise.all(structureSourcePromises),
      llmIntentPromise,
    ]);

    // Deduplicate and keep only source-backed literature. The UI must not show
    // placeholder or off-topic papers as evidence.
    let literatureRelevanceContext = buildLiteratureRelevanceContext({
      userPrompt,
      intent,
      query: heuristicQuery,
      structureQueryPlan,
    });
    papers = rankAndFilterEvidencePapers(litResults.flat(), literatureRelevanceContext, 10, { allowFallback: false });

    allStructures = dedupeStructures(structureResults.flat(), 50);

    // If LLM gave us a better literature query and we got few results, do a supplementary search
    const llmQuery = intent.literature_query || '';
    if (llmQuery && llmQuery !== heuristicQuery && papers.length < 3) {
      literatureRelevanceContext = buildLiteratureRelevanceContext({
        userPrompt,
        intent,
        query: llmQuery,
        structureQueryPlan,
      });
      const extraResults = await searchAllLiterature(llmQuery, literatureRelevanceContext).catch(() => []);
      papers = rankAndFilterEvidencePapers([...papers, ...extraResults], literatureRelevanceContext, 10, { allowFallback: false });
    }

    const literatureStructurePlan = buildStructureQueryPlan({ userPrompt, intent, papers, maxFormulas: 8 });
    const alreadyQueried = new Set((structureQueryPlan.formulas || []).map(normalizeFormulaToken));
    const supplementalItems = (literatureStructurePlan.sources || [])
      .filter((item) => !alreadyQueried.has(normalizeFormulaToken(item.formula)))
      .slice(0, 3);
    structureQueryPlan = {
      ...literatureStructurePlan,
      searched_formulas: [...new Set([
        ...(structureQueryPlan.formulas || []),
        ...supplementalItems.map((item) => item.formula),
      ])],
    };
    intent.structure_query_plan = structureQueryPlan;

    if (supplementalItems.length) {
      emit({
        type: 'stage',
        stage: 'structure_literature_followup',
        title: `Searching structures from literature formulas — ${supplementalItems.map((item) => item.formula).join(', ')}`,
        status: 'active',
      });
      const supplementalPlan = {
        formulas: supplementalItems.map((item) => item.formula),
        sources: supplementalItems,
        families: literatureStructurePlan.families || [],
      };
      const supplemental = await searchStructuresForPlan(supplementalPlan, SUPPLEMENTAL_STRUCTURE_SOURCE_IDS, {
        formulaLimit: 3,
        perFormulaLimit: 2,
      }).catch((error) => ({ structures: [], errors: { followup: error?.message || String(error) } }));
      allStructures = dedupeStructures([...allStructures, ...(supplemental.structures || [])], 60);
      emit({
        type: 'stage',
        stage: 'structure_literature_followup',
        title: supplemental.structures?.length
          ? `Literature-derived structures — ${supplemental.structures.length} candidates`
          : 'Literature-derived structures — no new candidates',
        status: 'done',
        content: supplemental.structures?.length ? summarizeStructureCandidates(supplemental.structures, 4) : 'No additional database hits from literature-extracted formulas.',
        structures: supplemental.structures || [],
      });
    }

    // Stage 4: idea generation (LLM with deterministic fallback)
    emit({ type: 'stage', stage: 'idea_generation', title: 'Generating research ideas', status: 'active' });

    let ideaCards = [];
    let recommendedIdeaId = null;
    let overallSummary = '';
    let usedFallback = false;

    try {
      const paperSummary = papers.slice(0, 6).map((paper, i) =>
        `[${i + 1}] "${paper.title}" (${paper.authors || 'authors unavailable'}, ${paper.year}, ${paper.source}${paper.source_type === 'preprint' ? ' preprint' : ''}, ${paper.doi || paper.url})`
      ).join('\n');

      const structureSummary = allStructures.map((structure) =>
        `${structure.formula} — ${structure.material_id}, ${structure.crystal_system}, E_hull=${structure.energy_above_hull} eV/atom${structure.source ? ` [${structure.source}]` : ''}; query=${structure.queried_formula || structure.formula} (${queryReasonLabel(structure.query_reason)}) (${structure.selection_reason})`
      ).join('\n') || 'No structures retrieved from any database.';

      const ideaRaw = await llm([
        {
          role: 'user',
          content: `You are an expert computational materials science advisor.

User research goal: "${intent.interpreted_goal}"
User profile: ${intent.user_profile} (depth: ${intent.depth})
Research type hinted: ${intent.research_type}

Literature evidence (from connected scholarly indexes):
${paperSummary || 'No source-backed papers were returned. Do not invent paper titles, authors, journals, or DOI values.'}

Materials database structures (Materials Project + OQMD + AFLOW + JARVIS + Alexandria + NOMAD):
${structureSummary}

Structure query plan:
${(structureQueryPlan.sources || []).map((item) => `${item.formula}: ${queryReasonLabel(item.reason)}${item.family_label ? ` (${item.family_label})` : ''}`).join('\n') || 'No formula query could be planned.'}

Generate 2-3 research idea cards. For each idea, provide concrete literature-grounded modeling advice.

CRITICAL RULES:
- Use only the literature evidence listed above. If it is empty, say the recommendation is database/heuristic-only.
- Do not invent citations, paper titles, journals, authors, or DOI values.
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
      const sanitized = sanitizeIdeaRecommendations({
        userPrompt,
        intent,
        papers,
        structures: allStructures,
        ideaCards: ideaData?.idea_cards || [],
        recommendedIdeaId: ideaData?.recommended_idea_id || null,
        overallSummary: ideaData?.overall_summary || 'Ideas generated based on literature and database evidence.',
        structureQueryPlan,
      });
      ideaCards = sanitized.idea_cards;
      recommendedIdeaId = sanitized.recommended_idea_id;
      overallSummary = sanitized.summary;
    } catch (_error) {
      usedFallback = true;
      const fallback = buildFallbackIdeaPayload({ userPrompt, intent, papers, structures: allStructures, structureQueryPlan });
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

    const sanitizedPayload = sanitizeIdeaRecommendations({
      userPrompt,
      intent,
      papers,
      structures: allStructures,
      ideaCards,
      recommendedIdeaId,
      overallSummary,
      structureQueryPlan,
    });
    ideaCards = sanitizedPayload.idea_cards;
    recommendedIdeaId = sanitizedPayload.recommended_idea_id;
    overallSummary = sanitizedPayload.summary;

    // Stage 5: handoff
    emit({ type: 'stage', stage: 'handoff_ready', title: 'Preparing modeling handoff', status: 'active' });
    const handoff = sanitizedPayload.handoff || null;

    emit({
      type: 'stage',
      stage: 'handoff_ready',
      title: 'Handoff ready',
      status: 'done',
      content: handoff ? `Recommended: ${handoff.idea_title}` : 'No evidence-backed structure recommendation.',
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
        structure_query_plan: structureQueryPlan,
        handoff,
        no_model_recommendation: sanitizedPayload.no_model_recommendation || null,
      },
    });
  } catch (error) {
    try {
      emit({ type: 'stage', stage: 'idea_generation', title: 'Running fallback mode', status: 'active' });
      const fallback = buildFallbackIdeaPayload({ userPrompt, intent, papers, structures: allStructures, structureQueryPlan: intent.structure_query_plan });
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

module.exports = {
  runRetrievalAgentStream,
  searchMaterialsProject,
  searchOQMD,
  searchAFLOW,
  searchJARVIS,
  searchAlexandria,
  searchNOMAD,
  searchMaterialsCloudMC3D,
  searchOpenMaterialsDatabase,
  listStructureSources,
  searchStructureDatabases,
  searchSemanticScholar,
  searchEuropePMC,
  searchPubMed,
  searchAllLiterature,
  formulaToOptimadeReduced,
  buildHeuristicLiteratureQuery,
  buildLiteratureRelevanceContext,
  rankAndFilterEvidencePapers,
  scorePaperRelevance,
  buildStructureQueryPlan,
  buildFallbackIdeaPayload,
  sanitizeIdeaRecommendations,
};
