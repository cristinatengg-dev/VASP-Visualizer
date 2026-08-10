const { SessionModel } = require('../persistence/models');
const { makeRuntimeId } = require('../persistence/ids');

function createSessionService() {
  async function createSession(input = {}, tx) {
    const now = new Date();
    const doc = new SessionModel({
      _id: input._id || makeRuntimeId('sess'),
      projectId: input.projectId,
      ownerId: input.ownerId,
      status: input.status || 'active',
      workspaceType: input.workspaceType,
      clientTaskId: input.clientTaskId,
      title: input.title,
      latestSnapshotArtifactId: input.latestSnapshotArtifactId,
      snapshotRevision: input.snapshotRevision || 0,
      archivedAt: input.archivedAt,
      deletedAt: input.deletedAt,
      primaryGoalArtifactId: input.primaryGoalArtifactId,
      activePlanArtifactId: input.activePlanArtifactId,
      nextEventSequence: input.nextEventSequence || 1,
      revision: input.revision || 0,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: input.lastActivityAt || now,
      closedAt: input.closedAt,
    });
    return doc.save({ session: tx });
  }

  async function getSessionById(sessionId, tx) {
    return SessionModel.findById(sessionId, null, { session: tx });
  }

  async function touchSession(sessionId, tx) {
    return SessionModel.findByIdAndUpdate(
      sessionId,
      { $set: { updatedAt: new Date(), lastActivityAt: new Date() }, $inc: { revision: 1 } },
      { new: true, session: tx }
    );
  }

  async function setActivePlan({ sessionId, planArtifactId, tx }) {
    return SessionModel.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          activePlanArtifactId: planArtifactId,
          updatedAt: new Date(),
          lastActivityAt: new Date(),
        },
        $inc: { revision: 1 },
      },
      { new: true, session: tx }
    );
  }

  async function bindGoalAndPlan({ sessionId, primaryGoalArtifactId, activePlanArtifactId, tx }) {
    const patch = {
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    };
    if (primaryGoalArtifactId) patch.primaryGoalArtifactId = primaryGoalArtifactId;
    if (activePlanArtifactId) patch.activePlanArtifactId = activePlanArtifactId;

    return SessionModel.findByIdAndUpdate(
      sessionId,
      { $set: patch, $inc: { revision: 1 } },
      { new: true, session: tx }
    );
  }

  async function updateStatus({ sessionId, status, closedAt, tx }) {
    const patch = {
      status,
      updatedAt: new Date(),
      lastActivityAt: new Date(),
    };
    if (closedAt) patch.closedAt = closedAt;
    return SessionModel.findByIdAndUpdate(
      sessionId,
      { $set: patch, $inc: { revision: 1 } },
      { new: true, session: tx }
    );
  }

  async function allocateNextEventSequence(sessionId, tx) {
    const updated = await SessionModel.findByIdAndUpdate(
      sessionId,
      {
        $inc: { nextEventSequence: 1, revision: 1 },
        $set: { updatedAt: new Date(), lastActivityAt: new Date() },
      },
      { new: true, session: tx }
    );
    if (!updated) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return updated.nextEventSequence - 1;
  }

  async function updateWorkspaceSnapshot({
    sessionId,
    ownerId,
    title,
    latestSnapshotArtifactId,
    expectedSnapshotRevision,
    tx,
  }) {
    const query = { _id: sessionId, ownerId, deletedAt: { $exists: false } };
    if (Number.isInteger(expectedSnapshotRevision)) {
      query.snapshotRevision = expectedSnapshotRevision;
    }
    const updated = await SessionModel.findOneAndUpdate(
      query,
      {
        $set: {
          title,
          latestSnapshotArtifactId,
          updatedAt: new Date(),
          lastActivityAt: new Date(),
        },
        $inc: { snapshotRevision: 1, revision: 1 },
      },
      { new: true, session: tx }
    );
    return updated;
  }

  async function setWorkspaceArchived({ sessionId, ownerId, archived, tx }) {
    const now = new Date();
    const update = {
      $set: {
        updatedAt: now,
        lastActivityAt: now,
      },
      $inc: { revision: 1 },
    };
    if (archived) update.$set.archivedAt = now;
    else update.$unset = { archivedAt: 1 };
    return SessionModel.findOneAndUpdate(
      { _id: sessionId, ownerId, deletedAt: { $exists: false } },
      update,
      { new: true, session: tx }
    );
  }

  async function softDeleteWorkspace({ sessionId, ownerId, tx }) {
    const now = new Date();
    return SessionModel.findOneAndUpdate(
      { _id: sessionId, ownerId, deletedAt: { $exists: false } },
      {
        $set: {
          status: 'closed',
          deletedAt: now,
          closedAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
        $inc: { revision: 1 },
      },
      { new: true, session: tx }
    );
  }

  return {
    createSession,
    getSessionById,
    touchSession,
    setActivePlan,
    bindGoalAndPlan,
    updateStatus,
    allocateNextEventSequence,
    updateWorkspaceSnapshot,
    setWorkspaceArchived,
    softDeleteWorkspace,
  };
}

module.exports = {
  createSessionService,
};
