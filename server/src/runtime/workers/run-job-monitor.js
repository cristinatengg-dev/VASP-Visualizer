const { TaskRunModel, JobRunModel } = require('../persistence/models');
const { runHarvestMockJobTask } = require('../adapters/compute/run-harvest-mock-job-task');
const { runHarvestLocalJobTask } = require('../adapters/compute/run-harvest-local-job-task');
const { queryPbsJobStatus, querySlurmJobStatus, queryLocalJobStatus } = require('../../compute/query-job');

function summarizeMonitor(results) {
  return results.reduce(
    (acc, item) => {
      acc.scanned += 1;
      if (item.status === 'transitioned') {
        acc.transitioned += 1;
      } else if (item.status === 'heartbeat') {
        acc.heartbeats += 1;
      } else if (item.status === 'harvest_started') {
        acc.harvestStarted += 1;
      } else if (item.status === 'skipped') {
        acc.skipped += 1;
      } else if (item.status === 'error') {
        acc.errors += 1;
      }
      return acc;
    },
    {
      scanned: 0,
      transitioned: 0,
      heartbeats: 0,
      harvestStarted: 0,
      skipped: 0,
      errors: 0,
    }
  );
}

function computeTimedJobNextStatus(jobRun, now, thresholds) {
  const submittedAt = jobRun.submittedAt || jobRun.createdAt || now;
  const ageMs = Math.max(0, now.getTime() - submittedAt.getTime());

  if (ageMs >= thresholds.completeAfterMs) {
    return { status: 'completed', ageMs };
  }
  if (ageMs >= thresholds.runningAfterMs) {
    return { status: 'running', ageMs };
  }
  if (ageMs >= thresholds.queueAfterMs) {
    return { status: 'queued', ageMs };
  }
  return { status: 'submitted', ageMs };
}

async function loadHarvestContext(runtimeCore, { jobRunId, taskRunId }) {
  const [jobRun, parentTaskRun] = await Promise.all([
    runtimeCore.jobRunService.getJobRunById(jobRunId),
    runtimeCore.taskRunService.getTaskRunById(taskRunId),
  ]);

  if (!jobRun || !parentTaskRun) {
    return null;
  }

  const session = await runtimeCore.sessionService.getSessionById(jobRun.sessionId);
  if (!session) {
    return null;
  }

  const [goalArtifact, planArtifact, harvestTaskRun] = await Promise.all([
    session.primaryGoalArtifactId
      ? runtimeCore.artifactService.getArtifactById(session.primaryGoalArtifactId)
      : Promise.resolve(null),
    parentTaskRun.planId
      ? runtimeCore.artifactService.getArtifactById(parentTaskRun.planId)
      : Promise.resolve(null),
    TaskRunModel.findOne({
      planId: parentTaskRun.planId,
      stepId: `harvest-${jobRunId}`,
    }).sort({ createdAt: -1 }),
  ]);

  if (!harvestTaskRun) {
    return null;
  }

  return {
    session,
    goalArtifact,
    planArtifact,
    jobRun,
    harvestTaskRun,
  };
}

function buildHeartbeatPayload(jobRun, details = {}) {
  return {
    jobRunId: jobRun._id,
    system: jobRun.system,
    status: jobRun.status,
    ...details,
  };
}

async function emitHeartbeatEvent(runtimeCore, { jobRun, tx, details = {} }) {
  await runtimeCore.eventService.emitEvent(
    {
      sessionId: jobRun.sessionId,
      taskRunId: jobRun.taskRunId,
      jobRunId: jobRun._id,
      category: 'system',
      type: 'job_run.heartbeat',
      producerType: 'execution',
      payload: buildHeartbeatPayload(jobRun, details),
    },
    tx
  );
}

async function emitTransitionEvent(runtimeCore, { previousJobRun, transitionedJobRun, tx, details = {} }) {
  await runtimeCore.eventService.emitEvent(
    {
      sessionId: transitionedJobRun.sessionId,
      taskRunId: transitionedJobRun.taskRunId,
      jobRunId: transitionedJobRun._id,
      category: 'system',
      type: `job_run.${transitionedJobRun.status}`,
      producerType: 'execution',
      payload: {
        jobRunId: transitionedJobRun._id,
        previousStatus: previousJobRun.status,
        status: transitionedJobRun.status,
        ...details,
      },
    },
    tx
  );
}

