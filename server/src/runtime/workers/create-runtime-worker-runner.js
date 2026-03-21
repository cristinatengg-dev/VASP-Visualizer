const { createRuntimeCore } = require('../core/create-runtime-core');
const { createPolicyEngine } = require('../policy/create-policy-engine');
const { connectRuntimeDb } = require('../persistence/connect-runtime-db');
const { runJobMonitor } = require('./run-job-monitor');
const { runApprovalExpirySweeper } = require('./run-approval-expiry-sweeper');
const { runHarvestLaggingMonitor } = require('./run-harvest-lagging-monitor');

function parseBoundedNumber(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(parsed, max));
}

function createRuntimeWorkerRunner(options = {}) {
  const runtimeCore = options.runtimeCore || createRuntimeCore();
  const policyEngine = options.policyEngine || createPolicyEngine();
  const approvalIntervalMs = parseBoundedNumber(
    options.approvalIntervalMs || process.env.RUNTIME_APPROVAL_SWEEPER_INTERVAL_MS,
    60 * 1000,
    { min: 5 * 1000, max: 60 * 60 * 1000 }
  );
  const jobMonitorIntervalMs = parseBoundedNumber(
    options.jobMonitorIntervalMs || process.env.RUNTIME_JOB_MONITOR_INTERVAL_MS,
    15 * 1000,
    { min: 2 * 1000, max: 60 * 60 * 1000 }
  );
  const harvestIntervalMs = parseBoundedNumber(
    options.harvestIntervalMs || process.env.RUNTIME_HARVEST_LAG_MONITOR_INTERVAL_MS,
    2 * 60 * 1000,
    { min: 5 * 1000, max: 60 * 60 * 1000 }
  );
  const jobMonitorLimit = parseBoundedNumber(
    options.jobMonitorLimit || process.env.RUNTIME_JOB_MONITOR_LIMIT,
    50,
    { min: 1, max: 200 }
  );
  const queueAfterMs = parseBoundedNumber(
    options.queueAfterMs || process.env.RUNTIME_MOCK_JOB_QUEUE_AFTER_MS,
    1 * 1000,
    { min: 0, max: 24 * 60 * 60 * 1000 }
  );
  const runningAfterMs = parseBoundedNumber(
    options.runningAfterMs || process.env.RUNTIME_MOCK_JOB_RUNNING_AFTER_MS,
    3 * 1000,
    { min: 500, max: 24 * 60 * 60 * 1000 }
  );
  const completeAfterMs = parseBoundedNumber(
    options.completeAfterMs || process.env.RUNTIME_MOCK_JOB_COMPLETE_AFTER_MS,
    8 * 1000,
    { min: 1500, max: 24 * 60 * 60 * 1000 }
  );
  const harvestLagThresholdMs = parseBoundedNumber(
    options.harvestLagThresholdMs || process.env.RUNTIME_HARVEST_LAG_THRESHOLD_MS,
    5 * 60 * 1000,
    { min: 10 * 1000, max: 24 * 60 * 60 * 1000 }
  );
  const approvalLimit = parseBoundedNumber(
    options.approvalLimit || process.env.RUNTIME_APPROVAL_SWEEPER_LIMIT,
    50,
    { min: 1, max: 200 }
  );
  const harvestLimit = parseBoundedNumber(
    options.harvestLimit || process.env.RUNTIME_HARVEST_LAG_LIMIT,
    50,
    { min: 1, max: 200 }
  );
  const runOnStart = options.runOnStart !== false;

  let started = false;
  let approvalTimer = null;
  let jobMonitorTimer = null;
  let harvestTimer = null;
  let approvalRunning = false;
  let jobMonitorRunning = false;
  let harvestRunning = false;

  async function executeApprovalSweep(trigger = 'timer') {
    if (approvalRunning) {
      return { ok: true, skipped: true, reason: 'approval_sweeper_already_running', trigger };
    }
    approvalRunning = true;

    try {
      await connectRuntimeDb();
      const result = await runApprovalExpirySweeper({
        runtimeCore,
        now: new Date(),
        limit: approvalLimit,
      });

      if ((result.summary?.expired || 0) > 0 || (result.summary?.cancelledTaskRuns || 0) > 0 || (result.summary?.errors || 0) > 0) {
        console.log('[runtime-workers] approval-expiry-sweeper', {
          trigger,
          summary: result.summary,
        });
      }

      return result;
    } catch (error) {
      console.error('[runtime-workers] approval-expiry-sweeper failed', {
        trigger,
        error: error.message,
      });
      return { ok: false, error: error.message, trigger };
    } finally {
      approvalRunning = false;
    }
  }

  async function executeJobMonitor(trigger = 'timer') {
    if (jobMonitorRunning) {
      return { ok: true, skipped: true, reason: 'job_monitor_already_running', trigger };
    }
    jobMonitorRunning = true;

    try {
      await connectRuntimeDb();
      const result = await runJobMonitor({
        runtimeCore,
        policyEngine,
        now: new Date(),
        limit: jobMonitorLimit,
        thresholds: {
          queueAfterMs,
          runningAfterMs,
          completeAfterMs,
        },
      });

      if (
        (result.summary?.transitioned || 0) > 0
        || (result.summary?.harvestStarted || 0) > 0
        || (result.summary?.errors || 0) > 0
        || (Array.isArray(result.harvested) && result.harvested.length > 0)
      ) {
        console.log('[runtime-workers] job-monitor', {
          trigger,
          summary: result.summary,
          harvested: result.harvested?.length || 0,
        });
      }

      return result;
    } catch (error) {
      console.error('[runtime-workers] job-monitor failed', {
        trigger,
        error: error.message,
      });
      return { ok: false, error: error.message, trigger };
    } finally {
      jobMonitorRunning = false;
    }
  }

  async function executeHarvestMonitor(trigger = 'timer') {
    if (harvestRunning) {
      return { ok: true, skipped: true, reason: 'harvest_monitor_already_running', trigger };
    }
    harvestRunning = true;

    try {
      await connectRuntimeDb();
      const result = await runHarvestLaggingMonitor({
        runtimeCore,
        now: new Date(),
        limit: harvestLimit,
        lagThresholdMs: harvestLagThresholdMs,
        emitEvents: true,
      });

      if ((result.summary?.lagging || 0) > 0 || (result.summary?.errors || 0) > 0) {
        console.log('[runtime-workers] harvest-lagging-monitor', {
          trigger,
          summary: result.summary,
          lagThresholdMs: result.lagThresholdMs,
        });
      }

      return result;
    } catch (error) {
      console.error('[runtime-workers] harvest-lagging-monitor failed', {
        trigger,
        error: error.message,
      });
      return { ok: false, error: error.message, trigger };
    } finally {
      harvestRunning = false;
    }
  }

  function scheduleLoops() {
    approvalTimer = setInterval(() => {
      void executeApprovalSweep('timer');
    }, approvalIntervalMs);

    jobMonitorTimer = setInterval(() => {
      void executeJobMonitor('timer');
    }, jobMonitorIntervalMs);

    harvestTimer = setInterval(() => {
      void executeHarvestMonitor('timer');
    }, harvestIntervalMs);
  }

  function clearLoops() {
    if (approvalTimer) {
      clearInterval(approvalTimer);
      approvalTimer = null;
    }
    if (jobMonitorTimer) {
      clearInterval(jobMonitorTimer);
      jobMonitorTimer = null;
    }
    if (harvestTimer) {
      clearInterval(harvestTimer);
      harvestTimer = null;
    }
  }

  function start() {
    if (started) {
      return {
        started: true,
        alreadyStarted: true,
        approvalIntervalMs,
        jobMonitorIntervalMs,
        harvestIntervalMs,
        harvestLagThresholdMs,
      };
    }

    started = true;
    scheduleLoops();

    if (runOnStart) {
      void executeApprovalSweep('startup');
      void executeJobMonitor('startup');
      void executeHarvestMonitor('startup');
    }

    return {
      started: true,
      alreadyStarted: false,
      approvalIntervalMs,
      jobMonitorIntervalMs,
      harvestIntervalMs,
      harvestLagThresholdMs,
    };
  }

  function stop() {
    clearLoops();
    started = false;
    return { started: false };
  }

  async function runOnce() {
    const [approvalSweep, jobMonitor, harvestMonitor] = await Promise.all([
      executeApprovalSweep('manual'),
      executeJobMonitor('manual'),
      executeHarvestMonitor('manual'),
    ]);

    return {
      ok: true,
      approvalSweep,
      jobMonitor,
      harvestMonitor,
    };
  }

  return {
    start,
    stop,
    runOnce,
    executeApprovalSweep,
    executeJobMonitor,
    executeHarvestMonitor,
    getStatus() {
      return {
        started,
        approvalIntervalMs,
        jobMonitorIntervalMs,
        harvestIntervalMs,
        harvestLagThresholdMs,
        approvalRunning,
        jobMonitorRunning,
        harvestRunning,
      };
    },
  };
}

module.exports = {
  createRuntimeWorkerRunner,
};
