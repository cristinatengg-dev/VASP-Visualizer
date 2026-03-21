const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const { listComputeProfiles } = require('./profiles');
const { getHpcSshConfigFromEnv } = require('./ssh-config');
const { createLocalArtifactStorage } = require('../runtime/storage/local-artifact-storage');
const { createLocalJobStorage } = require('../runtime/storage/local-job-storage');

function truthyEnv(value) {
  return String(value || '').trim() === '1';
}

function findFirstConfiguredEnv(keys) {
  for (const key of keys) {
    if (String(process.env[key] || '').trim()) {
      return key;
    }
  }
  return null;
}

function parseBoundedNumber(value, fallback, { min, max }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(parsed, max));
}

function getMongoReadyStateLabel(readyState) {
  switch (readyState) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'unknown';
  }
}

async function pathReadable(targetPath) {
  if (!targetPath) {
    return false;
  }
  try {
    await fs.promises.access(targetPath, fs.constants.R_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

async function pathStat(targetPath) {
  if (!targetPath) {
    return null;
  }
  try {
    return await fs.promises.stat(targetPath);
  } catch (_error) {
    return null;
  }
}

function extractCommandToken(command) {
  const raw = String(command || '').trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^"([^"]+)"|'([^']+)'|([^\s]+)/);
  return (match && (match[1] || match[2] || match[3])) || null;
}

function probeCommand(command) {
  return new Promise((resolve) => {
    const token = extractCommandToken(command);
    if (!token) {
      resolve({
        configured: false,
        command: String(command || '').trim() || null,
        executableToken: null,
        available: false,
        resolvedPath: null,
      });
      return;
    }

    if (path.isAbsolute(token)) {
      fs.promises.access(token, fs.constants.X_OK)
        .then(() => {
          resolve({
            configured: true,
            command: String(command || '').trim(),
            executableToken: token,
            available: true,
            resolvedPath: token,
          });
        })
        .catch(() => {
          resolve({
            configured: true,
            command: String(command || '').trim(),
            executableToken: token,
            available: false,
            resolvedPath: null,
          });
        });
      return;
    }

    const child = spawn('which', [token], {
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
    child.on('error', () => {
      resolve({
        configured: true,
        command: String(command || '').trim(),
        executableToken: token,
        available: false,
        resolvedPath: null,
        error: 'command_probe_failed',
      });
    });
    child.on('close', (code) => {
      resolve({
        configured: true,
        command: String(command || '').trim(),
        executableToken: token,
        available: code === 0,
        resolvedPath: code === 0 ? String(stdout || '').trim() || null : null,
        stderr: String(stderr || '').trim() || null,
      });
    });
  });
}

async function probeBinary(binaryName) {
  return probeCommand(binaryName);
}

async function getComputeRuntimeDiagnostics() {
  const profiles = listComputeProfiles();
  const serverLocalProfile = profiles.find((profile) => profile.id === 'server_local') || null;
  const pbsProfile = profiles.find((profile) => profile.id === 'pbs_default') || null;
  const slurmProfile = profiles.find((profile) => profile.id === 'slurm_default') || null;
  const mongoEnvKey = findFirstConfiguredEnv(['RUNTIME_MONGODB_URI', 'MONGODB_URI', 'MONGO_URI']);
  const potcarEnvKey = findFirstConfiguredEnv(['VASP_PSP_DIR', 'VASP_POTCAR_DIR', 'POTCAR_LIBRARY_DIR']);
  const potcarLibraryDir = potcarEnvKey ? String(process.env[potcarEnvKey] || '').trim() : '';
  const artifactStorage = createLocalArtifactStorage();
  const jobStorage = createLocalJobStorage();

  const sshConfig = getHpcSshConfigFromEnv();
  const remotePotcarConfigured = Boolean(String(sshConfig.remotePotcarDir || '').trim());

  const [
    serverLocalCommandProbe,
    potcarReadable,
    artifactStorageReadable,
    jobStorageReadable,
    sbatchProbe,
    squeueProbe,
    sacctProbe,
    qsubProbe,
    qstatProbe,
    sshProbe,
    scpProbe,
    sshKeyReadable,
    sshKeyStat,
  ] = await Promise.all([
    probeCommand(serverLocalProfile?.local?.command || ''),
    pathReadable(potcarLibraryDir),
    pathReadable(artifactStorage.baseDir),
    pathReadable(jobStorage.baseDir),
    probeBinary('sbatch'),
    probeBinary('squeue'),
    probeBinary('sacct'),
    probeBinary('qsub'),
    probeBinary('qstat'),
    probeBinary('ssh'),
    probeBinary('scp'),
    pathReadable(sshConfig.keyPath || ''),
    pathStat(sshConfig.keyPath || ''),
  ]);

  const sshKeyIsFile = Boolean(sshKeyStat && typeof sshKeyStat.isFile === 'function' && sshKeyStat.isFile());

  const workerIntervals = {
    approvalIntervalMs: parseBoundedNumber(process.env.RUNTIME_APPROVAL_SWEEPER_INTERVAL_MS, 60 * 1000, { min: 5 * 1000, max: 60 * 60 * 1000 }),
    jobMonitorIntervalMs: parseBoundedNumber(process.env.RUNTIME_JOB_MONITOR_INTERVAL_MS, 15 * 1000, { min: 2 * 1000, max: 60 * 60 * 1000 }),
    harvestIntervalMs: parseBoundedNumber(process.env.RUNTIME_HARVEST_LAG_MONITOR_INTERVAL_MS, 2 * 60 * 1000, { min: 5 * 1000, max: 60 * 60 * 1000 }),
  };

  const issues = [];

  if (!mongoEnvKey) {
    issues.push('MongoDB URI is not configured');
  }
  if (!serverLocalProfile?.configured) {
    issues.push('server_local profile is not configured');
  } else if (!serverLocalCommandProbe.available) {
    issues.push('server_local command is configured but not executable from this server');
  }
  if (!potcarEnvKey && !remotePotcarConfigured) {
    issues.push('Neither local nor remote POTCAR library directory is configured');
  } else if (potcarEnvKey && !potcarReadable) {
    issues.push('Configured local POTCAR library directory is not readable');
  }
  if (slurmProfile?.configured) {
    if (sshConfig.configured) {
      if (!sshProbe.available) {
        issues.push('Remote Slurm is configured but ssh is not available on this server');
      }
      if (!scpProbe.available) {
        issues.push('Remote Slurm is configured but scp is not available on this server');
      }
      if (!sshKeyReadable) {
        issues.push('Configured HPC SSH key path is not readable');
      } else if (!sshKeyIsFile) {
        issues.push('Configured HPC SSH key path exists but is not a regular file');
      }
    } else {
      if (!sbatchProbe.available) {
        issues.push('Slurm profile is configured but sbatch is not available');
      }
      if (!squeueProbe.available && !sacctProbe.available) {
        issues.push('Slurm profile is configured but neither squeue nor sacct is available');
      }
    }
  }
  if (pbsProfile?.configured) {
    if (sshConfig.configured) {
      if (!sshProbe.available) {
        issues.push('Remote PBS is configured but ssh is not available on this server');
      }
      if (!scpProbe.available) {
        issues.push('Remote PBS is configured but scp is not available on this server');
      }
      if (!sshKeyReadable) {
        issues.push('Configured HPC SSH key path is not readable');
      } else if (!sshKeyIsFile) {
        issues.push('Configured HPC SSH key path exists but is not a regular file');
      }
    } else {
      if (!qsubProbe.available) {
        issues.push('PBS profile is configured but qsub is not available');
      }
      if (!qstatProbe.available) {
        issues.push('PBS profile is configured but qstat is not available');
      }
    }
  }

  const mongo = {
    configured: Boolean(mongoEnvKey),
    envKey: mongoEnvKey,
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    readyStateLabel: getMongoReadyStateLabel(mongoose.connection.readyState),
  };

  const serverLocal = {
    configured: Boolean(serverLocalProfile?.configured),
    profileId: serverLocalProfile?.id || null,
    schedulerRef: serverLocalProfile?.schedulerRef || null,
    shell: serverLocalProfile?.local?.shell || null,
    command: serverLocalProfile?.local?.command || null,
    commandProbe: serverLocalCommandProbe,
    ready: Boolean(serverLocalProfile?.configured && serverLocalCommandProbe.available),
  };

  const potcar = {
    configured: Boolean(potcarEnvKey),
    envKey: potcarEnvKey,
    libraryDir: potcarLibraryDir || null,
    readable: potcarReadable,
    ready: Boolean(potcarEnvKey && potcarReadable),
    remoteConfigured: remotePotcarConfigured,
    remoteLibraryDir: sshConfig.remotePotcarDir || null,
  };

  const slurm = {
    configured: Boolean(slurmProfile?.configured),
    profileId: slurmProfile?.id || null,
    schedulerRef: slurmProfile?.schedulerRef || null,
    partition: slurmProfile?.hpc?.partition || null,
    executable: slurmProfile?.hpc?.executable || null,
    accessMode: sshConfig.configured ? 'remote_ssh' : 'local_shell',
    remoteSsh: {
      configured: sshConfig.configured,
      host: sshConfig.host,
      user: sshConfig.user,
      port: sshConfig.port,
      keyPath: sshConfig.keyPath,
      keyReadable: sshKeyReadable,
      keyIsFile: sshKeyIsFile,
      remoteBaseDir: sshConfig.remoteBaseDir,
      shell: sshConfig.shell,
      commands: {
        ssh: sshProbe,
        scp: scpProbe,
      },
    },
    commands: {
      sbatch: sbatchProbe,
      squeue: squeueProbe,
      sacct: sacctProbe,
    },
    ready: Boolean(
      slurmProfile?.configured
      && (potcarReadable || remotePotcarConfigured)
      && (
        sshConfig.configured
          ? (sshProbe.available && scpProbe.available && sshKeyReadable && sshKeyIsFile)
          : (sbatchProbe.available && (squeueProbe.available || sacctProbe.available))
      )
    ),
  };

  const pbs = {
    configured: Boolean(pbsProfile?.configured),
    profileId: pbsProfile?.id || null,
    schedulerRef: pbsProfile?.schedulerRef || null,
    queue: pbsProfile?.hpc?.queue || null,
    executable: pbsProfile?.hpc?.executable || null,
    accessMode: sshConfig.configured ? 'remote_ssh' : 'local_shell',
    remoteSsh: {
      configured: sshConfig.configured,
      host: sshConfig.host,
      user: sshConfig.user,
      port: sshConfig.port,
      keyPath: sshConfig.keyPath,
      keyReadable: sshKeyReadable,
      keyIsFile: sshKeyIsFile,
      remoteBaseDir: sshConfig.remoteBaseDir,
      shell: sshConfig.shell,
      commands: {
        ssh: sshProbe,
        scp: scpProbe,
      },
    },
    commands: {
      qsub: qsubProbe,
      qstat: qstatProbe,
    },
    ready: Boolean(
      pbsProfile?.configured
      && (potcarReadable || remotePotcarConfigured)
      && (
        sshConfig.configured
          ? (sshProbe.available && scpProbe.available && sshKeyReadable && sshKeyIsFile)
          : (qsubProbe.available && qstatProbe.available)
      )
    ),
  };

  const workers = {
    enabled: truthyEnv(process.env.ENABLE_AGENT_RUNTIME_WORKERS),
    intervals: workerIntervals,
  };

  const storage = {
    artifactDir: artifactStorage.baseDir,
    artifactDirReadable: artifactStorageReadable,
    jobDir: jobStorage.baseDir,
    jobDirReadable: jobStorageReadable,
  };

  return {
    mongo,
    profiles,
    serverLocal,
    potcar,
    slurm,
    pbs,
    workers,
    storage,
    issues,
    summary: {
      issueCount: issues.length,
      serverLocalReady: serverLocal.ready,
      slurmReady: slurm.ready,
      mongoReady: mongo.configured,
      potcarReady: potcar.ready,
      configuredProfileCount: profiles.filter((profile) => profile.configured).length,
    },
  };
}

module.exports = {
  getComputeRuntimeDiagnostics,
};
