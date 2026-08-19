#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
(cd "$ROOT/server" && npm run typecheck)
