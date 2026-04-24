import type { LucideIcon } from 'lucide-react';

export type ExplorerTier = 'open' | 'controlled' | 'commercial';

export type ExplorerAccess =
  | 'Open API'
  | 'Open download'
  | 'Public account'
  | 'Portal / registration'
  | 'Member / NDA'
  | 'Commercial license';

export type ExplorerIntegrationStage =
  | 'connected'
  | 'ready'
  | 'metadata-first'
  | 'apply-first'
  | 'license-first';

export interface ExplorerDatabaseRecord {
  id: string;
  name: string;
  shortName: string;
  category: string;
  tier: ExplorerTier;
  access: ExplorerAccess;
  integrationStage: ExplorerIntegrationStage;
  officialUrl: string;
  scope: string;
  summary: string;
  statusNote: string;
  projectFit: string;
}

export interface ExplorerQuickFormula {
  formula: string;
  label: string;
}

export interface ExplorerCategoryMeta {
  icon: LucideIcon;
  chip: string;
}

export interface RegistryExplorerConfig {
  id: string;
  title: string;
  badge: string;
  heroHeadline: string;
  heroDescription: string;
  immediateWaveText: string;
  closedPathText: string;
  searchDescription: string;
  searchPlaceholder: string;
  popularFormulas: ExplorerQuickFormula[];
  nextWave: string[];
  openBucketText: string;
  controlledBucketText: string;
  commercialBucketText: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
  ctaFormula: string;
  modelingPromptPrefix: string;
  categoryOrder: string[];
  categoryMeta: Record<string, ExplorerCategoryMeta>;
  databases: ExplorerDatabaseRecord[];
}

export interface MaterialsExplorerCard {
  id: string;
  title: string;
  description: string;
  route: string;
  icon: LucideIcon;
  iconGradient: string;
  hoverText: string;
}
