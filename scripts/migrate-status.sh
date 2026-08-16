#!/usr/bin/env bash
# Show save-schema migration status for a fixture, account, character, or local-dev users.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
(cd "$ROOT/server" && npm run migrate -- status "$@")
