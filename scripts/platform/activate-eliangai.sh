#!/usr/bin/env bash
# Activate the approved eliangai.com filing on the existing production platform.
# Run only after ICP approval has been verified and this revision is on origin/main.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
repo=$(pwd)
revision=$(git rev-parse HEAD)
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
  echo 'Tracked server files must be clean.' >&2; exit 1
fi
if [[ "$revision" != "$(git rev-parse origin/main)" ]]; then
  echo 'Server checkout must match origin/main.' >&2; exit 1
fi
release=(docker compose -f docker-compose.yml -f docker-compose.platform.yml -f scripts/platform/ingress.compose.yml)
platform=$("${release[@]}" ps -q platform)
frontend=$("${release[@]}" ps -q frontend)
[[ -n "$platform" && -n "$frontend" ]]
previous_image=$(docker inspect "$platform" --format '{{.Config.Image}}')
frontend_image=$(docker inspect "$frontend" --format '{{.Image}}')
network=$(docker inspect "$frontend" --format '{{range $name, $config := .NetworkSettings.Networks}}{{$name}}{{end}}')
[[ -n "$network" ]]
[[ -s .config/platform-nginx.conf && -s .config/release.env ]]
grep -Fxq "ELIANGMAT_IMAGE=$previous_image" .config/release.env
docker exec "$platform" node -e 'const o = (process.env.ELIANGMAT_ORIGINS || "").split(","); for (const h of ["https://eliangai.com", "https://www.eliangai.com"]) if (!o.includes(h)) throw new Error("Missing production origin: " + h)'

export ELIANGMAT_IMAGE="eliangmat-platform:${revision:0:12}"
docker build --network=host -f Dockerfile.platform -t "$ELIANGMAT_IMAGE" .
docker run --rm --network none -v "$repo/scripts/platform:/source:ro" \
  --entrypoint node "$ELIANGMAT_IMAGE" /source/render-domain-ingress.cjs activate \
  > .config/platform-nginx.conf.next
docker run --rm --network "$network" \
  -v "$repo/.config/platform-nginx.conf.next:/etc/nginx/conf.d/default.conf:ro" \
  -v "$repo/ssl:/etc/nginx/ssl:ro" "$frontend_image" nginx -t

backup="$(dirname "$repo")/eliangmat-backups/eliangai-activation-$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:8}"
mkdir -p "$backup"
chmod 700 "$backup"
printf '%s\n' "$revision" > "$backup/revision.txt"
printf '%s\n' "$previous_image" > "$backup/previous-image.txt"
cp .config/platform-nginx.conf "$backup/nginx-before.conf"
cp .config/release.env "$backup/release-before.env"
docker inspect "$platform" "$frontend" > "$backup/containers-before.json"

preserved_hashes() {
  docker run --rm --network none -v "$repo:/source:ro" --entrypoint bash "$previous_image" -c '
    set -euo pipefail
    cd /source
    for p in server/.env server/.env.local server/db.json .config/platform.env .data/platform/auth/session.key; do
      if [ -f "$p" ]; then sha256sum "$p"; fi
    done
    find ssl -type f -print0 | sort -z | xargs -0 sha256sum
  '
}
preserved_hashes > "$backup/preserved-before.sha256"

paused=false
changed=false
restore_on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  set +e
  if [[ "$paused" == true ]]; then docker unpause "$platform" || true; fi
  if [[ "$status" != 0 && "$changed" == true ]]; then
    echo "Activation failed; restoring prior image and ingress. Backup: $backup" >&2
    export ELIANGMAT_IMAGE="$previous_image"
    "${release[@]}" up -d --no-deps --no-build platform || true
    cp "$backup/nginx-before.conf" .config/platform-nginx.conf
    cp "$backup/release-before.env" .config/release.env
    "${release[@]}" exec -T frontend nginx -t && "${release[@]}" exec -T frontend nginx -s reload || true
  fi
  exit "$status"
}
trap restore_on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Pause writes briefly to make the platform-data snapshot consistent.
paused=true
docker pause "$platform"
docker run --rm --network none -v "$repo:/source:ro" --entrypoint sh "$previous_image" -c '
  cd /source
  set -- .data/platform .config ssl server/.env
  for p in server/.env.local server/db.json; do
    if [ -f "$p" ]; then set -- "$@" "$p"; fi
  done
  tar -czf - "$@"
' > "$backup/server-local.tar.gz"
docker unpause "$platform"
paused=false
gzip -t "$backup/server-local.tar.gz"

changed=true
"${release[@]}" up -d --no-deps --no-build platform
for i in $(seq 1 30); do
  if curl --max-time 5 -fsS -H 'Host: eliangai.com' http://127.0.0.1:4320/api/health | grep -q 'eliangmat-platform'; then break; fi
  if [[ "$i" == 30 ]]; then echo 'Platform health check failed.' >&2; false; fi
  sleep 1
done
# Copy into the existing file so the live bind mount keeps the same inode.
cp .config/platform-nginx.conf.next .config/platform-nginx.conf
"${release[@]}" exec -T frontend nginx -t
"${release[@]}" exec -T frontend nginx -s reload
for domain in eliangai.com scivisualizer.com; do
  for i in $(seq 1 20); do
    if curl --max-time 5 -fsS --resolve "$domain:443:127.0.0.1" "https://$domain/api/health" | grep -q 'eliangmat-platform'; then break; fi
    if [[ "$i" == 20 ]]; then echo "HTTPS health check failed: $domain" >&2; false; fi
    sleep 1
  done
done
preserved_hashes > "$backup/preserved-after.sha256"
cmp "$backup/preserved-before.sha256" "$backup/preserved-after.sha256"
printf 'ELIANGMAT_IMAGE=%s\n' "$ELIANGMAT_IMAGE" > .config/release.env
printf '%s\n' "$backup" > .config/latest-backup
trap - EXIT HUP INT TERM
printf 'ACTIVATED_REVISION=%s\nBACKUP=%s\n' "$revision" "$backup"
"${release[@]}" ps
