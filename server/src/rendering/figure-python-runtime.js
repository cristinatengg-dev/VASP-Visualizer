const path = require('path');
const { spawn } = require('child_process');

function getDefaultFigurePythonExecutable() {
  return process.env.FIGURE_PYTHON_BIN
    || process.env.MODELING_PYTHON_BIN
    || process.env.COMPUTE_PYTHON_BIN
    || 'python3';
}

function parseFigureWorkerOutput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    throw new Error('Figure worker returned empty output');
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const jsonText = firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text;

  const parsed = JSON.parse(jsonText);
  if (!parsed || parsed.success !== true) {
    throw new Error(parsed?.error || 'Figure worker did not return a successful result');
  }
  return parsed;
}

function normalizeFigureWorkerError(stderr, code) {
  const raw = String(stderr || '').trim();
  if (!raw) {
    return `Figure worker exited with code ${code}`;
  }
  if (raw.includes('No module named')) {
    return `Figure worker dependency missing: ${raw}`;
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

async function runFigureWorker(payload) {
  const workerPath = path.join(__dirname, '../../agents/figure/render_figure.py');
  const pythonExecutable = getDefaultFigurePythonExecutable();

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonExecutable, [workerPath], {
      env: {
        ...process.env,
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    pythonProcess.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Figure worker unavailable on server: ${error.message}`));
    });

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        settled = true;
        reject(new Error(normalizeFigureWorkerError(stderr, code)));
        return;
      }

      try {
        const parsed = parseFigureWorkerOutput(stdout);
        settled = true;
        resolve({
          ...parsed,
          pythonExecutable,
          rawStderr: stderr.trim() || null,
        });
      } catch (error) {
        settled = true;
        reject(error);
      }
    });

    pythonProcess.stdin.write(JSON.stringify(payload || {}));
    pythonProcess.stdin.end();
  });
}

module.exports = {
  getDefaultFigurePythonExecutable,
  parseFigureWorkerOutput,
  runFigureWorker,
};
