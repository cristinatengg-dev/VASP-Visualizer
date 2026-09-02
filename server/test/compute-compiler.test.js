const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compileComputeInputSet } = require('../src/compute/compile-input-set');
const { buildSignedComputeAudit, verifyComputeAudit } = require('../src/compute/audit');
const { buildResultMetrics, collectWarnings } = require('../src/compute/parse-results');
const { materializePotcar, parsePotcarMetadata } = require('../src/compute/potcar');
const { parseSubmittedJobId } = require('../src/compute/ssh-remote');
const { generateJobScript } = require('../utils/hpc');
const { toPublicComputeProfile } = require('../src/compute/profiles');

const carbonStructure = {
  data: {
    latticeVectors: [
      [2.46, 0, 0],
      [-1.23, 2.130422, 0],
      [0, 0, 6.71],
    ],
    atoms: [
      { element: 'C', position: { x: 0, y: 0, z: 0 } },
      { element: 'C', position: { x: 1.23, y: 0.710141, z: 0 } },
    ],
  },
  meta: { formula: 'C' },
};

test('LAMMPS compiler emits exactly one x, y, and z box bound', async () => {
  const result = await compileComputeInputSet({
    structure: carbonStructure,
    intent: { engine: 'lammps', workflow: 'irradiation_creep', quality: 'fast' },
  });
  const dataFile = result.files['data.graphite'];
  const boundLabels = dataFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /[xyz]lo [xyz]hi$/.test(line))
    .map((line) => line.split(/\s+/).slice(-2).join(' '));

  assert.deepEqual(boundLabels, ['xlo xhi', 'ylo yhi', 'zlo zhi']);
});

test('VASP compiler produces a reviewable input set with an explicit POTCAR spec', async () => {
  const result = await compileComputeInputSet({
    structure: carbonStructure,
    intent: { engine: 'vasp', workflow: 'relax', quality: 'standard' },
  });

  assert.equal(result.success, true);
  assert.match(result.files.INCAR, /ENCUT\s*=\s*520/);
  assert.match(result.files.KPOINTS, /Gamma/);
  assert.deepEqual(JSON.parse(result.files['POTCAR.spec.json']).symbols, ['C']);
});

test('VASP compiler carries fixed atoms into selective dynamics and applies slab safeguards', async () => {
  const result = await compileComputeInputSet({
    structure: {
      data: {
        latticeVectors: [[3, 0, 0], [0, 3, 0], [0, 0, 20]],
        atoms: [
          { id: 'cu-1', element: 'Cu', position: { x: 0, y: 0, z: 5 } },
          { id: 'cu-2', element: 'Cu', position: { x: 1.5, y: 1.5, z: 6 } },
        ],
      },
      meta: { formula: 'Cu', system: 'slab' },
    },
    intent: {
      engine: 'vasp',
      workflow: 'relax',
      quality: 'standard',
      spin_mode: 'auto',
      custom_params: { fixed_atom_indices: [0] },
    },
  });

  assert.equal(result.preview.systemType, 'slab');
  assert.match(result.files.POSCAR, /Selective dynamics/i);
  assert.match(result.files.POSCAR, /F F F Cu/);
  assert.match(result.files.POSCAR, /T T T Cu/);
  assert.match(result.files.INCAR, /LDIPOL\s*=\s*True/);
  assert.match(result.files.INCAR, /IDIPOL\s*=\s*3/);
  assert.match(result.files.KPOINTS, /\d+ \d+ 1/);
  assert.equal(result.validation.submissionReady, true);
});

test('VASP band workflow is an audited SCF to line-mode sequence', async () => {
  const result = await compileComputeInputSet({
    structure: {
      ...carbonStructure,
      meta: { formula: 'C', system: 'bulk' },
    },
    intent: { engine: 'vasp', workflow: 'band', quality: 'standard', spin_mode: 'none' },
  });

  assert.equal(result.preview.stages.length, 2);
  assert.match(result.files['KPOINTS.band'], /Line-mode/);
  assert.match(result.files['INCAR.band'], /ICHARG\s*=\s*11/);
  assert.match(result.files['run_vasp_workflow.sh'], /01_scf\/CHGCAR/);
  assert.match(result.files['run_vasp_workflow.sh'], /02_band/);
  assert.equal(result.validation.submissionReady, true);
});

