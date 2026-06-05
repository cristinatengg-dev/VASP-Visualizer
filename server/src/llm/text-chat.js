const https = require('https');
const { proxyAgent } = require('../proxy-agent');

const DEFAULT_LEGACY_BASE_URL = 'https://api.aipaibox.com/v1';
const DEFAULT_MANGDREAM_BASE_URL = 'https://mangdream.com/api/innoreation/v1/proxy';
const DEFAULT_LEGACY_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEXT_MODEL = 'deepseek-v4-pro';

function clean(value) {
  return String(value || '').trim();
}

function hasExplicitTextLlmConfig() {
  return [
    'TEXT_LLM_API_KEY',
    'TEXT_LLM_BASE_URL',
    'TEXT_LLM_MODEL',
    'TEXT_LLM_AUTH_HEADER',
    'TEXT_LLM_AUTH_SCHEME',
  ].some((name) => clean(process.env[name]));
}

function normalizeBaseUrl(baseUrl) {
  return clean(baseUrl).replace(/\/+$/, '');
}

function getTextChatConfig() {
  const explicitTextConfig = hasExplicitTextLlmConfig();
  const baseUrl = normalizeBaseUrl(
    process.env.TEXT_LLM_BASE_URL
      || (explicitTextConfig ? DEFAULT_MANGDREAM_BASE_URL : process.env.GEMINI_BASE_URL)
      || DEFAULT_LEGACY_BASE_URL
  );
  const model = clean(
    process.env.TEXT_LLM_MODEL
      || (explicitTextConfig ? DEFAULT_TEXT_MODEL : process.env.GEMINI_TEXT_MODEL)
      || DEFAULT_LEGACY_MODEL
  );
  const apiKey = clean(process.env.TEXT_LLM_API_KEY || process.env.GEMINI_API_KEY);
  const authHeader = clean(
    process.env.TEXT_LLM_AUTH_HEADER
      || (explicitTextConfig ? 'X-Proxy-Key' : 'Authorization')
  );
  const authScheme = clean(
    process.env.TEXT_LLM_AUTH_SCHEME
      || (authHeader.toLowerCase() === 'authorization' ? 'Bearer' : '')
  );
  const responseFormatSetting = clean(process.env.TEXT_LLM_RESPONSE_FORMAT).toLowerCase();

  return {
    apiKey,
    authHeader,
    authScheme,
    baseUrl,
    model,
    useJsonResponseFormat: !['0', 'false', 'off', 'disabled', 'none'].includes(responseFormatSetting),
  };
}

function isTextChatConfigured() {
  const config = getTextChatConfig();
  return Boolean(config.apiKey && config.baseUrl && config.model);
}

function buildHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (!config.apiKey) {
    return headers;
  }

  if (config.authHeader.toLowerCase() === 'authorization') {
    headers.Authorization = config.authScheme
      ? `${config.authScheme} ${config.apiKey}`
      : config.apiKey;
  } else {
    headers[config.authHeader] = config.apiKey;
  }

  return headers;
}

async function fetchWithTimeout(url, init, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: init.method || 'GET',
      headers: init.headers || {},
    };
    if (proxyAgent) options.agent = proxyAgent;

    let req;
    const timeoutId = setTimeout(() => {
      if (req) req.destroy();
      reject(new Error(`Text LLM request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timeoutId);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data)),
        });
      });
    });

    req.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    if (init.body) req.write(init.body);
    req.end();
  });
}

async function textChat(messages, jsonMode = false, {
  timeoutMs = 60000,
  maxRetries = 2,
  temperature = 0.2,
} = {}) {
  const config = getTextChatConfig();
  if (!config.apiKey) {
    throw new Error('TEXT_LLM_API_KEY/GEMINI_API_KEY is not configured');
  }
  if (!config.baseUrl || !config.model) {
    throw new Error('TEXT_LLM_BASE_URL/TEXT_LLM_MODEL is not configured');
  }

  const body = {
    model: config.model,
    messages,
    temperature,
    stream: false,
  };
  if (jsonMode && config.useJsonResponseFormat) {
    body.response_format = { type: 'json_object' };
  }

  let lastError = null;
  const attempts = Math.max(1, Number(maxRetries) || 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `${config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: buildHeaders(config),
          body: JSON.stringify(body),
        },
        timeoutMs
      );

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`Text LLM API error ${response.status}: ${raw}`);
      }

      const data = JSON.parse(raw);
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      lastError = error;
      if (error && (error.name === 'AbortError' || String(error).includes('aborted'))) {
        lastError = new Error(`Text LLM request timeout after ${timeoutMs}ms`);
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  throw lastError || new Error('Text LLM API failed after retries');
}

module.exports = {
  buildHeaders,
  getTextChatConfig,
  isTextChatConfigured,
  textChat,
};
