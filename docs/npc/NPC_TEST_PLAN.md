# NPC test plan (NPC-01)

NPC-01 records the contract and closes the listed runtime conflicts without starting NPC-02.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| NPC content integrity | `tools/content-build/tests/content-build.test.ts` | Generic duplicate IDs, duplicate NPC placement IDs, unknown NPC service type, and missing service references fail validation. Authored `respec` is present on `npc.test_innkeeper`. |
| NPC combat boundary | `tools/foundation-audit/audit.cjs` | Combat targeting/threat do not include NPCs; `MatchNpc` has no combat or collision fields. |
| NPC collision / interact affordance | `tools/foundation-audit/audit.cjs`, `server/tests/movement.test.ts` | NPCs are absent from gameplay collision; `InteractionArea` exists; players can walk through NPC poses. |
| Right-click interact | `client/tests/app/interaction_client_test.gd` | Right-click pick sends the same `INTERACT` payload as keyboard interact. |
| Respec content gate | `server/tests/progression_respec.test.ts`, audit | No `RESPEC_TRAINER_NPC_IDS`; innkeeper services include `respec`. |
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
