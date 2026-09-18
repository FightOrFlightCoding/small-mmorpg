# NPC test plan (NPC-01)

NPC-01 is documentation/audit only. It preserves existing NPC and quest coverage and adds repository/content checks without changing live behavior.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| NPC content integrity | `tools/content-build/tests/content-build.test.ts` | Generic duplicate IDs, duplicate NPC placement IDs, unknown NPC service type, and missing service references fail validation. |
| NPC combat boundary | `tools/foundation-audit/audit.cjs` | Combat targeting/threat do not include NPCs; `MatchNpc` has no combat or collision fields. |
| NPC collision debt containment | `tools/foundation-audit/audit.cjs` | Existing movement-blocker code is limited to `movement.ts` plus its sole `match_loop.ts` caller until a named migration updates the contract. |
| Client merchant boundary | `tools/foundation-audit/audit.cjs`, protocol tests | Vendor request keys exclude price/gold; client send calls cannot submit them. |
| Dialogue action boundary | `tools/foundation-audit/audit.cjs` | `.dialogue` `do` commands use only approved project-owned service adapters. |
| Existing interaction/quest journey | `server/tests/interaction.test.ts`, `quest.test.ts`, `quest_reward.test.ts`, client interaction tests, E2E | Elder range, accepted dialogue result, accept/turn-in, idempotency, wallet/inventory persistence remain unchanged. |

## Baseline results and reproducible commands

The current checkout uses Node 22.14.0. Before NPC-01 edits, `bash scripts/test-content.sh` and `bash scripts/test-auth-gateway.sh` failed because their package scripts pass a compiled test *directory* to Node 22 (`node --test dist/tests` or `dist-test/tests`), which Node treats as a missing module. This is pre-existing runner compatibility debt, not an NPC failure. Direct compiled-file glob invocation discovers and runs the suites.

```bash
bash scripts/test-audit.sh
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
GODOT_BIN=godot bash scripts/test-client.sh
```

The server baseline completed with 759 passed and 13 expected live-test skips before NPC-01 edits. The suite-specific content and auth commands above are the authoritative verification path for this Node 22 environment; the standard wrapper failures remain documented rather than hidden or changed in an NPC audit.

## Manual regression

After a follow-on gameplay change, start the existing stack and verify: walk to the elder, use the current keyboard interaction, receive server-approved dialogue, accept `quest.slime_problem`, kill/loot/turn in, reconnect, and verify no duplicate reward. NPC-01 itself requires no manual gameplay run because it changes no player-visible code. A later UI phase must additionally verify right-click invokes the same interaction request and that an NPC is pass-through rather than a movement obstacle.
