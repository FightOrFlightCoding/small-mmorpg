#!/usr/bin/env bash
# Apply save-schema migrations. Fixture apply writes JSON; live apply uses Nakama console.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
(cd "$ROOT/server" && npm run migrate -- apply "$@")
