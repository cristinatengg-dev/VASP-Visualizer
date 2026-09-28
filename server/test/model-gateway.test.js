const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createHunyuanGateway } = require("../src/platform/model-gateway");

const config = { HUNYUAN_API_KEY: "synthetic-test-key" };
const reply = (overrides = {}) => ({
  id: "chatcmpl-hunyuan-test",
  model: "hy3",
  choices: [{ message: { content: "仅为软件测试。" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  ...overrides,
});
const json = (data = reply(), extra = {}) => ({
  status: 200,
  text: async () => JSON.stringify(data),
  ...extra,
});
const frame = (data) => "data: " + JSON.stringify(data) + "\n\n";
const stream = (parts, extra = {}) => ({
  status: 200,
  headers: { "content-type": "text/event-stream" },
  body: Readable.from(parts),
  ...extra,
});
const delta = (content, model = "hy3") => ({ model, choices: [{ delta: { content } }] });

test("Hunyuan config is independent and legacy credentials cannot enable it", async () => {
  let calls = 0;
  const g = createHunyuanGateway({
    GEMINI_API_KEY: "never-use-me",
    GEMINI_BASE_URL: "https://untrusted.example/v1",
    GEMINI_TEXT_MODEL: "gemini-test",
  }, async () => { calls++; return json(); });
  assert.equal(g.info.id, "hunyuan");
  assert.equal(g.info.name, "腾讯混元 Hy3");
  assert.equal(g.info.gateway, "tokenhub.tencentmaas.com");
  assert.equal(g.info.connected, false);
  assert.equal(g.info.external, true);
  assert.equal(g.info.maxOutputTokens, 8192);
  await assert.rejects(g.complete([]), { status: 503 });
  assert.equal(calls, 0);
  assert.equal(require("../src/platform/model-gateway").createGeminiGateway, undefined);
  assert.ok(!JSON.stringify(g.info).includes("never-use-me"));
});

test("only the domestic official base URL and explicit Hunyuan models are accepted", () => {
  for (const url of [
    "http://tokenhub.tencentmaas.com/v1", "https://untrusted.example/v1",
    "https://tokenhub.tencentmaas.com.evil.example/v1", "https://tokenhub-intl.tencentmaas.com/v1",
    "https://tokenhub.tencentmaas.com:444/v1", "https://user:secret@tokenhub.tencentmaas.com/v1",
    "https://tokenhub.tencentmaas.com/v1?key=secret", "https://tokenhub.tencentmaas.com/v1#x",
    "https://tokenhub.tencentmaas.com/plan/v3", "not-a-url",
  ]) assert.throws(() => createHunyuanGateway({ ...config, HUNYUAN_BASE_URL: url }), { status: 503 });
  for (const model of ["gemini-3-flash", "deepseek-v4-pro", "hy3-fake", "hunyuan-test", "toString"])
    assert.throws(() => createHunyuanGateway({ ...config, HUNYUAN_TEXT_MODEL: model }), { status: 503 });
  for (const model of ["hy3", "hy3-preview", "hy4-preview"])
    assert.equal(createHunyuanGateway({ ...config, HUNYUAN_TEXT_MODEL: model }).info.connected, true);
  const a = createHunyuanGateway(config).info.fingerprint;
  assert.notEqual(a, createHunyuanGateway({ ...config, HUNYUAN_TEXT_MODEL: "hy4-preview" }).info.fingerprint);
  assert.equal(a, createHunyuanGateway({ ...config, HUNYUAN_API_KEY: "rotated-key" }).info.fingerprint);
});

test("nonstream requests use official protocol, bounded budget and actual model/usage", async () => {
  let sent;
  const g = createHunyuanGateway(config, async (url, init, timeout) => {
    sent = { url, init, timeout };
    return json(reply({ model: "hy3-preview", usage: { prompt_tokens: 12, completion_tokens: 7 } }));
  });
  const result = await g.complete([{ role: "user", content: "synthetic" }]);
  assert.equal(sent.url, "https://tokenhub.tencentmaas.com/v1/chat/completions");
  assert.equal(sent.init.headers.Authorization, "Bearer synthetic-test-key");
  assert.equal(sent.init.redirect, "error");
  assert.equal(sent.timeout, 60000);
  assert.deepEqual(JSON.parse(sent.init.body).thinking, { type: "disabled" });
  assert.equal(JSON.parse(sent.init.body).stream, false);
  assert.equal(JSON.parse(sent.init.body).model, "hy3");
  assert.equal(result.actualModel, "hy3-preview");
  assert.equal(result.providerRequestId, "chatcmpl-hunyuan-test");
  assert.deepEqual(result.tokens, { input: 12, cached: null, output: 7, total: null });
  await g.complete([], { maxOutputTokens: 999999 });
  assert.equal(JSON.parse(sent.init.body).max_tokens, 8192);
  await g.complete([], { maxOutputTokens: 4096 });
  assert.equal(JSON.parse(sent.init.body).max_tokens, 4096);
});

test("redirects and foreign final URLs are rejected before reading response bodies", async () => {
  for (const extra of [
    { status: 302 }, { redirected: true }, { url: "https://untrusted.example/result" },
  ]) {
    let read = false;
    const g = createHunyuanGateway(config, async () => json(reply(), {
      ...extra, text: async () => { read = true; throw new Error("secret"); },
    }));
    await assert.rejects(g.complete([]), (e) => e.status === 502 && /重定向/.test(e.message));
    assert.equal(read, false);
  }
});

test("native JSON transport prohibits redirects and forwards cancellation", async (t) => {
  let sent;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    sent = { url, init };
    return new Response(JSON.stringify(reply()), { status: 200 });
  });
  const controller = new AbortController();
  const g = createHunyuanGateway(config);
  await g.complete([], { signal: controller.signal });
  assert.equal(sent.init.redirect, "error");
  assert.equal(sent.init.signal.aborted, false);
  controller.abort();
  assert.equal(sent.init.signal.aborted, true);
});

test("provider HTTP failures and arbitrary transport failures never echo secrets or prompts", async () => {
  const privateText = "synthetic-test-key private-user-prompt";
  for (const transport of [
    async () => json({}, { status: 401, text: async () => privateText }),
    async () => { throw Object.assign(new Error(privateText), { status: 502 }); },
  ]) {
    const g = createHunyuanGateway(config, transport);
    await assert.rejects(g.complete([]), (e) => e.status === 502 && !e.message.includes("synthetic-test-key") && !e.message.includes("private-user-prompt"));
  }
});

test("missing, non-Hunyuan and malformed responses do not manufacture a model identity", async () => {
  for (const data of [
    reply({ model: undefined }), reply({ model: "gemini-3-flash" }), reply({ model: "deepseek-v4-pro" }),
    reply({ model: "hy3-unknown" }), null, [], reply({ choices: [] }), reply({ error: { message: "secret" } }),
  ]) {
    const g = createHunyuanGateway(config, async () => json(data));
    await assert.rejects(g.complete([]), { status: 502 });
  }
  for (const raw of ["not JSON", "x".repeat(2000001)]) {
    const g = createHunyuanGateway(config, async () => ({ status: 200, text: async () => raw }));
    await assert.rejects(g.complete([]), { status: 502 });
  }
});

test("SSE streams retain actual usage, split UTF-8 safely and discard raw reasoning", async () => {
  let init, closed = false, text = "", summary = "";
  const payload = Buffer.from(
    frame({ model: "hy3", id: "stream-id", choices: [{ delta: { reasoning_content: "private-reasoning", content: "材料" } }] }) +
    frame({ model: "hy3", choices: [{ delta: { content: "测试" }, finish_reason: "stop" }] }) +
    frame({ model: "hy3", choices: [], usage: { prompt_tokens: 12, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens: 4, total_tokens: 16 } }) +
    "data: [DONE]\n\n",
  );
  const bytes = [...payload].map((x) => Buffer.from([x]));
  const g = createHunyuanGateway(config, async () => { throw new Error("wrong transport"); }, async (_url, request) => {
    init = request;
    return stream(bytes, { close: () => { closed = true; } });
  });
  const out = await g.complete([], { onDelta: (s) => { text += s; }, onSummary: (s) => { summary += s; } });
  assert.equal(text, "材料测试");
  assert.equal(summary, "");
  assert.equal(out.actualModel, "hy3");
  assert.equal(out.providerRequestId, "stream-id");
  assert.equal(out.tokens.cached, 2);
  assert.equal(out.tokens.total, 16);
  assert.equal(closed, true);
  assert.equal(init.direct, true);
  assert.deepEqual(JSON.parse(init.body).stream_options, { include_usage: true });
});

test("stream model identity is verified before content and cannot change mid-response", async () => {
  for (const parts of [
    [frame(delta("secret", "gemini-3-flash"))],
    [frame({ choices: [{ delta: { content: "secret" } }] })],
    [frame(delta("first")), frame(delta("second", "hy4-preview"))],
    ["data: not-json\n\n"], [frame(delta("partial"))],
  ]) {
    let received = "", closed = false;
    const g = createHunyuanGateway(config, undefined, async () => stream(parts, { close: () => { closed = true; } }));
    await assert.rejects(g.complete([], { onDelta: (s) => { received += s; } }), { status: 502 });
    assert.ok(!received.includes("secret"));
    assert.ok(!received.includes("second"));
    assert.equal(closed, true);
  }
});

test("cancellation before dispatch sends nothing; cancellation during a response stops completion", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const g = createHunyuanGateway(config, async () => { calls++; return json(); });
  await assert.rejects(g.complete([], { signal: controller.signal }), { status: 499 });
  assert.equal(calls, 0);

  const active = new AbortController();
  let closed = false;
  const streaming = createHunyuanGateway(config, undefined, async () => stream([
    frame(delta("first")) + frame(delta("second")) + "data: [DONE]\n\n",
  ], { close: () => { closed = true; } }));
  let text = "";
  await assert.rejects(streaming.complete([], {
    signal: active.signal,
    onDelta: (s) => { text += s; active.abort(); },
  }), { status: 499 });
  assert.equal(text, "first");
  assert.equal(closed, true);
});

test("stream redirects never produce content and close the response", async () => {
  let closed = false, received = "";
  const g = createHunyuanGateway(config, undefined, async () => stream([
    frame(delta("must not be displayed")), "data: [DONE]\n\n",
  ], { status: 307, close: () => { closed = true; } }));
  await assert.rejects(g.complete([], { onDelta: (s) => { received += s; } }), { status: 502 });
  assert.equal(received, "");
  assert.equal(closed, true);
});

test("authorization revocation raised by a stream callback preserves the application error", async () => {
  const error = Object.assign(new Error("资料授权已撤回"), { status: 409 });
  const g = createHunyuanGateway(config, undefined, async () => stream([frame(delta("text")), "data: [DONE]\n\n"]));
  await assert.rejects(g.complete([], { onDelta: () => { throw error; } }), (actual) => actual === error);
});
