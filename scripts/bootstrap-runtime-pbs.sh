#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/deploy/VASP-Visualizer}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/server/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.yml}"
TARGET_KEY_PATH="${TARGET_KEY_PATH:-/root/.ssh/mgr2-ateng-id_rsa}"

RUNTIME_MONGODB_URI="${RUNTIME_MONGODB_URI:-mongodb://mongo:27017/vasp_visualizer}"
HPC_SSH_HOST="${HPC_SSH_HOST:-10.191.2.25}"
HPC_SSH_PORT="${HPC_SSH_PORT:-23027}"
HPC_SSH_USER="${HPC_SSH_USER:-ateng}"
HPC_REMOTE_BASE_DIR="${HPC_REMOTE_BASE_DIR:-/home/ateng/runtime-jobs}"
HPC_REMOTE_POTCAR_DIR="${HPC_REMOTE_POTCAR_DIR:-/home/ateng/tool/potcarPBE}"
HPC_REMOTE_SHELL="${HPC_REMOTE_SHELL:-/bin/bash}"
HPC_PBS_QUEUE="${HPC_PBS_QUEUE:-batch}"
HPC_EXECUTABLE="${HPC_EXECUTABLE:-/software/vasp6.3.0/vasp.6.3.0/bin/vasp_std}"
HPC_NODES="${HPC_NODES:-1}"
HPC_TASKS_PER_NODE="${HPC_TASKS_PER_NODE:-96}"
HPC_WALLTIME="${HPC_WALLTIME:-1000:00:00}"

log() {
  printf '\n== %s ==\n' "$1"
}

warn() {
  printf '[WARN] %s\n' "$1"
}

die() {
  printf '[ERROR] %s\n' "$1" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || die "Missing required file: $file"
}

find_existing_key() {
  local target="$1"
  local candidates=(
    "${HOST_KEY_SOURCE:-}"
    "/root/.ssh/mgr2-ateng-id_rsa"
    "/home/deploy/.ssh/mgr2-ateng-id_rsa"
    "/root/.ssh/id_rsa"
    "/home/deploy/.ssh/id_rsa"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -n "$candidate" && -f "$candidate" ]]; then
      if [[ "$candidate" != "$target" ]]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    fi
  done

  find /root /home -maxdepth 4 -type f -name 'mgr2-ateng-id_rsa' 2>/dev/null | head -n 1 || true
}

ensure_env_kv() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    python3 - "$file" "$key" "$value" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
lines = path.read_text().splitlines()
updated = []
replaced = False
for line in lines:
    if line.startswith(key + "="):
        updated.append(f"{key}={value}")
        replaced = True
    else:
        updated.append(line)
if not replaced:
    updated.append(f"{key}={value}")
path.write_text("\n".join(updated) + "\n")
PY
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

ensure_compose_key_mount() {
  local compose_file="$1"
  local mount_line="      - ${TARGET_KEY_PATH}:${TARGET_KEY_PATH}:ro"
  if grep -Fq "$mount_line" "$compose_file"; then
    return 0
  fi

  python3 - "$compose_file" "$mount_line" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
mount_line = sys.argv[2]
lines = path.read_text().splitlines()
result = []
inside_backend = False
inside_volumes = False
inserted = False
backend_indent = None
volumes_indent = None

for i, line in enumerate(lines):
    stripped = line.strip()
    indent = len(line) - len(line.lstrip(' '))

    if stripped == 'backend:':
        inside_backend = True
        backend_indent = indent
    elif inside_backend and stripped.endswith(':') and indent <= backend_indent and stripped != 'backend:':
        inside_backend = False
        inside_volumes = False
    if inside_backend and stripped == 'volumes:':
        inside_volumes = True
        volumes_indent = indent
    elif inside_volumes and indent <= volumes_indent and stripped and stripped != 'volumes:':
        result.append(mount_line)
        inserted = True
        inside_volumes = False

    result.append(line)

if inside_volumes and not inserted:
    result.append(mount_line)
    inserted = True

if not inserted:
    raise SystemExit('Could not locate backend.volumes in docker-compose.yml')

path.write_text("\n".join(result) + "\n")
PY
}

