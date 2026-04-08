/**
 * Cloudflare Worker: full-site reverse proxy for SCI Visualizer.
 *
 * Use this as a temporary fallback entrypoint when the primary domain
 * is blocked on some networks. The worker terminates TLS at Cloudflare
 * and forwards requests to the known-good origin.
 *
 * Deploy:
 *   cd server/cloudflare-site-proxy
 *   npx wrangler deploy
 *
 * Default URL after deploy:
 *   https://scivisualizer-site-proxy.<your-subdomain>.workers.dev
 */

const DEFAULT_ORIGIN_BASE_URL = 'http://43.154.165.254';

export default {
  async fetch(request, env) {
    const originBaseUrl = normalizeBaseUrl(env.ORIGIN_BASE_URL || DEFAULT_ORIGIN_BASE_URL);
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, originBaseUrl);
    const headers = buildUpstreamHeaders(request, incomingUrl, env);

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: requestCanHaveBody(request.method) ? request.body : undefined,
        redirect: 'manual',
      });

      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set('x-proxied-by', 'scivisualizer-site-proxy');

      const location = responseHeaders.get('location');
      if (location) {
        responseHeaders.set('location', rewriteLocation(location, incomingUrl, originBaseUrl));
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return jsonError(502, 'Origin fetch failed', {
        message: error instanceof Error ? error.message : String(error),
        originBaseUrl,
      });
    }
  },
};

function buildUpstreamHeaders(request, incomingUrl, env) {
  const headers = new Headers(request.headers);

  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('x-forwarded-for');

  if (env.UPSTREAM_HOST_HEADER) {
    headers.set('host', env.UPSTREAM_HOST_HEADER);
  }

  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) {
    headers.set('x-forwarded-for', clientIp);
  }

  return headers;
}

function requestCanHaveBody(method) {
  const normalized = String(method || '').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD';
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_ORIGIN_BASE_URL).replace(/\/+$/, '/') ;
}

function rewriteLocation(location, incomingUrl, originBaseUrl) {
  try {
    const absoluteLocation = new URL(location, originBaseUrl);
    const origin = new URL(originBaseUrl);

    if (absoluteLocation.host === origin.host) {
      absoluteLocation.protocol = incomingUrl.protocol;
      absoluteLocation.host = incomingUrl.host;
    }

    return absoluteLocation.toString();
  } catch {
    return location;
  }
}

function jsonError(status, error, details) {
  return new Response(
    JSON.stringify(
      {
        error,
        details,
      },
      null,
      2
    ),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    }
  );
}
