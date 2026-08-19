#!/usr/bin/env bash
# Restore a dump into nakama_restore_drill on the local Postgres container.
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
	echo "Usage: backup-restore-test.sh <dump-path>" >&2
	exit 1
fi
if [[ "$DUMP" != /* ]]; then
	DUMP="$ROOT/$DUMP"
fi
CONTAINER="vibecode-postgres"
if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)" != "true" ]]; then
	echo "Postgres container '$CONTAINER' is not running." >&2
	exit 1
fi
REMOTE="/tmp/restore-drill.dump"
docker cp "$DUMP" "${CONTAINER}:${REMOTE}"
docker exec "$CONTAINER" psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'nakama_restore_drill' AND pid <> pg_backend_pid();" >/dev/null
docker exec "$CONTAINER" psql -U postgres -c "DROP DATABASE IF EXISTS nakama_restore_drill;"
docker exec "$CONTAINER" psql -U postgres -c "CREATE DATABASE nakama_restore_drill;"
docker exec "$CONTAINER" pg_restore -U postgres -d nakama_restore_drill --no-owner --no-acl "$REMOTE"
docker exec "$CONTAINER" rm -f "$REMOTE"
echo "restored_into=nakama_restore_drill"
echo "source=$DUMP"
