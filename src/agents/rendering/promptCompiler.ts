/**
 * promptCompiler.ts — Phase 4: Prompt Compilation Engine
 *
 * Pure functions that assemble the final prompt from:
 * - Parsed science entities
 * - Selected visual plan
 * - User style preferences
 * - Hard scientific constraints (auto-appended)
 */

import {
  ParsedScience,
  PlanCard,
  CompiledPrompt,
  OutputParams,
  StylePreferences,
  AdvancedSwitches,
  ChemicalSpecies,
} from './types';
import { HARD_SCIENTIFIC_CONSTRAINTS, JOURNAL_PRESETS, CPK_COLORS } from './constants';

// ─── Chemical Species Formatter ───────────────────────────────────────────────

// Precise molecular geometry from computational chemistry — overrides AI-guessed descriptions
const PRECISE_SPECIES: Record<string, string> = {
  H2: '2 white spheres, 1 single bond, linear, total 2 atoms',
  N2: '2 blue spheres, 1 triple bond (3 sticks), linear, total 2 atoms',
  O2: '2 red spheres, 1 double bond (2 sticks), linear, total 2 atoms',
  CO: '1 gray(C) + 1 red(O), triple bond, linear, total 2 atoms',
  NO: '1 blue(N) + 1 red(O), linear, total 2 atoms',
  CO2: '1 gray(C) center + 2 red(O) sides, linear 180°, 2 double bonds, total 3 atoms',
  H2O: '1 red(O) apex + 2 white(H), bent 104.5°, 2 single bonds, total 3 atoms',
  NO2: '1 blue(N) + 2 red(O), bent ~134°, total 3 atoms',
  SO2: '1 yellow(S) + 2 red(O), bent ~119°, total 3 atoms',
  N2O: '2 blue(N) + 1 red(O), linear N-N-O, total 3 atoms',
  O3: '3 red(O), bent ~117°, total 3 atoms',
  NH3: '1 blue(N) apex + 3 white(H), trigonal pyramidal 107°, total 4 atoms',
  CH4: '1 gray(C) center + 4 white(H), tetrahedral 109.5°, total 5 atoms',
  C2H2: '2 gray(C) + 2 white(H), linear H-C≡C-H, triple bond, total 4 atoms',
  C2H4: '2 gray(C) + 4 white(H), planar, C=C double bond, total 6 atoms',
  C2H6: '2 gray(C) + 6 white(H), C-C single bond, total 8 atoms',
  C3H6: '3 gray(C) + 6 white(H), CH2=CH-CH3, 1 double + 1 single C-C bond, total 9 atoms',
  C3H8: '3 gray(C) zigzag + 8 white(H), CH3-CH2-CH3, 2 C-C single bonds, NO double bonds, NO rings, total 11 atoms',
  C4H10: '4 gray(C) zigzag + 10 white(H), 3 C-C single bonds, NO rings, total 14 atoms',
  C6H6: '6 gray(C) hexagonal ring + 6 white(H), alternating bonds, planar, total 12 atoms',
  HCN: '1 white(H) + 1 gray(C) + 1 blue(N), linear H-C≡N, total 3 atoms',
};

const formatChemicalSpecies = (species: ChemicalSpecies[]): string => {
  if (species.length === 0) return '';
  return species
    .map((s) => {
      const precise = PRECISE_SPECIES[s.formula_en];
      if (precise) {
        return `${s.formula_en}: ${precise}. NO text labels on atoms.`;
      }
      const colorEntries = Object.entries(s.color_rule)
        .map(([atom, color]) => `${atom}=${color}`)
        .join(', ');
      return `${s.formula_en} (${s.geometry_hint}, bonds: ${s.bond_topology}, CPK colors: ${colorEntries || 'standard CPK'}). NO text labels on atoms.`;
    })
    .join('; ');
};

