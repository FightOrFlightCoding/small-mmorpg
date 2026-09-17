#!/usr/bin/env bash
# Thin wrapper: playable work is on main. Prefer scripts/local-play.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Playable work is on origin/main. Syncing main and rebuilding Nakama."
bash "$ROOT/local-play.sh" main
if [[ "${1:-}" == "--play-map" ]]; then
	bash "$ROOT/review-village-map.sh"
fi
