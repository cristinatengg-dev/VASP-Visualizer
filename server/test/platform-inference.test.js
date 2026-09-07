const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { KnowledgeStore } = require("../src/knowledge/store");
const { PlatformService } = require("../src/platform/service");
const { createGeminiGateway } = require("../src/platform/model-gateway");
const { createPlatformRouter } = require("../src/platform/router");
let seq = 0;
const request = (message, threadId = "") => ({
  message,
  threadId,
  requestId: "inference-test-" + ++seq,
});
const completion = {
  text: "根据提供的资料，尚需确认实际测试条件。",
  actualModel: "gemini-test",
  tokens: { input: 121, cached: 0, output: 32, total: 153 },
  finishReason: "stop",
};
function setup(t, complete = async () => completion) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eliangmat-inference-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new KnowledgeStore(root);
  const gateway = createGeminiGateway({
    GEMINI_API_KEY: "unit-test-only",
    GEMINI_TEXT_MODEL: "gemini-test",
  });
  gateway.complete = complete;
  const svc = new PlatformService(store, { gateway, development: true });
  const id = svc.createProject(
    "A",
    { name: "QA alloy", goal: "虚构软件测试，不是真实实验。", family: "Al-Cu" },
    "owner",
  ).id;
  const select = () =>
    svc.selectAssistantModel(
      "A",
      { model: "gemini", externalConsent: true },
      "owner",
    );
  return { store, svc, id, select, root, gateway };
}
test("Gemini transport uses scoped config, bounded output, real usage and sanitized failures", async () => {
  let sent;
  const gateway = createGeminiGateway(
    { GEMINI_API_KEY: "secret-for-test", GEMINI_TEXT_MODEL: "gemini-test" },
    async (url, init) => {
      sent = { url, ...init };
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            id: "provider-1",
            model: "gemini-test",
            choices: [
              { message: { content: "测试成功" }, finish_reason: "stop" },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
            },
          }),
      };
    },
  );
  const out = await gateway.complete([{ role: "user", content: "synthetic" }]);
  assert.equal(out.tokens.input, 11);
  assert.equal(out.tokens.cached, null);
  assert.equal(out.tokens.output, 7);
  assert.equal(JSON.parse(sent.body).max_tokens, 8192);
  await gateway.complete([], { maxOutputTokens: 1000000 });
  assert.equal(JSON.parse(sent.body).max_tokens, 8192);
  await gateway.complete([], { maxOutputTokens: 4096 });
  assert.equal(JSON.parse(sent.body).max_tokens, 4096);
  assert.equal(JSON.parse(sent.body).stream, false);
  assert.equal(sent.headers.Authorization, "Bearer secret-for-test");
  assert.ok(!JSON.stringify(gateway.info).includes("secret-for-test"));
  const bad = createGeminiGateway(
    { GEMINI_API_KEY: "secret-for-test" },
    async () => ({
      ok: false,
      status: 401,
      text: async () => "secret-for-test and private prompt",
    }),
  );
  await assert.rejects(
    bad.complete([]),
    (e) =>
      e.status === 502 &&
      !e.message.includes("secret-for-test") &&
      !e.message.includes("private prompt"),
  );
});
test("empty or invalid Gemini responses are failures, never fake success or zero usage", async () => {
  for (const raw of [
    "not json",
    '{"choices":[]}',
    '{"choices":[{"message":{"content":""}}]}',
  ]) {
    const g = createGeminiGateway({ GEMINI_API_KEY: "test" }, async () => ({
      ok: true,
      text: async () => raw,
    }));
    await assert.rejects(g.complete([]), { status: 502 });
  }
});
test("project execution requires current gateway consent; legacy generic consent cannot authorize it", async (t) => {
  let calls = 0;
  const { svc, id, store } = setup(t, async () => {
    calls++;
    return completion;
  });
  svc.selectModel(
    "A",
    id,
    { model: "reasoning", externalConsent: true },
    "owner",
  );
  assert.throws(() => svc.selectModel("A", id, { model: "gemini" }, "owner"));
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  const result = await svc.reply("A", id, request("测试接口"), "owner");
  assert.equal(result.at(-1).answerMode, "model");
  assert.equal(calls, 1);
  assert.equal(store.read("A").projects[0].mode, "private");
  assert.equal(svc.overview("A").wallet.balance, 0);
  assert.equal(svc.overview("A").inferenceUsage[0].tokens.input, 121);
  assert.equal(svc.overview("A").inferenceUsage[0].cost, null);
  await assert.rejects(svc.reply("B", id, request("测试"), "owner"), {
    status: 404,
  });
  await assert.rejects(svc.reply("A", id, request("测试"), "finance"), {
    status: 403,
  });
});
test("account Gemini excludes private project memory until explicit gateway consent and isolates other accounts", async (t) => {
  let sent;
  const { svc, id, select } = setup(t, async (m) => {
    sent = JSON.stringify(m);
    return completion;
  });
  svc.memory.add(
    "A",
    null,
    { title: "ACCOUNT_QA", content: "ACCOUNT_QA account-note", kind: "fact" },
    "owner",
  );
  svc.memory.add(
    "A",
    id,
    { title: "ACCOUNT_QA private", content: "PROJECT_SECRET_QA", kind: "fact" },
    "owner",
  );
  svc.memory.add(
    "B",
    null,
    {
      title: "ACCOUNT_QA foreign",
      content: "OTHER_CUSTOMER_SECRET",
      kind: "fact",
    },
    "owner",
  );
  const d = select();
  await svc.reply(
    "A",
    null,
    request("ACCOUNT_QA 是什么？", d.threadId),
    "owner",
  );
  assert.ok(sent.includes("account-note"));
  assert.ok(!sent.includes("PROJECT_SECRET_QA"));
  assert.ok(!sent.includes("OTHER_CUSTOMER_SECRET"));
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  const fresh = svc.selectConversation("A", "", "owner");
  await svc.reply(
    "A",
    null,
    request("ACCOUNT_QA 是什么？", fresh.threadId),
    "owner",
  );
  assert.ok(sent.includes("PROJECT_SECRET_QA"));
  assert.ok(!sent.includes("OTHER_CUSTOMER_SECRET"));
});
test("source revocation hides generated text and removes it from later model context", async (t) => {
  let sent;
  const { svc, id } = setup(t, async (m) => {
    sent = JSON.stringify(m);
    return { ...completion, text: "SECRET_DERIVED_RESPONSE" };
  });
  const item = svc.memory.add(
    "A",
    id,
    { title: "QA_KEEP", content: "REVOKED_MATERIAL_FACT", kind: "fact" },
    "owner",
  );
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  await svc.reply("A", id, request("QA_KEEP 的事实是什么？"), "owner");
  assert.ok(sent.includes("REVOKED_MATERIAL_FACT"));
  // Use the persisted suppression mechanism, simulating a permission change during the next read.
  svc.store.update("A", (s) => {
    s.memory.projects[id].items.find((i) => i.id === item.id).enabled = false;
  });
  const msg = svc.project("A", id, "owner").workflow.messages.at(-1);
  assert.equal(msg.contextStale, true);
  assert.ok(!msg.text.includes("SECRET_DERIVED_RESPONSE"));
  await svc.reply("A", id, request("继续介绍 QA_KEEP"), "owner");
  assert.ok(!sent.includes("SECRET_DERIVED_RESPONSE"));
  assert.ok(!sent.includes("REVOKED_MATERIAL_FACT"));
});
test("same request is idempotent, in-flight duplicate cannot trigger another paid call, thread change is checked", async (t) => {
  let release,
    calls = 0;
  const { svc, select } = setup(t, () => {
    calls++;
    return new Promise((r) => (release = r));
  });
  select();
  const thread = svc.selectConversation("A", "", "owner").threadId;
  const input = request("测试幂等", thread);
  const pending = svc.reply("A", null, input, "owner");
  await assert.rejects(svc.reply("A", null, input, "owner"), { status: 409 });
  await assert.rejects(
    svc.reply("A", null, request("第二次", thread), "owner"),
    { status: 409 },
  );
  release(completion);
  await pending;
  await svc.reply("A", null, input, "owner");
  assert.equal(calls, 1);
  await assert.rejects(
    svc.reply("A", null, { ...input, message: "different" }, "owner"),
    { status: 409 },
  );
  svc.selectConversation("A", "", "owner");
  await assert.rejects(
    svc.reply("A", null, request("旧页面", thread), "owner"),
    { status: 409 },
  );
});
test("failed calls keep input and failure trace without generated answer or debit; restart marks incomplete calls", async (t) => {
  const { svc, select, store, root } = setup(t, async () => {
    throw Object.assign(new Error("Gemini 接口超时"), { status: 502 });
  });
  const d = select();
  await assert.rejects(
    svc.reply("A", null, request("失败测试", d.threadId), "owner"),
    { status: 502 },
  );
  assert.equal(svc.conversation("A", "owner").messages.length, 2);
  assert.equal(svc.conversation("A", "owner").messages.at(-1).text, "");
  assert.equal(
    svc.conversation("A", "owner").messages.at(-1).responseStatus,
    "failed",
  );
  assert.equal(svc.overview("A").inferenceUsage[0].status, "failed");
  assert.equal(svc.overview("A").wallet.balance, 0);
  store.update("A", (s) => {
    s.platform.inferenceCalls[0].status = "running";
  });
  assert.equal(
    new KnowledgeStore(root).read("A").platform.inferenceCalls[0].status,
    "interrupted",
  );
});
test("Gemini user facts remain retrievable across conversations and memory opt-out removes long-term context", async (t) => {
  let sent;
  const { svc, select } = setup(t, async (m) => {
    sent = JSON.stringify(m);
    return completion;
  });
  let d = select();
  await svc.reply(
    "A",
    null,
    request("MEM-QA 约定是报告优先列温度和标准。", d.threadId),
    "owner",
  );
  d = svc.selectConversation("A", "", "owner");
  await svc.reply(
    "A",
    null,
    request("MEM-QA 的约定是什么？", d.threadId),
    "owner",
  );
  assert.ok(sent.includes("报告优先列温度和标准"));
  svc.store.update("A", (s) => {
    s.memory.customer.settings.enabled = false;
  });
  d = svc.selectConversation("A", "", "owner");
  await svc.reply(
    "A",
    null,
    request("MEM-QA 的约定是什么？", d.threadId),
    "owner",
  );
  assert.ok(!sent.includes("报告优先列温度和标准"));
});
test("HTTP conversation endpoint awaits Gemini and returns messages instead of serializing a Promise", async (t) => {
  const { svc, select } = setup(t);
  const d = select();
  const app = express();
  app.use(express.json());
  app.use(
    "/api/platform",
    createPlatformRouter(svc, (req, _res, next) => {
      req.knowledgeOwner = "A";
      req.platformRole = "owner";
      next();
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const res = await fetch(
    "http://127.0.0.1:" + server.address().port + "/api/platform/conversation",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-EliangMat-Client": "knowledge-v1",
      },
      body: JSON.stringify(request("接口测试", d.threadId)),
    },
  );
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.equal(rows.at(-1).text, completion.text);
  assert.equal(rows.at(-1).tokens.output, 32);
});

test("retry of the very first account request is idempotent even though a thread was created", async (t) => {
  let calls = 0;
  const { svc, select } = setup(t, async () => {
    calls++;
    return completion;
  });
  select();
  const input = request("首次无对话调用");
  await svc.reply("A", null, input, "owner");
  await svc.reply("A", null, input, "owner");
  assert.equal(calls, 1);
  assert.equal(svc.conversation("A", "owner").messages.length, 2);
});
test("switching a project back to local stops its use as external account context", async (t) => {
  let sent;
  const { svc, id, select } = setup(t, async (m) => {
    sent = JSON.stringify(m);
    return completion;
  });
  svc.memory.add(
    "A",
    id,
    { title: "GATE-QA", content: "STOP_EXPORT_FACT", kind: "fact" },
    "owner",
  );
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  select();
  svc.selectModel("A", id, { model: "materials" }, "owner");
  assert.equal(svc.overview("A").externalConsent[id], undefined);
  await svc.reply("A", null, request("GATE-QA 的事实是什么？"), "owner");
  assert.ok(!sent.includes("STOP_EXPORT_FACT"));
  assert.equal(svc.overview("A").projects[0].mode, "private");
});

const { Readable } = require("node:stream");
const { readChatStream } = require("../src/platform/model-stream");
test("stream parser handles fragmented UTF-8, usage-only tail and ignores raw reasoning channels", async () => {
  const event = (d) => "data: " + JSON.stringify(d) + "\r\n\r\n";
  const body = Buffer.from(
    event({
      choices: [
        {
          delta: {
            reasoning_content: "DO_NOT_DISPLAY_RAW_THOUGHT",
            reasoning_summary: "核对已提供的条件。",
          },
        },
      ],
    }) +
      event({
        model: "gemini-test",
        choices: [{ delta: { content: "中文答案" } }],
      }) +
      event({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
      event({
        choices: [],
        usage: { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 },
      }) +
      "data: [DONE]\n\n",
  );
  const chunks = Array.from({ length: Math.ceil(body.length / 7) }, (_, i) =>
    body.subarray(i * 7, (i + 1) * 7),
  );
  let text = "",
    summary = "";
  const result = await readChatStream(
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: Readable.from(chunks),
    },
    {
      model: "gemini-test",
      onDelta: (t) => (text += t),
      onSummary: (t) => (summary += t),
    },
  );
  assert.equal(text, "中文答案");
  assert.equal(summary, "核对已提供的条件。");
  assert.equal(result.tokens.input, 17);
  assert.equal(result.tokens.cached, null);
  assert.ok(!JSON.stringify(result).includes("DO_NOT_DISPLAY"));
  assert.equal(result.streamed, true);
});
test("early EOF and malformed stream frames fail instead of marking a partial answer complete", async () => {
  for (const body of [
    'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
    "data: not-json\n\n",
  ]) {
    await assert.rejects(
      readChatStream(
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: Readable.from([body]),
        },
        { model: "gemini-test" },
      ),
      { status: 502 },
    );
  }
});
test("process stages and answer deltas arrive before completion, and completed trace survives reload", async (t) => {
  const { svc, id, gateway, root } = setup(t);
  let release;
  const events = [];
  gateway.complete = async (_messages, opts) => {
    opts.onConnected();
    opts.onDelta("第一部分");
    await new Promise((r) => (release = r));
    opts.onDelta("第二部分");
    return { ...completion, text: "第一部分第二部分" };
  };
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  const pending = svc.reply("A", id, request("阶段测试"), "owner", {
    onEvent: (e) => events.push(e),
  });
  assert.deepEqual(
    events.filter((e) => e.type === "progress").map((e) => e.event.code),
    ["accepted", "memory", "request", "connected", "writing"],
  );
  assert.equal(events.find((e) => e.type === "delta").text, "第一部分");
  assert.equal(svc.overview("A").inferenceUsage[0].status, "running");
  release();
  await pending;
  const saved = new PlatformService(new KnowledgeStore(root), { gateway, development: true })
    .project("A", id, "owner")
    .workflow.messages.at(-1);
  assert.equal(saved.processTrail.at(-1).code, "completed");
  assert.equal(saved.text, "第一部分第二部分");
  assert.ok(saved.durationMs >= 0);
});
test("stopping generation preserves an explicitly incomplete reply and cancels the call", async (t) => {
  const { svc, id, gateway } = setup(t),
    controller = new AbortController();
  gateway.complete = async (_messages, opts) => {
    opts.onConnected();
    opts.onDelta("未完成片段");
    await new Promise((_r, reject) =>
      opts.signal.addEventListener(
        "abort",
        () => reject(Object.assign(new Error("stopped"), { status: 499 })),
        { once: true },
      ),
    );
  };
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  const pending = svc.reply("A", id, request("停止测试"), "owner", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { status: 499 });
  const msg = svc.project("A", id, "owner").workflow.messages.at(-1);
  assert.equal(msg.text, "未完成片段");
  assert.equal(msg.responseStatus, "cancelled");
  assert.equal(msg.processTrail.at(-1).code, "cancelled");
  assert.equal(svc.overview("A").inferenceUsage[0].status, "cancelled");
});
test("source revocation during streaming stops subsequent chunks and hides the partial generated text", async (t) => {
  const { svc, id, gateway } = setup(t);
  const item = svc.memory.add(
    "A",
    id,
    { title: "LIVE-QA", content: "LIVE_PRIVATE_FACT", kind: "fact" },
    "owner",
  );
  svc.selectModel("A", id, { model: "gemini", externalConsent: true }, "owner");
  const deltas = [];
  gateway.complete = async (_messages, opts) => {
    opts.onDelta("before");
    svc.store.update("A", (s) => {
      s.memory.projects[id].items.find((i) => i.id === item.id).enabled = false;
    });
    opts.onDelta("AFTER_REVOKE");
    return completion;
  };
  await assert.rejects(
    svc.reply("A", id, request("LIVE-QA 是什么？"), "owner", {
      onEvent: (e) => {
        if (e.type === "delta") deltas.push(e.text);
      },
    }),
    { status: 409 },
  );
  assert.deepEqual(deltas, ["before"]);
  assert.equal(
    svc.project("A", id, "owner").workflow.messages.at(-1).contextStale,
    true,
  );
});
test("HTTP SSE flushes progress before model completion and persists real usage at done", async (t) => {
  const { svc, select, gateway } = setup(t);
  const d = select();
  let release;
  gateway.complete = async (_m, opts) => {
    opts.onConnected();
    opts.onDelta("实时回复");
    await new Promise((r) => (release = r));
    return { ...completion, text: "实时回复" };
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/platform",
    createPlatformRouter(svc, (req, _res, next) => {
      req.knowledgeOwner = "A";
      req.platformRole = "owner";
      next();
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const res = await fetch(
    "http://127.0.0.1:" + server.address().port + "/api/platform/conversation",
    {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "X-EliangMat-Client": "knowledge-v1",
      },
      body: JSON.stringify(request("实时测试", d.threadId)),
    },
  );
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const reader = res.body.getReader(),
    decoder = new TextDecoder();
  let text = decoder.decode((await reader.read()).value);
  assert.ok(text.includes('"started"'));
  assert.equal(svc.overview("A").inferenceUsage[0].status, "running");
  release();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  assert.ok(text.includes('"done"'));
  assert.ok(text.includes("实时回复"));
  assert.equal(svc.overview("A").inferenceUsage[0].tokens.output, 32);
});

test("source review keeps only exact standalone excerpts and removes borrowed mechanism citations", () => {
  const { reviewCitations, citationStream } = require("../src/platform/citation-review");
  const records = [{source:1, content:"QA目标：200°C下屈服强度至少300MPa；尚未测试。"}];
  const answer = "「QA目标：200°C下屈服强度至少300MPa」[来源1]\n\n析出相粗化导致热软化[来源1]。\n\n「QA目标：25°C下屈服强度至少300MPa」[来源1]\n\n「QA目标：200°C下屈服强度至少300MPa」[来源99]";
  const checked = reviewCitations(answer, records);
  assert.deepEqual(checked.citationReview, {version:1,verifiedQuotes:1,removed:3});
  assert.match(checked.text, /\[原文1\]/);
  assert.ok(!checked.text.includes("[来源"));
  for (const wrapper of ["「原文片段」\nQA目标：200°C下屈服强度至少300MPa", "> QA目标：200°C下屈服强度至少300MPa"]) {
    assert.equal(reviewCitations(wrapper + "[来源1]", records).citationReview.verifiedQuotes, 1);
  }
  const feed = citationStream();
  let streamed = "";
  for (const chunk of ["解释[", "来", "源1", "]。", "[普通", "标签]", "【Source 99】", "终"]) streamed += feed(chunk);
  assert.equal(streamed, "解释。[普通标签]终");
  const partial = citationStream();
  assert.equal(partial("解释[来源"), "解释");
  assert.equal(partial("", true), "");
});

test("model citation checking covers streamed, stored and legacy replies with revocable original sources", async t => {
  const {svc, select, store} = setup(t, async (messages, options) => {
    const records = JSON.parse(messages[1].content.split("\n").slice(1).join("\n"));
    const record = records.find(r => r.content.includes("CITE907"));
    assert.ok(record);
    const text = `「${record.content}」[来源${record.source}]\n\n析出相已发生粗化[来源${record.source}]`;
    for (const part of [text.slice(0, 10),text.slice(10)]) options.onDelta(part);
    return {...completion,text};
  });
  const item = svc.memory.add("A",null,{title:"CITE907",kind:"fact",content:"CITE907仅记录目标温度200°C，未记录机理。"},"owner");
  select();
  const events=[];
  const out=await svc.reply("A",null,request("CITE907有什么记录？"),"owner",{onEvent:e=>events.push(e)});
  const answer=out.at(-1);
  assert.equal(answer.citationReview.verifiedQuotes,1);
  assert.equal(answer.citationReview.removed,1);
  assert.ok(!events.filter(e=>e.type==="delta").map(e=>e.text).join("").includes("[来源"));
  assert.equal(svc.conversation("A","owner").messages.at(-1).text,answer.text);
  store.update("A",s=>{const m=s.platform.accountMessages.at(-1);delete m.citationReview;m.text="这是来自目标的机理[来源1]";});
  const legacy=svc.conversation("A","owner").messages.at(-1);
  assert.equal(legacy.text,"这是来自目标的机理");
  assert.equal(legacy.citationReview.removed,1);
  svc.memory.remove("A",null,item.id,{version:1},"owner");
  assert.equal(svc.conversation("A","owner").messages.at(-1).contextStale,true);
});

test("length-limited reply is explicitly incomplete and can continue once with recent context and real usage", async t => {
  let calls=0, sent, budget;
  const {svc,select}=setup(t,async (messages,options)=>{
    sent=messages; budget=options.maxOutputTokens; calls++;
    return {...completion,text:calls===1?"1. 先确认200°C目标和测试标准。":"2. 再安排独立试样复核。",finishReason:calls===1?"length":"stop"};
  });
  select();
  let out=await svc.reply("A",null,request("给出详细检查点清单"),"owner");
  const partial=out.at(-1),threadId=svc.conversation("A","owner").threadId;
  assert.equal(partial.responseStatus,"truncated");
  assert.equal(partial.processTrail.at(-1).code,"truncated");
  assert.equal(budget,8192);
  const continuation={...request("继续生成",threadId),continueFrom:partial.id};
  out=await svc.reply("A",null,continuation,"owner");
  assert.equal(out.at(-1).responseStatus,"completed");
  assert.ok(sent.some(m=>m.role==="assistant" && m.content.includes("1. 先确认200°C")));
  assert.ok(sent.some(m=>m.role==="user" && m.content==="给出详细检查点清单"));
  await svc.reply("A",null,continuation,"owner");
  assert.equal(calls,2);
  assert.equal(svc.overview("A").inferenceUsage.length,2);
  await assert.rejects(svc.reply("A",null,{...request("继续生成",threadId),continueFrom:partial.id},"owner"),{status:409});
  await assert.rejects(svc.reply("A",null,{...request("继续生成",threadId),continueFrom:out.at(-1).id},"owner"),{status:409});
  assert.equal(calls,2);
});

test("continuation cannot reuse revoked evidence or a conversation from another account", async t => {
  let calls=0;
  const {svc,select}=setup(t,async()=>{calls++;return {...completion,finishReason:"length"};});
  const item=svc.memory.add("A",null,{title:"CONT907",kind:"fact",content:"CONT907报告必须先列温度再列标准，仅虚构验收。"},"owner");
  select();
  const out=await svc.reply("A",null,request("CONT907报告顺序是什么？"),"owner");
  const body={...request("继续生成",svc.conversation("A","owner").threadId),continueFrom:out.at(-1).id};
  svc.memory.remove("A",null,item.id,{version:1},"owner");
  await assert.rejects(svc.reply("A",null,body,"owner"),{status:409});
  svc.selectAssistantModel("B",{model:"gemini",externalConsent:true},"owner");
  await assert.rejects(svc.reply("B",null,body,"owner"),{status:409});
  assert.equal(calls,1);
});

test("local retrieval context survives a model switch without allowing unapproved project data", async t => {
  let sent;
  const {svc,id,select}=setup(t,async messages=>{sent=messages;return completion;});
  svc.memory.add("A",null,{title:"LOCAL907",kind:"constraint",content:"LOCAL907顺序必须温度在前、标准在后。"},"owner");
  svc.memory.add("A",id,{title:"SECRET907",kind:"fact",content:"SECRET907 private project must not leave."},"owner");
  await svc.reply("A",null,{message:"LOCAL907报告顺序是什么？"},"owner");
  const threadId=svc.conversation("A","owner").threadId;
  select();
  await svc.reply("A",null,request("按刚才查到的要求继续解释",threadId),"owner");
  const history=sent.filter(m=>m.role==="assistant");
  assert.ok(history.some(m=>m.content.includes("温度在前、标准在后")));
  assert.ok(!JSON.stringify(sent).includes("SECRET907"));
});