const elementName = (symbol: string): string => {
  const s = String(symbol || '').trim();
  const map: Record<string, string> = {
    H: 'hydrogen',
    C: 'carbon',
    N: 'nitrogen',
    O: 'oxygen',
    S: 'sulfur',
    F: 'fluorine',
    Cl: 'chlorine',
    Br: 'bromine',
    I: 'iodine',
    P: 'phosphorus',
    Si: 'silicon',
    Na: 'sodium',
    K: 'potassium',
    Mg: 'magnesium',
    Ca: 'calcium',
    Fe: 'iron',
    Ni: 'nickel',
    Cu: 'copper',
    Ru: 'ruthenium',
    Pt: 'platinum',
    Au: 'gold',
    Zn: 'zinc',
    Mo: 'molybdenum',
    Ti: 'titanium',
    Ce: 'cerium',
  };
  return map[s] || s;
};

const formatChemicalSpeciesNoFormula = (species: ChemicalSpecies[]): string => {
  if (species.length === 0) return '';
  return species
    .map((s) => {
      const precise = PRECISE_SPECIES[s.formula_en];
      if (precise) {
        return `[${s.role || 'species'}] ${precise}. NO text labels on atoms.`;
      }
      const counts: Record<string, number> = {};
      for (const a of s.atoms || []) {
        counts[a] = (counts[a] || 0) + 1;
      }
      const atomPhrase = Object.entries(counts)
        .map(([sym, n]) => `${n} ${elementName(sym)} atom${n === 1 ? '' : 's'}`)
        .join(', ');
      const colorPhrase = Object.entries(s.color_rule)
        .map(([atom, color]) => `${elementName(atom)}=${color}`)
        .join(', ');
      return `molecule with ${atomPhrase}; geometry: ${s.geometry_hint}; bond topology: ${s.bond_topology}; CPK colors: ${colorPhrase || 'standard CPK'}. NO text labels on atoms.`;
    })
    .join('; ');
};

const VERIFIED_STRUCTURE_ONLY_RULE =
  'Verified-structure-only rule: only the required species listed in this prompt may be rendered as discrete ball-and-stick molecules. Do not invent extra gas molecules, intermediates, random clusters, guessed crystal lattices, or atomistic support networks. If the catalyst, support, substrate, surface, active site, nanoparticle, or central object is not supplied as exact atomic coordinates, render it as a smooth/stylized material surface, abstract particle, texture, glow, facet, or field instead of an atom-by-atom lattice.';

// ─── Output Size Formatter ────────────────────────────────────────────────────

const formatOutputConstraints = (outputParams: OutputParams): string => {
  const journal = JOURNAL_PRESETS[outputParams.journal];
  const width = outputParams.aspectRatio === 'Custom'
    ? outputParams.customWidth
    : journal.widthPx;
  const height = outputParams.aspectRatio === 'Custom'
    ? outputParams.customHeight
    : journal.heightPx;
  return `Target output: ${width} × ${height} pixels, ultra-high resolution 600 DPI publication-grade quality, maximum pixel density, full bleed image. Aspect ratio: ${outputParams.aspectRatio}. NO watermark reserved area. Use entire canvas for scientific visualization.`.trim();
};

// ─── Style Formatter ──────────────────────────────────────────────────────────

const formatStyle = (plan: PlanCard, stylePref: StylePreferences): string => {
  const styleTerms: string[] = [];

  if (stylePref.cinematic > 60) styleTerms.push('cinematic depth of field, volumetric fog, dramatic directional lighting');
  if (stylePref.macro > 60) styleTerms.push('extreme macro photography, surface texture detail, precision scientific imagery');
  if (stylePref.abstract > 60) styleTerms.push('conceptual abstraction, energy field visualization, symbolic scientific metaphor');
  if (stylePref.realistic > 60) styleTerms.push('photorealistic rendering, physically accurate materials, true-to-life color');
  if (stylePref.glass > 60) styleTerms.push('glass-like transparency, refraction, crystal purity, subsurface scattering');
  if (stylePref.metallic > 60) styleTerms.push('metallic reflectance, brushed metal surface, industrial precision rendering');

  const baseStyle = 'C4D / Octane Render / UE5 Lumen quality, ultra-HD scientific visualization';
  return styleTerms.length > 0
    ? `${baseStyle}, ${styleTerms.join(', ')}`
    : baseStyle;
};

