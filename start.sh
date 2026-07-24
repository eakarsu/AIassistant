#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$project_dir/.env" ]]; then
  echo "Missing $project_dir/.env; copy .env.example and provide real values." >&2
  exit 1
fi
set -a
. "$project_dir/.env"
set +a
BACKEND_PORT="${BACKEND_PORT:?BACKEND_PORT is required}"
FRONTEND_PORT="${FRONTEND_PORT:?FRONTEND_PORT is required}"
[[ "$BACKEND_PORT" != "$FRONTEND_PORT" ]] || { echo "Backend and frontend ports must differ." >&2; exit 1; }
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY is required}"
: "${OPENROUTER_MODEL:?OPENROUTER_MODEL is required}"
[[ "${OPENROUTER_BASE_URL:-}" == "https://openrouter.ai/api/v1" ]] || { echo "OPENROUTER_BASE_URL must be https://openrouter.ai/api/v1." >&2; exit 1; }
[[ "${ALLOW_SCHEMA_MIGRATION:-}" == true ]] || { echo "ALLOW_SCHEMA_MIGRATION=true is required." >&2; exit 1; }
for dependency_dir in "$project_dir/backend/node_modules"; do
  if [[ ! -d "$dependency_dir" ]]; then
    echo "Missing $dependency_dir; install dependencies explicitly before starting." >&2
    exit 1
  fi
done
if [[ ! -d "$project_dir/frontend/node_modules" ]]; then
  echo "Missing $project_dir/frontend/node_modules; install dependencies explicitly before starting." >&2
  exit 1
fi
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $port is already in use; no process was changed." >&2; exit 1; fi
done
(cd "$project_dir/backend" && node scripts/prepare-runtime.js)

(cd "$project_dir/backend" && BACKEND_PORT="$BACKEND_PORT" npm start) &
backend_pid=$!
(cd "$project_dir/frontend" && HOST=127.0.0.1 BROWSER=none PORT="$FRONTEND_PORT" REACT_APP_API_URL="http://127.0.0.1:$BACKEND_PORT" npm start) &
frontend_pid=$!

cleanup() {
  trap - EXIT INT TERM
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
