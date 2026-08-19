#!/usr/bin/env bash
# Domain capacity certification report (20 public-world characters + cave instances).
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
mkdir -p "$ROOT/reports"
OUT="$ROOT/reports/capacity.cert.json"
echo "== cert capacity =="
(
	cd "$ROOT/server"
	npm run cert -- capacity --out "$OUT"
)
if [[ ! -f "$OUT" ]]; then
	echo "capacity report was not written to $OUT" >&2
	exit 1
fi
echo "Capacity report: $OUT"