// ─── Main Compiler ────────────────────────────────────────────────────────────

export const compilePlanAPrompt = (
  science: ParsedScience,
  plan: PlanCard,
  outputParams: OutputParams,
  stylePref: StylePreferences,
  switches: AdvancedSwitches,
  additionalInstructions: string
): CompiledPrompt => {
  const journalConfig = JOURNAL_PRESETS[outputParams.journal];
  const allSpecies = [
    ...science.reactants,
    ...science.intermediates,
    ...science.products,
  ];

  // ── Slot 1: Main Theme
  const mainTheme = `A pure scientific visualization image (NO title text, NO journal name, NO watermark) featuring ${science.core_theme}. Scientific domain: ${science.domain} / ${science.subdomain}. Visual metaphor: ${plan.visualMetaphor}. ${plan.tagline}`;

  // ── Slot 2: Focus Area
  const focusArea = `Primary focal object: ${science.central_object}. Scale level: ${science.scale_level}. Composition type: ${plan.compositionType}. Focal point: ${plan.focalObject}.`;

  // ── Slot 3: Core Scientific Structure
  // If the substrate/support is not explicitly described with a specific molecular structure,
  // use abstract artistic representation instead of forcing incorrect molecular structures
  const hasExplicitSubstrate = science.support_or_substrate
    && science.support_or_substrate !== 'none specified'
    && science.support_or_substrate !== 'none'
    && science.support_or_substrate !== 'null'
    && science.support_or_substrate.trim().length > 0;

  const substrateDescription = hasExplicitSubstrate
    ? `Support/substrate: ${science.support_or_substrate}. Unless exact atomic coordinates are supplied, show it as a continuous/stylized material surface or crystalline texture, NOT a guessed atomistic ball-and-stick lattice.`
    : `Support/substrate: Render as an abstract artistic surface — use gradient color fields, soft glow layers, crystalline textures, or flowing energy surfaces rather than explicit molecular ball-and-stick structures. The substrate should serve as an aesthetic background or platform, NOT as a specific molecular structure. Think of it as an artistic impression of a surface: smooth metallic gradients, luminous planes, fractal crystal patterns, or wave-like energy fields.`;

  const coreScientificStructure = `Core entity: ${science.central_object}. ${substrateDescription} Active site: ${science.active_site || 'none specified'}. Environment: ${science.environment}. ${VERIFIED_STRUCTURE_ONLY_RULE}`;

  // ── Slot 4: Specific Event / Mechanism
  const specificEvent = `Key mechanism: ${science.key_mechanism}. Visual keywords that must appear: ${science.visual_keywords.join(', ')}.`;

  // ── Slot 5: Spatial Depth Layers
  const backgroundLayer = hasExplicitSubstrate
    ? `Background: ${science.support_or_substrate} structure with abstract environmental context.`
    : `Background: abstract artistic environment — use gradient color fields, soft volumetric glow, crystalline surfaces, or flowing energy patterns. DO NOT render explicit ball-and-stick molecular structures for the background/substrate unless specifically described above. Use artistic abstraction: smooth surfaces, luminous gradients, fractal patterns, wave-like textures.`;

  const spatialDepthLayers = `Foreground: close-up of ${science.central_object} with maximum structural detail. Mid-ground: ${science.environment} context and supporting elements. ${backgroundLayer}`;

  const strictMode = switches.strictChemicalStructure || switches.prioritizeAccuracy;

  // ── Slot 6: Mandatory Chemical Species
  const mandatoryChemicalSpecies = allSpecies.length > 0
    ? `All of the following chemical species MUST appear and be chemically accurate: ${strictMode ? formatChemicalSpeciesNoFormula(allSpecies) : formatChemicalSpecies(allSpecies)}. These listed species are the ONLY discrete ball-and-stick molecules allowed in the image. Do not add unlisted molecules or extra atoms. Must-show elements: ${science.must_show_elements.join(', ')}.`
    : science.must_show_elements.length > 0
      ? `Key elements to include: ${science.must_show_elements.join(', ')}.`
      : 'Render core scientific entities with maximum structural accuracy.';

  // ── Slot 7: Scientific Accuracy Constraints
  const scientificAccuracyConstraints = strictMode
    ? `STRICT MODE: All molecular structures must be chemically valid. Atom counts, bond topology, bond types (single/double/triple), and molecular geometry MUST be correct. CPK color system required: C=gray, O=red, H=white, N=blue, S=yellow. ${VERIFIED_STRUCTURE_ONLY_RULE} Forbidden: ${science.forbidden_elements.join(', ') || 'no extra clutter'}.`
    : `Render chemical species with correct atom counts and standard CPK coloring. Avoid impossible bond arrangements. ${VERIFIED_STRUCTURE_ONLY_RULE} Forbidden: ${science.forbidden_elements.join(', ') || 'no extra clutter'}.`;

  // ── Slot 8: Reduced Clutter
  const reducedClutter = `CRITICAL: The image must contain ABSOLUTELY ZERO TEXT of any kind — no letters, no numbers, no element symbols, no chemical formulas, no labels, no annotations, no arrows, no diagrams. SPECIFICALLY FORBIDDEN: atom labels like "Ru1", "N1", "C2", "O3", or ANY element symbol printed on atom spheres — atoms must be PURE blank colored spheres distinguished ONLY by CPK color. Keep the image clean and focused. No irrelevant background objects. Forbidden visual elements: ${science.forbidden_elements.join(', ') || 'none specified'}, text, labels, atom indices, element symbols on atoms, annotations, arrows, numbers, letters, chemical notation. The image must be 100% text-free.`;

  // ── Slot 9: Texture & Lighting
  const textureAndLighting = `Lighting: ${journalConfig.style.includes('dramatic') ? 'dramatic single-source directional lighting with deep shadows' : 'clean multi-source scientific lighting with soft shadows'}. Materials: ${plan.background} background with ${switches.prioritizeArt ? 'artistic material interpretation' : 'scientifically accurate material rendering'}. Use Tyndall effect for depth in molecular environments. Subsurface scattering where appropriate.`;

  // ── Slot 10: Style
  const style = formatStyle(plan, stylePref);

  // ── Slot 11: Composition Constraints
  const compositionConstraints = `Composition: ${plan.compositionType}. Primary subject occupies center-upper 60% of frame. NO reserved watermark zone — use the full canvas. Maintain 2% outer safety margin on all sides for print trimming only. Full bleed scientific image. No text overlay of any kind.`;

  // ── Slot 12: Output Constraints
  const outputConstraints = formatOutputConstraints(outputParams);

  // ── Additional instructions integration
  const additionalNote = additionalInstructions.trim()
    ? `Additional visual instructions from researcher: "${additionalInstructions.trim()}" — integrate these requests while preserving all chemical accuracy constraints above.`
    : '';

  // ── Full prompt assembly
  const fullPrompt = [
    `[SCIENTIFIC COVER AGENT — COMPILED PROMPT v1.0]`,
    ``,
    `[1. MAIN THEME]`,
    mainTheme,
    ``,
    `[2. FOCUS AREA]`,
    focusArea,
    ``,
    `[3. CORE SCIENTIFIC STRUCTURE]`,
    coreScientificStructure,
    ``,
    `[4. SPECIFIC EVENT / MECHANISM]`,
    specificEvent,
    ``,
    `[5. SPATIAL DEPTH LAYERS]`,
    spatialDepthLayers,
    ``,
    `[6. MANDATORY CHEMICAL SPECIES]`,
    mandatoryChemicalSpecies,
    ``,
    `[7. SCIENTIFIC ACCURACY CONSTRAINTS]`,
    scientificAccuracyConstraints,
    ``,
    `[8. REDUCED CLUTTER]`,
    reducedClutter,
    ``,
    `[9. TEXTURE & LIGHTING]`,
    textureAndLighting,
    ``,
    `[10. STYLE]`,
    style,
    ``,
    `[11. COMPOSITION CONSTRAINTS]`,
    compositionConstraints,
    ``,
    `[12. OUTPUT CONSTRAINTS]`,
    outputConstraints,
    additionalNote ? `\n[ADDITIONAL INSTRUCTIONS]\n${additionalNote}` : '',
    ``,
    `[HARD SCIENTIFIC CONSTRAINTS — AUTO-APPENDED — NON-NEGOTIABLE]`,
    HARD_SCIENTIFIC_CONSTRAINTS,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    version: '1.0',
    selectedPlan: plan.type,
    mainTheme,
    focusArea,
    coreScientificStructure,
    specificEvent,
    spatialDepthLayers,
    mandatoryChemicalSpecies,
    scientificAccuracyConstraints,
    reducedClutter,
    textureAndLighting,
    style,
    compositionConstraints,
    outputConstraints,
    hardConstraints: HARD_SCIENTIFIC_CONSTRAINTS,
    fullPrompt,
  };
};

