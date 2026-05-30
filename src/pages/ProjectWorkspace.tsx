import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cpu,
  FileJson,
  FolderKanban,
  Image as ImageIcon,
  Layers3,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useStore } from '../store/useStore';
import type { MolecularStructure } from '../types';
import { getAtomProperties } from '../utils/atomData';
import {
  renderDataToMolecularStructure,
  type RenderData,
} from '../utils/catalystHelpers';
import ChatPanel from '../agents/modeling/components/ChatPanel';
import CanvasPanel from '../agents/modeling/components/CanvasPanel';
import type {
  ModelingBuildMeta,
  ModelingIntent,
} from '../agents/modeling/types/modeling';
import { ControlPanel } from '../components/ControlPanel';
import { Scene3D } from '../components/Scene3D';

type WorkspaceStep = 'idea' | 'modeling' | 'compute' | 'analyze' | 'report';
type AnalyzeFocus = 'viewer' | 'illustration';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };

type RuntimeArtifact = {
  _id: string;
  kind: string;
  summary?: string;
  preview?: JsonObject;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  latestInLineage?: boolean;
  lifecycleStage?: string;
  status?: string;
};

type RuntimeTaskRun = {
  _id: string;
  stepId: string;
  skillId: string;
  status: string;
  createdAt?: string;
  endedAt?: string;
  currentApprovalRequestId?: string | null;
};

type RuntimeJobRun = {
  _id: string;
  status: string;
  system: string;
  externalJobId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type RuntimeApproval = {
  _id: string;
  status: string;
  reason?: string;
  createdAt?: string;
  expiresAt?: string;
  targetRef?: string;
};

type RuntimeEvent = {
  _id: string;
  type: string;
  category: string;
  createdAt?: string;
  ts?: string;
  payload?: JsonObject;
};

type RuntimePayloadInspection = {
  materialized: boolean;
  storageKind: string;
  exists: boolean;
};

type RuntimeArtifactView = {
  artifact: RuntimeArtifact;
  payloadInspection: RuntimePayloadInspection;
};

type RuntimeSessionPayload = {
  ok: boolean;
  session: {
    _id: string;
    status: string;
    ownerId?: string;
    projectId?: string;
    createdAt?: string;
    lastActivityAt?: string;
    primaryGoalArtifactId?: string | null;
    activePlanArtifactId?: string | null;
  };
  summary?: {
    artifactCount?: number;
    taskRunCount?: number;
    jobRunCount?: number;
    approvalCount?: number;
    eventCount?: number;
  };
  artifacts: RuntimeArtifact[];
  artifactViews?: RuntimeArtifactView[];
  taskRuns: RuntimeTaskRun[];
  jobRuns: RuntimeJobRun[];
  approvals: RuntimeApproval[];
  events: RuntimeEvent[];
};

type RecentSessionItem = {
  session: {
    _id: string;
    status: string;
    createdAt?: string;
    lastActivityAt?: string;
  };
  summary?: {
    artifactCount?: number;
    taskRunCount?: number;
    jobRunCount?: number;
    approvalCount?: number;
    eventCount?: number;
  };
  goalArtifact?: {
    summary?: string;
    preview?: JsonObject;
  } | null;
};

type RetrievalBlueprint = {
  structure_source?: {
    formula?: string;
    phase_or_polymorph?: string | null;
    material_id?: string | null;
  };
  handoff_prompt?: string | null;
  literature_rationale?: string | null;
};

type RetrievalIdeaCard = {
  id: string;
  title: string;
  fit_reason: string;
  material_family: string;
  target_properties: string[];
  difficulty: 'starter' | 'intermediate' | 'advanced';
  confidence: 'high' | 'medium' | 'low';
  blueprint?: RetrievalBlueprint;
};

type RetrievalResult = {
  summary: string;
  user_goal?: {
    interpreted_goal?: string;
    user_profile?: string;
    depth?: string;
  };
  idea_cards: RetrievalIdeaCard[];
  recommended_idea_id?: string;
  papers?: Array<{
    title: string;
    authors: string;
    year: string | number;
    source: string;
    url?: string | null;
  }>;
  structures?: Array<{
    formula: string;
    material_id?: string | null;
    crystal_system?: string;
    energy_above_hull?: string;
  }>;
  handoff?: {
    idea_title?: string;
    formula?: string;
    material_id?: string | null;
    handoff_prompt?: string | null;
  } | null;
};

type ComputeProfile = {
  id: string;
  label: string;
  system: string;
  configured: boolean;
  requiresApproval?: boolean;
  summary?: string;
};

type ProjectReportPayload = {
  session?: {
    sessionId?: string;
    status?: string;
    ownerId?: string;
    projectId?: string | null;
    createdAt?: string | null;
    lastActivityAt?: string | null;
  };
  goal?: {
    summary?: string | null;
    preview?: JsonObject;
  };
  summary?: {
    artifactCount?: number;
    taskRunCount?: number;
    jobRunCount?: number;
    approvalCount?: number;
    eventCount?: number;
    pendingApprovals?: number;
    completedJobs?: number;
  };
  latestArtifacts?: JsonObject;
  nextActions?: string[];
  notes?: string | null;
  generatedAt?: string;
};

type RetrievalArtifactPayload = {
  summary: string;
  userGoal?: RetrievalResult['user_goal'];
  ideaCards?: RetrievalIdeaCard[];
  recommendedIdeaId?: string | null;
  handoff?: RetrievalResult['handoff'];
};

type StructureArtifactPayload = {
  structure?: {
    atoms?: Array<RenderData['atoms'][number] & { id?: string; renderStyle?: string }>;
    latticeVectors?: RenderData['latticeVectors'];
    formula?: string;
  };
  meta?: {
    formula?: string;
  };
};

type ComputePreview = {
  formula?: string;
  workflow?: string;
  quality?: string;
  kpointGrid?: string;
};

type ComputeInputArtifactPayload = {
  preview?: ComputePreview;
  meta?: ComputePreview;
};

type VisualAssetPayload = {
  files?: Array<{ name: string }>;
};

type ComputeCompileResponse = {
  computeInputSetArtifactId?: string | null;
  preview?: ComputePreview | null;
  meta?: ComputePreview | null;
};

type ComputeSubmitResponse = {
  approvalRequired?: boolean;
  approvalRequestId?: string | null;
  submissionMode?: string | null;
};

type ParseScienceResponse = {
  reportArtifactId?: string | null;
};

type CompilePromptResponse = {
  promptArtifactId?: string | null;
  compiledPrompt?: string | null;
};

type GenerateImagesResponse = {
  approvalRequired?: boolean;
  approvalRequestId?: string | null;
  images?: string[];
};

type ReportGenerationResponse = {
  report?: ProjectReportPayload | null;
};

const WORKSPACE_STEPS: Array<{
  id: WorkspaceStep;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'idea',
    label: 'Idea',
    description: 'Literature-grounded opportunity discovery',
    icon: <BookOpen size={14} />,
  },
  {
    id: 'modeling',
    label: 'Modeling',
    description: 'Build and revise the working structure',
    icon: <Layers3 size={14} />,
  },
  {
    id: 'compute',
    label: 'Compute',
    description: 'Compile and submit the input set',
    icon: <Cpu size={14} />,
  },
  {
    id: 'analyze',
    label: 'Analyze/Render',
    description: 'Inspect the structure or generate illustrations',
    icon: <Sparkles size={14} />,
  },
  {
    id: 'report',
    label: 'Report',
    description: 'Snapshot the project into a shareable report',
    icon: <ClipboardCheck size={14} />,
  },
];

