import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Loader2,
  Database,
  Workflow,
  ShieldCheck,
  Clock3,
  Copy,
  Boxes,
  FileJson,
  Image as ImageIcon,
  AlertTriangle,
  Sparkles,
  Send,
  CheckCircle2,
  XCircle,
  Wand2,
  Beaker,
} from 'lucide-react';
import { API_BASE_URL } from '../../config';

type RuntimeArtifact = {
  _id: string;
  kind: string;
  summary?: string;
  status?: string;
  lifecycleStage?: string;
  latestInLineage?: boolean;
  preview?: Record<string, any>;
  payloadRef?: string;
  payloadType?: string;
  mimeType?: string;
  blobSizeBytes?: number;
  contentHash?: string;
  createdAt?: string;
  updatedAt?: string;
  lineageRootId?: string;
  producedByTaskRun?: string;
};

type PayloadInspection = {
  artifactId?: string | null;
  kind?: string | null;
  payloadRef?: string | null;
  payloadType?: string | null;
  mimeType?: string | null;
  blobSizeBytes?: number | null;
  contentHash?: string | null;
  materialized: boolean;
  storageKind: string;
  exists: boolean;
  diskSizeBytes?: number;
  modifiedAt?: string;
  jsonSummary?: Record<string, any>;
  error?: string;
  parseError?: string;
};

type ArtifactView = {
  artifact: RuntimeArtifact;
  payloadInspection: PayloadInspection;
};

type RuntimeSessionPayload = {
  session: {
    _id: string;
    status: string;
    ownerId?: string;
    projectId?: string;
    activePlanArtifactId?: string;
    primaryGoalArtifactId?: string;
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
  artifacts: RuntimeArtifact[];
  artifactViews: ArtifactView[];
  taskRuns: any[];
  jobRuns: any[];
  approvals: any[];
  events: any[];
};

type ArtifactDetailPayload = {
  artifact: RuntimeArtifact;
  payloadInspection: PayloadInspection;
  lineage: Array<{
    _id: string;
    kind: string;
    version: number;
    supersedes?: string;
    latestInLineage?: boolean;
    status?: string;
    lifecycleStage?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  producerTaskRun?: {
    _id: string;
    sessionId: string;
    planId: string;
    stepId: string;
    agentId: string;
    skillId: string;
    status: string;
    attempt: number;
    terminalReason?: string;
    createdAt?: string;
    startedAt?: string;
    endedAt?: string;
  } | null;
};

type RecentSessionItem = {
  session: {
    _id: string;
    status: string;
    ownerId?: string;
    projectId?: string;
    activePlanArtifactId?: string;
    primaryGoalArtifactId?: string;
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
    _id: string;
    summary?: string;
    preview?: Record<string, any>;
  } | null;
  planArtifact?: {
    _id: string;
    summary?: string;
    preview?: Record<string, any>;
  } | null;
};

type ModelingProvider = {
  provider: string;
  label: string;
  configured: boolean;
  mode?: string;
};

type ModelingHealth = {
  pythonExecutable?: string | null;
  pythonVersion?: string | null;
  numpyVersion?: string | null;
  pymatgenVersion?: string | null;
  ccdcAvailable?: boolean;
  healthy?: boolean;
  issues?: string[];
};

type ModelingDiagnosticsPayload = {
  providers: ModelingProvider[];
  engineHealth?: ModelingHealth;
  summary?: {
    configuredProviderCount?: number;
    healthy?: boolean;
    issues?: number;
  };
  defaultOrder?: string[];
};

type RuntimeSkillDefinition = {
  _id: string;
  skillId: string;
  version: string;
  latest?: boolean;
  requiredArtifacts?: string[];
  inputSchemaRef?: string;
  validatorIds?: string[];
  outputArtifacts?: string[];
  approvalPolicy?: string;
  retryPolicy?: string;
  failurePolicy?: string;
  contextPolicy?: string;
  status?: string;
  steps?: Array<{
    id: string;
    toolName: string;
    effectType: string;
    onFailure: string;
  }>;
  display?: {
    domain?: string;
    summary?: string;
    tags?: string[];
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

type ComputeDiagnosticsPayload = {
  mongo?: {
    configured?: boolean;
    envKey?: string | null;
    connected?: boolean;
    readyState?: number;
    readyStateLabel?: string;
  };
  serverLocal?: {
    configured?: boolean;
    profileId?: string | null;
    schedulerRef?: string | null;
    shell?: string | null;
    command?: string | null;
    ready?: boolean;
    commandProbe?: {
      configured?: boolean;
      command?: string | null;
      executableToken?: string | null;
      available?: boolean;
      resolvedPath?: string | null;
      stderr?: string | null;
      error?: string | null;
    };
  };
  potcar?: {
    configured?: boolean;
    envKey?: string | null;
    libraryDir?: string | null;
    readable?: boolean;
    ready?: boolean;
  };
  slurm?: {
    configured?: boolean;
    profileId?: string | null;
    schedulerRef?: string | null;
    partition?: string | null;
    executable?: string | null;
    ready?: boolean;
    commands?: {
      sbatch?: { available?: boolean; resolvedPath?: string | null };
      squeue?: { available?: boolean; resolvedPath?: string | null };
      sacct?: { available?: boolean; resolvedPath?: string | null };
    };
  };
  pbs?: {
    configured?: boolean;
    profileId?: string | null;
    schedulerRef?: string | null;
    queue?: string | null;
    executable?: string | null;
    accessMode?: string | null;
    ready?: boolean;
    remoteSsh?: {
      configured?: boolean;
      host?: string | null;
      user?: string | null;
      port?: number | null;
      keyPath?: string | null;
      keyReadable?: boolean;
      remoteBaseDir?: string | null;
      shell?: string | null;
      commands?: {
        ssh?: { available?: boolean; resolvedPath?: string | null };
        scp?: { available?: boolean; resolvedPath?: string | null };
      };
    };
    commands?: {
      qsub?: { available?: boolean; resolvedPath?: string | null };
      qstat?: { available?: boolean; resolvedPath?: string | null };
    };
  };
  workers?: {
    enabled?: boolean;
    intervals?: {
      approvalIntervalMs?: number;
      jobMonitorIntervalMs?: number;
      harvestIntervalMs?: number;
    };
  };
  storage?: {
    artifactDir?: string;
    artifactDirReadable?: boolean;
    jobDir?: string;
    jobDirReadable?: boolean;
  };
  issues?: string[];
  summary?: {
    issueCount?: number;
    serverLocalReady?: boolean;
    slurmReady?: boolean;
    pbsReady?: boolean;
    mongoReady?: boolean;
    potcarReady?: boolean;
    configuredProfileCount?: number;
  };
};

const STORAGE_KEY = 'runtime_demo_session_id';

function shortId(value?: string | null) {
  if (!value) {
    return 'n/a';
  }
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'n/a';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMetric(value?: number | null, digits = 4) {
  if (value == null || Number.isNaN(value)) {
    return 'n/a';
  }
  return Number(value).toFixed(digits);
}

function isResultBundleSummary(summary: any) {
  return summary?.documentType === 'result_bundle_payload';
}

function isComputeInputPayload(payload: any) {
  return Boolean(payload && typeof payload === 'object' && payload.files && typeof payload.files === 'object');
}

function isActiveComputeJobStatus(status?: string | null) {
  return ['created', 'submitted', 'queued', 'running'].includes(String(status || '').toLowerCase());
}

function getComputeJobBadgeClass(status?: string | null) {
  return isActiveComputeJobStatus(status) ? badgeClass('running') : badgeClass(status);
}

function getComputeJobStatusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'created') {
    return 'waiting agent';
  }
  if (normalized === 'submitted') {
    return 'submitted';
  }
  if (normalized === 'queued') {
    return 'queued';
  }
  if (normalized === 'running') {
    return 'computing';
  }
  return status || 'unknown';
}

function getComputeJobHint(jobRun: any) {
  const normalized = String(jobRun?.status || '').toLowerCase();
  if (normalized === 'created') {
    return 'Calculation files are ready. Waiting for an external/local compute agent to pick up the job.';
  }
  if (normalized === 'submitted') {
    return 'Submitted to the scheduler and waiting for queue updates.';
  }
  if (normalized === 'queued') {
    return 'Accepted by the scheduler and currently waiting in queue.';
  }
  if (normalized === 'running') {
    return 'The job is actively computing.';
  }
  if (normalized === 'completed') {
    return 'Scheduler execution finished.';
  }
  if (normalized === 'failed') {
    return 'Scheduler reported a failure.';
  }
  if (normalized === 'cancelled') {
    return 'Execution was cancelled.';
  }
  return 'Runtime is tracking this job.';
}

function buildComputeJobTimeline(jobRun: any) {
  const status = String(jobRun?.status || '').toLowerCase();
  const materializationStatus = String(jobRun?.materializationStatus || '').toLowerCase();

  return [
    {
      key: 'prepared',
      label: 'prepared',
      state: status === 'created' ? 'active' : 'done',
    },
    {
      key: 'submitted',
      label: 'scheduler',
      state: ['submitted', 'queued'].includes(status)
        ? 'active'
        : ['running', 'completed', 'failed', 'cancelled'].includes(status)
          ? 'done'
          : 'idle',
    },
    {
      key: 'running',
      label: 'compute',
      state: status === 'running'
        ? 'active'
        : ['completed'].includes(status)
          ? 'done'
          : ['failed', 'cancelled'].includes(status)
            ? 'error'
            : 'idle',
    },
    {
      key: 'harvest',
      label: 'harvest',
      state: materializationStatus === 'materialized'
        ? 'done'
        : status === 'completed'
          ? (materializationStatus === 'failed' ? 'error' : 'active')
          : 'idle',
    },
  ];
}

function computeTimelineClass(state: string) {
  if (state === 'done') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (state === 'active') {
    return 'border-blue-200 bg-blue-50 text-blue-700';
  }
  if (state === 'error') {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-slate-200 bg-slate-50 text-slate-500';
}

function getComputeInputFiles(payload: any) {
  if (!isComputeInputPayload(payload)) {
    return [];
  }

  const preferredOrder = ['INCAR', 'KPOINTS', 'POSCAR', 'POTCAR.spec.json', 'job.sh'];
  return Object.entries(payload.files || {})
    .map(([name, content]) => ({
      name,
      content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    }))
    .sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left.name);
      const rightIndex = preferredOrder.indexOf(right.name);
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }
      return left.name.localeCompare(right.name);
    });
}

