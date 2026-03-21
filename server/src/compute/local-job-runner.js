const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function writeRuntimeStatus(statusPath, payload) {
  await fs.promises.mkdir(path.dirname(statusPath), { recursive: true });
  await fs.promises.writeFile(statusPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const specPath = String(process.argv[2] || '').trim();
  const statusPath = String(process.argv[3] || '').trim();

  if (!specPath || !statusPath) {
    throw new Error('Usage: node local-job-runner.js <jobSpecPath> <runtimeStatusPath>');
  }

  const spec = JSON.parse(await fs.promises.readFile(specPath, 'utf8'));
  const command = String(spec?.profile?.local?.command || '').trim();
  const shell = String(spec?.profile?.local?.shell || '/bin/zsh').trim() || '/bin/zsh';
  const workDir = String(spec?.inputDir || spec?.workDir || '').trim();

  if (!command) {
    throw new Error('Local compute command is missing from job spec');
  }
  if (!workDir) {
    throw new Error('Local compute workDir is missing from job spec');
  }

  const stdoutPath = path.join(workDir, 'job.stdout.log');
  const stderrPath = path.join(workDir, 'job.stderr.log');
  const stdoutFd = fs.openSync(stdoutPath, 'a');
  const stderrFd = fs.openSync(stderrPath, 'a');

  await writeRuntimeStatus(statusPath, {
    jobRunId: spec.jobRunId,
    status: 'running',
    runnerPid: process.pid,
    command,
    shell,
    workDir,
    startedAt: new Date().toISOString(),
  });

  const child = spawn(shell, ['-lc', command], {
    cwd: workDir,
    env: { ...process.env },
    stdio: ['ignore', stdoutFd, stderrFd],
  });

  await writeRuntimeStatus(statusPath, {
    jobRunId: spec.jobRunId,
    status: 'running',
    runnerPid: process.pid,
    childPid: child.pid,
    command,
    shell,
    workDir,
    stdoutPath,
    stderrPath,
    startedAt: new Date().toISOString(),
  });

  child.on('close', async (code, signal) => {
    try {
      await writeRuntimeStatus(statusPath, {
        jobRunId: spec.jobRunId,
        status: code === 0 ? 'completed' : 'failed',
        runnerPid: process.pid,
        childPid: child.pid,
        command,
        shell,
        workDir,
        stdoutPath,
        stderrPath,
        exitCode: code,
        signal: signal || null,
        endedAt: new Date().toISOString(),
      });
    } finally {
      process.exit(code || 0);
    }
  });

  child.on('error', async (error) => {
    try {
      await writeRuntimeStatus(statusPath, {
        jobRunId: spec.jobRunId,
        status: 'failed',
        runnerPid: process.pid,
        childPid: child.pid || null,
        command,
        shell,
        workDir,
        stdoutPath,
        stderrPath,
        error: error.message,
        endedAt: new Date().toISOString(),
      });
    } finally {
      process.exit(1);
    }
  });
}

main().catch(async (error) => {
  try {
    const statusPath = String(process.argv[3] || '').trim();
    if (statusPath) {
      await writeRuntimeStatus(statusPath, {
        status: 'failed',
        error: error.message,
        endedAt: new Date().toISOString(),
      });
    }
  } finally {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
});
