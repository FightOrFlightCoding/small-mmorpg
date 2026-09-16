#!/usr/bin/env bash
# Build the runtime and start PostgreSQL + Nakama.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"
if [[ ! -d node_modules ]]; then
	npm ci
fi
npm run build
cd "$ROOT/infra"
docker compose up --build -d --force-recreate
docker compose ps
bash "$ROOT/scripts/backend-verify.sh"
