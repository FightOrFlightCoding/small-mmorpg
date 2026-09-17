#!/usr/bin/env bash
# Pull the current cloud-agent review branch onto this machine.
# Work is not on main. Run after every agent prompt, with Godot closed.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
cd "$ROOT"

BRANCH_FILE="$ROOT/docs/AGENT_REVIEW_BRANCH"
if [[ ! -f "$BRANCH_FILE" ]]; then
	echo "docs/AGENT_REVIEW_BRANCH is missing. Agent work is not on main; that file names the branch to pull." >&2
	exit 1
fi
BRANCH="$(tr -d '[:space:]' < "$BRANCH_FILE")"
if [[ ! "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]; then
	echo "docs/AGENT_REVIEW_BRANCH has an invalid branch name: '$BRANCH'" >&2
	exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
	echo "Working tree has local changes. Commit, stash, or discard them before pulling." >&2
	git status
	echo "Refusing to pull onto a dirty tree. Typical Godot noise: git restore ." >&2
	exit 1
fi

echo "Fetching origin/$BRANCH ..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

HEAD="$(git rev-parse --short HEAD)"
echo
echo "Synced $BRANCH @ $HEAD"
echo "commit $(git rev-parse HEAD)"
assert_content_hashes
echo
echo "NEXT (Godot must be fully quit first):"
echo "  Map only, no server:  bash scripts/review-village-map.sh"
echo "  Live Alice:           bash scripts/dev-up.sh && bash scripts/run-client.sh alice"
echo "Do not review from main. world.tscn in the editor is empty until Play."

if [[ "${1:-}" == "--restart-backend" ]]; then
	bash "$ROOT/scripts/dev-up.sh"
fi
if [[ "${1:-}" == "--play-map" || "${2:-}" == "--play-map" ]]; then
	bash "$ROOT/scripts/review-village-map.sh"
fi
