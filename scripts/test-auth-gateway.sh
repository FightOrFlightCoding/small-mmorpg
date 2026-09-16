#!/usr/bin/env bash
# ACCT-02 auth-gateway hermetic tests.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
(cd "$ROOT/auth-gateway" && npm run typecheck && npm test)
echo "auth-gateway tests passed."
