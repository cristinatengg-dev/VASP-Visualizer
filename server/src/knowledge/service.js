const { randomUUID } = require("node:crypto");
const { fail, hash } = require("./store");
const {
  searchSource,
  requestJson,
  sources,
  safeUrl,
  plain,
  doi,
} = require("./connectors");
const now = () => new Date().toISOString();
const evidenceKinds = [
  "measurement",
  "simulation",
  "patent-example",
  "patent-claim",
];
const text = (value, max = 500) => plain(value).slice(0, max);
const projectIn = (state, id) => {
  const project = state.projects.find((p) => p.id === id);
  if (!project) throw fail("项目不存在或无访问权限", 404);
  return project;
};
const documentIn = (state, projectId, id) => {
  projectIn(state, projectId);
  const document = state.documents.find(
    (d) => d.id === id && d.projectId === projectId,
  );
  if (!document) throw fail("资料不存在或无访问权限", 404);
  return document;
};

function normalizeImport(item) {
  if (
    !item ||
    typeof item !== "object" ||
    !["paper", "patent"].includes(item.kind) ||
    !text(item.title)
  )
    throw fail("每行需要 kind（paper / patent）和 title");
  const identifier = doi(item.doi);
  const publication = text(item.publicationNumber)
    .toUpperCase()
    .replace(/[\s-]/g, "");
  if (
    item.kind === "patent" &&
    !/^[A-Z]{2}[A-Z0-9]{4,30}[A-Z]\d?$/.test(publication)
  )
    throw fail(
      "专利需要含国家代码和文献种类代码的 publicationNumber，例如 US1234567B2",
    );
  if (item.kind === "paper" && !identifier && !text(item.sourceId))
    throw fail("文献需要 doi 或 sourceId");
  if (identifier && !/^10\.\d{4,9}\/\S+$/.test(identifier))
    throw fail("DOI 格式不正确");
  if (!text(item.source) || !safeUrl(item.sourceUrl))
    throw fail("每行需要来源 source 与 HTTP(S) sourceUrl");
  const pages = (Array.isArray(item.pages) ? item.pages : []).map((p) => ({
    page: Number(p.page),
    text: String(p.text || "").trim(),
  }));
  if (
    pages.length > 200 ||
    pages.some(
      (p) => !Number.isInteger(p.page) || p.page < 1 || p.text.length > 100_000,
    ) ||
    new Set(pages.map((p) => p.page)).size !== pages.length
  )
    throw fail("正文最多 200 页，页码须为唯一正整数，每页不超过 10 万字符");
  const evidence = (Array.isArray(item.evidence) ? item.evidence : []).map(
    (e) => {
      const page = Number(e.page);
      const quote = String(e.quote || "").trim();
      if (
        !evidenceKinds.includes(e.kind) ||
        !quote ||
        quote.length > 4000 ||
        !pages.find((p) => p.page === page)?.text.includes(quote)
      )
        throw fail("材料证据需要明确类型、页码，且 quote 必须出现在该页正文中");
      return {
        id: randomUUID(),
        kind: e.kind,
        page,
        quote,
        material: text(e.material),
        composition: text(e.composition),
        basis: ["wt%", "at%", "unspecified"].includes(e.basis)
          ? e.basis
          : "unspecified",
        process: text(e.process, 2000),
        property: text(e.property),
        value: text(e.value),
        unit: text(e.unit),
        conditions: text(e.conditions, 2000),
        reviewed: false,
      };
    },
  );
  if (evidence.length > 100) throw fail("每条资料最多 100 条材料证据");
  return {
    key:
      item.kind === "patent"
        ? "patent:" + publication
        : identifier
          ? "doi:" + identifier
          : "import:" + text(item.source) + ":" + text(item.sourceId),
    kind: item.kind,
    title: text(item.title, 2000),
    doi: identifier,
    publicationNumber: publication,
    familyId: text(item.familyId),
    year: Number(item.year) || null,
    authors: Array.isArray(item.authors)
      ? item.authors.map((a) => text(a)).slice(0, 50)
      : [],
    source: text(item.source),
    sourceId: publication || identifier || text(item.sourceId),
    url: safeUrl(item.sourceUrl),
    abstract: text(item.abstract, 30_000),
    pages,
    evidence,
    demo: item.demo === true,
    licenses: [
      {
        label: text(item.license) || "未声明",
        url: safeUrl(item.licenseUrl),
        scope: "imported content; unreviewed",
      },
    ],
    fulltextLocations: [],
  };
}