async function determineObservedStatus(jobRun, now, thresholds) {
  if (jobRun.system === 'slurm') {
    const queried = await querySlurmJobStatus(jobRun.externalJobId);
    if (!queried.ok || !queried.jobStatus) {
      return {
        mode: 'heartbeat_only',
        reason: queried.reason || 'slurm_query_unavailable',
        details: queried.details || null,
      };
    }

    return {
      mode: 'observed',
      status: queried.jobStatus,
      details: {
        schedulerState: queried.schedulerState || null,
        source: queried.source || 'slurm',
      },
    };
  }

  if (jobRun.system === 'pbs') {
    const queried = await queryPbsJobStatus(jobRun.externalJobId);
    if (!queried.ok || !queried.jobStatus) {
      return {
        mode: 'heartbeat_only',
        reason: queried.reason || 'pbs_query_unavailable',
        details: queried.details || null,
      };
    }

    return {
      mode: 'observed',
      status: queried.jobStatus,
      details: {
        schedulerState: queried.schedulerState || null,
        exitStatus: queried.exitStatus ?? null,
        source: queried.source || 'pbs',
      },
    };
  }

  if (jobRun.system === 'local') {
    const queried = await queryLocalJobStatus(jobRun.snapshotRef);
    if (queried.ok && queried.profileMode === 'server_local' && queried.jobStatus) {
      return {
        mode: 'observed',
        status: queried.jobStatus,
        details: {
          source: queried.source || 'runtime-status',
          profileMode: queried.profileMode,
        },
      };
    }

    const timed = computeTimedJobNextStatus(jobRun, now, thresholds);
    return {
      mode: 'observed',
      status: timed.status,
      details: {
        ageMs: timed.ageMs,
        source: queried.reason || 'local_demo_progression',
        profileMode: queried.profileMode || 'local_demo',
      },
    };
  }

  if (jobRun.system === 'mock') {
    const timed = computeTimedJobNextStatus(jobRun, now, thresholds);
    return {
      mode: 'observed',
      status: timed.status,
      details: {
        ageMs: timed.ageMs,
        source: 'mock_progression',
      },
    };
  }

  return {
    mode: 'heartbeat_only',
    reason: 'unsupported_system_monitor',
    details: {
      system: jobRun.system,
    },
  };
}

async function scheduleHarvestTaskIfNeeded({
  runtimeCore,
  jobRun,
  tx,
}) {
  if (jobRun.status !== 'completed' || (jobRun.materializationStatus || 'pending') !== 'pending') {
    return null;
  }

  const harvestSkillId = jobRun.system === 'mock'
    ? 'harvest_mock_result'
    : (['local', 'slurm', 'pbs'].includes(jobRun.system) ? 'harvest_local_result' : null);

  if (!harvestSkillId) {
    return null;
  }

  const parentTaskRun = await runtimeCore.taskRunService.getTaskRunById(jobRun.taskRunId, tx);
  if (!parentTaskRun || !parentTaskRun.planId) {
    return null;
  }

  const session = await runtimeCore.sessionService.getSessionById(jobRun.sessionId, tx);
  if (!session) {
    return null;
  }

  const [goalArtifact, planArtifact, existingHarvestTask] = await Promise.all([
    session.primaryGoalArtifactId
      ? runtimeCore.artifactService.getArtifactById(session.primaryGoalArtifactId, tx)
      : Promise.resolve(null),
    runtimeCore.artifactService.getArtifactById(parentTaskRun.planId, tx),
    TaskRunModel.findOne({
      planId: parentTaskRun.planId,
      stepId: `harvest-${jobRun._id}`,
    }, null, { session: tx }),
  ]);

  if (!planArtifact || existingHarvestTask) {
    return existingHarvestTask ? existingHarvestTask._id : null;
  }

  const harvestTaskRun = await runtimeCore.createAndStageTaskRun({
    session,
    goalArtifact,
    planArtifact,
    taskSpec: {
      stepId: `harvest-${jobRun._id}`,
      skillId: harvestSkillId,
      agentId: 'compute-subagent',
      parentTaskRunId: parentTaskRun._id,
      spawnReason: 'followup',
      correlationId: `${parentTaskRun.correlationId || parentTaskRun._id}:harvest:${jobRun._id}`,
      inputArtifacts: Array.isArray(parentTaskRun.outputArtifacts) && parentTaskRun.outputArtifacts.length > 0
        ? parentTaskRun.outputArtifacts
        : (parentTaskRun.inputArtifacts || []),
      retryable: true,
      approvalRequired: false,
    },
    tx,
  });

  await runtimeCore.eventService.emitEvent(
    {
      sessionId: jobRun.sessionId,
      taskRunId: parentTaskRun._id,
      jobRunId: jobRun._id,
      category: 'system',
      type: 'job_run.harvest_scheduled',
      producerType: 'execution',
      payload: {
        jobRunId: jobRun._id,
        harvestTaskRunId: harvestTaskRun._id,
        harvestSkillId,
      },
    },
    tx
  );

  return harvestTaskRun._id;
}

async function heartbeatJobRun(runtimeCore, { jobRun, now, tx, details = {}, reason = null }) {
  const heartbeated = await runtimeCore.jobRunService.heartbeat({
    jobRunId: jobRun._id,
    lastHeartbeatAt: now,
    tx,
  });

  await emitHeartbeatEvent(runtimeCore, {
    jobRun: heartbeated,
    tx,
    details: {
      ...details,
      ...(reason ? { reason } : {}),
    },
  });

  return {
    jobRunId: heartbeated._id,
    taskRunId: heartbeated.taskRunId,
    status: 'heartbeat',
    jobStatus: heartbeated.status,
    reason: reason || null,
  };
}

