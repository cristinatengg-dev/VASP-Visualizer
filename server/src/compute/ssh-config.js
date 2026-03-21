const path = require('path');

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function expandHome(targetPath) {
  const raw = String(targetPath || '').trim();
  if (!raw) {
    return '';
  }
  if (raw === '~') {
    return process.env.HOME || raw;
  }
  if (raw.startsWith('~/')) {
    return path.join(process.env.HOME || '', raw.slice(2));
  }
  return raw;
}

function parsePort(value, fallback = 22) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function getHpcSshConfigFromEnv() {
  const host = firstNonEmpty(process.env.HPC_SSH_HOST, process.env.DEPLOY_HOST);
  const user = firstNonEmpty(process.env.HPC_SSH_USER, process.env.DEPLOY_USER);
  const keyPath = expandHome(firstNonEmpty(process.env.HPC_SSH_KEY_PATH, process.env.DEPLOY_KEY));
  const port = parsePort(firstNonEmpty(process.env.HPC_SSH_PORT, process.env.DEPLOY_PORT), 22);
  const remoteBaseDir = firstNonEmpty(
    process.env.HPC_REMOTE_BASE_DIR,
    process.env.DEPLOY_DIR ? `${process.env.DEPLOY_DIR}/runtime-jobs` : '',
    '/tmp/vasp-runtime-jobs'
  );
  const remotePotcarDir = firstNonEmpty(process.env.HPC_REMOTE_POTCAR_DIR);
  const shell = firstNonEmpty(process.env.HPC_REMOTE_SHELL, '/bin/bash');
  const prelude = String(process.env.HPC_REMOTE_PRELUDE || process.env.HPC_MODULE_LOAD || '').trim();
  const connectTimeoutSec = parsePositiveInt(process.env.HPC_SSH_CONNECT_TIMEOUT_SEC, 12);
  const serverAliveIntervalSec = parsePositiveInt(process.env.HPC_SSH_SERVER_ALIVE_INTERVAL_SEC, 10);
  const serverAliveCountMax = parsePositiveInt(process.env.HPC_SSH_SERVER_ALIVE_COUNT_MAX, 2);

  return {
    host: host || null,
    user: user || null,
    keyPath: keyPath || null,
    port,
    remoteBaseDir,
    remotePotcarDir: remotePotcarDir || null,
    shell,
    prelude: prelude || null,
    connectTimeoutSec,
    serverAliveIntervalSec,
    serverAliveCountMax,
    configured: Boolean(host && user && keyPath),
  };
}

module.exports = {
  expandHome,
  getHpcSshConfigFromEnv,
};
