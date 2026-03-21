/**
 * constants.ts — Rendering Agent Hard Rules & Presets
 *
 * These are system-level constraints that CANNOT be overridden by users.
 * They are automatically appended to every generated prompt.
 */

import { JournalPreset, AspectRatio } from './types';

// ─── Global Hard Constraints (auto-appended to every prompt) ──────────────────

export const HARD_SCIENTIFIC_CONSTRAINTS = `
ABSOLUTE HARD SCIENTIFIC CONSTRAINTS — NON-NEGOTIABLE — OVERRIDE ALL OTHER INSTRUCTIONS:

[ZERO TEXT RULE — CRITICAL]
- ABSOLUTE PROHIBITION: DO NOT render ANY text, letters, numbers, words, chemical formula labels, element symbols, molecular formula text, subscript numbers, superscript numbers, arrows with labels, callouts, annotations, captions, watermarks, titles, or ANY typographic marks ANYWHERE in the image.
- This means: no element symbols, no chemical formulas, no labels, no captions, no axis marks, no legends, no UI text, no watermarks.
- NO Chinese characters. NO English words. NO letters of any alphabet. NO digits. NO punctuation.
- The image must be 100% COMPLETELY TEXT-FREE. Pure visual rendering only — no typography of any kind.
- FORBIDDEN: labels, annotations, chemical notation overlaid on the image, element name tags, molecular name tags, subscripts, superscripts.

[MOLECULAR GEOMETRY — MANDATORY SCIENTIFIC ACCURACY]
- Every rendered molecule MUST have the exact correct number of atoms, correct bond type, and correct geometry:
  * Diatomic hydrogen: exactly 2 white spheres, linear, single bond
  * Diatomic nitrogen: exactly 2 blue spheres (CPK: #3050F8), linear, triple bond
  * Diatomic oxygen: exactly 2 red spheres, linear, double bond
  * Water: exactly 1 red oxygen sphere + 2 white hydrogen spheres, bent geometry (~104.5°)
  * Carbon monoxide: exactly 1 gray carbon sphere + 1 red oxygen sphere, linear, triple bond
  * Carbon dioxide: exactly 1 gray carbon sphere + 2 red oxygen spheres, linear (180°), two double bonds
  * Ammonia: exactly 1 blue nitrogen sphere + 3 white hydrogen spheres, trigonal pyramidal (~107°)
  * Methane: exactly 1 gray carbon sphere + 4 white hydrogen spheres, tetrahedral (~109.5°)
  * Nitric oxide: exactly 1 blue nitrogen sphere + 1 red oxygen sphere, linear
  * Nitrogen dioxide: exactly 1 blue nitrogen sphere + 2 red oxygen spheres, bent (~134°)
  * Nitrous oxide: exactly 2 blue nitrogen spheres + 1 red oxygen sphere, linear
  * Sulfur dioxide: exactly 1 yellow sulfur sphere + 2 red oxygen spheres, bent (~119°)
  * Acetylene: exactly 2 gray carbon spheres + 2 white hydrogen spheres, linear, carbon-carbon triple bond
  * Ethylene: exactly 2 gray carbon spheres + 4 white hydrogen spheres, planar, carbon-carbon double bond
  * Ethane: exactly 2 gray carbon spheres + 6 white hydrogen spheres, staggered conformation
- DO NOT add extra atoms. DO NOT remove atoms. DO NOT distort geometry. DO NOT label atoms with text.
- Atoms must be rendered as smooth colored spheres following CPK color mapping ONLY — no text labels on atoms.

[CPK COLOR MAPPING — MANDATORY]
- H: pure white (#FFFFFF)
- C: dark gray (#909090)
- N: blue (#3050F8)
- O: red (#FF0D0D)
- S: yellow (#FFFF30)
- Fe: rust orange (#E06633)
- Ni: green (#50D050)
- Cu: copper (#C88033)
- Ru: silver-blue metallic
- Pt: light gray (#D0D0E0)
- Au: gold (#FFD123)
- All unlisted elements: use standard CPK convention

[COMPOSITION — MANDATORY]
- NO watermark box. NO white rectangle in corner. NO reserved zones.
- Full bleed image — use the entire canvas for the scientific visualization.
- Keep a clean outer safety margin (minimum 2% on each side) for print trimming only.
- NO arrows. NO diagrams. NO chart overlays. NO text of any kind.

[QUALITY]
- Render at maximum quality: photorealistic, physically-based rendering quality.
- Sharp focus on molecular structures. Ultra-high detail on atom surfaces and bond geometry.
- Cinematic scientific visualization quality comparable to C4D/Octane/UE5 Lumen renders.
`.trim();

