const fs = require('fs');
const path = require('path');

function getDefaultCatalystPythonExecutable() {
  const configured = String(process.env.CATALYST_PYTHON_EXECUTABLE || '').trim();
  if (configured) {
    return configured;
  }

  // Check for bundled venv
  const bundledVenvPython = path.resolve(__dirname, '../../.venv-catalyst/bin/python');
  if (fs.existsSync(bundledVenvPython)) {
    return bundledVenvPython;
  }

  // Fall back to modeling venv (same pymatgen/ase/rdkit deps)
  const modelingVenvPython = path.resolve(__dirname, '../../.venv-modeling/bin/python');
  if (fs.existsSync(modelingVenvPython)) {
    return modelingVenvPython;
  }

  return 'python3';
}

module.exports = {
  getDefaultCatalystPythonExecutable,
};
