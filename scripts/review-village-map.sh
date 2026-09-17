#!/usr/bin/env bash
# Launch the no-server village grass+roads review scene (4096x3072).
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
GODOT="$(godot_bin)"
echo "Opening village roads review from $GODOT"
echo "Scene res://scenes/world/terrain/village_roads_test.tscn (no Nakama)."
echo "If Godot is already open on this project, quit it first."
exec "$GODOT" --path "$ROOT/client" --scene "res://scenes/world/terrain/village_roads_test.tscn"
