const { fail } = require("./store");
const plain = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const doi = (value) =>
  plain(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .toLowerCase();

function sources(env = {}) {
  return [
    {
      id: "crossref",
      name: "Crossref",
      kind: "文献",
      state: "ready",
      action: "search",
      description: "真实 DOI 元数据检索、分页采集。全文按单篇授权处理。",
      url: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/",
    },
    {
      id: "openalex",
      name: "OpenAlex",
      kind: "文献",
      state: "ready",
      action: "search",
      description: env.OPENALEX_API_KEY
        ? "已配置 API Key。采集题录与开放全文位置。"
        : "使用匿名基础额度；可配置 API Key 提高额度。",
      url: "https://help.openalex.org/api/authentication/",
    },
    {
      id: "unpaywall",
      name: "Unpaywall",
      kind: "全文定位",
      state: env.UNPAYWALL_EMAIL ? "ready" : "configuration",
      action: "enrich",
      description: "在文献详情定位 OA 副本。需要配置联系邮箱，不自动下载全文。",
      url: "https://unpaywall.org/products/api",
    },
    {
      id: "import",
      name: "授权文件导入",
      kind: "文献 / 专利",
      state: "ready",
      action: "import",
      description: "标准 JSONL 题录、带页码的正文和材料证据；保留原文件。",
      url: "",
    },
    {
      id: "cnipa",
      name: "CNIPA · 中国",
      kind: "专利",
      state: "license",
      description:
        "待企业注册与数据协议；官方原始包适配尚未实现。可先导入标准 JSONL。",
      url: "https://ipdps.cnipa.gov.cn/",
    },
    {
      id: "epo",
      name: "EPO · 欧洲",
      kind: "专利",
      state: "license",
      description: "待 DOCDB / INPADOC / 全文产品授权和格式适配。",
      url: "https://www.epo.org/en/searching-for-patents/data/bulk-data-sets",
    },
    {
      id: "uspto",
      name: "USPTO · 美国",
      kind: "专利",
      state: "license",
      description: "待 ODP 账户与批量数据适配。当前未连接实时专利检索。",
      url: "https://data.uspto.gov/bulkdata/datasets",
    },
    {
      id: "wipo",
      name: "WIPO · PCT",
      kind: "专利",
      state: "license",
      description: "待 PCT 数据产品许可与原始包适配。",
      url: "https://www.wipo.int/en/web/patentscope/data/index",
    },
    {
      id: "arxiv",
      name: "arXiv / 出版社",
      kind: "文献",
      state: "planned",
      description: "批量接入在后续范围内；出版商全文需单独确认使用权。",
      url: "https://info.arxiv.org/help/bulk_data/index.html",
    },
  ];
}

// Only fixed official endpoints are fetched. Arbitrary source URLs are stored as provenance, never fetched.
async function requestJson(
  url,
  {
    fetcher = fetch,
    headers = {},
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetcher(url, {
        headers: { "User-Agent": "EliangMatAI-DataPilot/1.0", ...headers },
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
      });
    } catch {
      if (attempt < 2) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw fail("无法连接数据源，请检查网络后重试", 502);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retry = response.headers.get("retry-after");
      const seconds =
        Number(retry) || (retry ? (Date.parse(retry) - Date.now()) / 1000 : 0);
      if (seconds > 10)
        throw fail("数据源限流，请稍后重试（上游要求等待）", 429);
      await sleep(Math.max(500 * 2 ** attempt, seconds * 1000));
      continue;
    }
    if (!response.ok)
      throw fail(
        "数据源返回 HTTP " + response.status + "，请检查账户、额度或稍后重试",
        response.status === 429 ? 429 : 502,
      );
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 12 * 1024 * 1024)
      throw fail("数据源响应过大，请减小批量", 502);
    // Bound the decompressed response as well as Content-Length.
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 12 * 1024 * 1024)
        throw fail("数据源响应过大，请减小批量", 502);
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw fail("数据源返回了无效 JSON", 502);
    }
  }
}

