const express = require('express');
const { createRuntimeCore } = require('../runtime/core/create-runtime-core');
const { connectRuntimeDb } = require('../runtime/persistence/connect-runtime-db');
const {
  ArtifactModel,
  EventModel,
  JobRunModel,
  SessionModel,
  TaskRunModel,
} = require('../runtime/persistence/models');

const allowedArtifactKinds = new Set([
  'research_bundle',
  'synthesis_plan',
  'feasibility_report',
  'experiment_plan',
  'materials_research_stack',
  'modeling_intent',
  'orchestration_checkpoint',
  'structure',
  'compute_input_set',
  'result_bundle',
  'report',
  'presentation',
  'workspace_snapshot',
]);

const WORKSPACE_TYPE = 'research-agent';
const DEFAULT_WORKSPACE_PROJECT = 'workspace-agent';
const MAX_WORKSPACE_SNAPSHOT_BYTES = 8 * 1024 * 1024;

function sanitizeStepId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'step-1';
}

function safeString(value, fallback = '') {
  const out = String(value || '').trim();
  return out || fallback;
}

function resolveOwnerId(req) {
  if (req.agentAuthenticated) {
    const authenticatedOwner = safeString(
      req.agentUser?.phone || req.agentUser?.id || req.agentUser?._id,
    );
    if (authenticatedOwner) return authenticatedOwner;
  }

  const requestedOwner = safeString(
    req.body?.ownerId || req.body?.userId || req.query?.ownerId || req.query?.userId,
  );
  if (/^local-[a-zA-Z0-9-]{12,160}$/.test(requestedOwner)) return requestedOwner;

  const error = new Error('A valid login token or local Runtime owner is required');
  error.statusCode = 401;
  throw error;
}

function normalizeWorkspaceSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('snapshot must be a JSON object');
    error.statusCode = 400;
    throw error;
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_WORKSPACE_SNAPSHOT_BYTES) {
    const error = new Error('workspace snapshot exceeds the 8 MB limit');
    error.statusCode = 413;
    throw error;
  }
  return JSON.parse(serialized);
}

function snapshotPreview(snapshot, archived = false) {
  return {
    phase: safeString(snapshot?.phase, 'idle'),
    messageCount: Array.isArray(snapshot?.messages) ? snapshot.messages.length : 0,
    toolEventCount: Array.isArray(snapshot?.toolEvents) ? snapshot.toolEvents.length : 0,
    hasStructure: Boolean(snapshot?.modelStructure),
    hasCompiledInputs: Boolean(snapshot?.compiledInputs),
    archived,
  };
}

function isWorkspaceWriteConflict(error) {
  const message = String(error?.message || '');
  return error?.code === 11000
    || error?.code === 112
    || error?.code === 'snapshot_conflict'
    || error?.hasErrorLabel?.('TransientTransactionError')
    || /write conflict|temporarily unavailable/i.test(message);
}

function normalizeStatus(value) {
  const status = safeString(value, 'info').toLowerCase();
  if (['running', 'success', 'error', 'waiting', 'info'].includes(status)) return status;
  return 'info';
}

function normalizeProducerType(value) {
  const producer = safeString(value, 'orchestrator').toLowerCase();
  if (['orchestrator', 'policy', 'execution', 'subagent', 'tool'].includes(producer)) {
    return producer;
  }
  return 'orchestrator';
}

function normalizeArtifactKind(value) {
  const kind = safeString(value, 'orchestration_checkpoint');
  return allowedArtifactKinds.has(kind) ? kind : 'orchestration_checkpoint';
}

function buildResearchPlanPreview(prompt) {
  return {
    goalSummary: prompt,
    harness: 'research-orchestrator.v1',
    steps: [
      { id: 'retrieve', skillId: 'retrieve_literature_and_structures', agentId: 'retrieval' },
      { id: 'synthesis-feasibility', skillId: 'analyze_synthesis_feasibility', agentId: 'synthesis' },
      { id: 'experiment-plan', skillId: 'design_experiment_matrix', agentId: 'experiment' },
      { id: 'choose-model', skillId: 'record_agent_checkpoint', agentId: 'orchestrator' },
      { id: 'build-model', skillId: 'modeling_build_structure', agentId: 'modeling' },
      { id: 'choose-software', skillId: 'record_agent_checkpoint', agentId: 'orchestrator' },
      { id: 'compile-inputs', skillId: 'compile_input_set', agentId: 'compute' },
      { id: 'approve-submit', skillId: 'submit_compute_job', agentId: 'compute' },
      { id: 'harvest-results', skillId: 'harvest_local_result', agentId: 'compute' },
      { id: 'create-presentation', skillId: 'create_nature_presentation', agentId: 'presentation' },
    ],
  };
}

