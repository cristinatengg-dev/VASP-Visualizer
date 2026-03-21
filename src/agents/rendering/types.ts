/**
 * types.ts — Rendering Agent (Scientific Cover Agent) Type Definitions
 *
 * Scientific Cover Agent = Parser + Rule Engine + Prompt Compiler
 *                        + Multi-Model Render Pipeline + Export Engine
 */

// ─── Input Types ─────────────────────────────────────────────────────────────

export type DomainType =
  | 'Chemistry'
  | 'Materials'
  | 'Biology'
  | 'Physics'
  | 'Interdisciplinary';

export type JournalPreset =
  | 'Nature'
  | 'Nature Catalysis'
  | 'Nature Materials'
  | 'JACS'
  | 'Angewandte Chemie'
  | 'ACS Catalysis'
  | 'Advanced Materials'
  | 'Custom';

export type AspectRatio = '1:1' | '3:4' | '4:3' | '2:3' | '3:2' | 'Custom';

export type StyleMood =
  | 'cinematic'
  | 'macro'
  | 'abstract'
  | 'realistic'
  | 'glass'
  | 'metallic';

export interface StylePreferences {
  cinematic: number;   // 0-100
  macro: number;       // 0-100
  abstract: number;    // 0-100
  realistic: number;   // 0-100
  glass: number;       // 0-100
  metallic: number;    // 0-100
}

export interface AdvancedSwitches {
  strictChemicalStructure: boolean;
  prioritizeAccuracy: boolean;
  prioritizeArt: boolean;
  useReferenceConstraint: boolean;
  publishExportMode: boolean;
}

export interface OutputParams {
  aspectRatio: AspectRatio;
  customWidth: number;
  customHeight: number;
  journal: JournalPreset;
  ultraHD: boolean;
  watermarkReserve: boolean;
}

// ─── Scientific Entity Schema ─────────────────────────────────────────────────

export interface ChemicalSpecies {
  name_cn: string;
  formula_en: string;
  atoms: string[];
  bond_topology: string;
  color_rule: Record<string, string>;
  geometry_hint: string;
  role: 'reactant' | 'intermediate' | 'product' | 'catalyst' | 'substrate' | 'environment';
  priority: 'high' | 'medium' | 'low';
}

export interface ScientificEntity {
  // Core fields (cross-domain)
  entity_type: 'molecule' | 'crystal' | 'protein' | 'cell_organelle' | 'device' | 'field' | 'particle';
  name: string;
  role: string;
  priority: 'high' | 'medium' | 'low';
  // Chemistry specific
  chemical?: ChemicalSpecies;
  // Visual constraints
  visual_color: string;
  visual_size: 'atomic' | 'nano' | 'molecular' | 'device' | 'cellular' | 'macro';
}

export interface ParsedScience {
  domain: DomainType;
  subdomain: string;
  core_theme: string;
  central_object: string;
  support_or_substrate: string;
  active_site: string;
  reactants: ChemicalSpecies[];
  intermediates: ChemicalSpecies[];
  products: ChemicalSpecies[];
  environment: string;
  scale_level: string;
  key_mechanism: string;
  visual_keywords: string[];
  journal_style: string;
  must_show_elements: string[];
  forbidden_elements: string[];
  scientific_entities: ScientificEntity[];
}

// ─── Visual Plan Card Types ────────────────────────────────────────────────────

export type PlanCardType = 'structural-realism' | 'mechanism-metaphor' | 'macro-narrative';

export interface PlanCard {
  id: string;
  type: PlanCardType;
  name: string;
  tagline: string;          // One-line theme
  visualMetaphor: string;
  primaryColors: string[];  // hex codes
  background: string;
  focalObject: string;
  compositionType: string;  // e.g. "center-weighted", "rule-of-thirds", "diagonal"
  scaleLevel: string;       // e.g. "atomic", "nanoscale", "molecular", "device"
  riskWarning: string;
  suitableForRefImage: boolean;
  recommendedModel: string;
  previewGradient: string;  // CSS gradient for preview card
}

// ─── Prompt Compilation ───────────────────────────────────────────────────────

export interface CompiledPrompt {
  version: string;
  selectedPlan: PlanCardType;
  // 12 Slots
  mainTheme: string;
  focusArea: string;
  coreScientificStructure: string;
  specificEvent: string;
  spatialDepthLayers: string;
  mandatoryChemicalSpecies: string;
  scientificAccuracyConstraints: string;
  reducedClutter: string;
  textureAndLighting: string;
  style: string;
  compositionConstraints: string;
  outputConstraints: string;
  // Auto-appended hard rules
  hardConstraints: string;
  // Final assembled prompt
  fullPrompt: string;
}

// ─── Generation Session ───────────────────────────────────────────────────────

export type GenerationMode = 'draft' | 'standard' | 'publication';
export type WorkflowStep =
  | 'input'
  | 'parsing'
  | 'plan-selection'
  | 'prompt-review'
  | 'base-generation'
  | 'refinement'
  | 'export';

export interface CoverProject {
  id: string;
  createdAt: string;
  // Inputs
  abstractText: string;
  pdfFile: File | null;
  referenceImages: File[];
  structureBaseImage: File | null;
  additionalInstructions: string;
  stylePreferences: StylePreferences;
  advancedSwitches: AdvancedSwitches;
  outputParams: OutputParams;
  // Parsed result
  parsedScience: ParsedScience | null;
  // Plan selection
  generatedPlans: PlanCard[];
  selectedPlanId: string | null;
  // Compiled prompt
  compiledPrompt: CompiledPrompt | null;
  // Generation results (Phase 5+)
  baseImages: string[];      // URLs/base64 from Nano Banana 2
  selectedBaseImageIndex: number;
  finalImages: string[];     // URLs from Douban/Seedream
  exportedFiles: string[];   // TIFF/JPEG URLs
  // Session tracking
  currentStep: WorkflowStep;
  generationMode: GenerationMode;
}
