const { validateRenderingImage } = require('./validate-image');

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://once.novai.su/v1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_IMAGE_MODEL_RAW = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
const GEMINI_IMAGE_STRATEGY = process.env.GEMINI_IMAGE_STRATEGY || 'auto';

function normalizeGeminiModel(model) {
  const normalized = String(model || '').trim();
  if (normalized === 'gemini-3.1-pro-proview') {
    return 'gemini-3-pro-image-preview';
  }
  return normalized;
}

const GEMINI_IMAGE_MODEL = normalizeGeminiModel(GEMINI_IMAGE_MODEL_RAW);

const SPECIES_CANON = {
  C3H8: 'Propane (C3H8): linear 3-carbon chain CH3–CH2–CH3; exactly 2 C–C single bonds; no double bonds; no rings; total 3 carbon atoms.',
  C3H6: 'Propene (C3H6): CH2=CH–CH3; exactly one C=C double bond between carbon 1 and 2; exactly one C–C single bond between carbon 2 and 3; no rings; total 3 carbon atoms.',
  C4H10: 'Butane (C4H10): linear 4-carbon chain CH3–CH2–CH2–CH3; exactly 3 C–C single bonds; no rings; total 4 carbon atoms.',
  C2H4: 'Ethene (C2H4): CH2=CH2; exactly one C=C double bond; total 2 carbon atoms.',
  CO: 'CO: linear diatomic molecule with a C≡O triple bond; exactly 2 atoms.',
  CO2: 'CO2: linear O=C=O; carbon double-bonded to each oxygen; exactly 3 atoms.',
  O2: 'O2: diatomic oxygen with one O=O double bond; exactly 2 atoms.',
  N2: 'N2: diatomic nitrogen with one N≡N triple bond; exactly 2 atoms.',
  H2: 'H2: diatomic hydrogen with one H–H single bond; exactly 2 atoms.',
  Ru: 'Ruthenium single-atom site: exactly 1 metallic sphere anchored on the support; do not label; do not print any symbol; represent only by color and material appearance.',
  N: 'Nitrogen dopant atoms in a carbon lattice: blue spheres embedded in the lattice; do not label; do not print any symbol.',
};

function speciesToConstraint(species) {
  const formula = String(species?.formula_en || '').trim();
  const topology = String(species?.bond_topology || '').trim();
  const geometry = String(species?.geometry_hint || '').trim();
  const role = String(species?.role || '').trim();
  const base = SPECIES_CANON[formula]
    ? SPECIES_CANON[formula]
    : (
      formula
        ? `${formula}: ${topology || 'follow the exact specified connectivity and bond orders'}${geometry ? `; geometry: ${geometry}` : ''}.`
        : ''
    );

  if (!base) {
    return '';
  }

  return `${role ? `[${role}] ` : ''}${base}`;
}

async function fetchWithTimeout(url, init, timeoutMs = 85000) {
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

function normalizeBase64(b64) {
  if (!b64) return '';
  let normalized = String(b64).trim();
  normalized = normalized.replace(/^data:[^,]+,/, '');
  normalized = normalized.replace(/\s+/g, '');
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad === 2) normalized += '==';
  else if (pad === 3) normalized += '=';
  else if (pad === 1) return '';
  return normalized;
}

function guessMimeFromBase64(b64) {
  const normalized = normalizeBase64(b64);
  if (!normalized) return 'image/png';
  if (normalized.startsWith('/9j/')) return 'image/jpeg';
  if (normalized.startsWith('iVBORw0KGgo')) return 'image/png';
  if (normalized.startsWith('R0lGOD')) return 'image/gif';
  if (normalized.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

function toDataUrl(b64, mimeType) {
  const clean = normalizeBase64(b64);
  if (!clean) return null;
  const mime = mimeType || guessMimeFromBase64(clean);
  return `data:${mime};base64,${clean}`;
}

function extractImageFromGeminiResponse(data) {
  if (!data?.candidates) {
    return null;
  }
  for (const candidate of data.candidates) {
    const parts = candidate.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return toDataUrl(part.inlineData.data, part.inlineData.mimeType);
      }
    }
  }
  return null;
}

function extractImageFromChatResponse(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    const direct = content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/);
    if (direct?.[0]) {
      return direct[0];
    }

    const compact = content.replace(/\s+/g, '');
    if (compact.startsWith('data:image')) {
      return compact;
    }

    if (compact.length > 1000) {
      const head = compact.slice(0, 2000);
      if (/^[A-Za-z0-9+/=_-]+$/.test(head)) {
        return toDataUrl(compact);
      }
    }
    return null;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url') {
        const url = part.image_url?.url || '';
        if (url.startsWith('data:image')) {
          return url;
        }
      }
      if (part.type === 'image' && part.source?.data) {
        return toDataUrl(part.source.data, part.source.media_type);
      }
      if (part.inline_data?.data) {
        return toDataUrl(part.inline_data.data, part.inline_data.mime_type);
      }
    }
  }

  return null;
}

