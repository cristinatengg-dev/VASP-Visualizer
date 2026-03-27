'use strict';

const https = require('https');
const { proxyAgent } = require('../proxy-agent');

const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY || '';
const VOLCENGINE_BASE_URL = process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
const SEEDANCE_MODEL = process.env.SEEDANCE_MODEL || 'doubao-seedance-2-0-t2v-250312';

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function arkRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const base = new URL(VOLCENGINE_BASE_URL);
    const options = {
      hostname: base.hostname,
      port: 443,
      path: base.pathname.replace(/\/+$/, '') + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOLCENGINE_API_KEY}`,
      },
    };
    if (proxyAgent) options.agent = proxyAgent;

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Ark API ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Ark API parse error (${res.statusCode}): ${data.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Ark API timeout')); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Create video generation task ────────────────────────────────────────────

async function createVideoTask({ prompt, duration = 8, ratio = '16:9' }) {
  if (!VOLCENGINE_API_KEY) throw new Error('VOLCENGINE_API_KEY not configured');

  const body = {
    model: SEEDANCE_MODEL,
    content: [{ type: 'text', text: prompt }],
    duration,
    ratio,
    watermark: false,
  };

  const resp = await arkRequest('POST', '/contents/generations/tasks', body);
  return {
    taskId: resp.id || resp.task_id,
    status: resp.status || 'pending',
    raw: resp,
  };
}

// ─── Query task status ───────────────────────────────────────────────────────

async function getVideoTaskStatus(taskId) {
  const resp = await arkRequest('GET', `/contents/generations/tasks/${taskId}`);

  let videoUrl = null;
  if (resp.status === 'succeeded' && resp.content) {
    // content may be an array or object; extract video_url
    const content = Array.isArray(resp.content) ? resp.content : [resp.content];
    for (const item of content) {
      if (item.video_url) { videoUrl = item.video_url; break; }
      if (item.url) { videoUrl = item.url; break; }
    }
  }

  return {
    taskId,
    status: resp.status || 'unknown',
    videoUrl,
    progress: resp.progress || null,
    error: resp.error || null,
    raw: resp,
  };
}

module.exports = { createVideoTask, getVideoTaskStatus, SEEDANCE_MODEL };
