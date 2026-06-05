const {
  isTextChatConfigured,
  textChat,
} = require('../llm/text-chat');

const SCIENCE_EXTRACTION_SYSTEM_PROMPT = `You are a scientific entity extractor for a journal cover image generator.
Your task: analyze the provided scientific text and return ONLY a valid JSON object with this exact schema.
No markdown, no explanation — raw JSON only.

IMPORTANT for "support_or_substrate":
- ONLY fill this field if the text EXPLICITLY describes a specific substrate/support with clear molecular or crystallographic structure (e.g. "CeO2(111) surface", "graphene sheet", "MoS2 monolayer", "TiO2 nanoparticles").
- If the text only vaguely mentions a support (e.g. "metal oxide support", "catalyst support") WITHOUT specific structural details, set this to null.
- If no substrate/support is mentioned at all, set this to null.
- DO NOT guess or infer substrate structures that are not explicitly stated in the text.

Schema:
{
  "domain": "Chemistry|Materials|Biology|Physics|Interdisciplinary",
  "subdomain": "string, e.g. Heterogeneous Catalysis",
  "core_theme": "string, 1 concise sentence summarizing the research",
  "central_object": "string, the main visual subject (e.g. single-atom Ni catalyst)",
  "support_or_substrate": "string with explicit structural details, or null if not clearly described in the text",
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

async function geminiChat(messages, jsonMode = false, { timeoutMs = 60000, maxRetries = 2 } = {}) {
  return textChat(messages, jsonMode, { timeoutMs, maxRetries });
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

  throw new Error(`Text LLM returned invalid JSON: ${String(content || '').slice(0, 200)}`);
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
  isTextChatConfigured,
  parseScienceJson,
  parseScienceText,
};