const RUNTIME_SESSION_STORAGE_KEY = 'runtime_demo_session_id';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function stepFromQuery(value: string | null): WorkspaceStep {
  const candidate = String(value || '').trim().toLowerCase();
  if (candidate === 'idea' || candidate === 'modeling' || candidate === 'compute' || candidate === 'analyze' || candidate === 'report') {
    return candidate;
  }
  return 'idea';
}

function focusFromQuery(value: string | null): AnalyzeFocus {
  return String(value || '').trim().toLowerCase() === 'illustration' ? 'illustration' : 'viewer';
}

function formatRelativeTime(raw: string | null | undefined) {
  if (!raw) return 'Unknown';
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return 'Unknown';
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)}m ago`;
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)}h ago`;
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

function latestArtifact(artifacts: RuntimeArtifact[], kind: string, matcher?: (artifact: RuntimeArtifact) => boolean) {
  const matches = artifacts.filter((artifact) => artifact.kind === kind && (!matcher || matcher(artifact)));
  return matches.length ? matches[matches.length - 1] : null;
}

function artifactBadge(kind: string) {
  switch (kind) {
    case 'idea_shortlist':
      return 'Idea';
    case 'reference_bundle':
      return 'References';
    case 'structure':
      return 'Structure';
    case 'compute_input_set':
      return 'Input Set';
    case 'result_bundle':
      return 'Result';
    case 'visual_asset':
      return 'Visual';
    case 'project_report':
      return 'Report';
    default:
      return kind.replace(/_/g, ' ');
  }
}

