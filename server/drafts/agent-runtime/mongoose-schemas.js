const mongoose = require('mongoose');

const { Schema } = mongoose;

const artifactKinds = [
  'goal',
  'plan',
  'structure',
  'compute_input_set',
  'result_bundle',
  'visual_asset',
  'report',
];

const artifactStatus = ['draft', 'ready', 'archived', 'invalid'];
const artifactLifecycleStages = ['draft', 'validated', 'approved', 'published', 'archived'];
const riskLevels = ['low', 'medium', 'high'];
const approvalStatuses = ['none', 'required', 'approved', 'rejected'];
const artifactFrozenReasons = [
  'consumed_by_task',
  'referenced_by_job_run',
  'published',
  'approval_snapshotted',
];

const sessionStatuses = ['active', 'paused', 'closed'];
const taskStatuses = [
  'draft',
  'queued',
  'running',
  'waiting_approval',
  'blocked',
  'retrying',
  'partial',
  'succeeded',
  'failed',
  'cancelled',
];
const taskSpawnReasons = ['plan_step', 'retry', 'followup', 'recovery', 'manual'];
const jobSpawnReasons = ['submit', 'retry', 'requeue', 'manual', 'recovery'];
const jobSystems = ['slurm', 'pbs', 'local', 'mock'];
const jobStatuses = ['created', 'submitted', 'queued', 'running', 'completed', 'failed', 'cancelled'];
const materializationStatuses = ['pending', 'materialized', 'failed'];
const approvalTargetTypes = ['tool_call', 'task_transition'];
const approvalScopes = ['single_execution', 'retry_same_idempotency_key', 'plan_step_once'];
const approvalRequestStatuses = ['pending', 'approved', 'rejected', 'expired'];
const eventCategories = ['system', 'domain'];
const eventProducerTypes = ['orchestrator', 'policy', 'execution', 'subagent', 'tool'];
const effectTypes = ['pure_read', 'artifact_write', 'external_submit', 'external_mutation'];
const skillStatuses = ['active', 'deprecated'];
const skillStepFailurePolicies = ['stop', 'retry', 'fallback', 'ask_user'];

const strictObject = Object.freeze({ type: Map, of: Schema.Types.Mixed, default: void 0 });

function applyCommonOptions(schema) {
  schema.set('strict', true);
  schema.set('minimize', false);
  schema.set('versionKey', false);
}

const SessionSchema = new Schema(
  {
    _id: { type: String, required: true },
    projectId: { type: String, default: void 0 },
    ownerId: { type: String, required: true, index: true },
    status: { type: String, enum: sessionStatuses, required: true },
    primaryGoalArtifactId: { type: String, default: void 0 },
    activePlanArtifactId: { type: String, default: void 0 },
    nextEventSequence: { type: Number, required: true, default: 1 },
    revision: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    lastActivityAt: { type: Date, required: true, default: Date.now },
    closedAt: { type: Date, default: void 0 },
  },
  { collection: 'sessions' }
);

applyCommonOptions(SessionSchema);
SessionSchema.index({ ownerId: 1, status: 1, lastActivityAt: -1 });
SessionSchema.index({ projectId: 1, status: 1, lastActivityAt: -1 }, { sparse: true });
SessionSchema.index({ activePlanArtifactId: 1 }, { sparse: true });

const ArtifactSchema = new Schema(
  {
    _id: { type: String, required: true },
    kind: { type: String, enum: artifactKinds, required: true },
    sessionId: { type: String, required: true, index: true },
    projectId: { type: String, default: void 0 },
    version: { type: Number, required: true, min: 1 },
    supersedes: { type: String, default: void 0 },
    lineageRootId: { type: String, required: true },
    latestInLineage: { type: Boolean, required: true, default: true },
    sourceArtifacts: { type: [String], default: [] },
    producedByTaskRun: { type: String, default: void 0 },
    producedBySkill: { type: String, default: void 0 },
    status: { type: String, enum: artifactStatus, required: true },
    lifecycleStage: { type: String, enum: artifactLifecycleStages, default: void 0 },
    riskLevel: { type: String, enum: riskLevels, required: true, default: 'low' },
    approvalStatus: { type: String, enum: approvalStatuses, required: true, default: 'none' },
    isConsumable: { type: Boolean, default: void 0 },
    isFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: void 0 },
    frozenReason: { type: String, enum: artifactFrozenReasons, default: void 0 },
    consumedByTaskRuns: { type: [String], default: void 0 },
    payloadRef: { type: String, required: true },
    payloadType: {
      type: String,
      enum: ['json', 'poscar', 'vasp_bundle', 'image', 'pdf_text', 'report_markdown'],
      default: void 0,
    },
    mimeType: { type: String, default: void 0 },
    blobSizeBytes: { type: Number, min: 0, default: void 0 },
    contentHash: { type: String, default: void 0 },
    preview: strictObject,
    summary: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'artifacts' }
);

