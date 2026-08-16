# Storage catalog

Every Nakama storage object the runtime reads or writes. Wallet gold is listed because it is canonical currency, not because it is a storage object.

Machine-readable twin: `tools/foundation-audit/expected.json` `storageRecords`. Related: [CONTENT_MODEL.md](CONTENT_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [MIGRATIONS.md](MIGRATIONS.md).

**Defect rule:** `permissionWrite !== 0` on a canonical record is a security defect.

**Schema version:** Player records store gameplay `schemaVersion` **1** plus `createdAt` and `updatedAt` (Unix ms, camelCase). Prompt 18 blobs with no `schemaVersion` are v0 and migrate on load. OCC still uses Nakama’s object `version`. The match locator is not a player save and has no gameplay schema version.

## `player` / `character`

| Field | Value |
| --- | --- |
| Purpose | One character per account: id, name, content id, zone id, checkpointed position |
| Owner | Server (`character_bootstrap` create; match checkpoints) |
| Scope | Account-scoped (Nakama `userId`) |
| `permissionRead` | 1 (owner) |
| `permissionWrite` | 0 |
| Schema version | 1 |
| Creation | `character_bootstrap` via `writeCharacter` (create-if-absent retry) |
| Read | Bootstrap; `matchJoin` / `matchJoinAttempt` (migrate then persist once) |
| Update | Position checkpoint every 5 s if changed; leave; terminate (`writeCharacterCheckpoint`, OCC version) |
| Concurrency | `storageWriteRetry` with object version on checkpoint; create writes nothing if a record already exists |
| Migration | v0 → v1 on load; persist once. Future versions rejected. Extra fields preserved. |
| Deletion | None. Account deletion is Nakama’s, not implemented. |
| Client access | Must not write. May see fields only via RPC response / FULL_STATE pose, not by storage read. |

Value: `{ schemaVersion, createdAt, updatedAt, characterId, name, contentId, zoneId, position: { x, y } }`. `storageVersion` in the RPC response is the Nakama OCC version, not stored in the JSON value.

## `player` / `quests`

| Field | Value |
| --- | --- |
| Purpose | Quest log, accept/turn-in `requestId` maps, tick stamps |
| Owner | Server match |
| Scope | Account-scoped |
| `permissionRead` | 1 |
| `permissionWrite` | 0 |
| Schema version | 1 |
| Creation | First successful `QUEST_ACCEPT` write; missing record loads as empty log |
| Read | `matchJoin` (migrate if present) |
| Update | Accept; pickup objective progress; turn-in `multiUpdate` |
| Concurrency | OCC version on write; turn-in retries version conflicts up to 5 |
| Migration | v0 → v1 on load; persist once. Corrupt required fields reject join; they are not reset to empty. |
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
| Schema version | 1 |
| Creation | Join initializes once when **missing**: capacity 20, one `item.training_sword` (`writeInventoryOnce`). Present Prompt 18 inventories are migrated, never re-initialized. |
| Read | `matchJoin` |
| Update | Successful pickup; turn-in consume/grant |
| Concurrency | OCC; turn-in `multiUpdate` with quests + wallet |
| Migration | v0 → v1 on load; persist once. Corrupt present records reject join (no starter grant). |
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
| Schema version | 1 |
| Creation | Missing record starts empty on join |
| Read | `matchJoin` |
| Update | Successful equip/unequip; join repair if instance missing |
| Concurrency | OCC version |
| Migration | v0 → v1 on load; persist once. Equipped instance id preserved. |
| Deletion | None |
| Client access | Mirror via `FULL_STATE` / `EQUIPMENT_STATE` |

## `player` / `wallet_ref`

| Field | Value |
| --- | --- |
| Purpose | Versioned pointer that this account uses Nakama wallet gold. Does **not** store the gold amount. |
| Owner | Server join / migration CLI |
| Scope | Account-scoped |
| `permissionRead` | 1 |
| `permissionWrite` | 0 |
| Schema version | 1 |
| Creation | Created on join or migrate if missing |
| Read | Join / migration tooling |
| Update | Envelope only; gold changes stay on the wallet |
| Concurrency | OCC |
| Migration | Missing → v1 `{ currencies: ["gold"] }` without crediting gold |
| Deletion | None |
| Client access | No. Gold is mirrored via `FULL_STATE.wallet` / `WALLET_STATE`. |

Value: `{ schemaVersion, createdAt, updatedAt, currencies: ["gold"] }`.

## `match` / `starter_zone`

| Field | Value |
| --- | --- |
| Purpose | Canonical running starter-zone match id |
| Owner | Server system user `00000000-0000-0000-0000-000000000000` |
| Scope | Not account-scoped |
| `permissionRead` | 0 |
| `permissionWrite` | 0 |
| Schema version | Absent (not a player save) |
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
| Schema version | N/A (amount lives in the wallet; `player`/`wallet_ref` versions the pointer) |
| Creation | Implicit empty wallet |
| Read | `accountGetId` on join; after turn-in ack |
| Update | Quest reward changeset `{ gold: +25 }` with ledger metadata (`source`, `questId`, `requestId`, item ids) |
| Concurrency | `multiUpdate` with inventory + quests |
| Migration | Observed only. Never credited by the v0→v1 kernel. |
| Deletion | None |
| Client access | Mirror via `FULL_STATE.wallet` / `WALLET_STATE`. Client never sends gold. |

## Not stored

Match-only: live pose interpolation, health, slime AI, ground loot, cooldowns, `actionRates`, disconnected grace records. Health is still not a canonical field; if a v0 blob had a `health` extra, migration preserves it and join still uses full `player.base.maxHealth`.

No custom SQL tables.
