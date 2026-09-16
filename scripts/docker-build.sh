#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
docker build -f "$ROOT/server/Dockerfile" -t vibecode-nakama:3.40.0 "$ROOT/server"
echo "image=vibecode-nakama:3.40.0"
