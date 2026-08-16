#!/usr/bin/env bash
# Non-destructive save-schema dry run.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
(cd "$ROOT/server" && npm run migrate -- dry-run "$@")
