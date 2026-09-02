function extractLastNumericMatch(text, pattern, groupIndex = 1) {
  const source = String(text || '');
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) {
    return null;
  }

  const value = Number(matches[matches.length - 1][groupIndex]);
  return Number.isFinite(value) ? value : null;
}

const NUMBER_PATTERN = '([-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][-+]?\\d+)?)';

function countMatches(text, pattern) {
  const source = String(text || '');
  return [...source.matchAll(pattern)].length;
}

function parseTotalEnergyEv({ oszicarTail, outcarTail, vaspOutTail }) {
  return (
    extractLastNumericMatch(oszicarTail, new RegExp(`F=\\s*${NUMBER_PATTERN}`, 'g'))
    ?? extractLastNumericMatch(oszicarTail, new RegExp(`E0=\\s*${NUMBER_PATTERN}`, 'g'))
    ?? extractLastNumericMatch(outcarTail, new RegExp(`free\\s+energy\\s+TOTEN\\s*=\\s*${NUMBER_PATTERN}`, 'gi'))
    ?? extractLastNumericMatch(vaspOutTail, new RegExp(`free\\s+energy\\s+TOTEN\\s*=\\s*${NUMBER_PATTERN}`, 'gi'))
  );
}

function parseEnergyBreakdown({ outcarTail, vaspOutTail }) {
  const source = [outcarTail, vaspOutTail].filter(Boolean).join('\n');
  return {
    freeEnergyEv: extractLastNumericMatch(source, new RegExp(`free\\s+energy\\s+TOTEN\\s*=\\s*${NUMBER_PATTERN}`, 'gi')),
    energyWithoutEntropyEv: extractLastNumericMatch(source, new RegExp(`energy\\s+without\\s+entropy\\s*=\\s*${NUMBER_PATTERN}`, 'gi')),
    sigmaToZeroEnergyEv: extractLastNumericMatch(source, new RegExp(`energy\\(sigma->0\\)\\s*=\\s*${NUMBER_PATTERN}`, 'gi')),
  };
}

function parseElectronicMetrics({ outcarTail, vaspOutTail }) {
  const source = [outcarTail, vaspOutTail].filter(Boolean).join('\n');
  return {
    fermiEnergyEv: extractLastNumericMatch(source, new RegExp(`E-fermi\\s*:\\s*${NUMBER_PATTERN}`, 'gi')),
    totalMagnetizationMuB: extractLastNumericMatch(source, new RegExp(`number of electron\\s+${NUMBER_PATTERN}\\s+magnetization\\s+${NUMBER_PATTERN}`, 'gi'), 2),
  };
}

function parseStressKbar({ outcarTail, vaspOutTail }) {
  const source = [outcarTail, vaspOutTail].filter(Boolean).join('\n');
  const matches = [...source.matchAll(/in kB\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)\s+([-+\d.Ee]+)/gi)];
  if (!matches.length) return null;
  const values = matches[matches.length - 1].slice(1, 7).map(Number);
  return values.every(Number.isFinite) ? {
    xx: values[0], yy: values[1], zz: values[2], xy: values[3], yz: values[4], zx: values[5],
  } : null;
}

function parseForceMetrics({ outcarTail, vaspOutTail }) {
  const source = [outcarTail, vaspOutTail].filter(Boolean).join('\n');
  const maxForce = extractLastNumericMatch(source, /FORCES:\s+max atom,\s+RMS\s+([-\d.]+)\s+([-\d.]+)/gi, 1);
  const rmsForce = extractLastNumericMatch(source, /FORCES:\s+max atom,\s+RMS\s+([-\d.]+)\s+([-\d.]+)/gi, 2);

  return {
    maxForceEvPerA: maxForce,
    rmsForceEvPerA: rmsForce,
  };
}

function parseIonicStepCount({ oszicarTail }) {
  const count = countMatches(oszicarTail, /^\s*\d+\s+F=/gm);
  return count > 0 ? count : null;
}

function parseElectronicStepHints({ oszicarTail }) {
  const count = countMatches(oszicarTail, /(?:DAV|RMM):\s*\d+/g);
  return count > 0 ? count : null;
}

