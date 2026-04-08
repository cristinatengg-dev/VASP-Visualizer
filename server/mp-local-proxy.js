/**
 * Local MP API Proxy
 *
 * Runs on your Mac, forwards requests to api.materialsproject.org.
 * The Tencent Cloud server accesses this via SSH reverse tunnel.
 *
 * Usage:
 *   node mp-local-proxy.js [PORT]
 *   Default port: 3456
 */

const http = require('http');
const https = require('https');

const PORT = parseInt(process.argv[2] || '3456', 10);
const MP_ORIGIN = 'https://api.materialsproject.org';

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only GET supported' }));
    return;
  }

  const targetUrl = MP_ORIGIN + req.url;

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'X-API-KEY header required' }));
    return;
  }

  console.log(`[${new Date().toISOString()}] Proxying: ${req.url}`);

  const upstream = new URL(targetUrl);
  const proxyReq = https.get({
    hostname: upstream.hostname,
    path: upstream.pathname + upstream.search,
    headers: {
      'X-API-KEY': apiKey,
      'Accept': 'application/json',
      'User-Agent': 'MP-LocalProxy/1.0',
    },
    timeout: 30000,
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Upstream timeout' }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MP Local Proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`Forwarding to ${MP_ORIGIN}`);
  console.log('');
  console.log('Next step: open SSH reverse tunnel from this Mac to your server:');
  console.log(`  ssh -R ${PORT}:127.0.0.1:${PORT} your-user@your-server-ip`);
  console.log('');
  console.log(`Then set on server: MP_PROXY_URL=http://127.0.0.1:${PORT}`);
});
