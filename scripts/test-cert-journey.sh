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
log="$(mktemp)"
"$GODOT" --headless --path "$CLIENT" --scene "res://scenes/e2e/e2e_cert.tscn" -- --cert-five 2>&1 | tee "$log"
if ! grep -q "CERT_FIVE_OK" "$log"; then
	echo "cert journey did not print CERT_FIVE_OK." >&2
	exit 1
fi
echo "Five-client certification passed."
