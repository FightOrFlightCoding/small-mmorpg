#!/usr/bin/env bash
# Controlled failure drill. Domain coverage lives in server/tests/cert_failure.test.ts.
# Live docker restarts are opt-in (--live) and are not part of scripts/test-all.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
LIVE=0
if [[ "${1:-}" == "--live" ]]; then
	LIVE=1
fi
echo "== failure domain tests =="
bash "$ROOT/scripts/test-server.sh"
if [[ "$LIVE" -ne 1 ]]; then
	echo "Skipping live Nakama/Postgres restart. Re-run with --live in a disposable environment."
	exit 0
fi
if ! nakama_healthy; then
	echo "Nakama is not reachable. Start a disposable stack before --live." >&2
	exit 1
fi
echo "== restart Nakama =="
docker restart vibecode-nakama >/dev/null
for _ in $(seq 1 45); do
	if nakama_healthy; then
		break
	fi
	sleep 2
done
if ! nakama_healthy; then
	echo "Nakama did not become healthy after restart." >&2
	exit 1
fi
echo "== restart Postgres =="
docker restart vibecode-postgres >/dev/null
for _ in $(seq 1 45); do
	if nakama_healthy; then
		break
	fi
	sleep 3
done
if ! nakama_healthy; then
	echo "Stack did not recover after Postgres restart." >&2
	exit 1
fi
bash "$ROOT/scripts/backend-verify.sh"
echo "Live failure drill passed."
