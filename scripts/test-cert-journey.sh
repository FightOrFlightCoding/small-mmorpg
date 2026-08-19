#!/usr/bin/env bash
# Headless five-client certification journey against local Nakama.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
GODOT="$(godot_bin)"
CLIENT="$ROOT/client"

if ! nakama_healthy; then
	echo "Nakama is not healthy. Starting scripts/dev-up.sh..."
	bash "$ROOT/scripts/dev-up.sh"
fi
if ! nakama_healthy; then
	echo "Nakama is not reachable at 127.0.0.1:7350." >&2
	exit 1
fi

"$GODOT" --headless --path "$CLIENT" --import --quit
stamp="$(date +%s%3N)"
echo "== cert five-client journey stamp=$stamp =="
log="$(mktemp)"
"$GODOT" --headless --path "$CLIENT" --scene "res://scenes/e2e/e2e_cert.tscn" -- --cert-five "--cert-stamp=$stamp" 2>&1 | tee "$log"
if ! grep -q "CERT_FIVE_OK" "$log"; then
	echo "cert journey did not print CERT_FIVE_OK." >&2
	exit 1
fi

echo "== restart backend processes =="
docker restart vibecode-nakama >/dev/null
deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
	if nakama_healthy; then
		break
	fi
	sleep 2
done
if ! nakama_healthy; then
	echo "Nakama did not become healthy after restart." >&2
	exit 1
fi
docker restart vibecode-postgres >/dev/null
pg_deadline=$((SECONDS + 90))
while (( SECONDS < pg_deadline )); do
	if nakama_healthy; then
		break
	fi
	sleep 3
done
if ! nakama_healthy; then
	echo "Stack did not recover after Postgres restart." >&2
	exit 1
fi

resume_log="$(mktemp)"
"$GODOT" --headless --path "$CLIENT" --scene "res://scenes/e2e/e2e_cert.tscn" -- --cert-five-resume "--cert-stamp=$stamp" 2>&1 | tee "$resume_log"
if ! grep -q "CERT_FIVE_RESUME_OK" "$resume_log"; then
	echo "cert resume did not print CERT_FIVE_RESUME_OK." >&2
	exit 1
fi
echo "Five-client certification passed."
