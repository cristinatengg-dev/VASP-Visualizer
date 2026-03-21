#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLocalJobStorage } = require('../runtime/storage/local-job-storage');
const { getComputeProfile } = require('./profiles');
const { submitComputeJob } = require('./submit-job');
const { queryPbsJobStatus } = require('./query-job');
const { copyRemoteDirectoryToLocal } = require('./ssh-remote');
const { buildResultMetrics, collectWarnings } = require('./parse-results');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureTrailingSlash(url) {
  return String(url || '').endsWith('/') ? String(url || '') : `${String(url || '')}/`;
}

function buildApiUrl(baseUrl, relativePath) {
  return new URL(String(relativePath || '').replace(/^\/+/, ''), ensureTrailingSlash(baseUrl)).toString();
}

function getAgentConfig() {
  const baseUrl = String(process.env.COMPUTE_AGENT_BASE_URL || '').trim();
  const token = String(process.env.COMPUTE_AGENT_TOKEN || process.env.ADMIN_SECRET || '').trim();
  const pollIntervalMs = Math.max(3000, Number(process.env.COMPUTE_AGENT_POLL_INTERVAL_MS || 15000));
  const executionProfileId = String(process.env.COMPUTE_AGENT_EXECUTION_PROFILE || 'pbs_default').trim();
  const agentId = String(process.env.COMPUTE_AGENT_ID || os.hostname() || 'local-compute-agent').trim();

  if (!baseUrl) {
    throw new Error('COMPUTE_AGENT_BASE_URL is required');
  }
  if (!token) {
    throw new Error('COMPUTE_AGENT_TOKEN is required');
  }

  return {
    baseUrl,
    token,
    pollIntervalMs,
    executionProfileId,
    agentId,
  };
}

async function fetchJson(baseUrl, token, relativePath, init = {}) {
  const requestUrl = buildApiUrl(baseUrl, relativePath);
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers || {}),
  };

  let response;
  try {
    response = await fetch(requestUrl, {
      method: init.method || 'GET',
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch (error) {
    const cause = error?.cause?.message || error?.cause?.code || null;
    const detail = cause ? ` (${cause})` : '';
    throw new Error(`Request to ${requestUrl} failed: ${error.message}${detail}`);
  }

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch (_error) {
    parsed = null;
  }

  if (!response.ok) {
    const payloadError = parsed && parsed.error ? parsed.error : null;
    const bodySnippet = !payloadError && raw ? raw.slice(0, 200) : null;
    const details = bodySnippet ? `: ${bodySnippet}` : '';
    throw new Error(payloadError || `HTTP ${response.status} from ${requestUrl}${details}`);
  }

  return parsed;
}

async function listFilesRecursive(dirPath, rootDir, acc = []) {
  let entries = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (_error) {
    return acc;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await listFilesRecursive(absolutePath, rootDir, acc);
      continue;
    }
    try {
      const stats = await fs.promises.stat(absolutePath);
      acc.push({
        name: path.relative(rootDir, absolutePath),
        path: absolutePath,
        sizeBytes: stats.size,
      });
    } catch (_error) {
      // Ignore transient stat errors.
    }
  }

  return acc;
}

async function readTail(filePath, maxChars = 2000) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return raw.length <= maxChars ? raw : raw.slice(-maxChars);
  } catch (_error) {
    return null;
  }
}

