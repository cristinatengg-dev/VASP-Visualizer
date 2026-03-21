function extractLastNumericMatch(text, pattern, groupIndex = 1) {
  const source = String(text || '');
  const matches = [...source.matchAll(pattern)];
  if (matches.length === 0) {
    return null;
  }

  const value = Number(matches[matches.length - 1][groupIndex]);
  return Number.isFinite(value) ? value : null;
}

function countMatches(text, pattern) {
  const source = String(text || '');
  return [...source.matchAll(pattern)].length;
}

function parseTotalEnergyEv({ oszicarTail, outcarTail, vaspOutTail }) {
  return (
    extractLastNumericMatch(oszicarTail, /F=\s*([-\d.]+)/g)
    ?? extractLastNumericMatch(oszicarTail, /E0=\s*([-\d.]+)/g)
    ?? extractLastNumericMatch(outcarTail, /free\s+energy\s+TOTEN\s*=\s*([-\d.]+)/gi)
    ?? extractLastNumericMatch(vaspOutTail, /free\s+energy\s+TOTEN\s*=\s*([-\d.]+)/gi)
  );
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
  const count = countMatches(oszicarTail, /DAV:\s*\d+/g);
  return count > 0 ? count : null;
}

function parseConvergence({ oszicarTail, outcarTail, vaspOutTail, runtimeStatus }) {
  const combined = [oszicarTail, outcarTail, vaspOutTail].filter(Boolean).join('\n');
  const converged = /reached required accuracy|aborting loop because EDIFF|accuracy reached/i.test(combined);
  const hasNonZeroExit = Number.isFinite(runtimeStatus?.exitCode) && Number(runtimeStatus.exitCode) !== 0;
  if (hasNonZeroExit) {
    return false;
  }
  return converged;
}

function collectWarnings({ jobStdoutTail, jobStderrTail, outcarTail, vaspOutTail, runtimeStatus }) {
  const warnings = [];
  const combined = [jobStdoutTail, jobStderrTail, outcarTail, vaspOutTail].filter(Boolean).join('\n');
  const checks = [
    { pattern: /VERY BAD NEWS/i, message: 'VASP reported VERY BAD NEWS in output' },
    { pattern: /segmentation fault/i, message: 'Execution log contains segmentation fault' },
    { pattern: /ZBRENT: fatal error/i, message: 'Output contains ZBRENT fatal error' },
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
}) {
  const forceMetrics = parseForceMetrics({ outcarTail, vaspOutTail });

  return {
    totalEnergyEv: parseTotalEnergyEv({ oszicarTail, outcarTail, vaspOutTail }),
    converged: parseConvergence({ oszicarTail, outcarTail, vaspOutTail, runtimeStatus }),
    ionicStepCount: parseIonicStepCount({ oszicarTail }),
    electronicStepHints: parseElectronicStepHints({ oszicarTail }),
    maxForceEvPerA: forceMetrics.maxForceEvPerA,
    rmsForceEvPerA: forceMetrics.rmsForceEvPerA,
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
