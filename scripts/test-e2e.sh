#!/usr/bin/env bash
# Headless two-client vertical-slice journey against local Nakama.
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
"$GODOT" --headless --path "$CLIENT" --scene "res://scenes/e2e/e2e_slice.tscn" -- --e2e-slice 2>&1 | tee "$log"
if ! grep -q "E2E_SLICE_OK" "$log"; then
	echo "e2e did not print E2E_SLICE_OK." >&2
	exit 1
fi
echo "E2E slice passed."