function uniqPaths(filePaths) {
  return Array.from(
    new Set(
      (Array.isArray(filePaths) ? filePaths : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

async function readTailFromCandidates(filePaths, maxChars = 2000) {
  for (const filePath of uniqPaths(filePaths)) {
    const tail = await readTail(filePath, maxChars);
    if (tail) {
      return tail;
    }
  }
  return null;
}

function findFirstMatchingFile(files, matcher) {
  if (!Array.isArray(files)) {
    return null;
  }
  return files.find((item) => {
    try {
      return Boolean(matcher(item));
    } catch (_error) {
      return false;
    }
  }) || null;
}

async function buildResultPayload({ job, profile, jobStorage }) {
  const remoteWorkDir = String(job?.jobRun?.snapshotRef || '').trim();
  if (!remoteWorkDir) {
    throw new Error(`Missing remote work directory for job ${job?.jobRun?._id || 'unknown'}`);
  }
  if (!profile?.hpc?.ssh?.configured) {
    throw new Error('Local compute agent requires HPC SSH configuration');
  }

  const localJobDir = jobStorage.getJobDir(job.jobRun._id);
  const remoteSyncDir = path.join(localJobDir, 'remote-sync');
  await copyRemoteDirectoryToLocal(profile.hpc.ssh, remoteWorkDir, remoteSyncDir);

  const files = await listFilesRecursive(remoteSyncDir, remoteSyncDir, []);
  const stdoutFile = findFirstMatchingFile(files, (item) => /^slurm-\d+\.out$/i.test(item.name) || /stdout/i.test(item.name));
  const stderrFile = findFirstMatchingFile(files, (item) => /^slurm-\d+\.err$/i.test(item.name) || /stderr/i.test(item.name));

  const oszicarTail = await readTailFromCandidates([
    path.join(remoteSyncDir, 'OSZICAR'),
  ]);
  const outcarTail = await readTailFromCandidates([
    path.join(remoteSyncDir, 'OUTCAR'),
  ]);
  const vaspOutTail = await readTailFromCandidates([
    path.join(remoteSyncDir, 'vasp.out'),
  ]);
  const jobStdoutTail = await readTailFromCandidates([
    stdoutFile?.path,
    path.join(remoteSyncDir, 'job.stdout.log'),
  ]);
  const jobStderrTail = await readTailFromCandidates([
    stderrFile?.path,
    path.join(remoteSyncDir, 'job.stderr.log'),
  ]);

  const metrics = buildResultMetrics({
    oszicarTail,
    outcarTail,
    vaspOutTail,
    runtimeStatus: null,
    jobRun: job.jobRun,
  });
  const warnings = collectWarnings({
    jobStdoutTail,
    jobStderrTail,
    outcarTail,
    vaspOutTail,
    runtimeStatus: null,
  });

  const formula = job?.computeInputSetArtifact?.preview?.formula || null;
  const workflow = job?.computeInputSetArtifact?.preview?.workflow || null;

  return {
    resultType: 'pbs_local_agent_result_bundle',
    jobRunId: job.jobRun._id,
    externalJobId: job.jobRun.externalJobId || null,
    schedulerRef: job.jobRun.schedulerRef || profile.schedulerRef || null,
    system: 'pbs',
    profileId: profile.id,
    summary: `PBS compute result for ${formula || 'unknown structure'} (${workflow || 'relax'})`,
    formula,
    completedAt: new Date().toISOString(),
    metrics,
    files: {
      inputFiles: Object.keys((job.computeInputPayload && job.computeInputPayload.files) || {}),
      harvestedFiles: files.map((item) => ({
        name: item.name,
        sizeBytes: item.sizeBytes,
      })),
      detectedOutputs: {
        oszicar: Boolean(findFirstMatchingFile(files, (item) => item.name === 'OSZICAR')),
        outcar: Boolean(findFirstMatchingFile(files, (item) => item.name === 'OUTCAR')),
        vaspOut: Boolean(findFirstMatchingFile(files, (item) => item.name === 'vasp.out')),
      },
    },
    execution: {
      mode: 'pbs_local_agent',
      command: profile?.hpc?.executable || null,
      schedulerRef: job.jobRun.schedulerRef || profile.schedulerRef || null,
      remoteWorkDir,
      agentId: os.hostname(),
    },
    excerpts: {
      oszicarTail,
      outcarTail,
      vaspOutTail,
      jobStdoutTail,
      jobStderrTail,
    },
    warnings,
    notes: [
      'Materialized by local compute agent',
    ],
  };
}

async function processCreatedJob({ job, agentConfig, profile, jobStorage }) {
  if (!job.computeInputPayload || !job.computeInputSetArtifact) {
    throw new Error(`Pending job ${job.jobRun._id} is missing compute input payload`);
  }

  const materializedWorkdir = await jobStorage.materializeComputeWorkdir({
    jobRunId: job.jobRun._id,
    computeInputSetArtifact: job.computeInputSetArtifact,
    computeInputPayload: job.computeInputPayload,
    profile,
  });

  const submission = await submitComputeJob({
    profile,
    computeInputSetArtifact: job.computeInputSetArtifact,
    computeInputPayload: job.computeInputPayload,
    workDir: materializedWorkdir.workDir,
    executionDir: materializedWorkdir.inputDir,
    idempotencyKey: job.jobRun._id,
  });

  await fetchJson(agentConfig.baseUrl, agentConfig.token, `compute/agent/jobs/${job.jobRun._id}/submit`, {
    method: 'POST',
    body: {
      externalJobId: submission.externalJobId,
      remoteWorkDir: submission.remoteWorkDir || null,
      schedulerRef: submission.schedulerRef || profile.schedulerRef || null,
      submissionMode: submission.submissionMode || 'local_compute_agent',
      submissionOutput: submission.submissionOutput || null,
      agentId: agentConfig.agentId,
    },
  });
}

async function processActiveJob({ job, agentConfig, profile, jobStorage }) {
  if (!job?.jobRun?.externalJobId) {
    return;
  }

  const queried = await queryPbsJobStatus(job.jobRun.externalJobId);
  if (!queried.ok) {
    return;
  }

  await fetchJson(agentConfig.baseUrl, agentConfig.token, `compute/agent/jobs/${job.jobRun._id}/status`, {
    method: 'POST',
    body: {
      status: queried.jobStatus,
      schedulerState: queried.schedulerState || null,
      details: queried.details || null,
      remoteWorkDir: job.jobRun.snapshotRef || null,
    },
  });

  if (queried.jobStatus === 'completed' && job.jobRun.materializationStatus !== 'materialized') {
    const resultPayload = await buildResultPayload({
      job,
      profile,
      jobStorage,
    });

    await fetchJson(agentConfig.baseUrl, agentConfig.token, `compute/agent/jobs/${job.jobRun._id}/materialize`, {
      method: 'POST',
      body: {
        resultPayload,
      },
    });
  }
}

async function processAgentCycle() {
  const agentConfig = getAgentConfig();
  const jobStorage = createLocalJobStorage();
  const profile = getComputeProfile(agentConfig.executionProfileId);
  if (!profile || !profile.configured) {
    throw new Error(`Local compute execution profile '${agentConfig.executionProfileId}' is not configured on this machine`);
  }

  const response = await fetchJson(agentConfig.baseUrl, agentConfig.token, 'compute/agent/jobs');
  const jobs = Array.isArray(response?.jobs) ? response.jobs : [];

  for (const job of jobs) {
    try {
      if (job?.jobRun?.status === 'created') {
        await processCreatedJob({ job, agentConfig, profile, jobStorage });
        continue;
      }

      if (['submitted', 'queued', 'running', 'completed'].includes(String(job?.jobRun?.status || ''))) {
        await processActiveJob({ job, agentConfig, profile, jobStorage });
      }
    } catch (error) {
      console.error(`[local-compute-agent] Job ${job?.jobRun?._id || 'unknown'} failed: ${error.message}`);
    }
  }
}

async function main() {
  const once = process.argv.includes('--once');
  const agentConfig = getAgentConfig();

  if (once) {
    await processAgentCycle();
    return;
  }

  console.log(`[local-compute-agent] polling ${agentConfig.baseUrl} every ${agentConfig.pollIntervalMs}ms as ${agentConfig.agentId}`);
  while (true) {
    try {
      await processAgentCycle();
    } catch (error) {
      console.error(`[local-compute-agent] cycle failed: ${error.message}`);
    }
    await sleep(agentConfig.pollIntervalMs);
  }
}

main().catch((error) => {
  console.error(`[local-compute-agent] fatal: ${error.message}`);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
