const { TaskRunModel } = require('../persistence/models');
const { makeRuntimeId } = require('../persistence/ids');

const terminalStatuses = new Set(['succeeded', 'failed', 'cancelled']);

function createTaskRunService() {
  async function createTaskRun(input, tx) {
    const now = new Date();
    const doc = new TaskRunModel({
      _id: input._id || makeRuntimeId('task'),
      sessionId: input.sessionId,
      planId: input.planId,
      stepId: input.stepId,
      agentId: input.agentId,
      skillId: input.skillId,
      parentTaskRunId: input.parentTaskRunId,
      spawnReason: input.spawnReason,
      currentApprovalRequestId: input.currentApprovalRequestId,
      correlationId: input.correlationId,
      inputArtifacts: input.inputArtifacts || [],
      outputArtifacts: input.outputArtifacts || [],
      status: input.status || 'draft',
      attempt: input.attempt || 1,
      retryable: Boolean(input.retryable),
      approvalRequired: Boolean(input.approvalRequired),
      logsRef: input.logsRef,
      metrics: input.metrics || {},
      terminalReason: input.terminalReason,
      revision: input.revision || 0,
      createdAt: now,
      updatedAt: now,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    });
    return doc.save({ session: tx });
  }

  async function getTaskRunById(taskRunId, tx) {
    return TaskRunModel.findById(taskRunId, null, { session: tx });
  }

  async function findTaskRunsByPlan({ planId, statuses, tx }) {
    const query = { planId };
    if (Array.isArray(statuses) && statuses.length > 0) {
      query.status = { $in: statuses };
    }
    return TaskRunModel.find(query, null, { session: tx }).sort({ createdAt: 1 });
  }

  async function transitionTaskRun({ taskRunId, toStatus, patch = {}, tx }) {
    const setPatch = {
      ...patch,
      status: toStatus,
      updatedAt: new Date(),
    };

    if (toStatus === 'running' && !setPatch.startedAt) {
      setPatch.startedAt = new Date();
    }
    if (terminalStatuses.has(toStatus) && !setPatch.endedAt) {
      setPatch.endedAt = new Date();
    }

    return TaskRunModel.findByIdAndUpdate(
      taskRunId,
      { $set: setPatch, $inc: { revision: 1 } },
      { new: true, session: tx }
    );
  }

  async function attachApproval({ taskRunId, approvalRequestId, tx }) {
    return TaskRunModel.findByIdAndUpdate(
      taskRunId,
      {
        $set: {
          currentApprovalRequestId: approvalRequestId,
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true, session: tx }
    );
  }

  async function appendOutputArtifacts({ taskRunId, artifactIds, tx }) {
    return TaskRunModel.findByIdAndUpdate(
      taskRunId,
      {
        $addToSet: { outputArtifacts: { $each: artifactIds } },
        $set: { updatedAt: new Date() },
        $inc: { revision: 1 },
      },
      { new: true, session: tx }
    );
  }

  async function cancelTaskRuns({ taskRunIds, terminalReason, tx }) {
    if (!Array.isArray(taskRunIds) || taskRunIds.length === 0) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    return TaskRunModel.updateMany(
      { _id: { $in: taskRunIds } },
      {
        $set: {
          status: 'cancelled',
          terminalReason,
          endedAt: new Date(),
          updatedAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { session: tx }
    );
  }

  return {
    createTaskRun,
    getTaskRunById,
    findTaskRunsByPlan,
    transitionTaskRun,
    attachApproval,
    appendOutputArtifacts,
    cancelTaskRuns,
  };
}

module.exports = {
  createTaskRunService,
};
