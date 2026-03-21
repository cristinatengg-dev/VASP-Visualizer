const { ArtifactModel } = require('../persistence/models');
const { makeRuntimeId } = require('../persistence/ids');

function inferDraftPayloadRef({ lineageRootId, version }) {
  return `draft://artifacts/${lineageRootId}/v${version || 1}/payload`;
}

function createArtifactService() {
  function reserveArtifactIdentity(input = {}) {
    const id = input._id || makeRuntimeId('art');
    const lineageRootId = input.lineageRootId || id;
    const version = input.version || 1;
    return {
      _id: id,
      lineageRootId,
      version,
    };
  }

  async function createArtifact(input, tx) {
    const now = new Date();
    const identity = reserveArtifactIdentity(input);

    const doc = new ArtifactModel({
      _id: identity._id,
      kind: input.kind,
      sessionId: input.sessionId,
      projectId: input.projectId,
      version: identity.version,
      supersedes: input.supersedes,
      lineageRootId: identity.lineageRootId,
      latestInLineage: input.latestInLineage !== false,
      sourceArtifacts: input.sourceArtifacts || [],
      producedByTaskRun: input.producedByTaskRun,
      producedBySkill: input.producedBySkill,
      status: input.status || 'draft',
      lifecycleStage: input.lifecycleStage,
      riskLevel: input.riskLevel || 'low',
      approvalStatus: input.approvalStatus || 'none',
      isConsumable: input.isConsumable,
      isFrozen: input.isFrozen || false,
      frozenAt: input.frozenAt,
      frozenReason: input.frozenReason,
      consumedByTaskRuns: input.consumedByTaskRuns,
      payloadRef: input.payloadRef || inferDraftPayloadRef({ lineageRootId: identity.lineageRootId, version: identity.version }),
      payloadType: input.payloadType,
      mimeType: input.mimeType,
      blobSizeBytes: input.blobSizeBytes,
      contentHash: input.contentHash,
      preview: input.preview || {},
      summary: input.summary,
      createdAt: now,
      updatedAt: now,
    });
    return doc.save({ session: tx });
  }

  async function getArtifactById(artifactId, tx) {
    return ArtifactModel.findById(artifactId, null, { session: tx });
  }

  async function setLatestInLineage({ artifactId, latestInLineage, tx }) {
    return ArtifactModel.findByIdAndUpdate(
      artifactId,
      { $set: { latestInLineage, updatedAt: new Date() } },
      { new: true, session: tx }
    );
  }

  async function freezeArtifact({ artifactId, reason, consumedByTaskRunId, tx }) {
    const patch = {
      isFrozen: true,
      frozenAt: new Date(),
      frozenReason: reason,
      updatedAt: new Date(),
    };
    const update = { $set: patch };
    if (consumedByTaskRunId) {
      update.$addToSet = { consumedByTaskRuns: consumedByTaskRunId };
    }
    return ArtifactModel.findByIdAndUpdate(artifactId, update, { new: true, session: tx });
  }

  async function supersedeArtifact({ artifactId, nextArtifact, tx }) {
    const current = await ArtifactModel.findById(artifactId, null, { session: tx });
    if (!current) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }
    if (current.kind !== nextArtifact.kind) {
      throw new Error(`Cannot supersede artifact kind ${current.kind} with ${nextArtifact.kind}`);
    }

    await ArtifactModel.findByIdAndUpdate(
      current._id,
      { $set: { latestInLineage: false, updatedAt: new Date() } },
      { new: true, session: tx }
    );

    return createArtifact(
      {
        ...nextArtifact,
        supersedes: current._id,
        lineageRootId: current.lineageRootId,
        version: current.version + 1,
        latestInLineage: true,
      },
      tx
    );
  }

  async function setConsumable({ artifactId, isConsumable, tx }) {
    return ArtifactModel.findByIdAndUpdate(
      artifactId,
      { $set: { isConsumable, updatedAt: new Date() } },
      { new: true, session: tx }
    );
  }

  async function updateArtifactPayload({
    artifactId,
    payloadRef,
    payloadType,
    mimeType,
    blobSizeBytes,
    contentHash,
    tx,
  }) {
    return ArtifactModel.findByIdAndUpdate(
      artifactId,
      {
        $set: {
          payloadRef,
          payloadType,
          mimeType,
          blobSizeBytes,
          contentHash,
          updatedAt: new Date(),
        },
      },
      { new: true, session: tx }
    );
  }

  return {
    reserveArtifactIdentity,
    createArtifact,
    getArtifactById,
    setLatestInLineage,
    freezeArtifact,
    supersedeArtifact,
    setConsumable,
    updateArtifactPayload,
  };
}

module.exports = {
  createArtifactService,
};
