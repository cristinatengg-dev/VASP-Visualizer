export interface Project {
  id: string;
  name: string;
  mode: "private" | "contribute";
  createdAt: string;
}
export interface Source {
  id: string;
  name: string;
  kind: string;
  state: string;
  description: string;
  action?: string;
  url: string;
}
export interface Evidence {
  id: string;
  kind: string;
  page: number;
  quote: string;
  material: string;
  composition: string;
  basis: string;
  process: string;
  property: string;
  value: string;
  unit: string;
  conditions: string;
  reviewed: boolean;
}
export interface DocumentRecord {
  documentType?: string;
  sourceRelations?: { relation: string; identifier: string }[];
  screening?: string;
  id: string;
  kind: "paper" | "patent";
  title: string;
  doi?: string;
  publicationNumber?: string;
  familyId?: string;
  year?: number;
  authors: string[];
  url: string;
  source: string;
  abstract?: string;
  demo?: boolean;
  pageCount: number;
  evidenceCount: number;
  reviewedCount: number;
  pages?: { page: number; text: string }[];
  evidence?: Evidence[];
  licenses: { url?: string; label?: string; scope: string }[];
  fulltextLocations: { url: string; license: string; version: string }[];
  versions: {
    hash: string;
    source: string;
    rawHash: string;
    sourceId: string;
    at: string;
  }[];
  rights: { rag: boolean; training: boolean; basis: string };
  training: { allowed: boolean; reason: string };
}
export interface Job {
  filtered?: number;
  filters?: {
    documentType?: string;
    yearFrom?: string;
    yearTo?: string;
    requiredTerms?: string;
  };
  id: string;
  source: string;
  query: string;
  status: string;
  added: number;
  updated: number;
  unchanged: number;
  rejected: number;
  received: number;
  total?: number;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  errors: { item: number; message: string }[];
  nextCursor?: string;
}
export interface ProjectData {
  suggestedQuery?: string;
  project: Project;
  documents: DocumentRecord[];
  jobs: Job[];
  audit: { id: string; at: string; action: string }[];
}
export interface Overview {
  projects: Project[];
  sources: Source[];
  environment: string;
  account: string;
}
