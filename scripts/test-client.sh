#!/usr/bin/env bash
# Client import, SHELL_LOGIN smoke, and GdUnit4.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
GODOT="$(godot_bin)"
CLIENT="$ROOT/client"
"$GODOT" --headless --path "$CLIENT" --import --quit
"$GODOT" --headless --path "$CLIENT" --scene "res://scenes/boot/boot.tscn" -- --quit-after-login
"$GODOT" --headless --path "$CLIENT" -s "res://addons/gdUnit4/bin/GdUnitCmdTool.gd" --ignoreHeadlessMode --add "res://tests" -c
echo "Client application shell passed."
