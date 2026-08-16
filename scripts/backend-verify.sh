#!/usr/bin/env bash
# Confirm Nakama loaded the current JS runtime.
set -euo pipefail
HEALTH_URI="http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap"

echo "Waiting for vibecode-nakama to be healthy..."
for _ in $(seq 1 45); do
	status="$(docker inspect -f "{{.State.Health.Status}}" vibecode-nakama 2>/dev/null || true)"
	if [[ "$status" == "healthy" ]]; then
		break
	fi
	sleep 2
done
status="$(docker inspect -f "{{.State.Health.Status}}" vibecode-nakama)"
if [[ "$status" != "healthy" ]]; then
	echo "Nakama is not healthy (status=$status)." >&2
	exit 1
fi

echo "Checking vibecode_health..."
health="$(curl -fsS -X POST "$HEALTH_URI" -H "Content-Type: application/json" -d '{}')"
node -e '
const health = JSON.parse(process.argv[1]);
if (!health.ok) process.exit(1);
if (!/^[a-f0-9]{64}$/.test(health.content_version || "")) process.exit(2);
const rpcs = health.rpcs || [];
if (!rpcs.includes("character_bootstrap") || !rpcs.includes("find_or_create_starter_zone")) process.exit(3);
' "$health"

echo "Backend verified."
