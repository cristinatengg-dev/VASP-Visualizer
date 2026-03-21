const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { generateJobScript, submitJob } = require('../../utils/hpc');
const { submitRemotePbsJob, submitRemoteSlurmJob } = require('./ssh-remote');

function buildLocalExternalJobId(idempotencyKey) {
  return `local-${String(idempotencyKey || '').slice(0, 12)}`;
}

function buildStructureRequest(computeInputSetArtifact, computeInputPayload) {
  const preview = computeInputSetArtifact?.preview || {};
  const meta = computeInputPayload?.meta || {};
  const formula = preview.formula || meta.formula || 'vasp_job';

  return {
    data: {
      filename: String(formula).replace(/\s+/g, '_'),
    },
  };
}

function slugifyJobName(value) {
  return String(value || 'vasp_job')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'vasp_job';
}

function buildRemoteWorkDir(profile, computeInputSetArtifact, computeInputPayload, idempotencyKey) {
  const baseDir = String(profile?.hpc?.ssh?.remoteBaseDir || '/tmp/vasp-runtime-jobs').trim();
  const formula = computeInputSetArtifact?.preview?.formula
    || computeInputPayload?.meta?.formula
    || 'vasp_job';
  const slug = slugifyJobName(formula);
  const suffix = String(idempotencyKey || '').slice(0, 12) || 'runtime';
  return path.posix.join(baseDir, `${slug}-${suffix}`);
}

function extractPotcarSymbols(computeInputPayload) {
  const files = computeInputPayload?.files && typeof computeInputPayload.files === 'object'
    ? computeInputPayload.files
    : {};
  const rawSpec = files['POTCAR.spec.json'];
  if (!rawSpec) {
    return [];
  }
  try {
    const parsed = JSON.parse(String(rawSpec));
    return Array.isArray(parsed?.symbols)
      ? parsed.symbols.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
  } catch (_error) {
    return [];
  }
}

async function submitComputeJob({
  profile,
  computeInputSetArtifact,
  computeInputPayload,
  workDir,
  executionDir,
  idempotencyKey,
}) {
  if (!profile || !profile.system) {
    throw new Error('Compute profile is required for submission');
  }

  if (profile.system === 'local' && profile.mode === 'local_demo') {
    return {
      resolvedSystem: 'local',
      externalJobId: buildLocalExternalJobId(idempotencyKey),
      schedulerRef: profile.id,
      submissionMode: 'local_demo',
      submissionOutput: 'Local demo submission created runtime workdir only.',
      jobScriptPath: null,
    };
  }

  if (profile.system === 'local' && profile.mode === 'server_local') {
    const runnerScriptPath = path.join(__dirname, 'local-job-runner.js');
    const jobSpecPath = path.join(workDir, 'job-spec.json');
    const runtimeStatusPath = path.join(workDir, 'runtime-status.json');

    const child = spawn(process.execPath, [runnerScriptPath, jobSpecPath, runtimeStatusPath], {
      cwd: executionDir || workDir,
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    return {
      resolvedSystem: 'local',
      externalJobId: buildLocalExternalJobId(idempotencyKey),
      schedulerRef: profile.schedulerRef || profile.id,
      submissionMode: 'server_local',
      submissionOutput: `Spawned detached local runner ${child.pid || 'unknown'}`,
      jobScriptPath: null,
      runnerPid: child.pid || null,
      runtimeStatusPath,
    };
  }

  if (profile.system === 'slurm') {
    const request = {
      structure: buildStructureRequest(computeInputSetArtifact, computeInputPayload),
      hpc: profile.hpc,
      intent: computeInputPayload?.intent || {},
      runtime_policy: {
        use_custodian: false,
      },
    };

    const scriptContent = generateJobScript(request);
    const useRemoteSsh = Boolean(profile?.hpc?.ssh?.configured);
    const potcar = {
      localMaterialized: Boolean(executionDir && fs.existsSync(path.join(executionDir, 'POTCAR'))),
      symbols: extractPotcarSymbols(computeInputPayload),
    };
    const submission = useRemoteSsh
      ? await submitRemoteSlurmJob({
        config: profile.hpc.ssh,
        localDir: executionDir || workDir,
        remoteDir: buildRemoteWorkDir(profile, computeInputSetArtifact, computeInputPayload, idempotencyKey),
        scriptContent,
        potcar,
      })
      : await submitJob(executionDir || workDir, scriptContent);
    const simulated = !useRemoteSsh && (process.env.NODE_ENV !== 'production' || process.env.HPC_FORCE_MOCK === '1');

    return {
      resolvedSystem: simulated ? 'mock' : 'slurm',
      externalJobId: String(submission?.job_id || `slurm-${String(idempotencyKey || '').slice(0, 12)}`),
      schedulerRef: simulated ? `${profile.schedulerRef || profile.id}:mock` : (profile.schedulerRef || profile.id),
      submissionMode: simulated ? 'mock_slurm' : (useRemoteSsh ? 'remote_slurm_ssh' : 'slurm'),
      submissionOutput: submission?.message || null,
      jobScriptPath: path.join(executionDir || workDir, 'job.sh'),
      remoteWorkDir: submission?.remoteWorkDir || null,
      accessMode: useRemoteSsh ? 'remote_ssh' : 'local_shell',
    };
  }

  if (profile.system === 'pbs') {
    const request = {
      structure: buildStructureRequest(computeInputSetArtifact, computeInputPayload),
      hpc: profile.hpc,
      intent: computeInputPayload?.intent || {},
      runtime_policy: {
        use_custodian: false,
      },
    };

    const scriptContent = generateJobScript(request);
    const useRemoteSsh = Boolean(profile?.hpc?.ssh?.configured);
    const potcar = {
      localMaterialized: Boolean(executionDir && fs.existsSync(path.join(executionDir, 'POTCAR'))),
      symbols: extractPotcarSymbols(computeInputPayload),
    };
    const submission = useRemoteSsh
      ? await submitRemotePbsJob({
        config: profile.hpc.ssh,
        localDir: executionDir || workDir,
        remoteDir: buildRemoteWorkDir(profile, computeInputSetArtifact, computeInputPayload, idempotencyKey),
        scriptContent,
        potcar,
      })
      : await submitJob(executionDir || workDir, scriptContent, {
        scriptFileName: 'job.pbs',
        submitCommand: 'qsub',
        submitArgs: ['job.pbs'],
      });

    return {
      resolvedSystem: 'pbs',
      externalJobId: String(submission?.job_id || `pbs-${String(idempotencyKey || '').slice(0, 12)}`),
      schedulerRef: profile.schedulerRef || profile.id,
      submissionMode: useRemoteSsh ? 'remote_pbs_ssh' : 'pbs',
      submissionOutput: submission?.message || null,
      jobScriptPath: path.join(executionDir || workDir, 'job.pbs'),
      remoteWorkDir: submission?.remoteWorkDir || null,
      accessMode: useRemoteSsh ? 'remote_ssh' : 'local_shell',
    };
  }

  throw new Error(`Unsupported compute profile system '${profile.system}'`);
}

module.exports = {
  submitComputeJob,
};
