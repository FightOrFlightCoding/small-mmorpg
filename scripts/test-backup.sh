#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_common.sh"
ROOT="$(repo_root)"
INFRA="$ROOT/infra"
if [[ "$(docker inspect -f '{{.State.Running}}' vibecode-postgres 2>/dev/null || true)" != "true" ]]; then
	echo "Starting local Postgres for the restore drill."
	docker compose -f "$INFRA/docker-compose.yml" up -d postgres
	for _ in $(seq 1 30); do
		if [[ "$(docker inspect -f '{{.State.Health.Status}}' vibecode-postgres 2>/dev/null || true)" == "healthy" ]]; then
			break
		fi
		sleep 2
	done
fi
CREATE_OUT="$(bash "$HERE/backup-create.sh" local)"
echo "$CREATE_OUT"
DUMP="$(printf '%s\n' "$CREATE_OUT" | sed -n 's/^backup=//p' | tail -n 1)"
bash "$HERE/backup-restore-test.sh" "$DUMP"
bash "$HERE/backup-verify.sh" nakama_restore_drill nakama
echo "backup restore drill passed."
echo "dump=$DUMP"
echo "restored_into=nakama_restore_drill"