async function readJson<T = unknown>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const errorMessage = typeof parsed === 'object' && parsed !== null && 'error' in parsed && typeof parsed.error === 'string'
      ? parsed.error
      : raw || `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return parsed as T;
}

function buildMolecularStructureFromPayload(payload: StructureArtifactPayload): MolecularStructure | null {
  if (!Array.isArray(payload.structure?.atoms) || !Array.isArray(payload.structure?.latticeVectors)) {
    return null;
  }

  const atoms = payload.structure.atoms.map((atom, index: number) => {
    const element = typeof atom.element === 'string' ? atom.element : 'C';
    const defaults = getAtomProperties(element);
    return {
      id: typeof atom.id === 'string' ? atom.id : `atom-${index}`,
      element,
      position: atom.position,
      radius: defaults.radius,
      color: defaults.color,
      renderStyle: atom.renderStyle,
    };
  });

  return renderDataToMolecularStructure(
    {
      atoms: atoms.map((atom) => ({
        element: atom.element,
        position: atom.position,
      })),
      latticeVectors: payload.structure.latticeVectors,
    },
    `${payload.meta?.formula || payload.structure?.formula || 'runtime_structure'}.vasp`,
  );
}

const SectionTitle: React.FC<{ label: string; title: string; body?: string }> = ({ label, title, body }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
    <h2 className="text-xl font-bold text-[#0A1128]">{title}</h2>
    {body ? <p className="mt-2 text-sm text-gray-600 leading-relaxed">{body}</p> : null}
  </div>
);

const ProjectWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { user, setMolecularData } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentStep, setCurrentStep] = useState<WorkspaceStep>(() => stepFromQuery(searchParams.get('step')));
  const [analyzeFocus, setAnalyzeFocus] = useState<AnalyzeFocus>(() => focusFromQuery(searchParams.get('focus')));
  const [sessionId, setSessionId] = useState<string>(() => {
    const fromQuery = String(searchParams.get('session') || '').trim();
    if (fromQuery) return fromQuery;
    if (typeof window !== 'undefined') {
      return String(window.localStorage.getItem(RUNTIME_SESSION_STORAGE_KEY) || '').trim();
    }
    return '';
  });

  const [recentSessions, setRecentSessions] = useState<RecentSessionItem[]>([]);
  const [sessionData, setSessionData] = useState<RuntimeSessionPayload | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const [ideaQuery, setIdeaQuery] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<RetrievalResult | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);

  const [modelingIntent, setModelingIntent] = useState<ModelingIntent | null>(null);
  const [modelingPrefillPrompt, setModelingPrefillPrompt] = useState<string | null>(
    searchParams.get('prompt')
      || (searchParams.get('material')
        ? `Build a bulk ${searchParams.get('material')} crystal${searchParams.get('phase') ? ` (${searchParams.get('phase')})` : ''}${searchParams.get('mpid') ? ` using Materials Project entry ${searchParams.get('mpid')}` : ''}`
        : null),
  );
  const [latestBuildMeta, setLatestBuildMeta] = useState<ModelingBuildMeta | null>(null);

  const [computeProfiles, setComputeProfiles] = useState<ComputeProfile[]>([]);
  const [computeWorkflow, setComputeWorkflow] = useState('relax');
  const [computeQuality, setComputeQuality] = useState('standard');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [computeCompilePreview, setComputeCompilePreview] = useState<ComputePreview | null>(null);
  const [computeInputArtifactId, setComputeInputArtifactId] = useState<string | null>(null);
  const [isCompilingInputs, setIsCompilingInputs] = useState(false);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [computeApprovalRequestId, setComputeApprovalRequestId] = useState<string | null>(null);

  const [scienceBrief, setScienceBrief] = useState('');
  const [parsedScienceArtifactId, setParsedScienceArtifactId] = useState<string | null>(null);
  const [compiledPromptArtifactId, setCompiledPromptArtifactId] = useState<string | null>(null);
  const [compiledPromptPreview, setCompiledPromptPreview] = useState<string | null>(null);
  const [renderImages, setRenderImages] = useState<string[]>([]);
  const [renderApprovalRequestId, setRenderApprovalRequestId] = useState<string | null>(null);
  const [isParsingScience, setIsParsingScience] = useState(false);
  const [isCompilingPrompt, setIsCompilingPrompt] = useState(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);

  const [reportNotes, setReportNotes] = useState('');
  const [reportPayload, setReportPayload] = useState<ProjectReportPayload | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const hydratedIdeaArtifactId = useRef<string | null>(null);
  const hydratedStructureArtifactId = useRef<string | null>(null);
  const hydratedComputeArtifactId = useRef<string | null>(null);
  const hydratedPromptArtifactId = useRef<string | null>(null);
  const hydratedVisualArtifactId = useRef<string | null>(null);
  const hydratedReportArtifactId = useRef<string | null>(null);

  const activeIdeaCard = useMemo(() => {
    return discoveryResult?.idea_cards.find((card) => card.id === selectedIdeaId) || null;
  }, [discoveryResult, selectedIdeaId]);

  const latestStructureArtifact = useMemo(
    () => latestArtifact(sessionData?.artifacts || [], 'structure'),
    [sessionData],
  );
  const latestComputeInputArtifact = useMemo(
    () => latestArtifact(sessionData?.artifacts || [], 'compute_input_set'),
    [sessionData],
  );
  const latestVisualAsset = useMemo(
    () => latestArtifact(sessionData?.artifacts || [], 'visual_asset'),
    [sessionData],
  );
  const latestProjectReport = useMemo(
    () => latestArtifact(sessionData?.artifacts || [], 'project_report'),
    [sessionData],
  );

  useEffect(() => {
    const next = stepFromQuery(searchParams.get('step'));
    const nextFocus = focusFromQuery(searchParams.get('focus'));
    const nextSession = String(searchParams.get('session') || '').trim();
    setCurrentStep(next);
    setAnalyzeFocus(nextFocus);
    if (nextSession && nextSession !== sessionId) {
      setSessionId(nextSession);
    }
  }, [searchParams, sessionId]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('step', currentStep);
    if (currentStep === 'analyze') {
      next.set('focus', analyzeFocus);
    } else {
      next.delete('focus');
    }
    if (sessionId) {
      next.set('session', sessionId);
    } else {
      next.delete('session');
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [analyzeFocus, currentStep, searchParams, sessionId, setSearchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionId) {
      window.localStorage.setItem(RUNTIME_SESSION_STORAGE_KEY, sessionId);
    } else {
      window.localStorage.removeItem(RUNTIME_SESSION_STORAGE_KEY);
    }
  }, [sessionId]);

  const loadRecentSessions = React.useCallback(async () => {
    if (!user?.email) {
      setRecentSessions([]);
      return;
    }

    try {
      const result = await readJson<{ ok: boolean; sessions: RecentSessionItem[] }>(
        `${API_BASE_URL}/runtime-demo/sessions?ownerId=${encodeURIComponent(user.email)}&limit=8`,
      );
      setRecentSessions(Array.isArray(result.sessions) ? result.sessions : []);
    } catch {
      setRecentSessions([]);
    }
  }, [user?.email]);

  const loadSession = React.useCallback(async (targetSessionId: string, options?: { silent?: boolean }) => {
    if (!targetSessionId) {
      setSessionData(null);
      if (!options?.silent) {
        setSessionError(null);
      }
      return;
    }

    setIsLoadingSession(true);
    if (!options?.silent) {
      setSessionError(null);
    }

    try {
      const result = await readJson<RuntimeSessionPayload>(
        `${API_BASE_URL}/runtime-demo/sessions/${encodeURIComponent(targetSessionId)}`,
      );
      setSessionData(result);
    } catch (error) {
      setSessionData(null);
      if (!options?.silent) {
        setSessionError(error instanceof Error ? error.message : 'Failed to load project session');
      }
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentSessions();
  }, [loadRecentSessions]);

  useEffect(() => {
    if (sessionId) {
      void loadSession(sessionId);
      return;
    }
    setSessionData(null);
  }, [loadSession, sessionId]);

  useEffect(() => {
    const hasActiveJobs = (sessionData?.jobRuns || []).some((job) => !['succeeded', 'failed', 'cancelled'].includes(job.status));
    const hasPendingApprovals = (sessionData?.approvals || []).some((approval) => approval.status === 'pending');
    if (!sessionId || (!hasActiveJobs && !hasPendingApprovals)) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadSession(sessionId, { silent: true });
    }, 7000);

    return () => window.clearInterval(timer);
  }, [loadSession, sessionData?.approvals, sessionData?.jobRuns, sessionId]);

  const hydrateArtifactPayload = React.useCallback(async <T,>(artifactId: string) => {
    const payload = await readJson<{ ok: boolean; payload: T }>(
      `${API_BASE_URL}/runtime-demo/artifacts/${encodeURIComponent(artifactId)}/payload`,
    );
    return payload.payload;
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      if (!sessionData) {
        return;
      }

      const latestIdeaArtifact = latestArtifact(sessionData.artifacts, 'idea_shortlist');
      if (latestIdeaArtifact && hydratedIdeaArtifactId.current !== latestIdeaArtifact._id) {
        hydratedIdeaArtifactId.current = latestIdeaArtifact._id;
        try {
          const payload = await hydrateArtifactPayload<RetrievalArtifactPayload>(latestIdeaArtifact._id);
          const nextResult: RetrievalResult = {
            summary: payload.summary,
            user_goal: payload.userGoal,
            idea_cards: payload.ideaCards || [],
            recommended_idea_id: payload.recommendedIdeaId || null,
            handoff: payload.handoff || null,
          };
          setDiscoveryResult(nextResult);
          setSelectedIdeaId(nextResult.recommended_idea_id || nextResult.idea_cards[0]?.id || null);
          if (payload.handoff?.handoff_prompt) {
            setModelingPrefillPrompt((current) => current || payload.handoff.handoff_prompt);
          }
        } catch {
          // ignore hydration failure for non-critical cards
        }
      }

      if (latestStructureArtifact && hydratedStructureArtifactId.current !== latestStructureArtifact._id) {
        hydratedStructureArtifactId.current = latestStructureArtifact._id;
        try {
          const payload = await hydrateArtifactPayload<StructureArtifactPayload>(latestStructureArtifact._id);
          const molecular = buildMolecularStructureFromPayload(payload);
          if (molecular) {
            setMolecularData(molecular);
          }
        } catch {
          // ignore hydration failure for viewer
        }
      }

      if (latestComputeInputArtifact && hydratedComputeArtifactId.current !== latestComputeInputArtifact._id) {
        hydratedComputeArtifactId.current = latestComputeInputArtifact._id;
        setComputeInputArtifactId(latestComputeInputArtifact._id);
        try {
          const payload = await hydrateArtifactPayload<ComputeInputArtifactPayload>(latestComputeInputArtifact._id);
          setComputeCompilePreview(payload.preview || payload.meta || null);
        } catch {
          setComputeCompilePreview(null);
        }
      }

      const latestCompiledPrompt = latestArtifact(
        sessionData.artifacts,
        'report',
        (artifact) => Boolean(artifact.preview?.compiledPrompt),
      );
      if (latestCompiledPrompt && hydratedPromptArtifactId.current !== latestCompiledPrompt._id) {
        hydratedPromptArtifactId.current = latestCompiledPrompt._id;
        setCompiledPromptArtifactId(latestCompiledPrompt._id);
        setCompiledPromptPreview(
          typeof latestCompiledPrompt.preview?.compiledPrompt === 'string'
            ? latestCompiledPrompt.preview.compiledPrompt.trim() || null
            : null,
        );
      }

      if (latestVisualAsset && hydratedVisualArtifactId.current !== latestVisualAsset._id) {
        hydratedVisualArtifactId.current = latestVisualAsset._id;
        try {
          const payload = await hydrateArtifactPayload<VisualAssetPayload>(latestVisualAsset._id);
          const files = Array.isArray(payload.files) ? payload.files : [];
          setRenderImages(
            files.map((file: { name: string }) => `${API_BASE_URL}/runtime-demo/artifacts/${encodeURIComponent(latestVisualAsset._id)}/files/${encodeURIComponent(file.name)}`),
          );
        } catch {
          setRenderImages([]);
        }
      }

      if (latestProjectReport && hydratedReportArtifactId.current !== latestProjectReport._id) {
        hydratedReportArtifactId.current = latestProjectReport._id;
        try {
          const payload = await hydrateArtifactPayload<ProjectReportPayload>(latestProjectReport._id);
          setReportPayload(payload);
        } catch {
          setReportPayload(null);
        }
      }
    };

    void hydrate();
  }, [hydrateArtifactPayload, latestComputeInputArtifact, latestProjectReport, latestStructureArtifact, latestVisualAsset, sessionData, setMolecularData]);

  useEffect(() => {
    const run = async () => {
      try {
        const profiles = await readJson<{ ok: boolean; profiles: ComputeProfile[] }>(
          `${API_BASE_URL}/runtime-demo/compute/profiles`,
        );
        const nextProfiles = Array.isArray(profiles.profiles) ? profiles.profiles : [];
        setComputeProfiles(nextProfiles);
        if (!selectedProfileId) {
          const firstConfigured = nextProfiles.find((profile) => profile.configured);
          if (firstConfigured) {
            setSelectedProfileId(firstConfigured.id);
          }
        }
      } catch {
        setComputeProfiles([]);
      }
    };

    void run();
  }, [selectedProfileId]);

  const handleDiscoverIdeas = async () => {
    if (!ideaQuery.trim() || isDiscovering || !user?.email) return;
    setIsDiscovering(true);
    setSessionError(null);
    setBannerMessage(null);

    try {
      const result = await readJson<{
        ok: boolean;
        success: boolean;
        sessionId: string;
        result: RetrievalResult;
      }>(`${API_BASE_URL}/runtime-demo/retrieval/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId || undefined,
          ownerId: sessionId ? undefined : user.email,
          projectId: sessionId ? undefined : `workspace:${user.email}`,
          prompt: ideaQuery.trim(),
        }),
      });

      setSessionId(result.sessionId);
      setDiscoveryResult(result.result);
      setSelectedIdeaId(result.result.recommended_idea_id || result.result.idea_cards[0]?.id || null);
      setModelingPrefillPrompt(result.result.handoff?.handoff_prompt || null);
      setCurrentStep('modeling');
      setBannerMessage('Idea step completed. The project session has been refreshed with a new shortlist.');
      await Promise.all([loadSession(result.sessionId), loadRecentSessions()]);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to discover ideas');
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectIdea = (ideaId: string) => {
    setSelectedIdeaId(ideaId);
    const card = discoveryResult?.idea_cards.find((item) => item.id === ideaId);
    if (card?.blueprint?.handoff_prompt) {
      setModelingPrefillPrompt(card.blueprint.handoff_prompt);
    }
  };

  const handleBuildMetaChange = (meta: ModelingBuildMeta | null) => {
    setLatestBuildMeta(meta);
    if (meta?.sessionId) {
      setSessionId(meta.sessionId);
      void loadSession(meta.sessionId, { silent: true });
      void loadRecentSessions();
    }
  };

  const openComputeFromModeling = () => {
    setCurrentStep('compute');
    if (latestBuildMeta?.sessionId) {
      setSessionId(latestBuildMeta.sessionId);
    }
  };

  const handleCompileInputs = async () => {
    if (!sessionId || !latestStructureArtifact) {
      setSessionError('No validated structure artifact is available yet.');
      return;
    }

    setIsCompilingInputs(true);
    setSessionError(null);

    try {
      const result = await readJson<ComputeCompileResponse>(`${API_BASE_URL}/runtime-demo/compute/compile-input-set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          structureArtifactId: latestStructureArtifact._id,
          intent: {
            workflow: computeWorkflow,
            quality: computeQuality,
            vdw: true,
            spin_mode: 'auto',
          },
        }),
      });

      setComputeInputArtifactId(result.computeInputSetArtifactId || null);
      setComputeCompilePreview(result.preview || result.meta || null);
      setBannerMessage('Compute input set compiled into the runtime artifact timeline.');
      await loadSession(sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to compile compute input set');
    } finally {
      setIsCompilingInputs(false);
    }
  };

  const submitComputeJob = async (approvalRequestId?: string | null) => {
    if (!sessionId || !computeInputArtifactId || !selectedProfileId) {
      setSessionError('Compile the input set and pick a compute profile before submitting.');
      return;
    }

    setIsSubmittingJob(true);
    setSessionError(null);

    try {
      const result = await readJson<ComputeSubmitResponse>(`${API_BASE_URL}/runtime-demo/compute/submit-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: approvalRequestId ? undefined : sessionId,
          computeInputSetArtifactId: computeInputArtifactId,
          approvalRequestId: approvalRequestId || undefined,
          profileId: selectedProfileId,
        }),
      });

      if (result.approvalRequired && result.approvalRequestId) {
        setComputeApprovalRequestId(result.approvalRequestId);
        setBannerMessage('Compute submission is approval-gated. Approve it from the panel to continue.');
      } else {
        setComputeApprovalRequestId(null);
        setBannerMessage(`Compute job submitted via ${result.submissionMode || 'runtime orchestrator'}.`);
      }
      await loadSession(sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to submit compute job');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const handleParseScience = async () => {
    if (!sessionId || scienceBrief.trim().length < 10) {
      setSessionError('Provide a science brief with at least 10 characters first.');
      return;
    }

    setIsParsingScience(true);
    setSessionError(null);

    try {
      const result = await readJson<ParseScienceResponse>(`${API_BASE_URL}/runtime-demo/rendering/parse-science`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          text: scienceBrief.trim(),
        }),
      });

      setParsedScienceArtifactId(result.reportArtifactId || null);
      setBannerMessage('Scientific brief parsed into a rendering-ready report artifact.');
      await loadSession(sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to parse scientific brief');
    } finally {
      setIsParsingScience(false);
    }
  };

  const handleCompilePrompt = async () => {
    if (!sessionId) {
      setSessionError('Open a project session before compiling a prompt.');
      return;
    }

    setIsCompilingPrompt(true);
    setSessionError(null);

    try {
      const result = await readJson<CompilePromptResponse>(`${API_BASE_URL}/runtime-demo/rendering/compile-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          reportArtifactId: parsedScienceArtifactId || undefined,
        }),
      });

      setCompiledPromptArtifactId(result.promptArtifactId || null);
      setCompiledPromptPreview(result.compiledPrompt || null);
      setBannerMessage('Compiled prompt artifact added to the project timeline.');
      await loadSession(sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to compile rendering prompt');
    } finally {
      setIsCompilingPrompt(false);
    }
  };

  const generateImages = async (approvalRequestId?: string | null) => {
    if (!sessionId || !compiledPromptArtifactId) {
      setSessionError('Compile a prompt artifact before image generation.');
      return;
    }

    setIsGeneratingImages(true);
    setSessionError(null);

    try {
      const result = await readJson<GenerateImagesResponse>(`${API_BASE_URL}/runtime-demo/rendering/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: approvalRequestId ? undefined : sessionId,
          approvalRequestId: approvalRequestId || undefined,
          promptArtifactId: compiledPromptArtifactId,
          numberOfImages: 2,
        }),
      });

      if (result.approvalRequired && result.approvalRequestId) {
        setRenderApprovalRequestId(result.approvalRequestId);
        setBannerMessage('Illustration generation is waiting for approval.');
      } else {
        setRenderApprovalRequestId(null);
        setRenderImages(Array.isArray(result.images) ? result.images : []);
        setBannerMessage('Illustration assets generated and recorded into the project timeline.');
      }
      await loadSession(sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to generate illustration assets');
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const approveRequest = async (approvalId: string, continuation?: () => Promise<void>) => {
    try {
      await readJson(`${API_BASE_URL}/runtime-demo/approvals/${encodeURIComponent(approvalId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedBy: user?.email || 'workspace-user',
        }),
      });
      await loadSession(sessionId, { silent: true });
      if (continuation) {
        await continuation();
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to approve request');
    }
  };

  const rejectRequest = async (approvalId: string) => {
    try {
      await readJson(`${API_BASE_URL}/runtime-demo/approvals/${encodeURIComponent(approvalId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionNote: 'Rejected from unified project workspace',
        }),
      });
      await loadSession(sessionId, { silent: true });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to reject request');
    }
  };

  const handleGenerateReport = async () => {
    if (!sessionId) {
      setSessionError('Open a project session before generating a report.');
      return;
    }

    setIsGeneratingReport(true);
    setSessionError(null);

    try {
      const result = await readJson<ReportGenerationResponse>(`${API_BASE_URL}/runtime-demo/workspace/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          notes: reportNotes.trim() || undefined,
        }),
      });

      setReportPayload(result.report || null);
      setBannerMessage('Project report artifact generated successfully.');
      await loadSession(sessionId);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : 'Failed to generate project report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const startNewProject = () => {
    setSessionId('');
    setSessionData(null);
    setBannerMessage(null);
    setSessionError(null);
    setIdeaQuery('');
    setDiscoveryResult(null);
    setSelectedIdeaId(null);
    setModelingIntent(null);
    setModelingPrefillPrompt(null);
    setLatestBuildMeta(null);
    setComputeCompilePreview(null);
    setComputeInputArtifactId(null);
    setComputeApprovalRequestId(null);
    setScienceBrief('');
    setParsedScienceArtifactId(null);
    setCompiledPromptArtifactId(null);
    setCompiledPromptPreview(null);
    setRenderImages([]);
    setRenderApprovalRequestId(null);
    setReportPayload(null);
    setReportNotes('');
    hydratedIdeaArtifactId.current = null;
    hydratedStructureArtifactId.current = null;
    hydratedComputeArtifactId.current = null;
    hydratedPromptArtifactId.current = null;
    hydratedVisualArtifactId.current = null;
    hydratedReportArtifactId.current = null;
    setMolecularData(null);
    setCurrentStep('idea');
  };

  const projectTitle = sessionData?.session?.primaryGoalArtifactId
    ? sessionData.artifacts.find((artifact) => artifact._id === sessionData.session.primaryGoalArtifactId)?.summary
    : null;

  const artifactViewsById = useMemo(() => {
    return new Map((sessionData?.artifactViews || []).map((artifactView) => [artifactView.artifact._id, artifactView]));
  }, [sessionData?.artifactViews]);

  const renderIdeaStep = () => (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <SectionTitle
          label="Step 1"
          title="Idea Discovery"
          body="Start with a research goal, let the retrieval layer assemble literature and structure evidence, and persist the shortlist into the project timeline."
        />
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <textarea
              value={ideaQuery}
              onChange={(event) => setIdeaQuery(event.target.value)}
              placeholder="Describe the battery, catalysis, or materials problem you want this project to solve..."
              rows={7}
              className="w-full p-4 text-sm border border-gray-100 rounded-[24px] font-mono focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDiscoverIdeas}
                disabled={isDiscovering || !ideaQuery.trim()}
                className="px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed inline-flex items-center gap-2"
              >
                {isDiscovering ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                Discover ideas
              </button>
              <button
                type="button"
                onClick={() => setIdeaQuery('Design a computation-first project around Na-ion cathode stability and migration kinetics.')}
                className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                Use a seed prompt
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Project contract</p>
            <div className="space-y-3 text-sm text-gray-600">
              <p>The Idea step now creates a runtime session, versions the goal/plan, and records both a `reference_bundle` and an `idea_shortlist` artifact.</p>
              <p>That gives Modeling a persistent handoff, instead of passing a prompt through the URL and losing provenance on refresh.</p>
            </div>
          </div>
        </div>
      </div>

      {discoveryResult ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
            <SectionTitle
              label="Shortlist"
              title="Recommended project ideas"
              body={discoveryResult.summary}
            />
            <div className="mt-5 grid gap-3">
              {discoveryResult.idea_cards.map((card) => {
                const isActive = card.id === selectedIdeaId;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectIdea(card.id)}
                    className={cn(
                      'w-full rounded-[24px] border p-4 text-left transition-all',
                      isActive
                        ? 'border-[#0A1128] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5'
                        : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#0A1128]">{card.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{card.material_family}</p>
                      </div>
                      <span className="rounded-[16px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        {card.difficulty}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-600 leading-relaxed">{card.fit_reason}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.target_properties.slice(0, 3).map((property) => (
                        <span key={property} className="rounded-[16px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-mono text-gray-500">
                          {property}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
            <SectionTitle
              label="Handoff"
              title={activeIdeaCard?.title || 'Modeling handoff'}
              body="The selected idea now drives the project session, the modeling prompt seed, and the reference lineage shown in the right-hand panel."
            />
            {activeIdeaCard ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Recommended formula</p>
                  <p className="mt-1 text-base font-mono font-bold text-[#0A1128]">
                    {activeIdeaCard.blueprint?.structure_source?.formula || 'Not specified'}
                  </p>
                  {activeIdeaCard.blueprint?.structure_source?.material_id ? (
                    <p className="mt-1 text-xs text-gray-400 font-mono">
                      {activeIdeaCard.blueprint.structure_source.material_id}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Modeling rationale</p>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {activeIdeaCard.blueprint?.literature_rationale || 'No rationale was attached to this idea.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModelingPrefillPrompt(activeIdeaCard.blueprint?.handoff_prompt || activeIdeaCard.title);
                    setCurrentStep('modeling');
                  }}
                  className="w-full px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm inline-flex items-center justify-center gap-2"
                >
                  Send into Modeling
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Pick an idea from the shortlist to seed the Modeling step.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderModelingStep = () => (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <SectionTitle
          label="Step 2"
          title="Modeling Workspace"
          body="The workspace now reuses the existing modeling stack, but keeps the session id, latest structure artifact, and build metadata inside the same project shell."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)] h-[720px]">
        <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
          <ChatPanel
            onIntentChange={setModelingIntent}
            currentIntent={modelingIntent}
            prefillPrompt={modelingPrefillPrompt}
            onBuildMetaChange={handleBuildMetaChange}
          />
        </div>
        <div className="rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
          <CanvasPanel intent={modelingIntent} onSendToCompute={openComputeFromModeling} />
        </div>
      </div>
    </div>
  );

  const renderComputeStep = () => (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <SectionTitle
          label="Step 3"
          title="Runtime-backed Compute"
          body="Compile and submit directly against the runtime session so input sets, approvals, job runs, and results all stay traceable."
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Workflow</span>
            <select
              value={computeWorkflow}
              onChange={(event) => setComputeWorkflow(event.target.value)}
              className="mt-2 w-full rounded-[16px] border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-gray-300"
            >
              {['relax', 'static', 'dos', 'band', 'adsorption', 'neb'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Quality</span>
            <select
              value={computeQuality}
              onChange={(event) => setComputeQuality(event.target.value)}
              className="mt-2 w-full rounded-[16px] border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-gray-300"
            >
              {['fast', 'standard', 'high'].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Compute profile</span>
            <select
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
              className="mt-2 w-full rounded-[16px] border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700 outline-none focus:border-gray-300"
            >
              {computeProfiles.map((profile) => (
                <option key={profile.id} value={profile.id} disabled={!profile.configured}>
                  {profile.label}{profile.configured ? '' : ' (not configured)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={handleCompileInputs}
            disabled={isCompilingInputs || !latestStructureArtifact}
            className="px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isCompilingInputs ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
            Compile input set
          </button>
          <button
            type="button"
            onClick={() => submitComputeJob()}
            disabled={isSubmittingJob || !computeInputArtifactId}
            className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isSubmittingJob ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Submit compute job
          </button>
          {computeApprovalRequestId ? (
            <button
              type="button"
              onClick={() => approveRequest(computeApprovalRequestId, async () => submitComputeJob(computeApprovalRequestId))}
              className="px-4 py-3 bg-[#1A2A4E] text-white rounded-[32px] hover:bg-[#24365E] transition-colors shadow-sm font-medium text-sm inline-flex items-center gap-2"
            >
              <ShieldCheck size={14} />
              Approve and continue
            </button>
          ) : null}
        </div>

        {computeCompilePreview ? (
          <div className="mt-5 rounded-[24px] border border-gray-100 bg-gray-50 p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Latest compiled input set</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Formula" value={String(computeCompilePreview.formula || '--')} />
              <MetricCard label="Workflow" value={String(computeCompilePreview.workflow || '--')} />
              <MetricCard label="Quality" value={String(computeCompilePreview.quality || '--')} />
              <MetricCard label="K-point grid" value={String(computeCompilePreview.kpointGrid || '--')} mono />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderAnalyzeStep = () => (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-4">
          <SectionTitle
            label="Step 4"
            title="Analyze / Render"
            body="Viewer and illustration now live inside one project step. The viewer keeps the original visualizer workflow, and the illustration path writes prompt and visual artifacts into the same session."
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAnalyzeFocus('viewer')}
              className={cn(
                'px-4 py-3 rounded-[32px] text-sm font-medium transition-colors',
                analyzeFocus === 'viewer'
                  ? 'bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
              )}
            >
              Viewer
            </button>
            <button
              type="button"
              onClick={() => setAnalyzeFocus('illustration')}
              className={cn(
                'px-4 py-3 rounded-[32px] text-sm font-medium transition-colors',
                analyzeFocus === 'illustration'
                  ? 'bg-white text-[#0A1128] shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100',
              )}
            >
              Illustration
            </button>
          </div>
        </div>
      </div>

      {analyzeFocus === 'viewer' ? (
        <div className="flex gap-6 h-[760px]">
          <ControlPanel />
          <div className="flex-1 rounded-[24px] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
            <Scene3D />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
            <SectionTitle
              label="Illustration Brief"
              title="Scientific rendering pipeline"
              body="Parse a science brief, compile a prompt artifact, and generate image assets with approval gates preserved."
            />
            <div className="mt-5 space-y-4">
              <textarea
                value={scienceBrief}
                onChange={(event) => setScienceBrief(event.target.value)}
                placeholder="Describe the mechanism, key species, visual metaphor, and publication goal..."
                rows={9}
                className="w-full p-4 text-sm border border-gray-100 rounded-[24px] font-mono focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleParseScience}
                  disabled={isParsingScience || scienceBrief.trim().length < 10}
                  className="px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {isParsingScience ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  Parse science
                </button>
                <button
                  type="button"
                  onClick={handleCompilePrompt}
                  disabled={isCompilingPrompt || !sessionId}
                  className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {isCompilingPrompt ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
                  Compile prompt
                </button>
                <button
                  type="button"
                  onClick={() => generateImages()}
                  disabled={isGeneratingImages || !compiledPromptArtifactId}
                  className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {isGeneratingImages ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                  Generate images
                </button>
                {renderApprovalRequestId ? (
                  <button
                    type="button"
                    onClick={() => approveRequest(renderApprovalRequestId, async () => generateImages(renderApprovalRequestId))}
                    className="px-4 py-3 bg-[#1A2A4E] text-white rounded-[32px] hover:bg-[#24365E] transition-colors shadow-sm font-medium text-sm inline-flex items-center gap-2"
                  >
                    <ShieldCheck size={14} />
                    Approve and continue
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
            <SectionTitle
              label="Artifacts"
              title="Prompt and visual outputs"
              body="This side keeps the immediate rendering outputs visible while the right rail tracks the full artifact and approval timeline."
            />
            <div className="mt-5 space-y-4">
              <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs text-gray-500">Compiled prompt artifact</p>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                  {compiledPromptPreview || 'No compiled prompt is available yet.'}
                </p>
              </div>

              {renderImages.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {renderImages.map((imageUrl, index) => (
                    <img
                      key={`${imageUrl}-${index}`}
                      src={imageUrl}
                      alt={`Generated scientific illustration ${index + 1}`}
                      className="w-full rounded-[24px] border border-gray-100 bg-gray-50 object-cover"
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                  Generate images to see the latest scientific illustration assets here.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderReportStep = () => (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <SectionTitle
          label="Step 5"
          title="Project Report"
          body="The report step turns the current session into a durable artifact, so an external teammate can inspect the project without replaying every action manually."
        />
        <div className="mt-5 space-y-4">
          <textarea
            value={reportNotes}
            onChange={(event) => setReportNotes(event.target.value)}
            placeholder="Optional: add context for reviewers, decision logs, or next-step notes..."
            rows={5}
            className="w-full p-4 text-sm border border-gray-100 rounded-[24px] font-mono focus:outline-none focus:border-gray-300 focus:shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition-all resize-none text-gray-600"
          />
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport || !sessionId}
            className="px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:border disabled:border-gray-200 disabled:shadow-none disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {isGeneratingReport ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
            Generate project report
          </button>
        </div>
      </div>

      {reportPayload ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
            <SectionTitle
              label="Summary"
              title={reportPayload.goal?.summary || 'Current project snapshot'}
              body={`Generated ${formatRelativeTime(reportPayload.generatedAt || null)}.`}
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricCard label="Artifacts" value={String(reportPayload.summary?.artifactCount || 0)} />
              <MetricCard label="Task runs" value={String(reportPayload.summary?.taskRunCount || 0)} />
              <MetricCard label="Jobs" value={String(reportPayload.summary?.jobRunCount || 0)} />
              <MetricCard label="Pending approvals" value={String(reportPayload.summary?.pendingApprovals || 0)} />
            </div>
            {reportPayload.notes ? (
              <div className="mt-5 rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Reviewer notes</p>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{reportPayload.notes}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
            <SectionTitle
              label="Next Actions"
              title="Recommended follow-through"
              body="These are derived from the current session graph, so a collaborator can pick up the project from a stable handoff."
            />
            <div className="mt-5 space-y-3">
              {(reportPayload.nextActions || []).map((action) => (
                <div key={action} className="rounded-[24px] border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                  {action}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F0] p-6">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <div className="rounded-[24px] border border-gray-100 bg-white p-6 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Project Workspace</p>
              <h1 className="mt-1 text-xl font-bold text-[#0A1128]">
                {projectTitle || 'Unified AI4S Workflow'}
              </h1>
              <p className="mt-2 text-sm text-gray-600 max-w-3xl">
                One session now owns Idea discovery, Modeling, Compute, Analyze/Render, and Report. Artifacts, approvals, and versioned plan changes stay visible on the same page.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startNewProject}
                className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium"
              >
                New project
              </button>
              <button
                type="button"
                onClick={() => {
                  if (sessionId) {
                    void loadSession(sessionId);
                  }
                  void loadRecentSessions();
                }}
                className="px-4 py-3 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-4 py-3 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm"
              >
                Home
              </button>
            </div>
          </div>

          {bannerMessage ? (
            <div className="mt-4 rounded-[16px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {bannerMessage}
            </div>
          ) : null}
          {sessionError ? (
            <div className="mt-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {sessionError}
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="space-y-6">
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Workflow</p>
              <div className="space-y-2">
                {WORKSPACE_STEPS.map((step, index) => {
                  const active = step.id === currentStep;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setCurrentStep(step.id)}
                      className={cn(
                        'w-full rounded-[24px] border px-4 py-4 text-left transition-all',
                        active
                          ? 'border-[#0A1128] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5'
                          : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'mt-0.5 flex h-8 w-8 items-center justify-center rounded-[16px]',
                          active ? 'bg-[#0A1128] text-white' : 'bg-gray-200 text-gray-400',
                        )}>
                          {step.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#0A1128]">
                            {index + 1}. {step.label}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 leading-relaxed">{step.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Projects</p>
                <FolderKanban size={14} className="text-gray-400" />
              </div>
              <div className="mt-4 space-y-2">
                {recentSessions.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                    No persisted runtime sessions yet.
                  </div>
                ) : recentSessions.map((item) => (
                  <button
                    key={item.session._id}
                    type="button"
                    onClick={() => setSessionId(item.session._id)}
                    className={cn(
                      'w-full rounded-[24px] border px-4 py-3 text-left transition-all',
                      item.session._id === sessionId
                        ? 'border-[#0A1128] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.08)] ring-1 ring-black/5'
                        : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200',
                    )}
                  >
                    <p className="text-sm font-semibold text-[#0A1128] line-clamp-2">
                      {item.goalArtifact?.summary || item.session._id}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {formatRelativeTime(item.session.lastActivityAt || item.session.createdAt)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="min-w-0">
            {currentStep === 'idea' && renderIdeaStep()}
            {currentStep === 'modeling' && renderModelingStep()}
            {currentStep === 'compute' && renderComputeStep()}
            {currentStep === 'analyze' && renderAnalyzeStep()}
            {currentStep === 'report' && renderReportStep()}
          </main>

          <aside className="space-y-6">
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Session Health</p>
                {isLoadingSession ? <Loader2 size={14} className="animate-spin text-gray-400" /> : <Boxes size={14} className="text-gray-400" />}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MetricCard label="Artifacts" value={String(sessionData?.summary?.artifactCount || 0)} />
                <MetricCard label="Task Runs" value={String(sessionData?.summary?.taskRunCount || 0)} />
                <MetricCard label="Jobs" value={String(sessionData?.summary?.jobRunCount || 0)} />
                <MetricCard label="Approvals" value={String(sessionData?.summary?.approvalCount || 0)} />
              </div>
            </div>

            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Approvals</p>
                <ShieldCheck size={14} className="text-gray-400" />
              </div>
              <div className="mt-4 space-y-3">
                {(sessionData?.approvals || []).length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                    No approval requests in this project.
                  </div>
                ) : (sessionData?.approvals || []).map((approval) => (
                  <div key={approval._id} className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#0A1128]">{approval.reason || approval.targetRef || approval._id}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {approval.status} · {formatRelativeTime(approval.createdAt || null)}
                        </p>
                      </div>
                      {approval.status === 'pending' ? (
                        <span className="rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600">
                          Pending
                        </span>
                      ) : approval.status === 'approved' ? (
                        <span className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                          Approved
                        </span>
                      ) : (
                        <span className="rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-600">
                          {approval.status}
                        </span>
                      )}
                    </div>
                    {approval.status === 'pending' ? (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => approveRequest(approval._id)}
                          className="px-4 py-2.5 bg-[#0A1128] text-white rounded-[32px] hover:bg-[#162044] transition-colors shadow-sm font-medium text-sm inline-flex items-center gap-2"
                        >
                          <CheckCircle2 size={14} />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectRequest(approval._id)}
                          className="px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-[32px] hover:bg-gray-100 transition-colors text-sm font-medium inline-flex items-center gap-2"
                        >
                          <XCircle size={14} />
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Artifacts</p>
                <FileJson size={14} className="text-gray-400" />
              </div>
              <div className="mt-4 space-y-3">
                {(sessionData?.artifacts || []).length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                    Artifacts will appear here as each workflow step completes.
                  </div>
                ) : (sessionData?.artifacts || []).slice(-8).reverse().map((artifact) => {
                  const artifactView = artifactViewsById.get(artifact._id);
                  return (
                    <div key={artifact._id} className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-[16px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          {artifactBadge(artifact.kind)}
                        </span>
                        <span className="text-[10px] text-gray-400">{formatRelativeTime(artifact.createdAt || artifact.updatedAt || null)}</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[#0A1128]">{artifact.summary || artifact._id}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-[16px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-mono text-gray-500">
                          v{artifact.version || 1}
                        </span>
                        {artifact.lifecycleStage ? (
                          <span className="rounded-[16px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-mono text-gray-500">
                            {artifact.lifecycleStage}
                          </span>
                        ) : null}
                        {artifactView ? (
                          <span className="rounded-[16px] border border-gray-200 bg-white px-3 py-1 text-[10px] font-mono text-gray-500">
                            {artifactView.payloadInspection.materialized ? 'materialized' : artifactView.payloadInspection.storageKind}
                          </span>
                        ) : null}
                      </div>
                      {typeof artifact.preview?.formula === 'string' ? (
                        <p className="mt-2 text-xs text-gray-500 font-mono">
                          {artifact.preview.formula}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Timeline</p>
                <ChevronRight size={14} className="text-gray-400" />
              </div>
              <div className="mt-4 space-y-3">
                {(sessionData?.taskRuns || []).length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                    Task runs will appear after the first runtime-backed action.
                  </div>
                ) : (sessionData?.taskRuns || []).slice(-6).reverse().map((taskRun) => (
                  <div key={taskRun._id} className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#0A1128]">{taskRun.stepId}</p>
                      <span className={cn(
                        'rounded-[16px] border px-3 py-1 text-[10px] font-bold uppercase tracking-widest',
                        taskRun.status === 'succeeded'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : taskRun.status === 'failed'
                            ? 'border-rose-200 bg-rose-50 text-rose-600'
                            : taskRun.status === 'waiting_approval'
                              ? 'border-amber-200 bg-amber-50 text-amber-600'
                              : 'border-gray-200 bg-white text-gray-500',
                      )}>
                        {taskRun.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {taskRun.skillId} · {formatRelativeTime(taskRun.createdAt || taskRun.endedAt || null)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
    <p className={cn('mt-2 text-base font-bold text-[#0A1128]', mono && 'font-mono')}>{value}</p>
  </div>
);

export default ProjectWorkspace;
