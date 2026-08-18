#!/usr/bin/env bash
# Project-owned content CLI. Equivalent to tools/content-build commands.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/tools/content-build"
if [[ ! -d node_modules ]]; then
	npm ci
fi
if [[ $# -eq 0 ]]; then
	npm run generate
	exit 0
fi
npm run typecheck
npx tsc -p tsconfig.json
node dist/src/cli.js "$@"
