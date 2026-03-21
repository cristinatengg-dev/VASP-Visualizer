const fs = require('fs');
const path = require('path');

function getDefaultModelingPythonExecutable() {
  const configured = String(process.env.MODELING_PYTHON_EXECUTABLE || '').trim();
  if (configured) {
    return configured;
  }

  const bundledVenvPython = path.resolve(__dirname, '../../.venv-modeling/bin/python');
  if (fs.existsSync(bundledVenvPython)) {
    return bundledVenvPython;
  }

  return 'python3';
}

module.exports = {
  getDefaultModelingPythonExecutable,
};
