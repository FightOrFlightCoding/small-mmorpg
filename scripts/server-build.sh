#!/usr/bin/env bash
# Bundle the Nakama TypeScript runtime to ES5 at server/build/index.js.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)/server"
npm run build
