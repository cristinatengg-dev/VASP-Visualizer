const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

function parsePotcarMetadata(content) {
  const text = String(content || '');
  const title = text.match(/^\s*TITEL\s*=\s*(.+)$/im)?.[1]?.trim() || null;
  const enmax = Number(text.match(/^\s*ENMAX\s*=\s*([\d.]+)/im)?.[1]);
  const zval = Number(text.match(/\bZVAL\s*=\s*([\d.]+)/i)?.[1]);
  return {
    title,
    enmaxEv: Number.isFinite(enmax) ? enmax : null,
    zval: Number.isFinite(zval) ? zval : null,
    sha256: createHash('sha256').update(text).digest('hex'),
    sizeBytes: Buffer.byteLength(text, 'utf8'),
  };
}

function getConfiguredPotcarLibraryDir() {
  const configured = [
    process.env.VASP_PSP_DIR,
    process.env.VASP_POTCAR_DIR,
    process.env.POTCAR_LIBRARY_DIR,
  ]
    .map((value) => String(value || '').trim())
    .find(Boolean);

  return configured || null;
}

function buildCandidatePotcarPaths(baseDir, symbol) {
  return [
    path.join(baseDir, symbol, 'POTCAR'),
    path.join(baseDir, 'POT_GGA_PAW_PBE', symbol, 'POTCAR'),
    path.join(baseDir, 'potpaw_PBE', symbol, 'POTCAR'),
    path.join(baseDir, 'PBE', symbol, 'POTCAR'),
  ];
}

async function resolvePotcarFile(baseDir, symbol) {
  for (const candidate of buildCandidatePotcarPaths(baseDir, symbol)) {
    try {
      const stats = await fs.promises.stat(candidate);
      if (stats.isFile()) {
        return candidate;
      }
    } catch (_error) {
      // Try the next candidate.
    }
  }
  return null;
}

async function materializePotcar({
  inputDir,
  potcarSpec,
}) {
  const libraryDir = getConfiguredPotcarLibraryDir();
  if (!libraryDir) {
    return {
      configured: false,
      materialized: false,
      reason: 'potcar_library_not_configured',
      libraryDir: null,
      symbols: [],
    };
  }

  const symbols = Array.isArray(potcarSpec?.symbols)
    ? potcarSpec.symbols.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  if (symbols.length === 0) {
    return {
      configured: true,
      materialized: false,
      reason: 'potcar_symbols_missing',
      libraryDir,
      symbols: [],
    };
  }

  const resolvedFiles = [];
  const missingSymbols = [];

  for (const symbol of symbols) {
    const resolvedPath = await resolvePotcarFile(libraryDir, symbol);
    if (!resolvedPath) {
      missingSymbols.push(symbol);
      continue;
    }
    resolvedFiles.push({
      symbol,
      path: resolvedPath,
    });
  }

  if (missingSymbols.length > 0) {
    return {
      configured: true,
      materialized: false,
      reason: 'potcar_symbols_unresolved',
      libraryDir,
      symbols,
      missingSymbols,
      resolvedFiles,
    };
  }

  const potcarContents = await Promise.all(
    resolvedFiles.map((item) => fs.promises.readFile(item.path, 'utf8'))
  );

  const provenanceEntries = resolvedFiles.map((item, index) => ({
    symbol: item.symbol,
    source: path.relative(libraryDir, item.path),
    ...parsePotcarMetadata(potcarContents[index]),
  }));
  const requestedEncuts = Number(potcarSpec?.encutEv);
  const requestedNelectRaw = potcarSpec?.requestedNelect;
  const requestedNelect = requestedNelectRaw === null || requestedNelectRaw === undefined || requestedNelectRaw === ''
    ? null
    : Number(requestedNelectRaw);
  const charge = Number(potcarSpec?.charge || 0);
  const counts = Array.isArray(potcarSpec?.counts)
    ? potcarSpec.counts.map((value) => Number(value))
    : [];
  const maxEnmaxEv = provenanceEntries.reduce(
    (maximum, entry) => Number.isFinite(entry.enmaxEv) ? Math.max(maximum, entry.enmaxEv) : maximum,
    0,
  ) || null;
  const encutCompatible = !maxEnmaxEv || !Number.isFinite(requestedEncuts) || requestedEncuts >= maxEnmaxEv;
  if (!encutCompatible) {
    return {
      configured: true,
      materialized: false,
      reason: 'encut_below_potcar_enmax',
      libraryDir,
      symbols,
      missingSymbols: [],
      resolvedFiles,
      requestedEncuts,
      maxEnmaxEv,
      provenanceEntries,
    };
  }

  const canVerifyElectronCount = counts.length === provenanceEntries.length
    && counts.every((value) => Number.isFinite(value) && value > 0)
    && provenanceEntries.every((entry) => Number.isFinite(entry.zval));
  const neutralElectronCount = canVerifyElectronCount
    ? provenanceEntries.reduce((total, entry, index) => total + (entry.zval * counts[index]), 0)
    : null;
  const expectedNelect = neutralElectronCount === null || !Number.isFinite(charge)
    ? null
    : neutralElectronCount - charge;
  if (Number.isFinite(requestedNelect) && expectedNelect === null) {
    return {
      configured: true,
      materialized: false,
      reason: 'nelect_provenance_unavailable',
      libraryDir,
      symbols,
      requestedNelect,
      charge,
      counts,
      provenanceEntries,
    };
  }
  if (Number.isFinite(requestedNelect) && Math.abs(requestedNelect - expectedNelect) > 1e-6) {
    return {
      configured: true,
      materialized: false,
      reason: 'nelect_charge_mismatch',
      libraryDir,
      symbols,
      requestedNelect,
      expectedNelect,
      neutralElectronCount,
      charge,
      counts,
      provenanceEntries,
    };
  }

  const targetPath = path.join(inputDir, 'POTCAR');
  const combinedContent = potcarContents.join('\n');
  await fs.promises.writeFile(targetPath, combinedContent, 'utf8');
  const provenance = {
    schemaVersion: 'vasp-potcar-provenance/v1',
    functional: potcarSpec?.functional || null,
    family: potcarSpec?.family || null,
    symbols,
    requestedEncutEv: Number.isFinite(requestedEncuts) ? requestedEncuts : null,
    requestedNelect: Number.isFinite(requestedNelect) ? requestedNelect : null,
    neutralElectronCount,
    expectedNelect,
    charge: Number.isFinite(charge) ? charge : null,
    counts,
    maxEnmaxEv,
    recommendedEncutEv: maxEnmaxEv ? Math.ceil(maxEnmaxEv * 1.3) : null,
    combinedSha256: createHash('sha256').update(combinedContent).digest('hex'),
    entries: provenanceEntries,
  };
  const provenancePath = path.join(inputDir, 'POTCAR.provenance.json');
  await fs.promises.writeFile(provenancePath, JSON.stringify(provenance, null, 2), 'utf8');
  const stats = await fs.promises.stat(targetPath);

  return {
    configured: true,
    materialized: true,
    reason: null,
    libraryDir,
    symbols,
    missingSymbols: [],
    resolvedFiles,
    fileName: 'POTCAR',
    path: targetPath,
    provenance,
    provenancePath,
    sizeBytes: stats.size,
  };
}

module.exports = {
  getConfiguredPotcarLibraryDir,
  materializePotcar,
  parsePotcarMetadata,
};