// ─── Real API: Phase 1 — Scientific Entity Extraction (Gemini 2.0 Flash) ────

import { API_BASE_URL } from '../../config';

const humanizeRenderingApiError = (message: string, fallback: string) => {
  const raw = String(message || '').trim();

  if (!raw) {
    return fallback;
  }

  if (/(IMAGE_LLM_API_KEY|TEXT_LLM_API_KEY|GEMINI_API_KEY).*not configured/i.test(raw)) {
    return '图像服务尚未配置，请联系管理员补充可用凭据。';
  }

  if (
    /(Text LLM|Gemini) API error\s*401/i.test(raw)
    || /No available channel|model_not_found/i.test(raw)
    || /invalid token/i.test(raw)
    || /无效的令牌/i.test(raw)
    || /new_api_error/i.test(raw)
  ) {
    if (/No available channel|model_not_found/i.test(raw)) {
      return '图像模型通道暂不可用，请在模型平台确认当前 API Key 的分组已开通 gpt-image-2。';
    }
    return '图像分析网关鉴权失败，请联系管理员更新令牌或上游网关配置。';
  }

  if (/(Text LLM|Gemini) API error\s*429/i.test(raw) || /quota exceeded/i.test(raw) || /resource_exhausted/i.test(raw)) {
    return '图像分析服务当前繁忙，请稍后再试。';
  }

  return raw || fallback;
};

