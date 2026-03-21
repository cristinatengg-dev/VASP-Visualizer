import { useEffect, useState } from 'react';
import {
  MODELING_PROVIDER_OPTIONS,
  ModelingBuildMeta,
  ModelingDiagnosticsPayload,
  ModelingIntent,
  ModelingProviderName,
  ModelingRuntimeSessionSummary,
} from '../types/modeling';
import { useStore } from '../../../store/useStore';
import { API_BASE_URL } from '../../../config';
import type { Atom, MolecularStructure } from '../../../types';
import { getAtomProperties } from '../../../utils/atomData';

const MODELING_PROVIDER_SET = new Set<string>(MODELING_PROVIDER_OPTIONS);
const RUNTIME_SESSION_STORAGE_KEY = 'runtime_demo_session_id';

const humanizeModelingError = (message: string) => {
  const raw = String(message || '').trim();

  if (!raw) {
    return '建模请求暂时失败，请稍后再试。';
  }

  if (/GEMINI_API_KEY is not configured/i.test(raw)) {
    return '智能解析暂时不可用，请直接调整下方参数或稍后再试。';
  }

  if (/runtime demo route is unavailable/i.test(raw) || /Cannot POST .*runtime-demo/i.test(raw)) {
    return '运行时增强暂时不可用，系统已自动回退到标准建模流程。';
  }

  return raw.replace(/^HTTP\s+\d+:\s*/i, '');
};

