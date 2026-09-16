#!/usr/bin/env bash
# Verify migrated saves are current and re-running would not change them.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
(cd "$ROOT/server" && npm run migrate -- verify "$@")
