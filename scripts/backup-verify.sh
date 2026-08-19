#!/usr/bin/env bash
set -euo pipefail
DATABASE="${1:-nakama_restore_drill}"
SOURCE="${2:-}"
CONTAINER="vibecode-postgres"
EXISTS="$(docker exec "$CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'")"
if [[ "${EXISTS// /}" != "1" ]]; then
	echo "Database '$DATABASE' does not exist." >&2
	exit 1
fi
COUNT="$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")"
COUNT="${COUNT// /}"
if [[ -n "$SOURCE" ]]; then
	SRC="$(docker exec "$CONTAINER" psql -U postgres -d "$SOURCE" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'")"
	SRC="${SRC// /}"
	if [[ "$COUNT" != "$SRC" ]]; then
		echo "Restored '$DATABASE' public_tables=$COUNT does not match source '$SOURCE' public_tables=$SRC." >&2
		exit 1
	fi
fi
echo "verify_ok database=$DATABASE public_tables=$COUNT"
