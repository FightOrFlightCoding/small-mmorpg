# Test catalog

Prompt 18 automated suites plus the Prompt 19 freeze audit. Do not weaken these tests. Counts below are the accepted Prompt 18 gate (2026-08-16) unless noted.

Related: [VERTICAL_SLICE.md](VERTICAL_SLICE.md), [FOUNDATION_BASELINE.md](FOUNDATION_BASELINE.md).

## Gates

| Command | What it proves |
| --- | --- |
| `scripts/test-content` | Content-build tests + matching `contentHash` (development-only exclusion, diff, trace) |
| `scripts/test-audit` | Catalog vs code: storage, opcodes, pins, vendor dirty (non-import), player `schemaVersion` presence, test-content leakage, hardcoded ID allowlist |
| `scripts/test-server` | Nakama domain tests 181/181 |
| `scripts/test-client` | Import, `SHELL_LOGIN`, GdUnit 122/122 0 orphans |
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
| `movement.test.ts` | teleport/overspeed, seq | VS-T2 |
| `combat.test.ts` | server damage, cooldown, death, slime AI | VS-T3 |
| `inventory.test.ts` | pickup, duplicate `requestId`, capacity | VS-T4, T5 |
| `equipment.test.ts` | main_hand, derived attack | VS-T5 |
| `quest.test.ts` | accept, already_accepted | VS-T6 |
| `quest_reward.test.ts` | turn-in, `multiUpdate` fake, duplicate reward | VS-T4, T6, T7 |
| `quest_store.test.ts` | serialize/load | |
| `interaction.test.ts` | range, dead player | |
| `security.test.ts` | mapped attacks, rate limits | VS-T1–T6, T9 |
| `match.test.ts` | join, empty shutdown, FULL_STATE | VS-T9 |
| `character.test.ts` | bootstrap, `permissionWrite: 0` | |
| `starter_zone_registry.test.ts` | canonical match id | |
| `persistence.test.ts` | checkpoints, grace, seq reset, Nakama null maps/extras on tick 0 | VS-M5 automated analog |
| `migration.test.ts` | v0→v1, retry, future version, missing version, null schemaVersion, corrupt, completed quest, equipment, gold | |
| `chat.test.ts` | RT hooks | |
| `content.test.ts` | generated catalog shape | VS-T8 analog |
| `health.test.ts` | `vibecode_health` | |

## Client GdUnit (`client/tests`)

| File | Coverage | VS |
| --- | --- | --- |
| `compatibility/compatibility_test.gd` | addons load | |
| `content_registry_test.gd` | catalog IDs, hash | VS-T8 |
| `error_state_test.gd` | visible errors, no hang | VS-M4 |
| `scene_router_test.gd` / `shell_scenes_test.gd` | boot/login/character/world | VS-T8 |
| `auth_flow_test.gd` | device auth, `network_unreachable` | VS-M4 |
| `dev_identity_test.gd` | Alice/Bob ids | |
| `protocol_test.gd` | client opcodes match | VS-T9 |
| `zone_join_test.gd` | world after FULL_STATE | |
| `movement_client_test.gd` / `prediction_test.gd` | prediction/reconcile | |
| `entity_registry_test.gd` / `world_render_test.gd` | presentation | VS-M1 analog |
| `interaction_client_test.gd` | INTERACT, dialogue after result | |
| `quest_service_test.gd` | accept/turn-in intents | VS-T6 analog |
| `inventory_service_test.gd` / `equipment_service_test.gd` / `wallet_service_test.gd` | mirrors | VS-T5, T8 |
| `combat_client_test.gd` | attack intent | VS-T3 analog |
| `chat_client_test.gd` | Label, no BBCode | |
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
