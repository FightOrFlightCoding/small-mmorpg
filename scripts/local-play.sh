#!/usr/bin/env bash
# Restore Godot import dirt, optionally check out a pushed branch, rebuild Nakama.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
BRANCH="${1:-main}"

echo "Close the Godot editor before this script so it cannot rewrite .import files during checkout."
restore_godot_import_dirt

if [[ -n "$BRANCH" ]]; then
	git -C "$ROOT" fetch origin "$BRANCH"
	git -C "$ROOT" checkout "$BRANCH"
	git -C "$ROOT" pull --ff-only origin "$BRANCH"
	restore_godot_import_dirt
fi

current="$(git -C "$ROOT" branch --show-current)"
echo "branch=$current"
assert_content_hashes
bash "$ROOT/scripts/dev-up.sh"
echo "Nakama now serves this checkout's catalog."
echo "Reopen Godot 4.7.1 on: $ROOT/client"
echo "Stay on branch $current for play. A content-pack mismatch means Nakama is still an old build - re-run this script."
echo "Local play ready."
