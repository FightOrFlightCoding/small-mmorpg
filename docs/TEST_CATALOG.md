# Test catalog

Prompt 18 automated suites plus the Prompt 19 freeze audit, Prompt 21 account/character coverage, Prompt 22 progression coverage, Prompt 23 economy coverage, Prompt 24 ability coverage, Prompt 25 combat-pipeline coverage, Prompt 26 enemy/spawn/AI/loot/boss coverage, Prompt 27 NPC/quest/vendor/inn coverage, Prompt 28 party/chat/group-credit/loot coverage, Prompt 29 public-world/cave/transfer/reconnect coverage, and Prompt 30 nearby trade coverage. Do not weaken these tests. Live gate counts after Prompt 30: content 14/14, server 399/399, client GdUnit 178/178 (0 orphans), `E2E_SLICE_OK` unchanged.

Related: [VERTICAL_SLICE.md](VERTICAL_SLICE.md), [FOUNDATION_BASELINE.md](FOUNDATION_BASELINE.md).

## Gates

| Command | What it proves |
| --- | --- |
| `scripts/test-content` | Content-build tests + matching `contentHash` (development-only exclusion, diff, trace) |
| `scripts/test-audit` | Catalog vs code: storage, opcodes, pins, vendor dirty (non-import), player `schemaVersion` presence, test-content leakage, hardcoded ID allowlist |
| `scripts/test-server` | Nakama domain tests |
| `scripts/test-client` | Import, `SHELL_LOGIN`, GdUnit, 0 orphans |
| `scripts/test-e2e` | Live two-client journey `E2E_SLICE_OK` |
| `scripts/test-all` | setup + all of the above |

## Content-build (`tools/content-build/tests`)

| Test | Coverage |
| --- | --- |
| valid source | Slice documents compile |
| duplicate IDs | `duplicate_id` |
| missing references | `missing_reference` |
| invalid ranges | `invalid_range` |
| unknown equipment slot | `unknown_equipment_slot` |
| duplicate quest reward | `duplicate_quest_reward` |
| deterministic generation | byte-identical reruns |
| matching hashes | client/server digest |
| no absolute paths | generated files |
| development-only exclusion | production payload omits `developmentOnly` |
| hash ignores timestamp | `buildTimestamp` not in artifacts or hash |
| diff / trace | added/removed/changed ids; inbound/outbound refs |
| definition schema version | mismatched per-kind version rejected |

## Server (`server/tests`)

| File | Coverage | VS |
| --- | --- | --- |
| `protocol.test.ts` | opcodes, unknown fields, injection, payload size, version/hash | VS-T1, T5, T9 |
| `fixtures/malformed_messages.ts` | malformed JSON corpus | VS-T1 |
| `movement.test.ts` | teleport/overspeed, seq, wall depenetration, living-player and NPC blockers | VS-T2 |
| `combat.test.ts` | server damage, cooldown, death, slime AI | VS-T3 |
| `combat_pipeline.test.ts` | pipeline order, healing, defense, modifiers, periodic, death, dead restrictions, respawn, bind fallback, duplicate event, invalid target, PvP, cast interrupt, reconnect while dead | |
| `spawn_controller.test.ts` | always slime, manual create, duplicate spawn, in-place respawn, group reset | |
| `enemy_ai.test.ts` | melee/ranged/caster AI, stun, threat switch, heal threat, leash without HP restore | |
| `loot_table.test.ts` | guaranteed/chance/weighted/empty rolls, duplicate death loot/XP, party-credit hook | |
| `boss.test.ts` | two-phase test boss, wipe reset, leash reset | |
| `targeting.test.ts` | self/hostile/friendly/ground/area queries; SET_TARGET | |
| `xp_hooks.test.ts` | trusted grant interface, kill/quest event ids, idempotency | |
| `inventory.test.ts` | pickup, stack merge/split/move, destroy, locks, capacity, Prompt 18 instance ids | VS-T4, T5 |
| `equipment.test.ts` | weapons/armor slots, class/level/lock, derived attack | VS-T5 |
| `transaction.test.ts` | gold add/remove/insufficient, idempotency, OCC, audit, in-memory committer | |
| `quest.test.ts` | accept, already_accepted, talk/kill/collect/enter/stages/prereq | VS-T6 |
| `quest_reward.test.ts` | turn-in, `multiUpdate` fake, duplicate reward | VS-T4, T6, T7 |
| `quest_store.test.ts` | serialize/load | |
| `vendor.test.ts` | buy, sell, insufficient gold, full inventory, equipped locked, unsellable, idempotent | |
| `inn.test.ts` | rest heal+bind, insufficient gold, healer, reconnect bind, cave enter queues transfer | |
| `cave.test.ts` | public-world discovery, concurrent create, solo/party cave, shared instance, non-member deny, ticket reuse/expiry/wrong character, presence conflict, disconnect/reconnect grace, fallback after expire, exit, wipe, boss completion, empty terminate, stale recover, party-disband expire | |
| `interaction.test.ts` | range, dead player, dialogueId/services extras | |
| `security.test.ts` | mapped attacks, rate limits | VS-T1–T6, T9 |
| `match.test.ts` | join, empty shutdown, FULL_STATE | VS-T9 |
| `character.test.ts` | bootstrap wrapper, `permissionWrite: 0` | |
| `character_lifecycle.test.ts` | names, slots, classes, tickets, concurrent `name_taken`, Prompt 18 migrate | |
| `starter_zone_registry.test.ts` | canonical match id | |
| `persistence.test.ts` | checkpoints, grace, seq reset, Nakama null maps/extras on tick 0 | VS-M5 automated analog |
| `migration.test.ts` | v0→v1, retry, future version, missing version, null schemaVersion, corrupt, completed quest, equipment, gold | |
| `chat.test.ts` | RT hooks | |
| `content.test.ts` | generated catalog shape | VS-T8 analog |
| `progression.test.ts` | XP thresholds, multi-level, max level, duplicate event, allocate, derived-stat order, equipment/effect hooks, Prompt 18 migrate, reconnect FULL_STATE | |
| `ability.test.ts` | locked use, valid melee, ATTACK wrapper, range, PvP, relation, resource, ICD/GCD, duplicate request, movement/damage interrupt, cancel, heal, DoT, stack policies, expiration, unlock, hotbar, reconnect clears casts, null magnitude scale, catalog strip/rebind | |
| `party.test.ts` | create, invite, accept, decline, expired invite, party full, already in party, leave, kick, promote, leader disconnect, grace reconnect, all-absent disband, forged membership, duplicate requestId, create-declines-pending, accept-leaves-current, ghost-member prune, match-cache eviction | |
| `party_credit_loot.test.ts` | group kill XP, out-of-range member, group quest credit, personal loot, server-assigned loot, duplicate death event | |
| `trade.test.ts` | invite, decline, item+gold commit once, offer change clears acceptance, revision mismatch, unowned/non-tradeable/locked, insufficient gold, full inventory, duplicate commit, disconnect, transfer, death, timeout, concurrent destroy, interrupted recovery, audit | |
| `health.test.ts` | `vibecode_health` | |

