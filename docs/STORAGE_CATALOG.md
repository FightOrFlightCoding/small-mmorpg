# Storage catalog

Every Nakama storage object the Prompt 18 runtime reads or writes. Wallet gold is listed because it is canonical currency, not because it is a storage object.

Machine-readable twin: `tools/foundation-audit/expected.json` `storageRecords`. Related: [CONTENT_MODEL.md](CONTENT_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md).

**Defect rule:** `permissionWrite !== 0` on a canonical record is a security defect. Prompt 18 has none.

**Schema version:** Prompt 18 values have **no** gameplay `schemaVersion` field. OCC uses Nakama’s object `version`. Existing Prompt 18 characters must remain loadable; adding schema versions is a later idempotent migration.

## `player` / `character`

| Field | Value |
| --- | --- |
| Purpose | One character per account: id, name, content id, zone id, checkpointed position |
| Owner | Server (`character_bootstrap` create; match checkpoints) |
| Scope | Account-scoped (Nakama `userId`) |
| `permissionRead` | 1 (owner) |
| `permissionWrite` | 0 |
| Schema version | Absent |
| Creation | `character_bootstrap` via `writeCharacter` (create-if-absent retry) |
| Read | Bootstrap; `matchJoin` |
| Update | Position checkpoint every 5 s if changed; leave; terminate (`writeCharacterCheckpoint`, OCC version) |
| Concurrency | `storageWriteRetry` with object version on checkpoint; create writes nothing if a record already exists |
| Migration | None. Load ignores unknown extra fields except required keys. |
| Deletion | None. Account deletion is Nakama’s, not implemented. |
| Client access | Must not write. May see fields only via RPC response / FULL_STATE pose, not by storage read. |

Value: `{ characterId, name, contentId, zoneId, position: { x, y } }`. `storageVersion` in the RPC response is the Nakama OCC version, not stored in the JSON value.

## `player` / `quests`

| Field | Value |
| --- | --- |
| Purpose | Quest log, accept/turn-in `requestId` maps, tick stamps |
| Owner | Server match |
| Scope | Account-scoped |
| `permissionRead` | 1 |
| `permissionWrite` | 0 |
| Schema version | Absent |
| Creation | First successful `QUEST_ACCEPT` write; missing record loads as empty log |
| Read | `matchJoin` |
| Update | Accept; pickup objective progress; turn-in `multiUpdate` |
| Concurrency | OCC version on write; turn-in retries version conflicts up to 5 |
| Migration | None |
| Deletion | None |
| Client access | Mirror via `FULL_STATE` / `QUEST_STATE` only |

## `player` / `inventory`

| Field | Value |
| --- | --- |
| Purpose | Stacks, instance ids, pickup `requestId` history |
| Owner | Server match |
| Scope | Account-scoped |
| `permissionRead` | 1 |
| `permissionWrite` | 0 |
| Schema version | Absent |
| Creation | Join initializes once: capacity 20, one `item.training_sword` (`writeInventoryOnce`) |
| Read | `matchJoin` |
| Update | Successful pickup; turn-in consume/grant |
| Concurrency | OCC; turn-in `multiUpdate` with quests + wallet |
| Migration | None |
| Deletion | None |
| Client access | Mirror via `FULL_STATE` / `INVENTORY_STATE`. GLoot is display-only. |

## `player` / `equipment`

| Field | Value |
| --- | --- |
| Purpose | `main_hand` instance id, equip `requestId` history |
| Owner | Server match |
| Scope | Account-scoped |
| `permissionRead` | 1 |
| `permissionWrite` | 0 |
| Schema version | Absent |
| Creation | Missing record starts empty on join |
| Read | `matchJoin` |
| Update | Successful equip/unequip; join repair if instance missing |
| Concurrency | OCC version |
| Migration | None |
| Deletion | None |
| Client access | Mirror via `FULL_STATE` / `EQUIPMENT_STATE` |

## `match` / `starter_zone`

| Field | Value |
| --- | --- |
| Purpose | Canonical running starter-zone match id |
| Owner | Server system user `00000000-0000-0000-0000-000000000000` |
| Scope | Not account-scoped |
| `permissionRead` | 0 |
| `permissionWrite` | 0 |
| Schema version | Absent |
| Creation | `find_or_create_starter_zone` persist-if-absent-or-dead |
| Read | Same RPC |
| Update | When stored match is dead; OCC version |
| Concurrency | Retry; raced empty matches time out |
| Migration | None |
| Deletion | Not deleted; overwritten when dead |
| Client access | No. Clients receive `matchId` from the RPC only. |

Value: `{ matchId }`.

## Nakama wallet `gold`

| Field | Value |
| --- | --- |
| Purpose | Primary currency |
| Owner | Server turn-in via `nk.multiUpdate` |
| Scope | Account |
| Permissions | Nakama wallet (not storage `permissionWrite`) |
| Schema version | N/A |
| Creation | Implicit empty wallet |
| Read | `accountGetId` on join; after turn-in ack |
| Update | Quest reward changeset `{ gold: +25 }` with ledger metadata (`source`, `questId`, `requestId`, item ids) |
| Concurrency | `multiUpdate` with inventory + quests |
| Migration | None |
| Deletion | None |
| Client access | Mirror via `FULL_STATE.wallet` / `WALLET_STATE`. Client never sends gold. |

## Not stored

Match-only: live pose interpolation, health, slime AI, ground loot, cooldowns, `actionRates`, disconnected grace records.

No custom SQL tables. No other collections appear in `server/src`.