function buildArtifactPreview(kind, payload, explicitPreview = {}) {
  const preview = { ...explicitPreview };
  if (kind === 'research_bundle') {
    preview.paperCount = Array.isArray(payload?.papers) ? payload.papers.length : 0;
    preview.ideaCount = Array.isArray(payload?.idea_cards) ? payload.idea_cards.length : 0;
    preview.recommendedIdeaId = payload?.recommended_idea_id || null;
  }
  if (kind === 'materials_research_stack') {
    preview.feasibilityScore = payload?.feasibility?.score ?? null;
    preview.feasibilityLevel = payload?.feasibility?.level ?? null;
    preview.synthesisRouteCount = Array.isArray(payload?.synthesis?.routes) ? payload.synthesis.routes.length : 0;
    preview.experimentRunCount = Array.isArray(payload?.experiment?.first_batch) ? payload.experiment.first_batch.length : 0;
  }
  if (kind === 'synthesis_plan') {
    preview.routeCount = Array.isArray(payload?.routes) ? payload.routes.length : 0;
    preview.summary = payload?.summary || null;
  }
  if (kind === 'feasibility_report') {
    preview.score = payload?.score ?? null;
    preview.level = payload?.level ?? null;
  }
  if (kind === 'experiment_plan') {
    preview.runCount = Array.isArray(payload?.first_batch) ? payload.first_batch.length : 0;
    preview.engine = payload?.engine || null;
  }
  if (kind === 'modeling_intent') {
    preview.taskType = payload?.task_type || payload?.intent?.task_type || null;
    preview.material = payload?.substrate?.material || payload?.intent?.substrate?.material || null;
  }
  if (kind === 'structure') {
    preview.totalAtoms = Number(payload?.atomCount || payload?.data?.totalAtoms || payload?.atoms?.length || 0);
    preview.formula = payload?.filename || payload?.meta?.formula || null;
  }
  if (kind === 'compute_input_set') {
    preview.generatedFileCount = payload?.files && typeof payload.files === 'object'
      ? Object.keys(payload.files).length
      : 0;
    preview.engine = payload?.intent?.engine || payload?.normalizedIntent?.engine || null;
    preview.workflow = payload?.intent?.workflow || payload?.normalizedIntent?.workflow || null;
  }
  if (kind === 'result_bundle') {
    preview.converged = payload?.metrics?.converged ?? payload?.converged ?? null;
    preview.totalEnergyEv = payload?.metrics?.totalEnergyEv ?? payload?.totalEnergyEv ?? null;
  }
  if (kind === 'presentation') {
    preview.downloadUrl = payload?.downloadUrl || null;
    preview.qa = payload?.qa || null;
  }
  return preview;
}

