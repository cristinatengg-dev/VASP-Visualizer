const { Client } = require('ssh2');

const SCHEDULER_PROBES = [
  { id: 'slurm', label: 'Slurm', commands: ['sbatch', 'squeue', 'sacct', 'sinfo'] },
  { id: 'pbs', label: 'PBS/Torque/OpenPBS', commands: ['qsub', 'qstat', 'qdel'] },
  { id: 'lsf', label: 'LSF', commands: ['bsub', 'bjobs', 'bkill'] },
  { id: 'sge', label: 'SGE/UGE', commands: ['qsub', 'qstat', 'qdel', 'qconf'] },
  { id: 'htcondor', label: 'HTCondor', commands: ['condor_submit', 'condor_q', 'condor_rm'] },
  { id: 'flux', label: 'Flux', commands: ['flux'] },
];

const SOFTWARE_PROBES = [
  { id: 'vasp', label: 'VASP', category: 'DFT / materials', commands: ['vasp_std', 'vasp_gam', 'vasp_ncl', 'vasp_gpu', 'vasp'] },
  { id: 'cp2k', label: 'CP2K', category: 'DFT / MD', commands: ['cp2k', 'cp2k.psmp', 'cp2k.popt', 'cp2k.ssmp', 'cp2k_shell'] },
  { id: 'quantum_espresso', label: 'Quantum ESPRESSO', category: 'DFT / materials', commands: ['pw.x', 'ph.x', 'dos.x', 'bands.x', 'projwfc.x', 'neb.x', 'cp.x'] },
  { id: 'gaussian', label: 'Gaussian', category: 'quantum chemistry', commands: ['g16', 'g09', 'g03', 'formchk', 'cubegen'] },
  { id: 'orca', label: 'ORCA', category: 'quantum chemistry', commands: ['orca'] },
  { id: 'nwchem', label: 'NWChem', category: 'quantum chemistry', commands: ['nwchem'] },
  { id: 'qchem', label: 'Q-Chem', category: 'quantum chemistry', commands: ['qchem'] },
  { id: 'lammps', label: 'LAMMPS', category: 'molecular dynamics', commands: ['lmp', 'lmp_mpi', 'lmp_serial', 'lammps'] },
  { id: 'gromacs', label: 'GROMACS', category: 'molecular dynamics', commands: ['gmx', 'gmx_mpi', 'mdrun'] },
  { id: 'namd', label: 'NAMD', category: 'molecular dynamics', commands: ['namd2', 'namd3'] },
  { id: 'amber', label: 'AMBER', category: 'molecular dynamics', commands: ['pmemd', 'pmemd.cuda', 'sander', 'tleap', 'cpptraj'] },
  { id: 'abinit', label: 'ABINIT', category: 'DFT / materials', commands: ['abinit'] },
  { id: 'castep', label: 'CASTEP', category: 'DFT / materials', commands: ['castep', 'castep.mpi', 'castep.serial'] },
  { id: 'siesta', label: 'SIESTA', category: 'DFT / materials', commands: ['siesta'] },
  { id: 'dftbplus', label: 'DFTB+', category: 'semi-empirical', commands: ['dftb+'] },
  { id: 'xtb', label: 'xtb', category: 'semi-empirical', commands: ['xtb'] },
  { id: 'plumed', label: 'PLUMED', category: 'enhanced sampling', commands: ['plumed'] },
];

const PYTHON_MODULE_PROBES = [
  { id: 'openmm', label: 'OpenMM', module: 'openmm', category: 'molecular dynamics' },
  { id: 'ase', label: 'ASE', module: 'ase', category: 'workflow / atomistic IO' },
  { id: 'pymatgen', label: 'pymatgen', module: 'pymatgen', category: 'workflow / materials IO' },
  { id: 'rdkit', label: 'RDKit', module: 'rdkit', category: 'cheminformatics' },
];

function collectProbeCommands() {
  return Array.from(new Set([
    ...SCHEDULER_PROBES.flatMap((probe) => probe.commands),
    ...SOFTWARE_PROBES.flatMap((probe) => probe.commands),
    'mpirun',
    'mpiexec',
    'python3',
    'python',
  ]));
}

function parsePort(value, fallback = 22) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
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

function normalizeChannel(input = {}) {
  const host = String(input.host || input.hostname || '').trim();
  const username = String(input.username || input.user || '').trim();
  const password = typeof input.password === 'string' ? input.password : '';
  const port = parsePort(input.port, 22);
  const readyTimeout = parsePositiveInt(input.readyTimeoutMs || input.timeoutMs, 12000);

  if (!host) {
    throw new Error('Remote channel host is required');
  }
  if (!username) {
    throw new Error('Remote channel user is required');
  }
  if (!password) {
    throw new Error('Remote channel password is required');
  }

  return {
    host,
    port,
    username,
    password,
    readyTimeout,
    tryKeyboard: true,
    keepaliveInterval: 10000,
    keepaliveCountMax: 2,
  };
}

