#!/usr/bin/env bash
# Stop PostgreSQL and Nakama. Keeps the named Postgres volume.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)/infra"
docker compose down