/**
 * parseScience — Phase 1 real implementation
 * Calls /api/agent/parse-science which uses Gemini 2.0 Flash to extract
 * structured scientific entities from the user's abstract/text.
 */
export const parseScience = async (text: string): Promise<ParsedScience> => {
  const res = await fetch(`${API_BASE_URL}/agent/parse-science`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(humanizeRenderingApiError(data.error || `Parse API error ${res.status}`, 'Science parsing failed'));
  }
  return data.data as ParsedScience;
};

/**
 * parsePdf — Phase 1 PDF variant
 * Uploads PDF to /api/agent/parse-pdf which extracts text server-side,
 * then passes the text to Gemini for entity extraction.
 */
export const parsePdf = async (file: File): Promise<ParsedScience> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE_URL}/agent/parse-pdf`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(humanizeRenderingApiError(data.error || `PDF parse API error ${res.status}`, 'PDF parsing failed'));
  }
  return data.data as ParsedScience;
};

// ─── Real API: Phase 5 — Base Image Generation (Gemini Imagen) ──────────────

export interface GenerateImageResult {
  images: string[]; // base64 encoded images
}

export interface GenerateBaseImagesOptions {
  strictNoText?: boolean;
  strictChemistry?: boolean;
  requiredSpecies?: ChemicalSpecies[];
  maxAttemptsPerImage?: number;
}

export interface EditBaseImageOptions {
  strictNoText?: boolean;
  strictChemistry?: boolean;
  requiredSpecies?: ChemicalSpecies[];
}

const serializeRequiredSpecies = (requiredSpecies?: ChemicalSpecies[]) => (
  requiredSpecies
    ? requiredSpecies.map(s => ({
        formula_en: s.formula_en,
        atoms: s.atoms,
        bond_topology: s.bond_topology,
        geometry_hint: s.geometry_hint,
        color_rule: s.color_rule,
        role: s.role,
        priority: s.priority
      }))
    : []
);

/**
 * generateBaseImages — Phase 5
 * Calls /api/agent/generate-image which uses the configured image model.
 */
export const generateBaseImages = async (
  fullPrompt: string,
  aspectRatio: string = '9:16',
  numberOfImages: number = 1,
  options: GenerateBaseImagesOptions = {}
): Promise<string[]> => {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/agent/generate-image`;
  const safeRequiredSpecies = serializeRequiredSpecies(options.requiredSpecies);
  const parseJsonResponse = async (response: Response, fallback: string) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error("Non-JSON response from server:", text.substring(0, 200));
      if (response.status === 524) {
        throw new Error('图像生成等待时间过长，网关已超时。系统已改为后台任务模式，请重新提交。');
      }
      throw new Error(`${fallback} (Status: ${response.status})`);
    }
  };
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const extractValidImages = (images: unknown): string[] => {
    if (!Array.isArray(images)) return [];
    return images.filter((img): img is string => typeof img === 'string' && img.length > 100);
  };

  let res: Response;
  try {
    const payload = {
      prompt: fullPrompt,
      numberOfImages,
      aspectRatio,
      strictNoText: Boolean(options.strictNoText),
      strictChemistry: Boolean(options.strictChemistry),
      requiredSpecies: safeRequiredSpecies,
      maxAttemptsPerImage: options.maxAttemptsPerImage,
    };
  
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(humanizeRenderingApiError(`Request failed to ${endpoint}: ${msg}`, 'Image generation request failed'));
  }

  const data = await parseJsonResponse(res, 'Invalid image generation response from server');

  if (!res.ok || !data.success) {
    throw new Error(humanizeRenderingApiError(data.error || `Image generation error ${res.status}`, 'Image generation failed'));
  }

  const directImages = extractValidImages(data.images);
  if (directImages.length > 0) {
    return directImages;
  }

  if (typeof data.jobId !== 'string' || data.jobId.length < 10) {
    throw new Error('Server accepted the generation request but did not return images or a job id.');
  }

  const statusEndpoint = `${endpoint}/${encodeURIComponent(data.jobId)}`;
  const startedAt = Date.now();
  const maxWaitMs = 8 * 60 * 1000;
  let pollDelayMs = 1800;

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(pollDelayMs);
    pollDelayMs = Math.min(5000, Math.round(pollDelayMs * 1.15));

    let statusRes: Response;
    try {
      statusRes = await fetch(statusEndpoint, { method: 'GET' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(humanizeRenderingApiError(`Request failed to ${statusEndpoint}: ${msg}`, 'Image generation status request failed'));
    }

    const statusData = await parseJsonResponse(statusRes, 'Invalid image generation status response from server');
    if (!statusRes.ok || !statusData.success) {
      throw new Error(humanizeRenderingApiError(statusData.error || `Image generation status error ${statusRes.status}`, 'Image generation failed'));
    }
    const statusImages = extractValidImages(statusData.images);
    if (statusData.status === 'succeeded' && statusImages.length > 0) {
      return statusImages;
    }
    if (statusData.status === 'failed') {
      throw new Error(humanizeRenderingApiError(statusData.error || 'Image generation failed', 'Image generation failed'));
    }
  }

  throw new Error('图像生成仍在处理中，但等待时间已超过 8 分钟。请稍后重试。');
};

