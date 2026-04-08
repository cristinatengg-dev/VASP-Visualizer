/**
 * Cloudflare Worker: Materials Project API Proxy
 *
 * Transparently forwards requests to api.materialsproject.org,
 * bypassing IP-based blocks (e.g., from Chinese cloud providers).
 *
 * Deploy: npx wrangler deploy
 *
 * Usage: Set MP_BASE_URL on your server to this Worker's URL,
 * e.g., https://mp-proxy.<your-subdomain>.workers.dev
 */

const MP_ORIGIN = 'https://api.materialsproject.org';

// Optional: restrict to your own API keys for security.
// Set ALLOWED_API_KEYS as a Cloudflare Worker secret (comma-separated).
// If not set, all keys are forwarded.

export default {
  async fetch(request, env) {
    // Only allow GET requests (MP summary API is GET-based)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (request.method !== 'GET') {
      return jsonError(405, 'Only GET requests are supported');
    }

    // Extract the API key from the incoming request
    const apiKey = request.headers.get('X-API-KEY');
    if (!apiKey) {
      return jsonError(401, 'X-API-KEY header is required');
    }

    // Optional: validate against allowlist
    if (env.ALLOWED_API_KEYS) {
      const allowed = env.ALLOWED_API_KEYS.split(',').map((k) => k.trim());
      if (!allowed.includes(apiKey)) {
        return jsonError(403, 'API key not in allowlist');
      }
    }

    // Build the upstream URL
    const url = new URL(request.url);
    const upstreamUrl = MP_ORIGIN + url.pathname + url.search;

    // Forward the request
    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
          'User-Agent': 'MP-Proxy/1.0',
        },
      });

      // Clone headers, add CORS
      const responseHeaders = new Headers(upstreamResponse.headers);
      for (const [k, v] of Object.entries(corsHeaders())) {
        responseHeaders.set(k, v);
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      });
    } catch (err) {
      return jsonError(502, `Upstream error: ${err.message}`);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-API-KEY, Accept, Content-Type',
  };
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}
