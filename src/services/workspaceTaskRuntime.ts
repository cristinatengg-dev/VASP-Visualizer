import { API_BASE_URL } from '../config';

const RUNTIME_OWNER_STORAGE_KEY = 'sci-runtime-owner-v1';

export interface RuntimeWorkspaceTask<TSnapshot> {
  id: string;
  runtimeSessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  snapshotRevision: number;
  snapshot: TSnapshot;
}

export interface RuntimeIdentity {
  ownerId: string;
  token?: string;
}

export class RuntimeTaskRequestError<TSnapshot = unknown> extends Error {
  status: number;
  code?: string;
  task?: RuntimeWorkspaceTask<TSnapshot>;

  constructor(message: string, status: number, code?: string, task?: RuntimeWorkspaceTask<TSnapshot>) {
    super(message);
    this.name = 'RuntimeTaskRequestError';
    this.status = status;
    this.code = code;
    this.task = task;
  }
}

export const getRuntimeIdentity = (userId?: string | null): RuntimeIdentity => {
  const authenticatedOwner = String(userId || localStorage.getItem('vasp_user_id') || '').trim();
  if (authenticatedOwner) {
    return {
      ownerId: authenticatedOwner,
      token: localStorage.getItem('vasp_token') || undefined,
    };
  }

  let ownerId = localStorage.getItem(RUNTIME_OWNER_STORAGE_KEY) || '';
  if (!ownerId) {
    const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    ownerId = `local-${randomId}`;
    localStorage.setItem(RUNTIME_OWNER_STORAGE_KEY, ownerId);
  }
  return { ownerId };
};

async function runtimeRequest<TSnapshot, TResult>(
  path: string,
  identity: RuntimeIdentity,
  options: RequestInit = {},
): Promise<TResult> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(identity.token ? { Authorization: `Bearer ${identity.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new RuntimeTaskRequestError<TSnapshot>(
      payload?.error || `Runtime task request failed (${response.status})`,
      response.status,
      payload?.code,
      payload?.task,
    );
  }
  return payload as TResult;
}

export async function listRuntimeWorkspaceTasks<TSnapshot>(
  identity: RuntimeIdentity,
): Promise<RuntimeWorkspaceTask<TSnapshot>[]> {
  const query = new URLSearchParams({ ownerId: identity.ownerId, projectId: 'workspace-agent' });
  const payload = await runtimeRequest<TSnapshot, { tasks: RuntimeWorkspaceTask<TSnapshot>[] }>(
    `/agent/harness/workspace/tasks?${query.toString()}`,
    identity,
  );
  return payload.tasks || [];
}

export async function createRuntimeWorkspaceTask<TSnapshot>(
  identity: RuntimeIdentity,
  task: { id: string; title: string; snapshot: TSnapshot },
): Promise<RuntimeWorkspaceTask<TSnapshot>> {
  const payload = await runtimeRequest<TSnapshot, { task: RuntimeWorkspaceTask<TSnapshot> }>(
    '/agent/harness/workspace/tasks',
    identity,
    {
      method: 'POST',
      body: JSON.stringify({
        ownerId: identity.ownerId,
        projectId: 'workspace-agent',
        clientTaskId: task.id,
        title: task.title,
        snapshot: task.snapshot,
      }),
    },
  );
  return payload.task;
}

export async function saveRuntimeWorkspaceTask<TSnapshot>(
  identity: RuntimeIdentity,
  task: { runtimeSessionId: string; title: string; snapshot: TSnapshot; snapshotRevision: number },
): Promise<RuntimeWorkspaceTask<TSnapshot>> {
  const payload = await runtimeRequest<TSnapshot, { task: RuntimeWorkspaceTask<TSnapshot> }>(
    `/agent/harness/workspace/tasks/${encodeURIComponent(task.runtimeSessionId)}`,
    identity,
    {
      method: 'PUT',
      body: JSON.stringify({
        ownerId: identity.ownerId,
        title: task.title,
        snapshot: task.snapshot,
        expectedRevision: task.snapshotRevision,
      }),
    },
  );
  return payload.task;
}

export async function setRuntimeWorkspaceTaskArchived<TSnapshot>(
  identity: RuntimeIdentity,
  runtimeSessionId: string,
  archived: boolean,
): Promise<RuntimeWorkspaceTask<TSnapshot>> {
  const payload = await runtimeRequest<TSnapshot, { task: RuntimeWorkspaceTask<TSnapshot> }>(
    `/agent/harness/workspace/tasks/${encodeURIComponent(runtimeSessionId)}/archive`,
    identity,
    {
      method: 'PATCH',
      body: JSON.stringify({ ownerId: identity.ownerId, archived }),
    },
  );
  return payload.task;
}

export async function deleteRuntimeWorkspaceTask(
  identity: RuntimeIdentity,
  runtimeSessionId: string,
): Promise<void> {
  await runtimeRequest<unknown, { success: boolean }>(
    `/agent/harness/workspace/tasks/${encodeURIComponent(runtimeSessionId)}`,
    identity,
    {
      method: 'DELETE',
      body: JSON.stringify({ ownerId: identity.ownerId }),
    },
  );
}
