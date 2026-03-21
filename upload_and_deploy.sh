#!/bin/bash
set -euo pipefail

if [[ -f "${DEPLOY_ENV_FILE:-deploy.env}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${DEPLOY_ENV_FILE:-deploy.env}"
  set +a
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  echo "Usage: $0"
  echo "Env: DEPLOY_ENV_FILE(deploy.env) DEPLOY_HOST(43.154.165.254) DEPLOY_PORT(2222) DEPLOY_USER(deploy) DEPLOY_KEY(~/.ssh/vasp_deploy) DEPLOY_DIR(/home/deploy/VASP-Visualizer) HEALTH_URL(http://localhost/api/health)"
  exit 0
fi

DEPLOY_HOST="${DEPLOY_HOST:-43.154.165.254}"
DEPLOY_PORT="${DEPLOY_PORT:-2222}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/vasp_deploy}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/deploy/VASP-Visualizer}"
HEALTH_URL="${HEALTH_URL:-http://localhost/api/health}"

SSH_OPTS=(
  -i "$DEPLOY_KEY"
  -p "$DEPLOY_PORT"
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
)

if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "Missing DEPLOY_KEY: $DEPLOY_KEY"
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "Missing rsync on local machine"
  exit 1
fi

echo "Uploading code to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT} -> ${DEPLOY_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  -e "ssh ${SSH_OPTS[*]}" \
  ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}/"

echo "Building images + restarting containers"
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "set -e; cd '${DEPLOY_DIR}'; docker build -t vasp-visualizer-backend ./server; docker build -t vasp-visualizer-frontend .; docker compose down; docker compose up -d --no-build --force-recreate --remove-orphans"

echo "Waiting for health: ${HEALTH_URL}"
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "set -e; for i in \$(seq 1 30); do code=\$(curl -s -o /dev/null -w '%{http_code}' '${HEALTH_URL}' || true); echo \"try \${i}: \${code}\"; if [ \"\${code}\" = \"200\" ]; then exit 0; fi; sleep 2; done; exit 1"

echo "Deploy success"
