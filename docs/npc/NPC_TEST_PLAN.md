# NPC test plan (NPC-07)

NPC-07 certifies lifecycle, security, and content-only proof on top of NPC-01 through NPC-06. No new NPC feature is in scope.

## Security coverage (`npc_security.test.ts`)

| Check | Expected proof |
| --- | --- |
| Forged NPC ID | `invalid_target` |
| Forged session ID | `invalid_session` |
| Foreign session | `invalid_session` |
| Expired session | `session_expired` |
| Wrong match | `invalid_session` |
| Out of range | `out_of_range` |
| Dead character | `player_dead` |
| Link-dead character | `link_dead` |
| Transfer | `already_transferring` |
| Dialogue option injection | `invalid_option`; node unchanged |
| Unknown service | Dialogue-only NPC `VENDOR_BUY` is `invalid_service` |
| Quest-state injection | Client `status` is `unknown_field`; quest not accepted |
| Quest reward replay | Same turn-in `requestId` does not grant twice |
| Merchant price spoof | `unknown_field:price` |
| Merchant item injection | Off-stock item is `invalid_id` |
| Merchant quantity abuse | 0 / negative / 100 are `invalid_amount`; gold unchanged |
| Duplicate transaction | Same buy `requestId` deducts once |
| Interaction spam | Interact bucket `rate_limited` |
| Oversized payload | `payload_too_large` |
| Unknown fields | Strict parse rejection |
| Protocol mismatch | Join `protocol_mismatch` |
| Content mismatch | Join `content_mismatch` |

NPC-06 vendor coverage in `npc_vendor.test.ts` remains. NPC-04/NPC-05 interaction, dialogue, quest, and marker coverage remains in `interaction.test.ts`, `npc_quest.test.ts`, and `interaction_client_test.gd`.

## Lifecycle coverage (`npc_lifecycle.test.ts`)

| Check | Expected proof |
| --- | --- |
| Login / public-world join | `FULL_STATE` lists production and proof NPCs plus persisted quest and gold |
| Full-state resync | `RESYNC_REQUEST` returns the same wallet/quest records |
| Character switch | New character has no session and no leaked quest log |
| Unexpected disconnect | Session `invalidated`; NPC resumes; buy is `link_dead` |
| Ten-second link-dead | Avatar remains until `LINK_DEAD_TICKS`, then despawns |
| Safe Return to Character Select | Player removed; quests queued to persist; session gone |
| Logout / match restart | Purchase remains; combined NPC rebuilds at home |
| Zone transfer | Player removed; merchant not paused |
| Soft delete + restore | Completed quest and purchased item reload; no session |
| Account export | Quests and gold present; `rngState` and NPC pose omitted |
| Account deletion | Empty character list has no quest/item records |
| Movement ticks | Cosmetic travel `persistOpCount` is 0 |

## Content-only proof (`npc_platform.test.ts`, `npc_platform_content_test.gd`)

| Check | Expected proof |
| --- | --- |
| Dialogue-only NPC | `npc.platform_greeter` |
| Single dialogue option | `npc.platform_guide` + `route.platform_weighted` |
| Quest NPC | `npc.platform_quest` + `quest.platform_talk` |
| Merchant NPC | `npc.platform_merchant` + `vendor.platform_kiosk` |
| Combined NPC | `npc.platform_combined` + loop route + quest + vendor |
| Two-client journey | Shared pose, pass-through, mob ignore, no combat target, concurrent dialogue, pause, optional response, quest accept/turn-in, buy once, disconnect closes session, resume, reconnect restores records, restart at home |

## Baseline results and reproducible commands

NPC-07 hermetic gates (Node 22.14). Directory-form `node --test dist/tests` wrappers can fail before discovery. Direct compiled-file glob invocation is the authoritative path:

| Gate | Result |
| --- | --- |
| Foundation audit | pending |
| Content validation/tests | pending |
| Server hermetic tests | pending |
| Server typecheck/build | pending |
| Auth gateway hermetic tests | pending |
| Godot 4.7.1 client GdUnit | pending |

```bash
bash scripts/test-audit.sh
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
GODOT_BIN=godot bash scripts/test-client.sh
```

## Manual regression

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main`, then run the two-client journey in [NPC_PLATFORM_READY.md](NPC_PLATFORM_READY.md). Confirm the Prompt 18 elder/slime path still completes. Suggested release tag `npc-platform-v1` is not created until the user approves.
