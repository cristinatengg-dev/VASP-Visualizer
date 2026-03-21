const path = require('path');
const { spawn } = require('child_process');
const { normalizeModelingIntent } = require('./parse-intent');
const { getDefaultModelingPythonExecutable } = require('./python-runtime');

function mapIntentForBuilder(intent) {
  const normalized = normalizeModelingIntent(intent);
  const mapped = {
    ...normalized,
    provider_preferences: normalized.provider_preferences,
  };

  if (mapped.task_type === 'crystal') {
    mapped.task_type = 'bulk';
    if (mapped.substrate?.material && !mapped.material) {
      mapped.material = mapped.substrate.material;
    }
    if (mapped.substrate?.supercell && !mapped.supercell) {
      mapped.supercell = mapped.substrate.supercell;
    }
  }

  if (mapped.initial_structure && typeof mapped.initial_structure === 'object') {
    mapped.initial_structure = {
      ...mapped.initial_structure,
      atoms: Array.isArray(mapped.initial_structure.atoms) ? mapped.initial_structure.atoms : [],
      latticeVectors: Array.isArray(mapped.initial_structure.latticeVectors)
        ? mapped.initial_structure.latticeVectors
        : [],
    };
  }

  return mapped;
}

function parseBuilderOutput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    throw new Error('Modeling builder returned empty output');
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const jsonText = firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text;

  const parsed = JSON.parse(jsonText);
  if (!parsed || parsed.success !== true || !parsed.data) {
    throw new Error(parsed?.error || 'Modeling builder did not return a successful result');
  }
  return parsed;
}

function normalizeBuilderError(stderr, code) {
  const raw = String(stderr || '').trim();
  if (!raw) {
    return `Modeling builder exited with code ${code}`;
  }
  if (raw.includes('numpy.dtype size changed')) {
    return 'Modeling engine environment is broken: pymatgen and numpy are binary-incompatible on the server. Reinstall matching versions before using modeling build.';
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

async function buildModelingStructure({ intent } = {}) {
  const mappedIntent = mapIntentForBuilder(intent || {});
  const builderPath = path.join(__dirname, '../../agents/modeling/builder.py');
  const pythonExecutable = getDefaultModelingPythonExecutable();

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonExecutable, [builderPath], {
      env: {
        ...process.env,
        MP_API_KEY: process.env.MP_API_KEY,
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
      reject(new Error(`Modeling engine unavailable on server: ${error.message}`));
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
        reject(new Error(normalizeBuilderError(stderr, code)));
        return;
      }

      try {
        const parsed = parseBuilderOutput(stdout);
        settled = true;
        resolve({
          ...parsed,
          normalizedIntent: mappedIntent,
          pythonExecutable,
          rawStderr: stderr.trim() || null,
        });
      } catch (error) {
        settled = true;
        reject(error);
      }
    });

    pythonProcess.stdin.write(JSON.stringify(mappedIntent));
    pythonProcess.stdin.end();
  });
}

module.exports = {
  buildModelingStructure,
  mapIntentForBuilder,
  parseBuilderOutput,
};
