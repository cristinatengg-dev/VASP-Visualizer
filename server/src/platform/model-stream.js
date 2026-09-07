const https = require("node:https");
const { StringDecoder } = require("node:string_decoder");
const { proxyAgent } = require("../proxy-agent");
const { fail } = require("../knowledge/store");

// Returns the HTTP response as soon as headers arrive. No buffering or retries.
function openStream(url, init, signal, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: "POST",
      headers: init.headers,
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    });
    let response;
    const abort = () => {
      const error = Object.assign(new Error("Request aborted"), {
        name: "AbortError",
      });
      response?.destroy(error);
      req.destroy(error);
    };
    const timeout = setTimeout(() => {
      const error = Object.assign(new Error("Request timed out"), {
        code: "TIMEOUT",
      });
      response?.destroy(error);
      req.destroy(error);
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    };
    if (signal?.aborted) {
      cleanup();
      req.destroy();
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    req.on("error", (error) => {
      cleanup();
      reject(error);
    });
    req.on("response", (res) => {
      response = res;
      res.on("error", () => {}); // Async iteration consumes the same error without an unhandled EventEmitter error.
      resolve({
        status: res.statusCode,
        headers: res.headers,
        body: res,
        close: () => {
          cleanup();
          res.destroy();
          req.destroy();
        },
      });
    });
    req.end(init.body);
  });
}
const token = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);
function tokens(usage = {}) {
  return {
    input: token(usage.prompt_tokens),
    cached: token(usage.prompt_tokens_details?.cached_tokens),
    output: token(usage.completion_tokens),
    total: token(usage.total_tokens),
  };
}
async function readChatStream(
  response,
  {
    onDelta = () => {},
    onSummary = () => {},
    onConnected = () => {},
    signal,
    model,
  },
) {
  if (response.status < 200 || response.status >= 300) {
    const labels = {
      401: "接口鉴权失败",
      403: "接口没有调用权限",
      404: "模型或接口不可用",
      429: "接口限流或额度不足",
    };
    throw fail(
      "Gemini " +
        (labels[response.status] || "服务暂时不可用") +
        "（HTTP " +
        response.status +
        "），未生成回复。",
      502,
    );
  }
  onConnected();
  const decoder = new StringDecoder("utf8");
  const sse = String(response.headers["content-type"] || "").includes(
    "text/event-stream",
  );
  let buffer = "",
    bytes = 0,
    text = "",
    summary = "",
    actualModel = model,
    providerRequestId = null,
    finishReason = "",
    usage = {},
    done = false;
  const receive = (data) => {
    if (data.error) throw fail("Gemini 在生成过程中返回错误，回复未完成", 502);
    if (typeof data.model === "string") actualModel = data.model.slice(0, 100);
    if (typeof data.id === "string") providerRequestId = data.id.slice(0, 150);
    if (data.usage) usage = data.usage;
    const choice = data.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason)
      finishReason = String(choice.finish_reason).slice(0, 40);
    const delta = choice.delta || choice.message || {};
    // Only a separately labelled public summary is eligible. Never forward reasoning_content,
    // analysis, thought signatures or other raw reasoning channels from a gateway.
    if (typeof delta.reasoning_summary === "string" && summary.length < 800) {
      const part = delta.reasoning_summary.slice(0, 800 - summary.length);
      summary += part;
      onSummary(part);
    }
    if (typeof delta.content === "string" && delta.content) {
      if (text.length + delta.content.length > 30000)
        throw fail("Gemini 回复超过长度限制", 502);
      text += delta.content;
      onDelta(delta.content);
    }
  };
  const frame = (value) => {
    const data = value
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!data) return;
    if (data === "[DONE]") {
      done = true;
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw fail("Gemini 流式回复格式异常", 502);
    }
    receive(parsed);
  };
  const drain = () => {
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const value = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      frame(value);
    }
  };
  for await (const chunk of response.body) {
    if (signal?.aborted)
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    bytes += Buffer.byteLength(chunk);
    if (bytes > 2000000) throw fail("Gemini 返回数据超过限制", 502);
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    if (sse) drain();
  }
  buffer += decoder.end();
  if (sse) {
    drain();
    if (buffer.trim()) frame(buffer);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(buffer);
    } catch {
      throw fail("Gemini 返回格式异常", 502);
    }
    receive(parsed);
    done = true;
  }
  if (!done && !finishReason)
    throw fail("Gemini 连接提前结束，回复未完成", 502);
  if (!text.trim()) throw fail("Gemini 未返回有效文本", 502);
  return {
    text: text.trim(),
    reasoningSummary: summary || undefined,
    actualModel,
    providerRequestId,
    finishReason: finishReason || "unknown",
    tokens: tokens(usage),
    streamed: sse,
  };
}
module.exports = { openStream, readChatStream };