function runSshCommand(connection, command, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let streamRef = null;
    let stdout = '';
    let stderr = '';

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      if (streamRef) {
        try { streamRef.close(); } catch (_error) {}
      }
      finish(reject, new Error('Remote channel probe timed out'));
    }, timeoutMs);

    connection.exec(command, (error, stream) => {
      if (error) {
        finish(reject, error);
        return;
      }

      streamRef = stream;

      stream.on('close', (code) => {
        const result = {
          ok: code === 0,
          code,
          stdout,
          stderr,
        };
        finish(resolve, result);
      });

      stream.on('data', (data) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
}

function withSshConnection(config, handler) {
  return new Promise((resolve, reject) => {
    const connection = new Client();
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      try { connection.end(); } catch (_error) {}
      fn(value);
    };

    connection.on('ready', async () => {
      try {
        const result = await handler(connection);
        finish(resolve, result);
      } catch (error) {
        finish(reject, error);
      }
    });

    connection.on('keyboard-interactive', (_name, _instructions, _language, prompts, done) => {
      done((prompts || []).map(() => config.password || ''));
    });

    connection.on('error', (error) => {
      finish(reject, error);
    });

    connection.connect(config);
  });
}

function parseProbeOutput(stdout) {
  const values = {};
  const commands = {};
  const pythonModules = {};
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('__SCI_CHANNEL_')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    if (key.startsWith('CMD_')) {
      commands[key.slice(4).toLowerCase()] = value;
    } else if (key.startsWith('PYMOD_')) {
      pythonModules[key.slice(6).toLowerCase()] = value === 'present';
    } else {
      values[key.toLowerCase()] = value;
    }
  }

  const schedulers = SCHEDULER_PROBES
    .map((probe) => ({
      id: probe.id,
      label: probe.label,
      commands: Object.fromEntries(
        probe.commands
          .filter((command) => commands[command.toLowerCase()])
          .map((command) => [command, commands[command.toLowerCase()]])
      ),
    }))
    .filter((probe) => Object.keys(probe.commands).length > 0);

  return {
    values,
    commands,
    pythonModules,
    scheduler: schedulers.length > 0 ? schedulers.map((item) => item.id).join('+') : 'none',
    schedulers,
  };
}

function detectSoftware(parsed) {
  const commandMatches = SOFTWARE_PROBES
    .map((probe) => ({
      id: probe.id,
      label: probe.label,
      category: probe.category,
      commands: Object.fromEntries(
        probe.commands
          .filter((command) => parsed.commands[command.toLowerCase()])
          .map((command) => [command, parsed.commands[command.toLowerCase()]])
      ),
    }))
    .filter((probe) => Object.keys(probe.commands).length > 0);

  const pythonMatches = PYTHON_MODULE_PROBES
    .filter((probe) => parsed.pythonModules[probe.module.toLowerCase()])
    .map((probe) => ({
      id: probe.id,
      label: probe.label,
      category: probe.category,
      commands: {},
      pythonModules: [probe.module],
    }));

  return [...commandMatches, ...pythonMatches];
}

async function testRemoteComputeChannel(input = {}) {
  const config = normalizeChannel(input);
  const probeCommands = collectProbeCommands().join(' ');
  const pythonModuleProbe = JSON.stringify(PYTHON_MODULE_PROBES.map((probe) => probe.module));
  const probeCommand = [
    'set +e',
    'echo "__SCI_CHANNEL_OK__"',
    'echo "HOSTNAME=$(hostname 2>/dev/null || uname -n 2>/dev/null)"',
    'echo "USER=$(whoami 2>/dev/null)"',
    'echo "PWD=$(pwd 2>/dev/null)"',
    'echo "SHELL=${SHELL:-}"',
    `for cmd in ${probeCommands}; do`,
    '  found=$(command -v "$cmd" 2>/dev/null)',
    '  if [ -n "$found" ]; then echo "CMD_${cmd}=$found"; fi',
    'done',
    'python_bin=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)',
    'if [ -n "$python_bin" ]; then',
    `  "$python_bin" - <<'PYMOD'`,
    'import importlib.util',
    'import json',
    `modules = json.loads(${JSON.stringify(pythonModuleProbe)})`,
    'for module in modules:',
    '    print(f"PYMOD_{module}=" + ("present" if importlib.util.find_spec(module) else "missing"))',
    'PYMOD',
    'fi',
    'echo "__SCI_CHANNEL_DONE__"',
  ].join('\n');

  const commandResult = await withSshConnection(config, (connection) => (
    runSshCommand(connection, probeCommand, config.readyTimeout)
  ));

  if (!commandResult.ok) {
    const reason = String(commandResult.stderr || commandResult.stdout || '').trim();
    throw new Error(reason || `Remote channel probe exited with code ${commandResult.code}`);
  }

  const parsed = parseProbeOutput(commandResult.stdout);
  const software = detectSoftware(parsed);

  return {
    ok: true,
    target: {
      host: config.host,
      port: config.port,
      username: config.username,
    },
    remote: {
      hostname: parsed.values.hostname || null,
      user: parsed.values.user || null,
      pwd: parsed.values.pwd || null,
      shell: parsed.values.shell || null,
    },
    scheduler: parsed.scheduler,
    schedulers: parsed.schedulers,
    software,
    commands: parsed.commands,
    pythonModules: parsed.pythonModules,
  };
}

module.exports = {
  testRemoteComputeChannel,
};
