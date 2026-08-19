#!/usr/bin/env bash
# Domain soak certification. Default is the short automated duration.
# Manual hour-long run: bash scripts/test-soak.sh --duration-sec 3600
set -euo pipefail
# shellcheck source=_common.sh
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
ROOT="$(repo_root)"
mkdir -p "$ROOT/reports"
OUT="$ROOT/reports/soak.cert.json"
DURATION=""
TICKS=""
SEED="34"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--duration-sec)
			DURATION="$2"
			shift 2
			;;
		--ticks)
			TICKS="$2"
			shift 2
			;;
		--seed)
			SEED="$2"
			shift 2
			;;
		*)
			echo "unknown argument: $1" >&2
			exit 1
			;;
	esac
done
ARGS=(soak --seed "$SEED" --out "$OUT")
if [[ -n "$DURATION" ]]; then
	ARGS+=(--duration-sec "$DURATION")
elif [[ -n "$TICKS" ]]; then
	ARGS+=(--ticks "$TICKS")
fi
echo "== cert soak =="
(
	cd "$ROOT/server"
	npm run cert -- "${ARGS[@]}"
)
if [[ ! -f "$OUT" ]]; then
	echo "soak report was not written to $OUT" >&2
	exit 1
fi
echo "Soak report: $OUT"
if [[ -z "$DURATION" && -z "$TICKS" ]]; then
	echo "Manual certification: bash scripts/test-soak.sh --duration-sec 3600"
fi