function badgeClass(status?: string | null) {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
    case 'approved':
    case 'ready':
    case 'validated':
    case 'materialized':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'waiting_approval':
    case 'pending':
    case 'partial':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed':
    case 'rejected':
    case 'cancelled':
    case 'expired':
    case 'invalid':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'running':
    case 'queued':
    case 'created':
    case 'submitted':
    case 'completed':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function copyText(value: string) {
  navigator.clipboard.writeText(value).catch(() => {});
}

function StatCard({
  icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber';
}) {
  const toneClass = {
    slate: 'bg-white border-slate-200 text-slate-900',
    blue: 'bg-[#F3F7FF] border-[#D7E5FF] text-[#173B7A]',
    emerald: 'bg-[#F2FBF7] border-[#CFECDD] text-[#116149]',
    amber: 'bg-[#FFF8EE] border-[#F3DDAC] text-[#8B5A00]',
  }[tone];

  return (
    <div className={`rounded-[22px] border px-4 py-4 shadow-[0_8px_28px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm opacity-80">{icon}</div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] opacity-60">{label}</p>
          <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  right,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_16px_60px_rgba(15,23,42,0.06)] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">{eyebrow}</p>
          ) : null}
          <h2 className="mt-1 text-lg font-black text-slate-900">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const RuntimeInspector: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [sessionData, setSessionData] = useState<RuntimeSessionPayload | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [artifactDetail, setArtifactDetail] = useState<ArtifactDetailPayload | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingArtifact, setLoadingArtifact] = useState(false);
  const [recentSessions, setRecentSessions] = useState<RecentSessionItem[]>([]);
  const [loadingRecentSessions, setLoadingRecentSessions] = useState(false);
  const [recentSessionsError, setRecentSessionsError] = useState<string | null>(null);
  const [ownerIdInput, setOwnerIdInput] = useState('runtime-demo-user');
  const [projectIdInput, setProjectIdInput] = useState('');
  const [goalPromptInput, setGoalPromptInput] = useState('');
  const [parseScienceTextInput, setParseScienceTextInput] = useState('');
  const [modelingPromptInput, setModelingPromptInput] = useState('');
  const [modelingProvidersInput, setModelingProvidersInput] = useState('materials_project,atomly,csd,icsd,optimade,fallback');
  const [computeWorkflowInput, setComputeWorkflowInput] = useState<'relax' | 'static'>('relax');
  const [computeQualityInput, setComputeQualityInput] = useState<'fast' | 'standard' | 'high'>('standard');
  const [computeProfiles, setComputeProfiles] = useState<ComputeProfile[]>([]);
  const [computeProfilesError, setComputeProfilesError] = useState<string | null>(null);
  const [computeProfileInput, setComputeProfileInput] = useState('server_local');
  const [computeDiagnostics, setComputeDiagnostics] = useState<ComputeDiagnosticsPayload | null>(null);
  const [computeDiagnosticsError, setComputeDiagnosticsError] = useState<string | null>(null);
  const [loadingComputeDiagnostics, setLoadingComputeDiagnostics] = useState(false);
  const [replanPromptInput, setReplanPromptInput] = useState('');
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [rawPayload, setRawPayload] = useState<Record<string, any> | null>(null);
  const [rawPayloadError, setRawPayloadError] = useState<string | null>(null);
  const [loadingRawPayload, setLoadingRawPayload] = useState(false);
  const [selectedComputeFileName, setSelectedComputeFileName] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('');
  const [eventCategoryFilter, setEventCategoryFilter] = useState<'all' | 'system' | 'domain'>('all');
  const [modelingDiagnostics, setModelingDiagnostics] = useState<ModelingDiagnosticsPayload | null>(null);
  const [loadingModelingDiagnostics, setLoadingModelingDiagnostics] = useState(false);
  const [modelingDiagnosticsError, setModelingDiagnosticsError] = useState<string | null>(null);
  const [modelingSkills, setModelingSkills] = useState<RuntimeSkillDefinition[]>([]);
  const [loadingModelingSkills, setLoadingModelingSkills] = useState(false);
  const [modelingSkillsError, setModelingSkillsError] = useState<string | null>(null);

  async function postJson<T = any>(path: string, body: Record<string, any>) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Request failed for ${path}`);
    }
    return payload as T;
  }

  async function runAction<T>(key: string, action: () => Promise<T>) {
    setActionLoadingKey(key);
    setActionError(null);
    setActionMessage(null);

    try {
      return await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      setActionError(message);
      throw error;
    } finally {
      setActionLoadingKey(null);
    }
  }

  async function loadRecentSessions(preferredSessionId?: string) {
    setLoadingRecentSessions(true);
    setRecentSessionsError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/sessions?limit=12`);
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !Array.isArray(payload?.sessions)) {
        throw new Error(payload?.error || 'Failed to load recent sessions');
      }

      const nextSessions = payload.sessions as RecentSessionItem[];
      if (preferredSessionId) {
        nextSessions.sort((left, right) => {
          if (left.session._id === preferredSessionId) return -1;
          if (right.session._id === preferredSessionId) return 1;
          return 0;
        });
      }
      setRecentSessions(nextSessions);
    } catch (error) {
      setRecentSessions([]);
      setRecentSessionsError(error instanceof Error ? error.message : 'Failed to load recent sessions');
    } finally {
      setLoadingRecentSessions(false);
    }
  }

  async function loadModelingDiagnostics() {
    setLoadingModelingDiagnostics(true);
    setModelingDiagnosticsError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/modeling/providers`);
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to load modeling diagnostics');
      }

      setModelingDiagnostics(payload as ModelingDiagnosticsPayload);
    } catch (error) {
      setModelingDiagnostics(null);
      setModelingDiagnosticsError(error instanceof Error ? error.message : 'Failed to load modeling diagnostics');
    } finally {
      setLoadingModelingDiagnostics(false);
    }
  }

  async function loadModelingSkills() {
    setLoadingModelingSkills(true);
    setModelingSkillsError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/skills?domain=modeling`);
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !Array.isArray(payload?.skills)) {
        throw new Error(payload?.error || 'Failed to load modeling skills');
      }

      setModelingSkills(payload.skills as RuntimeSkillDefinition[]);
    } catch (error) {
      setModelingSkills([]);
      setModelingSkillsError(error instanceof Error ? error.message : 'Failed to load modeling skills');
    } finally {
      setLoadingModelingSkills(false);
    }
  }

  async function loadComputeProfiles() {
    setComputeProfilesError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/compute/profiles`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !Array.isArray(payload?.profiles)) {
        throw new Error(payload?.error || 'Failed to load compute profiles');
      }

      const profiles = payload.profiles as ComputeProfile[];
      setComputeProfiles(profiles);

      if (!profiles.some((profile) => profile.id === computeProfileInput)) {
        const preferred = profiles.find((profile) => profile.id === 'server_local' && profile.configured)
          || profiles.find((profile) => profile.id === 'local_demo')
          || profiles.find((profile) => profile.configured)
          || profiles[0];
        if (preferred?.id) {
          setComputeProfileInput(preferred.id);
        }
      }
    } catch (error) {
      setComputeProfiles([]);
      setComputeProfilesError(error instanceof Error ? error.message : 'Failed to load compute profiles');
    }
  }

  async function loadComputeDiagnostics() {
    setLoadingComputeDiagnostics(true);
    setComputeDiagnosticsError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/compute/diagnostics`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to load compute diagnostics');
      }

      setComputeDiagnostics(payload as ComputeDiagnosticsPayload);
    } catch (error) {
      setComputeDiagnostics(null);
      setComputeDiagnosticsError(error instanceof Error ? error.message : 'Failed to load compute diagnostics');
    } finally {
      setLoadingComputeDiagnostics(false);
    }
  }

  async function loadSession(targetSessionId?: string) {
    const sessionId = String(targetSessionId || sessionIdInput).trim();
    if (!sessionId) {
      setSessionError('请输入一个 sessionId');
      return;
    }

    setLoadingSession(true);
    setSessionError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/sessions/${encodeURIComponent(sessionId)}`);
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Failed to load session ${sessionId}`);
      }

      const nextData = payload as RuntimeSessionPayload;
      setSessionData(nextData);
      setSessionIdInput(sessionId);
      localStorage.setItem(STORAGE_KEY, sessionId);
      void loadRecentSessions(sessionId);

      const artifactIds = new Set(nextData.artifactViews.map((item) => item.artifact._id));
      setSelectedArtifactId((current) => {
        if (current && artifactIds.has(current)) {
          return current;
        }
        const latest = [...nextData.artifactViews].reverse().find(Boolean);
        return latest ? latest.artifact._id : null;
      });
    } catch (error) {
      setSessionData(null);
      setArtifactDetail(null);
      setSelectedArtifactId(null);
      setSessionError(error instanceof Error ? error.message : 'Failed to load session');
    } finally {
      setLoadingSession(false);
    }
  }

  async function loadArtifactDetail(artifactId: string) {
    setLoadingArtifact(true);
    setArtifactError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/artifacts/${encodeURIComponent(artifactId)}`);
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Failed to load artifact ${artifactId}`);
      }
      setArtifactDetail(payload as ArtifactDetailPayload);
    } catch (error) {
      setArtifactDetail(null);
      setArtifactError(error instanceof Error ? error.message : 'Failed to load artifact');
    } finally {
      setLoadingArtifact(false);
    }
  }

  async function loadRawPayload(artifactId: string) {
    setLoadingRawPayload(true);
    setRawPayloadError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/runtime-demo/artifacts/${encodeURIComponent(artifactId)}/payload`);
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Failed to load raw payload for ${artifactId}`);
      }
      setRawPayload(payload.payload || null);
    } catch (error) {
      setRawPayload(null);
      setRawPayloadError(error instanceof Error ? error.message : 'Failed to load raw payload');
    } finally {
      setLoadingRawPayload(false);
    }
  }

  async function handleCreateDemoSession() {
    const goalPrompt = goalPromptInput.trim();
    const ownerId = ownerIdInput.trim();

    if (!ownerId) {
      setActionError('请先填写 ownerId');
      return;
    }
    if (!goalPrompt) {
      setActionError('请先填写 goalPrompt');
      return;
    }

    const payload = await runAction('create-session', () => postJson<{
      sessionId: string;
      goalArtifactId?: string;
      planArtifactId?: string;
    }>('/runtime-demo/submit-goal', {
      ownerId,
      projectId: projectIdInput.trim() || undefined,
      goalPrompt,
    }));

    setActionMessage(`Created demo session ${shortId(payload.sessionId)}`);
    setGoalPromptInput('');
    await loadSession(payload.sessionId);
  }

  async function handleParseScience() {
    const text = parseScienceTextInput.trim();
    if (text.length < 10) {
      setActionError('科学文本至少需要 10 个字符');
      return;
    }

    const payload = await runAction('parse-science', () => postJson<{
      sessionId: string;
      reportArtifactId?: string | null;
      taskRunId: string;
    }>('/runtime-demo/rendering/parse-science', {
      sessionId: sessionData?.session?._id || undefined,
      ownerId: sessionData?.session?._id ? undefined : ownerIdInput.trim(),
      projectId: sessionData?.session?._id ? undefined : (projectIdInput.trim() || undefined),
      goalPrompt: goalPromptInput.trim() || undefined,
      text,
    }));

    setActionMessage(`Scientific parsing finished for session ${shortId(payload.sessionId)}`);
    setParseScienceTextInput('');
    await loadSession(payload.sessionId);
    if (payload.reportArtifactId) {
      setSelectedArtifactId(payload.reportArtifactId);
    }
  }

  async function handleBuildModelingStructure() {
    const prompt = modelingPromptInput.trim();
    if (!prompt) {
      setActionError('请先填写 modeling prompt');
      return;
    }

    const providerPreferences = modelingProvidersInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = await runAction<{
      sessionId: string;
      structureArtifactId?: string | null;
      databaseSourceLabel?: string | null;
      providersTried?: string[];
    }>('build-modeling-structure', () => postJson('/runtime-demo/modeling/build', {
      sessionId: sessionData?.session?._id || undefined,
      ownerId: sessionData?.session?._id ? undefined : ownerIdInput.trim(),
      projectId: sessionData?.session?._id ? undefined : (projectIdInput.trim() || undefined),
      prompt,
      providerPreferences,
    }));

    const providerLabel = payload.databaseSourceLabel || 'configured providers';
    const tried = Array.isArray(payload.providersTried) && payload.providersTried.length > 0
      ? ` (tried ${payload.providersTried.join(' -> ')})`
      : '';
    setActionMessage(`Built modeling structure via ${providerLabel}${tried}`);
    setModelingPromptInput('');
    await loadSession(payload.sessionId);
    if (payload.structureArtifactId) {
      setSelectedArtifactId(payload.structureArtifactId);
    }
  }

  async function handleReplanSession() {
    if (!sessionData?.session?._id) {
      setActionError('请先选择一个 session');
      return;
    }
    const goalPrompt = replanPromptInput.trim();
    if (!goalPrompt) {
      setActionError('请先填写新的 replan goal');
      return;
    }

    const payload = await runAction('replan', () => postJson<{
      sessionId: string;
      planArtifactId?: string;
    }>('/runtime-demo/replan', {
      sessionId: sessionData.session._id,
      goalPrompt,
      replanReason: 'runtime_inspector_manual_replan',
    }));

    setActionMessage(`Replanned session ${shortId(payload.sessionId)}`);
    setReplanPromptInput('');
    await loadSession(payload.sessionId);
  }

  async function handleCompileComputeInputSet() {
    if (!sessionData?.session?._id) {
      setActionError('请先选择一个 session');
      return;
    }

    const selectedStructure = sessionData.artifactViews.find(
      (item) => item.artifact._id === selectedArtifactId && item.artifact.kind === 'structure'
    );
    const latestStructure = [...sessionData.artifactViews]
      .reverse()
      .find((item) => item.artifact.kind === 'structure');
    const targetStructure = selectedStructure || latestStructure;

    if (!targetStructure?.artifact?._id) {
      setActionError('当前 session 里没有可用的 structure artifact');
      return;
    }

    const payload = await runAction<{
      sessionId: string;
      computeInputSetArtifactId?: string | null;
      sourceStructureArtifactId?: string | null;
      meta?: {
        workflow?: string;
        quality?: string;
      } | null;
    }>('compile-input-set', () => postJson('/runtime-demo/compute/compile-input-set', {
      sessionId: sessionData.session._id,
      structureArtifactId: targetStructure.artifact._id,
      workflow: computeWorkflowInput,
      quality: computeQualityInput,
    }));

    setActionMessage(
      `Compiled ${payload.meta?.workflow || computeWorkflowInput} input set from ${shortId(payload.sourceStructureArtifactId || targetStructure.artifact._id)}`
    );
    await loadSession(payload.sessionId);
    if (payload.computeInputSetArtifactId) {
      setSelectedArtifactId(payload.computeInputSetArtifactId);
    }
  }

  async function handleSubmitComputeJob() {
    if (!sessionData?.session?._id) {
      setActionError('请先选择一个 session');
      return;
    }

    const selectedComputeInput = sessionData.artifactViews.find(
      (item) => item.artifact._id === selectedArtifactId && item.artifact.kind === 'compute_input_set'
    );
    const latestComputeInput = [...sessionData.artifactViews]
      .reverse()
      .find((item) => item.artifact.kind === 'compute_input_set');
    const targetComputeInput = selectedComputeInput || latestComputeInput;

    if (!targetComputeInput?.artifact?._id) {
      setActionError('当前 session 里没有可用的 compute_input_set artifact');
      return;
    }

    const payload = await runAction<any>('submit-compute-job', () => postJson('/runtime-demo/compute/submit-job', {
      sessionId: sessionData.session._id,
      computeInputSetArtifactId: targetComputeInput.artifact._id,
      profileId: computeProfileInput,
    }));

    await loadSession(payload.sessionId || sessionData.session._id);

    if (payload.approvalRequired) {
      setActionMessage(`Compute submit is waiting for approval ${shortId(payload.approvalRequestId)}`);
      return;
    }

    setActionMessage(`Submitted compute job ${shortId(payload.jobRunId)} on profile ${payload.profile?.id || computeProfileInput}`);
  }

  async function handleRunServerLocalSmoke() {
    const ownerId = ownerIdInput.trim();
    if (!sessionData?.session?._id && !ownerId) {
      setActionError('请先填写 ownerId，或先选择一个 session');
      return;
    }

    const providerPreferences = modelingProvidersInput
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = await runAction<{
      sessionId: string;
      structureArtifactId?: string | null;
      computeInputSetArtifactId?: string | null;
      jobRunId?: string | null;
      externalJobId?: string | null;
      profile?: string | null;
      submissionMode?: string | null;
    }>('run-server-local-smoke', () => postJson('/runtime-demo/compute/server-local-smoke', {
      sessionId: sessionData?.session?._id || undefined,
      ownerId: sessionData?.session?._id ? undefined : ownerId,
      projectId: sessionData?.session?._id ? undefined : (projectIdInput.trim() || undefined),
      prompt: modelingPromptInput.trim() || undefined,
      workflow: computeWorkflowInput,
      quality: computeQualityInput,
      providerPreferences,
    }));

    const targetSessionId = payload.sessionId || sessionData?.session?._id;
    if (targetSessionId) {
      await loadSession(targetSessionId);
    } else {
      await loadRecentSessions();
    }

    if (payload.computeInputSetArtifactId) {
      setSelectedArtifactId(payload.computeInputSetArtifactId);
    } else if (payload.structureArtifactId) {
      setSelectedArtifactId(payload.structureArtifactId);
    }

    setActionMessage(
      `Started server-local smoke job ${shortId(payload.jobRunId)} via ${payload.profile || 'server_local'} (${payload.submissionMode || 'local'})`
    );
  }

  async function handleCompilePrompt() {
    if (!sessionData?.session?._id) {
      setActionError('请先选择一个 session');
      return;
    }

    const payload = await runAction('compile-prompt', () => postJson<{
      sessionId: string;
      promptArtifactId?: string | null;
    }>('/runtime-demo/rendering/compile-prompt', {
      sessionId: sessionData.session._id,
    }));

    setActionMessage(`Compiled latest rendering prompt for ${shortId(payload.sessionId)}`);
    await loadSession(payload.sessionId);
    if (payload.promptArtifactId) {
      setSelectedArtifactId(payload.promptArtifactId);
    }
  }

  async function handleGenerateImage() {
    if (!sessionData?.session?._id) {
      setActionError('请先选择一个 session');
      return;
    }

    const payload = await runAction('generate-image', () => postJson<any>('/runtime-demo/rendering/generate-image', {
      sessionId: sessionData.session._id,
    }));

    await loadSession(payload.sessionId || sessionData.session._id);

    if (payload.approvalRequired) {
      setActionMessage(`Image generation is waiting for approval ${shortId(payload.approvalRequestId)}`);
      return;
    }

    setActionMessage(`Generated visual asset for ${shortId(payload.sessionId || sessionData.session._id)}`);
    if (payload.visualAssetArtifactId) {
      setSelectedArtifactId(payload.visualAssetArtifactId);
    }
  }

  async function handleSubmitMockJob() {
    if (!sessionData?.session?._id) {
      setActionError('请先选择一个 session');
      return;
    }

    const payload = await runAction<{
      sessionId: string;
      jobRunId: string;
      taskRunId: string;
      externalJobId?: string;
    }>('submit-mock-job', () => postJson('/runtime-demo/jobs/mock-submit', {
      sessionId: sessionData.session._id,
      jobLabel: 'Runtime Inspector Mock Job',
    }));

    setActionMessage(`Submitted mock job ${shortId(payload.jobRunId)} for session ${shortId(payload.sessionId)}`);
    await loadSession(payload.sessionId);
  }

  async function handleRunApprovalSweeper() {
    const payload = await runAction<{
      summary?: {
        expired?: number;
        cancelledTaskRuns?: number;
        skipped?: number;
        errors?: number;
      };
    }>('run-approval-sweeper', () => postJson('/runtime-demo/admin/run-approval-expiry-sweeper', {
      limit: 50,
    }));

    const expired = payload.summary?.expired || 0;
    const cancelledTaskRuns = payload.summary?.cancelledTaskRuns || 0;
    const errors = payload.summary?.errors || 0;
    setActionMessage(`Approval sweeper finished: expired ${expired}, cancelled task runs ${cancelledTaskRuns}, errors ${errors}`);

    if (sessionData?.session?._id) {
      await loadSession(sessionData.session._id);
    } else {
      await loadRecentSessions();
    }
  }

  async function handleRunJobMonitor() {
    const payload = await runAction<{
      summary?: {
        transitioned?: number;
        heartbeats?: number;
        harvestStarted?: number;
        errors?: number;
      };
      harvested?: Array<{
        status?: string;
        resultArtifactId?: string | null;
      }>;
    }>('run-job-monitor', () => postJson('/runtime-demo/admin/run-job-monitor', {
      limit: 50,
      queueAfterMs: 1 * 1000,
      runningAfterMs: 3 * 1000,
      completeAfterMs: 8 * 1000,
    }));

    const transitioned = payload.summary?.transitioned || 0;
    const heartbeats = payload.summary?.heartbeats || 0;
    const harvestStarted = payload.summary?.harvestStarted || 0;
    const errors = payload.summary?.errors || 0;
    const harvestedCount = Array.isArray(payload.harvested)
      ? payload.harvested.filter((item) => item.status === 'materialized').length
      : 0;
    const latestResultArtifactId = Array.isArray(payload.harvested)
      ? payload.harvested.find((item) => item.resultArtifactId)?.resultArtifactId || null
      : null;

    setActionMessage(
      `Job monitor finished: transitioned ${transitioned}, heartbeats ${heartbeats}, harvest scheduled ${harvestStarted}, materialized ${harvestedCount}, errors ${errors}`
    );

    if (sessionData?.session?._id) {
      await loadSession(sessionData.session._id);
      if (latestResultArtifactId) {
        setSelectedArtifactId(latestResultArtifactId);
      }
    } else {
      await loadRecentSessions();
    }
  }

  async function handleRunHarvestMonitor() {
    const payload = await runAction<{
      summary?: {
        lagging?: number;
        skipped?: number;
        errors?: number;
      };
      lagThresholdMs?: number;
    }>('run-harvest-monitor', () => postJson('/runtime-demo/admin/run-harvest-lagging-monitor', {
      limit: 50,
      lagThresholdMs: 5 * 60 * 1000,
      emitEvents: true,
    }));

    const lagging = payload.summary?.lagging || 0;
    const errors = payload.summary?.errors || 0;
    const thresholdMinutes = Math.round((payload.lagThresholdMs || 5 * 60 * 1000) / 60000);
    setActionMessage(`Harvest lag monitor finished: lagging ${lagging}, threshold ${thresholdMinutes} min, errors ${errors}`);

    if (sessionData?.session?._id) {
      await loadSession(sessionData.session._id);
    } else {
      await loadRecentSessions();
    }
  }

  async function handleRejectApproval(approvalId: string) {
    await runAction(`reject-${approvalId}`, () => postJson(`/runtime-demo/approvals/${encodeURIComponent(approvalId)}/reject`, {
      decisionNote: 'Rejected from runtime inspector',
    }));

    setActionMessage(`Rejected approval ${shortId(approvalId)}`);
    if (sessionData?.session?._id) {
      await loadSession(sessionData.session._id);
    } else {
      await loadRecentSessions();
    }
  }

  async function handleApproveAndResume(approvalId: string) {
    const approval = sessionData?.approvals.find((item) => item._id === approvalId);

    const result = await runAction<any>(`approve-${approvalId}`, async () => {
      await postJson(`/runtime-demo/approvals/${encodeURIComponent(approvalId)}/approve`, {
        approvedBy: ownerIdInput.trim() || 'runtime-demo-user',
        decisionNote: 'Approved from runtime inspector',
      });

      if (String(approval?.targetRef || '').startsWith('rendering.generate-image:')) {
        return postJson<any>('/runtime-demo/rendering/generate-image', {
          approvalRequestId: approvalId,
        });
      }

      if (String(approval?.targetRef || '').startsWith('compute.submit-job:')) {
        return postJson<any>('/runtime-demo/compute/submit-job', {
          approvalRequestId: approvalId,
        });
      }

      return { ok: true };
    });

    setActionMessage(`Approved ${shortId(approvalId)} and resumed execution`);
    if (sessionData?.session?._id) {
      await loadSession(sessionData.session._id);
      if (result?.visualAssetArtifactId) {
        setSelectedArtifactId(result.visualAssetArtifactId);
      }
    } else {
      await loadRecentSessions();
    }
  }

  useEffect(() => {
    void loadRecentSessions();
    void loadModelingDiagnostics();
    void loadModelingSkills();
    void loadComputeProfiles();
    void loadComputeDiagnostics();
    const requestedSessionId = searchParams.get('sessionId');
    const requestedArtifactId = searchParams.get('artifactId');
    if (requestedArtifactId) {
      setSelectedArtifactId(requestedArtifactId);
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    const initialSessionId = requestedSessionId || saved;
    if (!initialSessionId) {
      return;
    }
    setSessionIdInput(initialSessionId);
    void loadSession(initialSessionId);
  }, [searchParams]);

  useEffect(() => {
    const requestedArtifactId = searchParams.get('artifactId');
    if (!requestedArtifactId || !sessionData?.artifactViews?.length) {
      return;
    }
    const exists = sessionData.artifactViews.some((item) => item.artifact._id === requestedArtifactId);
    if (exists) {
      setSelectedArtifactId(requestedArtifactId);
    }
  }, [searchParams, sessionData]);

  useEffect(() => {
    if (!selectedArtifactId) {
      setArtifactDetail(null);
      setArtifactError(null);
      setRawPayload(null);
      setRawPayloadError(null);
      setSelectedComputeFileName(null);
      return;
    }
    setRawPayload(null);
    setRawPayloadError(null);
    setSelectedComputeFileName(null);
    void loadArtifactDetail(selectedArtifactId);
  }, [selectedArtifactId]);

  useEffect(() => {
    if (!artifactDetail?.artifact?._id) {
      return;
    }
    if (artifactDetail.artifact.kind !== 'compute_input_set') {
      return;
    }
    if (!artifactDetail.payloadInspection.materialized) {
      return;
    }
    if (rawPayload || loadingRawPayload || rawPayloadError) {
      return;
    }
    void loadRawPayload(artifactDetail.artifact._id);
  }, [artifactDetail, rawPayload, rawPayloadError, loadingRawPayload]);

  const selectedArtifactView = sessionData?.artifactViews.find((item) => item.artifact._id === selectedArtifactId) || null;
  const visualFiles = Array.isArray(artifactDetail?.payloadInspection?.jsonSummary?.files)
    ? artifactDetail?.payloadInspection?.jsonSummary?.files
    : [];
  const resultBundleSummary = isResultBundleSummary(artifactDetail?.payloadInspection?.jsonSummary)
    ? artifactDetail?.payloadInspection?.jsonSummary
    : null;
  const computeInputFiles = getComputeInputFiles(rawPayload);
  const selectedComputeFile = computeInputFiles.find((item) => item.name === selectedComputeFileName) || computeInputFiles[0] || null;
  const artifactById = new Map((sessionData?.artifacts || []).map((artifact) => [artifact._id, artifact]));
  const taskRunById = new Map((sessionData?.taskRuns || []).map((taskRun) => [taskRun._id, taskRun]));
  const latestComputeInputArtifact = [...(sessionData?.artifacts || [])]
    .reverse()
    .find((artifact) => artifact.kind === 'compute_input_set') || null;
  const latestResultBundleArtifact = [...(sessionData?.artifacts || [])]
    .reverse()
    .find((artifact) => artifact.kind === 'result_bundle') || null;
  const activeJobRun = [...(sessionData?.jobRuns || [])]
    .reverse()
    .find((jobRun) => isActiveComputeJobStatus(jobRun.status)) || null;
  const latestJobRun = [...(sessionData?.jobRuns || [])].reverse()[0] || null;
  const spotlightJobRun = activeJobRun || latestJobRun || null;
  const spotlightTaskRun = spotlightJobRun?.taskRunId ? taskRunById.get(spotlightJobRun.taskRunId) : null;
  const spotlightInputArtifact = (Array.isArray(spotlightTaskRun?.inputArtifacts) ? spotlightTaskRun.inputArtifacts : [])
    .map((artifactId: string) => artifactById.get(artifactId))
    .find((artifact: any) => artifact?.kind === 'compute_input_set')
    || latestComputeInputArtifact
    || null;
  const spotlightResultArtifact = spotlightJobRun?.resultArtifactId
    ? artifactById.get(spotlightJobRun.resultArtifactId)
    : latestResultBundleArtifact || null;
  const spotlightTimeline = spotlightJobRun ? buildComputeJobTimeline(spotlightJobRun) : [];
  const latestComputeGeneratedFiles = Array.isArray(latestComputeInputArtifact?.preview?.generatedFiles)
    ? latestComputeInputArtifact.preview.generatedFiles
    : [];

  useEffect(() => {
    if (computeInputFiles.length === 0) {
      setSelectedComputeFileName(null);
      return;
    }
    setSelectedComputeFileName((current) => {
      if (current && computeInputFiles.some((item) => item.name === current)) {
        return current;
      }
      return computeInputFiles[0].name;
    });
  }, [computeInputFiles]);

  const filteredEvents = (sessionData?.events || []).filter((event) => {
    if (eventCategoryFilter !== 'all' && event.category !== eventCategoryFilter) {
      return false;
    }
    if (!eventFilter.trim()) {
      return true;
    }
    const haystack = [
      event.type,
      event.category,
      event.producerType,
      JSON.stringify(event.payload || {}),
    ].join(' ').toLowerCase();
    return haystack.includes(eventFilter.trim().toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#F5F5F0] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-[30px] border border-white/80 bg-white/85 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#6274A2]">Runtime Cockpit</p>
              <h1 className="mt-1 text-3xl font-black text-[#0A1128]">Agent Runtime Inspector</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                直接查看 runtime demo 的 session、artifact、approval、job 和 event，不再只靠后端日志确认产物链。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate('/agent/rendering')}
                className="inline-flex items-center gap-2 rounded-[28px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <ArrowLeft size={14} />
                Back To Rendering
              </button>
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 rounded-[28px] bg-[#0A1128] px-4 py-2 text-sm font-bold text-white shadow-[0_12px_30px_rgba(10,17,40,0.18)] transition hover:bg-[#18233F]"
              >
                <Boxes size={14} />
                Platform Home
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="flex items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3">
              <Search size={16} className="text-slate-400" />
              <input
                value={sessionIdInput}
                onChange={(event) => setSessionIdInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void loadSession();
                  }
                }}
                placeholder="Paste runtime demo session id, e.g. sess_xxx"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            <button
              onClick={() => void loadSession()}
              disabled={loadingSession}
              className="inline-flex items-center justify-center gap-2 rounded-[24px] bg-[#173B7A] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingSession ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
              Load Session
            </button>
            <button
              onClick={() => void loadSession()}
              disabled={!sessionIdInput.trim() || loadingSession}
              className="inline-flex items-center justify-center gap-2 rounded-[24px] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          {sessionError ? (
            <div className="flex items-start gap-3 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Runtime session unavailable</p>
                <p className="mt-1 text-xs text-red-600">{sessionError}</p>
              </div>
            </div>
          ) : (
            <div className="rounded-[22px] border border-[#D9E6FF] bg-[#F4F8FF] px-4 py-3 text-xs text-[#395B9A]">
              需要后端启用 `ENABLE_AGENT_RUNTIME_DEMO=1`，并配置可用的 Mongo 与 Gemini 环境，才能真正看到 session 与产物沉淀。
            </div>
          )}
        </div>

        <Panel
          eyebrow="Recent Sessions"
          title="Recent Runtime Sessions"
          right={
            <button
              onClick={() => void loadRecentSessions(sessionData?.session?._id)}
              disabled={loadingRecentSessions}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingRecentSessions ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh List
            </button>
          }
        >
          {recentSessionsError ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              {recentSessionsError}
            </div>
          ) : loadingRecentSessions && recentSessions.length === 0 ? (
            <div className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              正在加载最近 session...
            </div>
          ) : recentSessions.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-3">
              {recentSessions.map((item) => {
                const isActive = sessionData?.session?._id === item.session._id;
                return (
                  <button
                    key={item.session._id}
                    onClick={() => void loadSession(item.session._id)}
                    className={`rounded-[22px] border p-4 text-left transition ${
                      isActive
                        ? 'border-[#224A91] bg-[#F4F8FF] shadow-[0_12px_30px_rgba(34,74,145,0.10)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Session</p>
                        <h3 className="mt-1 font-mono text-xs text-slate-700">{shortId(item.session._id)}</h3>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(item.session.status)}`}>
                        {item.session.status}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold text-slate-900">
                      {item.goalArtifact?.summary || 'No goal summary'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span>{item.summary?.artifactCount || 0} artifacts</span>
                      <span>{item.summary?.taskRunCount || 0} tasks</span>
                      <span>{item.summary?.approvalCount || 0} approvals</span>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500">
                      Last activity: {formatDate(item.session.lastActivityAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              还没有可浏览的 runtime sessions。先从 demo route 提交一个 goal，或者跑一次 rendering parse / compile / generate。
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Skill Catalog"
          title="Modeling Runtime Skills"
          right={
            <button
              onClick={() => void loadModelingSkills()}
              disabled={loadingModelingSkills}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingModelingSkills ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh Skills
            </button>
          }
        >
          {modelingSkillsError ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              {modelingSkillsError}
            </div>
          ) : loadingModelingSkills && modelingSkills.length === 0 ? (
            <div className="flex items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" />
              正在加载 modeling skill catalog...
            </div>
          ) : modelingSkills.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {modelingSkills.map((skill) => (
                <div
                  key={`${skill.skillId}:${skill.version}`}
                  className="rounded-[22px] border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                        {skill.display?.domain || 'skill'}
                      </p>
                      <h3 className="mt-1 text-sm font-black text-slate-900">{skill.skillId}</h3>
                      <p className="mt-2 text-xs text-slate-500">
                        {skill.display?.summary || 'No skill summary'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(skill.status)}`}>
                        {skill.status || 'active'}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-mono text-slate-500">
                        v{skill.version}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(skill.display?.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[18px] bg-slate-50 px-3 py-3 text-[11px] text-slate-600">
                      <p className="font-bold uppercase tracking-[0.18em] text-slate-400">Artifacts</p>
                      <p className="mt-2">Inputs: {(skill.requiredArtifacts || []).join(', ') || 'none'}</p>
                      <p className="mt-1">Outputs: {(skill.outputArtifacts || []).join(', ') || 'none'}</p>
                    </div>
                    <div className="rounded-[18px] bg-slate-50 px-3 py-3 text-[11px] text-slate-600">
                      <p className="font-bold uppercase tracking-[0.18em] text-slate-400">Policies</p>
                      <p className="mt-2">Approval: {skill.approvalPolicy || 'none'}</p>
                      <p className="mt-1">Retry: {skill.retryPolicy || 'n/a'}</p>
                      <p className="mt-1">Failure: {skill.failurePolicy || 'n/a'}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[18px] border border-slate-200 bg-[#F8FAFD] px-3 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Execution Steps</p>
                    <div className="mt-2 space-y-2">
                      {(skill.steps || []).map((step) => (
                        <div key={step.id} className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                          <p className="font-mono text-slate-700">{step.id}</p>
                          <p className="mt-1">Tool: <span className="font-mono">{step.toolName}</span></p>
                          <p className="mt-1">Effect: <span className="font-mono">{step.effectType}</span> | onFailure: <span className="font-mono">{step.onFailure}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前还没有可展示的 modeling skill definitions。
            </div>
          )}
        </Panel>

        <Panel eyebrow="Quick Actions" title="Create, Parse, Build, Replan, Compile, Generate, Monitor">
          <div className="space-y-4">
            {actionError ? (
              <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            ) : null}
            {actionMessage ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {actionMessage}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-[#173B7A]" />
                  <h3 className="text-sm font-bold text-slate-900">Create Demo Session</h3>
                </div>
                <div className="mt-4 space-y-3">
                  <input
                    value={ownerIdInput}
                    onChange={(event) => setOwnerIdInput(event.target.value)}
                    placeholder="ownerId"
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white"
                  />
                  <input
                    value={projectIdInput}
                    onChange={(event) => setProjectIdInput(event.target.value)}
                    placeholder="projectId (optional)"
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white"
                  />
                  <textarea
                    value={goalPromptInput}
                    onChange={(event) => setGoalPromptInput(event.target.value)}
                    placeholder="Describe the goal you want the runtime to start with"
                    rows={4}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white"
                  />
                  <button
                    onClick={() => void handleCreateDemoSession()}
                    disabled={actionLoadingKey === 'create-session'}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#173B7A] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoadingKey === 'create-session' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Create Session
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Beaker size={16} className="text-[#173B7A]" />
                  <h3 className="text-sm font-bold text-slate-900">Parse Science Into Runtime</h3>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  如果已经选中了 session，会往当前 session 里继续追加；否则会用上面的 ownerId / projectId 新建 session。
                </p>
                <div className="mt-4 space-y-3">
                  <textarea
                    value={parseScienceTextInput}
                    onChange={(event) => setParseScienceTextInput(event.target.value)}
                    placeholder="Paste abstract, intro, result summary, or any science brief here..."
                    rows={6}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white"
                  />
                  <button
                    onClick={() => void handleParseScience()}
                    disabled={actionLoadingKey === 'parse-science'}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#0A1128] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#18233F] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoadingKey === 'parse-science' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    Parse Science
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Boxes size={16} className="text-[#173B7A]" />
                  <h3 className="text-sm font-bold text-slate-900">Build Modeling Structure</h3>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  这条链会先解析自然语言建模意图，再用 provider registry 按顺序搜索结构数据库，最终沉淀一个 `structure artifact`。
                </p>
                <div className="mt-4 space-y-3">
                  <textarea
                    value={modelingPromptInput}
                    onChange={(event) => setModelingPromptInput(event.target.value)}
                    placeholder="e.g. build a Cu(111) slab using Materials Project first, then Atomly/CSD/ICSD if unavailable"
                    rows={5}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white"
                  />
                  <input
                    value={modelingProvidersInput}
                    onChange={(event) => setModelingProvidersInput(event.target.value)}
                    placeholder="materials_project,atomly,csd,icsd,optimade,fallback"
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white"
                  />
                  <button
                    onClick={() => void handleBuildModelingStructure()}
                    disabled={actionLoadingKey === 'build-modeling-structure'}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#173B7A] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoadingKey === 'build-modeling-structure' ? <Loader2 size={16} className="animate-spin" /> : <Boxes size={16} />}
                    Build Structure
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-[#173B7A]" />
                  <h3 className="text-sm font-bold text-slate-900">Active Session Actions</h3>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  当前 session: {sessionData?.session?._id ? shortId(sessionData.session._id) : 'none selected'}
                </p>
                <div className="mt-4 space-y-3">
                  <textarea
                    value={replanPromptInput}
                    onChange={(event) => setReplanPromptInput(event.target.value)}
                    placeholder="New goal for replan..."
                    rows={3}
                    disabled={!sessionData?.session?._id}
                    className="w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#224A91] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      value={computeWorkflowInput}
                      onChange={(event) => setComputeWorkflowInput(event.target.value as 'relax' | 'static')}
                      disabled={!sessionData?.session?._id}
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="relax">workflow: relax</option>
                      <option value="static">workflow: static</option>
                    </select>
                    <select
                      value={computeQualityInput}
                      onChange={(event) => setComputeQualityInput(event.target.value as 'fast' | 'standard' | 'high')}
                      disabled={!sessionData?.session?._id}
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="fast">quality: fast</option>
                      <option value="standard">quality: standard</option>
                      <option value="high">quality: high</option>
                    </select>
                    <select
                      value={computeProfileInput}
                      onChange={(event) => setComputeProfileInput(event.target.value)}
                      disabled={!sessionData?.session?._id || computeProfiles.length === 0}
                      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {computeProfiles.length > 0 ? computeProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id} disabled={!profile.configured}>
                          profile: {profile.id}{profile.configured ? '' : ' (unconfigured)'}
                        </option>
                      )) : (
                        <option value="local_demo">profile: local_demo</option>
                      )}
                    </select>
                  </div>
                  {computeProfilesError ? (
                    <p className="text-xs text-amber-700">{computeProfilesError}</p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <button
                      onClick={() => void handleCompileComputeInputSet()}
                      disabled={!sessionData?.session?._id || actionLoadingKey === 'compile-input-set'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'compile-input-set' ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
                      Compile Input Set
                    </button>
                    <button
                      onClick={() => void handleSubmitComputeJob()}
                      disabled={!sessionData?.session?._id || actionLoadingKey === 'submit-compute-job'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'submit-compute-job' ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
                      Submit Compute Job
                    </button>
                    <button
                      onClick={() => void handleRunServerLocalSmoke()}
                      disabled={actionLoadingKey === 'run-server-local-smoke'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-[#BFD1F3] bg-[#F4F8FF] px-4 py-3 text-sm font-semibold text-[#173B7A] transition hover:bg-[#E8F0FF] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'run-server-local-smoke' ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
                      Run Server-Local Smoke
                    </button>
                    <button
                      onClick={() => void handleReplanSession()}
                      disabled={!sessionData?.session?._id || actionLoadingKey === 'replan'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'replan' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Replan
                    </button>
                    <button
                      onClick={() => void handleCompilePrompt()}
                      disabled={!sessionData?.session?._id || actionLoadingKey === 'compile-prompt'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'compile-prompt' ? <Loader2 size={14} className="animate-spin" /> : <FileJson size={14} />}
                      Compile Prompt
                    </button>
                    <button
                      onClick={() => void handleSubmitMockJob()}
                      disabled={!sessionData?.session?._id || actionLoadingKey === 'submit-mock-job'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'submit-mock-job' ? <Loader2 size={14} className="animate-spin" /> : <Workflow size={14} />}
                      Submit Mock Job
                    </button>
                    <button
                      onClick={() => void handleGenerateImage()}
                      disabled={!sessionData?.session?._id || actionLoadingKey === 'generate-image'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[#173B7A] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#224A91] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'generate-image' ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                      Generate Image
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Beaker size={16} className="text-[#173B7A]" />
                      <h3 className="text-sm font-bold text-slate-900">Compute Readiness</h3>
                    </div>
                    <button
                      onClick={() => void loadComputeDiagnostics()}
                      disabled={loadingComputeDiagnostics}
                      className="inline-flex items-center gap-2 rounded-[14px] border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingComputeDiagnostics ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Refresh
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    这里会直接显示部署服务器上本地计算、POTCAR、Mongo、workers 以及远端调度器（Slurm / PBS）的就绪状态。
                  </p>
                  {computeDiagnosticsError ? (
                    <p className="mt-3 rounded-[16px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {computeDiagnosticsError}
                    </p>
                  ) : null}
                  {computeDiagnostics ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Server Local</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(computeDiagnostics.serverLocal?.ready ? 'ready' : 'invalid')}`}>
                              {computeDiagnostics.serverLocal?.ready ? 'Ready' : 'Blocked'}
                            </span>
                            <span className="text-xs text-slate-500">{computeDiagnostics.serverLocal?.profileId || 'server_local'}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600 break-all">
                            cmd: {computeDiagnostics.serverLocal?.commandProbe?.resolvedPath || computeDiagnostics.serverLocal?.command || 'not configured'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            shell: {computeDiagnostics.serverLocal?.shell || 'n/a'}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">POTCAR</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(computeDiagnostics.potcar?.ready ? 'ready' : 'invalid')}`}>
                              {computeDiagnostics.potcar?.ready ? 'Readable' : 'Missing'}
                            </span>
                            <span className="text-xs text-slate-500">{computeDiagnostics.potcar?.envKey || 'unset'}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600 break-all">
                            {computeDiagnostics.potcar?.libraryDir || 'No POTCAR library configured'}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Mongo</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(computeDiagnostics.mongo?.configured ? 'ready' : 'invalid')}`}>
                              {computeDiagnostics.mongo?.readyStateLabel || 'unknown'}
                            </span>
                            <span className="text-xs text-slate-500">{computeDiagnostics.mongo?.envKey || 'unset'}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            connected: {computeDiagnostics.mongo?.connected ? 'yes' : 'no'}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Workers</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(computeDiagnostics.workers?.enabled ? 'ready' : 'pending')}`}>
                              {computeDiagnostics.workers?.enabled ? 'Enabled' : 'Manual Only'}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            job monitor: {computeDiagnostics.workers?.intervals?.jobMonitorIntervalMs ?? 'n/a'} ms
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            harvest: {computeDiagnostics.workers?.intervals?.harvestIntervalMs ?? 'n/a'} ms
                          </p>
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Slurm</p>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(computeDiagnostics.slurm?.ready ? 'ready' : (computeDiagnostics.slurm?.configured ? 'partial' : 'pending'))}`}>
                            {computeDiagnostics.slurm?.ready ? 'Ready' : (computeDiagnostics.slurm?.configured ? 'Partial' : 'Unconfigured')}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          partition: {computeDiagnostics.slurm?.partition || 'unset'} | executable: {computeDiagnostics.slurm?.executable || 'unset'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 break-all">
                          sbatch: {computeDiagnostics.slurm?.commands?.sbatch?.resolvedPath || 'missing'} | squeue: {computeDiagnostics.slurm?.commands?.squeue?.resolvedPath || 'missing'} | sacct: {computeDiagnostics.slurm?.commands?.sacct?.resolvedPath || 'missing'}
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">PBS</p>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badgeClass(computeDiagnostics.pbs?.ready ? 'ready' : (computeDiagnostics.pbs?.configured ? 'partial' : 'pending'))}`}>
                            {computeDiagnostics.pbs?.ready ? 'Ready' : (computeDiagnostics.pbs?.configured ? 'Partial' : 'Unconfigured')}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">
                          queue: {computeDiagnostics.pbs?.queue || 'unset'} | executable: {computeDiagnostics.pbs?.executable || 'unset'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 break-all">
                          qsub: {computeDiagnostics.pbs?.commands?.qsub?.resolvedPath || 'missing'} | qstat: {computeDiagnostics.pbs?.commands?.qstat?.resolvedPath || 'missing'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 break-all">
                          ssh: {computeDiagnostics.pbs?.remoteSsh?.host || 'unset'}:{computeDiagnostics.pbs?.remoteSsh?.port ?? 'n/a'} | key: {computeDiagnostics.pbs?.remoteSsh?.keyReadable ? 'readable' : 'missing'}
                        </p>
                      </div>

                      <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Open Issues</p>
                        {Array.isArray(computeDiagnostics.issues) && computeDiagnostics.issues.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {computeDiagnostics.issues.map((issue) => (
                              <p key={issue} className="text-xs text-amber-700">{issue}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-emerald-700">No blocking diagnostics found.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-[#173B7A]" />
                    <h3 className="text-sm font-bold text-slate-900">Maintenance Actions</h3>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    手动触发后台维护链，验证 approval 过期处理和 completed-but-not-materialized 的 lagging 检查。
                  </p>
                  <div className="mt-4 grid gap-3">
                    <button
                      onClick={() => void handleRunJobMonitor()}
                      disabled={actionLoadingKey === 'run-job-monitor'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'run-job-monitor' ? <Loader2 size={14} className="animate-spin" /> : <Workflow size={14} />}
                      Run Job Monitor
                    </button>
                    <button
                      onClick={() => void handleRunApprovalSweeper()}
                      disabled={actionLoadingKey === 'run-approval-sweeper'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'run-approval-sweeper' ? <Loader2 size={14} className="animate-spin" /> : <Clock3 size={14} />}
                      Run Approval Sweeper
                    </button>
                    <button
                      onClick={() => void handleRunHarvestMonitor()}
                      disabled={actionLoadingKey === 'run-harvest-monitor'}
                      className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === 'run-harvest-monitor' ? <Loader2 size={14} className="animate-spin" /> : <Workflow size={14} />}
                      Run Harvest Monitor
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-dashed border-[#C9D7F2] bg-[#F6F9FF] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#6274A2]">Usage Note</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>1. 先 `Create Session` 或直接 `Parse Science`。</p>
                    <p>2. 有 structured report 后点 `Compile Prompt`。</p>
                    <p>3. 点 `Generate Image` 会先触发 approval-gated runtime flow。</p>
                    <p>4. Pending approval 可以在下方直接 `Approve & Run` 或 `Reject`。</p>
                    <p>5. 建模现在可以直接走 provider 顺序：Materials Project / Atomly / CSD / ICSD / OPTIMADE / fallback。</p>
                    <p>6. 选中一个 `structure artifact` 后点 `Compile Input Set`，会直接生成 `compute_input_set artifact`。</p>
                    <p>7. `Run Server-Local Smoke` 会自动串起 modeling build、compile input set 和 server_local submit。</p>
                    <p>8. 选中一个 `compute_input_set artifact` 后点 `Submit Compute Job`，会走 approval-aware submit。</p>
                    <p>9. approval 通过后再跑 `Run Job Monitor`，会自动推进到 `result_bundle` materialization。</p>
                    <p>10. 也可以保留 `Submit Mock Job` 作为最轻量的异步链验证。</p>
                    <p>11. Maintenance actions 可手动验证后台 sweeper / monitor 的 runtime 行为。</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Modeling Sources"
          title="Modeling Providers & Engine Health"
          right={
            <button
              onClick={() => void loadModelingDiagnostics()}
              disabled={loadingModelingDiagnostics}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingModelingDiagnostics ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh Diagnostics
            </button>
          }
        >
          {modelingDiagnosticsError ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
              {modelingDiagnosticsError}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(modelingDiagnostics?.providers || []).map((provider) => (
                  <div
                    key={provider.provider}
                    className="rounded-[20px] border border-slate-200 bg-white px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Provider</p>
                        <h3 className="mt-1 text-sm font-bold text-slate-900">{provider.label}</h3>
                      </div>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${provider.configured ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                        {provider.configured ? 'configured' : 'not ready'}
                      </span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">mode: {provider.mode || 'n/a'}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <Beaker size={16} className="text-[#173B7A]" />
                  <h3 className="text-sm font-bold text-slate-900">Modeling Python Runtime</h3>
                </div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Health</p>
                      <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${modelingDiagnostics?.engineHealth?.healthy ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {modelingDiagnostics?.engineHealth?.healthy ? 'healthy' : 'degraded'}
                      </span>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Python</p>
                      <p className="mt-2 text-xs text-slate-700">{modelingDiagnostics?.engineHealth?.pythonVersion || 'n/a'}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">NumPy</p>
                      <p className="mt-2 text-xs text-slate-700">{modelingDiagnostics?.engineHealth?.numpyVersion || 'n/a'}</p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Pymatgen</p>
                      <p className="mt-2 text-xs text-slate-700">{modelingDiagnostics?.engineHealth?.pymatgenVersion || 'n/a'}</p>
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Executable</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-slate-700">
                      {modelingDiagnostics?.engineHealth?.pythonExecutable || 'n/a'}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">CSD Python API</p>
                    <p className="mt-2 text-xs text-slate-700">
                      {modelingDiagnostics?.engineHealth?.ccdcAvailable ? 'available' : 'not installed'}
                    </p>
                  </div>
                  {Array.isArray(modelingDiagnostics?.engineHealth?.issues) && modelingDiagnostics.engineHealth.issues.length > 0 ? (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      {modelingDiagnostics.engineHealth.issues.map((issue, index) => (
                        <p key={`${issue}-${index}`}>{issue}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </Panel>

        {sessionData ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard icon={<Database size={16} />} label="Artifacts" value={sessionData.summary?.artifactCount || 0} tone="blue" />
              <StatCard icon={<Workflow size={16} />} label="Task Runs" value={sessionData.summary?.taskRunCount || 0} tone="slate" />
              <StatCard icon={<ShieldCheck size={16} />} label="Approvals" value={sessionData.summary?.approvalCount || 0} tone="amber" />
              <StatCard icon={<ImageIcon size={16} />} label="Job Runs" value={sessionData.summary?.jobRunCount || 0} tone="slate" />
              <StatCard icon={<Clock3 size={16} />} label="Events" value={sessionData.summary?.eventCount || 0} tone="emerald" />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <Panel eyebrow="Compute" title="Active Compute">
                {spotlightJobRun ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-slate-500">{shortId(spotlightJobRun._id)}</p>
                        <p className="mt-2 text-sm text-slate-600">{getComputeJobHint(spotlightJobRun)}</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${getComputeJobBadgeClass(spotlightJobRun.status)}`}>
                        {getComputeJobStatusLabel(spotlightJobRun.status)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {spotlightTimeline.map((step) => (
                        <span
                          key={step.key}
                          className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${computeTimelineClass(step.state)}`}
                        >
                          {step.label}
                        </span>
                      ))}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-xs text-slate-600">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Execution</p>
                        <div className="mt-2 space-y-1.5">
                          <p><span className="font-semibold text-slate-800">System:</span> {spotlightJobRun.system || 'n/a'}</p>
                          <p><span className="font-semibold text-slate-800">Scheduler:</span> {spotlightJobRun.schedulerRef || 'n/a'}</p>
                          <p><span className="font-semibold text-slate-800">External Job:</span> {spotlightJobRun.externalJobId || 'n/a'}</p>
                          <p><span className="font-semibold text-slate-800">Materialization:</span> {spotlightJobRun.materializationStatus || 'n/a'}</p>
                          <p><span className="font-semibold text-slate-800">Heartbeat:</span> {formatDate(spotlightJobRun.lastHeartbeatAt)}</p>
                        </div>
                      </div>

                      <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-xs text-slate-600">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workdir</p>
                        <p className="mt-2 break-all font-mono text-[11px] text-slate-700">{spotlightJobRun.snapshotRef || 'n/a'}</p>
                        {spotlightTaskRun ? (
                          <p className="mt-3 text-[11px] text-slate-500">
                            task {shortId(spotlightTaskRun._id)} · {spotlightTaskRun.skillId}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Input Set</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">{spotlightInputArtifact?.summary || 'No compute_input_set linked yet'}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {spotlightInputArtifact
                                ? `${spotlightInputArtifact.preview?.workflow || 'n/a'} · ${spotlightInputArtifact.preview?.quality || 'n/a'} · ${spotlightInputArtifact.preview?.formula || 'n/a'}`
                                : 'Compile an input set to make the calculation files inspectable here.'}
                            </p>
                          </div>
                          {spotlightInputArtifact ? (
                            <button
                              onClick={() => setSelectedArtifactId(spotlightInputArtifact._id)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              <FileJson size={12} />
                              Open
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Result Bundle</p>
                            <p className="mt-2 text-sm font-bold text-slate-900">{spotlightResultArtifact?.summary || 'No result bundle yet'}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {spotlightResultArtifact
                                ? `${spotlightResultArtifact.status || 'n/a'} · ${spotlightResultArtifact.lifecycleStage || 'n/a'}`
                                : 'This session is still before materialization, which is expected while the calculation remains active.'}
                            </p>
                          </div>
                          {spotlightResultArtifact ? (
                            <button
                              onClick={() => setSelectedArtifactId(spotlightResultArtifact._id)}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              <Beaker size={12} />
                              Open
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No compute job is visible in this session yet. Compile a `compute_input_set` and submit it to leave the runtime in a visible computing state.
                  </div>
                )}
              </Panel>

              <Panel eyebrow="Compute" title="Latest Input Set">
                {latestComputeInputArtifact ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{latestComputeInputArtifact.summary || 'Latest compute_input_set'}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {latestComputeInputArtifact.preview?.workflow || 'n/a'} · {latestComputeInputArtifact.preview?.quality || 'n/a'} · {latestComputeInputArtifact.preview?.formula || 'n/a'}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedArtifactId(latestComputeInputArtifact._id)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                      >
                        <FileJson size={12} />
                        Open Files
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-xs text-slate-600">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">K-Point Grid</p>
                        <p className="mt-2 text-sm font-bold text-slate-900">{latestComputeInputArtifact.preview?.kpointGrid || 'n/a'}</p>
                      </div>
                      <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-xs text-slate-600">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">POTCAR Symbols</p>
                        <p className="mt-2 text-sm font-bold text-slate-900">
                          {Array.isArray(latestComputeInputArtifact.preview?.potcarSymbols) && latestComputeInputArtifact.preview.potcarSymbols.length > 0
                            ? latestComputeInputArtifact.preview.potcarSymbols.join(', ')
                            : 'n/a'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Generated Files</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {latestComputeGeneratedFiles.length > 0 ? latestComputeGeneratedFiles.map((fileName: string) => (
                          <span
                            key={fileName}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                          >
                            {fileName}
                          </span>
                        )) : (
                          <span className="text-xs text-slate-500">No generated file summary yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                    No compute input set has been compiled in this session yet.
                  </div>
                )}
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="flex flex-col gap-6">
                <Panel
                  eyebrow="Session"
                  title="Session Snapshot"
                  right={sessionData.session._id ? (
                    <button
                      onClick={() => copyText(sessionData.session._id)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                    >
                      <Copy size={12} />
                      Copy Id
                    </button>
                  ) : null}
                >
                  <div className="space-y-3 text-sm text-slate-600">
                    <div className="rounded-[20px] bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Session Id</p>
                      <p className="mt-2 font-mono text-xs text-slate-700">{sessionData.session._id}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-[20px] border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Status</p>
                        <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(sessionData.session.status)}`}>
                          {sessionData.session.status}
                        </span>
                      </div>
                      <div className="rounded-[20px] border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Active Plan</p>
                        <p className="mt-2 font-mono text-xs text-slate-700">{shortId(sessionData.session.activePlanArtifactId)}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-[20px] border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Created</p>
                        <p className="mt-2 text-xs text-slate-700">{formatDate(sessionData.session.createdAt)}</p>
                      </div>
                      <div className="rounded-[20px] border border-slate-200 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Last Activity</p>
                        <p className="mt-2 text-xs text-slate-700">{formatDate(sessionData.session.lastActivityAt)}</p>
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel eyebrow="Artifacts" title="Artifact Timeline">
                  <div className="space-y-3">
                    {sessionData.artifactViews.map((item) => {
                      const isSelected = item.artifact._id === selectedArtifactId;
                      const artifactType = item.artifact.preview?.artifactType || item.artifact.kind;
                      return (
                        <button
                          key={item.artifact._id}
                          onClick={() => setSelectedArtifactId(item.artifact._id)}
                          className={`w-full rounded-[22px] border p-4 text-left transition ${
                            isSelected
                              ? 'border-[#224A91] bg-[#F4F8FF] shadow-[0_12px_30px_rgba(34,74,145,0.10)]'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{artifactType}</p>
                              <h3 className="mt-1 text-sm font-bold text-slate-900">{item.artifact.summary || item.artifact.kind}</h3>
                              <p className="mt-2 font-mono text-[11px] text-slate-500">{shortId(item.artifact._id)}</p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(item.artifact.status)}`}>
                              {item.artifact.status || 'unknown'}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            <span className={`rounded-full border px-2.5 py-1 ${item.payloadInspection.materialized ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                              {item.payloadInspection.materialized ? 'materialized' : item.payloadInspection.storageKind}
                            </span>
                            {item.artifact.lifecycleStage ? (
                              <span className={`rounded-full border px-2.5 py-1 ${badgeClass(item.artifact.lifecycleStage)}`}>
                                {item.artifact.lifecycleStage}
                              </span>
                            ) : null}
                            {item.artifact.latestInLineage ? (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">latest</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Panel>
              </div>

              <div className="flex flex-col gap-6">
                <Panel
                  eyebrow="Inspector"
                  title={artifactDetail?.artifact?.summary || selectedArtifactView?.artifact?.summary || 'Artifact Detail'}
                  right={selectedArtifactId ? (
                    <button
                      onClick={() => copyText(selectedArtifactId)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                    >
                      <Copy size={12} />
                      Copy Artifact Id
                    </button>
                  ) : null}
                >
                  {!selectedArtifactId ? (
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                      先从左侧 artifact timeline 里选择一个产物。
                    </div>
                  ) : loadingArtifact ? (
                    <div className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      <Loader2 size={16} className="animate-spin" />
                      正在加载 artifact inspector...
                    </div>
                  ) : artifactError ? (
                    <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                      {artifactError}
                    </div>
                  ) : artifactDetail ? (
                    <div className="space-y-5">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-[22px] bg-slate-50 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Artifact</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <div className="flex items-center justify-between gap-3">
                              <span>Kind</span>
                              <span className="font-semibold text-slate-900">{artifactDetail.artifact.kind}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Status</span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(artifactDetail.artifact.status)}`}>
                                {artifactDetail.artifact.status || 'n/a'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Lifecycle</span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(artifactDetail.artifact.lifecycleStage)}`}>
                                {artifactDetail.artifact.lifecycleStage || 'n/a'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Produced By</span>
                              <span className="font-mono text-xs text-slate-700">{shortId(artifactDetail.artifact.producedByTaskRun)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[22px] bg-[#F8FAFD] p-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Payload</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <div className="flex items-center justify-between gap-3">
                              <span>Storage</span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${artifactDetail.payloadInspection.materialized ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                {artifactDetail.payloadInspection.storageKind}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Exists</span>
                              <span className="font-semibold text-slate-900">{artifactDetail.payloadInspection.exists ? 'yes' : 'no'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Blob Size</span>
                              <span className="font-semibold text-slate-900">{formatBytes(artifactDetail.payloadInspection.blobSizeBytes)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>On Disk</span>
                              <span className="font-semibold text-slate-900">{formatBytes(artifactDetail.payloadInspection.diskSizeBytes)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Payload Ref</p>
                        <p className="mt-2 break-all font-mono text-xs text-slate-600">{artifactDetail.payloadInspection.payloadRef || 'n/a'}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => void loadRawPayload(artifactDetail.artifact._id)}
                            disabled={loadingRawPayload || !artifactDetail.payloadInspection.materialized}
                            className="inline-flex items-center gap-2 rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {loadingRawPayload ? <Loader2 size={13} className="animate-spin" /> : <FileJson size={13} />}
                            Load Raw Payload
                          </button>
                          {artifactDetail.payloadInspection.materialized ? null : (
                            <span className="inline-flex items-center rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                              draft payloads cannot be opened as raw JSON yet
                            </span>
                          )}
                        </div>
                      </div>

                      {resultBundleSummary ? (
                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Compute Result Summary</p>
                              <p className="mt-1 text-sm text-slate-500">
                                从 harvested `result_bundle` 提取的关键计算指标与输出可用性。
                              </p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(resultBundleSummary.metrics?.converged ? 'ready' : (resultBundleSummary.warningCount > 0 ? 'partial' : 'queued'))}`}>
                              {resultBundleSummary.metrics?.converged ? 'converged' : (resultBundleSummary.warningCount > 0 ? 'needs review' : 'incomplete')}
                            </span>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[18px] bg-slate-50 px-3 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Energy</p>
                              <p className="mt-2 text-lg font-black text-slate-900">
                                {formatMetric(resultBundleSummary.metrics?.totalEnergyEv, 6)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">eV</p>
                            </div>
                            <div className="rounded-[18px] bg-slate-50 px-3 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Ionic Steps</p>
                              <p className="mt-2 text-lg font-black text-slate-900">
                                {resultBundleSummary.metrics?.ionicStepCount ?? 'n/a'}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">elapsed {resultBundleSummary.metrics?.elapsedSeconds ?? 'n/a'} s</p>
                            </div>
                            <div className="rounded-[18px] bg-slate-50 px-3 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Max Force</p>
                              <p className="mt-2 text-lg font-black text-slate-900">
                                {formatMetric(resultBundleSummary.metrics?.maxForceEvPerA, 5)}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">eV/A</p>
                            </div>
                            <div className="rounded-[18px] bg-slate-50 px-3 py-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Warnings</p>
                              <p className="mt-2 text-lg font-black text-slate-900">
                                {resultBundleSummary.warningCount ?? 0}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">exit {resultBundleSummary.metrics?.exitCode ?? 'n/a'}</p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Execution</p>
                              <div className="mt-2 space-y-1">
                                <p><span className="font-semibold text-slate-800">Type:</span> {resultBundleSummary.resultType || 'n/a'}</p>
                                <p><span className="font-semibold text-slate-800">Profile:</span> {resultBundleSummary.profileId || 'n/a'}</p>
                                <p><span className="font-semibold text-slate-800">System:</span> {resultBundleSummary.system || 'n/a'}</p>
                                <p><span className="font-semibold text-slate-800">Mode:</span> {resultBundleSummary.execution?.mode || 'n/a'}</p>
                                <p><span className="font-semibold text-slate-800">Completed:</span> {formatDate(resultBundleSummary.completedAt)}</p>
                              </div>
                            </div>

                            <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Detected Outputs</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(resultBundleSummary.detectedOutputs || {}).map(([key, present]) => (
                                  <span
                                    key={key}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${present ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                                  >
                                    {key}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-3 text-[11px] text-slate-500">
                                harvested files: {resultBundleSummary.harvestedFileCount ?? 0} | input files: {resultBundleSummary.inputFileCount ?? 0}
                              </p>
                            </div>
                          </div>

                          {Array.isArray(resultBundleSummary.warnings) && resultBundleSummary.warnings.length > 0 ? (
                            <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Warnings</p>
                              <div className="mt-2 space-y-1">
                                {resultBundleSummary.warnings.map((warning: string) => (
                                  <p key={warning}>{warning}</p>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {artifactDetail.artifact.kind === 'compute_input_set' ? (
                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Calculation Files</p>
                              <p className="mt-1 text-sm text-slate-500">
                                Browser-side preview for the materialized VASP input set. This is enough to inspect normal calculation files before real compute is wired up.
                              </p>
                            </div>
                            <Beaker size={18} className="text-slate-400" />
                          </div>

                          {loadingRawPayload && computeInputFiles.length === 0 ? (
                            <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
                              <Loader2 size={16} className="animate-spin" />
                              Loading compute input payload...
                            </div>
                          ) : null}

                          {!loadingRawPayload && computeInputFiles.length === 0 ? (
                            <div className="mt-4 rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
                              This compute input set is materialized, but the file dictionary has not been loaded yet. Click <span className="font-semibold">Load Raw Payload</span> if needed.
                            </div>
                          ) : null}

                          {computeInputFiles.length > 0 ? (
                            <div className="mt-4 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                              <div className="space-y-2">
                                {computeInputFiles.map((file) => (
                                  <button
                                    key={file.name}
                                    onClick={() => setSelectedComputeFileName(file.name)}
                                    className={`flex w-full items-center justify-between rounded-[16px] border px-3 py-3 text-left transition ${
                                      selectedComputeFile?.name === file.name
                                        ? 'border-[#224A91] bg-[#F4F8FF] text-[#173B7A]'
                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div>
                                      <p className="text-sm font-bold">{file.name}</p>
                                      <p className="mt-1 text-[11px] opacity-70">{file.content.split('\n').length} lines</p>
                                    </div>
                                  </button>
                                ))}
                              </div>

                              <div className="rounded-[18px] border border-slate-200 bg-slate-950 px-4 py-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <p className="text-xs font-bold text-slate-100">{selectedComputeFile?.name || 'No file selected'}</p>
                                  {selectedComputeFile ? (
                                    <button
                                      onClick={() => copyText(selectedComputeFile.content)}
                                      className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800"
                                    >
                                      <Copy size={12} />
                                      Copy file
                                    </button>
                                  ) : null}
                                </div>
                                <pre className="max-h-[520px] overflow-auto text-[11px] leading-5 text-slate-100">
                                  {selectedComputeFile?.content || 'n/a'}
                                </pre>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {artifactDetail.payloadInspection.jsonSummary ? (
                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Payload Summary</p>
                          <pre className="mt-3 overflow-x-auto rounded-[18px] bg-slate-950 px-4 py-4 text-[11px] leading-5 text-slate-100">
                            {JSON.stringify(artifactDetail.payloadInspection.jsonSummary, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {rawPayloadError ? (
                        <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                          {rawPayloadError}
                        </div>
                      ) : null}

                      {rawPayload ? (
                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Raw Payload JSON</p>
                            <button
                              onClick={() => copyText(JSON.stringify(rawPayload, null, 2))}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
                            >
                              <Copy size={12} />
                              Copy JSON
                            </button>
                          </div>
                          <pre className="mt-3 max-h-[420px] overflow-auto rounded-[18px] bg-slate-950 px-4 py-4 text-[11px] leading-5 text-slate-100">
                            {JSON.stringify(rawPayload, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {visualFiles.length > 0 ? (
                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Visual Asset Preview</p>
                              <p className="mt-1 text-sm text-slate-500">从 runtime demo artifact file route 直接回放已 materialize 的图片。</p>
                            </div>
                            <ImageIcon size={18} className="text-slate-400" />
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {visualFiles.map((file: any) => (
                              <div key={file.name} className="overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50">
                                <img
                                  src={`${API_BASE_URL}/runtime-demo/artifacts/${encodeURIComponent(artifactDetail.artifact._id)}/files/${encodeURIComponent(file.name)}`}
                                  alt={file.name}
                                  className="aspect-[3/4] w-full object-cover"
                                />
                                <div className="space-y-1 px-3 py-3">
                                  <p className="truncate text-xs font-bold text-slate-800">{file.name}</p>
                                  <p className="text-[11px] text-slate-500">{file.mimeType} · {formatBytes(file.sizeBytes)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Lineage</p>
                          <div className="mt-3 space-y-3">
                            {artifactDetail.lineage.map((item) => (
                              <div key={item._id} className="rounded-[18px] bg-slate-50 px-3 py-3 text-sm text-slate-600">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-mono text-xs text-slate-500">{shortId(item._id)}</span>
                                  <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${item.latestInLineage ? 'border-blue-200 bg-blue-50 text-blue-700' : badgeClass(item.status)}`}>
                                    {item.latestInLineage ? `v${item.version} latest` : `v${item.version}`}
                                  </span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                  <span>{item.status || 'n/a'}</span>
                                  <span>·</span>
                                  <span>{item.lifecycleStage || 'n/a'}</span>
                                  <span>·</span>
                                  <span>{formatDate(item.createdAt)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-slate-200 px-4 py-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Producer Task Run</p>
                          {artifactDetail.producerTaskRun ? (
                            <div className="mt-3 rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-600">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-mono text-xs text-slate-500">{shortId(artifactDetail.producerTaskRun._id)}</span>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(artifactDetail.producerTaskRun.status)}`}>
                                  {artifactDetail.producerTaskRun.status}
                                </span>
                              </div>
                              <div className="mt-3 space-y-2">
                                <p><span className="font-semibold text-slate-800">Skill:</span> {artifactDetail.producerTaskRun.skillId}</p>
                                <p><span className="font-semibold text-slate-800">Step:</span> {artifactDetail.producerTaskRun.stepId}</p>
                                <p><span className="font-semibold text-slate-800">Attempt:</span> {artifactDetail.producerTaskRun.attempt}</p>
                                <p><span className="font-semibold text-slate-800">Terminal Reason:</span> {artifactDetail.producerTaskRun.terminalReason || 'n/a'}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
                              这个 artifact 目前没有 producer task run 信息。
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </Panel>

                <div className="grid gap-6 xl:grid-cols-3">
                  <Panel eyebrow="Execution" title="Task Runs">
                    <div className="space-y-3">
                      {sessionData.taskRuns.map((taskRun) => (
                        <div key={taskRun._id} className="rounded-[20px] border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{taskRun.skillId}</p>
                              <p className="mt-1 font-mono text-[11px] text-slate-500">{shortId(taskRun._id)}</p>
                            </div>
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(taskRun.status)}`}>
                              {taskRun.status}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                            <span>step: {taskRun.stepId}</span>
                            <span>attempt: {taskRun.attempt}</span>
                            {taskRun.terminalReason ? <span>reason: {taskRun.terminalReason}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>

                  <Panel eyebrow="Control" title="Approvals & Jobs">
                    <div className="space-y-5">
                      <div>
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Approvals</p>
                        <div className="space-y-3">
                          {sessionData.approvals.length > 0 ? sessionData.approvals.map((approval) => (
                            <div key={approval._id} className="rounded-[20px] border border-slate-200 px-4 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-mono text-[11px] text-slate-500">{shortId(approval._id)}</span>
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${badgeClass(approval.status)}`}>
                                  {approval.status}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-slate-700">{approval.reason}</p>
                              {approval.status === 'pending' ? (
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  <button
                                    onClick={() => void handleApproveAndResume(approval._id)}
                                    disabled={actionLoadingKey === `approve-${approval._id}`}
                                    className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {actionLoadingKey === `approve-${approval._id}` ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                    Approve & Run
                                  </button>
                                  <button
                                    onClick={() => void handleRejectApproval(approval._id)}
                                    disabled={actionLoadingKey === `reject-${approval._id}`}
                                    className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {actionLoadingKey === `reject-${approval._id}` ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                                    Reject
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )) : (
                            <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">No approvals in this session yet.</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Job Runs</p>
                        <div className="space-y-3">
                          {sessionData.jobRuns.length > 0 ? sessionData.jobRuns.map((jobRun) => (
                            (() => {
                              const sourceTaskRun = taskRunById.get(jobRun.taskRunId);
                              const sourceComputeInputArtifact = (Array.isArray(sourceTaskRun?.inputArtifacts) ? sourceTaskRun.inputArtifacts : [])
                                .map((artifactId: string) => artifactById.get(artifactId))
                                .find((artifact: any) => artifact?.kind === 'compute_input_set');
                              const resultArtifact = jobRun.resultArtifactId
                                ? artifactById.get(jobRun.resultArtifactId)
                                : null;
                              const timeline = buildComputeJobTimeline(jobRun);

                              return (
                                <div key={jobRun._id} className="rounded-[20px] border border-slate-200 px-4 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <span className="font-mono text-[11px] text-slate-500">{shortId(jobRun._id)}</span>
                                      <p className="mt-1 text-xs text-slate-500">{getComputeJobHint(jobRun)}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${getComputeJobBadgeClass(jobRun.status)}`}>
                                      {getComputeJobStatusLabel(jobRun.status)}
                                    </span>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {timeline.map((step) => (
                                      <span
                                        key={step.key}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${computeTimelineClass(step.state)}`}
                                      >
                                        {step.label}
                                      </span>
                                    ))}
                                  </div>

                                  <div className="mt-3 text-[11px] text-slate-500">
                                    system: {jobRun.system || 'n/a'} · materialization: {jobRun.materializationStatus || 'n/a'}
                                  </div>

                                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                    {jobRun.schedulerRef ? <span>scheduler: {jobRun.schedulerRef}</span> : null}
                                    {jobRun.externalJobId ? <span>external: {jobRun.externalJobId}</span> : null}
                                    {jobRun.snapshotRef ? <span>workdir: {shortId(jobRun.snapshotRef)}</span> : null}
                                    {jobRun.lastHeartbeatAt ? <span>heartbeat: {formatDate(jobRun.lastHeartbeatAt)}</span> : null}
                                  </div>

                                  <div className="mt-3 grid gap-2 text-[11px] text-slate-600">
                                    <div className="rounded-[16px] bg-slate-50 px-3 py-3">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Input Set</p>
                                      {sourceComputeInputArtifact ? (
                                        <div className="mt-2 flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-slate-800">{sourceComputeInputArtifact.summary || 'compute_input_set'}</p>
                                            <p className="mt-1 text-slate-500">{sourceComputeInputArtifact.preview?.workflow || 'n/a'} · {sourceComputeInputArtifact.preview?.quality || 'n/a'}</p>
                                          </div>
                                          <button
                                            onClick={() => setSelectedArtifactId(sourceComputeInputArtifact._id)}
                                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-white"
                                          >
                                            <FileJson size={12} />
                                            Open
                                          </button>
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-slate-500">No linked compute_input_set artifact found on the submit task.</p>
                                      )}
                                    </div>

                                    <div className="rounded-[16px] bg-slate-50 px-3 py-3">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Result Bundle</p>
                                      {resultArtifact ? (
                                        <div className="mt-2 flex items-start justify-between gap-3">
                                          <div>
                                            <p className="font-semibold text-slate-800">{resultArtifact.summary || 'result_bundle'}</p>
                                            <p className="mt-1 text-slate-500">{resultArtifact.status || 'n/a'} · {resultArtifact.lifecycleStage || 'n/a'}</p>
                                          </div>
                                          <button
                                            onClick={() => setSelectedArtifactId(resultArtifact._id)}
                                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-white"
                                          >
                                            <Beaker size={12} />
                                            Open
                                          </button>
                                        </div>
                                      ) : (
                                        <p className="mt-2 text-slate-500">
                                          {String(jobRun.materializationStatus || '').toLowerCase() === 'materialized'
                                            ? 'Result artifact is not linked yet.'
                                            : 'No result bundle yet. This is expected while the calculation is still in progress.'}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()
                          )) : (
                            <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">No job runs yet. Compile a compute input set and submit it to leave the session in a visible computing state.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Panel>

                  <Panel eyebrow="Observability" title="Recent Events">
                    <div className="space-y-4">
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                          <select
                            value={eventCategoryFilter}
                            onChange={(event) => setEventCategoryFilter(event.target.value as 'all' | 'system' | 'domain')}
                            className="rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#224A91]"
                          >
                            <option value="all">All Events</option>
                            <option value="system">System</option>
                            <option value="domain">Domain</option>
                          </select>
                          <label className="flex items-center gap-2 rounded-[16px] border border-slate-200 bg-white px-3 py-2">
                            <Search size={14} className="text-slate-400" />
                            <input
                              value={eventFilter}
                              onChange={(event) => setEventFilter(event.target.value)}
                              placeholder="Filter by event type, producer, or payload"
                              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                            />
                          </label>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Showing {filteredEvents.length} / {sessionData.events.length} events
                        </div>
                      </div>
                      {filteredEvents.map((event) => (
                        <div key={event._id} className="rounded-[20px] border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-bold text-slate-900">{event.type}</p>
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${badgeClass(event.category)}`}>
                              {event.category}
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            {formatDate(event.ts)} · producer: {event.producerType || 'n/a'}
                          </div>
                        </div>
                      ))}
                      {filteredEvents.length === 0 ? (
                        <div className="rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
                          No events match the current filter.
                        </div>
                      ) : null}
                    </div>
                  </Panel>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default RuntimeInspector;
