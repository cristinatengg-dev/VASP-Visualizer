const { JobRunModel } = require('../persistence/models');

function summarizeLagging(results) {
  return results.reduce(
    (acc, item) => {
      acc.scanned += 1;
      if (item.status === 'lagging') {
        acc.lagging += 1;
      } else if (item.status === 'skipped') {
        acc.skipped += 1;
      } else if (item.status === 'error') {
        acc.errors += 1;
      }
      return acc;
    },
    {
      scanned: 0,
      lagging: 0,
      skipped: 0,
      errors: 0,
    }
  );
}

async function runHarvestLaggingMonitor({
  runtimeCore,
  now = new Date(),
  lagThresholdMs = 5 * 60 * 1000,
  limit = 50,
  emitEvents = true,
}) {
  const effectiveLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const effectiveLagThresholdMs = Math.max(10 * 1000, Number(lagThresholdMs || 5 * 60 * 1000));
  const cutoff = new Date(now.getTime() - effectiveLagThresholdMs);

  const candidates = await JobRunModel.find({
    status: 'completed',
    $or: [
      { materializationStatus: { $exists: false } },
      { materializationStatus: 'pending' },
    ],
    endedAt: { $lte: cutoff },
  })
    .sort({ endedAt: 1, createdAt: 1 })
    .limit(effectiveLimit)
    .select('_id sessionId taskRunId status materializationStatus endedAt updatedAt createdAt')
    .lean();

  const results = [];

  for (const candidate of candidates) {
    try {
      const outcome = await runtimeCore.withTransaction(async (tx) => {
        const jobRun = await runtimeCore.jobRunService.getJobRunById(candidate._id, tx);
        const materializationStatus = jobRun?.materializationStatus || 'pending';
        const referenceTime = jobRun?.endedAt || jobRun?.updatedAt || jobRun?.createdAt;
        const lagMs = referenceTime ? Math.max(0, now.getTime() - referenceTime.getTime()) : 0;

        if (!jobRun || jobRun.status !== 'completed' || materializationStatus !== 'pending' || (referenceTime && referenceTime > cutoff)) {
          return {
            jobRunId: candidate._id,
            taskRunId: candidate.taskRunId || null,
            status: 'skipped',
            reason: 'job_no_longer_lagging',
          };
        }

        if (emitEvents) {
          await runtimeCore.eventService.emitEvent(
            {
              sessionId: jobRun.sessionId,
              taskRunId: jobRun.taskRunId,
              jobRunId: jobRun._id,
              category: 'system',
              type: 'job_run.materialization_lagging',
              producerType: 'execution',
              payload: {
                jobRunId: jobRun._id,
                taskRunId: jobRun.taskRunId,
                materializationStatus,
                lagMs,
                thresholdMs: effectiveLagThresholdMs,
              },
            },
            tx
          );
        }

        return {
          jobRunId: jobRun._id,
          taskRunId: jobRun.taskRunId,
          status: 'lagging',
          lagMs,
          thresholdMs: effectiveLagThresholdMs,
        };
      });

      results.push(outcome);
    } catch (error) {
      results.push({
        jobRunId: candidate._id,
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
    lagThresholdMs: effectiveLagThresholdMs,
    summary: summarizeLagging(results),
    results,
  };
}

module.exports = {
  runHarvestLaggingMonitor,
};
