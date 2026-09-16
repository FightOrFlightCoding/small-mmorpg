#!/usr/bin/env bash
# Install Node dependencies and verify local tools. Does not start Docker.
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"

echo "== tools =="
require_cmd node
require_cmd npm
require_cmd docker
GODOT="$(godot_bin)"
node -v
docker --version
"$GODOT" --version

echo "== server npm ci =="
(cd "$ROOT/server" && npm ci)

echo "== content-build npm ci =="
(cd "$ROOT/tools/content-build" && npm ci)

echo "== auth-gateway npm ci =="
(cd "$ROOT/auth-gateway" && npm ci)

assert_content_hashes
echo "Setup complete."
