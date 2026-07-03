#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const zlib = require('zlib');
const JSZip = require('jszip');
const { normalizeRecipeRecord } = require('../src/research-stack/recipe-index');

function printUsage() {
  console.log(`Usage:
  node server/scripts/build-ceder-recipe-index.cjs \\
    --solid /path/to/solid-state_dataset_20200713.json.xz \\
    --solgel /path/to/sol-gel_dataset_20200713.json.xz \\
    --solution /path/to/solution-synthesis_dataset_2021-8-5.json.zip \\
    --out server/data/recipe-index/ceder-recipes.jsonl.gz

Options:
  --synthesis-dir DIR   Use DIR/solid-state_dataset_20200713.json.xz and DIR/sol-gel_dataset_20200713.json.xz
  --solution-dir DIR    Use DIR/solution-synthesis_dataset_2021-8-5.json.zip
  --limit N             Keep only the first N records from each source for a small test build
`);
}

function parseArgs(argv) {
  const args = {
    out: path.join(process.cwd(), 'server/data/recipe-index/ceder-recipes.jsonl.gz'),
    limit: 0,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--help' || key === '-h') {
      args.help = true;
      continue;
    }
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = value;
    index += 1;
  }
  if (args['synthesis-dir']) {
    args.solid = args.solid || path.join(args['synthesis-dir'], 'solid-state_dataset_20200713.json.xz');
    args.solgel = args.solgel || path.join(args['synthesis-dir'], 'sol-gel_dataset_20200713.json.xz');
  }
  if (args['solution-dir']) {
    args.solution = args.solution || path.join(args['solution-dir'], 'solution-synthesis_dataset_2021-8-5.json.zip');
  }
  args.limit = Number(args.limit) || 0;
  return args;
}

function assertFile(filePath, label) {
  if (!filePath) return false;
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  return true;
}

function readJson(filePath) {
  if (filePath.endsWith('.xz')) {
    const result = spawnSync('xz', ['-dc', filePath], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `xz failed for ${filePath}`);
    return JSON.parse(result.stdout);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function readZipJson(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const firstJson = Object.values(zip.files).find((entry) => entry.name.endsWith('.json') && !entry.dir);
  if (!firstJson) throw new Error(`No JSON file found inside ${filePath}`);
  return JSON.parse(await firstJson.async('string'));
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.reactions)) return payload.reactions;
  return [];
}

function appendNormalized(records, options, output, limit) {
  const usable = limit > 0 ? records.slice(0, limit) : records;
  usable.forEach((record, index) => {
    const normalized = normalizeRecipeRecord(record, { ...options, index });
    output.push(JSON.stringify(normalized));
  });
  return usable.length;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const output = [];
  const counts = {};

  if (assertFile(args.solid, 'solid-state dataset')) {
    const payload = readJson(args.solid);
    counts.ceder_solid_state_20200713 = appendNormalized(
      recordsFromPayload(payload),
      { sourceId: 'ceder_solid_state_20200713', idPrefix: 'ceder-solid' },
      output,
      args.limit,
    );
  }

  if (assertFile(args.solgel, 'sol-gel dataset')) {
    const payload = readJson(args.solgel);
    counts.ceder_sol_gel_20200713 = appendNormalized(
      recordsFromPayload(payload),
      { sourceId: 'ceder_sol_gel_20200713', idPrefix: 'ceder-solgel' },
      output,
      args.limit,
    );
  }

  if (assertFile(args.solution, 'solution synthesis dataset')) {
    const payload = await readZipJson(args.solution);
    counts.ceder_solution_20210805 = appendNormalized(
      recordsFromPayload(payload),
      { sourceId: 'ceder_solution_20210805', idPrefix: 'ceder-solution' },
      output,
      args.limit,
    );
  }

  if (!output.length) {
    printUsage();
    throw new Error('No records were written. Provide at least one Ceder dataset path.');
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const body = `${output.join('\n')}\n`;
  if (args.out.endsWith('.gz')) {
    fs.writeFileSync(args.out, zlib.gzipSync(body, { level: 9 }));
  } else {
    fs.writeFileSync(args.out, body);
  }

  const manifestPath = path.join(path.dirname(args.out), 'ceder-recipes.manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    generated_at: new Date().toISOString(),
    output: path.resolve(args.out),
    counts,
    total: output.length,
    sources: {
      solid: args.solid || null,
      solgel: args.solgel || null,
      solution: args.solution || null,
    },
  }, null, 2)}\n`);

  console.log(`Wrote ${output.length} recipes to ${args.out}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