function sizeForAspectRatio(aspectRatio) {
  const value = String(aspectRatio || '').trim();
  if (value === '9:16') return '1024x1792';
  if (value === '16:9') return '1792x1024';
  if (value === '3:4') return '1024x1536';
  if (value === '4:3') return '1536x1024';
  return '1024x1024';
}

function extractErrorMessage(errorLike) {
  if (!errorLike) return '';
  if (typeof errorLike === 'string') return errorLike;
  if (typeof errorLike.message === 'string') return errorLike.message;
  try {
    return JSON.stringify(errorLike);
  } catch {
    return String(errorLike);
  }
}

function buildImagePrompt({ prompt, aspectRatio, requiredSpecies }) {
  const speciesConstraints = Array.isArray(requiredSpecies)
    ? requiredSpecies
      .map((species) => speciesToConstraint(species))
      .filter(Boolean)
    : [];

  return `nano banana 2: Generate a high-quality scientific journal cover image. Output the image directly — NO text description, NO markdown, just the image. The image must be 600 DPI publication-grade quality. Aspect ratio MUST be ${String(aspectRatio || '9:16')} (portrait).

CRITICAL: ABSOLUTELY NO TEXT OR GLYPHS of any kind.
- No English letters, no Chinese characters, no numbers, no punctuation.
- No watermarks, no captions, no labels, no legends, no annotations.
- No axis ticks, no scale bars, no arrows, no UI text.
- Do NOT print element symbols on atoms.
- Do NOT print chemical formulas anywhere.

CRITICAL: Represent atoms ONLY as spheres (CPK colors) and bonds ONLY as sticks; molecules must be unlabeled.
CRITICAL: Chemical correctness: do not add/remove atoms; do not change carbon counts; bond orders and connectivity must match exactly.
CRITICAL: If any text would appear, remove it completely and keep only unlabeled atoms/bonds.

Required molecular structures (must match exactly):
${speciesConstraints.length ? speciesConstraints.map((line) => `- ${line}`).join('\n') : '- none'}

${String(prompt || '').slice(0, 3500)}`;
}

async function validateGeneratedImage({
  dataUrl,
  requiredSpecies,
  strictNoText,
  strictChemistry,
}) {
  if (!strictNoText && !strictChemistry) {
    return { ok: true };
  }

  return validateRenderingImage({
    imageDataUrl: dataUrl,
    requiredSpecies: Array.isArray(requiredSpecies) ? requiredSpecies : [],
    strictChemistry: Boolean(strictChemistry),
  });
}

async function tryFetchExternalImage(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const mime = response.headers?.get?.('content-type') || undefined;
  return toDataUrl(Buffer.from(buffer).toString('base64'), mime);
}

