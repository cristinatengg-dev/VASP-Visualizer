const { createHash } = require("node:crypto");
const { fail } = require("../knowledge/store");
const { openStream, readChatStream } = require("./model-stream");

// Tencent TokenHub's documented domestic endpoint and Hunyuan model IDs:
// https://cloud.tencent.com/document/product/1823/132252
// https://cloud.tencent.com/document/product/1823/130079
const OFFICIAL_BASE_URL = "https://tokenhub.tencentmaas.com/v1";
const MODELS = Object.freeze({
  hy3: "腾讯混元 Hy3",
  "hy3-preview": "腾讯混元 Hy3 Preview",
  "hy4-preview": "腾讯混元 Hy4 Preview",
});
const boundedTokens = (value, fallback, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.trunc(Math.min(maximum, Math.max(1024, number)))
    : fallback;
};

// Unlike the legacy text adapter, native fetch cancels the response body too.
function officialJsonTransport(url, init, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}

function createHunyuanGateway(
  env = {},
  transport = officialJsonTransport,
  streamTransport = openStream,
) {
  const safeErrors = new WeakSet();
  const fault = (message, status = 502) => {
    const error = fail(message, status);
    safeErrors.add(error);
    return error;
  };
  const baseUrl = String(env.HUNYUAN_BASE_URL || OFFICIAL_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw fault("腾讯混元接口地址无效", 503);
  }
  if (
    endpoint.origin !== "https://tokenhub.tencentmaas.com" ||
    endpoint.pathname !== "/v1" ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash
  )
    throw fault("腾讯混元仅允许国内官方 TokenHub 接口", 503);
  const model = String(env.HUNYUAN_TEXT_MODEL || "hy3").trim();
  if (!Object.hasOwn(MODELS, model))
    throw fault("请选择支持的腾讯混元型号：hy3、hy3-preview 或 hy4-preview", 503);
  const apiKey = String(env.HUNYUAN_API_KEY || "").trim();
  if (/[\r\n]/.test(apiKey)) throw fault("腾讯混元密钥格式无效", 503);
  const info = {
    id: "hunyuan",
    name: MODELS[model],
    provider: "腾讯云 TokenHub · 腾讯混元",
    gateway: endpoint.hostname,
    purpose: "材料研究对话、方案分析与有来源的记忆问答",
    input: 0,
    cached: 0,
    output: 0,
    external: true,
    connected: !!apiKey,
    pricingConfigured: false,
    fingerprint: createHash("sha256")
      .update("hunyuan|" + endpoint.href + "|" + model)
      .digest("hex")
      .slice(0, 24),
    maxOutputTokens: boundedTokens(env.HUNYUAN_MAX_OUTPUT_TOKENS, 8192, 16384),
  };
  const validateModel = (actual) => {
    if (typeof actual !== "string" || !Object.hasOwn(MODELS, actual))
      throw fault("腾讯混元响应缺少可核实的混元模型标识，未接受该回复");
    return actual;
  };
  const validateResponse = (response, url) => {
    if (
      response.redirected ||
      (response.url && response.url !== url) ||
      (response.status >= 300 && response.status < 400)
    )
      throw fault("腾讯混元接口返回重定向，已拒绝转发");
    if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
      const label = { 401: "接口鉴权失败", 403: "接口没有调用权限", 404: "模型或接口不可用", 429: "接口限流或额度不足" }[response.status];
      throw fault("腾讯混元" + (label || "服务暂时不可用") + "，未生成回复");
    }
  };
  return {
    info,
    async complete(messages, options = {}) {
      const cancelled = () => {
        if (options.signal?.aborted)
          throw fault("已停止生成；供应商已处理的 Token 仍可能计费。", 499);
      };
      cancelled();
      if (!apiKey) throw fault("腾讯混元尚未配置，请配置独立的 TokenHub API Key", 503);
      const streaming = typeof options.onDelta === "function";
      const url = endpoint.href + "/chat/completions";
      const init = {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: boundedTokens(options.maxOutputTokens, info.maxOutputTokens, info.maxOutputTokens),
          // Do not request raw reasoning; the parser also excludes it if returned.
          thinking: { type: "disabled" },
          stream: streaming,
          ...(streaming ? { stream_options: { include_usage: true } } : {}),
        }),
        signal: options.signal,
        redirect: "error",
        direct: true,
      };
      let response;
      const callbackErrors = new WeakSet();
      const callback = (fn) => (...args) => {
        try { return fn?.(...args); }
        catch (error) {
          if (error && typeof error === "object") callbackErrors.add(error);
          throw error;
        }
      };
      try {
        response = streaming
          ? await streamTransport(url, init, options.signal, 60000)
          : await transport(url, init, 60000);
        cancelled();
        validateResponse(response, url);
        if (streaming) {
          const result = await readChatStream(response, {
            ...options,
            onDelta: callback(options.onDelta),
            onSummary: callback(options.onSummary),
            onConnected: callback(options.onConnected),
            providerName: "腾讯混元",
            requireModel: true,
            validateModel,
            errorFactory: fault,
          });
          cancelled();
          return result;
        }
        let raw;
        if (response.body?.[Symbol.asyncIterator]) {
          const chunks = [];
          let bytes = 0;
          for await (const chunk of response.body) {
            cancelled();
            bytes += Buffer.byteLength(chunk);
            if (bytes > 2000000) throw fault("腾讯混元返回数据超过限制");
            chunks.push(Buffer.from(chunk));
          }
          raw = Buffer.concat(chunks).toString("utf8");
        } else raw = await response.text();
        cancelled();
        if (typeof raw !== "string" || Buffer.byteLength(raw) > 2000000)
          throw fault("腾讯混元返回数据超过限制");
        let data;
        try { data = JSON.parse(raw); }
        catch { throw fault("腾讯混元返回格式异常，未生成可用回复"); }
        const actualModel = validateModel(data?.model);
        if (data.error) throw fault("腾讯混元返回错误，未生成可用回复");
        const choice = data.choices?.[0];
        const content = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
        if (!content || content.length > 30000)
          throw fault("腾讯混元未返回有效文本，请检查模型可用性后重试");
        const number = (n) => Number.isSafeInteger(n) && n >= 0 ? n : null;
        const usage = data.usage || {};
        return {
          text: content,
          actualModel,
          providerRequestId: typeof data.id === "string" ? data.id.slice(0, 150) : null,
          finishReason: String(choice.finish_reason || "unknown").slice(0, 40),
          tokens: {
            input: number(usage.prompt_tokens),
            cached: number(usage.prompt_tokens_details?.cached_tokens),
            output: number(usage.completion_tokens),
            total: number(usage.total_tokens),
          },
        };
      } catch (error) {
        if (safeErrors.has(error) || callbackErrors.has(error)) throw error;
        cancelled();
        if (error?.name === "AbortError")
          throw fault("已停止生成；供应商已处理的 Token 仍可能计费。", 499);
        // Do not expose transport errors: they may contain credentials or prompts.
        throw fault("腾讯混元连接中断或响应异常，回复未完成；供应商是否计费需核对其账单。");
      } finally {
        try {
          if (response?.close) response.close();
          else if (response?.body && !response.bodyUsed) await response.body.cancel?.();
        } catch { /* Cleanup must not replace a sanitized failure. */ }
      }
    },
  };
}

module.exports = { createHunyuanGateway };
