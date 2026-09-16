#!/usr/bin/env bash
# Prompt 18 freeze audit: storage, protocol, pins, vendor tree, content hash.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
node "$ROOT/tools/foundation-audit/audit.cjs"
