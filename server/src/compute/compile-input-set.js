const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getDefaultComputePythonExecutable } = require('./python-runtime');
const { buildSignedComputeAudit } = require('./audit');

const SUPPORTED_ENGINES = new Set([
  'vasp',
  'cp2k',
  'quantum_espresso',
  'gaussian',
  'orca',
  'nwchem',
  'qchem',
  'lammps',
  'gromacs',
  'namd',
  'amber',
  'openmm',
  'abinit',
  'castep',
  'siesta',
  'dftbplus',
  'xtb',
]);
const COMPILE_READY_ENGINES = new Set(SUPPORTED_ENGINES);
const SUPPORTED_WORKFLOWS = new Set([
  'relax',
  'static',
  'dos',
  'band',
  'adsorption',
  'neb',
  'irradiation_creep',
]);
const SUPPORTED_QUALITIES = new Set(['fast', 'standard', 'high']);
const SUPPORTED_SPIN_MODES = new Set(['none', 'auto', 'polarized', 'collinear', 'non-collinear']);

function normalizeComputeIntent(intent = {}, structurePreview = {}) {
  const engine = SUPPORTED_ENGINES.has(String(intent.engine || '').trim().toLowerCase())
    ? String(intent.engine).trim().toLowerCase()
    : 'vasp';

  const requestedWorkflow = String(intent.workflow || '').trim().toLowerCase();
  const workflow = SUPPORTED_WORKFLOWS.has(requestedWorkflow)
    ? requestedWorkflow
    : (engine === 'lammps' ? 'irradiation_creep' : 'relax');

  const quality = SUPPORTED_QUALITIES.has(String(intent.quality || '').trim().toLowerCase())
    ? String(intent.quality).trim().toLowerCase()
    : 'standard';

  const spinMode = SUPPORTED_SPIN_MODES.has(String(intent.spin_mode || '').trim().toLowerCase())
    ? String(intent.spin_mode).trim().toLowerCase()
    : 'auto';

  return {
    engine,
    workflow,
    quality,
    vdw: intent.vdw === true,
    u_correction: intent.u_correction === true,
    spin_mode: spinMode,
    kpoints_mode: ['auto', 'gamma', 'monkhorst'].includes(String(intent.kpoints_mode || '').trim().toLowerCase())
      ? String(intent.kpoints_mode).trim().toLowerCase()
      : 'auto',
    restart_policy: ['basic', 'custodian'].includes(String(intent.restart_policy || '').trim().toLowerCase())
      ? String(intent.restart_policy).trim().toLowerCase()
      : 'basic',
    custom_params: intent.custom_params && typeof intent.custom_params === 'object'
      ? intent.custom_params
      : {},
    system_hint: String(intent.system_hint || structurePreview.system || structurePreview.taskType || '').trim() || null,
  };
}

function parseCompilerOutput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    throw new Error('Compute compiler returned empty output');
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const jsonText = firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text;

  const parsed = JSON.parse(jsonText);
  if (!parsed || parsed.success !== true || !parsed.files) {
    throw new Error(parsed?.error || 'Compute compiler did not return a successful result');
  }
  return parsed;
}

function normalizeCompilerError(stderr, code) {
  const raw = String(stderr || '').trim();
  if (!raw) {
    return `Compute compiler exited with code ${code}`;
  }
  if (raw.includes('numpy.dtype size changed')) {
    return 'Compute engine environment is broken: pymatgen and numpy are binary-incompatible on the server. Reinstall matching versions before using compute compile.';
  }
  const criticalLine = raw
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('CRITICAL:'));
  if (criticalLine) {
    return criticalLine;
  }
  return raw;
}

async function compileComputeInputSet({ structure, intent } = {}) {
  if (!structure || typeof structure !== 'object') {
    throw new Error('Structure payload is required to compile a compute input set');
  }

  const normalizedIntent = normalizeComputeIntent(intent, structure.meta || {});
  if (!COMPILE_READY_ENGINES.has(normalizedIntent.engine)) {
    throw new Error(`Input compilation for '${normalizedIntent.engine}' is not wired yet. The remote channel can detect this engine, but an engine-specific input template must be configured before submission.`);
  }
  const compilerPath = path.join(__dirname, '../../agents/compute/compiler.py');
  const pythonExecutable = getDefaultComputePythonExecutable();
  const requestPayload = {
    structure,
    intent: normalizedIntent,
  };

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonExecutable, [compilerPath], {
      env: {
        ...process.env,
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    pythonProcess.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`Compute engine unavailable on server: ${error.message}`));
    });

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        settled = true;
        reject(new Error(normalizeCompilerError(stderr, code)));
        return;
      }

      try {
        const parsed = parseCompilerOutput(stdout);
        const compilerSource = fs.readFileSync(compilerPath, 'utf8');
        const signedAudit = process.env.TOKEN_SECRET
          ? buildSignedComputeAudit({
            files: parsed.files,
            structure,
            intent: normalizedIntent,
            compileResult: parsed,
            compilerSource,
            secret: process.env.TOKEN_SECRET,
          })
          : null;
        if (signedAudit) {
          parsed.files['VASP_AUDIT.json'] = JSON.stringify(signedAudit.manifest, null, 2);
        }
        settled = true;
        resolve({
          ...parsed,
          normalizedIntent,
          audit: signedAudit?.manifest || null,
          auditToken: signedAudit?.token || null,
          pythonExecutable,
          rawStderr: stderr.trim() || null,
        });
      } catch (error) {
        settled = true;
        reject(error);
      }
    });

    pythonProcess.stdin.write(JSON.stringify(requestPayload));
    pythonProcess.stdin.end();
  });
}

module.exports = {
  compileComputeInputSet,
  normalizeComputeIntent,
  parseCompilerOutput,
};
