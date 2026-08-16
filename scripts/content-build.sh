#!/usr/bin/env bash
# Build the shared content database into server and client artifacts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/tools/content-build"
if [[ ! -d node_modules ]]; then
	npm ci
fi
npm run generate
