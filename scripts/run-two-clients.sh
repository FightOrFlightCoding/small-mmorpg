#!/usr/bin/env bash
# Launch Alice and Bob as two graphical game windows.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
GODOT="$(godot_bin)"
"$GODOT" --path "$ROOT/client" --scene "res://scenes/boot/boot.tscn" -- --dev-user=alice &
"$GODOT" --path "$ROOT/client" --scene "res://scenes/boot/boot.tscn" -- --dev-user=bob &
echo "Started Alice and Bob."
