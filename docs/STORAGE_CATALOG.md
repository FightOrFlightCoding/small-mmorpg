# Storage catalog

Every Nakama storage object the runtime reads or writes. Wallet gold is listed because it is canonical currency, not because it is a storage object.

Machine-readable twin: `tools/foundation-audit/expected.json` `storageRecords`. Related: [CONTENT_MODEL.md](CONTENT_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [MIGRATIONS.md](MIGRATIONS.md).

**Defect rule:** `permissionWrite !== 0` on a canonical record is a security defect.

**Schema version:** Player records store gameplay `schemaVersion` **1** plus `createdAt` and `updatedAt` (Unix ms, camelCase). Prompt 18 blobs with no `schemaVersion` are v0 and migrate on load. OCC still uses Nakama’s object `version`. The match locator is not a player save and has no gameplay schema version.

## `player` / `character`


| Field             | Value                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | One character record: id, account, display/canonical name, class, timestamps, checkpointed position                                                                           |
| Owner             | Server (`character_create` / Prompt 18 `character_bootstrap` wrapper; match checkpoints)                                                                                      |
| Scope             | Account-scoped (Nakama `userId`). Gameplay objects for a selected character use key `character_<compactCharacterId>` with the legacy key `character` as a Prompt 18 fallback. |
| `permissionRead`  | 1 (owner)                                                                                                                                                                     |
| `permissionWrite` | 0                                                                                                                                                                             |
| Schema version    | 1                                                                                                                                                                             |
| Creation          | `character_create` or bootstrap-via-roster; migrate copies the Prompt 18 object into the first slot without duplicating inventory, quests, or gold                            |
| Read              | List/create/select; `matchJoin` / `matchJoinAttempt` (migrate then persist once)                                                                                              |
| Update            | Position checkpoint every 5 s if changed; leave; terminate; soft-delete/restore timestamps                                                                                    |
| Concurrency       | `storageWriteRetry` with object version on checkpoint                                                                                                                         |
| Migration         | v0 → v1 on load; Prompt 18 account key becomes slot 1; missing `classId` is filled from the content class flagged `legacyMigrationDefault`                                    |
| Deletion          | Soft-delete sets `deletedAt`. Live slot count ignores deleted rows. Restore is allowed while live count < 3.                                                                  |
| Client access     | Must not write. May see fields only via RPC response / FULL_STATE pose, not by storage read.                                                                                  |


Value: `{ schemaVersion, createdAt, updatedAt, lastPlayedAt, deletedAt, characterId, accountUserId, name, canonicalName, classId, contentId, zoneId, position: { x, y } }`. `storageVersion` in the bootstrap RPC response is the Nakama OCC version, not stored in the JSON value.

## `player` / `roster`


| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| Purpose           | Ordered character ids for the account (max 3 live) |
| Owner             | Server character RPCs                              |
| Scope             | Account-scoped                                     |
| `permissionRead`  | 1                                                  |
| `permissionWrite` | 0                                                  |
| Schema version    | 1                                                  |
| Creation          | First create or Prompt 18 migrate                  |
| Read              | `character_list` and other character RPCs          |
| Update            | Create, soft-delete (id remains), restore          |
| Concurrency       | Server-owned rewrite of the roster object          |
| Client access     | No. Clients receive the list payload only.         |




## `player` / `selection`


| Field             | Value                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Purpose           | Short-lived selection ticket for match join (TTL 300 s). One active selection per account. |
| Owner             | Server `character_select`; match invalidates on successful join                            |
| Scope             | Account-scoped                                                                             |
| `permissionRead`  | 1                                                                                          |
| `permissionWrite` | 0                                                                                          |
| Schema version    | 1                                                                                          |
| Creation          | `character_select`                                                                         |
| Read              | `matchJoinAttempt`                                                                         |
| Update            | Invalidate after join; selecting again replaces the ticket                                 |
| Client access     | Ticket id only, via RPC. Join metadata may carry `selectionTicket`, never `characterId`.   |




## `names` / `n`


| Field             | Value                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Purpose           | Canonical-name reservation prefix. Actual objects are system-owned keys `n_<encoded canonical name>`. |
| Owner             | Server create path                                                                                    |
| Scope             | System user `00000000-0000-0000-0000-000000000000`                                                    |
| `permissionRead`  | 0                                                                                                     |
| `permissionWrite` | 0                                                                                                     |
| Schema version    | Absent (reservation token, not a player save)                                                         |
| Creation          | Write token, re-read; loser is `name_taken`                                                           |
| Client access     | No.                                                                                                   |


Value: `{ canonicalName, characterId, accountUserId, token }`.

## `player` / `quests`


| Field         | Value                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Purpose       | Quest log, accept/turn-in `requestId` maps, tick stamps                                          |
| Owner         | Server match                                                                                     |
| Scope         | Account-scoped; per-character key when selected                                                  |
| Read          | `matchJoin` (migrate if present)                                                                 |
| Update        | Accept; pickup objective progress; turn-in `multiUpdate`                                         |
| Concurrency   | OCC version on write; turn-in retries version conflicts up to 5                                  |
| Migration     | v0 → v1 on load; persist once. Corrupt required fields reject join; they are not reset to empty. |
| Deletion      | None                                                                                             |
| Client access | Mirror via `FULL_STATE` / `QUEST_STATE` only                                                     |


Inventory, quests, and equipment for a selected character use `inventory_<compactId>`, `quests_<compactId>`, and `equipment_<compactId>` when a `characterId` is known, with the Prompt 18 keys as fallbacks so migrated slice data is not duplicated. Gold stays the account Nakama wallet.

## `player` / `inventory`


| Field             | Value                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose           | Stacks, instance ids, locks, pickup and mutation `requestId` history                                                                                           |
| Owner             | Server match                                                                                                                                                   |
| Scope             | Account-scoped; per-character key when selected                                                                                                                |
| `permissionRead`  | 1                                                                                                                                                              |
| `permissionWrite` | 0                                                                                                                                                              |
| Schema version    | 1                                                                                                                                                              |
| Creation          | New characters initialize from the class `startingEquipment` list. Present Prompt 18 inventories are copied onto the migrated character key, never re-granted. |
| Read              | `matchJoin`                                                                                                                                                    |
| Update            | Successful pickup, destroy, split, move; turn-in consume/grant                                                                                                 |
| Concurrency       | OCC; loot/equipment/destroy and turn-in go through `commitTransaction` / `multiUpdate`                                                                         |
| Migration         | v0 → v1 on load; persist once. Corrupt present records reject join (no starter grant).                                                                         |
| Deletion          | None                                                                                                                                                           |
| Client access     | Mirror via `FULL_STATE` / `INVENTORY_STATE`. GLoot is display-only.                                                                                            |




## `player` / `equipment`


| Field         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Purpose       | Content-defined slot instance ids, equip `requestId` history   |
| Owner         | Server match                                                   |
| Scope         | Account-scoped; per-character key when selected                |
| Read          | `matchJoin`                                                    |
| Update        | Successful equip/unequip; join repair if instance missing      |
| Concurrency   | OCC version                                                    |
| Migration     | v0 → v1 on load; persist once. Equipped instance id preserved. |
| Deletion      | None                                                           |
| Client access | Mirror via `FULL_STATE` / `EQUIPMENT_STATE`                    |




## `player` / `wallet_ref`


| Field             | Value                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Purpose           | Versioned pointer that this account uses Nakama wallet gold. Does **not** store the gold amount. |
| Owner             | Server join / migration CLI                                                                      |
| Scope             | Account-scoped                                                                                   |
| `permissionRead`  | 1                                                                                                |
| `permissionWrite` | 0                                                                                                |
| Schema version    | 1                                                                                                |
| Creation          | Created on join or migrate if missing                                                            |
| Read              | Join / migration tooling                                                                         |
| Update            | Envelope only; gold changes stay on the wallet                                                   |
| Concurrency       | OCC                                                                                              |
| Migration         | Missing → v1 `{ currencies: ["gold"] }` without crediting gold                                   |
| Deletion          | None                                                                                             |
| Client access     | No. Gold is mirrored via `FULL_STATE.wallet` / `WALLET_STATE`.                                   |


Value: `{ schemaVersion, createdAt, updatedAt, currencies: ["gold"] }`.

## `player` / `progression`


| Field             | Value                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Purpose           | Per-character level, XP, allocated attributes, unspent points, unlocked abilities, hotbar, optional ranks |
| Owner             | Server match (trusted XP grants, `ALLOCATE_ATTRIBUTES`, `UNLOCK_ABILITY`, `ASSIGN_HOTBAR`)                 |
| Scope             | Account-scoped; key `progression_<compactCharacterId>`                                                     |
| `permissionRead`  | 1                                                                                                          |
| `permissionWrite` | 0                                                                                                          |
| Schema version    | 1 (`schemaVersion` envelope plus `progressionSchemaVersion`)                                               |
| Creation          | Join initializes level 1, 0 XP, class `pointsAtCreate`, class `startingAbilities` when the blob is missing |
| Read              | `matchJoin`                                                                                                |
| Update            | Kill credit, quest XP, admin domain grant, attribute allocation, ability unlock, hotbar assignment, request-id prune |
| Concurrency       | OCC `storageWriteRetry`                                                                                    |
| Migration         | Missing is not join-fatal: initialize and persist once. Present v0 → v1 on load                            |
| Deletion          | None (character soft-delete leaves the blob)                                                               |
| Client access     | Mirror via `FULL_STATE.progression` / `PROGRESSION_STATE`. Client never sends XP amounts.                  |


Value: `{ schemaVersion, createdAt, updatedAt, level, currentXp, lifetimeXp, allocatedAttributes, unspentAttributePoints, unspentSkillPoints, unlockedAbilityIds, hotbar?, abilityRanks?, assignHotbarByRequestId?, unlockAbilityByRequestId?, hotbarRequestTicks?, unlockRequestTicks?, progressionSchemaVersion, xpByEventId, allocateByRequestId, xpEventTicks?, allocateRequestTicks? }`. Allocations are never negative. Client hotbar state is not proof of ownership.

## `match` / `starter_zone`


| Field             | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| Purpose           | Canonical running starter-zone match id                   |
| Owner             | Server system user `00000000-0000-0000-0000-000000000000` |
| Scope             | Not account-scoped                                        |
| `permissionRead`  | 0                                                         |
| `permissionWrite` | 0                                                         |
| Schema version    | Absent (not a player save)                                |
| Creation          | `find_or_create_starter_zone` persist-if-absent-or-dead   |
| Read              | Same RPC                                                  |
| Update            | When stored match is dead; OCC version                    |
| Concurrency       | Retry; raced empty matches time out                       |
| Migration         | None                                                      |
| Deletion          | Not deleted; overwritten when dead                        |
| Client access     | No. Clients receive `matchId` from the RPC only.          |


Value: `{ matchId }`.

## Nakama wallet `gold`


| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Purpose        | Primary currency                                                                                         |
| Owner          | Server turn-in via `nk.multiUpdate`                                                                      |
| Scope          | Account                                                                                                  |
| Permissions    | Nakama wallet (not storage `permissionWrite`)                                                            |
| Schema version | N/A (amount lives in the wallet; `player`/`wallet_ref` versions the pointer)                             |
| Creation       | Implicit empty wallet                                                                                    |
| Read           | `accountGetId` on join; after turn-in ack                                                                |
| Update         | Quest reward changeset `{ gold: +25 }` with ledger metadata (`source`, `questId`, `requestId`, item ids) |
| Concurrency    | `multiUpdate` through the transaction boundary with related storage                                      |
| Migration      | Observed only. Never credited by the v0→v1 kernel.                                                       |
| Deletion       | None                                                                                                     |
| Client access  | Mirror via `FULL_STATE.wallet` / `WALLET_STATE`. Client never sends gold.                                |




## Not stored

Match-only: live pose interpolation, health, slime AI, ground loot, cooldowns, `actionRates`, disconnected grace records. Health is still not a canonical field; if a v0 blob had a `health` extra, migration preserves it and join still uses full `player.base.maxHealth`.

No custom SQL tables.