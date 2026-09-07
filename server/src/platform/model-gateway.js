const { createHash } = require("node:crypto");
const { fetchWithTimeout } = require("../llm/text-chat");
const { fail } = require("../knowledge/store");
const { openStream, readChatStream } = require("./model-stream");

function createGeminiGateway(
  env = {},
  transport = fetchWithTimeout,
  streamTransport = openStream,
) {
  const baseUrl = String(env.GEMINI_BASE_URL || "https://api.aipaibox.com/v1")
    .trim()
    .replace(/\/+$/, "");
  const model = String(env.GEMINI_TEXT_MODEL || "gemini-2.5-flash").trim();
  const apiKey = String(env.GEMINI_API_KEY || "").trim();
  let endpoint;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw fail("Gemini 接口地址无效", 503);
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw fail("Gemini 接口须使用不含凭证和查询参数的 HTTPS 地址", 503);
  if (!/^gemini-[a-z0-9._-]+$/i.test(model))
    throw fail("请配置 Gemini 文本模型名称", 503);
  const fingerprint = createHash("sha256")
    .update(baseUrl + "|" + model)
    .digest("hex")
    .slice(0, 24);
  const info = {
    id: "gemini",
    name:
      {
        "gemini-2.5-flash": "Gemini 2.5 Flash",
        "gemini-3-flash": "Gemini 3 Flash",
      }[model] || model,
    provider: "Gemini · " + endpoint.hostname + " 网关",
    gateway: endpoint.hostname,
    purpose: "材料研究对话、方案分析与有来源的记忆问答",
    input: 0,
    cached: 0,
    output: 0,
    external: true,
    connected: !!apiKey,
    pricingConfigured: false,
    fingerprint,
    maxOutputTokens: Math.trunc(Math.min(16384, Math.max(2048, Number(env.GEMINI_MAX_OUTPUT_TOKENS) || 8192))),
  };
  return {
    info,
    async complete(messages, options = {}) {
      const maxTokens = Math.trunc(Math.min(info.maxOutputTokens, Math.max(1024, Number(options.maxOutputTokens) || info.maxOutputTokens)));
      if (options.onDelta) {
        if (!apiKey) throw fail("Gemini 尚未配置，请检查独立模型配置", 503);
        let response;
        try {
          response = await streamTransport(
            baseUrl + "/chat/completions",
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + apiKey,
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0.2,
                max_tokens: maxTokens,
                stream: true,
                stream_options: { include_usage: true },
              }),
            },
            options.signal,
            60000,
          );
          return await readChatStream(response, { ...options, model });
        } catch (error) {
          if (options.signal?.aborted || error.name === "AbortError")
            throw fail("已停止生成；供应商已处理的 Token 仍可能计费。", 499);
          if (error.status) throw error;
          throw fail(
            "Gemini 连接中断或超时，回复未完成；供应商是否计费需核对其账单。",
            502,
          );
        } finally {
          response?.close();
        }
      }

      if (!apiKey) throw fail("Gemini 尚未配置，请检查独立模型配置", 503);
      let response;
      try {
        response = await transport(
          baseUrl + "/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + apiKey,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.2,
              max_tokens: maxTokens,
              stream: false,
            }),
          },
          60000,
        );
      } catch {
        throw fail(
          "Gemini 网络异常或请求超时，未获得可用回复；供应商是否计费需核对其账单。可以稍后重试。",
          502,
        );
      }
      // Never expose gateway response bodies, credentials, or prompts in errors/logs.
      if (!response.ok) {
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
      let data;
      try {
        const raw = await response.text();
        if (raw.length > 2000000) throw new Error();
        data = JSON.parse(raw);
      } catch {
        throw fail("Gemini 返回格式异常，未生成可用回复", 502);
      }
      const choice = data.choices?.[0];
      const content =
        typeof choice?.message?.content === "string"
          ? choice.message.content.trim()
          : "";
      if (!content || content.length > 30000)
        throw fail("Gemini 未返回有效文本，请检查模型可用性后重试", 502);
      const number = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);
      const usage = data.usage || {};
      return {
        text: content,
        actualModel:
          typeof data.model === "string" ? data.model.slice(0, 100) : model,
        providerRequestId:
          typeof data.id === "string" ? data.id.slice(0, 150) : null,
        finishReason: String(choice.finish_reason || "unknown").slice(0, 40),
        tokens: {
          input: number(usage.prompt_tokens),
          cached: number(usage.prompt_tokens_details?.cached_tokens),
          output: number(usage.completion_tokens),
          total: number(usage.total_tokens),
        },
      };
    },
  };
}
module.exports = { createGeminiGateway };