export const editBaseImage = async (
  imageDataUrl: string,
  editPrompt: string,
  aspectRatio: string = '9:16',
  maskDataUrl?: string | null,
  options: EditBaseImageOptions = {}
): Promise<string> => {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '');
  const endpoint = `${baseUrl}/agent/edit-image`;
  const safeRequiredSpecies = serializeRequiredSpecies(options.requiredSpecies);
  const parseJsonResponse = async (response: Response, fallback: string) => {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Non-JSON response from server:', text.substring(0, 200));
      if (response.status === 524) {
        throw new Error('图像编辑等待时间过长，网关已超时。系统已改为后台任务模式，请重新提交。');
      }
      throw new Error(`${fallback} (Status: ${response.status})`);
    }
  };
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl,
        maskDataUrl: maskDataUrl || undefined,
        prompt: editPrompt,
        aspectRatio,
        strictNoText: Boolean(options.strictNoText),
        strictChemistry: Boolean(options.strictChemistry),
        requiredSpecies: safeRequiredSpecies,
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(humanizeRenderingApiError(`Request failed to ${endpoint}: ${msg}`, 'Image edit request failed'));
  }

  const data = await parseJsonResponse(res, 'Invalid image edit response from server');

  if (!res.ok || !data.success) {
    throw new Error(humanizeRenderingApiError(data.error || `Image edit error ${res.status}`, 'Image edit failed'));
  }

  if (typeof data.image === 'string' && data.image.length > 100) {
    return data.image as string;
  }

  if (typeof data.jobId !== 'string' || data.jobId.length < 10) {
    throw new Error('Server accepted the edit request but did not return an image or job id.');
  }

  const statusEndpoint = `${endpoint}/${encodeURIComponent(data.jobId)}`;
  const startedAt = Date.now();
  const maxWaitMs = 8 * 60 * 1000;
  let pollDelayMs = 1800;

  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(pollDelayMs);
    pollDelayMs = Math.min(5000, Math.round(pollDelayMs * 1.15));

    let statusRes: Response;
    try {
      statusRes = await fetch(statusEndpoint, { method: 'GET' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(humanizeRenderingApiError(`Request failed to ${statusEndpoint}: ${msg}`, 'Image edit status request failed'));
    }

    const statusData = await parseJsonResponse(statusRes, 'Invalid image edit status response from server');
    if (!statusRes.ok || !statusData.success) {
      throw new Error(humanizeRenderingApiError(statusData.error || `Image edit status error ${statusRes.status}`, 'Image edit failed'));
    }
    if (statusData.status === 'succeeded' && typeof statusData.image === 'string' && statusData.image.length > 100) {
      return statusData.image as string;
    }
    if (statusData.status === 'failed') {
      throw new Error(humanizeRenderingApiError(statusData.error || 'Image edit failed', 'Image edit failed'));
    }
  }

  throw new Error('图像编辑仍在处理中，但等待时间已超过 8 分钟。请稍后重试。');
};

