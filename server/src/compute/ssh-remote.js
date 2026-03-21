const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function quotePosix(value) {
  return `'${String(value || '').replace(/'/g, `'\"'\"'`)}'`;
}

function runCapture(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
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

function buildSshCommonArgs(config) {
  return [
    '-i', String(config.keyPath),
    '-p', String(config.port || 22),
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `ConnectTimeout=${String(config.connectTimeoutSec || 12)}`,
    '-o', `ServerAliveInterval=${String(config.serverAliveIntervalSec || 10)}`,
    '-o', `ServerAliveCountMax=${String(config.serverAliveCountMax || 2)}`,
  ];
}

function buildRemoteTarget(config) {
  return `${config.user}@${config.host}`;
}

async function runRemoteShellCommand(config, command) {
  const shell = String(config.shell || '/bin/bash').trim() || '/bin/bash';
  const remoteCommand = `${shell} -lc ${quotePosix(command)}`;
  return runCapture('ssh', [
    ...buildSshCommonArgs(config),
    buildRemoteTarget(config),
    remoteCommand,
  ], {
    env: { ...process.env },
  });
}

async function ensureRemoteDirectory(config, remoteDir) {
  const result = await runRemoteShellCommand(config, `mkdir -p ${quotePosix(remoteDir)}`);
  if (!result.ok) {
    throw new Error(`Failed to create remote directory: ${String(result.stderr || result.stdout || '').trim() || 'unknown ssh error'}`);
  }
}

async function copyDirectoryToRemote(config, localDir, remoteDir) {
  await ensureRemoteDirectory(config, remoteDir);
  const result = await runCapture('scp', [
    ...buildSshCommonArgs(config).flatMap((value) => value === '-p' ? ['-P'] : [value]),
    '-r',
    `${path.resolve(localDir)}${path.sep}.`,
    `${buildRemoteTarget(config)}:${remoteDir}/`,
  ], {
    env: { ...process.env },
  });

  if (!result.ok) {
    throw new Error(`Failed to copy directory to remote host: ${String(result.stderr || result.stdout || '').trim() || 'unknown scp error'}`);
  }
}

async function copyRemoteDirectoryToLocal(config, remoteDir, localDir) {
  await fs.promises.mkdir(localDir, { recursive: true });
  const result = await runCapture('scp', [
    ...buildSshCommonArgs(config).flatMap((value) => value === '-p' ? ['-P'] : [value]),
    '-r',
    `${buildRemoteTarget(config)}:${remoteDir}/.`,
    path.resolve(localDir),
  ], {
    env: { ...process.env },
  });

  if (!result.ok) {
    throw new Error(`Failed to copy remote directory locally: ${String(result.stderr || result.stdout || '').trim() || 'unknown scp error'}`);
  }
}

function parseSubmittedJobId(output) {
  const text = String(output || '');
  const match = text.match(/job\s+(\d+)/i);
  return match ? match[1] : null;
}

async function materializeRemotePotcar({
  config,
  remoteDir,
  symbols,
}) {
  const uniqueSymbols = Array.from(new Set((Array.isArray(symbols) ? symbols : []).map((item) => String(item || '').trim()).filter(Boolean)));
  const remotePotcarDir = String(config?.remotePotcarDir || '').trim();

  if (!remotePotcarDir || uniqueSymbols.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: !remotePotcarDir ? 'remote_potcar_dir_missing' : 'potcar_symbols_missing',
    };
  }

  const command = [
    `cd ${quotePosix(remoteDir)}`,
    'python3 - <<\'PY\'',
    'import json, pathlib, sys',
    `base_dir = pathlib.Path(${JSON.stringify(remotePotcarDir)})`,
    `symbols = json.loads(${JSON.stringify(JSON.stringify(uniqueSymbols))})`,
    'target = pathlib.Path("POTCAR")',
    'candidates = []',
    'parts = []',
    'for symbol in symbols:',
    '    candidate_paths = [',
    '        base_dir / symbol / "POTCAR",',
    '        base_dir / "POT_GGA_PAW_PBE" / symbol / "POTCAR",',
    '        base_dir / "potpaw_PBE" / symbol / "POTCAR",',
    '        base_dir / "PBE" / symbol / "POTCAR",',
    '    ]',
    '    match = next((p for p in candidate_paths if p.is_file()), None)',
    '    if match is None:',
    '        print(f"MISSING:{symbol}")',
    '        sys.exit(12)',
    '    candidates.append(str(match))',
    '    parts.append(match.read_text())',
    'target.write_text("\\n".join(parts))',
    'print("POTCAR_READY")',
    'for item in candidates:',
    '    print(item)',
    'PY',
  ].join('; ');

  const result = await runRemoteShellCommand(config, command);
  if (!result.ok) {
    throw new Error(`Remote POTCAR materialization failed: ${String(result.stderr || result.stdout || '').trim() || 'unknown ssh error'}`);
  }

  return {
    ok: true,
    skipped: false,
    remotePotcarDir,
    symbols: uniqueSymbols,
    output: String(result.stdout || '').trim() || null,
  };
}

async function submitRemoteSlurmJob({
  config,
  localDir,
  remoteDir,
  scriptContent,
  potcar,
}) {
  const scriptPath = path.join(localDir, 'job.sh');
  await fs.promises.writeFile(scriptPath, scriptContent, 'utf8');
  await copyDirectoryToRemote(config, localDir, remoteDir);

  if (potcar && !potcar.localMaterialized) {
    await materializeRemotePotcar({
      config,
      remoteDir,
      symbols: potcar.symbols,
    });
  }

  const submitResult = await runRemoteShellCommand(
    config,
    `cd ${quotePosix(remoteDir)} && sbatch job.sh`
  );

  if (!submitResult.ok) {
    throw new Error(`Remote sbatch failed: ${String(submitResult.stderr || submitResult.stdout || '').trim() || 'unknown ssh error'}`);
  }

  return {
    success: true,
    job_id: parseSubmittedJobId(submitResult.stdout) || 'unknown',
    message: String(submitResult.stdout || '').trim() || null,
    remoteWorkDir: remoteDir,
  };
}

async function submitRemotePbsJob({
  config,
  localDir,
  remoteDir,
  scriptContent,
  potcar,
}) {
  const scriptPath = path.join(localDir, 'job.pbs');
  await fs.promises.writeFile(scriptPath, scriptContent, 'utf8');
  await copyDirectoryToRemote(config, localDir, remoteDir);

  if (potcar && !potcar.localMaterialized) {
    await materializeRemotePotcar({
      config,
      remoteDir,
      symbols: potcar.symbols,
    });
  }

  const submitResult = await runRemoteShellCommand(
    config,
    `cd ${quotePosix(remoteDir)} && qsub job.pbs`
  );

  if (!submitResult.ok) {
    throw new Error(`Remote qsub failed: ${String(submitResult.stderr || submitResult.stdout || '').trim() || 'unknown ssh error'}`);
  }

  return {
    success: true,
    job_id: parseSubmittedJobId(submitResult.stdout) || 'unknown',
    message: String(submitResult.stdout || '').trim() || null,
    remoteWorkDir: remoteDir,
  };
}

module.exports = {
  copyRemoteDirectoryToLocal,
  materializeRemotePotcar,
  quotePosix,
  runRemoteShellCommand,
  submitRemotePbsJob,
  submitRemoteSlurmJob,
};
