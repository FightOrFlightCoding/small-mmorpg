#!/usr/bin/env bash
# DESTROYS local PostgreSQL data. Ordinary shutdown is scripts/dev-down.sh.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)/infra"
docker compose down -v
echo "Removed containers and named volume vibecode_postgres_data."
