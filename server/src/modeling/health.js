const { spawn } = require('child_process');
const { buildModelingProviderAvailability } = require('./provider-registry');
const { getDefaultModelingPythonExecutable } = require('./python-runtime');

function collectPythonJson(script) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = getDefaultModelingPythonExecutable();
    const pythonProcess = spawn(pythonExecutable, ['-c', script], {
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
      reject(error);
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
        reject(new Error(stderr.trim() || `python3 probe exited with code ${code}`));
        return;
      }

      try {
        settled = true;
        resolve(JSON.parse(stdout || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function getModelingEngineHealth() {
  const script = `
import json, sys
result = {
  "pythonExecutable": sys.executable,
  "pythonVersion": sys.version.split()[0],
  "numpyVersion": None,
  "pymatgenVersion": None,
  "ccdcAvailable": False,
  "healthy": False,
  "issues": []
}
try:
  import numpy as np
  result["numpyVersion"] = getattr(np, "__version__", None)
except Exception as err:
  result["issues"].append(f"numpy import failed: {err}")
try:
  import pymatgen
  result["pymatgenVersion"] = getattr(pymatgen, "__version__", None)
  if not result["pymatgenVersion"]:
    try:
      from importlib import metadata as importlib_metadata
    except Exception:
      import importlib_metadata
    result["pymatgenVersion"] = importlib_metadata.version("pymatgen")
except Exception as err:
  result["issues"].append(f"pymatgen import failed: {err}")
try:
  import ccdc
  result["ccdcAvailable"] = True
except Exception:
  result["ccdcAvailable"] = False
result["healthy"] = not result["issues"]
print(json.dumps(result))
`.trim();

  try {
    return await collectPythonJson(script);
  } catch (error) {
    return {
      pythonExecutable: null,
      pythonVersion: null,
      numpyVersion: null,
      pymatgenVersion: null,
      ccdcAvailable: false,
      healthy: false,
      issues: [error instanceof Error ? error.message : 'Failed to probe python runtime'],
    };
  }
}

async function getModelingRuntimeDiagnostics() {
  const [providers, engineHealth] = await Promise.all([
    Promise.resolve(buildModelingProviderAvailability()),
    getModelingEngineHealth(),
  ]);

  return {
    providers,
    engineHealth,
    summary: {
      configuredProviderCount: providers.filter((provider) => provider.configured).length,
      healthy: Boolean(engineHealth && engineHealth.healthy),
      issues: Array.isArray(engineHealth?.issues) ? engineHealth.issues.length : 0,
    },
  };
}

module.exports = {
  getModelingEngineHealth,
  getModelingRuntimeDiagnostics,
};