async function transitionObservedJob(runtimeCore, { jobRun, observedStatus, now, tx, details = {} }) {
  const transitioned = await runtimeCore.jobRunService.transitionJobRun({
    jobRunId: jobRun._id,
    toStatus: observedStatus,
    patch: {
      lastHeartbeatAt: now,
    },
    tx,
  });

  await emitTransitionEvent(runtimeCore, {
    previousJobRun: jobRun,
    transitionedJobRun: transitioned,
    tx,
    details,
  });

  const harvestTaskRunId = await scheduleHarvestTaskIfNeeded({
    runtimeCore,
    jobRun: transitioned,
    tx,
  });

  return {
    jobRunId: transitioned._id,
    taskRunId: transitioned.taskRunId,
    status: harvestTaskRunId ? 'harvest_started' : 'transitioned',
    previousStatus: jobRun.status,
    jobStatus: observedStatus,
    harvestTaskRunId,
  };
}

async function runJobMonitor({
  runtimeCore,
  policyEngine,
  now = new Date(),
  limit = 50,
  thresholds = {},
}) {
  const effectiveLimit = Math.max(1, Math.min(Number(limit || 50), 200));
  const effectiveThresholds = {
    queueAfterMs: Math.max(0, Number(thresholds.queueAfterMs || 1 * 1000)),
    runningAfterMs: Math.max(500, Number(thresholds.runningAfterMs || 3 * 1000)),
    completeAfterMs: Math.max(1500, Number(thresholds.completeAfterMs || 8 * 1000)),
  };

  const candidates = await JobRunModel.find({
    status: { $in: ['submitted', 'queued', 'running'] },
  })
    .sort({ submittedAt: 1, createdAt: 1 })
    .limit(effectiveLimit)
    .select('_id sessionId taskRunId system status submittedAt createdAt')
    .lean();

  const results = [];
  const harvestQueue = [];

  for (const candidate of candidates) {
    try {
      const outcome = await runtimeCore.withTransaction(async (tx) => {
        const jobRun = await runtimeCore.jobRunService.getJobRunById(candidate._id, tx);
        if (!jobRun || ['completed', 'failed', 'cancelled'].includes(jobRun.status)) {
          return {
            jobRunId: candidate._id,
            taskRunId: candidate.taskRunId || null,
            status: 'skipped',
            reason: 'job_no_longer_active',
          };
        }

        const observed = await determineObservedStatus(jobRun, now, effectiveThresholds);

        if (observed.mode === 'heartbeat_only') {
          return heartbeatJobRun(runtimeCore, {
            jobRun,
            now,
            tx,
            details: observed.details || {},
            reason: observed.reason || null,
          });
        }

        if (observed.status === jobRun.status) {
          return heartbeatJobRun(runtimeCore, {
            jobRun,
            now,
            tx,
            details: observed.details || {},
          });
        }

        return transitionObservedJob(runtimeCore, {
          jobRun,
          observedStatus: observed.status,
          now,
          tx,
          details: observed.details || {},
        });
      });

      results.push(outcome);
      if (outcome.harvestTaskRunId) {
        harvestQueue.push({
          jobRunId: outcome.jobRunId,
          taskRunId: outcome.taskRunId,
          harvestTaskRunId: outcome.harvestTaskRunId,
        });
      }
    } catch (error) {
      results.push({
        jobRunId: candidate._id,
        taskRunId: candidate.taskRunId || null,
        status: 'error',
        error: error.message,
      });
    }
  }

  const harvested = [];
  for (const item of harvestQueue) {
    try {
      const context = await loadHarvestContext(runtimeCore, {
        jobRunId: item.jobRunId,
        taskRunId: item.taskRunId,
      });

      if (!context || !context.harvestTaskRun) {
        harvested.push({
          jobRunId: item.jobRunId,
          harvestTaskRunId: item.harvestTaskRunId,
          status: 'skipped',
          reason: 'harvest_context_missing',
        });
        continue;
      }

      const harvestRunner = context.jobRun.system === 'mock'
        ? runHarvestMockJobTask
        : runHarvestLocalJobTask;

      const result = await harvestRunner({
        runtimeCore,
        policyEngine,
        session: context.session,
        goalArtifact: context.goalArtifact,
        planArtifact: context.planArtifact,
        taskRun: context.harvestTaskRun,
        jobRun: context.jobRun,
      });

      harvested.push({
        jobRunId: item.jobRunId,
        harvestTaskRunId: item.harvestTaskRunId,
        status: 'materialized',
        resultArtifactId: result.resultArtifact ? result.resultArtifact._id : null,
      });
    } catch (error) {
      harvested.push({
        jobRunId: item.jobRunId,
        harvestTaskRunId: item.harvestTaskRunId,
        status: 'error',
        error: error.message,
      });
    }
  }

  return {
    ok: true,
    now: now.toISOString(),
    limit: effectiveLimit,
    thresholds: effectiveThresholds,
    summary: summarizeMonitor(results),
    results,
    harvested,
  };
}

module.exports = {
  runJobMonitor,
};
