#!/usr/bin/env bash
# Create a custom-format dump of the named environment database.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
ENV_NAME="${1:-${VIBECODE_ENV:-local}}"
CFG="$ROOT/infra/environments/${ENV_NAME}.json"
if [[ ! -f "$CFG" ]]; then
	echo "Unknown environment '$ENV_NAME'." >&2
	exit 1
fi
DB="$(node -e "const fs=require('fs'); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).database.name)" "$CFG")"
CONTAINER="vibecode-postgres"
if [[ "$ENV_NAME" == "automated_test" ]]; then
	CONTAINER="vibecode-test-postgres"
fi
if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]]; then
	echo "Postgres container '$CONTAINER' is not running." >&2
	exit 1
fi
mkdir -p "$ROOT/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="nakama-${ENV_NAME}-${STAMP}.dump"
REMOTE="/tmp/${FILE}"
docker exec "$CONTAINER" pg_dump -U postgres -Fc "$DB" -f "$REMOTE"
docker cp "${CONTAINER}:${REMOTE}" "$ROOT/backups/${FILE}"
docker exec "$CONTAINER" rm -f "$REMOTE"
echo "backup=$ROOT/backups/${FILE}"
echo "environment=${ENV_NAME} database=${DB}"