applyCommonOptions(ArtifactSchema);
ArtifactSchema.index({ sessionId: 1, kind: 1, createdAt: -1 });
ArtifactSchema.index({ projectId: 1, kind: 1, createdAt: -1 }, { sparse: true });
ArtifactSchema.index({ lineageRootId: 1, version: 1 }, { unique: true });
ArtifactSchema.index(
  { lineageRootId: 1, latestInLineage: 1 },
  { unique: true, partialFilterExpression: { latestInLineage: true } }
);
ArtifactSchema.index({ producedByTaskRun: 1 }, { sparse: true });
ArtifactSchema.index({ sourceArtifacts: 1 });
ArtifactSchema.index({ kind: 1, isFrozen: 1, latestInLineage: 1 });
ArtifactSchema.index({ sessionId: 1, kind: 1, isConsumable: 1 });

const TaskRunSchema = new Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    planId: { type: String, required: true },
    stepId: { type: String, required: true },
    agentId: { type: String, required: true },
    skillId: { type: String, required: true },
    parentTaskRunId: { type: String, default: void 0 },
    spawnReason: { type: String, enum: taskSpawnReasons, default: void 0 },
    currentApprovalRequestId: { type: String, default: void 0 },
    correlationId: { type: String, default: void 0 },
    inputArtifacts: { type: [String], default: [] },
    outputArtifacts: { type: [String], default: [] },
    status: { type: String, enum: taskStatuses, required: true },
    attempt: { type: Number, required: true, min: 1, default: 1 },
    retryable: { type: Boolean, required: true, default: false },
    approvalRequired: { type: Boolean, required: true, default: false },
    logsRef: { type: String, default: void 0 },
    metrics: strictObject,
    terminalReason: { type: String, default: void 0 },
    revision: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    startedAt: { type: Date, default: void 0 },
    endedAt: { type: Date, default: void 0 },
  },
  { collection: 'task_runs' }
);

applyCommonOptions(TaskRunSchema);
TaskRunSchema.index({ sessionId: 1, status: 1, createdAt: -1 });
TaskRunSchema.index({ planId: 1, stepId: 1, attempt: 1 }, { unique: true });
TaskRunSchema.index({ parentTaskRunId: 1 }, { sparse: true });
TaskRunSchema.index({ currentApprovalRequestId: 1 }, { sparse: true });
TaskRunSchema.index({ correlationId: 1, createdAt: 1 }, { sparse: true });
TaskRunSchema.index({ skillId: 1, status: 1, createdAt: -1 });

const JobRunSchema = new Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    taskRunId: { type: String, required: true },
    parentJobRunId: { type: String, default: void 0 },
    spawnReason: { type: String, enum: jobSpawnReasons, default: void 0 },
    externalJobId: { type: String, default: void 0 },
    system: { type: String, enum: jobSystems, required: true },
    status: { type: String, enum: jobStatuses, required: true },
    materializationStatus: { type: String, enum: materializationStatuses, default: void 0 },
    materializationAttempt: { type: Number, min: 0, default: void 0 },
    lastMaterializationAt: { type: Date, default: void 0 },
    schedulerRef: { type: String, default: void 0 },
    lastHeartbeatAt: { type: Date, default: void 0 },
    snapshotRef: { type: String, default: void 0 },
    resultArtifactId: { type: String, default: void 0 },
    terminalReason: { type: String, default: void 0 },
    retryable: { type: Boolean, required: true, default: false },
    revision: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
    submittedAt: { type: Date, default: void 0 },
    startedAt: { type: Date, default: void 0 },
    endedAt: { type: Date, default: void 0 },
  },
  { collection: 'job_runs' }
);

applyCommonOptions(JobRunSchema);
JobRunSchema.index({ taskRunId: 1, status: 1, createdAt: -1 });
JobRunSchema.index(
  { system: 1, schedulerRef: 1, externalJobId: 1 },
  { unique: true, partialFilterExpression: { externalJobId: { $exists: true } } }
);
JobRunSchema.index({ parentJobRunId: 1 }, { sparse: true });
JobRunSchema.index({ status: 1, lastHeartbeatAt: 1 });
JobRunSchema.index({ resultArtifactId: 1 }, { sparse: true });
JobRunSchema.index({ status: 1, materializationStatus: 1, endedAt: 1 });

const ApprovalRequestSchema = new Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    taskRunId: { type: String, required: true },
    targetType: { type: String, enum: approvalTargetTypes, required: true },
    targetRef: { type: String, required: true },
    reason: { type: String, required: true },
    estimatedCost: strictObject,
    snapshotRef: { type: String, required: true },
    requestedBy: { type: String, required: true },
    approvedBy: { type: String, default: void 0 },
    approvedAt: { type: Date, default: void 0 },
    expiresAt: { type: Date, default: void 0 },
    decisionNote: { type: String, default: void 0 },
    policyId: { type: String, default: void 0 },
    approvalScope: { type: String, enum: approvalScopes, required: true },
    riskSnapshotHash: { type: String, required: true },
    approvedIdempotencyKey: { type: String, default: void 0 },
    status: { type: String, enum: approvalRequestStatuses, required: true },
    revision: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'approval_requests' }
);

