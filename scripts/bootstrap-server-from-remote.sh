#!/bin/bash
set -euo pipefail

REPO_URL="${1:-}"
TARGET_DIR="${2:-/home/deploy/VASP-Visualizer}"
BRANCH="${3:-main}"

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: $0 <repo-url> [target-dir] [branch]"
  exit 1
fi

PARENT_DIR="$(dirname "$TARGET_DIR")"
BASE_NAME="$(basename "$TARGET_DIR")"
BACKUP_DIR="${TARGET_DIR}.backup.$(date +%Y%m%d%H%M%S)"

mkdir -p "$PARENT_DIR"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Backing up existing directory to $BACKUP_DIR"
  mv "$TARGET_DIR" "$BACKUP_DIR"
fi

echo "Cloning $REPO_URL -> $TARGET_DIR"
git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"

if [[ -d "$BACKUP_DIR" ]]; then
  echo "Restoring local deployment files from backup"
  mkdir -p "$TARGET_DIR/server" "$TARGET_DIR/ssl"
  [[ -f "$BACKUP_DIR/server/.env" ]] && cp "$BACKUP_DIR/server/.env" "$TARGET_DIR/server/.env"
  [[ -f "$BACKUP_DIR/server/.env.local" ]] && cp "$BACKUP_DIR/server/.env.local" "$TARGET_DIR/server/.env.local"
  [[ -f "$BACKUP_DIR/server/db.json" ]] && cp "$BACKUP_DIR/server/db.json" "$TARGET_DIR/server/db.json"
  if [[ -d "$BACKUP_DIR/ssl" ]]; then
    cp -R "$BACKUP_DIR/ssl/." "$TARGET_DIR/ssl/"
  fi
fi

cd "$TARGET_DIR"
echo "Running deploy_to_tencent.sh"
bash ./deploy_to_tencent.sh