test('VASP compiler blocks charged cells until NELECT is explicitly resolved', async () => {
  const result = await compileComputeInputSet({
    structure: { ...carbonStructure, meta: { formula: 'C', system: 'bulk' } },
    intent: {
      engine: 'vasp',
      workflow: 'static',
      quality: 'standard',
      custom_params: { charge: 1 },
    },
  });

  assert.equal(result.validation.submissionReady, false);
  assert.match(result.validation.blockingIssues.join('\n'), /NELECT/);
  assert.doesNotMatch(result.files.INCAR, /CHARGE|MULTIPLICITY|FIXED_ATOM/);
});

test('VASP compiler accepts an explicitly resolved charged cell and requires a complete DFT+U tuple', async () => {
  const resolvedCharge = await compileComputeInputSet({
    structure: { ...carbonStructure, meta: { formula: 'C', system: 'bulk' } },
    intent: {
      engine: 'vasp',
      workflow: 'static',
      quality: 'standard',
      custom_params: { charge: 1, NELECT: 7 },
    },
  });
  assert.equal(resolvedCharge.validation.submissionReady, true);
  assert.match(resolvedCharge.files.INCAR, /NELECT\s*=\s*7/);

  const incompleteU = await compileComputeInputSet({
    structure: { ...carbonStructure, meta: { formula: 'C', system: 'bulk' } },
    intent: {
      engine: 'vasp',
      workflow: 'static',
      quality: 'standard',
      u_correction: true,
      custom_params: { LDAUU: [0] },
    },
  });
  assert.equal(incompleteU.validation.submissionReady, false);
  assert.match(incompleteU.validation.blockingIssues.join('\n'), /LDAUL, LDAUU, and LDAUJ/);
});

test('compute audit rejects any input file changed after review', () => {
  const secret = 'test-only-compute-audit-secret';
  const files = { INCAR: 'ENCUT = 520\n', POSCAR: 'structure\n' };
  const signed = buildSignedComputeAudit({
    files,
    structure: carbonStructure,
    intent: { engine: 'vasp', workflow: 'relax', quality: 'standard' },
    compileResult: {
      validation: { submissionReady: true, blockingIssues: [], warnings: [] },
      meta: { compilerVersion: 'test', formula: 'C', systemType: 'bulk', stages: [] },
    },
    compilerSource: 'compiler source',
    secret,
  });
  const signedFiles = { ...files, 'VASP_AUDIT.json': JSON.stringify(signed.manifest) };

  assert.equal(verifyComputeAudit({ files: signedFiles, token: signed.token, secret }).ok, true);
  assert.equal(verifyComputeAudit({
    files: { ...signedFiles, INCAR: 'ENCUT = 400\n' },
    token: signed.token,
    secret,
  }).reason, 'compiled_files_changed_after_review');
});

test('VASP result parser separates electronic and ionic convergence and captures provenance metrics', () => {
  const outcarTail = `
 free  energy   TOTEN  =       -12.345678 eV
 energy  without entropy=      -12.3000  energy(sigma->0) = -12.3200
 E-fermi :  5.4321
 number of electron  16.0000 magnetization  2.5000
 in kB   1.0 2.0 3.0 0.1 0.2 0.3
 aborting loop because EDIFF is reached
 reached required accuracy - stopping structural energy minimisation
 `;
  const metrics = buildResultMetrics({
    oszicarTail: ' 1 F= -1.23E+01 E0= -.120\n DAV: 1',
    outcarTail,
    vaspOutTail: '',
    runtimeStatus: { exitCode: 0 },
    workflow: 'relax',
    jobRun: { createdAt: new Date(0), endedAt: new Date(1000) },
  });

  assert.equal(metrics.converged, true);
  assert.equal(metrics.totalEnergyEv, -12.3);
  assert.equal(metrics.electronicConverged, true);
  assert.equal(metrics.ionicConverged, true);
  assert.equal(metrics.fermiEnergyEv, 5.4321);
  assert.equal(metrics.totalMagnetizationMuB, 2.5);
  assert.deepEqual(metrics.stressKbar, { xx: 1, yy: 2, zz: 3, xy: 0.1, yz: 0.2, zx: 0.3 });
  assert.match(collectWarnings({ outcarTail: 'BRMIX: very serious problems', runtimeStatus: {} }).join('\n'), /Charge mixing failed/);
});