applyCommonOptions(ApprovalRequestSchema);
ApprovalRequestSchema.index({ taskRunId: 1, status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ targetRef: 1, policyId: 1, riskSnapshotHash: 1 });
ApprovalRequestSchema.index({ expiresAt: 1, status: 1 }, { sparse: true });
ApprovalRequestSchema.index({ approvedIdempotencyKey: 1 }, { sparse: true });
ApprovalRequestSchema.index({ sessionId: 1, status: 1 });
ApprovalRequestSchema.index(
  { taskRunId: 1, targetRef: 1, policyId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

const EventSchema = new Schema(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true, index: true },
    taskRunId: { type: String, default: void 0 },
    jobRunId: { type: String, default: void 0 },
    category: { type: String, enum: eventCategories, required: true },
    type: { type: String, required: true },
    ts: { type: Date, required: true, default: Date.now },
    producerType: { type: String, enum: eventProducerTypes, default: void 0 },
    correlationId: { type: String, default: void 0 },
    causationId: { type: String, default: void 0 },
    sequence: { type: Number, min: 1, default: void 0 },
    dedupeKey: { type: String, default: void 0 },
    streamPartition: { type: String, default: void 0 },
    payload: { type: Map, of: Schema.Types.Mixed, default: {} },
  },
  { collection: 'events' }
);

applyCommonOptions(EventSchema);
EventSchema.index({ sessionId: 1, sequence: 1 }, { unique: true, sparse: true });
EventSchema.index({ taskRunId: 1, ts: 1 }, { sparse: true });
EventSchema.index({ jobRunId: 1, ts: 1 }, { sparse: true });
EventSchema.index({ correlationId: 1, ts: 1 }, { sparse: true });
EventSchema.index(
  { sessionId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $exists: true } } }
);
EventSchema.index({ type: 1, ts: -1 });

const SkillToolStepSchema = new Schema(
  {
    id: { type: String, required: true },
    toolName: { type: String, required: true },
    inputBindings: { type: Map, of: String, default: {} },
    effectType: { type: String, enum: effectTypes, required: true },
    onFailure: { type: String, enum: skillStepFailurePolicies, required: true },
    outputBindings: { type: Map, of: String, default: void 0 },
  },
  { _id: false }
);

const SkillDefinitionSchema = new Schema(
  {
    _id: { type: String, required: true },
    skillId: { type: String, required: true },
    version: { type: String, required: true },
    latest: { type: Boolean, required: true, default: false },
    requiredArtifacts: { type: [String], default: [] },
    inputSchemaRef: { type: String, required: true },
    steps: { type: [SkillToolStepSchema], required: true, default: [] },
    validatorIds: { type: [String], default: [] },
    outputArtifacts: { type: [String], default: [] },
    approvalPolicy: { type: String, required: true },
    retryPolicy: { type: String, required: true },
    failurePolicy: { type: String, required: true },
    contextPolicy: { type: String, required: true },
    status: { type: String, enum: skillStatuses, required: true, default: 'active' },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'skill_definitions' }
);

applyCommonOptions(SkillDefinitionSchema);
SkillDefinitionSchema.index({ skillId: 1, version: 1 }, { unique: true });
SkillDefinitionSchema.index(
  { skillId: 1, latest: 1 },
  { unique: true, partialFilterExpression: { latest: true } }
);
SkillDefinitionSchema.index({ status: 1, skillId: 1 });

function getOrCreateModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const SessionModel = getOrCreateModel('RuntimeSession', SessionSchema);
const ArtifactModel = getOrCreateModel('RuntimeArtifact', ArtifactSchema);
const TaskRunModel = getOrCreateModel('RuntimeTaskRun', TaskRunSchema);
const JobRunModel = getOrCreateModel('RuntimeJobRun', JobRunSchema);
const ApprovalRequestModel = getOrCreateModel('RuntimeApprovalRequest', ApprovalRequestSchema);
const EventModel = getOrCreateModel('RuntimeEvent', EventSchema);
const SkillDefinitionModel = getOrCreateModel('RuntimeSkillDefinition', SkillDefinitionSchema);

module.exports = {
  SessionSchema,
  ArtifactSchema,
  TaskRunSchema,
  JobRunSchema,
  ApprovalRequestSchema,
  EventSchema,
  SkillDefinitionSchema,
  SessionModel,
  ArtifactModel,
  TaskRunModel,
  JobRunModel,
  ApprovalRequestModel,
  EventModel,
  SkillDefinitionModel,
};
