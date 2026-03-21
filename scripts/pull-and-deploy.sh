#!/bin/bash
set -euo pipefail

REMOTE="${1:-origin}"
BRANCH="${2:-main}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Current directory is not a git repository."
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Git remote '$REMOTE' is not configured."
  exit 1
fi

echo "Fetching ${REMOTE}/${BRANCH} ..."
git fetch "$REMOTE" "$BRANCH"

echo "Pulling ${REMOTE}/${BRANCH} ..."
git pull --ff-only "$REMOTE" "$BRANCH"

echo "Running deploy_to_tencent.sh ..."
bash ./deploy_to_tencent.sh
