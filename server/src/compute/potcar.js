const fs = require('fs');
const path = require('path');

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

  const targetPath = path.join(inputDir, 'POTCAR');
  await fs.promises.writeFile(targetPath, potcarContents.join('\n'), 'utf8');
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
    sizeBytes: stats.size,
  };
}

module.exports = {
  getConfiguredPotcarLibraryDir,
  materializePotcar,
};
