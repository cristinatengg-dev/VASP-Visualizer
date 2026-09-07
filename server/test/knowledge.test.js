const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { KnowledgeStore } = require("../src/knowledge/store");
const {
  KnowledgeService,
  normalizeImport,
} = require("../src/knowledge/service");
const {
  requestJson,
  normalizeCrossref,
  normalizeOpenAlex,
} = require("../src/knowledge/connectors");
const { createKnowledgeRouter } = require("../src/knowledge/router");

function twoPagePdf() {
  const streams = [
    "BT /F1 12 Tf 50 700 Td (Alloy A measured 10 MPa at 300 K.) Tj ET",
    "BT /F1 12 Tf 50 700 Td (Alloy B measured 20 MPa at 400 K.) Tj ET",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...streams.map(
      (s) =>
        "<< /Length " +
        Buffer.byteLength(s) +
        " >>\nstream\n" +
        s +
        "\nendstream",
    ),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += i + 1 + " 0 obj\n" + object + "\nendobj\n";
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    "xref\n0 8\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("");
  pdf += "trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf);
}

function setup(t, options) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "eliangmat-knowledge-test-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new KnowledgeStore(directory);
  const service = new KnowledgeService(store, {}, options);
  const project = service.createProject("A", "测试");
  return { directory, store, service, project };
}
async function waitForJob(service, owner, project, id) {
  for (let i = 0; i < 200; i++) {
    const j = service.project(owner, project).jobs.find((j) => j.id === id);
    if (!["running", "queued"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Job did not finish");
}
function paper(overrides = {}) {
  return {
    kind: "paper",
    title: "Unit-test record",
    doi: "10.1234/test-evidence",
    source: "test",
    sourceUrl: "https://example.org/test",
    pages: [
      {
        page: 1,
        text: "Alloy A contains Ni 50 at%. Test value is 10 MPa at 300 K.",
      },
    ],
    evidence: [
      {
        kind: "measurement",
        page: 1,
        quote: "Test value is 10 MPa at 300 K.",
        material: "Alloy A",
        value: "10",
        unit: "MPa",
        conditions: "300 K",
        basis: "at%",
      },
    ],
    ...overrides,
  };
}
async function importRecord(service, project, record = paper()) {
  const job = service.importFile(
    "A",
    project.id,
    Buffer.from(JSON.stringify(record)),
    "test.jsonl",
  );
  await waitForJob(service, "A", project.id, job.id);
  return service.detail(
    "A",
    project.id,
    service.project("A", project.id).documents[0].id,
  );
}

test("tenant isolation covers project reads, updates, raw files, imports and exports", async (t) => {
  const { service, store, project } = setup(t);
  const d = await importRecord(service, project);
  assert.deepEqual(service.overview("B").projects, []);
  for (const read of [
    () => service.project("B", project.id),
    () => service.detail("B", project.id, d.id),
    () => service.export("B", project.id, "catalog"),
    () => service.setMode("B", project.id, "contribute", true),
    () =>
      service.importFile(
        "B",
        project.id,
        Buffer.from(JSON.stringify(paper())),
        "x",
      ),
  ])
    assert.throws(read, { status: 404 });
  assert.throws(() => store.raw("B", d.versions[0].rawHash));
  assert.throws(() => store.raw("A", "../state.json"), { status: 404 });
});

test("DOI dedup is normalized; same batch is idempotent; new source keeps reviewed content", async (t) => {
  const { service, project } = setup(t);
  const d = await importRecord(service, project);
  service.review("A", project.id, d.id, d.evidence[0].id, true);
  service.setRights("A", project.id, d.id, {
    confirm: true,
    rag: true,
    training: true,
    basis: "test-only self-owned rights",
  });
  const retry = service.retry(
    "A",
    project.id,
    service.project("A", project.id).jobs[0].id,
  );
  const result = await waitForJob(service, "A", project.id, retry.id);
  assert.equal(result.unchanged, 1);
  assert.equal(result.added, 0);
  await importRecord(
    service,
    project,
    paper({
      doi: "https://doi.org/10.1234/TEST-EVIDENCE",
      source: "another-source",
      pages: [
        {
          page: 1,
          text: "Different content should not silently replace the accepted source.",
        },
      ],
      evidence: [],
    }),
  );
  const updated = service.detail("A", project.id, d.id);
  assert.equal(service.project("A", project.id).documents.length, 1);
  assert.equal(updated.versions.length, 2);
  assert.equal(updated.evidence[0].reviewed, true);
  assert.equal(updated.rights.rag, true);
  assert.match(updated.pages[0].text, /300 K/);
});

test("patent publication kind codes stay distinct even within the same family", async (t) => {
  const { service, project } = setup(t);
  const common = {
    kind: "patent",
    title: "Patent fixture",
    source: "test",
    sourceUrl: "https://example.org/patent",
    familyId: "same",
  };
  await importRecord(service, project, {
    ...common,
    publicationNumber: "US1234567A1",
  });
  await importRecord(service, project, {
    ...common,
    publicationNumber: "US1234567B2",
  });
  assert.equal(service.project("A", project.id).documents.length, 2);
});

test("private mode, content training rights and evidence review are independent server gates", async (t) => {
  const { service, project } = setup(t);
  const d = await importRecord(service, project);
  assert.throws(() => service.export("A", project.id, "training"), {
    status: 403,
  });
  assert.throws(() => service.setMode("A", project.id, "contribute", false), {
    status: 400,
  });
  service.setMode("A", project.id, "contribute", true);
  assert.throws(() => service.export("A", project.id, "training"), {
    status: 409,
  });
  service.setRights("A", project.id, d.id, {
    confirm: true,
    rag: false,
    training: true,
    basis: "self-owned test fixture grant",
  });
  assert.throws(() => service.export("A", project.id, "training"), {
    status: 409,
  });
  service.review("A", project.id, d.id, d.evidence[0].id, true);
  assert.equal(service.export("A", project.id, "training").records.length, 1);
  assert.throws(() => service.export("A", project.id, "rag"), { status: 409 });
  service.setMode("A", project.id, "private");
  assert.throws(() => service.export("A", project.id, "training"), {
    status: 403,
  });
  assert.equal(
    service.project("A", project.id).documents[0].training.allowed,
    false,
  );
});

test("demo records never become training candidates; unknown metadata license grants no rights", async (t) => {
  const { service, project } = setup(t);
  const d = await importRecord(
    service,
    project,
    paper({ demo: true, license: "CC0" }),
  );
  assert.equal(d.rights.training, false);
  service.setMode("A", project.id, "contribute", true);
  service.setRights("A", project.id, d.id, {
    confirm: true,
    rag: true,
    training: true,
    basis: "self-owned test data",
  });
  service.review("A", project.id, d.id, d.evidence[0].id, true);
  assert.throws(() => service.export("A", project.id, "training"), {
    status: 409,
  });
  assert.equal(service.export("A", project.id, "rag").records[0].demo, true);
});

test("invalid import is all-or-nothing and citations must occur on their stated page", (t) => {
  const { service, project } = setup(t);
  const invalid = paper({
    evidence: [
      { kind: "measurement", page: 2, quote: "Test value is 10 MPa at 300 K." },
    ],
  });
  assert.throws(
    () =>
      service.importFile(
        "A",
        project.id,
        Buffer.from(JSON.stringify(paper()) + "\n" + JSON.stringify(invalid)),
        "mixed.jsonl",
      ),
    /第 2 行/,
  );
  assert.equal(service.project("A", project.id).documents.length, 0);
  assert.equal(service.project("A", project.id).jobs.length, 0);
  assert.throws(
    () => normalizeImport(paper({ sourceUrl: "javascript:alert(1)" })),
    /sourceUrl/,
  );
  assert.throws(
    () =>
      normalizeImport(
        paper({
          pages: [
            { page: 1, text: "x" },
            { page: 1, text: "y" },
          ],
        }),
      ),
    /唯一/,
  );
});

test("replacing content invalidates old evidence and permission; same bytes are a no-op", async (t) => {
  const { service, project } = setup(t);
  const d = await importRecord(service, project);
  service.setRights("A", project.id, d.id, {
    confirm: true,
    rag: true,
    training: true,
    basis: "self-owned test content",
  });
  const buffer = Buffer.from(
    "This is revised text. Alloy B achieved 12 MPa at 400 K.",
  );
  const result = await service.uploadContent(
    "A",
    project.id,
    d.id,
    buffer,
    "updated.txt",
  );
  assert.equal(result.pages, 1);
  let updated = service.detail("A", project.id, d.id);
  assert.equal(updated.evidence.length, 0);
  assert.equal(updated.rights.training, false);
  const e = service.addEvidence("A", project.id, d.id, {
    kind: "measurement",
    page: 1,
    quote: "Alloy B achieved 12 MPa at 400 K.",
  });
  service.review("A", project.id, d.id, e.id, true);
  assert.equal(
    (await service.uploadContent("A", project.id, d.id, buffer, "updated.txt"))
      .unchanged,
    true,
  );
  updated = service.detail("A", project.id, d.id);
  assert.equal(updated.evidence[0].reviewed, true);
  assert.throws(
    () =>
      service.addEvidence("A", project.id, d.id, {
        kind: "simulation",
        page: 1,
        quote: "fabricated quote",
      }),
    /完全匹配/,
  );
});

test("raw provenance and data survive restart; unfinished jobs become interrupted", async (t) => {
  const { store, service, project, directory } = setup(t);
  const d = await importRecord(service, project);
  store.update("A", (s) => {
    s.jobs.push({ id: "unfinished", projectId: project.id, status: "running" });
    return true;
  });
  const restarted = new KnowledgeService(new KnowledgeStore(directory));
  assert.equal(restarted.project("A", project.id).documents.length, 1);
  assert.equal(
    restarted.project("A", project.id).jobs.find((j) => j.id === "unfinished")
      .status,
    "interrupted",
  );
  assert.deepEqual(
    JSON.parse(restarted.store.raw("A", d.versions[0].rawHash)),
    paper(),
  );
});

test("Crossref live-shaped response ingests, cursor continues, failures are visible and retryable", async (t) => {
  const calls = [];
  let failUpstream = false;
  const fetcher = async (url) => {
    calls.push(new URL(url));
    if (failUpstream) return new Response("{}", { status: 503 });
    return Response.json({
      message: {
        items: [
          {
            DOI: "10.1234/live",
            score: 20 + calls.length,
            indexed: { timestamp: Date.now() },
            title: ["A study"],
            published: { "date-parts": [[2025]] },
          },
        ],
        "total-results": 150,
        "next-cursor": "safe-cursor",
      },
    });
  };
  const { service, project } = setup(t, { fetcher, sleep: async () => {} });
  const job = service.startSearch("A", project.id, {
    source: "crossref",
    query: "alloy",
    limit: 1,
  });
  assert.equal(
    (await waitForJob(service, "A", project.id, job.id)).status,
    "completed",
  );
  const continuation = service.retry("A", project.id, job.id, true);
  assert.equal(
    (await waitForJob(service, "A", project.id, continuation.id)).unchanged,
    1,
  );
  assert.equal(calls[1].searchParams.get("cursor"), "safe-cursor");
  assert.equal(calls[0].searchParams.get("sort"), "score");
  assert.equal(calls[0].searchParams.get("order"), "desc");
  failUpstream = true;
  const failed = service.retry("A", project.id, job.id);
  assert.equal(
    (await waitForJob(service, "A", project.id, failed.id)).status,
    "failed",
  );
  assert.equal(calls.length, 5);
  assert.throws(
    () =>
      service.startSearch("A", project.id, { source: "cnipa", query: "alloy" }),
    { status: 409 },
  );
});

test("connector backoff obeys retry-after and never prints credential-bearing URLs", async () => {
  const waits = [];
  let calls = 0;
  const fetcher = async () =>
    ++calls < 3
      ? new Response("{}", { status: 429, headers: { "retry-after": "1" } })
      : Response.json({ ok: true });
  assert.equal(
    (
      await requestJson("https://api.openalex.org/works", {
        fetcher,
        sleep: async (ms) => waits.push(ms),
      })
    ).ok,
    true,
  );
  assert.deepEqual(waits, [1000, 1000]);
  await assert.rejects(
    requestJson("https://api.openalex.org/works?api_key=secret", {
      fetcher: async () =>
        new Response("", { status: 429, headers: { "retry-after": "60" } }),
    }),
    /限流/,
  );
  await assert.rejects(
    requestJson("https://api.openalex.org/works?api_key=secret", {
      fetcher: async () => {
        throw new Error("secret");
      },
      sleep: async () => {},
    }),
    (error) => !error.message.includes("secret"),
  );
});

test("normalizers handle absent abstracts and sanitize unsupported URL protocols", () => {
  const crossref = normalizeCrossref({
    DOI: "10.1234/X",
    title: ["<b>Study</b>"],
    link: [{ URL: "javascript:alert(1)" }],
  });
  assert.equal(crossref.title, "Study");
  assert.equal(crossref.fulltextLocations.length, 0);
  const alex = normalizeOpenAlex({
    id: "https://openalex.org/W1",
    title: "Test",
    abstract_inverted_index: { alloy: [1], Test: [0] },
    locations: [
      { is_oa: true, pdf_url: "https://example.org/file", license: "cc-by" },
    ],
  });
  assert.equal(alex.abstract, "Test alloy");
  assert.equal(alex.fulltextLocations[0].license, "cc-by");
  assert.equal(alex.rights, undefined);
});

test("HTTP routes require identity and client header; cross-tenant IDs and raw hashes are denied", async (t) => {
  const { service, project } = setup(t);
  const d = await importRecord(service, project);
  const app = express();
  app.use(express.json());
  app.use(
    "/api/knowledge",
    createKnowledgeRouter(service, (req, _res, next) => {
      req.knowledgeOwner = req.get("X-Test-Identity");
      next();
    }),
  );
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port + "/api/knowledge";
  assert.equal((await fetch(base)).status, 401);
  assert.equal(
    (
      await fetch(base + "/projects", {
        method: "POST",
        headers: { "X-Test-Identity": "A" },
      })
    ).status,
    403,
  );
  const headers = {
    "X-Test-Identity": "B",
    "X-EliangMat-Client": "knowledge-v1",
  };
  assert.equal(
    (await fetch(base + "/projects/" + project.id, { headers })).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        base +
          "/projects/" +
          project.id +
          "/documents/" +
          d.id +
          "/original/" +
          d.versions[0].rawHash,
        { headers },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + "/projects/" + project.id + "/export", {
        method: "POST",
        headers: {
          ...headers,
          "X-Test-Identity": "A",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ purpose: "training", ownerId: "B" }),
      })
    ).status,
    403,
  );
});

test("PDF parser preserves actual page numbers for evidence citations", async (t) => {
  const { service, project } = setup(t);
  const d = await importRecord(service, project);
  const result = await service.uploadContent(
    "A",
    project.id,
    d.id,
    twoPagePdf(),
    "two-pages.pdf",
  );
  assert.equal(result.pages, 2);
  const detail = service.detail("A", project.id, d.id);
  assert.deepEqual(
    detail.pages.map((p) => p.page),
    [1, 2],
  );
  assert.match(detail.pages[1].text, /20 MPa at 400 K/);
  const e = service.addEvidence("A", project.id, d.id, {
    kind: "measurement",
    page: 2,
    quote: "Alloy B measured 20 MPa at 400 K.",
  });
  assert.equal(e.page, 2);
  assert.throws(
    () =>
      service.addEvidence("A", project.id, d.id, {
        kind: "measurement",
        page: 1,
        quote: "Alloy B measured 20 MPa at 400 K.",
      }),
    /完全匹配/,
  );
});