// ─── Real API: Phase 7 — HD Refinement (Doubao Seedream) ────────────────────

/**
 * refineImage — Phase 7
 * Calls /api/agent/refine-image which uses Doubao Seedream 3.0
 * for HD refinement of the selected base image.
 */
export const refineImage = async (
  prompt: string,
  width: number = 1024,
  height: number = 1365,
  guidanceScale: number = 7.5
): Promise<string> => {
  const res = await fetch(`${API_BASE_URL}/agent/refine-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width, height, guidanceScale }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(humanizeRenderingApiError(data.error || `Refine API error ${res.status}`, 'Image refinement failed'));
  }
  return data.image as string;
};

// ─── Legacy mock (kept for offline/dev fallback) ──────────────────────────────

export const mockParseScience = (text: string): ParsedScience => {
  const lowerText = text.toLowerCase();
  let domain: ParsedScience['domain'] = 'Chemistry';
  if (lowerText.includes('material') || lowerText.includes('lattice') || lowerText.includes('crystal')) {
    domain = 'Materials';
  } else if (lowerText.includes('protein') || lowerText.includes('cell') || lowerText.includes('enzyme')) {
    domain = 'Biology';
  } else if (lowerText.includes('quantum') || lowerText.includes('phonon') || lowerText.includes('semiconductor')) {
    domain = 'Physics';
  }
  return {
    domain,
    subdomain: domain === 'Chemistry' ? 'Heterogeneous Catalysis' : domain,
    core_theme: text.slice(0, 80) + (text.length > 80 ? '...' : ''),
    central_object: 'catalytic active site',
    support_or_substrate: '',
    active_site: 'single-atom site',
    reactants: [
      {
        name_cn: '一氧化碳', formula_en: 'CO', atoms: ['C', 'O'],
        bond_topology: 'C triple-bonded to O',
        color_rule: { C: CPK_COLORS['C'], O: CPK_COLORS['O'] },
        geometry_hint: 'linear', role: 'reactant', priority: 'high',
      },
    ],
    intermediates: [],
    products: [
      {
        name_cn: '二氧化碳', formula_en: 'CO2', atoms: ['C', 'O', 'O'],
        bond_topology: 'two C=O double bonds',
        color_rule: { C: CPK_COLORS['C'], O: CPK_COLORS['O'] },
        geometry_hint: 'linear', role: 'product', priority: 'high',
      },
    ],
    environment: 'gas-solid interface at elevated temperature',
    scale_level: 'nanoscale (1-10 nm)',
    key_mechanism: 'Langmuir-Hinshelwood surface catalysis with electron transfer',
    visual_keywords: ['catalyst', 'electron density', 'surface reaction', 'nanoparticle'],
    journal_style: 'clean, mechanism-focused, high-impact',
    must_show_elements: ['CO', 'CO2', 'catalyst surface', 'active metal site'],
    forbidden_elements: ['text labels', 'arrows', 'charts', 'diagrams'],
    scientific_entities: [],
  };
};

// ─── Plan Generator (Phase 3 stub) ───────────────────────────────────────────

export const generateVisualPlans = (science: ParsedScience): PlanCard[] => {
  return [
    {
      id: 'plan-a',
      type: 'structural-realism',
      name: 'Structural Realism',
      tagline: `Precision visualization of ${science.central_object} with true molecular geometry`,
      visualMetaphor: 'Scientific microscope view — what the electron microscope would see',
      primaryColors: ['#1A1A2E', '#16213E', '#0F3460', '#E94560'],
      background: 'dark gradient scientific background',
      focalObject: science.central_object,
      compositionType: 'center-weighted with shallow depth of field',
      scaleLevel: science.scale_level,
      riskWarning: 'High structural accuracy required — any molecular error will be scientifically significant. Best for chemistry/materials journals.',
      suitableForRefImage: true,
      recommendedModel: 'Gemini 3.1 Flash Image',
      previewGradient: 'linear-gradient(135deg, #1A1A2E 0%, #0F3460 50%, #E94560 100%)',
    },
    {
      id: 'plan-b',
      type: 'mechanism-metaphor',
      name: 'Mechanism Metaphor',
      tagline: `Energy flow and reaction pathway as dramatic visual narrative`,
      visualMetaphor: 'Energy landscape — electrons dancing between atoms, reaction as light and motion',
      primaryColors: ['#0A0A0A', '#FF6B00', '#FFD700', '#00CED1'],
      background: 'dark space-like background with energy glow',
      focalObject: `${science.key_mechanism} visual metaphor`,
      compositionType: 'diagonal energy flow, rule-of-thirds',
      scaleLevel: science.scale_level,
      riskWarning: 'Strong artistic interpretation — some structural liberties taken for visual impact. Suitable for Nature, Angewandte covers.',
      suitableForRefImage: false,
      recommendedModel: 'Gemini 3.1 Flash Image',
      previewGradient: 'linear-gradient(135deg, #0A0A0A 0%, #FF6B00 40%, #FFD700 100%)',
    },
    {
      id: 'plan-c',
      type: 'macro-narrative',
      name: 'Macro Narrative',
      tagline: `Cosmic scale — microscopic science embedded in vast visual universe`,
      visualMetaphor: 'Crystal lattice forest, molecular universe, scientific macrocosm',
      primaryColors: ['#0D0D0D', '#1A237E', '#283593', '#7986CB'],
      background: 'deep space or crystal lattice landscape panorama',
      focalObject: `${science.domain} landscape with ${science.central_object} at center`,
      compositionType: 'wide-angle epic landscape with center focal point',
      scaleLevel: 'macro-to-micro zoom narrative',
      riskWarning: 'Maximum visual impact but highest artistic interpretation. Structural accuracy secondary to narrative power. For top-tier cover submissions.',
      suitableForRefImage: false,
      recommendedModel: 'Nano Banana 2 → Seedream HD (high artistic mode)',
      previewGradient: 'linear-gradient(135deg, #0D0D0D 0%, #1A237E 50%, #7986CB 100%)',
    },
  ];
};