function eligibility(project, document) {
  if (document.demo)
    return { allowed: false, reason: "演示数据永不进入训练候选" };
  if (project.mode !== "contribute")
    return { allowed: false, reason: "项目为私密模式" };
  if (!document.pages?.length)
    return { allowed: false, reason: "尚未入库正文" };
  if (!document.rights?.training)
    return { allowed: false, reason: "未确认内容的训练使用权" };
  if (!document.evidence?.length || document.evidence.some((e) => !e.reviewed))
    return { allowed: false, reason: "材料证据需要全部复核" };
  return { allowed: true, reason: "可导出训练候选，尚未提交训练" };
}

class KnowledgeService {
  constructor(store, env = {}, options = {}) {
    this.store = store;
    this.env = env;
    this.options = options;
    this.queue = [];
    this.running = 0;
  }
  overview(owner) {
    const state = this.store.read(owner);
    return { projects: state.projects, sources: sources(this.env) };
  }
  createProject(owner, name) {
    if (!text(name, 100)) throw fail("请输入项目名称");
    return this.store.update(owner, (s) => {
      if (s.projects.length >= 30)
        throw fail("项目数量已达当前空间上限，请联系管理员");
      const project = {
        id: randomUUID(),
        name: text(name, 100),
        mode: "private",
        createdAt: now(),
      };
      s.projects.push(project);
      return project;
    });
  }
  project(owner, id) {
    const state = this.store.read(owner);
    const project = projectIn(state, id);
    const docs = state.documents.filter((d) => d.projectId === id);
    const documents = docs.map((d) => ({
      ...d,
      pages: undefined,
      evidence: undefined,
      pageCount: d.pages?.length || 0,
      evidenceCount: d.evidence?.length || 0,
      reviewedCount: d.evidence?.filter((e) => e.reviewed).length || 0,
      training: eligibility(project, d),
    }));
    return {
      project,
      suggestedQuery: [
        state.platform?.workflows?.[id]?.family,
        state.platform?.workflows?.[id]?.testTemperature != null
          ? state.platform.workflows[id].testTemperature + " C"
          : "",
        "alloy tensile properties",
      ]
        .filter(Boolean)
        .join(" "),
      documents: documents.map((d) => ({
        ...d,
        documentType:
          d.documentType ||
          (/\/v\d+\/review\d+$/.test(d.doi || "") ||
          /^Review for /i.test(d.title)
            ? "peer-review"
            : "unknown"),
      })),
      jobs: state.jobs
        .filter((j) => j.projectId === id)
        .map((j) => ({
          ...j,
          filters: {
            documentType: j.input?.documentType,
            yearFrom: j.input?.yearFrom,
            yearTo: j.input?.yearTo,
            requiredTerms: j.input?.requiredTerms,
          },
          input: undefined,
          rawHash: undefined,
        })),
      audit: state.audit
        .filter((a) => a.projectId === id)
        .slice(-50)
        .reverse(),
    };
  }
  setMode(owner, id, mode, consent) {
    if (!["private", "contribute"].includes(mode)) throw fail("未知的数据模式");
    if (mode === "contribute" && consent !== true)
      throw fail("需要明确确认项目数据参与模型优化");
    return this.store.update(owner, (s) => {
      const project = projectIn(s, id);
      project.mode = mode;
      project.consent =
        mode === "contribute"
          ? { actor: owner, at: now(), version: "pilot-consent-v1" }
          : null;
      s.audit.push({
        id: randomUUID(),
        projectId: id,
        at: now(),
        action:
          mode === "private"
            ? "已切换为私密；后续训练候选导出已关闭"
            : "已授权参与优化；仍须逐份核对内容许可",
      });
      return project;
    });
  }
  detail(owner, projectId, id) {
    const s = this.store.read(owner);
    const d = documentIn(s, projectId, id);
    return {
      ...d,
      documentType:
        d.documentType ||
        (/\/v\d+\/review\d+$/.test(d.doi || "") || /^Review for /i.test(d.title)
          ? "peer-review"
          : "unknown"),
      training: eligibility(projectIn(s, projectId), d),
    };
  }
  startSearch(owner, projectId, input) {
    if (!["crossref", "openalex"].includes(input.source))
      throw fail("此来源尚未接入在线采集", 409);
    const query = text(input.query, 300);
    if (!query) throw fail("请输入检索词");
    const limit = Number(input.limit || 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      throw fail("单批采集数量须为 1–50");
    if (input.since && !/^\d{4}-\d{2}-\d{2}$/.test(input.since))
      throw fail("日期格式应为 YYYY-MM-DD");
    const filters = {
      documentType: input.documentType || "journal-article",
      yearFrom: input.yearFrom || "",
      yearTo: input.yearTo || "",
      requiredTerms: text(input.requiredTerms, 200),
    };
    if (
      !["journal-article", "posted-content", "peer-review", "all"].includes(
        filters.documentType,
      )
    )
      throw fail("文献类型无效");
    for (const value of [filters.yearFrom, filters.yearTo])
      if (
        value &&
        (!/^\d{4}$/.test(String(value)) ||
          Number(value) < 1800 ||
          Number(value) > 2100)
      )
        throw fail("年份须为 1800–2100");
    if (
      filters.yearFrom &&
      filters.yearTo &&
      Number(filters.yearFrom) > Number(filters.yearTo)
    )
      throw fail("年份范围无效");
    // A continuation cursor must come from our own completed job, never client-supplied URLs.
    let cursor = null;
    if (input.continueJobId) {
      const previous = this.store
        .read(owner)
        .jobs.find(
          (j) =>
            j.id === input.continueJobId &&
            j.projectId === projectId &&
            j.status === "completed" &&
            j.nextCursor,
        );
      if (!previous) throw fail("找不到可继续的批次");
      cursor = previous.nextCursor;
      for (const key of Object.keys(filters))
        if (
          String(filters[key]) !==
          String(
            previous.input[key] ||
              (key === "documentType" ? "journal-article" : ""),
          )
        )
          throw fail("继续采集必须沿用原筛选条件");
      if (
        query !== previous.input.query ||
        input.source !== previous.input.source ||
        (input.since || "") !== (previous.input.since || "")
      )
        throw fail("继续采集必须沿用原批次查询");
    }
    return this.enqueue(owner, projectId, {
      type: "search",
      source: input.source,
      query,
      limit,
      since: input.since || "",
      ...filters,
      cursor,
    });
  }
  importFile(owner, projectId, buffer, name) {
    if (!buffer?.length || buffer.length > 5 * 1024 * 1024)
      throw fail("请上传 5 MB 以内的 JSONL 文件");
    const lines = buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((l) => l.trim());
    if (!lines.length || lines.length > 500)
      throw fail("每批需包含 1–500 行 JSONL");
    const items = lines.map((line, index) => {
      try {
        return normalizeImport(JSON.parse(line));
      } catch (error) {
        throw fail("第 " + (index + 1) + " 行：" + error.message);
      }
    });
    // Validate all records before accepting a batch; malformed files cannot partially write.
    if (
      items.reduce((n, d) => n + JSON.stringify(d).length, 0) >
      6 * 1024 * 1024
    )
      throw fail("规范化内容超过单批上限");
    projectIn(this.store.read(owner), projectId);
    const rawHash = this.store.putRaw(owner, buffer);
    return this.enqueue(owner, projectId, {
      type: "import",
      source: "import",
      filename: text(name, 180),
      rawHash,
      limit: items.length,
    });
  }
  enqueue(owner, projectId, input) {
    const job = this.store.update(owner, (s) => {
      projectIn(s, projectId);
      if (
        s.jobs.filter((j) => ["queued", "running"].includes(j.status)).length >=
        3
      )
        throw fail("已有 3 个采集任务，请等待完成", 429);
      if (s.jobs.length >= 500)
        throw fail("采集任务已达 500 批，请联系管理员归档", 409);
      const job = {
        id: randomUUID(),
        projectId,
        type: input.type,
        source: input.source,
        query: input.query || input.filename,
        status: "queued",
        received: 0,
        added: 0,
        updated: 0,
        unchanged: 0,
        rejected: 0,
        errors: [],
        createdAt: now(),
        input,
      };
      s.jobs.unshift(job);
      return job;
    });
    this.queue.push({ owner, jobId: job.id });
    this.pump();
    return { id: job.id, status: job.status };
  }
  pump() {
    while (this.running < 2 && this.queue.length) {
      const item = this.queue.shift();
      this.running++;
      setImmediate(() =>
        this.run(item.owner, item.jobId).finally(() => {
          this.running--;
          this.pump();
        }),
      );
    }
  }
  async run(owner, jobId) {
    const job = this.store.update(owner, (s) => {
      const j = s.jobs.find((j) => j.id === jobId);
      j.status = "running";
      j.startedAt = now();
      return j;
    });
    try {
      let result;
      if (job.type === "search")
        result = await searchSource(
          job.input.source,
          job.input,
          this.env,
          this.options,
        );
      else {
        const buffer = this.store.raw(owner, job.input.rawHash);
        result = {
          rawHash: job.input.rawHash,
          items: buffer
            .toString()
            .replace(/^\uFEFF/, "")
            .split(/\r?\n/)
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l)),
          normalize: normalizeImport,
        };
      }
      const rawHash = result.rawHash || this.store.putRaw(owner, result.raw);
      this.store.update(owner, (s) => {
        const j = s.jobs.find((j) => j.id === jobId);
        j.rawHash = rawHash;
        j.received = result.items.length;
        j.total = result.total || null;
        for (const [index, raw] of result.items.entries()) {
          try {
            const normalized = result.normalize(raw);
            if (job.type === "search") {
              const terms = (job.input.requiredTerms || "")
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);
              const hay = (
                normalized.title +
                " " +
                normalized.abstract
              ).toLowerCase();
              const excluded =
                (job.input.documentType === "journal-article" &&
                  normalized.documentType === "peer-review") ||
                (job.input.yearFrom &&
                  (!normalized.year ||
                    normalized.year < Number(job.input.yearFrom))) ||
                (job.input.yearTo &&
                  (!normalized.year ||
                    normalized.year > Number(job.input.yearTo))) ||
                terms.some((term) => !hay.includes(term));
              if (excluded) {
                j.filtered = (j.filtered || 0) + 1;
                continue;
              }
            }
            const contentHash = hash(JSON.stringify(raw));
            // Search scores and indexing timestamps are not document revisions.
            // Keep the raw hash for provenance, but deduplicate the normalized content.
            const semanticHash = hash(
              JSON.stringify({
                ...normalized,
                evidence: normalized.evidence?.map(
                  ({ id, ...evidence }) => evidence,
                ),
              }),
            );
            const existing = s.documents.find(
              (d) => d.projectId === job.projectId && d.key === normalized.key,
            );
            if (
              existing?.versions.some(
                (v) =>
                  (v.hash === contentHash || v.semanticHash === semanticHash) &&
                  v.source === normalized.source,
              )
            ) {
              j.unchanged++;
              continue;
            }
            const version = {
              hash: contentHash,
              semanticHash,
              source: normalized.source,
              sourceId: normalized.sourceId,
              rawHash,
              item: index + 1,
              at: now(),
              jobId,
            };
            if (existing) {
              // Keep the inspected content immutable. Differing versions are retained for comparison;
              // never silently replace reviewed evidence or its rights with a new source's text.
              existing.versions.push(version);
              for (const location of normalized.fulltextLocations || [])
                if (
                  !existing.fulltextLocations.some(
                    (l) => l.url === location.url,
                  )
                )
                  existing.fulltextLocations.push(location);
              if (!existing.pages?.length && normalized.pages?.length) {
                existing.pages = normalized.pages;
                existing.evidence = normalized.evidence;
                existing.contentRawHash = rawHash;
                existing.demo = existing.demo || normalized.demo;
                existing.rights = { rag: false, training: false, basis: "" };
              }
              existing.updatedAt = now();
              j.updated++;
            } else {
              if (s.documents.length >= 3000)
                throw fail("资料数量已达 3000 条，请联系管理员扩容");
              s.documents.push({
                ...normalized,
                id: randomUUID(),
                projectId: job.projectId,
                versions: [version],
                createdAt: now(),
                updatedAt: now(),
                contentRawHash: normalized.pages?.length ? rawHash : null,
                rights: { rag: false, training: false, basis: "" },
              });
              j.added++;
            }
          } catch (error) {
            j.rejected++;
            j.errors.push({ item: index + 1, message: error.message });
          }
        }
        j.status = j.rejected ? "partial" : "completed";
        j.finishedAt = now();
        j.nextCursor = result.cursor || null;
        return j;
      });
    } catch (error) {
      this.store.update(owner, (s) => {
        const j = s.jobs.find((j) => j.id === jobId);
        j.status = "failed";
        j.error = error.message;
        j.finishedAt = now();
        return j;
      });
    }
  }
  retry(owner, projectId, id, next = false) {
    const state = this.store.read(owner);
    projectIn(state, projectId);
    const previous = state.jobs.find(
      (j) => j.id === id && j.projectId === projectId,
    );
    if (!previous || ["queued", "running"].includes(previous.status))
      throw fail("该任务不能重试");
    if (next)
      return this.startSearch(owner, projectId, {
        ...previous.input,
        continueJobId: id,
      });
    return this.enqueue(owner, projectId, previous.input);
  }
  setRights(owner, projectId, id, input) {
    if (input.confirm !== true || text(input.basis, 2000).length < 8)
      throw fail("请填写具体授权依据（至少 8 个字符）并明确确认使用范围");
    if (typeof input.rag !== "boolean" || typeof input.training !== "boolean")
      throw fail("请明确选择检索与训练用途");
    return this.store.update(owner, (s) => {
      const d = documentIn(s, projectId, id);
      if (!d.pages?.length && (input.rag || input.training))
        throw fail("尚未入库正文，不能授权正文用途");
      d.rights = {
        rag: input.rag,
        training: input.training,
        basis: text(input.basis, 2000),
        actor: owner,
        at: now(),
        contentRawHash: d.contentRawHash,
      };
      s.audit.push({
        id: randomUUID(),
        projectId,
        at: now(),
        action: "已更新内容许可：" + d.title,
        documentId: id,
      });
      return d.rights;
    });
  }
  review(owner, projectId, id, evidenceId, reviewed) {
    if (typeof reviewed !== "boolean") throw fail("请明确复核状态");
    return this.store.update(owner, (s) => {
      const d = documentIn(s, projectId, id);
      const evidence = d.evidence?.find((e) => e.id === evidenceId);
      if (!evidence) throw fail("证据不存在", 404);
      evidence.reviewed = reviewed;
      evidence.reviewedAt = now();
      evidence.reviewer = owner;
      s.audit.push({
        id: randomUUID(),
        projectId,
        at: now(),
        action: (reviewed ? "已复核" : "撤销复核") + "材料证据：" + d.title,
        documentId: id,
      });
      return evidence;
    });
  }
  async locate(owner, projectId, id) {
    const d = this.detail(owner, projectId, id);
    if (!d.doi) throw fail("此资料没有 DOI");
    if (!this.env.UNPAYWALL_EMAIL)
      throw fail("开放获取查询尚未配置，请联系管理员", 409);
    const url = new URL(
      "https://api.unpaywall.org/v2/" + encodeURIComponent(d.doi),
    );
    url.searchParams.set("email", this.env.UNPAYWALL_EMAIL);
    const raw = await requestJson(url, this.options);
    const rawHash = this.store.putRaw(owner, raw);
    return this.store.update(owner, (s) => {
      const doc = documentIn(s, projectId, id);
      doc.oaCheckedAt = now();
      for (const l of raw.oa_locations || []) {
        const location = {
          url: safeUrl(l.url_for_pdf || l.url),
          license: text(l.license),
          version: text(l.version),
          rawHash,
        };
        if (
          location.url &&
          !doc.fulltextLocations.some((x) => x.url === location.url)
        )
          doc.fulltextLocations.push(location);
      }
      return {
        locations: doc.fulltextLocations.length,
        checkedAt: doc.oaCheckedAt,
      };
    });
  }
  async uploadContent(owner, projectId, id, buffer, filename) {
    this.detail(owner, projectId, id);
    if (!buffer?.length || buffer.length > 5 * 1024 * 1024)
      throw fail("正文文件必须在 5 MB 以内");
    let pages;
    if (buffer.subarray(0, 5).toString() === "%PDF-") {
      // pdf-parse v2 supplies its own Node runtime. Do not load the rendering
      // agent here: local text extraction must not initialize LLM integrations.
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const info = await parser.getInfo();
        if (info.total > 200) throw fail("单份 PDF 最多 200 页");
        const result = await parser.getText();
        pages = result.pages.map((p) => ({ page: p.num, text: p.text }));
      } catch (error) {
        throw fail(
          error.status
            ? error.message
            : "无法解析 PDF。请使用含文本层、未加密的 PDF；扫描件需要另行 OCR。",
        );
      } finally {
        await parser.destroy();
      }
    } else if (/\.txt$/i.test(filename)) {
      pages = [{ page: 1, text: buffer.toString("utf8") }];
    } else throw fail("支持含文本层的 PDF 或 UTF-8 TXT");
    if (pages.reduce((n, p) => n + p.text.length, 0) > 1_000_000)
      throw fail("正文超过 100 万字符，请拆分文件");
    if (!pages.some((p) => p.text.trim().length >= 20))
      throw fail("未提取到足够正文；扫描 PDF 需要 OCR");
    const rawHash = this.store.putRaw(owner, buffer);
    return this.store.update(owner, (s) => {
      const d = documentIn(s, projectId, id);
      if (d.contentRawHash === rawHash)
        return { pages: d.pages.length, unchanged: true };
      // Replacement is explicit; invalidate evidence and rights tied to the old version.
      d.pages = pages;
      d.evidence = [];
      d.contentRawHash = rawHash;
      d.rights = { rag: false, training: false, basis: "" };
      d.versions.push({
        hash: rawHash,
        rawHash,
        source: "uploaded-content",
        sourceId: text(filename),
        at: now(),
      });
      d.updatedAt = now();
      s.audit.push({
        id: randomUUID(),
        projectId,
        at: now(),
        action: "已导入正文并重置旧证据与用途许可：" + d.title,
        documentId: id,
      });
      return { pages: pages.length, unchanged: false };
    });
  }
  addEvidence(owner, projectId, id, input) {
    return this.store.update(owner, (s) => {
      const d = documentIn(s, projectId, id);
      if ((d.evidence?.length || 0) >= 100)
        throw fail("每份资料最多 100 条证据");
      const page = Number(input.page);
      const quote = String(input.quote || "").trim();
      if (
        !evidenceKinds.includes(input.kind) ||
        !quote ||
        quote.length > 4000 ||
        !d.pages?.find((p) => p.page === page)?.text.includes(quote)
      )
        throw fail("请从所选页复制原文，引用必须与正文完全匹配");
      const e = {
        id: randomUUID(),
        kind: input.kind,
        page,
        quote,
        material: text(input.material),
        composition: text(input.composition),
        basis: ["wt%", "at%"].includes(input.basis)
          ? input.basis
          : "unspecified",
        process: text(input.process, 2000),
        property: text(input.property),
        value: text(input.value),
        unit: text(input.unit),
        conditions: text(input.conditions, 2000),
        reviewed: false,
      };
      d.evidence = [...(d.evidence || []), e];
      return e;
    });
  }
  export(owner, projectId, purpose) {
    if (!["catalog", "rag", "training", "gaps"].includes(purpose))
      throw fail("未知导出用途");
    const s = this.store.read(owner);
    const p = projectIn(s, projectId);
    if (purpose === "training" && p.mode !== "contribute")
      throw fail("私密项目禁止导出到公司模型训练候选", 403);
    const docs = s.documents.filter((d) => d.projectId === projectId);
    const selected =
      purpose === "training"
        ? docs.filter((d) => eligibility(p, d).allowed)
        : purpose === "rag"
          ? docs.filter(
              (d) => d.rights.rag && d.evidence?.some((e) => e.reviewed),
            )
          : purpose === "gaps"
            ? docs.filter((d) => !d.pages?.length)
            : docs;
    if (["rag", "training"].includes(purpose) && !selected.length)
      throw fail("没有符合内容许可与证据复核要求的资料", 409);
    const result = {
      schemaVersion: 1,
      project: p.name,
      projectId,
      purpose,
      exportedAt: now(),
      trainingSubmitted: false,
      records: selected.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        doi: d.doi,
        publicationNumber: d.publicationNumber,
        familyId: d.familyId,
        url: d.url,
        sources: d.versions.map((v) => ({
          source: v.source,
          sourceId: v.sourceId,
          hash: v.hash,
          at: v.at,
        })),
        ...(purpose === "gaps"
          ? {
              reason: d.fulltextLocations.length
                ? "已定位，尚未取得正文与使用许可"
                : "缺少可用全文位置",
              locations: d.fulltextLocations,
            }
          : {}),
        ...(["rag", "training"].includes(purpose)
          ? {
              demo: Boolean(d.demo),
              rights: d.rights,
              evidence: d.evidence.filter((e) => e.reviewed),
              contentHash: d.contentRawHash,
            }
          : {}),
      })),
    };
    this.store.update(owner, (state) => {
      state.audit.push({
        id: randomUUID(),
        projectId,
        at: now(),
        action:
          "导出 " +
          purpose +
          "：" +
          selected.length +
          " 条，未调用模型或训练服务",
      });
      return true;
    });
    return result;
  }
}
module.exports = {
  KnowledgeService,
  normalizeImport,
  eligibility,
  projectIn,
  documentIn,
};
