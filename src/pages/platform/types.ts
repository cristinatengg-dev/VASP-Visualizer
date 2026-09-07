export type Role = "owner" | "researcher" | "finance";
export type Status =
  | "pending"
  | "running"
  | "completed"
  | "paused"
  | "waiting"
  | "blocked"
  | "draft"
  | "approved"
  | "accepted"
  | "excluded"
  | "paid"
  | "cancelled"
  | "unconfigured"
  | "failed"
  | "interrupted";
export interface ResearchProject {
  id: string;
  name: string;
  mode: "private" | "contribute";
  createdAt: string;
  workflow?: {
    demo: boolean;
    goal: string;
    round: number;
    completed: number;
    tasks: number;
  } | null;
}
export interface ResearchTask {
  id: string;
  name: string;
  method: string;
  phase: string;
  dependencies: string[];
  status: Status;
  note: string;
  blockedReason?: string;
  contract?: {
    version: number;
    execution: "manual" | "curve-csv";
    inputs: string;
    outputs: string;
    methodVersion: string;
    resource: string;
    assignee: string;
    dueAt: string;
    estimatedCost: number;
    acceptance: string;
    candidateId?: string;
  };
  runs?: {
    id: string;
    status: Status;
    at: string;
    artifact?: {
      name: string;
      content: string;
      encoding: string;
      sha256: string;
    };
    output?: Record<string, unknown>;
    error?: string;
  }[];
  updatedAt?: string;
}
export interface Candidate {
  version?: number;
  history?: Candidate[];
  validation?: { valid: boolean; executable: boolean; note: string };
  id: string;
  composition: string;
  basis: string;
  process: string;
  strength: string;
  elongation: string;
  selected: boolean;
}
export interface Sample {
  version?: number;
  candidateVersion?: number;
  round?: number;
  history?: Sample[];
  id: string;
  candidate: string;
  batch: string;
  process: string;
  status: string;
  note: string;
}
export interface Observation {
  round?: number;
  quality?: "pending" | "accepted" | "excluded";
  targetRevision?: number;
  measurement?: {
    temperature: number | null;
    standard: string;
    environment: string;
    strengthDefinition: string;
    strainRate: number | null;
    dimensions: string;
    specimenId: string;
  };
  metrics?: { name: string; unit: string; value: number }[];
  artifact?: {
    name: string;
    content: string;
    encoding: string;
    sha256: string;
  };
  id?: string;
  sampleId?: string;
  strength: number;
  strengthError: number | null;
  elongation: number;
  elongationError: number | null;
  conditions: string;
  raw: string;
  source?: string;
  recordedAt?: string;
}
export interface EvidenceLink {
  documentId: string;
  evidenceId: string;
  title: string;
  quote: string;
  page: number;
  kind: string;
  contentHash: string;
  demo: boolean;
}
export interface NextPlan {
  hypothesis?: string;
  estimatedCost?: number | null;
  stopCondition?: string;
  memoryReferences?: MemoryReference[];
  id: string;
  basedOnRevision: number;
  status: "draft" | "approved";
  sampleCount: number;
  generatedAt: string;
  method: string;
  reason: string;
  items: string[];
}
export interface ResearchWorkflow {
  projectId: string;
  demo: boolean;
  goal: string;
  family: string;
  targetStrength: number | null;
  targetElongation: number | null;
  sampleBudget: number | null;
  testTemperature?: number | null;
  repeats?: number | null;
  durationWeeks?: number | null;
  standard?: string;
  strengthDefinition?: string;
  environment?: string;
  requirementIssues?: string[];
  assessment?: { status: string; label: string; reasons: string[] };
  nextRoundReadiness?: { ready: boolean; reason: string; action: "plan" | "experiments" | "review" | "results" };
  datasets?: {
    round?: number;
    key: string;
    candidate: string;
    batch: string;
    process: string;
    temperature: number;
    n: number;
    strength: { mean: number; sd: number | null };
    elongation: { mean: number; sd: number | null };
    label: string;
  }[];
  goalHistory?: {
    revision: number;
    goal: string;
    testTemperature?: number;
    standard?: string;
  }[];
  roundHistory?: {
    round: number;
    revision: number;
    result: Observation;
    nextPlan: NextPlan;
    at: string;
  }[];
  extraMethods?: string[];
  round: number;
  planState: "draft" | "approved";
  revision: number;
  goalRevision?: number;
  quality: "pending" | "accepted" | "excluded";
  tasks: ResearchTask[];
  messages: {
    id: string;
    role: "user" | "assistant";
    text: string;
    at: string;
    method?: string;
    answerMode?: "recall" | "acknowledge" | "facts" | "draft" | "model";
    modelName?: string;
    actualModel?: string;
    tokens?: InferenceTokens;
    finishReason?: string;
    contextStale?: boolean;
    responseStatus?: "running" | "completed" | "failed" | "cancelled" | "truncated";
    citationReview?: { version: number; verifiedQuotes: number; removed: number };
    processTrail?: ProcessStep[];
    durationMs?: number;
    reasoningSummary?: string;
    error?: string;
    actionDraft?: { goal: string; projectId?: string };
    memoryReferences?: MemoryReference[];
  }[];
  links: EvidenceLink[];
  observations: Observation[];
  nextPlan: NextPlan | null;
  candidates: Candidate[];
  samples: Sample[];
  result: Observation | null;
  review?: { at: string; by: string; note: string; decision: string };
  createdAt: string;
  updatedAt: string;
}
export interface ProjectData {
  project: ResearchProject;
  workflow: ResearchWorkflow | null;
  documents: {
    id: string;
    title: string;
    kind: string;
    reviewed: number;
    rag: boolean;
    demo: boolean;
  }[];
  events: PlatformEvent[];
}
export interface Model {
  id: string;
  name: string;
  provider: string;
  purpose: string;
  input: number;
  cached: number;
  output: number;
  external: boolean;
  connected: boolean;
  gateway?: string;
  fingerprint?: string;
  pricingConfigured?: boolean;
}
export interface Resource {
  id: string;
  name: string;
  kind: "simulation" | "equipment";
  method: string;
  state: Status;
  channel: string;
  note: string;
  updatedAt?: string;
}
export interface Settings {
  spaceName: string;
  monthCap: number;
  taskCap: number;
  lowBalance: number;
}
export interface Tokens {
  input: number;
  cached: number;
  output: number;
}
export interface Usage {
  id: string;
  requestId: string;
  projectId: string;
  model: Model;
  hold: number;
  cost: number;
  status: Status;
  tokens: Tokens;
  at: string;
  testOnly: boolean;
  finishedAt?: string;
}
export interface Ledger {
  id: string;
  kind: "recharge" | "usage";
  amount: number;
  at: string;
  orderId?: string;
  runId?: string;
  projectId?: string;
  model?: string;
  tokens?: Tokens;
  note: string;
}
export interface Order {
  id: string;
  requestId: string;
  amount: number;
  status: Status;
  createdAt: string;
  paidAt?: string;
  testOnly: boolean;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  projectIds: string[];
  status: "active" | "draft";
  budget: number;
  createdAt?: string;
}
export interface PlatformEvent {
  id: string;
  at: string;
  action: string;
  projectId?: string;
}
export interface InferenceTokens {
  input: number | null;
  cached: number | null;
  output: number | null;
  total: number | null;
}
export interface InferenceUsage {
  id: string;
  projectId: string | null;
  modelName: string;
  actualModel?: string;
  gateway: string;
  status: Status;
  at: string;
  finishedAt?: string;
  tokens: InferenceTokens | null;
  error?: string;
}
export interface PlatformOverview {
  inferenceUsage?: InferenceUsage[];
  defaults: { mode: "private" | "contribute"; model: string };
  account: string;
  role: Role;
  environment: "development" | "production";
  capabilities?: { sandbox: boolean; payments: boolean; teamInvites: boolean };
  settings: Settings;
  projects: ResearchProject[];
  models: Model[];
  projectModels: Record<string, string>;
  externalConsent: Record<
    string,
    { at: string; by: string; scope: string; fingerprint?: string }
  >;
  wallet: {
    balance: number;
    reserved: number;
    available: number;
    monthSpent: number;
  } | null;
  orders: Order[];
  ledger: Ledger[];
  usage: Usage[];
  resources: Resource[];
  members: Member[];
  events: PlatformEvent[];
}

export interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  kind: string;
  scope: "customer" | "project" | "shared";
  projectId: string | null;
  projectName?: string;
  automatic?: boolean;
  editable: boolean;
  enabled: boolean;
  pinned: boolean;
  version: number | string;
  source: string;
  updatedAt: string | null;
  createdAt?: string;
  demo?: boolean;
  verified?: boolean;
  grantId?: string;
  truncated?: boolean;
}
export interface MemoryReference extends Partial<MemoryRecord> {
  id: string;
  number: number;
  available: boolean;
  title: string;
  content: string;
  scope: "customer" | "project" | "shared";
  projectId: string | null;
}
export interface MemoryHistory {
  id: string;
  kind: string;
  label: string;
  at: string;
  actor: string;
  version: number;
  baseline: boolean;
  snapshot?: unknown;
  previous?: unknown;
  warning?: string;
}
export interface MemoryView {
  scope: "customer" | "project";
  projectId: string | null;
  projectName?: string;
  mode?: string;
  revision: number;
  settings: {
    enabled: boolean;
    inheritCustomer: boolean;
    accountWide?: boolean;
    shareWithAccount?: boolean;
  };
  items: MemoryRecord[];
  inherited: MemoryRecord[];
  grants: {
    id: string;
    projectId: string;
    itemId: string;
    projectName: string;
    at: string;
  }[];
  history: MemoryHistory[];
  historyCount: number;
  writeAllowed: boolean;
  baselineAt: string;
  modelConnected: boolean;
  projects?: { id: string; name: string; included: boolean }[];
}
export interface MemorySearch {
  query: string;
  enabled: boolean;
  records: MemoryRecord[];
  method: string;
  modelConnected: boolean;
  at: string;
}

export interface ProcessStep {
  code: string;
  label: string;
  at: string;
  elapsedMs: number;
}
export type ResearchMessage = ResearchWorkflow["messages"][number];
export type ReplyEvent =
  | {
      type: "started";
      user: ResearchMessage;
      assistant: ResearchMessage;
      threadId?: string;
    }
  | { type: "progress"; event: ProcessStep }
  | { type: "delta" | "summary"; text: string }
  | { type: "done"; messages: ResearchMessage[] }
  | {
      type: "error";
      error: string;
      status: number;
      messages?: ResearchMessage[];
    };
