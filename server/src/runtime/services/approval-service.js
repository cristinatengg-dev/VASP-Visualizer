const { ApprovalRequestModel } = require('../persistence/models');
const { makeRuntimeId } = require('../persistence/ids');

function createApprovalService() {
  async function createApprovalRequest(input, tx) {
    const now = new Date();
    const doc = new ApprovalRequestModel({
      _id: input._id || makeRuntimeId('apr'),
      sessionId: input.sessionId,
      taskRunId: input.taskRunId,
      targetType: input.targetType,
      targetRef: input.targetRef,
      reason: input.reason,
      estimatedCost: input.estimatedCost || {},
      snapshotRef: input.snapshotRef,
      requestedBy: input.requestedBy,
      approvedBy: input.approvedBy,
      approvedAt: input.approvedAt,
      expiresAt: input.expiresAt,
      decisionNote: input.decisionNote,
      policyId: input.policyId,
      approvalScope: input.approvalScope,
      riskSnapshotHash: input.riskSnapshotHash,
      approvedIdempotencyKey: input.approvedIdempotencyKey,
      status: input.status || 'pending',
      revision: input.revision || 0,
      createdAt: now,
      updatedAt: now,
    });
    return doc.save({ session: tx });
  }

  async function getApprovalRequestById(approvalRequestId, tx) {
    return ApprovalRequestModel.findById(approvalRequestId, null, { session: tx });
  }

  async function resolveApprovalRequest({ approvalRequestId, status, approvedBy, decisionNote, tx }) {
    const setPatch = {
      status,
      updatedAt: new Date(),
      decisionNote,
    };
    if (status === 'approved') {
      setPatch.approvedBy = approvedBy;
      setPatch.approvedAt = new Date();
    }
    return ApprovalRequestModel.findByIdAndUpdate(
      approvalRequestId,
      { $set: setPatch, $inc: { revision: 1 } },
      { new: true, session: tx }
    );
  }

  return {
    createApprovalRequest,
    getApprovalRequestById,
    resolveApprovalRequest,
  };
}

module.exports = {
  createApprovalService,
};
