const express = require('express');
const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { createRuntimeCore } = require('../core/create-runtime-core');
const { createPolicyEngine } = require('../policy/create-policy-engine');
const { connectRuntimeDb } = require('../persistence/connect-runtime-db');
const { runParseScienceTask } = require('../adapters/rendering/run-parse-science-task');
const { runParsePdfTask } = require('../adapters/rendering/run-parse-pdf-task');
const { runCompilePromptTask } = require('../adapters/rendering/run-compile-prompt-task');
const { runGenerateImageTask } = require('../adapters/rendering/run-generate-image-task');
const { runCompileInputSetTask } = require('../adapters/compute/run-compile-input-set-task');
const { getComputeProfile, listComputeProfiles } = require('../../compute/profiles');
const { getComputeRuntimeDiagnostics } = require('../../compute/health');
const { submitComputeJob } = require('../../compute/submit-job');
const {
  buildModelingPlanPreview,
  buildModelingPlanSteps,
  runModelingPlan,
} = require('../adapters/modeling/run-modeling-plan');
const { runJobMonitor } = require('../workers/run-job-monitor');
const { runApprovalExpirySweeper } = require('../workers/run-approval-expiry-sweeper');
const { runHarvestLaggingMonitor } = require('../workers/run-harvest-lagging-monitor');
const { parseModelingIntent, normalizeModelingIntent } = require('../../modeling/parse-intent');
const { buildModelingProviderAvailability, normalizeModelingProviderPreferences } = require('../../modeling/provider-registry');
const { getModelingRuntimeDiagnostics } = require('../../modeling/health');
const {
  SessionModel,
  ArtifactModel,
  TaskRunModel,
  JobRunModel,
  ApprovalRequestModel,
  EventModel,
} = require('../persistence/models');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 },
});

function sanitizeStepId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'step-1';
}

function buildDefaultPlanSpec(goalPrompt, firstStep) {
  return {
    goalSummary: goalPrompt,
    steps: [
      {
        id: firstStep.stepId,
        skillId: firstStep.skillId,
        agentId: firstStep.agentId,
      },
    ],
  };
}

function buildFirstStep(body, defaults = {}) {
  return {
    stepId: sanitizeStepId(body.firstStepId || defaults.firstStepId || 'step-1'),
    skillId: String(body.firstSkillId || defaults.firstSkillId || 'inspect_artifact').trim(),
    agentId: String(body.firstAgentId || defaults.firstAgentId || 'orchestrator-demo').trim(),
    inputArtifacts: undefined,
    retryable: false,
    approvalRequired: false,
  };
}

function buildRuntimeStack() {
  const policyEngine = createPolicyEngine();
  const runtimeCore = createRuntimeCore({
    policyHooks: {
      runInitialPreflight: policyEngine.runInitialPreflight,
    },
  });
  return { runtimeCore, policyEngine };
}

function buildRenderingGoalPrompt(text, fallback) {
  const explicit = String(fallback || '').trim();
  if (explicit) {
    return explicit;
  }
  const excerpt = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return excerpt
    ? `Parse scientific text into a rendering-ready brief: ${excerpt}`
    : 'Parse scientific text into a rendering-ready brief';
}

function buildModelingGoalPrompt(prompt, intent) {
  const explicitPrompt = String(prompt || '').trim();
  if (explicitPrompt) {
    return explicitPrompt;
  }

  const material = intent?.substrate?.material || intent?.material || 'unknown material';
  const taskType = intent?.task_type || 'structure';
  return `Build ${taskType} structure for ${material}`;
}

function statusForRenderingError(error) {
  const message = String(error && error.message ? error.message : '');
  if (
    message.includes('Text too short')
    || message.includes('Could not extract sufficient text from PDF')
    || message.includes('Unsupported pdf-parse module export')
    || message.includes('does not contain structured science data')
    || message.includes('does not contain a compiled prompt')
  ) {
    return 400;
  }
  return 500;
}

async function loadSessionRuntimeInputs(runtimeCore, sessionId) {
  const session = await runtimeCore.sessionService.getSessionById(sessionId);
  if (!session) {
    return { error: { status: 404, message: 'Session not found' } };
  }
  if (session.status === 'closed') {
    return { error: { status: 409, message: 'Session is closed' } };
  }
  if (!session.activePlanArtifactId) {
    return { error: { status: 409, message: 'Session has no active plan' } };
  }

  const [goalArtifact, planArtifact] = await Promise.all([
    session.primaryGoalArtifactId
      ? runtimeCore.artifactService.getArtifactById(session.primaryGoalArtifactId)
      : Promise.resolve(null),
    runtimeCore.artifactService.getArtifactById(session.activePlanArtifactId),
  ]);

  if (!planArtifact) {
    return { error: { status: 409, message: 'Active plan artifact is missing' } };
  }

  return { session, goalArtifact, planArtifact };
}

async function loadPromptArtifact({ sessionId, promptArtifactId }) {
  if (promptArtifactId) {
    return ArtifactModel.findById(promptArtifactId);
  }

  return ArtifactModel.findOne({
    sessionId,
    kind: 'report',
    'preview.compiledPrompt': { $exists: true },
  }).sort({ createdAt: -1 });
}

async function loadStructureArtifact({ sessionId, structureArtifactId }) {
  if (structureArtifactId) {
    return ArtifactModel.findOne({
      _id: structureArtifactId,
      sessionId,
      kind: 'structure',
    });
  }

  return ArtifactModel.findOne({
    sessionId,
    kind: 'structure',
  }).sort({ createdAt: -1 });
}

async function loadComputeInputSetArtifact({ sessionId, computeInputSetArtifactId }) {
  if (computeInputSetArtifactId) {
    return ArtifactModel.findOne({
      _id: computeInputSetArtifactId,
      sessionId,
      kind: 'compute_input_set',
    });
  }

  return ArtifactModel.findOne({
    sessionId,
    kind: 'compute_input_set',
  }).sort({ createdAt: -1 });
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildImageExecutionContext({
  sessionId,
  taskRunId,
  promptArtifactId,
  aspectRatio,
  numberOfImages,
  maxAttemptsPerImage,
  requiredSpeciesCount,
}) {
  const policyId = 'rendering.generate-image';
  const targetRef = `rendering.generate-image:${promptArtifactId}:${aspectRatio}:${numberOfImages}`;
  const riskSnapshot = {
    sessionId,
    taskRunId,
    policyId,
    effectType: 'external_submit',
    targetRef,
    promptArtifactId,
    aspectRatio,
    numberOfImages,
    maxAttemptsPerImage,
    requiredSpeciesCount,
  };
  const riskSnapshotHash = createHash('sha256')
    .update(stableStringify(riskSnapshot))
    .digest('hex');
  const idempotencyKey = createHash('sha256')
    .update(stableStringify({
      sessionId,
      taskRunId,
      promptArtifactId,
      aspectRatio,
      numberOfImages,
      maxAttemptsPerImage,
    }))
    .digest('hex');

  return {
    targetRef,
    policyId,
    riskSnapshotHash,
    idempotencyKey,
    estimatedCost: {
      numberOfImages,
      aspectRatio,
      maxAttemptsPerImage,
      requiredSpeciesCount,
    },
  };
}

function buildComputeSubmitExecutionContext({
  sessionId,
  taskRunId,
  computeInputSetArtifactId,
  profileId,
  workflow,
  quality,
  generatedFileCount,
  formula,
}) {
  const policyId = 'compute.submit-job';
  const targetRef = `compute.submit-job:${computeInputSetArtifactId}:${profileId}`;
  const riskSnapshot = {
    sessionId,
    taskRunId,
    policyId,
    effectType: 'external_submit',
    targetRef,
    computeInputSetArtifactId,
    profileId,
    workflow,
    quality,
    generatedFileCount,
    formula,
  };
  const riskSnapshotHash = createHash('sha256')
    .update(stableStringify(riskSnapshot))
    .digest('hex');
  const idempotencyKey = createHash('sha256')
    .update(stableStringify({
      sessionId,
      taskRunId,
      computeInputSetArtifactId,
      profileId,
      workflow,
      quality,
      generatedFileCount,
      formula,
    }))
    .digest('hex');

  return {
    targetRef,
    policyId,
    riskSnapshotHash,
    idempotencyKey,
    estimatedCost: {
      profileId,
      workflow,
      quality,
      generatedFileCount,
      formula,
    },
  };
}

function buildDeterministicJobRunId({ taskRunId, idempotencyKey }) {
  return `job_${createHash('sha256').update(`${taskRunId}:${idempotencyKey}`).digest('hex').slice(0, 24)}`;
}

function parseComputeProfileFromTargetRef(targetRef) {
  const parts = String(targetRef || '').split(':');
  return parts.length >= 3 ? parts[2] : 'local_demo';
}

function getComputeAgentToken() {
  return String(process.env.COMPUTE_AGENT_TOKEN || process.env.ADMIN_SECRET || '').trim();
}

function extractRequestToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return String(req.headers['x-compute-agent-token'] || req.query.token || '').trim();
}

function ensureComputeAgentAuthorized(req, res) {
  const expectedToken = getComputeAgentToken();
  if (!expectedToken) {
    res.status(503).json({
      ok: false,
      error: 'Compute agent authentication is not configured on the backend',
    });
    return false;
  }

  const providedToken = extractRequestToken(req);
  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({
      ok: false,
      error: 'Unauthorized compute agent request',
    });
    return false;
  }

  return true;
}

function isDraftPayloadRef(payloadRef) {
  return String(payloadRef || '').startsWith('draft://');
}

function truncateText(value, maxLength = 320) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function objectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

function summarizeStructuredScience(structured) {
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    return null;
  }

  return {
    domain: structured.domain || null,
    subdomain: structured.subdomain || null,
    coreTheme: structured.core_theme || null,
    centralObject: structured.central_object || null,
    keyMechanism: structured.key_mechanism || null,
    visualKeywordCount: Array.isArray(structured.visual_keywords) ? structured.visual_keywords.length : 0,
    mustShowElementCount: Array.isArray(structured.must_show_elements) ? structured.must_show_elements.length : 0,
    reactantCount: Array.isArray(structured.reactants) ? structured.reactants.length : 0,
    intermediateCount: Array.isArray(structured.intermediates) ? structured.intermediates.length : 0,
    productCount: Array.isArray(structured.products) ? structured.products.length : 0,
    scientificEntityCount: Array.isArray(structured.scientific_entities) ? structured.scientific_entities.length : 0,
  };
}

function summarizeCompiledPrompt(compiled) {
  if (!compiled || typeof compiled !== 'object' || Array.isArray(compiled)) {
    return null;
  }

  return {
    journal: compiled.journal || null,
    aspectRatio: compiled.aspectRatio || null,
    strictNoText: Boolean(compiled.strictNoText),
    strictChemistry: Boolean(compiled.strictChemistry),
    requiredSpeciesCount: Array.isArray(compiled.requiredSpecies) ? compiled.requiredSpecies.length : 0,
    requiredSpecies: Array.isArray(compiled.requiredSpecies) ? compiled.requiredSpecies.slice(0, 12) : [],
    promptExcerpt: truncateText(compiled.fullPrompt, 500),
    metadataKeys: objectKeys(compiled.metadata),
  };
}

function summarizeVisualManifest(manifest) {
  return {
    documentType: 'visual_asset_manifest',
    imageCount: Number(manifest.imageCount || 0),
    fileCount: Array.isArray(manifest.files) ? manifest.files.length : 0,
    files: Array.isArray(manifest.files)
      ? manifest.files.slice(0, 8).map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        contentHash: file.contentHash,
      }))
      : [],
    metadata: manifest.metadata || {},
  };
}

function summarizeComputeInputSetPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const files = payload.files && typeof payload.files === 'object' ? payload.files : {};
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
  const preview = payload.preview && typeof payload.preview === 'object' ? payload.preview : {};

  return {
    documentType: 'compute_input_set_payload',
    fileCount: Object.keys(files).length,
    fileNames: Object.keys(files),
    sourceStructureArtifactId: payload.sourceStructureArtifactId || null,
    formula: meta.formula || preview.formula || null,
    workflow: meta.workflow || preview.workflow || null,
    quality: meta.quality || preview.quality || null,
    isSlab: Boolean(meta.isSlab ?? preview.isSlab),
    kpointGrid: meta.kpointGrid || preview.kpointGrid || null,
    potcarSymbols: meta.potcarSymbols || preview.potcarSymbols || [],
    generatedFiles: meta.generatedFiles || preview.generatedFiles || [],
    incarSummary: meta.incarSummary || null,
  };
}

function summarizeResultBundlePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const metrics = payload.metrics && typeof payload.metrics === 'object' ? payload.metrics : {};
  const files = payload.files && typeof payload.files === 'object' ? payload.files : {};
  const execution = payload.execution && typeof payload.execution === 'object' ? payload.execution : {};
  const excerpts = payload.excerpts && typeof payload.excerpts === 'object' ? payload.excerpts : {};
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  const notes = Array.isArray(payload.notes) ? payload.notes : [];

  return {
    documentType: 'result_bundle_payload',
    resultType: payload.resultType || null,
    profileId: payload.profileId || null,
    system: payload.system || null,
    schedulerRef: payload.schedulerRef || null,
    summary: payload.summary || null,
    formula: payload.formula || payload.preview?.formula || null,
    completedAt: payload.completedAt || null,
    metrics: {
      totalEnergyEv: metrics.totalEnergyEv ?? null,
      converged: metrics.converged ?? null,
      ionicStepCount: metrics.ionicStepCount ?? null,
      electronicStepHints: metrics.electronicStepHints ?? null,
      maxForceEvPerA: metrics.maxForceEvPerA ?? metrics.forceMaxEvPerA ?? null,
      rmsForceEvPerA: metrics.rmsForceEvPerA ?? null,
      exitCode: metrics.exitCode ?? null,
      elapsedSeconds: metrics.elapsedSeconds ?? null,
    },
    warningCount: warnings.length,
    warnings: warnings.slice(0, 8),
    detectedOutputs: files.detectedOutputs || {},
    inputFileCount: Array.isArray(files.inputFiles) ? files.inputFiles.length : 0,
    harvestedFileCount: Array.isArray(files.harvestedFiles) ? files.harvestedFiles.length : 0,
    execution: {
      mode: execution.mode || null,
      command: execution.command || null,
      schedulerRef: execution.schedulerRef || null,
      runtimeExitCode: execution.runtimeStatus?.exitCode ?? null,
    },
    excerptAvailability: {
      oszicar: Boolean(excerpts.oszicarTail),
      outcar: Boolean(excerpts.outcarTail),
      vaspOut: Boolean(excerpts.vaspOutTail),
      stdout: Boolean(excerpts.jobStdoutTail),
      stderr: Boolean(excerpts.jobStderrTail),
    },
    noteCount: notes.length,
  };
}