function createResearchOrchestratorHarnessRouter() {
  const router = express.Router();
  const runtimeCore = createRuntimeCore();
  let builtinSkillsReady = false;

  async function prepareRuntime({ ensureSkills = false } = {}) {
    const connection = await connectRuntimeDb();
    if (ensureSkills && !builtinSkillsReady) {
      await runtimeCore.skillService.ensureBuiltinSkills();
      builtinSkillsReady = true;
    }
    return connection;
  }

  async function readWorkspaceTask(session) {
    if (!session?.latestSnapshotArtifactId) return null;
    const artifact = await runtimeCore.artifactService.getArtifactById(session.latestSnapshotArtifactId);
    if (!artifact) return null;
    const stored = await runtimeCore.artifactStorage.readJsonPayload(artifact.payloadRef);
    const snapshot = stored?.payload || stored;
    return {
      id: safeString(session.clientTaskId, session._id),
      runtimeSessionId: session._id,
      title: safeString(session.title, '新科研任务'),
      createdAt: new Date(session.createdAt).getTime(),
      updatedAt: new Date(session.updatedAt).getTime(),
      archived: Boolean(session.archivedAt),
      snapshotRevision: Number(session.snapshotRevision || 0),
      snapshot,
    };
  }

  async function createWorkspaceSnapshotArtifact({ session, snapshot, title, previousArtifact, tx }) {
    const identity = previousArtifact
      ? runtimeCore.artifactService.reserveArtifactIdentity({
          lineageRootId: previousArtifact.lineageRootId,
          version: previousArtifact.version + 1,
        })
      : runtimeCore.artifactService.reserveArtifactIdentity();
    const materialized = await runtimeCore.artifactStorage.materializeJsonPayload({
      artifactId: identity._id,
      lineageRootId: identity.lineageRootId,
      version: identity.version,
      payload: snapshot,
      fileName: `${identity._id}-workspace-snapshot.json`,
    });
    const artifactInput = {
      ...identity,
      kind: 'workspace_snapshot',
      sessionId: session._id,
      projectId: session.projectId,
      producedBySkill: 'workspace_task_persistence',
      status: 'ready',
      lifecycleStage: 'validated',
      riskLevel: 'low',
      approvalStatus: 'none',
      isConsumable: false,
      payloadRef: materialized.payloadRef,
      payloadType: materialized.payloadType,
      mimeType: materialized.mimeType,
      blobSizeBytes: materialized.blobSizeBytes,
      contentHash: materialized.contentHash,
      summary: `Workspace snapshot: ${title}`,
      preview: snapshotPreview(snapshot, Boolean(session.archivedAt)),
    };
    if (previousArtifact) {
      return runtimeCore.artifactService.supersedeArtifact({
        artifactId: previousArtifact._id,
        nextArtifact: artifactInput,
        tx,
      });
    }
    return runtimeCore.artifactService.createArtifact(artifactInput, tx);
  }

  router.get('/workspace/health', async (_req, res) => {
    try {
      const connection = await prepareRuntime();
      const hello = await connection.db.admin().command({ hello: 1 });
      const transactionCapable = Boolean(hello.setName || hello.msg === 'isdbgrid');
      const transactionsDisabled = process.env.RUNTIME_DISABLE_TRANSACTIONS === '1';
      const productionReady = transactionCapable && !transactionsDisabled;
      return res.status(productionReady ? 200 : 503).json({
        success: productionReady,
        ok: productionReady,
        runtime: productionReady ? 'ready' : 'degraded',
        persistence: {
          mongodb: 'ready',
          transactions: transactionsDisabled
            ? 'disabled'
            : transactionCapable ? 'ready' : 'unavailable',
          artifactStorage: 'persistent-filesystem-required',
        },
      });
    } catch (err) {
      return res.status(503).json({ success: false, ok: false, runtime: 'unavailable', error: err.message });
    }
  });

  router.get('/workspace/tasks', async (req, res) => {
    try {
      await prepareRuntime();
      const ownerId = resolveOwnerId(req);
      const projectId = safeString(req.query.projectId, DEFAULT_WORKSPACE_PROJECT);
      const sessions = await SessionModel.find({
        ownerId,
        projectId,
        workspaceType: WORKSPACE_TYPE,
        deletedAt: { $exists: false },
      }).sort({ lastActivityAt: -1 }).limit(100).lean();
      const tasks = (await Promise.all(sessions.map(readWorkspaceTask))).filter(Boolean);
      return res.json({ success: true, ok: true, tasks });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.post('/workspace/tasks', async (req, res) => {
    try {
      await prepareRuntime();
      const ownerId = resolveOwnerId(req);
      const projectId = safeString(req.body.projectId, DEFAULT_WORKSPACE_PROJECT);
      const clientTaskId = safeString(req.body.clientTaskId).slice(0, 160);
      const title = safeString(req.body.title, '新科研任务').slice(0, 160);
      const snapshot = normalizeWorkspaceSnapshot(req.body.snapshot);
      if (!clientTaskId) return res.status(400).json({ success: false, error: 'clientTaskId is required' });

      const existing = await SessionModel.findOne({ ownerId, clientTaskId, deletedAt: { $exists: false } });
      if (existing) {
        return res.status(200).json({ success: true, ok: true, created: false, task: await readWorkspaceTask(existing) });
      }

      const updatedSession = await runtimeCore.withTransaction(async (tx) => {
        const session = await runtimeCore.sessionService.createSession({
          ownerId,
          projectId,
          status: 'active',
          workspaceType: WORKSPACE_TYPE,
          clientTaskId,
          title,
          snapshotRevision: 0,
        }, tx);
        const artifact = await createWorkspaceSnapshotArtifact({ session, snapshot, title, tx });
        const updated = await runtimeCore.sessionService.updateWorkspaceSnapshot({
          sessionId: session._id,
          ownerId,
          title,
          latestSnapshotArtifactId: artifact._id,
          expectedSnapshotRevision: 0,
          tx,
        });
        await runtimeCore.eventService.emitEvent({
          sessionId: session._id,
          category: 'system',
          type: 'workspace.task.created',
          producerType: 'orchestrator',
          streamPartition: 'workspace-task-persistence',
          payload: { clientTaskId, title, snapshotArtifactId: artifact._id },
        }, tx);
        return updated;
      });
      return res.status(201).json({ success: true, ok: true, created: true, task: await readWorkspaceTask(updatedSession) });
    } catch (err) {
      if (err?.code === 11000) {
        const ownerId = resolveOwnerId(req);
        const existing = await SessionModel.findOne({
          ownerId,
          clientTaskId: safeString(req.body.clientTaskId),
          deletedAt: { $exists: false },
        });
        if (existing) return res.json({ success: true, ok: true, created: false, task: await readWorkspaceTask(existing) });
      }
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.put('/workspace/tasks/:sessionId', async (req, res) => {
    try {
      await prepareRuntime();
      const ownerId = resolveOwnerId(req);
      const sessionId = safeString(req.params.sessionId);
      const title = safeString(req.body.title, '新科研任务').slice(0, 160);
      const snapshot = normalizeWorkspaceSnapshot(req.body.snapshot);
      const expectedRevision = Number(req.body.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        return res.status(400).json({ success: false, error: 'expectedRevision must be a positive integer' });
      }
      const session = await SessionModel.findOne({ _id: sessionId, ownerId, deletedAt: { $exists: false } });
      if (!session) return res.status(404).json({ success: false, error: 'Workspace task not found' });
      if (Number.isInteger(expectedRevision) && expectedRevision !== Number(session.snapshotRevision || 0)) {
        return res.status(409).json({
          success: false,
          error: 'Workspace task changed on another client',
          code: 'snapshot_conflict',
          task: await readWorkspaceTask(session),
        });
      }

      const updatedSession = await runtimeCore.withTransaction(async (tx) => {
        const previousArtifact = session.latestSnapshotArtifactId
          ? await runtimeCore.artifactService.getArtifactById(session.latestSnapshotArtifactId, tx)
          : null;
        const artifact = await createWorkspaceSnapshotArtifact({ session, snapshot, title, previousArtifact, tx });
        const updated = await runtimeCore.sessionService.updateWorkspaceSnapshot({
          sessionId,
          ownerId,
          title,
          latestSnapshotArtifactId: artifact._id,
          expectedSnapshotRevision: expectedRevision,
          tx,
        });
        if (!updated) {
          const conflict = new Error('Workspace task changed on another client');
          conflict.statusCode = 409;
          conflict.code = 'snapshot_conflict';
          throw conflict;
        }
        await runtimeCore.eventService.emitEvent({
          sessionId,
          category: 'system',
          type: 'workspace.task.snapshot_saved',
          producerType: 'orchestrator',
          streamPartition: 'workspace-task-persistence',
          payload: {
            title,
            snapshotRevision: updated.snapshotRevision,
            snapshotArtifactId: updated.latestSnapshotArtifactId,
            phase: snapshot.phase || 'idle',
          },
        }, tx);
        return updated;
      });
      return res.json({ success: true, ok: true, task: await readWorkspaceTask(updatedSession) });
    } catch (err) {
      if (isWorkspaceWriteConflict(err)) {
        const ownerId = resolveOwnerId(req);
        const session = await SessionModel.findOne({
          _id: safeString(req.params.sessionId),
          ownerId,
          deletedAt: { $exists: false },
        });
        return res.status(409).json({
          success: false,
          ok: false,
          code: 'snapshot_conflict',
          error: 'Workspace task changed on another client',
          task: session ? await readWorkspaceTask(session) : null,
        });
      }
      return res.status(err.statusCode || 500).json({ success: false, ok: false, code: err.code, error: err.message });
    }
  });

  router.patch('/workspace/tasks/:sessionId/archive', async (req, res) => {
    try {
      await prepareRuntime();
      const ownerId = resolveOwnerId(req);
      const sessionId = safeString(req.params.sessionId);
      const archived = req.body.archived !== false;
      const session = await runtimeCore.withTransaction(async (tx) => {
        const updated = await runtimeCore.sessionService.setWorkspaceArchived({ sessionId, ownerId, archived, tx });
        if (!updated) return null;
        await runtimeCore.eventService.emitEvent({
          sessionId,
          category: 'system',
          type: archived ? 'workspace.task.archived' : 'workspace.task.restored',
          producerType: 'orchestrator',
          streamPartition: 'workspace-task-persistence',
          payload: { archived },
        }, tx);
        return updated;
      });
      if (!session) return res.status(404).json({ success: false, error: 'Workspace task not found' });
      return res.json({ success: true, ok: true, task: await readWorkspaceTask(session) });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.delete('/workspace/tasks/:sessionId', async (req, res) => {
    try {
      await prepareRuntime();
      const ownerId = resolveOwnerId(req);
      const sessionId = safeString(req.params.sessionId);
      const session = await runtimeCore.withTransaction(async (tx) => {
        const deleted = await runtimeCore.sessionService.softDeleteWorkspace({ sessionId, ownerId, tx });
        if (!deleted) return null;
        await runtimeCore.eventService.emitEvent({
          sessionId,
          category: 'system',
          type: 'workspace.task.deleted',
          producerType: 'orchestrator',
          streamPartition: 'workspace-task-persistence',
          payload: { softDeleted: true },
        }, tx);
        return deleted;
      });
      if (!session) return res.status(404).json({ success: false, error: 'Workspace task not found' });
      return res.json({ success: true, ok: true, sessionId });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.post('/sessions', async (req, res) => {
    try {
      await prepareRuntime({ ensureSkills: true });
      const ownerId = resolveOwnerId(req);
      const projectId = safeString(req.body.projectId, 'workspace-agent');
      const prompt = safeString(req.body.prompt, 'New research agent task');
      const requestedSessionId = safeString(req.body.sessionId);
      if (requestedSessionId) {
        const workspaceSession = await SessionModel.findOne({ _id: requestedSessionId, ownerId, deletedAt: { $exists: false } });
        if (!workspaceSession) return res.status(404).json({ success: false, error: 'Workspace session not found' });
      }
      const firstStep = {
        stepId: sanitizeStepId(req.body.firstStepId || 'orchestrator-intake'),
        skillId: 'research_orchestrator',
        agentId: 'orchestrator',
        retryable: true,
        approvalRequired: false,
      };

      const result = await runtimeCore.submitGoalAndCreatePlan({
        sessionId: requestedSessionId || undefined,
        ownerId,
        projectId,
        goalArtifact: {
          status: 'ready',
          summary: prompt,
          preview: {
            prompt,
            source: 'workspace.orchestrator',
            userFacingWorkflow: true,
          },
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        planArtifact: {
          status: 'ready',
          summary: `Continuous research agent plan for: ${prompt}`,
          preview: buildResearchPlanPreview(prompt),
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        firstStep,
      });

      await runtimeCore.withTransaction(async (tx) => {
        const running = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: result.firstTaskRun._id,
          toStatus: 'running',
          tx,
        });
        await runtimeCore.eventService.emitEvent(
          {
            sessionId: result.session._id,
            taskRunId: running._id,
            category: 'system',
            type: 'agent.workflow.started',
            producerType: 'orchestrator',
            correlationId: running.correlationId,
            payload: {
              prompt,
              ownerId,
              planArtifactId: result.planArtifact._id,
              goalArtifactId: result.goalArtifact._id,
            },
          },
          tx
        );
        await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: running._id,
          toStatus: 'succeeded',
          patch: { metrics: { initializedSessions: 1 } },
          tx,
        });
      });

      return res.status(201).json({
        success: true,
        ok: true,
        sessionId: result.session._id,
        goalArtifactId: result.goalArtifact._id,
        planArtifactId: result.planArtifact._id,
        firstTaskRunId: result.firstTaskRun._id,
        harness: 'research-orchestrator.v1',
        plan: buildResearchPlanPreview(prompt),
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.post('/events', async (req, res) => {
    try {
      await prepareRuntime();
      const sessionId = safeString(req.body.sessionId);
      if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });

      const session = await runtimeCore.sessionService.getSessionById(sessionId);
      if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
      if (safeString(session.ownerId) !== resolveOwnerId(req)) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      const status = normalizeStatus(req.body.status);
      const phase = safeString(req.body.phase, 'workflow');
      const toolName = safeString(req.body.toolName || req.body.tool, 'agent.step');
      const eventType = safeString(req.body.eventType, `agent.${phase}.${status}`);
      const summary = safeString(req.body.summary, toolName);
      const details = Array.isArray(req.body.details) ? req.body.details.map(String).slice(-20) : [];
      const payload = req.body.payload && typeof req.body.payload === 'object' ? req.body.payload : {};

      let artifactRecord = null;
      if (req.body.artifact && typeof req.body.artifact === 'object') {
        const artifactInput = req.body.artifact;
        const kind = normalizeArtifactKind(artifactInput.kind);
        const artifactPayload = artifactInput.payload && typeof artifactInput.payload === 'object'
          ? artifactInput.payload
          : { value: artifactInput.payload ?? null };
        const identity = runtimeCore.artifactService.reserveArtifactIdentity();
        const materialized = await runtimeCore.artifactStorage.materializeJsonPayload({
          artifactId: identity._id,
          lineageRootId: identity.lineageRootId,
          version: identity.version,
          payload: artifactPayload,
        });
        artifactRecord = {
          ...identity,
          kind,
          sessionId,
          projectId: session.projectId,
          producedBySkill: safeString(artifactInput.producedBySkill || req.body.skillId, 'record_agent_checkpoint'),
          status: 'ready',
          lifecycleStage: 'validated',
          riskLevel: safeString(artifactInput.riskLevel, 'low'),
          approvalStatus: 'none',
          isConsumable: true,
          payloadRef: materialized.payloadRef,
          payloadType: materialized.payloadType,
          mimeType: materialized.mimeType,
          blobSizeBytes: materialized.blobSizeBytes,
          contentHash: materialized.contentHash,
          summary: safeString(artifactInput.summary, summary),
          preview: buildArtifactPreview(kind, artifactPayload, artifactInput.preview || {}),
        };
      }

      const persisted = await runtimeCore.withTransaction(async (tx) => {
        const artifact = artifactRecord
          ? await runtimeCore.artifactService.createArtifact(artifactRecord, tx)
          : null;
        const event = await runtimeCore.eventService.emitEvent({
          sessionId,
          category: 'domain',
          type: eventType,
          producerType: normalizeProducerType(req.body.producerType),
          correlationId: req.body.correlationId ? String(req.body.correlationId) : undefined,
          streamPartition: safeString(req.body.streamPartition, 'workspace-orchestrator'),
          payload: {
            ...payload,
            phase,
            status,
            agent: safeString(req.body.agent, 'Orchestrator'),
            toolName,
            summary,
            details,
            artifactId: artifact?._id || null,
          },
        }, tx);
        await runtimeCore.sessionService.touchSession(sessionId, tx);
        return { artifact, event };
      });

      return res.status(201).json({
        success: true,
        ok: true,
        eventId: persisted.event._id,
        sequence: persisted.event.sequence,
        artifactId: persisted.artifact?._id || null,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.get('/sessions/:sessionId', async (req, res) => {
    try {
      await prepareRuntime();
      const sessionId = safeString(req.params.sessionId);
      const session = await SessionModel.findOne({ _id: sessionId, ownerId: resolveOwnerId(req), deletedAt: { $exists: false } }).lean();
      if (!session) return res.status(404).json({ success: false, ok: false, error: 'Session not found' });

      const [artifacts, taskRuns, jobRuns, events] = await Promise.all([
        ArtifactModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        TaskRunModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        JobRunModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        EventModel.find({ sessionId }).sort({ sequence: 1, ts: 1 }).limit(300).lean(),
      ]);

      return res.json({
        success: true,
        ok: true,
        session,
        summary: {
          artifactCount: artifacts.length,
          taskRunCount: taskRuns.length,
          jobRunCount: jobRuns.length,
          eventCount: events.length,
        },
        artifacts,
        taskRuns,
        jobRuns,
        events,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ success: false, ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createResearchOrchestratorHarnessRouter,
  normalizeWorkspaceSnapshot,
  resolveOwnerId,
  snapshotPreview,
};
