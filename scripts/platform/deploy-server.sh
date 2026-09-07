#!/usr/bin/env bash
# First platform cutover from the legacy ingress. Run after the reviewed commit is pushed.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
repo=$(pwd)
revision=$(git rev-parse HEAD)
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
  echo 'Tracked server files must be clean before deployment.' >&2; exit 1
fi
if [[ "$revision" != "$(git rev-parse origin/main)" ]]; then
  echo 'Production checkout must match origin/main.' >&2; exit 1
fi
backup="$(dirname "$repo")/eliangmat-backups/$(date -u +%Y%m%dT%H%M%SZ)-${revision:0:8}"
mkdir -p "$backup" .config .data/platform
chmod 700 "$backup" .config .data .data/platform
printf '%s\n' "$revision" > "$backup/revision.txt"
legacy=(docker compose -f docker-compose.yml)
release=(docker compose -f docker-compose.yml -f docker-compose.platform.yml -f scripts/platform/ingress.compose.yml)

# Refuse to use the first-cutover rollback for an already-live platform ingress.
if docker inspect "$("${legacy[@]}" ps -q frontend)" --format '{{json .Mounts}}' | grep -q 'platform-nginx.conf'; then
  echo 'Platform ingress is already live; use a revision-aware update workflow.' >&2; exit 1
fi

# Record exact old image/config state, with secrets kept only in this private backup.
docker inspect "$("${legacy[@]}" ps -q frontend)" > "$backup/frontend-container.json"
"${legacy[@]}" exec -T frontend cat /etc/nginx/conf.d/default.conf > "$backup/nginx-before.conf"
files=(server/.env ssl server/user-data server/uploads)
[[ ! -f server/.env.local ]] || files+=(server/.env.local)
[[ ! -f server/db.json ]] || files+=(server/db.json)
[[ ! -d .config ]] || files+=(.config)
tar -czf "$backup/server-local.tar.gz" "${files[@]}"
"${legacy[@]}" exec -T mongo mongodump --archive --gzip > "$backup/mongo.archive.gz" 2> "$backup/mongo-dump.log"
"${legacy[@]}" exec -T backend tar -czf - /app/runtime-storage > "$backup/runtime-storage.tar.gz" 2> "$backup/runtime-tar.log"
if [[ -d .data/platform/auth ]]; then
  echo 'Existing platform data must be backed up before first cutover.' >&2; exit 1
fi
sha256sum server/.env ssl/scivisualizer.com.crt ssl/scivisualizer.com.key > "$backup/preserved.sha256"
if [[ ! -s .config/platform.env ]]; then
  "${legacy[@]}" exec -T backend node - < scripts/platform/import-existing-config.cjs > .config/platform.env.tmp
  chmod 600 .config/platform.env.tmp
  mv .config/platform.env.tmp .config/platform.env
fi
export ELIANGMAT_IMAGE="eliangmat-platform:${revision:0:12}"
docker build --network=host -f Dockerfile.platform -t "$ELIANGMAT_IMAGE" .
"${release[@]}" up -d --no-deps --no-build platform
for i in $(seq 1 30); do
  if curl -fsS -H 'Host: scivisualizer.com' http://127.0.0.1:4320/api/health | grep -q 'eliangmat-platform'; then break; fi
  if [[ $i == 30 ]]; then echo 'New platform failed pre-cutover health check' >&2; exit 1; fi
  sleep 1
done
cp scripts/platform/nginx.conf .config/platform-nginx.conf.next
mv .config/platform-nginx.conf.next .config/platform-nginx.conf
"${release[@]}" run --rm --no-deps frontend nginx -t

# On the first release, rollback restores the unchanged legacy image/config.
cat > "$backup/rollback.sh" <<ROLLBACK
#!/usr/bin/env bash
set -euo pipefail
cd '$repo'
docker compose -f docker-compose.yml up -d --no-deps --no-build --force-recreate frontend
ROLLBACK
chmod 700 "$backup/rollback.sh"
cutover=false
rollback_on_error() {
  local status=$?
  if [[ "$cutover" == true ]]; then
    echo "Cutover verification failed; restoring the previous ingress. Backup: $backup" >&2
    bash "$backup/rollback.sh"
  fi
  exit "$status"
}
trap rollback_on_error ERR
cutover=true
"${release[@]}" up -d --no-deps --no-build --force-recreate frontend
for i in $(seq 1 20); do
  if curl -fsS --resolve scivisualizer.com:443:127.0.0.1 https://scivisualizer.com/api/health | grep -q 'eliangmat-platform'; then break; fi
  if [[ $i == 20 ]]; then echo 'HTTPS cutover health check failed' >&2; false; fi
  sleep 1
done
sha256sum -c "$backup/preserved.sha256"
printf 'ELIANGMAT_IMAGE=%s\n' "$ELIANGMAT_IMAGE" > .config/release.env
printf '%s\n' "$backup" > .config/latest-backup
trap - ERR
printf 'DEPLOYED_REVISION=%s\nBACKUP=%s\n' "$revision" "$backup"
"${release[@]}" ps
