const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://once.novai.su/v1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview';

async function fetchWithTimeout(url, init, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    const clean = String(value || '')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      const sanitizedJson = match[0].replace(/\\([^"\\\/bfnrtu])/g, '$1');
      return JSON.parse(sanitizedJson);
    } catch {
      return null;
    }
  }
}

function buildValidationInstruction({ requiredSpecies, strictChemistry }) {
  const condensedSpecies = Array.isArray(requiredSpecies)
    ? requiredSpecies.map((species, index) => ({
      index,
      atoms: species.atoms,
      bond_topology: species.bond_topology,
      geometry_hint: species.geometry_hint,
      role: species.role,
      priority: species.priority,
    }))
    : [];

  return `Return ONLY valid JSON.
Check the image for:
1) Any visible text-like glyphs (Chinese, English, letters, digits, punctuation, chemical formulas, element symbols, labels, captions, watermarks, UI text). If any, has_text=true.
2) Chemical correctness for each required species (if provided): atom counts, missing atoms, extra atoms, wrong identity (e.g. CO drawn as CO2), wrong bond order, wrong geometry. If uncertain, mark ok=false.

Strict chemistry: ${strictChemistry ? 'on' : 'off'}

Required species (JSON): ${JSON.stringify(condensedSpecies)}

Output schema:
{
  "has_text": boolean,
  "text_samples": [string],
  "species": [{"index": number, "ok": boolean, "problems": [string]}],
  "ok": boolean
}`;
}

async function validateRenderingImage({
  imageDataUrl,
  requiredSpecies = [],
  strictChemistry = false,
}) {
  const url = String(imageDataUrl || '').trim();
  if (!url.startsWith('data:image/')) {
    throw new Error('imageDataUrl must be data:image/*;base64,...');
  }
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetchWithTimeout(
    `${GEMINI_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: GEMINI_TEXT_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildValidationInstruction({ requiredSpecies, strictChemistry }) },
              { type: 'image_url', image_url: { url } },
            ],
          },
        ],
        temperature: 0.0,
        response_format: { type: 'json_object' },
      }),
    },
    45000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Validator API error ${response.status}: ${errorText}`);
  }

  const raw = await response.text();
  const data = safeJsonParse(raw);
  if (!data) {
    throw new Error(`Validator returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  const content = data.choices?.[0]?.message?.content || '';
  const parsed = safeJsonParse(content);
  if (!parsed) {
    throw new Error('Validator returned invalid JSON');
  }

  return parsed;
}

module.exports = {
  validateRenderingImage,
};