test('POTCAR metadata and scheduler script preserve scientific provenance and staged execution', () => {
  const metadata = parsePotcarMetadata('TITEL = PAW_PBE Fe_pv 06Sep2000\nPOMASS = 55.845; ZVAL = 8.000\nENMAX = 293.238; ENMIN = 220\n');
  assert.equal(metadata.title, 'PAW_PBE Fe_pv 06Sep2000');
  assert.equal(metadata.enmaxEv, 293.238);
  assert.equal(metadata.zval, 8);
  assert.equal(metadata.sha256.length, 64);

  const script = generateJobScript({
    structure: { data: { filename: 'Fe_band' } },
    hpc: { system: 'pbs', id: 'pbs', queue: 'work', nodes: 1, ppn: 8, walltime: '01:00:00', executable: 'vasp_std' },
    intent: { engine: 'vasp', workflow: 'band' },
    runtime_policy: { use_custodian: false },
  });
  assert.match(script, /run_vasp_workflow\.sh/);
  assert.match(script, /VASP_COMMAND="mpirun -np \$NP/);
  assert.equal(parseSubmittedJobId('12345.cluster\n'), '12345.cluster');
  assert.equal(parseSubmittedJobId('Submitted batch job 67890\n'), '67890');
});

test('POTCAR materialization verifies charged-cell NELECT from ZVAL provenance', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vasp-potcar-test-'));
  const oldLibrary = process.env.VASP_PSP_DIR;
  try {
    const library = path.join(tempRoot, 'library');
    const target = path.join(tempRoot, 'target');
    fs.mkdirSync(path.join(library, 'C'), { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(library, 'C', 'POTCAR'), 'TITEL = PAW_PBE C\nPOMASS = 12.011; ZVAL = 4.000\nENMAX = 400.0\n');
    process.env.VASP_PSP_DIR = library;

    const accepted = await materializePotcar({
      inputDir: target,
      potcarSpec: { symbols: ['C'], counts: [2], charge: 1, requestedNelect: 7, encutEv: 520 },
    });
    assert.equal(accepted.materialized, true);
    assert.equal(accepted.provenance.neutralElectronCount, 8);
    assert.equal(accepted.provenance.expectedNelect, 7);

    const rejected = await materializePotcar({
      inputDir: target,
      potcarSpec: { symbols: ['C'], counts: [2], charge: 1, requestedNelect: 6, encutEv: 520 },
    });
    assert.equal(rejected.materialized, false);
    assert.equal(rejected.reason, 'nelect_charge_mismatch');
  } finally {
    if (oldLibrary === undefined) delete process.env.VASP_PSP_DIR;
    else process.env.VASP_PSP_DIR = oldLibrary;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('public compute profiles expose readiness without leaking execution credentials', () => {
  const profile = toPublicComputeProfile({
    id: 'pbs_default',
    label: 'PBS',
    system: 'pbs',
    mode: 'pbs',
    configured: true,
    directSubmitSupported: true,
    requiresApproval: true,
    summary: 'test',
    schedulerRef: 'pbs',
    hpc: {
      id: 'pbs', queue: 'work', nodes: 1, ppn: 8, walltime: '01:00:00',
      executable: '/licensed/vasp_std', moduleLoad: 'module load secret', accessMode: 'remote_ssh',
      ssh: { host: 'private-host', user: 'root', keyPath: '/secret/key' },
    },
  }, { ready: false, reason: 'channel_unavailable' });

  assert.equal(profile.ready, false);
  assert.equal(profile.readinessReason, 'channel_unavailable');
  assert.equal(profile.hpc.executableConfigured, true);
  assert.equal('ssh' in profile.hpc, false);
  assert.equal('executable' in profile.hpc, false);
});