function summarizeJsonDocument(document, artifact) {
  const topLevelKeys = objectKeys(document);

  if (document && typeof document === 'object' && !Array.isArray(document)) {
    if (Array.isArray(document.files) && document.imageCount != null) {
      return {
        topLevelKeys,
        ...summarizeVisualManifest(document),
      };
    }

    if (document.payload && typeof document.payload === 'object' && !Array.isArray(document.payload)) {
      if (document.payload.compiled) {
        return {
          documentType: 'compiled_prompt_payload',
          topLevelKeys,
          payloadKeys: objectKeys(document.payload),
          sourceReportArtifactId: document.payload.sourceReportArtifactId || null,
          compiled: summarizeCompiledPrompt(document.payload.compiled),
        };
      }

      if (document.payload.structured) {
        return {
          documentType: 'report_payload',
          topLevelKeys,
          payloadKeys: objectKeys(document.payload),
          previewKeys: objectKeys(document.payload.preview),
          metricKeys: objectKeys(document.payload.metrics),
          structured: summarizeStructuredScience(document.payload.structured),
          metrics: document.payload.metrics || {},
        };
      }

      if (document.payload.files && (artifact.kind === 'compute_input_set' || document.payload.meta?.workflow)) {
        return {
          topLevelKeys,
          payloadKeys: objectKeys(document.payload),
          ...summarizeComputeInputSetPayload(document.payload),
        };
      }
    }

    if (artifact.kind === 'result_bundle' || String(document.resultType || '').endsWith('_result_bundle')) {
      return {
        topLevelKeys,
        ...summarizeResultBundlePayload(document),
      };
    }
  }

  return {
    documentType: `${artifact.kind || 'unknown'}_payload`,
    topLevelKeys,
    excerpt: truncateText(JSON.stringify(document), 600),
  };
}

async function readArtifactPayloadJson(artifact) {
  const payloadRef = artifact?.payloadRef ? String(artifact.payloadRef) : '';
  const treatAsJson = artifact?.payloadType === 'json'
    || artifact?.mimeType === 'application/json'
    || payloadRef.endsWith('.json');

  if (!payloadRef || isDraftPayloadRef(payloadRef) || !treatAsJson) {
    return null;
  }

  const raw = await fs.promises.readFile(payloadRef, 'utf8');
  return JSON.parse(raw);
}

async function inspectArtifactPayload(artifact) {
  const payloadRef = artifact?.payloadRef ? String(artifact.payloadRef) : '';
  const inspection = {
    artifactId: artifact?._id || null,
    kind: artifact?.kind || null,
    payloadRef: payloadRef || null,
    payloadType: artifact?.payloadType || null,
    mimeType: artifact?.mimeType || null,
    blobSizeBytes: artifact?.blobSizeBytes ?? null,
    contentHash: artifact?.contentHash || null,
    materialized: Boolean(payloadRef) && !isDraftPayloadRef(payloadRef),
    storageKind: !payloadRef ? 'none' : (isDraftPayloadRef(payloadRef) ? 'draft' : 'local_file'),
    exists: false,
  };

  if (!payloadRef || isDraftPayloadRef(payloadRef)) {
    return inspection;
  }

  try {
    const stats = await fs.promises.stat(payloadRef);
    if (!stats.isFile()) {
      return {
        ...inspection,
        error: 'payload_ref_is_not_a_file',
      };
    }

    const nextInspection = {
      ...inspection,
      exists: true,
      diskSizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };

    const parsed = await readArtifactPayloadJson(artifact).catch((error) => ({
      __parseError: error.message,
    }));

    if (!parsed) {
      return nextInspection;
    }
    if (parsed.__parseError) {
      return {
        ...nextInspection,
        parseError: parsed.__parseError,
      };
    }

    return {
      ...nextInspection,
      jsonSummary: summarizeJsonDocument(parsed, artifact),
    };
  } catch (error) {
    return {
      ...inspection,
      error: error.message,
    };
  }
}

async function buildArtifactInspectorView(artifact) {
  return {
    artifact,
    payloadInspection: await inspectArtifactPayload(artifact),
  };
}

