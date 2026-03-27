const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.aipaibox.com/v1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const https = require('https');
const { proxyAgent } = require('../proxy-agent');

const SCIENCE_EXTRACTION_SYSTEM_PROMPT = `You are a scientific entity extractor for a journal cover image generator.
Your task: analyze the provided scientific text and return ONLY a valid JSON object with this exact schema.
No markdown, no explanation — raw JSON only.

Schema:
{
  "domain": "Chemistry|Materials|Biology|Physics|Interdisciplinary",
  "subdomain": "string, e.g. Heterogeneous Catalysis",
  "core_theme": "string, 1 concise sentence summarizing the research",
  "central_object": "string, the main visual subject (e.g. single-atom Ni catalyst)",
  "support_or_substrate": "string or null",
  "active_site": "string or null",
  "environment": "string, e.g. gas-solid interface at elevated temperature",
  "scale_level": "string, e.g. nanoscale (1-10 nm)",
  "key_mechanism": "string, core scientific mechanism",
  "visual_keywords": ["string"],
  "must_show_elements": ["string"],
  "forbidden_elements": ["text labels","arrows","diagrams"],
  "reactants": [
    {
      "name_cn": "string",
      "formula_en": "string",
      "atoms": ["string"],
      "bond_topology": "string",
      "color_rule": {},
      "geometry_hint": "string",
      "role": "reactant",
      "priority": "high|medium|low"
    }
  ],
  "intermediates": [],
  "products": [
    {
      "name_cn": "string",
      "formula_en": "string",
      "atoms": ["string"],
      "bond_topology": "string",
      "color_rule": {},
      "geometry_hint": "string",
      "role": "product",
      "priority": "high|medium|low"
    }
  ],
  "scientific_entities": []
}

CPK color rules to apply when filling color_rule: C=#808080, H=#FFFFFF, O=#FF0000, N=#0000FF, S=#FFFF00, Fe=#FFA500, Ni=#A8A8A8, Cu=#FF8C00, Au=#FFD700, Pt=#E5E4E2, Pd=#9B9B9B, Li=#CC80FF, Na=#AB5CF2, K=#8F40D4, Mg=#8AFF00, Ca=#3DFF00, Al=#BFA6A6, Si=#F0C8A0, Mo=#54B5B5, Ti=#BFC2C7, Zn=#7D80B0, default=#CCCCCC`;

function buildScienceExtractionMessages(text) {
  return [
    { role: 'system', content: SCIENCE_EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: `Parse this scientific text:\n\n${text}` },
  ];
}

async function fetchWithTimeout(url, init, timeoutMs = 20000) {
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

    const timeoutId = setTimeout(() => {
      req.destroy();
      reject(new Error('Gemini request timeout after ' + timeoutMs + 'ms'));
    }, timeoutMs);

    const req = https.request(options, (res) => {
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

async function geminiChat(messages, jsonMode = false, { timeoutMs = 20000, maxRetries = 2 } = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const body = {
    model: GEMINI_TEXT_MODEL,
    messages,
    temperature: 0.2,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `${GEMINI_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GEMINI_API_KEY}`,
          },
          body: JSON.stringify(body),
        },
        timeoutMs
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error) {
      lastError = error;
      if (error && (error.name === 'AbortError' || String(error).includes('aborted'))) {
        lastError = new Error('Gemini request timeout after 20s');
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  throw lastError || new Error('Gemini API failed after retries');
}

function parseScienceJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = String(content || '').match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
  }

  throw new Error(`Gemini returned invalid JSON: ${String(content || '').slice(0, 200)}`);
}

async function parseScienceText({ text, chat = geminiChat }) {
  const normalizedText = String(text || '').trim();
  if (normalizedText.length < 10) {
    throw new Error('Text too short (min 10 chars)');
  }

  const content = await chat(buildScienceExtractionMessages(normalizedText), true);
  return parseScienceJson(content);
}

module.exports = {
  SCIENCE_EXTRACTION_SYSTEM_PROMPT,
  buildScienceExtractionMessages,
  geminiChat,
  parseScienceJson,
  parseScienceText,
};
