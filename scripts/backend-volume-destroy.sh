#!/usr/bin/env bash
# DESTROYS local PostgreSQL data. Ordinary shutdown is scripts/dev-down.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_common.sh
. "$HERE/_common.sh"
ENV_NAME="${VIBECODE_ENV:-local}"
if [[ "$ENV_NAME" == "production" || "$ENV_NAME" == "staging" ]]; then
	echo "Refusing to destroy volumes while VIBECODE_ENV=$ENV_NAME." >&2
	exit 1
fi
CFG="$(repo_root)/infra/environments/${ENV_NAME}.json"
RESET="$(node -e "const fs=require('fs'); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).dataReset)" "$CFG")"
if [[ "$RESET" != "allowed" ]]; then
	echo "Data reset is forbidden for environment '$ENV_NAME'." >&2
	exit 1
fi
cd "$(repo_root)/infra"
docker compose down -v
echo "Removed containers and named volume vibecode_postgres_data."
