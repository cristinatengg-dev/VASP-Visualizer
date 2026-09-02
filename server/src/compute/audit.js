const { createHash, createHmac, timingSafeEqual } = require('crypto');

const AUDIT_SCHEMA_VERSION = 'vasp-audit/v1';

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function hashFiles(files = {}) {
  return Object.keys(files)
    .filter((fileName) => fileName !== 'VASP_AUDIT.json')
    .sort()
    .reduce((result, fileName) => {
      result[fileName] = {
        sha256: sha256(files[fileName]),
        sizeBytes: Buffer.byteLength(String(files[fileName]), 'utf8'),
      };
      return result;
    }, {});
}

function buildSignedComputeAudit({
  files,
  structure,
  intent,
  compileResult,
  compilerSource,
  secret,
}) {
  if (!secret) throw new Error('Compute audit signing secret is not configured');

  const reproducibility = {
    structureSha256: sha256(canonicalJson(structure || {})),
    intentSha256: sha256(canonicalJson(intent || {})),
    compilerSha256: sha256(compilerSource || ''),
    files: hashFiles(files),
  };
  const auditId = sha256(canonicalJson(reproducibility));
  const manifest = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    auditId,
    generatedAt: new Date().toISOString(),
    engine: intent?.engine || null,
    workflow: intent?.workflow || null,
    quality: intent?.quality || null,
    compilerVersion: compileResult?.meta?.compilerVersion || null,
    formula: compileResult?.meta?.formula || compileResult?.preview?.formula || null,
    systemType: compileResult?.meta?.systemType || null,
    stages: compileResult?.meta?.stages || [],
    validation: compileResult?.validation || {
      submissionReady: false,
      blockingIssues: ['Compiler did not return scientific validation metadata'],
      warnings: [],
    },
    reproducibility,
  };
  const token = createHmac('sha256', secret).update(canonicalJson(manifest)).digest('hex');
  return { manifest, token };
}

function verifyComputeAudit({ files, token, secret }) {
  const auditRaw = files?.['VASP_AUDIT.json'];
  if (!auditRaw || !token || !secret) {
    return { ok: false, reason: 'signed_audit_missing' };
  }

  let manifest;
  try {
    manifest = JSON.parse(String(auditRaw));
  } catch (_error) {
    return { ok: false, reason: 'audit_manifest_invalid' };
  }

  const expectedToken = createHmac('sha256', secret).update(canonicalJson(manifest)).digest('hex');
  const supplied = Buffer.from(String(token), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return { ok: false, reason: 'audit_signature_invalid' };
  }

  const actualFiles = hashFiles(files);
  if (canonicalJson(actualFiles) !== canonicalJson(manifest?.reproducibility?.files || {})) {
    return { ok: false, reason: 'compiled_files_changed_after_review' };
  }
  if (manifest?.schemaVersion !== AUDIT_SCHEMA_VERSION) {
    return { ok: false, reason: 'audit_schema_unsupported' };
  }
  if (!manifest?.validation?.submissionReady) {
    return {
      ok: false,
      reason: 'scientific_validation_failed',
      blockingIssues: manifest?.validation?.blockingIssues || [],
    };
  }

  return { ok: true, manifest };
}

module.exports = {
  AUDIT_SCHEMA_VERSION,
  buildSignedComputeAudit,
  canonicalJson,
  hashFiles,
  sha256,
  verifyComputeAudit,
};