function normalizeCrossref(item) {
  const identifier = doi(item.DOI);
  if (!identifier || !item.title?.[0])
    throw fail("Crossref 记录缺少 DOI 或标题");
  return {
    key: "doi:" + identifier,
    kind: "paper",
    title: plain(item.title[0]),
    doi: identifier,
    year:
      item.published?.["date-parts"]?.[0]?.[0] ||
      item.issued?.["date-parts"]?.[0]?.[0] ||
      null,
    authors: (item.author || [])
      .map((a) => plain([a.given, a.family].filter(Boolean).join(" ")))
      .filter(Boolean)
      .slice(0, 50),
    url: "https://doi.org/" + identifier,
    abstract: plain(item.abstract).slice(0, 30_000),
    documentType:
      /\/v\d+\/review\d+$/i.test(identifier) ||
      /^Review for /i.test(item.title[0]) ||
      item.type === "peer-review"
        ? "peer-review"
        : item.type || "unknown",
    sourceRelations: Object.entries(item.relation || {}).flatMap(
      ([relation, values]) =>
        Array.isArray(values)
          ? values
              .slice(0, 20)
              .map((v) => ({ relation, identifier: plain(v.id).slice(0, 300) }))
          : [],
    ),
    screening: "待核对材料体系与研究条件",
    source: "crossref",
    sourceId: identifier,
    licenses: (item.license || []).map((l) => ({
      url: safeUrl(l.URL),
      scope: l["content-version"] || "unspecified",
    })),
    fulltextLocations: (item.link || [])
      .map((l) => ({
        url: safeUrl(l.URL),
        license: "",
        version: l["content-version"] || "unspecified",
      }))
      .filter((l) => l.url),
  };
}
function normalizeOpenAlex(item) {
  if (!item.id || !item.title) throw fail("OpenAlex 记录缺少 ID 或标题");
  const identifier = doi(item.doi);
  const inverted = item.abstract_inverted_index || {};
  const words = [];
  for (const [word, positions] of Object.entries(inverted))
    for (const position of positions)
      if (Number.isInteger(position) && position >= 0 && position < 20_000)
        words[position] = word;
  const locations = (item.locations || [])
    .filter((l) => l.is_oa)
    .map((l) => ({
      url: safeUrl(l.pdf_url || l.landing_page_url),
      license: plain(l.license),
      version: plain(l.version),
    }))
    .filter((l) => l.url);
  return {
    key: identifier
      ? "doi:" + identifier
      : "openalex:" + item.id.split("/").pop(),
    kind: "paper",
    title: plain(item.title),
    doi: identifier,
    year: item.publication_year || null,
    authors: (item.authorships || [])
      .map((a) => plain(a.author?.display_name))
      .filter(Boolean)
      .slice(0, 50),
    abstract: words.join(" ").slice(0, 30_000),
    documentType: item.type || "unknown",
    sourceRelations: [],
    screening: "待核对材料体系与研究条件",
    source: "openalex",
    sourceId: item.id,
    url: safeUrl(item.primary_location?.landing_page_url || item.id),
    fulltextLocations: locations,
    licenses: locations
      .filter((l) => l.license)
      .map((l) => ({ url: "", scope: l.version, label: l.license })),
  };
}
async function searchSource(source, input, env, options) {
  let url;
  const headers = {};
  if (source === "crossref") {
    url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query", input.query);
    // Cursor pagination otherwise defaults to index order and can bury relevant work.
    url.searchParams.set("sort", "score");
    url.searchParams.set("order", "desc");
    url.searchParams.set("rows", input.limit);
    url.searchParams.set("cursor", input.cursor || "*");
    if (env.CROSSREF_EMAIL) url.searchParams.set("mailto", env.CROSSREF_EMAIL);
    const filters = [];
    if (input.since) filters.push("from-index-date:" + input.since);
    if (input.documentType && input.documentType !== "all")
      filters.push("type:" + input.documentType);
    if (input.yearFrom)
      filters.push("from-pub-date:" + input.yearFrom + "-01-01");
    if (input.yearTo) filters.push("until-pub-date:" + input.yearTo + "-12-31");
    if (filters.length) url.searchParams.set("filter", filters.join(","));
  } else if (source === "openalex") {
    url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", input.query);
    url.searchParams.set("per_page", input.limit);
    url.searchParams.set("cursor", input.cursor || "*");
    // publication date is not an update cursor. Keep the distinction explicit in the UI.
    const filters = [];
    if (input.since) filters.push("from_publication_date:" + input.since);
    if (input.documentType && input.documentType !== "all")
      filters.push(
        "type:" +
          ({
            "journal-article": "article",
            "posted-content": "preprint",
            "peer-review": "peer-review",
          }[input.documentType] || input.documentType),
      );
    if (input.yearFrom)
      filters.push("publication_year:>" + (Number(input.yearFrom) - 1));
    if (input.yearTo)
      filters.push("publication_year:<" + (Number(input.yearTo) + 1));
    if (filters.length) url.searchParams.set("filter", filters.join(","));
    if (env.OPENALEX_API_KEY)
      headers.Authorization = "Bearer " + env.OPENALEX_API_KEY;
  } else throw fail("该数据源尚未接入在线采集", 409);
  const raw = await requestJson(url, { ...options, headers });
  const items = source === "crossref" ? raw.message?.items : raw.results;
  if (!Array.isArray(items)) throw fail("上游数据格式不符合预期", 502);
  return {
    raw,
    items,
    normalize: source === "crossref" ? normalizeCrossref : normalizeOpenAlex,
    total:
      source === "crossref" ? raw.message["total-results"] : raw.meta?.count,
    cursor:
      items.length >= input.limit
        ? source === "crossref"
          ? raw.message["next-cursor"]
          : raw.meta?.next_cursor
        : null,
  };
}
module.exports = {
  sources,
  requestJson,
  searchSource,
  normalizeCrossref,
  normalizeOpenAlex,
  safeUrl,
  plain,
  doi,
};
