#!/usr/bin/env bash
# Content-build tests plus client/server hash match.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
cd "$ROOT/tools/content-build"
if [[ ! -d node_modules ]]; then
	npm ci
fi
npm test
assert_content_hashes
