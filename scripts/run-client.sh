#!/usr/bin/env bash
# Launch one graphical Godot game client as a development identity.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
USER="${1:-alice}"
if [[ "$USER" != "alice" && "$USER" != "bob" ]]; then
	echo "Usage: $0 [alice|bob]" >&2
	exit 1
fi
ROOT="$(repo_root)"
GODOT="$(godot_bin)"
exec "$GODOT" --path "$ROOT/client" --scene "res://scenes/boot/boot.tscn" -- "--dev-user=$USER"
