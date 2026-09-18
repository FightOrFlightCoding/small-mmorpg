# NPC test plan (NPC-03)

NPC-03 records server-owned cosmetic route plans, client interpolation from match ticks, full-state late join, and snapshot traffic only on movement-revision changes. Dialogue pause is not started.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| Deterministic route selection | `server/tests/npc_movement.test.ts` | Same seed produces the same weighted visit sequence. |
| Route bounds | `npc_movement.test.ts` | Waypoints beyond `maxDistanceFromHome` are never selected. |
| Valid waypoint transitions | `npc_movement.test.ts` | Loop/ping-pong/weighted hops follow authored order or edges only. |
| Loop / ping-pong / weighted | `npc_movement.test.ts` | Visit order wraps, reverses at ends, and respects edge weights. |
| Dwell timing | `npc_movement.test.ts` | Authored dwell keeps the NPC idle for the expected ticks. |
| Movement revision | `npc_movement.test.ts` | Revision changes on new plans, not every mid-segment tick. |
| Old-plan rejection | `npc_movement.test.ts`, `client/tests/app/npc_avatar_test.gd` | Incoming revision ≤ current is ignored except forced full-state resync. |
| Late join / full-state resync | `npc_movement.test.ts`, `npc_avatar_test.gd` | `FULL_STATE` pose matches interpolate(plan, tick); full-state force-applies. |
| No NPC persistence writes | `npc_movement.test.ts` | Match-loop persist arrays stay empty for movement; a new match resets to home. |
| No mob interaction / no player collision | `npc_movement.test.ts`, `movement.test.ts` | Moving NPCs do not change combat/HP and do not block player `resolveMove`. |
| Snapshot traffic | `npc_movement.test.ts` | Stationary production NPCs omit `SNAPSHOT.npcs`; moving NPCs publish plans only when dirty. |
| Pause/resume API | `npc_movement.test.ts`, audit | `pauseNpcMovement`/`resumeNpcMovement` exist and are not called from `INTERACT`. |
| NPC combat boundary | audit, `npc_runtime.test.ts` | Unchanged: no HP/threat/AI; targeting/loot reject NPC ids. |

## Baseline results and reproducible commands

The current checkout uses Node 22. Directory-form `node --test dist/tests` wrappers can fail before discovery. Direct compiled-file glob invocation is the authoritative path:

```bash
bash scripts/test-audit.sh
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
GODOT_BIN=godot bash scripts/test-client.sh
```

## Manual regression

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main`, then verify: two clients see the same elder pose, movement (when a moving route is present) is smooth, NPCs stay near their home route, snapshots do not stream NPC positions every frame, and elder quest/interact behavior is unchanged.