function parseConvergence({ oszicarTail, outcarTail, vaspOutTail, runtimeStatus, workflow }) {
  const combined = [oszicarTail, outcarTail, vaspOutTail].filter(Boolean).join('\n');
  const electronicConverged = /aborting loop because EDIFF is reached|EDIFF is reached|accuracy reached/i.test(combined);
  const ionicConverged = /reached required accuracy\s*-\s*stopping structural energy minimisation/i.test(combined);
  const hasNonZeroExit = Number.isFinite(runtimeStatus?.exitCode) && Number(runtimeStatus.exitCode) !== 0;
  const requiresIonicConvergence = ['relax', 'adsorption', 'neb'].includes(String(workflow || '').toLowerCase());
  return {
    electronicConverged: !hasNonZeroExit && electronicConverged,
    ionicConverged: requiresIonicConvergence ? (!hasNonZeroExit && ionicConverged) : null,
    converged: !hasNonZeroExit && electronicConverged && (!requiresIonicConvergence || ionicConverged),
  };
}

function collectWarnings({ jobStdoutTail, jobStderrTail, outcarTail, vaspOutTail, runtimeStatus }) {
  const warnings = [];
  const combined = [jobStdoutTail, jobStderrTail, outcarTail, vaspOutTail].filter(Boolean).join('\n');
  const checks = [
    { pattern: /VERY BAD NEWS/i, message: 'VASP reported VERY BAD NEWS in output' },
    { pattern: /segmentation fault/i, message: 'Execution log contains segmentation fault' },
    { pattern: /ZBRENT: fatal error/i, message: 'Output contains ZBRENT fatal error' },
    { pattern: /BRMIX:\s*very serious problems/i, message: 'Charge mixing failed (BRMIX); review structure, smearing, and mixing settings' },
    { pattern: /ZHEGV.*failed/i, message: 'Electronic diagonalization failed (ZHEGV)' },
    { pattern: /EDDDAV:\s*Call to ZHEGV failed/i, message: 'Electronic minimization failed (EDDDAV)' },
    { pattern: /Sub-Space-Matrix is not hermitian/i, message: 'Sub-space matrix is not Hermitian; restart files or geometry may be unstable' },
    { pattern: /please rerun with smaller EDIFF/i, message: 'VASP recommends a tighter EDIFF setting' },
    { pattern: /internal error/i, message: 'Output contains internal error' },
    { pattern: /error/i, message: 'Output contains generic error markers' },
  ];

  for (const check of checks) {
    if (check.pattern.test(combined)) {
      warnings.push(check.message);
    }
  }

  if (Number.isFinite(runtimeStatus?.exitCode) && Number(runtimeStatus.exitCode) !== 0) {
    warnings.push(`Process exited with code ${runtimeStatus.exitCode}`);
  }
  if (runtimeStatus?.signal) {
    warnings.push(`Process terminated by signal ${runtimeStatus.signal}`);
  }

  return Array.from(new Set(warnings));
}

function buildResultMetrics({
  oszicarTail,
  outcarTail,
  vaspOutTail,
  runtimeStatus,
  jobRun,
  workflow,
}) {
  const forceMetrics = parseForceMetrics({ outcarTail, vaspOutTail });
  const convergence = parseConvergence({ oszicarTail, outcarTail, vaspOutTail, runtimeStatus, workflow });
  const energyBreakdown = parseEnergyBreakdown({ outcarTail, vaspOutTail });
  const electronicMetrics = parseElectronicMetrics({ outcarTail, vaspOutTail });

  return {
    totalEnergyEv: parseTotalEnergyEv({ oszicarTail, outcarTail, vaspOutTail }),
    ...energyBreakdown,
    ...electronicMetrics,
    ...convergence,
    ionicStepCount: parseIonicStepCount({ oszicarTail }),
    electronicStepHints: parseElectronicStepHints({ oszicarTail }),
    maxForceEvPerA: forceMetrics.maxForceEvPerA,
    rmsForceEvPerA: forceMetrics.rmsForceEvPerA,
    stressKbar: parseStressKbar({ outcarTail, vaspOutTail }),
    exitCode: runtimeStatus?.exitCode ?? null,
    elapsedSeconds: Math.max(
      1,
      Math.round(((jobRun.endedAt || new Date()).getTime() - (jobRun.submittedAt || jobRun.createdAt).getTime()) / 1000)
    ),
  };
}

module.exports = {
  buildResultMetrics,
  collectWarnings,
};