async function generateOneRenderingImage({
  imagePrompt,
  aspectRatio,
  strictNoText,
  strictChemistry,
  requiredSpecies,
  maxAttemptsPerImage,
}) {
  let lastError = null;

  for (let attemptIndex = 0; attemptIndex < maxAttemptsPerImage; attemptIndex += 1) {
    let candidate = null;

    const tryImagesGenerations = async () => {
      const response = await fetchWithTimeout(
        `${GEMINI_BASE_URL}/images/generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GEMINI_API_KEY}`,
          },
          body: JSON.stringify({
            model: GEMINI_IMAGE_MODEL,
            prompt: imagePrompt,
            n: 1,
            size: sizeForAspectRatio(aspectRatio),
            response_format: 'b64_json',
          }),
        }
      );

      const raw = await response.text();
      if (!response.ok) {
        lastError = new Error(`images/generations HTTP ${response.status}: ${raw.slice(0, 180)}`);
        return null;
      }

      const data = safeJsonParse(raw);
      if (!data) {
        lastError = new Error(`images/generations non-JSON: ${raw.slice(0, 180)}`);
        return null;
      }
      if (data.error) {
        lastError = new Error(extractErrorMessage(data.error));
        return null;
      }

      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) {
        lastError = new Error('Could not extract image from images/generations response');
        return null;
      }

      return toDataUrl(b64);
    };

    const tryChatCompletions = async () => {
      const response = await fetchWithTimeout(
        `${GEMINI_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GEMINI_API_KEY}`,
          },
          body: JSON.stringify({
            model: GEMINI_IMAGE_MODEL,
            messages: [
              {
                role: 'user',
                content: imagePrompt,
              },
            ],
            n: 1,
            temperature: 0.7,
          }),
        }
      );

      const raw = await response.text();
      if (raw.includes('524 A Timeout Occurred') || raw.includes('Cloudflare') || raw.includes('<html')) {
        throw new Error('Proxy returned HTML/Timeout instead of JSON (524 Error)');
      }

      const data = safeJsonParse(raw);
      if (!response.ok) {
        lastError = new Error(`chat/completions HTTP ${response.status}: ${raw.slice(0, 100)}`);
        return null;
      }
      if (!data) {
        lastError = new Error(`chat/completions non-JSON: ${raw.slice(0, 100)}`);
        return null;
      }
      if (data.error) {
        lastError = new Error(extractErrorMessage(data.error));
        return null;
      }

      candidate = extractImageFromChatResponse(data);

      if (!candidate) {
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          const markdownUrl = content.match(/\((https?:\/\/[^)\s]+)\)/);
          const directUrl = content.match(/https?:\/\/[^\s)\]]+/);
          const url = (markdownUrl?.[1] || directUrl?.[0] || '').trim();
          if (url) {
            candidate = await tryFetchExternalImage(url);
          }
        }
      }

      if (!candidate) {
        candidate = extractImageFromGeminiResponse(data);
      }

      if (!candidate && data.data?.[0]?.b64_json) {
        candidate = toDataUrl(data.data[0].b64_json);
      }

      if (!candidate && data.data?.[0]?.url) {
        candidate = await tryFetchExternalImage(data.data[0].url);
      }

      if (!candidate && Array.isArray(data.images) && data.images[0]) {
        candidate = toDataUrl(data.images[0].b64_json || data.images[0]);
      }

      if (!candidate) {
        lastError = new Error('Could not extract image from chat/completions response');
      }

      return candidate;
    };

    try {
      if (GEMINI_IMAGE_STRATEGY !== 'chat_only') {
        candidate = await tryImagesGenerations();
      }
      if (!candidate) {
        candidate = await tryChatCompletions();
      }
    } catch (error) {
      lastError = error;
    }

    if (!candidate) {
      if (!lastError) {
        lastError = new Error('Could not extract image from model response');
      }
      continue;
    }

    const verdict = await validateGeneratedImage({
      dataUrl: candidate,
      requiredSpecies,
      strictNoText,
      strictChemistry,
    });

    const noTextOk = !strictNoText || verdict?.has_text === false;
    const chemistryOk = !strictChemistry
      || (Array.isArray(verdict?.species) && verdict.species.every((species) => species && species.ok === true));

    if (verdict && noTextOk && chemistryOk) {
      return candidate;
    }

    const samples = Array.isArray(verdict?.text_samples)
      ? verdict.text_samples.filter(Boolean).slice(0, 6)
      : [];
    const firstSpeciesProblem = Array.isArray(verdict?.species)
      ? verdict.species
        .flatMap((species) => (Array.isArray(species?.problems) ? species.problems : []))
        .filter(Boolean)[0]
      : '';

    if (strictNoText && verdict?.has_text === true) {
      lastError = new Error(`validator_reject_has_text: ${samples.join(', ') || 'text detected'}`);
    } else if (strictChemistry && firstSpeciesProblem) {
      lastError = new Error(`validator_reject_chemistry: ${String(firstSpeciesProblem).slice(0, 200)}`);
    } else {
      lastError = new Error('validator_reject');
    }
  }

  throw lastError || new Error('image generation failed');
}

async function generateRenderingImages({
  prompt,
  numberOfImages = 1,
  aspectRatio = '9:16',
  strictNoText = false,
  strictChemistry = false,
  requiredSpecies = [],
  maxAttemptsPerImage = 2,
}) {
  const normalizedPrompt = String(prompt || '').trim();
  if (normalizedPrompt.length < 10) {
    throw new Error('Prompt too short');
  }
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const targetCount = Math.max(1, Math.min(Number(numberOfImages || 1), 4));
  const attempts = Math.max(1, Math.min(Number(maxAttemptsPerImage || 2), 2));
  const imagePrompt = buildImagePrompt({
    prompt: normalizedPrompt,
    aspectRatio,
    requiredSpecies,
  });

  const tasks = Array.from({ length: targetCount }, () => generateOneRenderingImage({
    imagePrompt,
    aspectRatio,
    strictNoText: Boolean(strictNoText),
    strictChemistry: Boolean(strictChemistry),
    requiredSpecies: Array.isArray(requiredSpecies) ? requiredSpecies : [],
    maxAttemptsPerImage: attempts,
  }));

  const results = await Promise.allSettled(tasks);
  const images = results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);

  if (images.length === 0) {
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason?.message || 'unknown error')
      .join('; ');
    throw new Error(`All image generation attempts failed: ${errors}`);
  }

  return images;
}

module.exports = {
  generateRenderingImages,
};
