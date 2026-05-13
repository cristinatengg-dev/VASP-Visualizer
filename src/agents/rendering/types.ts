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

// ─── Data Figure Mode ──────────────────────────────────────────────────────────

export type RenderKind = 'illustration' | 'figure';

export type FigureChartType =
  | 'grouped_bar'
  | 'line'
  | 'scatter'
  | 'heatmap'
  | 'multi_panel';

export type FigureColumnType = 'numeric' | 'categorical' | 'date';

export interface FigureColumnProfile {
  name: string;
  type: FigureColumnType;
  missingCount: number;
  uniqueCount: number;
  summary: Record<string, string | number | boolean | null | string[]>;
}

export interface FigureAxisRecommendation {
  x?: string | null;
  y?: string | null;
  group?: string | null;
  value?: string | null;
}

export interface FigureDataProfile {
  rowCount: number;
  columns: FigureColumnProfile[];
  numericColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  previewRows: Array<Record<string, string>>;
  recommendedMappings: Record<string, FigureAxisRecommendation>;
}

export interface FigureBriefInput {
  narrative: string;
  captionDraft: string;
  targetJournal: JournalPreset;
  multiPanel: boolean;
}

export interface FigureColumnHints {
  x: string;
  y: string;
  group: string;
  secondary: string;
}

export type FigureErrorMode = 'none' | 'std' | 'sem' | 'ci95';

export interface FigureStatisticalRules {
  errorMode: FigureErrorMode;
  showSignificance: boolean;
  logScale: boolean;
  showIndividualPoints: boolean;
}

export interface FigureExportOptions {
  targetJournal: JournalPreset;
  widthPx: number;
  heightPx: number;
  formats: Array<'svg' | 'png' | 'script' | 'json'>;
  layout: 'landscape' | 'square' | '2x2';
  palette: string;
}

export interface FigurePanelContract {
  id: string;
  title: string;
  chart_type: Exclude<FigureChartType, 'multi_panel'>;
  x_column: string | null;
  y_column: string | null;
  series_column: string | null;
  secondary_column: string | null;
  aggregator: 'mean' | 'median' | 'none' | string;
  show_points: boolean;
}

export interface FigureContract {
  version: string;
  render_kind: 'figure';
  core_claim: string;
  figure_title: string;
  chart_archetype: FigureChartType;
  panel_map: FigurePanelContract[];
  columns_used: string[];
  grouping: {
    x: string | null;
    y: string | null;
    series: string | null;
    secondary: string | null;
  };
  stats_needed: {
    error_mode: FigureErrorMode;
    significance: boolean;
    log_scale: boolean;
    show_points: boolean;
  };
  palette_policy: {
    journal: string;
    palette: string;
    background: string;
    grid: string;
  };
  export_bundle: {
    journal: string;
    width_px: number;
    height_px: number;
    formats: string[];
    layout: string;
  };
  risks: string[];
}

export interface FigureQaCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface FigureQaReport {
  notes?: string[];
  renderWarnings?: string[];
  validation?: {
    ok: boolean;
    checks: FigureQaCheck[];
    warnings: string[];
  };
}

export interface FigureRenderResult {
  figureScript: string;
  figureSpec: FigureContract;
  svgDataUrl: string;
  pngDataUrl: string;
  qaReport: FigureQaReport;
}
