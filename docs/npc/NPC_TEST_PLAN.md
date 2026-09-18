# NPC test plan (NPC-02)

NPC-02 records generic definitions, the `NpcRuntimeInstance` actor, placeholder `NpcAvatar` rendering, and combat exclusion. Cosmetic patrol ticking is not started.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| NPC content integrity | `tools/content-build/tests/content-build.test.ts` | Generic duplicate IDs, duplicate NPC placement IDs, unknown NPC service type, missing route/vendor/quest references, home mismatch, invalid graphs, speed/dwell, and home-bound waypoints fail validation. Elder stays on `route.stationary` with unchanged slime-quest services. Authored `respec` is present on `npc.test_innkeeper`. |
| Generic runtime spawn | `server/tests/npc_runtime.test.ts` | `createNpcRuntimeInstance` / match spawn from content; no HP/threat/AI fields. |
| NPC combat boundary | `tools/foundation-audit/audit.cjs`, `server/tests/npc_runtime.test.ts`, `server/tests/targeting.test.ts` | Hostile/friendly set-target, AoE queries, threat, damage, healing, death, and loot reject NPC ids. `ResolvedEntity.kind` remains `player \| enemy`. |
| NPC collision / interact affordance | `tools/foundation-audit/audit.cjs`, `server/tests/movement.test.ts`, `client/tests/app/npc_avatar_test.gd` | NPCs are absent from gameplay collision; `NpcAvatar` has placeholder square, name label, `MarkerAnchor`, interaction-only `Area2D`, no physics body; players can walk through NPC poses. |
| Right-click interact | `client/tests/app/interaction_client_test.gd` | Right-click pick sends the same `INTERACT` payload as keyboard interact. Click uses the interaction-area radius. |
| Respec content gate | `server/tests/progression_respec.test.ts`, `npc_runtime.test.ts`, audit | No `RESPEC_TRAINER_NPC_IDS`; innkeeper/lab trainer remain generic NPCs with authored `respec`. |
| Dialogue action metadata | audit, `client/tests/app/quest_service_test.gd` | Elder/proof/cert scripts have no quest/NPC literals; offered helpers read content. |
| Generic service gate | `interaction.ts` callers, audit | Interact/vendor/inn/cave/quest/respec pass `requiredService`. |
| INTERACT replay | `server/tests/interaction.test.ts` | Repeated request IDs do not re-apply `talk_to_npc`. |
| Client merchant boundary | `tools/foundation-audit/audit.cjs`, protocol tests | Vendor request keys exclude price/gold; client send calls cannot submit them. |
| Existing interaction/quest journey | `server/tests/interaction.test.ts`, `quest.test.ts`, `quest_reward.test.ts`, client interaction tests, E2E | Elder range, accepted dialogue result, accept/turn-in, idempotency, wallet/inventory persistence remain. |

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

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main`, then verify: walk through the elder (not blocked), right-click and keyboard-interact, receive server-approved dialogue, accept `quest.slime_problem`, kill/loot/turn in, reconnect, and verify no duplicate reward.