log "1) Validate project files"
require_file "$COMPOSE_FILE"
mkdir -p "$(dirname "$ENV_FILE")"
touch "$ENV_FILE"

log "2) Ensure runtime/PBS envs are present"
ensure_env_kv "$ENV_FILE" "ENABLE_AGENT_RUNTIME_DEMO" "1"
ensure_env_kv "$ENV_FILE" "ENABLE_AGENT_RUNTIME_WORKERS" "1"
ensure_env_kv "$ENV_FILE" "RUNTIME_MONGODB_URI" "$RUNTIME_MONGODB_URI"
ensure_env_kv "$ENV_FILE" "HPC_SSH_HOST" "$HPC_SSH_HOST"
ensure_env_kv "$ENV_FILE" "HPC_SSH_PORT" "$HPC_SSH_PORT"
ensure_env_kv "$ENV_FILE" "HPC_SSH_USER" "$HPC_SSH_USER"
ensure_env_kv "$ENV_FILE" "HPC_SSH_KEY_PATH" "$TARGET_KEY_PATH"
ensure_env_kv "$ENV_FILE" "HPC_REMOTE_BASE_DIR" "$HPC_REMOTE_BASE_DIR"
ensure_env_kv "$ENV_FILE" "HPC_REMOTE_POTCAR_DIR" "$HPC_REMOTE_POTCAR_DIR"
ensure_env_kv "$ENV_FILE" "HPC_REMOTE_SHELL" "$HPC_REMOTE_SHELL"
ensure_env_kv "$ENV_FILE" "HPC_PBS_QUEUE" "$HPC_PBS_QUEUE"
ensure_env_kv "$ENV_FILE" "HPC_EXECUTABLE" "$HPC_EXECUTABLE"
ensure_env_kv "$ENV_FILE" "HPC_NODES" "$HPC_NODES"
ensure_env_kv "$ENV_FILE" "HPC_TASKS_PER_NODE" "$HPC_TASKS_PER_NODE"
ensure_env_kv "$ENV_FILE" "HPC_WALLTIME" "$HPC_WALLTIME"

log "3) Fix host SSH key path if needed"
mkdir -p /root/.ssh
if [[ -d "$TARGET_KEY_PATH" ]]; then
  warn "$TARGET_KEY_PATH is a directory; moving it aside"
  mv "$TARGET_KEY_PATH" "${TARGET_KEY_PATH}.bad.$(date +%s)"
fi

if [[ ! -f "$TARGET_KEY_PATH" ]]; then
  SOURCE_KEY="$(find_existing_key "$TARGET_KEY_PATH")"
  if [[ -n "${SOURCE_KEY:-}" && -f "$SOURCE_KEY" ]]; then
    cp "$SOURCE_KEY" "$TARGET_KEY_PATH"
  else
    die "No SSH private key file was found on this server. Put the key at $TARGET_KEY_PATH or set HOST_KEY_SOURCE=/real/key/path and rerun."
  fi
fi
chmod 600 "$TARGET_KEY_PATH"

log "4) Ensure backend mounts the key"
ensure_compose_key_mount "$COMPOSE_FILE"

log "5) Rebuild + recreate backend"
cd "$PROJECT_DIR"
docker compose build backend
docker compose up -d --force-recreate backend

log "6) Verify backend runtime env"
docker compose exec backend /bin/sh -lc 'grep -E "RUNTIME_MONGODB_URI|HPC_" /app/.env || true'

log "7) Verify ssh/scp and mounted key"
docker compose exec backend /bin/sh -lc 'which ssh && which scp'
docker compose exec backend /bin/sh -lc "ls -l ${TARGET_KEY_PATH} && file ${TARGET_KEY_PATH}"

log "8) Verify SSH to compute host"
docker compose exec backend /bin/sh -lc "ssh -i ${TARGET_KEY_PATH} -p ${HPC_SSH_PORT} -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${HPC_SSH_USER}@${HPC_SSH_HOST} 'echo ok'"

log "Done"
printf 'Backend runtime env, SSH client, key mount, and compute-host SSH are ready.\n'
