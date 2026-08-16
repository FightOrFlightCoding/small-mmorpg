#!/usr/bin/env bash
# Clean-setup gate: content, server, client, then the two-client e2e journey.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
echo "== setup =="
bash "$HERE/setup.sh"
echo "== test-content =="
bash "$HERE/test-content.sh"
echo "== test-audit =="
bash "$HERE/test-audit.sh"
echo "== test-server =="
bash "$HERE/test-server.sh"
echo "== test-client =="
bash "$HERE/test-client.sh"
echo "== test-e2e =="
bash "$HERE/test-e2e.sh"
echo "test-all passed."
