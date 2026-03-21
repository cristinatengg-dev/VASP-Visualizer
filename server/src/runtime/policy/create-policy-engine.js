function createPolicyEngine(options = {}) {
  const defaults = {
    async runInitialPreflight({ taskRun }) {
      if (!taskRun) {
        return { ok: false, nextStatus: 'blocked', reason: 'missing_task_run' };
      }
      return { ok: true, nextStatus: 'queued' };
    },

    async runPreflight({ effectType, inputArtifacts }) {
      if (!effectType) {
        return { ok: false, reason: 'missing_effect_type' };
      }
      return {
        ok: true,
        effectType,
        inputArtifactCount: Array.isArray(inputArtifacts) ? inputArtifacts.length : 0,
      };
    },

    async evaluateRisk({ effectType, estimatedCost }) {
      const risky = effectType === 'external_submit' || effectType === 'external_mutation';
      return {
        ok: true,
        riskLevel: risky ? 'high' : 'low',
        approvalRequired: risky,
        estimatedCost: estimatedCost || {},
      };
    },

    async validateAcceptance({ artifactsCreated, validatorHints }) {
      return {
        ok: true,
        artifactsCreated: Array.isArray(artifactsCreated) ? artifactsCreated.length : 0,
        validatorHints: validatorHints || [],
      };
    },

    async validateApprovalApplicability({ approvalRequest, targetRef, policyId, riskSnapshotHash, idempotencyKey }) {
      if (!approvalRequest) {
        return { ok: false, reason: 'missing_approval_request' };
      }
      if (approvalRequest.status !== 'approved') {
        return { ok: false, reason: 'approval_not_approved' };
      }
      if (approvalRequest.expiresAt && new Date(approvalRequest.expiresAt).getTime() < Date.now()) {
        return { ok: false, reason: 'approval_expired' };
      }
      if (approvalRequest.targetRef !== targetRef) {
        return { ok: false, reason: 'target_ref_mismatch' };
      }
      if ((approvalRequest.policyId || null) !== (policyId || null)) {
        return { ok: false, reason: 'policy_mismatch' };
      }
      if (approvalRequest.riskSnapshotHash !== riskSnapshotHash) {
        return { ok: false, reason: 'risk_snapshot_mismatch' };
      }
      if (
        approvalRequest.approvalScope === 'retry_same_idempotency_key' &&
        approvalRequest.approvedIdempotencyKey &&
        approvalRequest.approvedIdempotencyKey !== idempotencyKey
      ) {
        return { ok: false, reason: 'idempotency_key_mismatch' };
      }
      return { ok: true };
    },
  };

  return {
    ...defaults,
    ...options,
  };
}

module.exports = {
  createPolicyEngine,
};
