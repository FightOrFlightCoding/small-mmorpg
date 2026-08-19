#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/_common.sh"
ROOT="$(repo_root)"
echo "== content validation + bundle hashes =="
bash "$HERE/test-content.sh"
echo "== protocol / vendor / generated-bundle audit =="
bash "$HERE/test-audit.sh"
echo "== server typecheck =="
bash "$HERE/server-typecheck.sh"
echo "== server tests =="
bash "$HERE/test-server.sh"
echo "== migration fixture dry-run / apply / verify =="
TMP="${TMPDIR:-/tmp}/p18-alice.v1.json"
bash "$HERE/migrate-dry-run.sh" --fixture server/tests/fixtures/saves/p18-alice.json
bash "$HERE/migrate-apply.sh" --fixture server/tests/fixtures/saves/p18-alice.json --out "$TMP"
bash "$HERE/migrate-verify.sh" --fixture "$TMP"
if [[ "${SKIP_CLIENT:-}" != "1" ]]; then
	echo "== headless client =="
	bash "$HERE/headless-client-test.sh"
	echo "== godot client tests =="
	bash "$HERE/test-client.sh"
fi
echo "verify-release passed."