// ─── CPK Color System ─────────────────────────────────────────────────────────

export const CPK_COLORS: Record<string, string> = {
  H: '#FFFFFF',   // White
  C: '#909090',   // Dark gray
  N: '#3050F8',   // Blue
  O: '#FF0D0D',   // Red
  F: '#90E050',   // Light green
  P: '#FF8000',   // Orange
  S: '#FFFF30',   // Yellow
  Cl: '#1FF01F',  // Green
  Br: '#A62929',  // Dark red
  I: '#940094',   // Purple
  Fe: '#E06633',  // Rust orange
  Cu: '#C88033',  // Copper
  Ni: '#50D050',  // Green
  Co: '#F090A0',  // Pink
  Mn: '#9C7AC7',  // Purple-ish
  Zn: '#7D80B0',  // Blue-gray
  Mo: '#54B5B5',  // Teal
  Pt: '#D0D0E0',  // Light gray
  Au: '#FFD123',  // Gold
  Ag: '#C0C0C0',  // Silver
  Ti: '#BFC2C7',  // Light gray
  Ce: '#FFFFC7',  // Light yellow
  Li: '#CC80FF',  // Light purple
  Na: '#AB5CF2',  // Purple
  K: '#8F40D4',   // Dark purple
  Ca: '#3DFF00',  // Green
  Al: '#BFA6A6',  // Pinkish gray
  Si: '#F0C8A0',  // Peach
};

// ─── Journal Presets ──────────────────────────────────────────────────────────

export interface JournalConfig {
  name: JournalPreset;
  displayName: string;
  aspectRatio: AspectRatio;
  widthPx: number;
  heightPx: number;
  watermarkPosition: 'bottom-right' | 'bottom-left' | 'bottom-center';
  titlePosition: 'top' | 'bottom' | 'none';
  style: string;
  description: string;
  color: string;
}

export const JOURNAL_PRESETS: Record<JournalPreset, JournalConfig> = {
  'Nature': {
    name: 'Nature',
    displayName: 'Nature',
    aspectRatio: '3:4',
    widthPx: 4800,
    heightPx: 6400,
    watermarkPosition: 'bottom-right',
    titlePosition: 'top',
    style: 'dramatic, high-contrast, scientifically symbolic, magazine-quality editorial',
    description: 'Square-ish portrait, bold visual impact, top-left title zone',
    color: '#E8440A',
  },
  'Nature Catalysis': {
    name: 'Nature Catalysis',
    displayName: 'Nature Catalysis',
    aspectRatio: '3:4',
    widthPx: 4800,
    heightPx: 6400,
    watermarkPosition: 'bottom-right',
    titlePosition: 'top',
    style: 'mechanism-focused, reaction pathway visible, catalyst highlighted, clean scientific',
    description: 'Catalysis mechanism emphasis, reaction arrows or energy path implied',
    color: '#0E76BD',
  },
  'Nature Materials': {
    name: 'Nature Materials',
    displayName: 'Nature Materials',
    aspectRatio: '3:4',
    widthPx: 4800,
    heightPx: 6400,
    watermarkPosition: 'bottom-right',
    titlePosition: 'top',
    style: 'materials texture emphasis, crystal lattice, surface structure, SEM/TEM aesthetic blend',
    description: 'Material science focus, texture and structure prominent',
    color: '#7B68EE',
  },
  'JACS': {
    name: 'JACS',
    displayName: 'JACS',
    aspectRatio: '1:1',
    widthPx: 4800,
    heightPx: 4800,
    watermarkPosition: 'bottom-right',
    titlePosition: 'none',
    style: 'clean molecular visualization, American Chemical Society style, precise chemistry',
    description: 'Square format, precise molecular focus, ACS blue/white palette',
    color: '#0076B6',
  },
  'Angewandte Chemie': {
    name: 'Angewandte Chemie',
    displayName: 'Angew. Chemie',
    aspectRatio: '3:4',
    widthPx: 4500,
    heightPx: 6000,
    watermarkPosition: 'bottom-right',
    titlePosition: 'top',
    style: 'elegant European chemistry style, mechanism clarity, Wiley-VCH aesthetic',
    description: 'Classic chemistry elegance, mechanism emphasis',
    color: '#CC0000',
  },
  'ACS Catalysis': {
    name: 'ACS Catalysis',
    displayName: 'ACS Catalysis',
    aspectRatio: '3:4',
    widthPx: 4800,
    heightPx: 6400,
    watermarkPosition: 'bottom-right',
    titlePosition: 'none',
    style: 'catalytic cycle visualization, active site emphasis, energy diagram aesthetic, ACS colors',
    description: 'Catalysis cycle, active site, and product selectivity',
    color: '#FF6B00',
  },
  'Advanced Materials': {
    name: 'Advanced Materials',
    displayName: 'Advanced Materials',
    aspectRatio: '3:4',
    widthPx: 4800,
    heightPx: 6400,
    watermarkPosition: 'bottom-right',
    titlePosition: 'top',
    style: 'futuristic materials science, device cross-section, nanoscale engineering, Wiley advanced',
    description: 'Futuristic nano/materials, device cutaway, engineering precision',
    color: '#8B008B',
  },
  'Custom': {
    name: 'Custom',
    displayName: 'Custom',
    aspectRatio: 'Custom',
    widthPx: 4800,
    heightPx: 6400,
    watermarkPosition: 'bottom-right',
    titlePosition: 'none',
    style: 'user-defined',
    description: 'Custom output parameters',
    color: '#374151',
  },
};

