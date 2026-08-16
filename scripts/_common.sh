#!/usr/bin/env bash
# Shared helpers for developer shell scripts. Source from the same directory.
set -euo pipefail

repo_root() {
	local here
	here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	cd "$here/.." && pwd
}

godot_bin() {
	if [[ -n "${GODOT_BIN:-}" && -x "$GODOT_BIN" ]]; then
		printf '%s\n' "$GODOT_BIN"
		return
	fi
	if command -v godot >/dev/null 2>&1; then
		command -v godot
		return
	fi
	echo "Godot 4.7.1 not found. Install it or set GODOT_BIN." >&2
	return 1
}

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		return 1
	fi
}

nakama_healthy() {
	curl -fsS -X POST "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap" \
		-H "Content-Type: application/json" \
		-d '{}' >/dev/null 2>&1
}

assert_content_hashes() {
	local root client_hash server_hash
	root="$(repo_root)"
	client_hash="$(node -e "const fs=require('fs'); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).contentHash)" "$root/client/content/bundle.json")"
	server_hash="$(sed -n 's/export const contentHash = "\([a-f0-9]\{64\}\)";/\1/p' "$root/server/src/generated/content.ts" | head -n 1)"
	if [[ ! "$client_hash" =~ ^[a-f0-9]{64}$ ]]; then
		echo "client/content/bundle.json contentHash is missing." >&2
		return 1
	fi
	if [[ "$client_hash" != "$server_hash" ]]; then
		echo "Client and server content hashes differ. Run scripts/content-build.sh." >&2
		return 1
	fi
	echo "content_hash=$client_hash"
}
