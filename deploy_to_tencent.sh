#!/bin/bash
set -euo pipefail

echo "Starting Deployment..."

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing docker"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Missing docker compose plugin"
  exit 1
fi

docker build -t vasp-visualizer-backend ./server
docker build -t vasp-visualizer-frontend .

docker compose down || true
docker compose up -d --no-build --force-recreate --remove-orphans

sleep 2
docker compose ps

echo "Deployment Complete"