function parseListLimit(rawValue, fallback = 12, max = 30) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function createRuntimeDemoRouter() {
  const router = express.Router();
  const { runtimeCore, policyEngine } = buildRuntimeStack();

  router.get('/health', async (_req, res) => {
    try {
      await connectRuntimeDb();
      return res.json({
        ok: true,
        runtimeDemo: true,
        mongoReadyState: SessionModel.db.readyState,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/skills', async (req, res) => {
    try {
      await connectRuntimeDb();
      await runtimeCore.skillService.ensureBuiltinSkills();

      const skills = await runtimeCore.skillService.listSkills({
        status: req.query.status ? String(req.query.status) : undefined,
      });

      const domain = req.query.domain ? String(req.query.domain).trim().toLowerCase() : '';
      const filteredSkills = domain
        ? skills.filter((skill) => String(skill?.display?.domain || '').toLowerCase() === domain)
        : skills;

      return res.json({
        ok: true,
        skills: filteredSkills,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/compute/compile-input-set', async (req, res) => {
    try {
      await connectRuntimeDb();
      await runtimeCore.skillService.ensureBuiltinSkills();

      const sessionId = String(req.body.sessionId || '').trim();
      const structureArtifactId = req.body.structureArtifactId
        ? String(req.body.structureArtifactId).trim()
        : '';

      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId is required' });
      }

      const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
      if (loaded.error) {
        return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
      }

      const { session, goalArtifact, planArtifact } = loaded;
      const structureArtifact = await loadStructureArtifact({
        sessionId: session._id,
        structureArtifactId: structureArtifactId || undefined,
      });

      if (!structureArtifact) {
        return res.status(404).json({
          ok: false,
          error: structureArtifactId
            ? 'Requested structure artifact was not found in this session'
            : 'No structure artifact is available in this session',
        });
      }

      const computeIntent = {
        workflow: String(req.body?.intent?.workflow || req.body.workflow || 'relax').trim().toLowerCase() || 'relax',
        quality: String(req.body?.intent?.quality || req.body.quality || 'standard').trim().toLowerCase() || 'standard',
        vdw: req.body?.intent?.vdw === true || req.body.vdw === true,
        spin_mode: String(req.body?.intent?.spin_mode || req.body.spinMode || 'auto').trim().toLowerCase() || 'auto',
        custom_params: req.body?.intent?.custom_params || req.body.customParams || {},
      };

      const firstStep = {
        stepId: sanitizeStepId(req.body.stepId || `compute-compile-${Date.now()}`),
        skillId: 'compile_input_set',
        agentId: 'compute-subagent',
        inputArtifacts: [
          ...(goalArtifact ? [goalArtifact._id] : []),
          structureArtifact._id,
        ],
        retryable: true,
        approvalRequired: false,
      };

      const taskRun = await runtimeCore.withTransaction(async (tx) =>
        runtimeCore.createAndStageTaskRun({
          session,
          goalArtifact,
          planArtifact,
          taskSpec: firstStep,
          tx,
        })
      );

      if (taskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const result = await runCompileInputSetTask({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        taskRun,
        structureArtifact,
        intent: computeIntent,
      });

      if (result.taskRun.status !== 'succeeded' || !result.computeInputArtifact) {
        return res.status(500).json({
          ok: false,
          error: result.error?.message || 'Compute input compilation failed',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: result.taskRun?._id || null,
          taskRunStatus: result.taskRun?.status || null,
        });
      }

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        planArtifactId: planArtifact._id,
        sourceStructureArtifactId: structureArtifact._id,
        taskRunId: result.taskRun._id,
        taskRunStatus: result.taskRun.status,
        computeInputSetArtifactId: result.computeInputArtifact._id,
        files: Object.keys(result.compileResult?.files || {}),
        meta: result.compileResult?.meta || null,
        preview: result.compileResult?.preview || null,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/compute/profiles', async (_req, res) => {
    try {
      return res.json({
        ok: true,
        profiles: listComputeProfiles(),
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/compute/diagnostics', async (_req, res) => {
    try {
      const diagnostics = await getComputeRuntimeDiagnostics();
      return res.json({
        ok: true,
        ...diagnostics,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/compute/server-local-smoke', async (req, res) => {
    try {
      await connectRuntimeDb();
      await runtimeCore.skillService.ensureBuiltinSkills();

      const diagnostics = await getComputeRuntimeDiagnostics();
      if (!diagnostics?.mongo?.configured || !diagnostics?.serverLocal?.ready || !diagnostics?.potcar?.ready) {
        return res.status(409).json({
          ok: false,
          error: 'Server-local compute smoke is not ready in this environment',
          diagnostics,
        });
      }

      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
      const ownerId = req.body.ownerId ? String(req.body.ownerId).trim() : undefined;
      const projectId = req.body.projectId ? String(req.body.projectId).trim() : undefined;
      const prompt = String(req.body.prompt || '').trim() || 'build a Cu(111) slab using fallback provider';
      const workflow = String(req.body.workflow || 'relax').trim().toLowerCase() || 'relax';
      const quality = String(req.body.quality || 'standard').trim().toLowerCase() || 'standard';
      const providerPreferences = normalizeModelingProviderPreferences(
        req.body.providerPreferences || req.body.providers || ['fallback']
      );

      if (!sessionId && !ownerId) {
        return res.status(400).json({
          ok: false,
          error: 'ownerId is required when sessionId is not provided',
        });
      }

      const modelingIntent = req.body.intent
        ? normalizeModelingIntent(req.body.intent, providerPreferences)
        : await parseModelingIntent({
          prompt,
          providerPreferences,
        });

      const stepIdPrefix = sanitizeStepId(req.body.stepIdPrefix || `server-local-smoke-${Date.now()}`);
      const planSteps = buildModelingPlanSteps(modelingIntent, { stepIdPrefix });
      const firstStep = planSteps[0];

      let session;
      let goalArtifact;
      let planArtifact;
      let modelingTaskRun;

      if (sessionId) {
        const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        modelingTaskRun = await runtimeCore.withTransaction(async (tx) =>
          runtimeCore.createAndStageTaskRun({
            session,
            goalArtifact,
            planArtifact,
            taskSpec: {
              ...firstStep,
              inputArtifacts: goalArtifact ? [goalArtifact._id] : [],
              retryable: true,
            },
            tx,
          })
        );
      } else {
        const goalPrompt = buildModelingGoalPrompt(prompt, modelingIntent);
        const seeded = await runtimeCore.submitGoalAndCreatePlan({
          ownerId,
          projectId,
          goalArtifact: {
            status: 'ready',
            summary: goalPrompt,
            preview: {
              prompt: goalPrompt,
              source: 'compute.server_local_smoke',
              taskType: modelingIntent.task_type || null,
              providerPreferences,
            },
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          planArtifact: {
            status: 'ready',
            summary: `Executable smoke plan for: ${goalPrompt}`,
            preview: buildModelingPlanPreview(goalPrompt, modelingIntent, planSteps),
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          firstStep,
        });

        session = seeded.session;
        goalArtifact = seeded.goalArtifact;
        planArtifact = seeded.planArtifact;
        modelingTaskRun = seeded.firstTaskRun;
      }

      if (modelingTaskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'Initial modeling task was blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: modelingTaskRun._id,
        });
      }

      const modelingResult = await runModelingPlan({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        initialTaskRun: modelingTaskRun,
        intent: modelingIntent,
        planSteps,
      });

      if (modelingResult.blocked || modelingResult.finalTaskRun?.status !== 'succeeded' || !modelingResult.finalStructureArtifact) {
        return res.status(409).json({
          ok: false,
          error: 'Modeling smoke pipeline did not complete successfully',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: modelingResult.finalTaskRun?._id || null,
          taskRunStatus: modelingResult.finalTaskRun?.status || null,
          structureArtifactId: modelingResult.finalStructureArtifact?._id || null,
        });
      }

      const compileTaskRun = await runtimeCore.withTransaction(async (tx) =>
        runtimeCore.createAndStageTaskRun({
          session,
          goalArtifact,
          planArtifact,
          taskSpec: {
            stepId: sanitizeStepId(`${stepIdPrefix}-compile-input-set`),
            skillId: 'compile_input_set',
            agentId: 'compute-subagent',
            inputArtifacts: [
              ...(goalArtifact ? [goalArtifact._id] : []),
              modelingResult.finalStructureArtifact._id,
            ],
            retryable: true,
            approvalRequired: false,
          },
          tx,
        })
      );

      if (compileTaskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'Compute input compilation task was blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: compileTaskRun._id,
          structureArtifactId: modelingResult.finalStructureArtifact._id,
        });
      }

      const compileResult = await runCompileInputSetTask({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        taskRun: compileTaskRun,
        structureArtifact: modelingResult.finalStructureArtifact,
        intent: {
          workflow,
          quality,
          vdw: false,
          spin_mode: 'auto',
          custom_params: {},
        },
      });

      if (compileResult.taskRun.status !== 'succeeded' || !compileResult.computeInputArtifact) {
        return res.status(500).json({
          ok: false,
          error: compileResult.error?.message || 'Failed to compile compute input set for smoke run',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: compileResult.taskRun?._id || null,
          structureArtifactId: modelingResult.finalStructureArtifact._id,
        });
      }

      const profile = getComputeProfile('server_local');
      if (!profile || !profile.configured) {
        return res.status(409).json({
          ok: false,
          error: 'server_local profile is not configured',
          diagnostics,
        });
      }

      const submitTaskRun = await runtimeCore.withTransaction(async (tx) =>
        runtimeCore.createAndStageTaskRun({
          session,
          goalArtifact,
          planArtifact,
          taskSpec: {
            stepId: sanitizeStepId(`${stepIdPrefix}-submit-job`),
            skillId: 'submit_compute_job',
            agentId: 'compute-subagent',
            inputArtifacts: [
              ...(goalArtifact ? [goalArtifact._id] : []),
              compileResult.computeInputArtifact._id,
            ],
            retryable: true,
            approvalRequired: false,
          },
          tx,
        })
      );

      if (submitTaskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'Compute submit task was blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: submitTaskRun._id,
          computeInputSetArtifactId: compileResult.computeInputArtifact._id,
        });
      }

      const computePayloadDocument = await runtimeCore.artifactStorage.readJsonPayload(compileResult.computeInputArtifact.payloadRef);
      const computePayload = computePayloadDocument?.payload || {};
      const computeFiles = computePayload?.files && typeof computePayload.files === 'object'
        ? computePayload.files
        : null;
      if (!computeFiles || Object.keys(computeFiles).length === 0) {
        return res.status(409).json({
          ok: false,
          error: 'Compiled compute input set does not contain materialized input files',
        });
      }

      const preflight = await policyEngine.runPreflight({
        effectType: 'external_submit',
        inputArtifacts: [compileResult.computeInputArtifact._id],
      });
      if (!preflight?.ok) {
        const blockedTaskRun = await runtimeCore.withTransaction(async (tx) => {
          const transitioned = await runtimeCore.taskRunService.transitionTaskRun({
            taskRunId: submitTaskRun._id,
            toStatus: 'blocked',
            patch: {
              terminalReason: preflight?.reason || 'compute_submit_preflight_failed',
            },
            tx,
          });

          await runtimeCore.eventService.emitEvent(
            {
              sessionId: session._id,
              taskRunId: transitioned._id,
              category: 'system',
              type: 'task_run.blocked',
              producerType: 'policy',
              correlationId: transitioned.correlationId,
              payload: {
                taskRunId: transitioned._id,
                reason: preflight?.reason || 'compute_submit_preflight_failed',
              },
            },
            tx
          );

          return transitioned;
        });

        return res.status(409).json({
          ok: false,
          error: preflight?.reason || 'Compute submit preflight failed',
          sessionId: session._id,
          taskRunId: blockedTaskRun._id,
          computeInputSetArtifactId: compileResult.computeInputArtifact._id,
        });
      }

      const approvalContext = buildComputeSubmitExecutionContext({
        sessionId: session._id,
        taskRunId: submitTaskRun._id,
        computeInputSetArtifactId: compileResult.computeInputArtifact._id,
        profileId: profile.id,
        workflow: computePayload?.meta?.workflow || compileResult.computeInputArtifact.preview?.workflow || workflow,
        quality: computePayload?.meta?.quality || compileResult.computeInputArtifact.preview?.quality || quality,
        generatedFileCount: Object.keys(computeFiles).length,
        formula: computePayload?.meta?.formula || compileResult.computeInputArtifact.preview?.formula || null,
      });

      const jobRunId = buildDeterministicJobRunId({
        taskRunId: submitTaskRun._id,
        idempotencyKey: approvalContext.idempotencyKey,
      });
      const existingJobRun = await runtimeCore.jobRunService.getJobRunById(jobRunId);
      if (existingJobRun) {
        return res.json({
          ok: true,
          smoke: true,
          alreadySubmitted: true,
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          structureArtifactId: modelingResult.finalStructureArtifact._id,
          computeInputSetArtifactId: compileResult.computeInputArtifact._id,
          taskRunId: submitTaskRun._id,
          jobRunId: existingJobRun._id,
          jobStatus: existingJobRun.status,
          externalJobId: existingJobRun.externalJobId || null,
          profile,
        });
      }

      const materializedWorkdir = await runtimeCore.jobStorage.materializeComputeWorkdir({
        jobRunId,
        computeInputSetArtifact: compileResult.computeInputArtifact.toObject
          ? compileResult.computeInputArtifact.toObject()
          : compileResult.computeInputArtifact,
        computeInputPayload: computePayload,
        profile,
      });

      if (!materializedWorkdir?.potcar?.materialized) {
        return res.status(409).json({
          ok: false,
          error: 'Server-local smoke requires a materialized POTCAR. Configure VASP_PSP_DIR, VASP_POTCAR_DIR, or POTCAR_LIBRARY_DIR first.',
          profileId: profile.id,
          potcar: materializedWorkdir?.potcar || null,
          diagnostics,
        });
      }

      const submissionDetails = await submitComputeJob({
        profile,
        computeInputSetArtifact: compileResult.computeInputArtifact,
        computeInputPayload: computePayload,
        workDir: materializedWorkdir.workDir,
        executionDir: materializedWorkdir.inputDir,
        idempotencyKey: approvalContext.idempotencyKey,
      });

      const runtimeStatusRef = path.join(materializedWorkdir.workDir, 'runtime-status.json');
      await runtimeCore.jobStorage.writeJsonSnapshot(runtimeStatusRef, {
        jobRunId,
        externalJobId: submissionDetails.externalJobId,
        status: 'submitted',
        profileId: profile.id,
        resolvedSystem: submissionDetails.resolvedSystem,
        submissionMode: submissionDetails.submissionMode,
        schedulerRef: submissionDetails.schedulerRef,
        accessMode: submissionDetails.accessMode || null,
        remoteWorkDir: submissionDetails.remoteWorkDir || null,
        computeInputSetArtifactId: compileResult.computeInputArtifact._id,
        submittedAt: new Date().toISOString(),
      });

      const submission = await runtimeCore.withTransaction(async (tx) => {
        const runningTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: submitTaskRun._id,
          toStatus: 'running',
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: session._id,
            taskRunId: runningTaskRun._id,
            category: 'system',
            type: 'task_run.started',
            producerType: 'execution',
            correlationId: runningTaskRun.correlationId,
            payload: {
              taskRunId: runningTaskRun._id,
              planId: planArtifact._id,
              stepId: runningTaskRun.stepId,
              profileId: profile.id,
              computeInputSetArtifactId: compileResult.computeInputArtifact._id,
              smoke: true,
            },
          },
          tx
        );

        await runtimeCore.artifactService.freezeArtifact({
          artifactId: compileResult.computeInputArtifact._id,
          reason: 'referenced_by_job_run',
          consumedByTaskRunId: runningTaskRun._id,
          tx,
        });

        const jobRun = await runtimeCore.jobRunService.createJobRun(
          {
            _id: jobRunId,
            sessionId: session._id,
            taskRunId: runningTaskRun._id,
            system: submissionDetails.resolvedSystem,
            status: 'submitted',
            materializationStatus: 'pending',
            schedulerRef: submissionDetails.schedulerRef || profile.schedulerRef || profile.id,
            snapshotRef: materializedWorkdir.snapshotRef,
            externalJobId: submissionDetails.externalJobId,
            retryable: true,
            submittedAt: new Date(),
          },
          tx
        );

        const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: runningTaskRun._id,
          toStatus: 'succeeded',
          patch: {
            metrics: {
              submittedJobs: 1,
              generatedFileCount: Object.keys(computeFiles).length,
              profileId: profile.id,
              smoke: true,
            },
          },
          tx,
        });

        await runtimeCore.eventService.emitEvents(
          [
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'job_run.submitted',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                jobRunId: jobRun._id,
                externalJobId: jobRun.externalJobId,
                schedulerRef: jobRun.schedulerRef,
                profileId: profile.id,
                resolvedSystem: submissionDetails.resolvedSystem,
                submissionMode: submissionDetails.submissionMode,
                submissionOutput: submissionDetails.submissionOutput,
                computeInputSetArtifactId: compileResult.computeInputArtifact._id,
                smoke: true,
              },
            },
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'task_run.succeeded',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                taskRunId: runningTaskRun._id,
                submittedJobRunId: jobRun._id,
              },
            },
          ],
          tx
        );

        return {
          taskRun: succeededTaskRun,
          jobRun,
        };
      });

      return res.status(201).json({
        ok: true,
        smoke: true,
        sessionId: session._id,
        goalArtifactId: goalArtifact?._id || null,
        planArtifactId: planArtifact._id,
        structureArtifactId: modelingResult.finalStructureArtifact._id,
        computeInputSetArtifactId: compileResult.computeInputArtifact._id,
        taskRunId: submission.taskRun._id,
        jobRunId: submission.jobRun._id,
        jobStatus: submission.jobRun.status,
        externalJobId: submission.jobRun.externalJobId || null,
        profile,
        submissionMode: submissionDetails.submissionMode,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/compute/submit-job', async (req, res) => {
    try {
      await connectRuntimeDb();
      await runtimeCore.skillService.ensureBuiltinSkills();

      const approvalRequestId = req.body.approvalRequestId
        ? String(req.body.approvalRequestId).trim()
        : undefined;
      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
      const requestedComputeInputSetArtifactId = req.body.computeInputSetArtifactId
        ? String(req.body.computeInputSetArtifactId).trim()
        : undefined;

      let session;
      let goalArtifact;
      let planArtifact;
      let computeInputSetArtifact;
      let taskRun;
      let approvalRequest;
      let profile;

      if (approvalRequestId) {
        approvalRequest = await runtimeCore.approvalService.getApprovalRequestById(approvalRequestId);
        if (!approvalRequest) {
          return res.status(404).json({ ok: false, error: 'Approval not found' });
        }

        taskRun = await runtimeCore.taskRunService.getTaskRunById(approvalRequest.taskRunId);
        if (!taskRun) {
          return res.status(404).json({ ok: false, error: 'TaskRun for approval not found' });
        }

        const loaded = await loadSessionRuntimeInputs(runtimeCore, taskRun.sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        const inputArtifactIds = Array.isArray(taskRun.inputArtifacts) ? taskRun.inputArtifacts : [];
        computeInputSetArtifact = await loadComputeInputSetArtifact({
          sessionId: session._id,
          computeInputSetArtifactId: requestedComputeInputSetArtifactId
            || inputArtifactIds.find((artifactId) => String(artifactId).startsWith('art_')),
        });
        if (!computeInputSetArtifact) {
          computeInputSetArtifact = await ArtifactModel.findOne({
            _id: { $in: inputArtifactIds },
            kind: 'compute_input_set',
          }).sort({ createdAt: -1 });
        }
        if (!computeInputSetArtifact) {
          return res.status(404).json({ ok: false, error: 'Compute input set for approved task not found' });
        }

        profile = getComputeProfile(req.body.profileId || parseComputeProfileFromTargetRef(approvalRequest.targetRef));
      } else {
        if (!sessionId) {
          return res.status(400).json({ ok: false, error: 'sessionId is required' });
        }

        const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        computeInputSetArtifact = await loadComputeInputSetArtifact({
          sessionId: session._id,
          computeInputSetArtifactId: requestedComputeInputSetArtifactId,
        });
        if (!computeInputSetArtifact) {
          return res.status(404).json({ ok: false, error: 'No compute input set artifact was found' });
        }

        profile = getComputeProfile(req.body.profileId);
        if (!profile) {
          return res.status(400).json({ ok: false, error: 'Unknown compute profile' });
        }
        if (!profile.configured) {
          return res.status(409).json({
            ok: false,
            error: `Compute profile ${profile.id} is not configured in this environment`,
          });
        }

        const firstStep = buildFirstStep(req.body, {
          firstStepId: `compute-submit-${Date.now()}`,
          firstSkillId: 'submit_compute_job',
          firstAgentId: 'compute-subagent',
        });

        taskRun = await runtimeCore.withTransaction(async (tx) =>
          runtimeCore.createAndStageTaskRun({
            session,
            goalArtifact,
            planArtifact,
            taskSpec: {
              ...firstStep,
              approvalRequired: Boolean(profile.requiresApproval),
              retryable: true,
              inputArtifacts: [
                ...(goalArtifact ? [goalArtifact._id] : []),
                computeInputSetArtifact._id,
              ],
            },
            tx,
          })
        );

        if (taskRun.status === 'blocked') {
          return res.status(409).json({
            ok: false,
            error: 'TaskRun blocked by preflight',
            sessionId: session._id,
            planArtifactId: planArtifact._id,
            taskRunId: taskRun._id,
            taskRunStatus: taskRun.status,
          });
        }
      }

      if (!profile) {
        return res.status(400).json({ ok: false, error: 'Unable to resolve compute profile' });
      }
      if (!profile.configured) {
        return res.status(409).json({
          ok: false,
          error: `Compute profile ${profile.id} is not configured in this environment`,
        });
      }
      const computePayloadDocument = await runtimeCore.artifactStorage.readJsonPayload(computeInputSetArtifact.payloadRef);
      const computePayload = computePayloadDocument?.payload || {};
      const computeFiles = computePayload?.files && typeof computePayload.files === 'object'
        ? computePayload.files
        : null;
      if (!computeFiles || Object.keys(computeFiles).length === 0) {
        return res.status(409).json({
          ok: false,
          error: 'Compute input set artifact does not contain materialized input files',
        });
      }

      const preflight = await policyEngine.runPreflight({
        effectType: 'external_submit',
        inputArtifacts: [computeInputSetArtifact._id],
      });
      if (!preflight?.ok) {
        taskRun = await runtimeCore.withTransaction(async (tx) => {
          const blockedTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
            taskRunId: taskRun._id,
            toStatus: 'blocked',
            patch: {
              terminalReason: preflight?.reason || 'compute_submit_preflight_failed',
            },
            tx,
          });

          await runtimeCore.eventService.emitEvent(
            {
              sessionId: session._id,
              taskRunId: taskRun._id,
              category: 'system',
              type: 'task_run.blocked',
              producerType: 'policy',
              correlationId: taskRun.correlationId,
              payload: {
                taskRunId: taskRun._id,
                reason: preflight?.reason || 'compute_submit_preflight_failed',
              },
            },
            tx
          );

          return blockedTaskRun;
        });

        return res.status(409).json({
          ok: false,
          error: preflight?.reason || 'Compute submit preflight failed',
          sessionId: session._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const risk = await policyEngine.evaluateRisk({
        effectType: 'external_submit',
        estimatedCost: {
          profileId: profile.id,
          workflow: computePayload?.meta?.workflow || computeInputSetArtifact.preview?.workflow || null,
          quality: computePayload?.meta?.quality || computeInputSetArtifact.preview?.quality || null,
          generatedFileCount: Object.keys(computeFiles).length,
          formula: computePayload?.meta?.formula || computeInputSetArtifact.preview?.formula || null,
        },
      });

      const approvalContext = buildComputeSubmitExecutionContext({
        sessionId: session._id,
        taskRunId: taskRun._id,
        computeInputSetArtifactId: computeInputSetArtifact._id,
        profileId: profile.id,
        workflow: computePayload?.meta?.workflow || computeInputSetArtifact.preview?.workflow || 'relax',
        quality: computePayload?.meta?.quality || computeInputSetArtifact.preview?.quality || 'standard',
        generatedFileCount: Object.keys(computeFiles).length,
        formula: computePayload?.meta?.formula || computeInputSetArtifact.preview?.formula || null,
      });

      if (!approvalRequest && (profile.requiresApproval || risk.approvalRequired)) {
        approvalRequest = await runtimeCore.withTransaction(async (tx) => {
          const createdApproval = await runtimeCore.approvalService.createApprovalRequest({
            sessionId: session._id,
            taskRunId: taskRun._id,
            targetType: 'tool_call',
            targetRef: approvalContext.targetRef,
            reason: `Compute submission to profile ${profile.id} is approval-gated because it creates an external execution side effect`,
            estimatedCost: approvalContext.estimatedCost,
            snapshotRef: `draft://approvals/${taskRun._id}/compute-submit-job`,
            requestedBy: 'runtime-demo',
            policyId: approvalContext.policyId,
            approvalScope: 'single_execution',
            riskSnapshotHash: approvalContext.riskSnapshotHash,
            approvedIdempotencyKey: approvalContext.idempotencyKey,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          }, tx);

          await runtimeCore.taskRunService.attachApproval({
            taskRunId: taskRun._id,
            approvalRequestId: createdApproval._id,
            tx,
          });

          await runtimeCore.taskRunService.transitionTaskRun({
            taskRunId: taskRun._id,
            toStatus: 'waiting_approval',
            tx,
          });

          await runtimeCore.eventService.emitEvents(
            [
              {
                sessionId: session._id,
                taskRunId: taskRun._id,
                category: 'system',
                type: 'approval.requested',
                producerType: 'policy',
                correlationId: taskRun.correlationId,
                payload: {
                  approvalRequestId: createdApproval._id,
                  targetRef: approvalContext.targetRef,
                  estimatedCost: approvalContext.estimatedCost,
                },
              },
              {
                sessionId: session._id,
                taskRunId: taskRun._id,
                category: 'system',
                type: 'task_run.waiting_approval',
                producerType: 'policy',
                correlationId: taskRun.correlationId,
                payload: {
                  taskRunId: taskRun._id,
                  approvalRequestId: createdApproval._id,
                },
              },
            ],
            tx
          );

          return createdApproval;
        });

        return res.status(202).json({
          ok: true,
          approvalRequired: true,
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: 'waiting_approval',
          computeInputSetArtifactId: computeInputSetArtifact._id,
          profile,
          approvalRequestId: approvalRequest._id,
          approvalStatus: approvalRequest.status,
        });
      }

      if (approvalRequest) {
        const applicability = await policyEngine.validateApprovalApplicability({
          approvalRequest,
          targetRef: approvalContext.targetRef,
          policyId: approvalContext.policyId,
          riskSnapshotHash: approvalContext.riskSnapshotHash,
          idempotencyKey: approvalContext.idempotencyKey,
        });

        if (!applicability.ok) {
          return res.status(409).json({
            ok: false,
            error: applicability.reason || 'Approval is not applicable to this execution',
          });
        }

        if (taskRun.status === 'waiting_approval') {
          taskRun = await runtimeCore.withTransaction(async (tx) => {
            const resumed = await runtimeCore.taskRunService.transitionTaskRun({
              taskRunId: taskRun._id,
              toStatus: 'queued',
              patch: {
                terminalReason: undefined,
              },
              tx,
            });

            await runtimeCore.eventService.emitEvent(
              {
                sessionId: session._id,
                taskRunId: taskRun._id,
                category: 'system',
                type: 'task_run.queued',
                producerType: 'policy',
                correlationId: taskRun.correlationId,
                payload: {
                  taskRunId: taskRun._id,
                  resumedFromApproval: true,
                  approvalRequestId: approvalRequest._id,
                },
              },
              tx
            );

            return resumed;
          });
        }
      }

      const jobRunId = buildDeterministicJobRunId({
        taskRunId: taskRun._id,
        idempotencyKey: approvalContext.idempotencyKey,
      });
      const existingJobRun = await runtimeCore.jobRunService.getJobRunById(jobRunId);
      if (existingJobRun) {
        return res.json({
          ok: true,
          alreadySubmitted: true,
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          jobRunId: existingJobRun._id,
          jobStatus: existingJobRun.status,
          externalJobId: existingJobRun.externalJobId || null,
          computeInputSetArtifactId: computeInputSetArtifact._id,
          profile,
        });
      }

      if (profile.mode === 'pbs_agent') {
        const queuedForAgent = await runtimeCore.withTransaction(async (tx) => {
          const runningTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
            taskRunId: taskRun._id,
            toStatus: 'running',
            tx,
          });

          await runtimeCore.eventService.emitEvent(
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              category: 'system',
              type: 'task_run.started',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                taskRunId: runningTaskRun._id,
                planId: planArtifact._id,
                stepId: runningTaskRun.stepId,
                profileId: profile.id,
                computeInputSetArtifactId: computeInputSetArtifact._id,
                queuedForAgent: true,
              },
            },
            tx
          );

          await runtimeCore.artifactService.freezeArtifact({
            artifactId: computeInputSetArtifact._id,
            reason: 'referenced_by_job_run',
            consumedByTaskRunId: runningTaskRun._id,
            tx,
          });

          const jobRun = await runtimeCore.jobRunService.createJobRun(
            {
              _id: jobRunId,
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              system: 'pbs',
              status: 'created',
              materializationStatus: 'pending',
              schedulerRef: profile.schedulerRef || profile.id,
              snapshotRef: `agent://${jobRunId}`,
              retryable: true,
            },
            tx
          );

          const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
            taskRunId: runningTaskRun._id,
            toStatus: 'succeeded',
            patch: {
              metrics: {
                queuedForAgent: 1,
                generatedFileCount: Object.keys(computeFiles).length,
                profileId: profile.id,
              },
            },
            tx,
          });

          await runtimeCore.eventService.emitEvents(
            [
              {
                sessionId: session._id,
                taskRunId: runningTaskRun._id,
                jobRunId: jobRun._id,
                category: 'system',
                type: 'job_run.agent_queued',
                producerType: 'execution',
                correlationId: runningTaskRun.correlationId,
                payload: {
                  jobRunId: jobRun._id,
                  schedulerRef: jobRun.schedulerRef,
                  profileId: profile.id,
                  computeInputSetArtifactId: computeInputSetArtifact._id,
                },
              },
              {
                sessionId: session._id,
                taskRunId: runningTaskRun._id,
                jobRunId: jobRun._id,
                category: 'system',
                type: 'task_run.succeeded',
                producerType: 'execution',
                correlationId: runningTaskRun.correlationId,
                payload: {
                  taskRunId: runningTaskRun._id,
                  queuedJobRunId: jobRun._id,
                },
              },
            ],
            tx
          );

          return {
            taskRun: succeededTaskRun,
            jobRun,
          };
        });

        return res.status(202).json({
          ok: true,
          queuedForAgent: true,
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: queuedForAgent.taskRun._id,
          taskRunStatus: queuedForAgent.taskRun.status,
          computeInputSetArtifactId: computeInputSetArtifact._id,
          jobRunId: queuedForAgent.jobRun._id,
          jobStatus: queuedForAgent.jobRun.status,
          profile,
        });
      }

      const materializedWorkdir = await runtimeCore.jobStorage.materializeComputeWorkdir({
        jobRunId,
        computeInputSetArtifact: computeInputSetArtifact.toObject ? computeInputSetArtifact.toObject() : computeInputSetArtifact,
        computeInputPayload: computePayload,
        profile,
      });

      if (profile.system === 'slurm' && !materializedWorkdir?.potcar?.materialized) {
        return res.status(409).json({
          ok: false,
          error: 'Slurm submission requires a materialized POTCAR. Configure VASP_PSP_DIR, VASP_POTCAR_DIR, or POTCAR_LIBRARY_DIR first.',
          profileId: profile.id,
          potcar: materializedWorkdir?.potcar || null,
        });
      }

      const submissionDetails = await submitComputeJob({
        profile,
        computeInputSetArtifact,
        computeInputPayload: computePayload,
        workDir: materializedWorkdir.workDir,
        executionDir: materializedWorkdir.inputDir,
        idempotencyKey: approvalContext.idempotencyKey,
      });

      const runtimeStatusRef = path.join(materializedWorkdir.workDir, 'runtime-status.json');
      await runtimeCore.jobStorage.writeJsonSnapshot(runtimeStatusRef, {
        jobRunId,
        externalJobId: submissionDetails.externalJobId,
        status: 'submitted',
        profileId: profile.id,
        resolvedSystem: submissionDetails.resolvedSystem,
        submissionMode: submissionDetails.submissionMode,
        schedulerRef: submissionDetails.schedulerRef,
        accessMode: submissionDetails.accessMode || null,
        remoteWorkDir: submissionDetails.remoteWorkDir || null,
        computeInputSetArtifactId: computeInputSetArtifact._id,
        submittedAt: new Date().toISOString(),
      });

      const submission = await runtimeCore.withTransaction(async (tx) => {
        const runningTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: taskRun._id,
          toStatus: 'running',
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: session._id,
            taskRunId: runningTaskRun._id,
            category: 'system',
            type: 'task_run.started',
            producerType: 'execution',
            correlationId: runningTaskRun.correlationId,
            payload: {
              taskRunId: runningTaskRun._id,
              planId: planArtifact._id,
              stepId: runningTaskRun.stepId,
              profileId: profile.id,
              computeInputSetArtifactId: computeInputSetArtifact._id,
            },
          },
          tx
        );

        await runtimeCore.artifactService.freezeArtifact({
          artifactId: computeInputSetArtifact._id,
          reason: 'referenced_by_job_run',
          consumedByTaskRunId: runningTaskRun._id,
          tx,
        });

        const jobRun = await runtimeCore.jobRunService.createJobRun(
          {
            _id: jobRunId,
            sessionId: session._id,
            taskRunId: runningTaskRun._id,
            system: submissionDetails.resolvedSystem,
            status: 'submitted',
            materializationStatus: 'pending',
            schedulerRef: submissionDetails.schedulerRef || profile.schedulerRef || profile.id,
            snapshotRef: materializedWorkdir.snapshotRef,
            externalJobId: submissionDetails.externalJobId,
            retryable: true,
            submittedAt: new Date(),
          },
          tx
        );

        const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: runningTaskRun._id,
          toStatus: 'succeeded',
          patch: {
            metrics: {
              submittedJobs: 1,
              generatedFileCount: Object.keys(computeFiles).length,
              profileId: profile.id,
            },
          },
          tx,
        });

        await runtimeCore.eventService.emitEvents(
          [
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'job_run.submitted',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                jobRunId: jobRun._id,
                externalJobId: jobRun.externalJobId,
                schedulerRef: jobRun.schedulerRef,
                profileId: profile.id,
                resolvedSystem: submissionDetails.resolvedSystem,
                submissionMode: submissionDetails.submissionMode,
                submissionOutput: submissionDetails.submissionOutput,
                computeInputSetArtifactId: computeInputSetArtifact._id,
              },
            },
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'task_run.succeeded',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                taskRunId: runningTaskRun._id,
                submittedJobRunId: jobRun._id,
              },
            },
          ],
          tx
        );

        return {
          taskRun: succeededTaskRun,
          jobRun,
        };
      });

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        planArtifactId: planArtifact._id,
        taskRunId: submission.taskRun._id,
        taskRunStatus: submission.taskRun.status,
        computeInputSetArtifactId: computeInputSetArtifact._id,
        jobRunId: submission.jobRun._id,
        jobStatus: submission.jobRun.status,
        externalJobId: submission.jobRun.externalJobId || null,
        jobSystem: submission.jobRun.system,
        profile,
        submissionMode: submissionDetails.submissionMode,
        submissionOutput: submissionDetails.submissionOutput,
        snapshotRef: submission.jobRun.snapshotRef || null,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/admin/run-approval-expiry-sweeper', async (req, res) => {
    try {
      await connectRuntimeDb();

      const limit = parseListLimit(req.body?.limit, 50, 200);
      const result = await runApprovalExpirySweeper({
        runtimeCore,
        limit,
        now: new Date(),
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/admin/run-job-monitor', async (req, res) => {
    try {
      await connectRuntimeDb();

      const limit = parseListLimit(req.body?.limit, 50, 200);
      const result = await runJobMonitor({
        runtimeCore,
        policyEngine,
        limit,
        now: new Date(),
        thresholds: {
          queueAfterMs: Math.max(0, Number(req.body?.queueAfterMs || 1 * 1000)),
          runningAfterMs: Math.max(500, Number(req.body?.runningAfterMs || 3 * 1000)),
          completeAfterMs: Math.max(1500, Number(req.body?.completeAfterMs || 8 * 1000)),
        },
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/admin/run-harvest-lagging-monitor', async (req, res) => {
    try {
      await connectRuntimeDb();

      const limit = parseListLimit(req.body?.limit, 50, 200);
      const lagThresholdMs = Math.max(
        10 * 1000,
        Number(req.body?.lagThresholdMs || 5 * 60 * 1000)
      );
      const emitEvents = req.body?.emitEvents !== false;

      const result = await runHarvestLaggingMonitor({
        runtimeCore,
        limit,
        lagThresholdMs,
        emitEvents,
        now: new Date(),
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/compute/agent/jobs', async (req, res) => {
    try {
      if (!ensureComputeAgentAuthorized(req, res)) {
        return;
      }

      await connectRuntimeDb();
      const profile = getComputeProfile('pbs_via_local_agent');
      if (!profile) {
        return res.status(404).json({ ok: false, error: 'Local compute-agent profile is unavailable' });
      }

      const requestedStatuses = String(req.query.statuses || 'created,submitted,queued,running,completed')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const allowedStatuses = new Set(['created', 'submitted', 'queued', 'running', 'completed']);
      const statuses = requestedStatuses.filter((item) => allowedStatuses.has(item));
      const limit = parseListLimit(req.query.limit, 20, 100);

      const jobRuns = await JobRunModel.find({
        system: 'pbs',
        schedulerRef: profile.schedulerRef || profile.id,
        status: { $in: statuses.length > 0 ? statuses : ['created', 'submitted', 'queued', 'running', 'completed'] },
      })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean();

      const jobs = [];
      for (const jobRun of jobRuns) {
        const taskRun = await TaskRunModel.findById(jobRun.taskRunId).lean();
        if (!taskRun) {
          continue;
        }

        const computeInputSetArtifact = await ArtifactModel.findOne({
          _id: { $in: Array.isArray(taskRun.inputArtifacts) ? taskRun.inputArtifacts : [] },
          kind: 'compute_input_set',
        }).lean();

        let computeInputPayload = null;
        if (jobRun.status === 'created' && computeInputSetArtifact) {
          try {
            const payload = await readArtifactPayloadJson(computeInputSetArtifact);
            computeInputPayload = payload && payload.payload ? payload.payload : payload;
          } catch (_error) {
            computeInputPayload = null;
          }
        }

        jobs.push({
          jobRun,
          taskRun: {
            _id: taskRun._id,
            sessionId: taskRun.sessionId,
            planId: taskRun.planId,
            stepId: taskRun.stepId,
            skillId: taskRun.skillId,
            status: taskRun.status,
            correlationId: taskRun.correlationId,
            createdAt: taskRun.createdAt,
            updatedAt: taskRun.updatedAt,
          },
          computeInputSetArtifact: computeInputSetArtifact
            ? {
              _id: computeInputSetArtifact._id,
              lineageRootId: computeInputSetArtifact.lineageRootId,
              version: computeInputSetArtifact.version,
              preview: computeInputSetArtifact.preview || {},
              summary: computeInputSetArtifact.summary || null,
            }
            : null,
          computeInputPayload,
          executionProfileId: 'pbs_default',
        });
      }

      return res.json({
        ok: true,
        profileId: profile.id,
        schedulerRef: profile.schedulerRef || profile.id,
        jobs,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/compute/agent/jobs/:jobRunId/submit', async (req, res) => {
    try {
      if (!ensureComputeAgentAuthorized(req, res)) {
        return;
      }

      await connectRuntimeDb();
      const jobRunId = String(req.params.jobRunId || '').trim();
      const externalJobId = String(req.body.externalJobId || '').trim();
      const remoteWorkDir = String(req.body.remoteWorkDir || '').trim();
      const schedulerRef = String(req.body.schedulerRef || '').trim();
      const submissionMode = String(req.body.submissionMode || 'local_compute_agent').trim();
      const submissionOutput = String(req.body.submissionOutput || '').trim();
      const agentId = String(req.body.agentId || '').trim() || 'local-compute-agent';

      if (!jobRunId || !externalJobId) {
        return res.status(400).json({ ok: false, error: 'jobRunId and externalJobId are required' });
      }

      const existingJobRun = await JobRunModel.findById(jobRunId).lean();
      if (!existingJobRun) {
        return res.status(404).json({ ok: false, error: 'JobRun not found' });
      }

      if (existingJobRun.status !== 'created') {
        return res.json({
          ok: true,
          alreadyHandled: true,
          jobRunId: existingJobRun._id,
          status: existingJobRun.status,
          externalJobId: existingJobRun.externalJobId || null,
        });
      }

      const taskRun = await TaskRunModel.findById(existingJobRun.taskRunId).lean();
      const updatedJobRun = await runtimeCore.withTransaction(async (tx) => {
        const transitioned = await runtimeCore.jobRunService.transitionJobRun({
          jobRunId: existingJobRun._id,
          toStatus: 'submitted',
          patch: {
            externalJobId,
            schedulerRef: schedulerRef || existingJobRun.schedulerRef,
            snapshotRef: remoteWorkDir || existingJobRun.snapshotRef,
            lastHeartbeatAt: new Date(),
          },
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: transitioned.sessionId,
            taskRunId: transitioned.taskRunId,
            jobRunId: transitioned._id,
            category: 'system',
            type: 'job_run.submitted',
            producerType: 'tool',
            correlationId: taskRun?.correlationId,
            payload: {
              jobRunId: transitioned._id,
              externalJobId,
              schedulerRef: transitioned.schedulerRef,
              remoteWorkDir: remoteWorkDir || null,
              submissionMode,
              submissionOutput: submissionOutput || null,
              agentId,
            },
          },
          tx
        );

        return transitioned;
      });

      return res.json({
        ok: true,
        jobRunId: updatedJobRun._id,
        status: updatedJobRun.status,
        externalJobId: updatedJobRun.externalJobId || null,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/compute/agent/jobs/:jobRunId/status', async (req, res) => {
    try {
      if (!ensureComputeAgentAuthorized(req, res)) {
        return;
      }

      await connectRuntimeDb();
      const jobRunId = String(req.params.jobRunId || '').trim();
      const nextStatus = String(req.body.status || '').trim();
      const allowedStatuses = new Set(['submitted', 'queued', 'running', 'completed', 'failed', 'cancelled']);
      if (!jobRunId || !allowedStatuses.has(nextStatus)) {
        return res.status(400).json({ ok: false, error: 'jobRunId and a valid status are required' });
      }

      const existingJobRun = await JobRunModel.findById(jobRunId).lean();
      if (!existingJobRun) {
        return res.status(404).json({ ok: false, error: 'JobRun not found' });
      }

      const taskRun = await TaskRunModel.findById(existingJobRun.taskRunId).lean();
      const remoteWorkDir = String(req.body.remoteWorkDir || '').trim();
      const schedulerState = String(req.body.schedulerState || '').trim();
      const terminalReason = String(req.body.terminalReason || '').trim();
      const statusDetails = req.body.details && typeof req.body.details === 'object' ? req.body.details : null;
      const now = new Date();

      const updatedJobRun = await runtimeCore.withTransaction(async (tx) => {
        if (existingJobRun.status === nextStatus && !['completed', 'failed', 'cancelled'].includes(nextStatus)) {
          const heartbeat = await runtimeCore.jobRunService.heartbeat({
            jobRunId: existingJobRun._id,
            lastHeartbeatAt: now,
            tx,
          });

          await runtimeCore.eventService.emitEvent(
            {
              sessionId: heartbeat.sessionId,
              taskRunId: heartbeat.taskRunId,
              jobRunId: heartbeat._id,
              category: 'system',
              type: 'job_run.heartbeat',
              producerType: 'tool',
              correlationId: taskRun?.correlationId,
              payload: {
                jobRunId: heartbeat._id,
                status: heartbeat.status,
                schedulerState: schedulerState || null,
                remoteWorkDir: remoteWorkDir || heartbeat.snapshotRef || null,
                details: statusDetails,
              },
            },
            tx
          );

          return heartbeat;
        }

        const transitioned = await runtimeCore.jobRunService.transitionJobRun({
          jobRunId: existingJobRun._id,
          toStatus: nextStatus,
          patch: {
            lastHeartbeatAt: now,
            snapshotRef: remoteWorkDir || existingJobRun.snapshotRef,
            terminalReason: terminalReason || existingJobRun.terminalReason,
          },
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: transitioned.sessionId,
            taskRunId: transitioned.taskRunId,
            jobRunId: transitioned._id,
            category: 'system',
            type: `job_run.${nextStatus}`,
            producerType: 'tool',
            correlationId: taskRun?.correlationId,
            payload: {
              jobRunId: transitioned._id,
              status: nextStatus,
              schedulerState: schedulerState || null,
              remoteWorkDir: remoteWorkDir || transitioned.snapshotRef || null,
              terminalReason: terminalReason || null,
              details: statusDetails,
            },
          },
          tx
        );

        return transitioned;
      });

      return res.json({
        ok: true,
        jobRunId: updatedJobRun._id,
        status: updatedJobRun.status,
        materializationStatus: updatedJobRun.materializationStatus || null,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/compute/agent/jobs/:jobRunId/materialize', async (req, res) => {
    try {
      if (!ensureComputeAgentAuthorized(req, res)) {
        return;
      }

      await connectRuntimeDb();
      const jobRunId = String(req.params.jobRunId || '').trim();
      const resultPayload = req.body.resultPayload && typeof req.body.resultPayload === 'object'
        ? req.body.resultPayload
        : null;
      if (!jobRunId || !resultPayload) {
        return res.status(400).json({ ok: false, error: 'jobRunId and resultPayload are required' });
      }

      const jobRun = await JobRunModel.findById(jobRunId).lean();
      if (!jobRun) {
        return res.status(404).json({ ok: false, error: 'JobRun not found' });
      }
      if (jobRun.resultArtifactId && jobRun.materializationStatus === 'materialized') {
        return res.json({
          ok: true,
          alreadyMaterialized: true,
          jobRunId: jobRun._id,
          resultArtifactId: jobRun.resultArtifactId,
        });
      }

      const taskRun = await TaskRunModel.findById(jobRun.taskRunId).lean();
      if (!taskRun) {
        return res.status(404).json({ ok: false, error: 'TaskRun not found for JobRun' });
      }

      const computeInputSetArtifact = await ArtifactModel.findOne({
        _id: { $in: Array.isArray(taskRun.inputArtifacts) ? taskRun.inputArtifacts : [] },
        kind: 'compute_input_set',
      }).lean();

      const resultSummary = String(resultPayload.summary || `Remote compute result for ${computeInputSetArtifact?.preview?.formula || 'unknown structure'}`).trim();
      const preview = summarizeResultBundlePayload(resultPayload) || {};

      const materialized = await runtimeCore.withTransaction(async (tx) => {
        let updatedJobRun = jobRun;
        if (updatedJobRun.status !== 'completed') {
          updatedJobRun = await runtimeCore.jobRunService.transitionJobRun({
            jobRunId: updatedJobRun._id,
            toStatus: 'completed',
            tx,
          });
        }

        const resultArtifact = await runtimeCore.artifactService.createArtifact(
          {
            kind: 'result_bundle',
            sessionId: taskRun.sessionId,
            sourceArtifacts: computeInputSetArtifact ? [computeInputSetArtifact._id] : [],
            producedByTaskRun: taskRun._id,
            producedBySkill: 'harvest_remote_result',
            status: 'ready',
            lifecycleStage: 'validated',
            preview,
            summary: resultSummary,
          },
          tx
        );

        const payloadMeta = await runtimeCore.artifactStorage.materializeJsonPayload({
          artifactId: resultArtifact._id,
          lineageRootId: resultArtifact.lineageRootId,
          version: resultArtifact.version,
          payload: resultPayload,
        });

        const updatedArtifact = await runtimeCore.artifactService.updateArtifactPayload({
          artifactId: resultArtifact._id,
          payloadRef: payloadMeta.payloadRef,
          payloadType: payloadMeta.payloadType,
          mimeType: payloadMeta.mimeType,
          blobSizeBytes: payloadMeta.blobSizeBytes,
          contentHash: payloadMeta.contentHash,
          tx,
        });

        await runtimeCore.taskRunService.appendOutputArtifacts({
          taskRunId: taskRun._id,
          artifactIds: [updatedArtifact._id],
          tx,
        });

        updatedJobRun = await runtimeCore.jobRunService.setMaterializationStatus({
          jobRunId: updatedJobRun._id,
          status: 'materialized',
          resultArtifactId: updatedArtifact._id,
          tx,
        });

        await runtimeCore.eventService.emitEvents(
          [
            {
              sessionId: taskRun.sessionId,
              taskRunId: taskRun._id,
              jobRunId: updatedJobRun._id,
              category: 'domain',
              type: 'artifact.result_bundle.harvested',
              producerType: 'tool',
              correlationId: taskRun.correlationId,
              payload: {
                artifactId: updatedArtifact._id,
                jobRunId: updatedJobRun._id,
                resultType: resultPayload.resultType || null,
              },
            },
            {
              sessionId: taskRun.sessionId,
              taskRunId: taskRun._id,
              jobRunId: updatedJobRun._id,
              category: 'system',
              type: 'job_run.materialized',
              producerType: 'tool',
              correlationId: taskRun.correlationId,
              payload: {
                jobRunId: updatedJobRun._id,
                resultArtifactId: updatedArtifact._id,
              },
            },
          ],
          tx
        );

        return {
          jobRun: updatedJobRun,
          resultArtifact: updatedArtifact,
        };
      });

      return res.status(201).json({
        ok: true,
        jobRunId: materialized.jobRun._id,
        resultArtifactId: materialized.resultArtifact._id,
        materializationStatus: materialized.jobRun.materializationStatus,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/jobs/mock-submit', async (req, res) => {
    try {
      await connectRuntimeDb();

      const sessionId = String(req.body.sessionId || '').trim();
      const jobLabel = String(req.body.jobLabel || 'Runtime Demo Mock Job').trim();

      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId is required' });
      }

      const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
      if (loaded.error) {
        return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
      }

      const { session, goalArtifact, planArtifact } = loaded;
      const firstStep = buildFirstStep(req.body, {
        firstStepId: `mock-job-submit-${Date.now()}`,
        firstSkillId: 'mock_submit_job',
        firstAgentId: 'compute-subagent',
      });

      let taskRun = await runtimeCore.withTransaction(async (tx) =>
        runtimeCore.createAndStageTaskRun({
          session,
          goalArtifact,
          planArtifact,
          taskSpec: {
            ...firstStep,
            inputArtifacts: goalArtifact ? [goalArtifact._id] : [],
            approvalRequired: false,
            retryable: true,
          },
          tx,
        })
      );

      if (taskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const externalJobId = `mock-${Date.now()}-${String(taskRun._id).slice(-6)}`;
      const submission = await runtimeCore.withTransaction(async (tx) => {
        const runningTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: taskRun._id,
          toStatus: 'running',
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: session._id,
            taskRunId: runningTaskRun._id,
            category: 'system',
            type: 'task_run.started',
            producerType: 'execution',
            correlationId: runningTaskRun.correlationId,
            payload: {
              taskRunId: runningTaskRun._id,
              planId: planArtifact._id,
              stepId: runningTaskRun.stepId,
              mode: 'mock_job_submission',
            },
          },
          tx
        );

        const jobRun = await runtimeCore.jobRunService.createJobRun(
          {
            sessionId: session._id,
            taskRunId: runningTaskRun._id,
            system: 'mock',
            status: 'submitted',
            materializationStatus: 'pending',
            schedulerRef: 'runtime-demo-mock',
            snapshotRef: `draft://jobs/${runningTaskRun._id}/mock-submission`,
            externalJobId,
            retryable: true,
            submittedAt: new Date(),
          },
          tx
        );

        const succeededTaskRun = await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: runningTaskRun._id,
          toStatus: 'succeeded',
          patch: {
            metrics: {
              submittedJobs: 1,
            },
          },
          tx,
        });

        await runtimeCore.eventService.emitEvents(
          [
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'job_run.submitted',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                jobRunId: jobRun._id,
                externalJobId,
                schedulerRef: jobRun.schedulerRef,
                jobLabel,
              },
            },
            {
              sessionId: session._id,
              taskRunId: runningTaskRun._id,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'task_run.succeeded',
              producerType: 'execution',
              correlationId: runningTaskRun.correlationId,
              payload: {
                taskRunId: runningTaskRun._id,
                submittedJobRunId: jobRun._id,
              },
            },
          ],
          tx
        );

        return {
          taskRun: succeededTaskRun,
          jobRun,
        };
      });

      taskRun = submission.taskRun;

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        planArtifactId: planArtifact._id,
        taskRunId: taskRun._id,
        taskRunStatus: taskRun.status,
        jobRunId: submission.jobRun._id,
        externalJobId,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/submit-goal', async (req, res) => {
    try {
      await connectRuntimeDb();

      const ownerId = String(req.body.ownerId || '').trim();
      const goalPrompt = String(req.body.goalPrompt || '').trim();
      const projectId = req.body.projectId ? String(req.body.projectId).trim() : undefined;
      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;

      if (!ownerId) {
        return res.status(400).json({ ok: false, error: 'ownerId is required' });
      }
      if (!goalPrompt) {
        return res.status(400).json({ ok: false, error: 'goalPrompt is required' });
      }

      const firstStep = buildFirstStep(req.body);

      const result = await runtimeCore.submitGoalAndCreatePlan({
        sessionId,
        ownerId,
        projectId,
        goalArtifact: {
          status: 'ready',
          summary: goalPrompt,
          preview: { prompt: goalPrompt },
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        planArtifact: {
          status: 'ready',
          summary: `Executable plan for: ${goalPrompt}`,
          preview: buildDefaultPlanSpec(goalPrompt, firstStep),
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        firstStep,
      });

      return res.status(201).json({
        ok: true,
        sessionId: result.session._id,
        goalArtifactId: result.goalArtifact._id,
        planArtifactId: result.planArtifact._id,
        firstTaskRunId: result.firstTaskRun._id,
        firstTaskRunStatus: result.firstTaskRun.status,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/replan', async (req, res) => {
    try {
      await connectRuntimeDb();

      const sessionId = String(req.body.sessionId || '').trim();
      const goalPrompt = String(req.body.goalPrompt || '').trim();
      const replanReason = req.body.replanReason ? String(req.body.replanReason).trim() : 'manual_replan';

      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId is required' });
      }
      if (!goalPrompt) {
        return res.status(400).json({ ok: false, error: 'goalPrompt is required' });
      }

      const firstStep = buildFirstStep(req.body);

      const result = await runtimeCore.replanSession({
        sessionId,
        replanReason,
        goalArtifact: {
          status: 'ready',
          summary: goalPrompt,
          preview: { prompt: goalPrompt, replanReason },
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        planArtifact: {
          status: 'ready',
          summary: `Replanned executable plan for: ${goalPrompt}`,
          preview: buildDefaultPlanSpec(goalPrompt, firstStep),
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        firstStep,
      });

      return res.status(201).json({
        ok: true,
        sessionId: result.session._id,
        previousGoalArtifactId: result.previousGoalArtifact._id,
        previousPlanArtifactId: result.previousPlanArtifact._id,
        goalArtifactId: result.goalArtifact._id,
        planArtifactId: result.planArtifact._id,
        obsoleteTaskRunIds: result.obsoleteTaskRunIds,
        firstTaskRunId: result.firstTaskRun._id,
        firstTaskRunStatus: result.firstTaskRun.status,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/modeling/providers', async (req, res) => {
    try {
      await connectRuntimeDb();
      const diagnostics = await getModelingRuntimeDiagnostics();
      return res.json({
        ok: true,
        providers: diagnostics.providers,
        engineHealth: diagnostics.engineHealth,
        summary: diagnostics.summary,
        defaultOrder: normalizeModelingProviderPreferences(req.query?.providers),
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/modeling/build', async (req, res) => {
    try {
      await connectRuntimeDb();
      await runtimeCore.skillService.ensureBuiltinSkills();

      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
      const ownerId = req.body.ownerId ? String(req.body.ownerId).trim() : undefined;
      const projectId = req.body.projectId ? String(req.body.projectId).trim() : undefined;
      const prompt = String(req.body.prompt || '').trim();
      const providerPreferences = normalizeModelingProviderPreferences(req.body.providerPreferences || req.body.providers);

      if (!sessionId && !ownerId) {
        return res.status(400).json({ ok: false, error: 'ownerId is required when sessionId is not provided' });
      }
      if (!prompt && !req.body.intent) {
        return res.status(400).json({ ok: false, error: 'prompt or intent is required' });
      }

      const modelingIntent = req.body.intent
        ? normalizeModelingIntent(req.body.intent, providerPreferences)
        : await parseModelingIntent({
          prompt,
          providerPreferences,
        });

      const stepIdPrefix = sanitizeStepId(req.body.stepIdPrefix || `modeling-build-${Date.now()}`);
      const planSteps = buildModelingPlanSteps(modelingIntent, { stepIdPrefix });
      const firstStep = planSteps[0];

      let session;
      let goalArtifact;
      let planArtifact;
      let taskRun;

      if (sessionId) {
        const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        taskRun = await runtimeCore.withTransaction(async (tx) =>
          runtimeCore.createAndStageTaskRun({
            session,
            goalArtifact,
            planArtifact,
            taskSpec: {
              ...firstStep,
              inputArtifacts: goalArtifact ? [goalArtifact._id] : [],
              retryable: true,
            },
            tx,
          })
        );
      } else {
        const goalPrompt = buildModelingGoalPrompt(prompt, modelingIntent);
        const seeded = await runtimeCore.submitGoalAndCreatePlan({
          ownerId,
          projectId,
          goalArtifact: {
            status: 'ready',
            summary: goalPrompt,
            preview: {
              prompt: goalPrompt,
              source: 'modeling.build',
              taskType: modelingIntent.task_type || null,
              providerPreferences,
            },
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          planArtifact: {
            status: 'ready',
            summary: `Executable modeling build plan for: ${goalPrompt}`,
            preview: buildModelingPlanPreview(goalPrompt, modelingIntent, planSteps),
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          firstStep,
        });

        session = seeded.session;
        goalArtifact = seeded.goalArtifact;
        planArtifact = seeded.planArtifact;
        taskRun = seeded.firstTaskRun;
      }

      if (taskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const result = await runModelingPlan({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        initialTaskRun: taskRun,
        intent: modelingIntent,
        planSteps,
      });

      if (result.blocked) {
        return res.status(409).json({
          ok: false,
          error: 'A downstream modeling step was blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: result.finalTaskRun?._id || null,
          taskRunStatus: result.finalTaskRun?.status || 'blocked',
          planSteps: planSteps.map((step) => ({ stepId: step.stepId, skillId: step.skillId })),
          stepResults: result.stepResults.map((item) => ({
            stepId: item.stepId,
            skillId: item.skillId,
            taskRunId: item.taskRun?._id || null,
            taskRunStatus: item.taskRun?.status || null,
            structureArtifactId: item.structureArtifact?._id || null,
          })),
        });
      }

      const finalStepResult = result.stepResults[result.stepResults.length - 1] || null;

      return res.status(201).json({
        ok: true,
        success: true,
        sessionId: session._id,
        goalArtifactId: goalArtifact ? goalArtifact._id : null,
        planArtifactId: planArtifact._id,
        taskRunId: result.finalTaskRun?._id || null,
        taskRunStatus: result.finalTaskRun?.status || null,
        structureArtifactId: result.finalStructureArtifact ? result.finalStructureArtifact._id : null,
        databaseSource: finalStepResult?.buildResult?.meta?.databaseSource || null,
        databaseSourceLabel: finalStepResult?.buildResult?.meta?.databaseSourceLabel || null,
        providersTried: finalStepResult?.buildResult?.meta?.providersTried || [],
        data: finalStepResult?.buildResult?.data || null,
        exports: finalStepResult?.buildResult?.exports || null,
        meta: finalStepResult?.buildResult?.meta || null,
        planSteps: planSteps.map((step) => ({ stepId: step.stepId, skillId: step.skillId })),
        stepResults: result.stepResults.map((item) => ({
          stepId: item.stepId,
          skillId: item.skillId,
          taskRunId: item.taskRun?._id || null,
          taskRunStatus: item.taskRun?.status || null,
          structureArtifactId: item.structureArtifact?._id || null,
        })),
        intent: modelingIntent,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/modeling/replan', async (req, res) => {
    try {
      await connectRuntimeDb();
      await runtimeCore.skillService.ensureBuiltinSkills();

      const sessionId = String(req.body.sessionId || '').trim();
      const prompt = String(req.body.prompt || '').trim();
      const providerPreferences = normalizeModelingProviderPreferences(req.body.providerPreferences || req.body.providers);
      const replanReason = req.body.replanReason
        ? String(req.body.replanReason).trim()
        : 'modeling_modify_replan';

      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId is required' });
      }
      if (!prompt && !req.body.intent) {
        return res.status(400).json({ ok: false, error: 'prompt or intent is required' });
      }

      const modelingIntent = req.body.intent
        ? normalizeModelingIntent(req.body.intent, providerPreferences)
        : await parseModelingIntent({
          prompt,
          providerPreferences,
        });

      const stepIdPrefix = sanitizeStepId(req.body.stepIdPrefix || `modeling-replan-${Date.now()}`);
      const planSteps = buildModelingPlanSteps(modelingIntent, { stepIdPrefix });
      const firstStep = planSteps[0];

      const goalPrompt = buildModelingGoalPrompt(prompt, modelingIntent);
      const replanned = await runtimeCore.replanSession({
        sessionId,
        replanReason,
        goalArtifact: {
          status: 'ready',
          summary: goalPrompt,
          preview: {
            prompt: goalPrompt,
            source: 'modeling.replan',
            taskType: modelingIntent.task_type || null,
            providerPreferences,
            replanReason,
          },
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        planArtifact: {
          status: 'ready',
          summary: `Replanned modeling build plan for: ${goalPrompt}`,
          preview: buildModelingPlanPreview(goalPrompt, modelingIntent, planSteps),
          payloadType: 'json',
          approvalStatus: 'none',
          riskLevel: 'low',
        },
        firstStep,
      });

      if (replanned.firstTaskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: replanned.session._id,
          planArtifactId: replanned.planArtifact._id,
          taskRunId: replanned.firstTaskRun._id,
          taskRunStatus: replanned.firstTaskRun.status,
        });
      }

      const result = await runModelingPlan({
        runtimeCore,
        policyEngine,
        session: replanned.session,
        goalArtifact: replanned.goalArtifact,
        planArtifact: replanned.planArtifact,
        initialTaskRun: replanned.firstTaskRun,
        intent: modelingIntent,
        planSteps,
      });

      if (result.blocked) {
        return res.status(409).json({
          ok: false,
          error: 'A downstream modeling step was blocked by preflight',
          sessionId: replanned.session._id,
          planArtifactId: replanned.planArtifact._id,
          taskRunId: result.finalTaskRun?._id || null,
          taskRunStatus: result.finalTaskRun?.status || 'blocked',
          planSteps: planSteps.map((step) => ({ stepId: step.stepId, skillId: step.skillId })),
          stepResults: result.stepResults.map((item) => ({
            stepId: item.stepId,
            skillId: item.skillId,
            taskRunId: item.taskRun?._id || null,
            taskRunStatus: item.taskRun?.status || null,
            structureArtifactId: item.structureArtifact?._id || null,
          })),
        });
      }

      const finalStepResult = result.stepResults[result.stepResults.length - 1] || null;

      return res.status(201).json({
        ok: true,
        success: true,
        sessionId: replanned.session._id,
        previousGoalArtifactId: replanned.previousGoalArtifact._id,
        previousPlanArtifactId: replanned.previousPlanArtifact._id,
        goalArtifactId: replanned.goalArtifact._id,
        planArtifactId: replanned.planArtifact._id,
        obsoleteTaskRunIds: replanned.obsoleteTaskRunIds,
        taskRunId: result.finalTaskRun?._id || null,
        taskRunStatus: result.finalTaskRun?.status || null,
        structureArtifactId: result.finalStructureArtifact ? result.finalStructureArtifact._id : null,
        databaseSource: finalStepResult?.buildResult?.meta?.databaseSource || null,
        databaseSourceLabel: finalStepResult?.buildResult?.meta?.databaseSourceLabel || null,
        providersTried: finalStepResult?.buildResult?.meta?.providersTried || [],
        data: finalStepResult?.buildResult?.data || null,
        exports: finalStepResult?.buildResult?.exports || null,
        meta: finalStepResult?.buildResult?.meta || null,
        planSteps: planSteps.map((step) => ({ stepId: step.stepId, skillId: step.skillId })),
        stepResults: result.stepResults.map((item) => ({
          stepId: item.stepId,
          skillId: item.skillId,
          taskRunId: item.taskRun?._id || null,
          taskRunStatus: item.taskRun?.status || null,
          structureArtifactId: item.structureArtifact?._id || null,
        })),
        intent: modelingIntent,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/approvals/:approvalId', async (req, res) => {
    try {
      await connectRuntimeDb();
      const approvalId = String(req.params.approvalId || '').trim();
      const approval = await runtimeCore.approvalService.getApprovalRequestById(approvalId);
      if (!approval) {
        return res.status(404).json({ ok: false, error: 'Approval not found' });
      }
      return res.json({ ok: true, approval });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/approvals/:approvalId/approve', async (req, res) => {
    try {
      await connectRuntimeDb();
      const approvalId = String(req.params.approvalId || '').trim();
      const approvedBy = String(req.body.approvedBy || 'runtime-demo-user').trim();
      const decisionNote = req.body.decisionNote ? String(req.body.decisionNote).trim() : undefined;

      const approval = await runtimeCore.withTransaction(async (tx) => {
        const existing = await runtimeCore.approvalService.getApprovalRequestById(approvalId, tx);
        if (!existing) {
          throw new Error('Approval not found');
        }

        const updated = await runtimeCore.approvalService.resolveApprovalRequest({
          approvalRequestId: approvalId,
          status: 'approved',
          approvedBy,
          decisionNote,
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: updated.sessionId,
            taskRunId: updated.taskRunId,
            category: 'system',
            type: 'approval.approved',
            producerType: 'policy',
            payload: {
              approvalRequestId: updated._id,
              approvedBy,
            },
          },
          tx
        );

        return updated;
      });

      return res.json({ ok: true, approval });
    } catch (err) {
      const status = String(err.message || '').includes('not found') ? 404 : 500;
      return res.status(status).json({ ok: false, error: err.message });
    }
  });

  router.post('/approvals/:approvalId/reject', async (req, res) => {
    try {
      await connectRuntimeDb();
      const approvalId = String(req.params.approvalId || '').trim();
      const decisionNote = req.body.decisionNote ? String(req.body.decisionNote).trim() : undefined;

      const approval = await runtimeCore.withTransaction(async (tx) => {
        const existing = await runtimeCore.approvalService.getApprovalRequestById(approvalId, tx);
        if (!existing) {
          throw new Error('Approval not found');
        }

        const updated = await runtimeCore.approvalService.resolveApprovalRequest({
          approvalRequestId: approvalId,
          status: 'rejected',
          decisionNote,
          tx,
        });

        await runtimeCore.taskRunService.transitionTaskRun({
          taskRunId: updated.taskRunId,
          toStatus: 'cancelled',
          patch: {
            terminalReason: 'approval_rejected',
          },
          tx,
        });

        await runtimeCore.eventService.emitEvents(
          [
            {
              sessionId: updated.sessionId,
              taskRunId: updated.taskRunId,
              category: 'system',
              type: 'approval.rejected',
              producerType: 'policy',
              payload: {
                approvalRequestId: updated._id,
                decisionNote: decisionNote || null,
              },
            },
            {
              sessionId: updated.sessionId,
              taskRunId: updated.taskRunId,
              category: 'system',
              type: 'task_run.cancelled',
              producerType: 'execution',
              payload: {
                taskRunId: updated.taskRunId,
                terminalReason: 'approval_rejected',
              },
            },
          ],
          tx
        );

        return updated;
      });

      return res.json({ ok: true, approval });
    } catch (err) {
      const status = String(err.message || '').includes('not found') ? 404 : 500;
      return res.status(status).json({ ok: false, error: err.message });
    }
  });

  router.post('/rendering/parse-science', async (req, res) => {
    try {
      await connectRuntimeDb();

      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
      const ownerId = req.body.ownerId ? String(req.body.ownerId).trim() : undefined;
      const projectId = req.body.projectId ? String(req.body.projectId).trim() : undefined;
      const text = String(req.body.text || '').trim();

      if (text.length < 10) {
        return res.status(400).json({ ok: false, error: 'text is required and must be at least 10 chars' });
      }
      if (!sessionId && !ownerId) {
        return res.status(400).json({ ok: false, error: 'ownerId is required when sessionId is not provided' });
      }

      const defaultRenderingStepId = `rendering-parse-science-${Date.now()}`;
      const firstStep = buildFirstStep(req.body, {
        firstStepId: defaultRenderingStepId,
        firstSkillId: 'rendering_parse_science',
        firstAgentId: 'rendering-subagent',
      });

      let session;
      let goalArtifact;
      let planArtifact;
      let taskRun;

      if (sessionId) {
        const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        taskRun = await runtimeCore.withTransaction(async (tx) =>
          runtimeCore.createAndStageTaskRun({
            session,
            goalArtifact,
            planArtifact,
            taskSpec: {
              ...firstStep,
              inputArtifacts: goalArtifact ? [goalArtifact._id] : [],
            },
            tx,
          })
        );
      } else {
        const goalPrompt = buildRenderingGoalPrompt(text, req.body.goalPrompt);
        const seeded = await runtimeCore.submitGoalAndCreatePlan({
          ownerId,
          projectId,
          goalArtifact: {
            status: 'ready',
            summary: goalPrompt,
            preview: { prompt: goalPrompt, source: 'rendering.parse-science' },
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          planArtifact: {
            status: 'ready',
            summary: `Executable rendering parse plan for: ${goalPrompt}`,
            preview: buildDefaultPlanSpec(goalPrompt, firstStep),
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          firstStep,
        });

        session = seeded.session;
        goalArtifact = seeded.goalArtifact;
        planArtifact = seeded.planArtifact;
        taskRun = seeded.firstTaskRun;
      }

      if (taskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const result = await runParseScienceTask({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        taskRun,
        text,
      });

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        goalArtifactId: goalArtifact ? goalArtifact._id : null,
        planArtifactId: planArtifact._id,
        taskRunId: result.taskRun._id,
        taskRunStatus: result.taskRun.status,
        reportArtifactId: result.reportArtifact ? result.reportArtifact._id : null,
        parsed: result.parsed,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/rendering/parse-pdf', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No PDF file uploaded' });
    }

    try {
      await connectRuntimeDb();

      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
      const ownerId = req.body.ownerId ? String(req.body.ownerId).trim() : undefined;
      const projectId = req.body.projectId ? String(req.body.projectId).trim() : undefined;

      if (!sessionId && !ownerId) {
        return res.status(400).json({ ok: false, error: 'ownerId is required when sessionId is not provided' });
      }

      const defaultRenderingStepId = `rendering-parse-pdf-${Date.now()}`;
      const firstStep = buildFirstStep(req.body, {
        firstStepId: defaultRenderingStepId,
        firstSkillId: 'rendering_parse_pdf',
        firstAgentId: 'rendering-subagent',
      });

      let session;
      let goalArtifact;
      let planArtifact;
      let taskRun;

      if (sessionId) {
        const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        taskRun = await runtimeCore.withTransaction(async (tx) =>
          runtimeCore.createAndStageTaskRun({
            session,
            goalArtifact,
            planArtifact,
            taskSpec: {
              ...firstStep,
              inputArtifacts: goalArtifact ? [goalArtifact._id] : [],
            },
            tx,
          })
        );
      } else {
        const goalPrompt = String(req.body.goalPrompt || '').trim()
          || `Parse PDF into a rendering-ready brief: ${String(req.file.originalname || 'uploaded-paper.pdf').trim()}`;

        const seeded = await runtimeCore.submitGoalAndCreatePlan({
          ownerId,
          projectId,
          goalArtifact: {
            status: 'ready',
            summary: goalPrompt,
            preview: {
              prompt: goalPrompt,
              source: 'rendering.parse-pdf',
              originalFileName: req.file.originalname || null,
            },
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          planArtifact: {
            status: 'ready',
            summary: `Executable rendering PDF parse plan for: ${goalPrompt}`,
            preview: buildDefaultPlanSpec(goalPrompt, firstStep),
            payloadType: 'json',
            approvalStatus: 'none',
            riskLevel: 'low',
          },
          firstStep,
        });

        session = seeded.session;
        goalArtifact = seeded.goalArtifact;
        planArtifact = seeded.planArtifact;
        taskRun = seeded.firstTaskRun;
      }

      if (taskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const result = await runParsePdfTask({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        taskRun,
        filePath: req.file.path,
        originalName: req.file.originalname,
      });

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        goalArtifactId: goalArtifact ? goalArtifact._id : null,
        planArtifactId: planArtifact._id,
        taskRunId: result.taskRun._id,
        taskRunStatus: result.taskRun.status,
        reportArtifactId: result.reportArtifact ? result.reportArtifact._id : null,
        parsed: result.parsed,
      });
    } catch (err) {
      return res.status(statusForRenderingError(err)).json({
        ok: false,
        error: err.message,
      });
    } finally {
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
    }
  });

  router.post('/rendering/compile-prompt', async (req, res) => {
    try {
      await connectRuntimeDb();

      const sessionId = String(req.body.sessionId || '').trim();
      const reportArtifactId = req.body.reportArtifactId ? String(req.body.reportArtifactId).trim() : undefined;

      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'sessionId is required' });
      }

      const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
      if (loaded.error) {
        return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
      }

      const { session, goalArtifact, planArtifact } = loaded;
      let sourceReportArtifact;

      if (reportArtifactId) {
        sourceReportArtifact = await runtimeCore.artifactService.getArtifactById(reportArtifactId);
      } else {
        sourceReportArtifact = await ArtifactModel.findOne({
          sessionId,
          kind: 'report',
          'preview.structured': { $exists: true },
          'preview.compiledPrompt': { $exists: false },
        }).sort({ createdAt: -1 });
      }

      if (!sourceReportArtifact) {
        return res.status(404).json({
          ok: false,
          error: 'No source report artifact with structured science data was found',
        });
      }

      const firstStep = buildFirstStep(req.body, {
        firstStepId: `rendering-compile-prompt-${Date.now()}`,
        firstSkillId: 'rendering_compile_prompt',
        firstAgentId: 'rendering-subagent',
      });

      const taskRun = await runtimeCore.withTransaction(async (tx) =>
        runtimeCore.createAndStageTaskRun({
          session,
          goalArtifact,
          planArtifact,
          taskSpec: {
            ...firstStep,
            inputArtifacts: [sourceReportArtifact._id],
          },
          tx,
        })
      );

      if (taskRun.status === 'blocked') {
        return res.status(409).json({
          ok: false,
          error: 'TaskRun blocked by preflight',
          sessionId: session._id,
          planArtifactId: planArtifact._id,
          taskRunId: taskRun._id,
          taskRunStatus: taskRun.status,
        });
      }

      const result = await runCompilePromptTask({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        taskRun,
        sourceReportArtifact,
        compileOptions: {
          journal: req.body.journal,
          aspectRatio: req.body.aspectRatio,
          customWidth: req.body.customWidth,
          customHeight: req.body.customHeight,
          visualMetaphor: req.body.visualMetaphor,
          compositionType: req.body.compositionType,
          styleNotes: req.body.styleNotes,
          backgroundStyle: req.body.backgroundStyle,
          additionalInstructions: req.body.additionalInstructions,
          strictNoText: req.body.strictNoText,
          strictChemistry: req.body.strictChemistry,
        },
      });

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        sourceReportArtifactId: sourceReportArtifact._id,
        planArtifactId: planArtifact._id,
        taskRunId: result.taskRun._id,
        taskRunStatus: result.taskRun.status,
        promptArtifactId: result.promptArtifact ? result.promptArtifact._id : null,
        compiledPrompt: result.compiled.fullPrompt,
        strictNoText: result.compiled.strictNoText,
        strictChemistry: result.compiled.strictChemistry,
        requiredSpecies: result.compiled.requiredSpecies,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.post('/rendering/generate-image', async (req, res) => {
    try {
      await connectRuntimeDb();

      const approvalRequestId = req.body.approvalRequestId ? String(req.body.approvalRequestId).trim() : undefined;
      const sessionId = req.body.sessionId ? String(req.body.sessionId).trim() : undefined;
      const promptArtifactId = req.body.promptArtifactId ? String(req.body.promptArtifactId).trim() : undefined;
      const numberOfImages = Math.max(1, Math.min(Number(req.body.numberOfImages || 1), 4));
      const maxAttemptsPerImage = Math.max(1, Math.min(Number(req.body.maxAttemptsPerImage || 2), 2));

      let session;
      let goalArtifact;
      let planArtifact;
      let promptArtifact;
      let taskRun;
      let approvalRequest;

      if (approvalRequestId) {
        approvalRequest = await runtimeCore.approvalService.getApprovalRequestById(approvalRequestId);
        if (!approvalRequest) {
          return res.status(404).json({ ok: false, error: 'Approval not found' });
        }

        taskRun = await runtimeCore.taskRunService.getTaskRunById(approvalRequest.taskRunId);
        if (!taskRun) {
          return res.status(404).json({ ok: false, error: 'TaskRun for approval not found' });
        }

        const loaded = await loadSessionRuntimeInputs(runtimeCore, taskRun.sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        promptArtifact = await runtimeCore.artifactService.getArtifactById(taskRun.inputArtifacts?.[0]);
        if (!promptArtifact) {
          return res.status(404).json({ ok: false, error: 'Prompt artifact for approved task not found' });
        }
      } else {
        if (!sessionId) {
          return res.status(400).json({ ok: false, error: 'sessionId is required' });
        }

        const loaded = await loadSessionRuntimeInputs(runtimeCore, sessionId);
        if (loaded.error) {
          return res.status(loaded.error.status).json({ ok: false, error: loaded.error.message });
        }
        ({ session, goalArtifact, planArtifact } = loaded);

        promptArtifact = await loadPromptArtifact({ sessionId, promptArtifactId });
        if (!promptArtifact) {
          return res.status(404).json({ ok: false, error: 'No compiled prompt artifact was found' });
        }

        const firstStep = buildFirstStep(req.body, {
          firstStepId: `rendering-generate-image-${Date.now()}`,
          firstSkillId: 'rendering_generate_image',
          firstAgentId: 'rendering-subagent',
        });

        taskRun = await runtimeCore.withTransaction(async (tx) =>
          runtimeCore.createAndStageTaskRun({
            session,
            goalArtifact,
            planArtifact,
            taskSpec: {
              ...firstStep,
              approvalRequired: true,
              inputArtifacts: [promptArtifact._id],
            },
            tx,
          })
        );

        if (taskRun.status === 'blocked') {
          return res.status(409).json({
            ok: false,
            error: 'TaskRun blocked by preflight',
            sessionId: session._id,
            planArtifactId: planArtifact._id,
            taskRunId: taskRun._id,
            taskRunStatus: taskRun.status,
          });
        }

        const imageOptions = {
          numberOfImages,
          aspectRatio: String(req.body.aspectRatio || promptArtifact?.preview?.aspectRatio || '3:4').trim(),
          maxAttemptsPerImage,
          strictNoText: req.body.strictNoText != null ? Boolean(req.body.strictNoText) : Boolean(promptArtifact?.preview?.strictNoText),
          strictChemistry: req.body.strictChemistry != null ? Boolean(req.body.strictChemistry) : Boolean(promptArtifact?.preview?.strictChemistry),
          requiredSpecies: Array.isArray(promptArtifact?.preview?.requiredSpecies) ? promptArtifact.preview.requiredSpecies : [],
        };

        const risk = await policyEngine.evaluateRisk({
          effectType: 'external_submit',
          estimatedCost: {
            numberOfImages: imageOptions.numberOfImages,
            aspectRatio: imageOptions.aspectRatio,
            requiredSpeciesCount: imageOptions.requiredSpecies.length,
          },
        });

        const approvalContext = buildImageExecutionContext({
          sessionId: session._id,
          taskRunId: taskRun._id,
          promptArtifactId: promptArtifact._id,
          aspectRatio: imageOptions.aspectRatio,
          numberOfImages: imageOptions.numberOfImages,
          maxAttemptsPerImage: imageOptions.maxAttemptsPerImage,
          requiredSpeciesCount: imageOptions.requiredSpecies.length,
        });

        if (risk.approvalRequired) {
          approvalRequest = await runtimeCore.withTransaction(async (tx) => {
            const createdApproval = await runtimeCore.approvalService.createApprovalRequest({
              sessionId: session._id,
              taskRunId: taskRun._id,
              targetType: 'tool_call',
              targetRef: approvalContext.targetRef,
              reason: 'Rendering image generation uses an external image model and should be approval-gated',
              estimatedCost: approvalContext.estimatedCost,
              snapshotRef: `draft://approvals/${taskRun._id}/rendering-generate-image`,
              requestedBy: 'runtime-demo',
              policyId: approvalContext.policyId,
              approvalScope: 'single_execution',
              riskSnapshotHash: approvalContext.riskSnapshotHash,
              approvedIdempotencyKey: approvalContext.idempotencyKey,
              expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            }, tx);

            await runtimeCore.taskRunService.attachApproval({
              taskRunId: taskRun._id,
              approvalRequestId: createdApproval._id,
              tx,
            });

            await runtimeCore.taskRunService.transitionTaskRun({
              taskRunId: taskRun._id,
              toStatus: 'waiting_approval',
              tx,
            });

            await runtimeCore.eventService.emitEvents(
              [
                {
                  sessionId: session._id,
                  taskRunId: taskRun._id,
                  category: 'system',
                  type: 'approval.requested',
                  producerType: 'policy',
                  payload: {
                    approvalRequestId: createdApproval._id,
                    targetRef: approvalContext.targetRef,
                    estimatedCost: approvalContext.estimatedCost,
                  },
                },
                {
                  sessionId: session._id,
                  taskRunId: taskRun._id,
                  category: 'system',
                  type: 'task_run.waiting_approval',
                  producerType: 'policy',
                  payload: {
                    taskRunId: taskRun._id,
                    approvalRequestId: createdApproval._id,
                  },
                },
              ],
              tx
            );

            return createdApproval;
          });

          return res.status(202).json({
            ok: true,
            approvalRequired: true,
            sessionId: session._id,
            taskRunId: taskRun._id,
            promptArtifactId: promptArtifact._id,
            approvalRequestId: approvalRequest._id,
            approvalStatus: approvalRequest.status,
            imageOptions,
          });
        }
      }

      const imageOptions = {
        numberOfImages,
        aspectRatio: String(req.body.aspectRatio || promptArtifact?.preview?.aspectRatio || '3:4').trim(),
        maxAttemptsPerImage,
        strictNoText: req.body.strictNoText != null ? Boolean(req.body.strictNoText) : Boolean(promptArtifact?.preview?.strictNoText),
        strictChemistry: req.body.strictChemistry != null ? Boolean(req.body.strictChemistry) : Boolean(promptArtifact?.preview?.strictChemistry),
        requiredSpecies: Array.isArray(promptArtifact?.preview?.requiredSpecies) ? promptArtifact.preview.requiredSpecies : [],
      };

      const approvalContext = buildImageExecutionContext({
        sessionId: session._id,
        taskRunId: taskRun._id,
        promptArtifactId: promptArtifact._id,
        aspectRatio: imageOptions.aspectRatio,
        numberOfImages: imageOptions.numberOfImages,
        maxAttemptsPerImage: imageOptions.maxAttemptsPerImage,
        requiredSpeciesCount: imageOptions.requiredSpecies.length,
      });

      if (approvalRequest) {
        const applicability = await policyEngine.validateApprovalApplicability({
          approvalRequest,
          targetRef: approvalContext.targetRef,
          policyId: approvalContext.policyId,
          riskSnapshotHash: approvalContext.riskSnapshotHash,
          idempotencyKey: approvalContext.idempotencyKey,
        });

        if (!applicability.ok) {
          return res.status(409).json({
            ok: false,
            error: applicability.reason || 'Approval is not applicable to this execution',
          });
        }

        if (taskRun.status === 'waiting_approval') {
          taskRun = await runtimeCore.withTransaction(async (tx) => {
            const resumed = await runtimeCore.taskRunService.transitionTaskRun({
              taskRunId: taskRun._id,
              toStatus: 'queued',
              patch: {
                terminalReason: undefined,
              },
              tx,
            });

            await runtimeCore.eventService.emitEvent(
              {
                sessionId: session._id,
                taskRunId: taskRun._id,
                category: 'system',
                type: 'task_run.queued',
                producerType: 'policy',
                payload: {
                  taskRunId: taskRun._id,
                  resumedFromApproval: true,
                  approvalRequestId: approvalRequest._id,
                },
              },
              tx
            );

            return resumed;
          });
        }
      }

      const result = await runGenerateImageTask({
        runtimeCore,
        policyEngine,
        session,
        goalArtifact,
        planArtifact,
        taskRun,
        promptArtifact,
        imageOptions,
      });

      return res.status(201).json({
        ok: true,
        sessionId: session._id,
        promptArtifactId: promptArtifact._id,
        taskRunId: result.taskRun._id,
        taskRunStatus: result.taskRun.status,
        visualAssetArtifactId: result.visualAssetArtifact ? result.visualAssetArtifact._id : null,
        images: result.images,
      });
    } catch (err) {
      return res.status(statusForRenderingError(err)).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/sessions', async (req, res) => {
    try {
      await connectRuntimeDb();

      const limit = parseListLimit(req.query.limit, 12, 30);
      const filter = {};
      const ownerId = req.query.ownerId ? String(req.query.ownerId).trim() : '';
      const projectId = req.query.projectId ? String(req.query.projectId).trim() : '';
      const status = req.query.status ? String(req.query.status).trim() : '';

      if (ownerId) {
        filter.ownerId = ownerId;
      }
      if (projectId) {
        filter.projectId = projectId;
      }
      if (status) {
        filter.status = status;
      }

      const sessions = await SessionModel.find(filter)
        .sort({ lastActivityAt: -1, createdAt: -1 })
        .limit(limit)
        .lean();

      const items = await Promise.all(
        sessions.map(async (session) => {
          const [goalArtifact, planArtifact, artifactCount, taskRunCount, jobRunCount, approvalCount, eventCount] = await Promise.all([
            session.primaryGoalArtifactId
              ? ArtifactModel.findById(session.primaryGoalArtifactId)
                .select('_id kind summary preview createdAt updatedAt')
                .lean()
              : Promise.resolve(null),
            session.activePlanArtifactId
              ? ArtifactModel.findById(session.activePlanArtifactId)
                .select('_id kind summary preview createdAt updatedAt')
                .lean()
              : Promise.resolve(null),
            ArtifactModel.countDocuments({ sessionId: session._id }),
            TaskRunModel.countDocuments({ sessionId: session._id }),
            JobRunModel.countDocuments({ sessionId: session._id }),
            ApprovalRequestModel.countDocuments({ sessionId: session._id }),
            EventModel.countDocuments({ sessionId: session._id }),
          ]);

          return {
            session,
            summary: {
              artifactCount,
              taskRunCount,
              jobRunCount,
              approvalCount,
              eventCount,
            },
            goalArtifact,
            planArtifact,
          };
        })
      );

      return res.json({
        ok: true,
        sessions: items,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/sessions/:sessionId', async (req, res) => {
    try {
      await connectRuntimeDb();
      const sessionId = String(req.params.sessionId || '').trim();
      const session = await SessionModel.findById(sessionId).lean();
      if (!session) {
        return res.status(404).json({ ok: false, error: 'Session not found' });
      }

      const [artifacts, taskRuns, jobRuns, approvals, events] = await Promise.all([
        ArtifactModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        TaskRunModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        JobRunModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        ApprovalRequestModel.find({ sessionId }).sort({ createdAt: 1 }).lean(),
        EventModel.find({ sessionId }).sort({ sequence: 1, ts: 1 }).limit(200).lean(),
      ]);
      const artifactViews = await Promise.all(artifacts.map((artifact) => buildArtifactInspectorView(artifact)));

      return res.json({
        ok: true,
        session,
        summary: {
          artifactCount: artifacts.length,
          taskRunCount: taskRuns.length,
          jobRunCount: jobRuns.length,
          approvalCount: approvals.length,
          eventCount: events.length,
        },
        artifacts,
        artifactViews,
        taskRuns,
        jobRuns,
        approvals,
        events,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/artifacts/:artifactId', async (req, res) => {
    try {
      await connectRuntimeDb();
      const artifactId = String(req.params.artifactId || '').trim();
      const artifact = await ArtifactModel.findById(artifactId).lean();
      if (!artifact) {
        return res.status(404).json({ ok: false, error: 'Artifact not found' });
      }

      const [payloadInspection, lineage, producerTaskRun] = await Promise.all([
        inspectArtifactPayload(artifact),
        ArtifactModel.find({ lineageRootId: artifact.lineageRootId })
          .sort({ version: 1 })
          .select('_id kind version supersedes latestInLineage status lifecycleStage createdAt updatedAt')
          .lean(),
        artifact.producedByTaskRun
          ? TaskRunModel.findById(artifact.producedByTaskRun)
            .select('_id sessionId planId stepId agentId skillId status attempt terminalReason createdAt startedAt endedAt')
            .lean()
          : Promise.resolve(null),
      ]);

      return res.json({
        ok: true,
        artifact,
        payloadInspection,
        lineage,
        producerTaskRun,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/artifacts/:artifactId/payload', async (req, res) => {
    try {
      await connectRuntimeDb();
      const artifactId = String(req.params.artifactId || '').trim();
      const artifact = await ArtifactModel.findById(artifactId).lean();
      if (!artifact) {
        return res.status(404).json({ ok: false, error: 'Artifact not found' });
      }

      const payload = await readArtifactPayloadJson(artifact);
      if (!payload) {
        return res.status(409).json({
          ok: false,
          error: 'Artifact payload is not a materialized JSON document',
        });
      }

      return res.json({
        ok: true,
        artifactId: artifact._id,
        kind: artifact.kind,
        payload,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  router.get('/artifacts/:artifactId/files/:fileName', async (req, res) => {
    try {
      await connectRuntimeDb();
      const artifactId = String(req.params.artifactId || '').trim();
      const requestedFileName = path.basename(String(req.params.fileName || '').trim());
      if (!requestedFileName) {
        return res.status(400).json({ ok: false, error: 'fileName is required' });
      }

      const artifact = await ArtifactModel.findById(artifactId).lean();
      if (!artifact) {
        return res.status(404).json({ ok: false, error: 'Artifact not found' });
      }

      const payload = await readArtifactPayloadJson(artifact);
      const files = Array.isArray(payload?.files) ? payload.files : [];
      const targetFile = files.find((file) => path.basename(String(file?.name || '')) === requestedFileName);

      if (!targetFile || !targetFile.path) {
        return res.status(404).json({ ok: false, error: 'Artifact file not found' });
      }

      try {
        await fs.promises.access(targetFile.path, fs.constants.R_OK);
      } catch (error) {
        return res.status(404).json({ ok: false, error: 'Artifact file is missing on disk' });
      }

      if (targetFile.mimeType) {
        res.type(targetFile.mimeType);
      }
      return res.sendFile(path.resolve(targetFile.path));
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err.message,
      });
    }
  });

  return router;
}

module.exports = {
  createRuntimeDemoRouter,
};