export const useModeling = () => {
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ModelingDiagnosticsPayload | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [latestBuildMeta, setLatestBuildMeta] = useState<ModelingBuildMeta | null>(null);
  const [runtimeSession, setRuntimeSession] = useState<ModelingRuntimeSessionSummary | null>(null);
  const [runtimeSessionError, setRuntimeSessionError] = useState<string | null>(null);
  const [isLoadingRuntimeSession, setIsLoadingRuntimeSession] = useState(false);
  const setMolecularData = useStore(state => state.setMolecularData);
  const user = useStore(state => state.user);

  const normalizeAtoms = (raw: any): Atom[] => {
    const arr = Array.isArray(raw) ? raw : [];
    return arr.map((a, idx) => {
      const pos = a?.position || {};
      const x = typeof pos.x === 'number' ? pos.x : (typeof a?.x === 'number' ? a.x : 0);
      const y = typeof pos.y === 'number' ? pos.y : (typeof a?.y === 'number' ? a.y : 0);
      const z = typeof pos.z === 'number' ? pos.z : (typeof a?.z === 'number' ? a.z : 0);
      const element = typeof a?.element === 'string' ? a.element : (typeof a?.symbol === 'string' ? a.symbol : 'C');
      const defaults = getAtomProperties(element);
      return {
        id: typeof a?.id === 'string' ? a.id : `atom-${idx}`,
        element,
        position: { x, y, z },
        radius: typeof a?.radius === 'number' ? a.radius : defaults.radius,
        color: typeof a?.color === 'string' ? a.color : defaults.color,
        renderStyle: typeof a?.renderStyle === 'string' ? a.renderStyle : undefined,
      };
    });
  };

  const computeBoundingBox = (atoms: Atom[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const atom of atoms) {
      const { x, y, z } = atom.position;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    if (!Number.isFinite(minX)) {
      return {
        min: { x: -10, y: -10, z: -10 },
        max: { x: 10, y: 10, z: 10 },
      };
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  };

  // Ensure the URL is properly formatted for both local dev and production
  const getApiUrl = (endpoint: string) => {
    // If API_BASE_URL is a relative path, ensure it starts properly
    let base = API_BASE_URL;
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    if (!endpoint.startsWith('/')) {
      endpoint = '/' + endpoint;
    }
    return `${base}${endpoint}`;
  };

  const normalizeProviderPreferences = (value?: string[] | ModelingProviderName[]) => {
    const nextProviders: ModelingProviderName[] = [];
    const values = Array.isArray(value) ? value : [];

    for (const rawValue of values) {
      const provider = String(rawValue || '').trim().toLowerCase();
      if (MODELING_PROVIDER_SET.has(provider) && !nextProviders.includes(provider as ModelingProviderName)) {
        nextProviders.push(provider as ModelingProviderName);
      }
    }

    return nextProviders;
  };

  const loadDiagnostics = async () => {
    setIsLoadingDiagnostics(true);
    setDiagnosticsError(null);

    try {
      const response = await fetch(getApiUrl('/modeling/providers'));
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to load modeling diagnostics');
      }

      setDiagnostics({
        ...result,
        defaultOrder: normalizeProviderPreferences(result?.defaultOrder),
        providers: Array.isArray(result?.providers) ? result.providers : [],
      });
    } catch (err) {
      console.error('Diagnostics error detail:', err);
      setDiagnostics(null);
      setDiagnosticsError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    void loadDiagnostics();
  }, []);

  const loadRuntimeSession = async (sessionId?: string | null, options?: { silent?: boolean }) => {
    const targetSessionId = String(
      sessionId || (typeof window !== 'undefined' ? window.localStorage.getItem(RUNTIME_SESSION_STORAGE_KEY) : '') || ''
    ).trim();

    if (!targetSessionId) {
      setRuntimeSession(null);
      setRuntimeSessionError(null);
      return null;
    }

    setIsLoadingRuntimeSession(true);
    if (!options?.silent) {
      setRuntimeSessionError(null);
    }

    try {
      const response = await fetch(getApiUrl(`/runtime-demo/sessions/${encodeURIComponent(targetSessionId)}`));
      const rawText = await response.text();
      let result: any = null;
      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch (_error) {
        if (!response.ok && response.status === 404) {
          const message = 'Runtime demo route is unavailable on this server.';
          setRuntimeSession(null);
          if (!options?.silent) {
            setRuntimeSessionError(message);
          }
          return null;
        }
        throw new Error(rawText || 'Invalid runtime session response');
      }

      if (!response.ok || !result?.ok || !result?.session?._id) {
        throw new Error(result?.error || 'Failed to load runtime session');
      }

      const nextSession: ModelingRuntimeSessionSummary = {
        sessionId: result.session._id,
        status: result.session.status,
        activePlanArtifactId: result.session.activePlanArtifactId || null,
        primaryGoalArtifactId: result.session.primaryGoalArtifactId || null,
        artifactCount: result.summary?.artifactCount || 0,
        taskRunCount: result.summary?.taskRunCount || 0,
        jobRunCount: result.summary?.jobRunCount || 0,
        approvalCount: result.summary?.approvalCount || 0,
        eventCount: result.summary?.eventCount || 0,
        createdAt: result.session.createdAt || null,
        lastActivityAt: result.session.lastActivityAt || null,
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RUNTIME_SESSION_STORAGE_KEY, nextSession.sessionId);
      }
      setRuntimeSession(nextSession);
      setRuntimeSessionError(null);
      return nextSession;
    } catch (err) {
      setRuntimeSession(null);
      if (!options?.silent) {
        setRuntimeSessionError(err instanceof Error ? err.message : 'Failed to load runtime session');
      }
      return null;
    } finally {
      setIsLoadingRuntimeSession(false);
    }
  };

  const connectRuntimeSession = async (sessionId: string) => {
    const nextSessionId = String(sessionId || '').trim();
    if (!nextSessionId) {
      setRuntimeSessionError('Please enter a runtime session id');
      return null;
    }
    return loadRuntimeSession(nextSessionId);
  };

  const clearRuntimeSession = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(RUNTIME_SESSION_STORAGE_KEY);
    }
    setRuntimeSession(null);
    setRuntimeSessionError(null);
  };

  useEffect(() => {
    void loadRuntimeSession(undefined, { silent: true });
  }, []);

  const parseIntent = async (
    prompt: string,
    providerPreferences?: ModelingProviderName[],
  ): Promise<ModelingIntent | null> => {
    setIsBuilding(true);
    setError(null);
    const url = getApiUrl('/modeling/parse-intent');
    console.log('Modeling parseIntent URL:', url);
    try {
      const normalizedProviders = normalizeProviderPreferences(providerPreferences);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          providerPreferences: normalizedProviders,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let serverMessage = errText;
        try {
          const parsed = errText ? JSON.parse(errText) : null;
          serverMessage = parsed?.error || parsed?.message || errText;
        } catch (_error) {
          serverMessage = errText;
        }
        throw new Error(serverMessage || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setError(null);
        return {
          ...result.intent,
          provider_preferences: normalizeProviderPreferences(
            result?.intent?.provider_preferences || normalizedProviders,
          ),
        };
      } else {
        setError(humanizeModelingError(result.error || 'Failed to parse intent'));
        return null;
      }
    } catch (err) {
      console.error('Parse error detail:', err);
      setError(humanizeModelingError(err instanceof Error ? err.message : String(err)));
      return null;
    } finally {
      setIsBuilding(false);
    }
  };

  const parseResponsePayload = async (response: Response) => {
    const rawText = await response.text();
    try {
      return JSON.parse(rawText);
    } catch (_error) {
      console.error('Failed to parse JSON response. Raw text:', rawText);
      throw new Error('Invalid JSON response from server');
    }
  };

  const applyBuildResult = (
    result: any,
    requestIntent: ModelingIntent,
    extras: Partial<ModelingBuildMeta> = {},
  ) => {
    if (!(result && (result.success || result.ok) && result.data)) {
      setError(result?.error || 'Failed to build model');
      return false;
    }

    const atoms = normalizeAtoms(result.data.atoms);
    const molecularData: MolecularStructure = {
      id: `model-${Date.now()}`,
      filename: `AI_Generated_${requestIntent.task_type}.vasp`,
      atoms,
      bonds: [],
      boundingBox: computeBoundingBox(atoms),
      latticeVectors: result.data.latticeVectors,
    };
    setMolecularData(molecularData);
    setLatestBuildMeta({
      ...(result.meta || {}),
      providerPreferences: Array.isArray(result?.meta?.providerPreferences)
        ? result.meta.providerPreferences
        : (requestIntent.provider_preferences || []),
      providersTried: Array.isArray(result?.meta?.providersTried)
        ? result.meta.providersTried
        : [],
      totalAtoms: atoms.length,
      ...extras,
    });
    return true;
  };

  const buildModelLegacy = async (requestIntent: ModelingIntent) => {
    const response = await fetch(getApiUrl('/modeling/build'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestIntent),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const result = await parseResponsePayload(response);
    return applyBuildResult(result, requestIntent, {
      runtimeBacked: false,
    });
  };

  const buildModelRuntime = async (requestIntent: ModelingIntent) => {
    const savedSessionId = typeof window !== 'undefined'
      ? window.localStorage.getItem(RUNTIME_SESSION_STORAGE_KEY)
      : null;
    const ownerId = user?.email || user?.id || 'modeling-agent-user';
    const projectId = user?.email ? `modeling:${user.email}` : 'modeling-agent';

    const requestBody: Record<string, unknown> = {
      intent: requestIntent,
      providerPreferences: requestIntent.provider_preferences || [],
    };

    if (savedSessionId) {
      requestBody.sessionId = savedSessionId;
    } else {
      requestBody.ownerId = ownerId;
      requestBody.projectId = projectId;
      requestBody.prompt = requestIntent.substrate?.material
        ? `Build ${requestIntent.task_type} structure for ${requestIntent.substrate.material}`
        : `Build ${requestIntent.task_type} structure`;
    }

    const response = await fetch(getApiUrl('/runtime-demo/modeling/build'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const rawText = await response.text();
    let result: any = null;
    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch (_error) {
      if (!response.ok && response.status === 404) {
        const fallbackError = new Error(rawText || 'Runtime demo route unavailable') as Error & { code?: string };
        fallbackError.code = 'runtime_route_unavailable';
        throw fallbackError;
      }
      throw new Error(rawText || 'Invalid JSON response from runtime server');
    }

    if (!response.ok) {
      const message = result?.error || `HTTP ${response.status}`;
      const fallbackError = new Error(message) as Error & { code?: string };
      if (response.status === 404 || String(message).includes('Cannot POST')) {
        fallbackError.code = 'runtime_route_unavailable';
      }
      throw fallbackError;
    }

    if (result?.sessionId && typeof window !== 'undefined') {
      window.localStorage.setItem(RUNTIME_SESSION_STORAGE_KEY, result.sessionId);
    }
    if (result?.sessionId) {
      void loadRuntimeSession(result.sessionId, { silent: true });
    }

    return applyBuildResult(result, requestIntent, {
      sessionId: result?.sessionId || null,
      planArtifactId: result?.planArtifactId || null,
      taskRunId: result?.taskRunId || null,
      structureArtifactId: result?.structureArtifactId || null,
      runtimeBacked: true,
    });
  };

  const replanModelRuntime = async (requestIntent: ModelingIntent, prompt: string) => {
    const sessionId = typeof window !== 'undefined'
      ? window.localStorage.getItem(RUNTIME_SESSION_STORAGE_KEY)
      : null;

    if (!sessionId) {
      throw new Error('No runtime session is currently attached');
    }

    const response = await fetch(getApiUrl('/runtime-demo/modeling/replan'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        prompt,
        intent: requestIntent,
        providerPreferences: requestIntent.provider_preferences || [],
        replanReason: 'modeling_agent_modify',
      }),
    });

    const result = await parseResponsePayload(response);
    if (!response.ok) {
      throw new Error(result?.error || `HTTP ${response.status}`);
    }

    if (result?.sessionId && typeof window !== 'undefined') {
      window.localStorage.setItem(RUNTIME_SESSION_STORAGE_KEY, result.sessionId);
      void loadRuntimeSession(result.sessionId, { silent: true });
    }

    return applyBuildResult(result, requestIntent, {
      sessionId: result?.sessionId || null,
      planArtifactId: result?.planArtifactId || null,
      taskRunId: result?.taskRunId || null,
      structureArtifactId: result?.structureArtifactId || null,
      runtimeBacked: true,
    });
  };

  const buildModel = async (
    intent: ModelingIntent,
    providerPreferences?: ModelingProviderName[],
  ) => {
    setIsBuilding(true);
    setError(null);
    setLatestBuildMeta(null);
    console.log('Modeling build URL:', getApiUrl('/modeling/build'));
    try {
      const normalizedProviders = normalizeProviderPreferences(
        providerPreferences?.length ? providerPreferences : intent.provider_preferences,
      );
      const requestIntent: ModelingIntent = {
        ...intent,
        provider_preferences: normalizedProviders,
      };
      try {
        return await buildModelRuntime(requestIntent);
      } catch (runtimeError) {
        if ((runtimeError as Error & { code?: string }).code !== 'runtime_route_unavailable') {
          throw runtimeError;
        }
        return await buildModelLegacy(requestIntent);
      }
    } catch (err) {
      console.error('Build error:', err);
      setError(humanizeModelingError(err instanceof Error ? err.message : 'Network error'));
      return false;
    } finally {
      setIsBuilding(false);
    }
  };

  const replanModel = async (
    prompt: string,
    intent: ModelingIntent,
    providerPreferences?: ModelingProviderName[],
  ) => {
    setIsBuilding(true);
    setError(null);

    try {
      const normalizedProviders = normalizeProviderPreferences(
        providerPreferences?.length ? providerPreferences : intent.provider_preferences,
      );
      const requestIntent: ModelingIntent = {
        ...intent,
        provider_preferences: normalizedProviders,
      };

      return await replanModelRuntime(requestIntent, prompt);
    } catch (err) {
      console.error('Replan build error:', err);
      setError(humanizeModelingError(err instanceof Error ? err.message : 'Replan failed'));
      return false;
    } finally {
      setIsBuilding(false);
    }
  };

  return {
    parseIntent,
    buildModel,
    replanModel,
    isBuilding,
    error,
    diagnostics,
    diagnosticsError,
    isLoadingDiagnostics,
    loadDiagnostics,
    latestBuildMeta,
    runtimeSession,
    runtimeSessionError,
    isLoadingRuntimeSession,
    loadRuntimeSession,
    connectRuntimeSession,
    clearRuntimeSession,
  };
};
