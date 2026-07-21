#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$project_dir/.env" ]]; then
  echo "Missing $project_dir/.env; copy .env.example and provide real values." >&2
  exit 1
fi
for dependency_dir in "$project_dir/backend/node_modules"; do
  if [[ ! -d "$dependency_dir" ]]; then
    echo "Missing $dependency_dir; install dependencies explicitly before starting." >&2
    exit 1
  fi
done

if [[ "${NODE_ENV:-}" == "test" ]]; then
  echo "Starting API-only test runtime on port ${BACKEND_PORT:?BACKEND_PORT is required}."
  cd "$project_dir/backend"
  exec npm start
fi

if [[ ! -d "$project_dir/frontend/node_modules" ]]; then
  echo "Missing $project_dir/frontend/node_modules; install dependencies explicitly before starting." >&2
  exit 1
fi

(cd "$project_dir/backend" && npm start) &
backend_pid=$!
(cd "$project_dir/frontend" && BROWSER=none PORT="${FRONTEND_PORT:-3000}" npm start) &
frontend_pid=$!

cleanup() {
  trap - EXIT INT TERM
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
  wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