## Client GdUnit (`client/tests`)

| File | Coverage | VS |
| --- | --- | --- |
| `compatibility/compatibility_test.gd` | addons load | |
| `content_registry_test.gd` | catalog IDs, hash | VS-T8 |
| `error_state_test.gd` | visible errors, no hang | VS-M4 |
| `scene_router_test.gd` / `shell_scenes_test.gd` | boot/login/character/world | VS-T8 |
| `auth_flow_test.gd` | email register/login, invalid credentials, session refresh, release-gated device auth, tickets | VS-M4 |
| `dev_identity_test.gd` | Alice/Bob ids | |
| `protocol_test.gd` | client opcodes match | VS-T9 |
| `zone_join_test.gd` | world after FULL_STATE | |
| `movement_client_test.gd` / `prediction_test.gd` | prediction/reconcile, look-ahead vs snap-back, diagonal display, wall depenetration, player blockers | |
| `entity_registry_test.gd` / `world_render_test.gd` | presentation; trade panel does not cover Party/Progression/chat; trade name resolves to nearby userId | VS-M1 analog |
| `interaction_client_test.gd` | INTERACT, dialogue after result | |
| `quest_service_test.gd` | accept/turn-in intents | VS-T6 analog |
| `vendor_inn_service_test.gd` | vendor buy/sell, inn rest, cave enter; no client prices | |
| `cave_service_test.gd` | enter/exit opcodes, transfer metadata, overlay copy | |
| `inventory_service_test.gd` / `equipment_service_test.gd` / `wallet_service_test.gd` / `progression_service_test.gd` | mirrors; unlock buttons survive HUD refresh | VS-T5, T8 |
| `combat_client_test.gd` | attack intent, target frame with AI `state`, death overlay, combat `message`, SET_TARGET / RELEASE | VS-T3 analog |
| `ability_service_test.gd` | use/ground-target intentions, canonical hotbar/cooldown/cast bar | |
| `party_service_test.gd` | create/invite/kick/promote/disband RPCs without member lists; party_full; party chat `partyId`; HUD leader/HP/connection/Label; accept-while-in-party; party RPC does not open login modal | |
| `trade_service_test.gd` | invite/offer/gold/accept/cancel intentions; offer-change warning; completed result without local grant; HUD invite by typed character name | |
| `chat_client_test.gd` | Label, no BBCode; party payload | |
| `reconnect_test.gd` | overlay, seq adopt | |
| `e2e_hooks_test.gd` | `--e2e-slice` required | VS-T10 helper |

`fake_network_backend.gd` is a test double, not a suite.

## E2E

| Driver | Coverage | VS |
| --- | --- | --- |
| `client/scripts/e2e/slice_journey.gd` | Full two-identity loop | VS-T10, VS-M1–M3, M5 analog |

## Prompt 19 audit

| Check | Mechanism |
| --- | --- |
| Undocumented storage | Scan `server/src` collections/keys vs `expected.json` |
| Duplicate protocol ids | Parse TS + GDScript opcode tables |
| Client-writable canonical records | `permissionWrite` numeric must be 0; no client `write_storage` |
| Unpinned foundational deps | Exact `typescript`, `ajv`, `nakama-runtime`; caret build tools must stay caret + lockfile present |
| Vendor addon edits | `git diff HEAD -- client/addons` excluding `.import`/`.uid` |
| Generated content mismatch | bundle vs `content.ts` vs frozen digest |
| Missing schema versions | Player write builders include `schemaVersion`; Prompt 18 v0 blobs migrate on load |
| Test-content leakage | `content/source` file set equals production list |

## Manual (Prompt 18)

VS-M1–M5 remain defined in [VERTICAL_SLICE.md](VERTICAL_SLICE.md). Graphical two-client play is `scripts/run-two-clients.ps1`.
