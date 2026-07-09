#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const DEFAULT_BENCHMARK = path.join(process.cwd(), 'server/benchmarks/vasp-visualizer-27b.json');
const DEFAULT_BASE_URL = process.env.TEXT_LLM_BASE_URL || 'http://127.0.0.1:18001/v1';
const DEFAULT_MODELS = process.env.BENCHMARK_LLM_MODELS || process.env.TEXT_LLM_MODEL || 'vasp-visualizer-27b-sft-v2';

function printUsage() {
  console.log(`Usage:
  node server/scripts/benchmark-llm.cjs [options]

Options:
  --base-url URL       OpenAI-compatible API base URL. Default: ${DEFAULT_BASE_URL}
  --models A,B         Comma-separated model ids. Default: ${DEFAULT_MODELS}
  --benchmark FILE     Benchmark JSON file. Default: ${DEFAULT_BENCHMARK}
  --out FILE           Write JSON results. Default: server/benchmark-results/<timestamp>.json
  --concurrency N      Concurrent requests per model. Default: 1
  --limit N            Run only the first N cases.
  --max-tokens N       Max completion tokens. Default: 700
  --timeout-ms N       Request timeout. Default: 180000
  --temperature N      Sampling temperature. Default: 0
  --no-json-mode       Do not send response_format=json_object.
  --help               Show this message.

Example:
  node server/scripts/benchmark-llm.cjs \\
    --base-url http://127.0.0.1:18001/v1 \\
    --models vasp-visualizer-27b-sft-v2,gemma-3-27b-it \\
    --concurrency 2
`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    benchmark: DEFAULT_BENCHMARK,
    concurrency: 1,
    jsonMode: true,
    maxTokens: 700,
    models: DEFAULT_MODELS,
    out: '',
    temperature: 0,
    timeoutMs: 180000,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--help' || key === '-h') {
      args.help = true;
      continue;
    }
    if (key === '--no-json-mode') {
      args.jsonMode = false;
      continue;
    }
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`);
    }
    const normalizedName = {
      'base-url': 'baseUrl',
      'max-tokens': 'maxTokens',
      'timeout-ms': 'timeoutMs',
    }[name] || name;
    args[normalizedName] = value;
    index += 1;
  }

  args.concurrency = Math.max(1, Number(args.concurrency) || 1);
  args.limit = Math.max(0, Number(args.limit) || 0);
  args.maxTokens = Math.max(1, Number(args.maxTokens) || 700);
  args.timeoutMs = Math.max(1000, Number(args.timeoutMs) || 180000);
  args.temperature = Number(args.temperature) || 0;
  args.models = String(args.models || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!args.models.length) throw new Error('At least one model is required.');
  return args;
}

function readBenchmark(filePath, limit) {
  const benchmark = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cases = Array.isArray(benchmark.cases) ? benchmark.cases : [];
  if (!cases.length) throw new Error(`No benchmark cases found in ${filePath}`);
  return {
    ...benchmark,
    cases: limit > 0 ? cases.slice(0, limit) : cases,
  };
}

function requestJson(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
}

function flatten(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return '';
}

function parseAssistantJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return { value: null, error: 'empty content' };
  try {
    return { value: JSON.parse(raw), error: null };
  } catch (firstError) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return { value: JSON.parse(match[0]), error: null };
      } catch (secondError) {
        return { value: null, error: secondError.message };
      }
    }
    return { value: null, error: firstError.message };
  }
}

function includesTerm(haystack, term) {
  const source = String(haystack || '').toLowerCase();
  const target = String(term || '').toLowerCase();
  return Boolean(target) && source.includes(target);
}

function scoreCase(testCase, benchmark, assistantText, assistantJson) {
  const requiredFields = testCase.required_fields || benchmark.required_fields || [];
  const text = [
    assistantText,
    flatten(assistantJson),
  ].join(' ');
  let score = 0;
  const details = {
    json_parse: Boolean(assistantJson && typeof assistantJson === 'object' && !Array.isArray(assistantJson)),
    field_coverage: 0,
    expected_formula_found: false,
    expected_term_hits: [],
    forbidden_term_hits: [],
    invented_materials: [],
  };

  if (details.json_parse) score += 2;

  const presentFields = requiredFields.filter((field) => (
    assistantJson &&
    Object.prototype.hasOwnProperty.call(assistantJson, field)
  ));
  details.field_coverage = presentFields.length;
  score += requiredFields.length
    ? Math.min(3, (presentFields.length * 3) / requiredFields.length)
    : 3;

  if (testCase.expected_formula) {
    details.expected_formula_found = includesTerm(text, testCase.expected_formula);
    if (details.expected_formula_found) score += 2;
  } else {
    score += 2;
  }

  const expectedTerms = Array.isArray(testCase.expected_terms) ? testCase.expected_terms : [];
  details.expected_term_hits = expectedTerms.filter((term) => includesTerm(text, term));
  score += expectedTerms.length
    ? Math.min(2, (details.expected_term_hits.length * 2) / expectedTerms.length)
    : 2;

  const forbiddenTerms = Array.isArray(testCase.forbidden_terms) ? testCase.forbidden_terms : [];
  details.forbidden_term_hits = forbiddenTerms.filter((term) => includesTerm(text, term));
  if (details.forbidden_term_hits.length) score -= Math.min(2, details.forbidden_term_hits.length);

  if (testCase.no_invent_material) {
    const promptText = String(testCase.prompt || '').toLowerCase();
    const knownMaterials = Array.isArray(benchmark.known_material_terms) ? benchmark.known_material_terms : [];
    details.invented_materials = knownMaterials.filter((material) => (
      includesTerm(text, material) && !promptText.includes(String(material).toLowerCase())
    ));
    if (details.invented_materials.length) score -= 3;
    else score += 1;
  } else {
    score += 1;
  }

  return {
    details,
    score: Math.max(0, Math.min(10, Number(score.toFixed(2)))),
  };
}

async function runOne({ args, benchmark, model, testCase }) {
  const payload = {
    model,
    messages: [
      { role: 'system', content: benchmark.system_prompt || 'Return only valid JSON.' },
      { role: 'user', content: testCase.prompt },
    ],
    temperature: args.temperature,
    max_tokens: args.maxTokens,
    stream: false,
  };
  if (args.jsonMode) payload.response_format = { type: 'json_object' };

  const start = process.hrtime.bigint();
  try {
    const response = await requestJson(`${args.baseUrl.replace(/\/+$/, '')}/chat/completions`, payload, args.timeoutMs);
    const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
    const assistantText = response?.choices?.[0]?.message?.content || '';
    const { value: assistantJson, error: parseError } = parseAssistantJson(assistantText);
    const scored = scoreCase(testCase, benchmark, assistantText, assistantJson);
    const usage = response.usage || {};
    const completionTokens = usage.completion_tokens || usage.output_tokens || 0;

    return {
      id: testCase.id,
      category: testCase.category || null,
      latency_sec: Number(elapsedSec.toFixed(3)),
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: completionTokens || null,
      tokens_per_sec: completionTokens ? Number((completionTokens / elapsedSec).toFixed(2)) : null,
      quality_score_10: scored.score,
      details: scored.details,
      parse_error: parseError,
      preview: assistantText.slice(0, 700),
    };
  } catch (error) {
    const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
    return {
      id: testCase.id,
      category: testCase.category || null,
      latency_sec: Number(elapsedSec.toFixed(3)),
      error: error.message,
      quality_score_10: 0,
    };
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  });
  await Promise.all(runners);
  return results;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(3)) : null;
}

function summarizeModel(model, results, wallSec) {
  const successful = results.filter((item) => !item.error);
  const jsonSuccess = successful.filter((item) => !item.parse_error);
  const latencies = successful.map((item) => item.latency_sec);
  const tokenSpeeds = successful.map((item) => item.tokens_per_sec).filter((value) => value !== null);
  const scores = results.map((item) => item.quality_score_10);
  const totalCompletionTokens = successful.reduce((sum, item) => sum + (item.completion_tokens || 0), 0);
  return {
    model,
    request_count: results.length,
    success_count: successful.length,
    json_success_count: jsonSuccess.length,
    avg_quality_score_10: average(scores),
    avg_latency_sec: average(latencies),
    max_latency_sec: latencies.length ? Math.max(...latencies) : null,
    avg_tokens_per_sec: average(tokenSpeeds),
    aggregate_completion_tokens_per_sec: wallSec > 0
      ? Number((totalCompletionTokens / wallSec).toFixed(2))
      : null,
    wall_sec: Number(wallSec.toFixed(3)),
  };
}

async function runBenchmark(args, benchmark) {
  const modelRuns = [];
  for (const model of args.models) {
    const start = process.hrtime.bigint();
    const results = await mapWithConcurrency(
      benchmark.cases,
      args.concurrency,
      (testCase) => runOne({ args, benchmark, model, testCase }),
    );
    const wallSec = Number(process.hrtime.bigint() - start) / 1e9;
    modelRuns.push({
      summary: summarizeModel(model, results, wallSec),
      results,
    });
  }
  return {
    generated_at: new Date().toISOString(),
    benchmark: {
      name: benchmark.name,
      version: benchmark.version,
      case_count: benchmark.cases.length,
    },
    settings: {
      base_url: args.baseUrl,
      concurrency: args.concurrency,
      json_mode: args.jsonMode,
      max_tokens: args.maxTokens,
      temperature: args.temperature,
      timeout_ms: args.timeoutMs,
    },
    model_runs: modelRuns,
  };
}

function defaultOutputPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), 'server/benchmark-results', `${stamp}-llm-benchmark.json`);
}

function printSummary(report) {
  console.log(`Benchmark: ${report.benchmark.name} (${report.benchmark.case_count} cases)`);
  for (const run of report.model_runs) {
    const summary = run.summary;
    console.log([
      `- ${summary.model}`,
      `score=${summary.avg_quality_score_10}/10`,
      `json=${summary.json_success_count}/${summary.request_count}`,
      `avg_latency=${summary.avg_latency_sec}s`,
      `avg_tps=${summary.avg_tokens_per_sec}`,
      `aggregate_tps=${summary.aggregate_completion_tokens_per_sec}`,
    ].join(' '));

    const weak = run.results
      .filter((item) => item.error || item.parse_error || item.quality_score_10 < 8)
      .map((item) => `${item.id}:${item.quality_score_10}${item.error ? ` error=${item.error}` : ''}${item.parse_error ? ` parse=${item.parse_error}` : ''}`);
    if (weak.length) {
      console.log(`  weak_cases: ${weak.join(', ')}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }

  const benchmark = readBenchmark(args.benchmark, args.limit);
  const report = await runBenchmark(args, benchmark);
  const out = args.out || defaultOutputPath();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(report);
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
