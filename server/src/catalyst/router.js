const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const { getDefaultCatalystPythonExecutable } = require('./python-runtime');

// ---------------------------------------------------------------------------
// Generic Python toolkit runner
// ---------------------------------------------------------------------------

function parseToolkitOutput(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    throw new Error('Catalyst toolkit returned empty output');
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const jsonText =
    firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace
      ? text.slice(firstBrace, lastBrace + 1)
      : text;

  const parsed = JSON.parse(jsonText);
  if (!parsed || parsed.success !== true || !parsed.data) {
    throw new Error(parsed?.error || 'Catalyst toolkit did not return a successful result');
  }
  return parsed;
}

function normalizeToolkitError(stderr, code) {
  const raw = String(stderr || '').trim();
  if (!raw) {
    return `Catalyst toolkit exited with code ${code}`;
  }
  if (raw.includes('numpy.dtype size changed')) {
    return 'Catalyst engine environment is broken: pymatgen and numpy are binary-incompatible on the server. Reinstall matching versions.';
  }
  const criticalLine = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('CRITICAL:'));
  if (criticalLine) return criticalLine;
  return raw;
}

/**
 * Call a tool in the catalyst Python toolkit.
 * @param {string} tool   Tool name (e.g. "build_slab")
 * @param {object} params Tool-specific parameters
 * @returns {Promise<object>} Parsed result `{ success, data }`
 */
async function runCatalystTool(tool, params = {}) {
  const toolkitPath = path.join(__dirname, '../../agents/catalyst/toolkit.py');
  const pythonExecutable = getDefaultCatalystPythonExecutable();

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonExecutable, [toolkitPath], {
      env: {
        ...process.env,
        MP_API_KEY: process.env.MP_API_KEY,
        MP_PROXY_URL: process.env.MP_PROXY_URL,
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    proc.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Catalyst engine unavailable on server: ${error.message}`));
    });

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        settled = true;
        reject(new Error(normalizeToolkitError(stderr, code)));
        return;
      }
      try {
        const parsed = parseToolkitOutput(stdout);
        settled = true;
        resolve(parsed);
      } catch (error) {
        settled = true;
        reject(error);
      }
    });

    proc.stdin.write(JSON.stringify({ tool, params }));
    proc.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Express router
// ---------------------------------------------------------------------------

function createCatalystRouter() {
  const router = express.Router();

  // List available tools
  router.get('/tools', async (_req, res) => {
    try {
      const result = await runCatalystTool(null, {});
      res.json({ success: true, tools: result.data.available_tools });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Slab construction ─────────────────────────────────────────────────
  router.post('/slab/build', async (req, res) => {
    try {
      const result = await runCatalystTool('build_slab', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/slab/build]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Molecule from SMILES ──────────────────────────────────────────────
  router.post('/molecule/from-smiles', async (req, res) => {
    try {
      const result = await runCatalystTool('create_molecule_from_smiles', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/molecule/from-smiles]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Adsorption sites ──────────────────────────────────────────────────
  router.post('/adsorption/sites', async (req, res) => {
    try {
      const result = await runCatalystTool('enumerate_adsorption_sites', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/adsorption/sites]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/adsorption/place', async (req, res) => {
    try {
      const result = await runCatalystTool('place_adsorbate', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/adsorption/place]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Supercell ─────────────────────────────────────────────────────────
  router.post('/supercell', async (req, res) => {
    try {
      const result = await runCatalystTool('make_supercell', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/supercell]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Selective dynamics ────────────────────────────────────────────────
  router.post('/selective-dynamics/by-layers', async (req, res) => {
    try {
      const result = await runCatalystTool('fix_atoms_by_layers', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/sd/by-layers]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/selective-dynamics/by-height', async (req, res) => {
    try {
      const result = await runCatalystTool('fix_atoms_by_height', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/sd/by-height]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/selective-dynamics/by-indices', async (req, res) => {
    try {
      const result = await runCatalystTool('fix_atoms_by_indices', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/sd/by-indices]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Symmetry & defects ────────────────────────────────────────────────
  router.post('/symmetry/unique-sites', async (req, res) => {
    try {
      const result = await runCatalystTool('enumerate_unique_sites', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/symmetry/unique-sites]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/defect/vacancy', async (req, res) => {
    try {
      const result = await runCatalystTool('create_vacancy', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/defect/vacancy]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/defect/substitute', async (req, res) => {
    try {
      const result = await runCatalystTool('substitute_species', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/defect/substitute]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── NEB ───────────────────────────────────────────────────────────────
  router.post('/neb/estimate', async (req, res) => {
    try {
      const result = await runCatalystTool('estimate_neb_images', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/neb/estimate]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/neb/interpolate', async (req, res) => {
    try {
      const result = await runCatalystTool('make_neb_images', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/neb/interpolate]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── VASP input preparation ────────────────────────────────────────────
  router.post('/vasp/prepare', async (req, res) => {
    try {
      const result = await runCatalystTool('prepare_vasp_inputs', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/vasp/prepare]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── K-path for band structures ────────────────────────────────────────
  router.post('/kpath', async (req, res) => {
    try {
      const result = await runCatalystTool('generate_kpath', req.body);
      res.json(result);
    } catch (err) {
      console.error('[catalyst/kpath]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Generic tool call (for advanced / batch use) ──────────────────────
  router.post('/run', async (req, res) => {
    try {
      const { tool, params } = req.body;
      if (!tool) {
        return res.status(400).json({ success: false, error: "'tool' field is required" });
      }
      const result = await runCatalystTool(tool, params || {});
      res.json(result);
    } catch (err) {
      console.error('[catalyst/run]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = { createCatalystRouter, runCatalystTool };
