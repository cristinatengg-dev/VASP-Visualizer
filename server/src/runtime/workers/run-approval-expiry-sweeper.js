const { ApprovalRequestModel } = require('../persistence/models');

function summarizeSweep(results) {
  return results.reduce(
    (acc, item) => {
      acc.scanned += 1;
      if (item.status === 'expired') {
        acc.expired += 1;
      } else if (item.status === 'cancelled_task_run') {
        acc.cancelledTaskRuns += 1;
      } else if (item.status === 'skipped') {
        acc.skipped += 1;
      } else if (item.status === 'error') {
        acc.errors += 1;
      }
      return acc;
    },
    {
      scanned: 0,
      expired: 0,
      cancelledTaskRuns: 0,
      skipped: 0,
      errors: 0,
    }
  );
}

async function runApprovalExpirySweeper({
  runtimeCore,
  now = new Date(),
  limit = 50,
}) {
  const effectiveLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const expiredCandidates = await ApprovalRequestModel.find({
    status: 'pending',
    expiresAt: { $lte: now },
  })
    .sort({ expiresAt: 1, createdAt: 1 })
    .limit(effectiveLimit)
    .select('_id sessionId taskRunId expiresAt')
    .lean();

  const results = [];

  for (const candidate of expiredCandidates) {
    try {
      const outcome = await runtimeCore.withTransaction(async (tx) => {
        const approval = await runtimeCore.approvalService.getApprovalRequestById(candidate._id, tx);
        if (!approval || approval.status !== 'pending' || !approval.expiresAt || approval.expiresAt > now) {
          return {
            approvalRequestId: candidate._id,
            taskRunId: candidate.taskRunId || null,
            status: 'skipped',
            reason: 'approval_no_longer_pending',
          };
        }

        const expiredApproval = await runtimeCore.approvalService.resolveApprovalRequest({
          approvalRequestId: approval._id,
          status: 'expired',
          decisionNote: approval.decisionNote || 'expired_by_sweeper',
          tx,
        });

        await runtimeCore.eventService.emitEvent(
          {
            sessionId: expiredApproval.sessionId,
            taskRunId: expiredApproval.taskRunId,
            category: 'system',
            type: 'approval.expired',
            producerType: 'policy',
            payload: {
              approvalRequestId: expiredApproval._id,
              taskRunId: expiredApproval.taskRunId,
              expiresAt: expiredApproval.expiresAt,
            },
          },
          tx
        );

        const taskRun = await runtimeCore.taskRunService.getTaskRunById(expiredApproval.taskRunId, tx);
        if (
          taskRun
          && String(taskRun.currentApprovalRequestId || '') === String(expiredApproval._id)
          && taskRun.status === 'waiting_approval'
        ) {
          await runtimeCore.taskRunService.transitionTaskRun({
            taskRunId: taskRun._id,
            toStatus: 'cancelled',
            patch: {
              terminalReason: 'approval_expired',
            },
            tx,
          });

          await runtimeCore.eventService.emitEvent(
            {
              sessionId: expiredApproval.sessionId,
              taskRunId: taskRun._id,
              category: 'system',
              type: 'task_run.cancelled',
              producerType: 'policy',
              payload: {
                taskRunId: taskRun._id,
                approvalRequestId: expiredApproval._id,
                reason: 'approval_expired',
              },
            },
            tx
          );

          return {
            approvalRequestId: expiredApproval._id,
            taskRunId: taskRun._id,
            status: 'cancelled_task_run',
          };
        }

        return {
          approvalRequestId: expiredApproval._id,
          taskRunId: expiredApproval.taskRunId,
          status: 'expired',
        };
      });

      results.push(outcome);
    } catch (error) {
      results.push({
        approvalRequestId: candidate._id,
        taskRunId: candidate.taskRunId || null,
        status: 'error',
        error: error.message,
      });
    }
  }

  return {
    ok: true,
    now: now.toISOString(),
    limit: effectiveLimit,
    summary: summarizeSweep(results),
    results,
  };
}

module.exports = {
  runApprovalExpirySweeper,
};
