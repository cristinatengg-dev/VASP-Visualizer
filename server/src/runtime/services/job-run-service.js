const { JobRunModel } = require('../persistence/models');
const { makeRuntimeId } = require('../persistence/ids');

function createJobRunService() {
  async function createJobRun(input, tx) {
    const now = new Date();
    const doc = new JobRunModel({
      _id: input._id || makeRuntimeId('job'),
      sessionId: input.sessionId,
      taskRunId: input.taskRunId,
      parentJobRunId: input.parentJobRunId,
      spawnReason: input.spawnReason,
      externalJobId: input.externalJobId,
      system: input.system,
      status: input.status || 'created',
      materializationStatus: input.materializationStatus,
      materializationAttempt: input.materializationAttempt,
      lastMaterializationAt: input.lastMaterializationAt,
      schedulerRef: input.schedulerRef,
      lastHeartbeatAt: input.lastHeartbeatAt,
      snapshotRef: input.snapshotRef,
      resultArtifactId: input.resultArtifactId,
      terminalReason: input.terminalReason,
      retryable: Boolean(input.retryable),
      revision: input.revision || 0,
      createdAt: now,
      updatedAt: now,
      submittedAt: input.submittedAt,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
    });
    return doc.save({ session: tx });
  }

  async function getJobRunById(jobRunId, tx) {
    return JobRunModel.findById(jobRunId, null, { session: tx });
  }

  async function transitionJobRun({ jobRunId, toStatus, patch = {}, tx }) {
    const setPatch = {
      ...patch,
      status: toStatus,
      updatedAt: new Date(),
    };
    if (toStatus === 'submitted' && !setPatch.submittedAt) {
      setPatch.submittedAt = new Date();
    }
    if (toStatus === 'running' && !setPatch.startedAt) {
      setPatch.startedAt = new Date();
    }
    if (['completed', 'failed', 'cancelled'].includes(toStatus) && !setPatch.endedAt) {
      setPatch.endedAt = new Date();
    }

    return JobRunModel.findByIdAndUpdate(
      jobRunId,
      { $set: setPatch, $inc: { revision: 1 } },
      { new: true, session: tx }
    );
  }

  async function heartbeat({ jobRunId, lastHeartbeatAt = new Date(), tx }) {
    return JobRunModel.findByIdAndUpdate(
      jobRunId,
      {
        $set: { lastHeartbeatAt, updatedAt: new Date() },
        $inc: { revision: 1 },
      },
      { new: true, session: tx }
    );
  }

  async function setMaterializationStatus({ jobRunId, status, resultArtifactId, tx }) {
    const update = {
      $set: {
        materializationStatus: status,
        lastMaterializationAt: new Date(),
        updatedAt: new Date(),
      },
      $inc: { revision: 1, materializationAttempt: 1 },
    };
    if (resultArtifactId) {
      update.$set.resultArtifactId = resultArtifactId;
    }
    return JobRunModel.findByIdAndUpdate(jobRunId, update, { new: true, session: tx });
  }

  return {
    createJobRun,
    getJobRunById,
    transitionJobRun,
    heartbeat,
    setMaterializationStatus,
  };
}

module.exports = {
  createJobRunService,
};
