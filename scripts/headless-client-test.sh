#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
GODOT="$(godot_bin)"
CLIENT="$ROOT/client"
"$GODOT" --headless --path "$CLIENT" --import --quit
"$GODOT" --headless --path "$CLIENT" --scene "res://scenes/boot/boot.tscn" -- --quit-after-login
echo "headless client test passed."
