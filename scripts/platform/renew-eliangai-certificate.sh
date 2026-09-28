#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

certbot_image="${CERTBOT_IMAGE:-certbot/certbot@sha256:f70ad0adbb7e117f0fe42a63c553f28ea451edabc0148757b6efcd9735acaa20}"
domain="eliangai.com"

docker run --rm \
  -v "$PWD/ssl/letsencrypt:/etc/letsencrypt" \
  -v "$PWD/ssl/acme-webroot:/var/www/acme" \
  "$certbot_image" renew \
  --webroot -w /var/www/acme --quiet "$@"

docker run --rm --entrypoint /bin/sh \
  -v "$PWD/ssl:/work" \
  -v "$PWD/ssl/letsencrypt:/etc/letsencrypt" \
  "$certbot_image" -c \
  "mkdir -p /work/$domain && \
   cp -L /etc/letsencrypt/live/$domain/fullchain.pem /work/$domain/fullchain.pem && \
   cp -L /etc/letsencrypt/live/$domain/privkey.pem /work/$domain/privkey.pem && \
   chmod 644 /work/$domain/fullchain.pem && \
   chmod 600 /work/$domain/privkey.pem"

set -a
source .config/release.env
set +a
release=(
  docker compose
  -f docker-compose.yml
  -f docker-compose.platform.yml
  -f scripts/platform/ingress.compose.yml
)
"${release[@]}" exec -T frontend nginx -t
"${release[@]}" exec -T frontend nginx -s reload
