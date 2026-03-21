const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getHpcSshConfigFromEnv } = require('./ssh-config');
const { runRemoteShellCommand } = require('./ssh-remote');

function runCommand(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: stderr || error.message,
      });
    });

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

function mapSlurmStateToRuntimeStatus(rawState) {
  const state = String(rawState || '')
    .trim()
    .toUpperCase()
    .replace(/\+.*/, '');

  if (!state) {
    return null;
  }
  if (['PENDING', 'CONFIGURING', 'RESIZING', 'SUSPENDED'].includes(state)) {
    return 'queued';
  }
  if (['RUNNING', 'COMPLETING', 'STAGE_OUT'].includes(state)) {
    return 'running';
  }
  if (['COMPLETED'].includes(state)) {
    return 'completed';
  }
  if (['CANCELLED', 'DEADLINE', 'PREEMPTED'].includes(state)) {
    return 'cancelled';
  }
  if (['FAILED', 'TIMEOUT', 'NODE_FAIL', 'OUT_OF_MEMORY', 'BOOT_FAIL'].includes(state)) {
    return 'failed';
  }
  return null;
}

function mapPbsStateToRuntimeStatus(rawState, exitStatus = null) {
  const state = String(rawState || '')
    .trim()
    .toUpperCase()
    .replace(/\+.*/, '');

  if (!state) {
    return null;
  }
  if (['Q', 'H', 'W', 'T'].includes(state)) {
    return 'queued';
  }
  if (['R', 'E', 'B'].includes(state)) {
    return 'running';
  }
  if (['C', 'F'].includes(state)) {
    if (exitStatus !== null && Number(exitStatus) !== 0) {
      return 'failed';
    }
    return 'completed';
  }
  if (['X'].includes(state)) {
    return 'cancelled';
  }
  return null;
}

async function querySlurmJobStatus(externalJobId) {
  if (!externalJobId) {
    return { ok: false, reason: 'missing_external_job_id' };
  }

  const sshConfig = getHpcSshConfigFromEnv();
  const squeue = sshConfig.configured
    ? await runRemoteShellCommand(sshConfig, `squeue -h -j ${String(externalJobId)} -o %T`)
    : await runCommand('squeue', ['-h', '-j', String(externalJobId), '-o', '%T']);
  if (squeue.ok) {
    const state = String(squeue.stdout || '').trim().split('\n').find(Boolean) || '';
    const mapped = mapSlurmStateToRuntimeStatus(state);
    if (mapped) {
      return {
        ok: true,
        jobStatus: mapped,
        schedulerState: state,
        source: sshConfig.configured ? 'ssh:squeue' : 'squeue',
      };
    }
  }

  const sacct = sshConfig.configured
    ? await runRemoteShellCommand(sshConfig, `sacct -n -j ${String(externalJobId)} --format=State`)
    : await runCommand('sacct', ['-n', '-j', String(externalJobId), '--format=State']);
  if (sacct.ok) {
    const state = String(sacct.stdout || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || '';
    const mapped = mapSlurmStateToRuntimeStatus(state);
    if (mapped) {
      return {
        ok: true,
        jobStatus: mapped,
        schedulerState: state,
        source: sshConfig.configured ? 'ssh:sacct' : 'sacct',
      };
    }
  }

  return {
    ok: false,
    reason: 'scheduler_query_unavailable',
    details: {
      squeue: {
        code: squeue.code,
        stderr: String(squeue.stderr || '').trim() || null,
      },
      sacct: {
        code: sacct.code,
        stderr: String(sacct.stderr || '').trim() || null,
      },
    },
  };
}

async function queryPbsJobStatus(externalJobId) {
  if (!externalJobId) {
    return { ok: false, reason: 'missing_external_job_id' };
  }

  const sshConfig = getHpcSshConfigFromEnv();
  const qstat = sshConfig.configured
    ? await runRemoteShellCommand(sshConfig, `qstat -xf ${String(externalJobId)} 2>/dev/null || qstat -f ${String(externalJobId)} 2>/dev/null`)
    : await runCommand('bash', ['-lc', `qstat -xf ${String(externalJobId)} 2>/dev/null || qstat -f ${String(externalJobId)} 2>/dev/null`]);

  if (!qstat.ok) {
    return {
      ok: false,
      reason: 'scheduler_query_unavailable',
      details: {
        qstat: {
          code: qstat.code,
          stderr: String(qstat.stderr || '').trim() || null,
        },
      },
    };
  }

  const output = String(qstat.stdout || '');
  const stateMatch = output.match(/job_state\s*=\s*([A-Za-z])/i);
  const exitMatch = output.match(/exit_status\s*=\s*(-?\d+)/i);
  const state = stateMatch ? stateMatch[1] : '';
  const exitStatus = exitMatch ? Number(exitMatch[1]) : null;
  const mapped = mapPbsStateToRuntimeStatus(state, exitStatus);

  if (!mapped) {
    return {
      ok: false,
      reason: 'scheduler_query_unavailable',
      details: {
        qstat: {
          code: qstat.code,
          stderr: String(qstat.stderr || '').trim() || null,
          stdout: output.trim() || null,
        },
      },
    };
  }

  return {
    ok: true,
    jobStatus: mapped,
    schedulerState: state || null,
    exitStatus,
    source: sshConfig.configured ? 'ssh:qstat' : 'qstat',
  };
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

async function queryLocalJobStatus(snapshotRef) {
  if (!snapshotRef) {
    return { ok: false, reason: 'missing_snapshot_ref' };
  }

  const jobSpec = await readJsonIfExists(snapshotRef);
  if (!jobSpec) {
    return { ok: false, reason: 'job_spec_missing' };
  }

  const statusPath = path.join(path.dirname(snapshotRef), 'runtime-status.json');
  const statusDoc = await readJsonIfExists(statusPath);
  if (!statusDoc) {
    return {
      ok: false,
      reason: 'runtime_status_missing',
      profileMode: jobSpec?.profile?.mode || null,
    };
  }

  const rawStatus = String(statusDoc.status || '').trim().toLowerCase();
  const mapped = ['submitted', 'queued', 'running', 'completed', 'failed', 'cancelled'].includes(rawStatus)
    ? rawStatus
    : null;

  if (!mapped) {
    return {
      ok: false,
      reason: 'runtime_status_unrecognized',
      profileMode: jobSpec?.profile?.mode || null,
      details: statusDoc,
    };
  }

  return {
    ok: true,
    jobStatus: mapped,
    profileMode: jobSpec?.profile?.mode || null,
    source: 'runtime-status',
    details: statusDoc,
    jobSpec,
  };
}

module.exports = {
  mapSlurmStateToRuntimeStatus,
  mapPbsStateToRuntimeStatus,
  queryPbsJobStatus,
  querySlurmJobStatus,
  queryLocalJobStatus,
};
