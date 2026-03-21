export const MODELING_PROVIDER_OPTIONS = [
  'materials_project',
  'atomly',
  'csd',
  'icsd',
  'optimade',
  'fallback',
] as const;

export type ModelingProviderName = typeof MODELING_PROVIDER_OPTIONS[number];

export type TaskType = 
  | 'molecule' 
  | 'crystal' 
  | 'slab' 
  | 'surface_adsorption' 
  | 'interface' 
  | 'defect' 
  | 'doping';

export interface SubstrateConfig {
  material: string;
  surface?: string;
  layers?: number;
  supercell?: [number, number, number];
  vacuum?: number;
}

export interface AdsorbateConfig {
  formula: string;
  initial_site?: string;
  count?: number;
}

export interface ModelingAdsorbatePlacement {
  formula: string;
  initialSite?: string;
  count?: number;
  placedCount?: number;
}

export interface ModelingDopingSummary {
  hostElement: string;
  dopantElement: string;
  requestedCount?: number;
  replacedCount?: number;
  availableHostCount?: number;
  surfacePreferred?: boolean;
}

export interface ModelingDefectSummary {
  type: 'vacancy';
  element: string;
  requestedCount?: number;
  removedCount?: number;
  availableElementCount?: number;
  surfacePreferred?: boolean;
}

export interface ConstraintsConfig {
  fix_bottom_layers?: number;
  fix_atoms?: number[];
}

export interface ModelingIntent {
  task_type: TaskType;
  provider_preferences?: ModelingProviderName[];
  substrate?: SubstrateConfig;
  molecule?: {
    name_or_smiles: string;
    generate_3d?: boolean;
  };
  cluster?: {
    formula: string;
    placement: 'on_surface' | 'in_vacuum' | 'embedded';
  };
  adsorbates?: AdsorbateConfig[];
  constraints?: ConstraintsConfig;
  doping?: {
    host_element: string;
    dopant_element: string;
    concentration?: number;
    count?: number;
  };
  defect?: {
    type: 'vacancy';
    element: string;
    count?: number;
  };
}

export interface ModelingProviderStatus {
  provider: ModelingProviderName;
  label: string;
  configured: boolean;
  mode: string;
}

export interface ModelingEngineHealth {
  pythonExecutable: string | null;
  pythonVersion: string | null;
  numpyVersion: string | null;
  pymatgenVersion: string | null;
  ccdcAvailable: boolean;
  healthy: boolean;
  issues: string[];
}

export interface ModelingDiagnosticsSummary {
  configuredProviderCount: number;
  healthy: boolean;
  issues: number;
}

export interface ModelingDiagnosticsPayload {
  success?: boolean;
  providers: ModelingProviderStatus[];
  engineHealth: ModelingEngineHealth;
  summary: ModelingDiagnosticsSummary;
  defaultOrder: ModelingProviderName[];
}

export interface ModelingBuildMeta {
  formula?: string | null;
  system?: string | null;
  hkl?: Array<number | string> | null;
  databaseSource?: string | null;
  databaseSourceLabel?: string | null;
  providersTried?: string[];
  providerPreferences?: string[];
  totalAtoms?: number;
  sessionId?: string | null;
  planArtifactId?: string | null;
  taskRunId?: string | null;
  structureArtifactId?: string | null;
  runtimeBacked?: boolean;
  adsorbates?: ModelingAdsorbatePlacement[];
  adsorbateCount?: number;
  doping?: ModelingDopingSummary | null;
  defect?: ModelingDefectSummary | null;
}

export interface ModelingRuntimeSessionSummary {
  sessionId: string;
  status: string;
  activePlanArtifactId?: string | null;
  primaryGoalArtifactId?: string | null;
  artifactCount?: number;
  taskRunCount?: number;
  jobRunCount?: number;
  approvalCount?: number;
  eventCount?: number;
  createdAt?: string | null;
  lastActivityAt?: string | null;
}

export interface ModelingState {
  currentIntent: ModelingIntent | null;
  history: {
    prompt: string;
    intent: ModelingIntent;
    timestamp: number;
  }[];
  isProcessing: boolean;
}
