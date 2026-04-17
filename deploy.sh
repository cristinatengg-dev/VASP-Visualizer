#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# SCI Visualizer — One-command deploy
#
# Flow: local commit → git push → server git pull → docker build → restart
#
# Usage:
#   bash deploy.sh              # push + deploy
#   bash deploy.sh --no-push    # deploy only (code already pushed)
# ─────────────────────────────────────────────────────────────────────────────

DEPLOY_HOST="43.154.165.254"
DEPLOY_PORT="2222"
DEPLOY_USER="deploy"
DEPLOY_KEY="$HOME/.ssh/vasp_deploy"
DEPLOY_DIR="/home/deploy/VASP-Visualizer"

SSH_OPTS=(-i "$DEPLOY_KEY" -p "$DEPLOY_PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
SKIP_PUSH=false

if [[ "${1:-}" == "--no-push" ]]; then
  SKIP_PUSH=true
fi

# ── Pre-flight checks ───────────────────────────────────────────────────────

if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "ERROR: SSH key not found: $DEPLOY_KEY"
  exit 1
fi

if ! git rev-parse --git-dir &>/dev/null; then
  echo "ERROR: not a git repository"
  exit 1
fi

# ── Step 1: Push to GitHub ───────────────────────────────────────────────────

if [[ "$SKIP_PUSH" == false ]]; then
  echo "── Step 1/4: Pushing to GitHub..."
  git push origin main
  echo "   Done."
else
  echo "── Step 1/4: Skipped (--no-push)"
fi

# ── Step 2: Pull on server ───────────────────────────────────────────────────

echo "── Step 2/4: Pulling on server..."
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "cd '${DEPLOY_DIR}' && git pull origin main"
echo "   Done."

# ── Step 3: Build Docker images ──────────────────────────────────────────────

echo "── Step 3/4: Building Docker images..."
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "cd '${DEPLOY_DIR}' && docker build -t vasp-visualizer-backend ./server && docker build -t vasp-visualizer-frontend ."
echo "   Done."

# ── Step 4: Restart containers ───────────────────────────────────────────────

echo "── Step 4/4: Restarting containers..."
ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "cd '${DEPLOY_DIR}' && docker compose down && docker compose up -d --no-build --force-recreate --remove-orphans"
echo "   Done."

# ── Health check ─────────────────────────────────────────────────────────────

echo "── Health check..."
HEALTH_OK=false
for i in $(seq 1 20); do
  CODE=$(ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" \
    "curl -sk -o /dev/null -w '%{http_code}' https://localhost/api/health 2>/dev/null || echo 000")
  echo "   try ${i}: ${CODE}"
  if [[ "$CODE" == "200" ]]; then
    HEALTH_OK=true
    break
  fi
  sleep 3
done

if [[ "$HEALTH_OK" == true ]]; then
  echo ""
  echo "Deploy successful."
else
  echo ""
  echo "WARNING: Health check did not return 200. Check server logs:"
  echo "  ssh ${SSH_OPTS[*]} ${DEPLOY_USER}@${DEPLOY_HOST} 'docker compose -f ${DEPLOY_DIR}/docker-compose.yml logs --tail=50'"
  exit 1
fi
