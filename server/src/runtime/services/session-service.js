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

  return {
    createSession,
    getSessionById,
    touchSession,
    setActivePlan,
    bindGoalAndPlan,
    updateStatus,
    allocateNextEventSequence,
  };
}

module.exports = {
  createSessionService,
};
