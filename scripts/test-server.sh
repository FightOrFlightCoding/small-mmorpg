#!/usr/bin/env bash
# Server domain tests.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)/server"
npm test
