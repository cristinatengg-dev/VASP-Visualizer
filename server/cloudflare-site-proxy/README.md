# Cloudflare Site Proxy

This worker provides a temporary full-site fallback entrypoint for SCI Visualizer.

Use it when `scivisualizer.com` is blocked on some networks but the new origin server at `118.25.15.120` is healthy.

## Deploy

```bash
cd /Users/a1234/VASP-Visualizer/server/cloudflare-site-proxy
npx wrangler deploy
```

After deploy, Cloudflare will return a URL like:

```text
https://scivisualizer-site-proxy.<your-subdomain>.workers.dev
```

## How it works

- Cloudflare terminates TLS on the `workers.dev` hostname.
- The worker forwards all requests to `http://118.25.15.120`.
- Relative frontend asset paths and `/api` requests continue to work without changing the app code.

## Optional configuration

You can change the upstream origin in `wrangler.toml`:

```toml
[vars]
ORIGIN_BASE_URL = "http://118.25.15.120"
```

If your origin later requires a specific `Host` header, uncomment:

```toml
# UPSTREAM_HOST_HEADER = "scivisualizer.com"
```

## Notes

- This is a practical fallback, not the final long-term domain strategy.
- The durable fix for the Shanghai Tencent origin is completing Tencent Cloud access filing for `scivisualizer.com`.
