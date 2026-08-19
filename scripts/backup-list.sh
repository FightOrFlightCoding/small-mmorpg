#!/usr/bin/env bash
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/_common.sh"
DIR="$(repo_root)/backups"
if [[ ! -d "$DIR" ]]; then
	echo "No backups directory."
	exit 0
fi
shopt -s nullglob
files=("$DIR"/*.dump)
if [[ ${#files[@]} -eq 0 ]]; then
	echo "No dumps in backups/."
	exit 0
fi
ls -1t "${files[@]}"
