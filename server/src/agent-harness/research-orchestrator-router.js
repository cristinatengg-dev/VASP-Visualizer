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
]);

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

  async function prepareRuntime() {
    await connectRuntimeDb();
    if (!builtinSkillsReady) {
      await runtimeCore.skillService.ensureBuiltinSkills();
      builtinSkillsReady = true;
    }
  }

  router.post('/sessions', async (req, res) => {
    try {
      await prepareRuntime();
      const ownerId = safeString(req.body.ownerId || req.body.userId, 'anonymous-researcher');
      const projectId = safeString(req.body.projectId, 'workspace-agent');
      const prompt = safeString(req.body.prompt, 'New research agent task');
      const firstStep = {
        stepId: sanitizeStepId(req.body.firstStepId || 'orchestrator-intake'),
        skillId: 'research_orchestrator',
        agentId: 'orchestrator',
        retryable: true,
        approvalRequired: false,
      };

      const result = await runtimeCore.submitGoalAndCreatePlan({
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
      return res.status(500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.post('/events', async (req, res) => {
    try {
      await prepareRuntime();
      const sessionId = safeString(req.body.sessionId);
      if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });

      const session = await runtimeCore.sessionService.getSessionById(sessionId);
      if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

      const status = normalizeStatus(req.body.status);
      const phase = safeString(req.body.phase, 'workflow');
      const toolName = safeString(req.body.toolName || req.body.tool, 'agent.step');
      const eventType = safeString(req.body.eventType, `agent.${phase}.${status}`);
      const summary = safeString(req.body.summary, toolName);
      const details = Array.isArray(req.body.details) ? req.body.details.map(String).slice(-20) : [];
      const payload = req.body.payload && typeof req.body.payload === 'object' ? req.body.payload : {};

      let artifact = null;
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
        artifact = await runtimeCore.artifactService.createArtifact({
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
        });
      }

      const event = await runtimeCore.eventService.emitEvent({
        sessionId,
        category: 'domain',
        type: eventType,
        producerType: normalizeProducerType(req.body.producerType),
        correlationId: req.body.correlationId ? String(req.body.correlationId) : undefined,
        streamPartition: safeString(req.body.streamPartition, 'workspace-orchestrator'),
        payload: {
          phase,
          status,
          agent: safeString(req.body.agent, 'Orchestrator'),
          toolName,
          summary,
          details,
          artifactId: artifact?._id || null,
          ...payload,
        },
      });

      await runtimeCore.sessionService.touchSession(sessionId);

      return res.status(201).json({
        success: true,
        ok: true,
        eventId: event._id,
        sequence: event.sequence,
        artifactId: artifact?._id || null,
      });
    } catch (err) {
      return res.status(500).json({ success: false, ok: false, error: err.message });
    }
  });

  router.get('/sessions/:sessionId', async (req, res) => {
    try {
      await prepareRuntime();
      const sessionId = safeString(req.params.sessionId);
      const session = await SessionModel.findById(sessionId).lean();
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
      return res.status(500).json({ success: false, ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = {
  createResearchOrchestratorHarnessRouter,
};
