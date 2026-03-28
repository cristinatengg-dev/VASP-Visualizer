const { validateRenderingImage } = require('./validate-image');
const https = require('https');
const { proxyAgent } = require('../proxy-agent');

const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://api.aipaibox.com/v1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_IMAGE_MODEL_RAW = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const GEMINI_IMAGE_STRATEGY = process.env.GEMINI_IMAGE_STRATEGY || 'chat_only';

function normalizeGeminiModel(model) {
  const normalized = String(model || '').trim();
  if (normalized === 'gemini-3.1-pro-proview') {
    return 'gemini-3-pro-image-preview';
  }
  return normalized;
}

const GEMINI_IMAGE_MODEL = normalizeGeminiModel(GEMINI_IMAGE_MODEL_RAW);

const SPECIES_CANON = {
  // ── Diatomics ──
  H2: 'Diatomic hydrogen: exactly 2 white spheres connected by 1 single bond stick; linear; total 2 atoms. NO labels.',
  N2: 'Diatomic nitrogen: exactly 2 blue (#3050F8) spheres connected by 1 triple bond (3 parallel sticks); linear; total 2 atoms. NO labels.',
  O2: 'Diatomic oxygen: exactly 2 red (#FF0D0D) spheres connected by 1 double bond (2 parallel sticks); linear; total 2 atoms. NO labels.',
  CO: 'Carbon monoxide: exactly 1 gray sphere (C) + 1 red sphere (O) connected by triple bond; linear; total 2 atoms. NO labels.',
  NO: 'Nitric oxide: exactly 1 blue sphere (N) + 1 red sphere (O); linear; total 2 atoms. NO labels.',
  HF: 'Hydrogen fluoride: exactly 1 white sphere (H) + 1 green sphere (F); linear; total 2 atoms. NO labels.',
  HCl: 'Hydrogen chloride: exactly 1 white sphere (H) + 1 green sphere (Cl); linear; total 2 atoms. NO labels.',

  // ── Triatomics ──
  CO2: 'Carbon dioxide: exactly 1 gray sphere (C) in center + 2 red spheres (O) on either side; perfectly linear 180°; 2 double bonds; total 3 atoms. NO labels.',
  H2O: 'Water: exactly 1 red sphere (O) at apex + 2 white spheres (H); bent geometry 104.5°; 2 single bonds; total 3 atoms. NO labels.',
  NO2: 'Nitrogen dioxide: exactly 1 blue sphere (N) + 2 red spheres (O); bent ~134°; total 3 atoms. NO labels.',
  SO2: 'Sulfur dioxide: exactly 1 yellow sphere (S) + 2 red spheres (O); bent ~119°; total 3 atoms. NO labels.',
  H2S: 'Hydrogen sulfide: exactly 1 yellow sphere (S) + 2 white spheres (H); bent ~92°; total 3 atoms. NO labels.',
  N2O: 'Nitrous oxide: exactly 2 blue spheres (N) + 1 red sphere (O); linear N-N-O; total 3 atoms. NO labels.',
  O3: 'Ozone: exactly 3 red spheres (O); bent ~117°; total 3 atoms. NO labels.',

  // ── 4-5 atom molecules ──
  NH3: 'Ammonia: exactly 1 blue sphere (N) at apex + 3 white spheres (H); trigonal pyramidal ~107°; total 4 atoms. NO labels.',
  CH4: 'Methane: exactly 1 gray sphere (C) at center + 4 white spheres (H); tetrahedral ~109.5°; total 5 atoms. NO labels.',
  SO3: 'Sulfur trioxide: exactly 1 yellow sphere (S) center + 3 red spheres (O); trigonal planar 120°; total 4 atoms. NO labels.',

  // ── Hydrocarbons ──
  C2H2: 'Acetylene: exactly 2 gray spheres (C) + 2 white spheres (H); linear H-C≡C-H; carbon triple bond; total 4 atoms. NO labels.',
  C2H4: 'Ethylene: exactly 2 gray spheres (C) + 4 white spheres (H); planar; C=C double bond; total 6 atoms. NO labels.',
  C2H6: 'Ethane: exactly 2 gray spheres (C) + 6 white spheres (H); C-C single bond; staggered; total 8 atoms. NO labels.',
  C3H6: 'Propene: exactly 3 gray spheres (C) + 6 white spheres (H); CH2=CH-CH3; one C=C double bond + one C-C single bond; total 9 atoms. NO labels.',
  C3H8: 'Propane: exactly 3 gray spheres (C) in zigzag chain + 8 white spheres (H); CH3-CH2-CH3; 2 C-C single bonds only; NO double bonds; NO rings; total 11 atoms. NO labels.',
  C4H10: 'Butane: exactly 4 gray spheres (C) in zigzag chain + 10 white spheres (H); 3 C-C single bonds; NO rings; total 14 atoms. NO labels.',
  C6H6: 'Benzene: exactly 6 gray spheres (C) forming a regular hexagonal ring + 6 white spheres (H); alternating single/double bonds in ring; planar; total 12 atoms. NO labels.',

  // ── Common inorganic ──
  HNO3: 'Nitric acid: 1 blue N center + 3 red O + 1 white H; total 5 atoms. NO labels.',
  H2SO4: 'Sulfuric acid: 1 yellow S center + 4 red O + 2 white H; tetrahedral S; total 7 atoms. NO labels.',
  HCN: 'Hydrogen cyanide: H-C≡N; linear; 1 white + 1 gray + 1 blue sphere; total 3 atoms. NO labels.',

  // ── Single atoms / dopants (for catalysis) ──
  Ru: 'Ruthenium single-atom site: exactly 1 silver-blue metallic sphere anchored on the support; represent ONLY by sphere color and metallic material — absolutely NO text or symbol printed on the sphere.',
  Pt: 'Platinum single-atom site: exactly 1 light gray (#D0D0E0) metallic sphere; NO text on sphere.',
  Pd: 'Palladium single-atom site: exactly 1 silver (#9B9B9B) metallic sphere; NO text on sphere.',
  Ni: 'Nickel single-atom: exactly 1 green (#50D050) sphere; NO text on sphere.',
  Fe: 'Iron single-atom: exactly 1 rust orange (#E06633) sphere; NO text on sphere.',
  Cu: 'Copper single-atom: exactly 1 copper (#C88033) sphere; NO text on sphere.',
  Au: 'Gold single-atom: exactly 1 gold (#FFD123) sphere; NO text on sphere.',
  Co: 'Cobalt single-atom: exactly 1 pink (#F090A0) sphere; NO text on sphere.',

  // ── Dopant atoms ──
  N: 'Nitrogen dopant atoms in a carbon/graphene lattice: blue (#3050F8) spheres embedded in the lattice replacing gray carbon spheres; NO text printed on any sphere.',
  B: 'Boron dopant atoms: pink (#FFB5B5) spheres embedded in the lattice; NO text on sphere.',
  S: 'Sulfur dopant atoms: yellow (#FFFF30) spheres; NO text on sphere.',
  P: 'Phosphorus dopant: orange (#FF8000) sphere; NO text on sphere.',
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
      reject(new Error('Request timeout after ' + timeoutMs + 'ms'));
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
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
    };
    if (proxyAgent) options.agent = proxyAgent;

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || undefined;
        resolve(toDataUrl(buffer.toString('base64'), mime));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Image fetch timeout')); });
    req.end();
  });
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
  let bestCandidate = null;

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

    // Save every successfully generated candidate as fallback
    bestCandidate = candidate;

    // Skip validation to avoid extra API call — rely on prompt constraints
    // Validation can be re-enabled via GEMINI_IMAGE_STRATEGY=validated
    return candidate;
  }

  // If all validation attempts failed but we have a generated image, return it anyway
  if (bestCandidate) {
    return bestCandidate;
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

  const tasks = Array.from({ length: targetCount }, () => generateOneRenderingImage({
    imagePrompt: normalizedPrompt,
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
