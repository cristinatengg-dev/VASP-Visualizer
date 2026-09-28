#!/usr/bin/env node
// Render separately from the live configuration; validate with nginx -t before installing.
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2];
if (!['prepare', 'secure-prepare', 'activate'].includes(mode)) {
  throw new Error('Usage: node scripts/platform/render-domain-ingress.cjs prepare|secure-prepare|activate');
}
const legacy = fs.readFileSync(path.join(__dirname, 'nginx.conf'), 'utf8');
const start = legacy.indexOf('server {\n    listen 443 ssl;');
if (start < 0) throw new Error('Legacy HTTPS template was not found');
const certificate = '/etc/nginx/ssl/eliangai.com/fullchain.pem';
const key = '/etc/nginx/ssl/eliangai.com/privkey.pem';
const https = legacy.slice(start)
  .replace('server_name scivisualizer.com www.scivisualizer.com;', 'server_name eliangai.com;')
  .replace('/etc/nginx/ssl/scivisualizer.com.crt', certificate)
  .replace('/etc/nginx/ssl/scivisualizer.com.key', key);
const http = `
server {
    listen 80;
    server_name eliangai.com www.eliangai.com;
    location ^~ /.well-known/acme-challenge/ {
        root /etc/nginx/ssl/acme-webroot;
        default_type text/plain;
        try_files $uri =404;
    }
    location / {
        ${mode === 'activate' ? 'return 308 https://eliangai.com$request_uri;' : 'return 503;'}
    }
}
`;
const alias = `
server {
    listen 443 ssl;
    server_name www.eliangai.com;
    ssl_certificate ${certificate};
    ssl_certificate_key ${key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    return 308 https://eliangai.com$request_uri;
}
`;
const secureHold = `
server {
    listen 443 ssl;
    server_name eliangai.com www.eliangai.com;
    ssl_certificate ${certificate};
    ssl_certificate_key ${key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    add_header Retry-After 86400 always;
    return 503;
}
`;
const tls = mode === 'activate'
  ? '\n' + https + alias
  : mode === 'secure-prepare'
    ? secureHold
    : '';
process.stdout.write(legacy + http + tls);
