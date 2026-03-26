'use strict';

const http = require('http');
const https = require('https');
const tls = require('tls');

const PROXY_URL =
  process.env.HTTPS_PROXY || process.env.https_proxy ||
  process.env.HTTP_PROXY  || process.env.http_proxy  || '';

let proxyAgent = null;

if (PROXY_URL) {
  const parsed = new URL(PROXY_URL);

  proxyAgent = new (class extends https.Agent {
    createConnection(options, callback) {
      const connectReq = http.request({
        host: parsed.hostname,
        port: parsed.port || 7897,
        method: 'CONNECT',
        path: `${options.host}:${options.port || 443}`,
      });

      connectReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          callback(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
          return;
        }
        const tlsSocket = tls.connect({ socket, servername: options.host });
        callback(null, tlsSocket);
      });

      connectReq.on('error', callback);
      connectReq.end();
    }
  })();

  console.log(`[proxy-agent] Using proxy: ${parsed.hostname}:${parsed.port}`);
}

module.exports = { proxyAgent };