// ─── Style Mood Labels ────────────────────────────────────────────────────────

export const STYLE_MOOD_CONFIG = [
  {
    key: 'cinematic' as const,
    label: 'Cinematic',
    description: 'Movie-like depth of field, volumetric fog, dramatic lighting',
    icon: '🎬',
  },
  {
    key: 'macro' as const,
    label: 'Macro',
    description: 'Extreme close-up, surface detail, scientific precision photography',
    icon: '🔬',
  },
  {
    key: 'abstract' as const,
    label: 'Abstract',
    description: 'Conceptual visualization, energy fields, symbolic representation',
    icon: '✦',
  },
  {
    key: 'realistic' as const,
    label: 'Realistic',
    description: 'Photorealistic rendering, true material properties, accurate color',
    icon: '📷',
  },
  {
    key: 'glass' as const,
    label: 'Glass',
    description: 'Transparent materials, refraction, crystal-like purity',
    icon: '💎',
  },
  {
    key: 'metallic' as const,
    label: 'Metallic',
    description: 'Reflective metal surfaces, industrial precision, structural clarity',
    icon: '⚙️',
  },
];

// ─── Aspect Ratio Configs ─────────────────────────────────────────────────────

export const ASPECT_RATIO_CONFIGS: Record<AspectRatio, { label: string; width: number; height: number }> = {
  '1:1':    { label: '1:1  Square', width: 4800, height: 4800 },
  '3:4':    { label: '3:4  Portrait', width: 4800, height: 6400 },
  '4:3':    { label: '4:3  Landscape', width: 6400, height: 4800 },
  '2:3':    { label: '2:3  Tall', width: 4000, height: 6000 },
  '3:2':    { label: '3:2  Wide', width: 6000, height: 4000 },
  'Custom': { label: 'Custom', width: 4800, height: 6400 },
};

// ─── Prompt Skeleton Slots ────────────────────────────────────────────────────

export const PROMPT_SKELETON_LABELS = [
  { key: 'mainTheme', label: '1. Main Theme', placeholder: 'Journal cover theme, scientific significance, visual metaphor' },
  { key: 'focusArea', label: '2. Focus Area', placeholder: 'Focal object, lens scale, macro/micro/extreme-macro' },
  { key: 'coreScientificStructure', label: '3. Core Scientific Structure', placeholder: 'Core entity, substrate, active site, lattice/material environment' },
  { key: 'specificEvent', label: '4. Specific Event / Mechanism', placeholder: 'Reaction, transformation, energy, electron transfer, catalytic event' },
  { key: 'spatialDepthLayers', label: '5. Spatial Depth Layers', placeholder: 'Foreground / mid-ground / background molecular layers' },
  { key: 'mandatoryChemicalSpecies', label: '6. Mandatory Chemical Species', placeholder: 'All core molecules in EN formula with color and bond constraints' },
  { key: 'scientificAccuracyConstraints', label: '7. Scientific Accuracy Constraints', placeholder: 'Bonds, colors, formulas, geometry, scale — non-negotiable objects' },
  { key: 'reducedClutter', label: '8. Reduced Clutter', placeholder: 'Forbidden elements, clean composition rules' },
  { key: 'textureAndLighting', label: '9. Texture & Lighting', placeholder: 'Material, lighting, volumetric fog, Tyndall effect, reflection' },
  { key: 'style', label: '10. Style', placeholder: 'C4D / UE5 / Octane / macro photography / cinematic' },
  { key: 'compositionConstraints', label: '11. Composition Constraints', placeholder: 'Subject position, negative space, safety margin, watermark zone' },
  { key: 'outputConstraints', label: '12. Output Constraints', placeholder: 'Width, height, aspect ratio, ultra-HD, publication-grade output' },
];
