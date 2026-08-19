# Storage catalog

Every Nakama storage object the runtime reads or writes. Wallet gold is listed because it is canonical currency, not because it is a storage object.

Machine-readable twin: `tools/foundation-audit/expected.json` `storageRecords`. Related: [CONTENT_MODEL.md](CONTENT_MODEL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [MIGRATIONS.md](MIGRATIONS.md).

**Defect rule:** `permissionWrite !== 0` on a canonical record is a security defect.

**Schema version:** Player records store gameplay `schemaVersion` **1** plus `createdAt` and `updatedAt` (Unix ms, camelCase). Prompt 18 blobs with no `schemaVersion` are v0 and migrate on load. OCC still uses Nakama’s object `version`. The match locator is not a player save and has no gameplay schema version. Cave, location, transfer, and trade records also are not player-save kinds.

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

## `party` / `p`


| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Purpose           | Canonical temporary party record (`p_<partyId>`). Not a player-save kind.                      |
| Owner             | Server `PartyService` RPCs                                                                     |
| Scope             | System user `00000000-0000-0000-0000-000000000000`                                             |
| `permissionRead`  | 1                                                                                              |
| `permissionWrite` | 0                                                                                              |
| Schema version    | 1 (party schema, not `SAVE_SCHEMA_VERSION`)                                                    |
| Creation          | `party_create`                                                                                 |
| Read              | Party RPCs; match join/resume and reward/cave revalidation by revision                         |
| Update            | Invite/accept/leave/kick/promote/disband; connection grace; OCC `revision`                     |
| Concurrency       | Storage version plus party `revision`                                                          |
| Migration         | None. Parties are not permanently persistent.                                                  |
| Deletion          | Expire marker written on disband or all-absent grace; indexes cleared. No `storageDelete`.     |
| Client access     | No. Clients receive `FULL_STATE.party` / `PARTY_STATE` only.                                   |


Value: `{ partyId, leaderCharacterId, members, invites, revision, createdAt, lastActiveAt, expiresAt, schemaVersion, lootPolicy, byRequestId, allAbsentSince? }`. Members: `{ accountUserId, characterId, displayName, joinedAt, connectionState, lastSeenAt }`. Idle TTL 4 h, refreshed on activity.

## `player` / `party`


| Field             | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| Purpose           | Per-character party index (`party_<compactCharacterId>`)       |
| Owner             | Server party RPCs                                              |
| Scope             | Account-scoped                                                 |
| `permissionRead`  | 1                                                              |
| `permissionWrite` | 0                                                              |
| Schema version    | 1                                                              |
| Creation          | Create/accept                                                  |
| Read              | Party RPCs, chat membership, match cache refresh               |
| Update            | Join, leave, disband, pending invite                           |
| Deletion          | Empty index on leave/disband                                   |
| Client access     | No                                                             |


Value: `{ schemaVersion, characterId, partyId, pendingPartyId }`.

## `cave` / `c`


| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Purpose           | Canonical cave-instance record (`c_<instanceId>`). Not a player-save kind.                     |
| Owner             | Server cave allocation / match terminate                                                       |
| Scope             | System user `00000000-0000-0000-0000-000000000000`                                             |
| `permissionRead`  | 0                                                                                              |
| `permissionWrite` | 0                                                                                              |
| Schema version    | 1 (cave schema, not `SAVE_SCHEMA_VERSION`)                                                     |
| Creation          | `find_or_create_owned_cave` / match-loop enter                                                 |
| Read              | Cave RPCs, match join, `find_or_create_starter_zone` reconnect                                 |
| Update            | Occupancy touch, completion, empty grace, expire, terminate                                    |
| Concurrency       | Owner index first-write-wins; lost create race is `instance_not_ready`                         |
| Migration         | None                                                                                           |
| Deletion          | Lifecycle `terminated` / `expired`; records are not reused                                     |
| Client access     | No. Clients receive `FULL_STATE.instance` and transfer extras only.                            |


Value: `{ instanceId, zoneTemplateId, matchId, ownerPartyId?, ownerCharacterId?, createdAt, lastActiveAt, expiresAt, lifecycleState, contentVersion, completionState, schemaVersion }`.

## `cave_index` / `owner`


| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Purpose           | Owner → instance index (`owner_party_<id>` or `owner_character_<id>`) |
| Owner             | Server cave allocation                                                |
| Scope             | System user                                                           |
| `permissionRead`  | 0                                                                     |
| `permissionWrite` | 0                                                                     |
| Schema version    | 1                                                                     |
| Creation          | First successful allocation for that owner                            |
| Read              | `findOrCreateOwnedCave`                                               |
| Update            | Cleared when the cave expires or terminates                           |
| Client access     | No                                                                    |


Value: `{ schemaVersion, ownerKind, ownerId, instanceId }`.

## `player` / `cave`


| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| Purpose           | Per-character active cave association (`cave_<compactId>`)|
| Owner             | Server cave allocation / exit / terminate                |
| Scope             | Account-scoped                                           |
| `permissionRead`  | 1                                                        |
| `permissionWrite` | 0                                                        |
| Schema version    | 1                                                        |
| Creation          | Enter / associate                                        |
| Read              | Join eligibility                                         |
| Update            | Cleared on exit or cave destroy                          |
| Client access     | No                                                       |


Value: `{ schemaVersion, characterId, instanceId }`.

## `player` / `location`


| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Purpose           | Canonical active location (`location_<compactCharacterId>`)           |
| Owner             | Server match join/leave/transfer                                      |
| Scope             | Account-scoped                                                        |
| `permissionRead`  | 1                                                                     |
| `permissionWrite` | 0                                                                     |
| Schema version    | 1 (location schema, not `SAVE_SCHEMA_VERSION`)                        |
| Creation          | First successful match join                                           |
| Read              | Join presence gate, cave RPCs, `find_or_create_starter_zone`          |
| Update            | Checkpoint, transfer `issued`/`in_flight`/`idle`, destination commit  |
| Client access     | No                                                                    |


Value: `{ instanceType, zoneTemplateId, instanceId, matchId, position, characterId, accountUserId, selectionTicketId?, lastCheckpointAt, transferState, schemaVersion }`. `transferState` is `idle` / `issued` / `in_flight`.

## `transfer` / `t`


| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Purpose           | One-time transfer ticket (`t_<ticketId>`)            |
| Owner             | Origin match loop issues; destination join consumes  |
| Scope             | System user                                          |
| `permissionRead`  | 0                                                    |
| `permissionWrite` | 0                                                    |
| Schema version    | 1                                                    |
| Creation          | After eligible `CAVE_ENTER` / `CAVE_EXIT`            |
| Read              | Destination `matchJoinAttempt` / `matchJoin`         |
| Update            | `consumedAt` set once                                |
| Deletion          | Not deleted; reuse is `ticket_reused`                |
| Client access     | Ticket id only, via `ACTION_RESULT` extras           |


Value: `{ ticketId, characterId, accountUserId, originMatchId, destinationMatchId, destinationInstanceId, issuedAt, expiresAt, consumedAt, schemaVersion }`. TTL 25 s.

## `trade` / `t`


| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Purpose           | Canonical nearby trade (`t_<tradeId>`): participants, state, revision, offers, gold, acceptances |
| Owner             | Server match loop                                                                              |
| Scope             | System user                                                                                    |
| `permissionRead`  | 1                                                                                              |
| `permissionWrite` | 0                                                                                              |
| Schema version    | 1                                                                                              |
| Creation          | `TRADE_INVITE`                                                                                 |
| Read              | Join recovery; commit                                                                          |
| Update            | Offer/accept/cancel/commit                                                                     |
| Deletion          | Not deleted; completed/cancelled remain                                                        |
| Client access     | Via `TRADE_STATE` only                                                                         |


Value: `{ schemaVersion, tradeId, participantA, participantB, state, revision, offers, goldOffers, acceptanceRevisionByParticipant, createdAt, expiresAt, createdAtTick, expiresAtTick, inviteExpiresAtTick, matchId, byRequestId, commitRequestId?, cancelReason?, commitSnapshot?, audits? }`. States: `inviting` / `open` / `committing` / `completed` / `cancelled`. Not a player-save kind.

## `player` / `trade`


| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| Purpose           | Live trade index for a character (`trade_<compactId>`) |
| Owner             | Server match loop                                  |
| Scope             | Account-scoped                                     |
| `permissionRead`  | 1                                                  |
| `permissionWrite` | 0                                                  |
| Schema version    | 1                                                  |
| Creation          | Invite                                             |
| Read              | Join recovery                                      |
| Update            | Cleared when the trade completes or cancels        |
| Client access     | No                                                 |


Value: `{ schemaVersion, characterId, tradeId, state }`. `tradeId` is empty after complete/cancel.

## `player` / `trade_audit`


| Field             | Value                                      |
| ----------------- | ------------------------------------------ |
| Purpose           | Last trade audit event (`trade_audit_<compactId>`) |
| Owner             | Server commit                              |
| Scope             | Account-scoped                             |
| `permissionRead`  | 1                                          |
| `permissionWrite` | 0                                          |
| Schema version    | 1                                          |
| Creation          | Successful or recovered commit             |
| Client access     | No                                         |


Value: `{ schemaVersion, characterId, requestId, reasonType, reasonId, goldDelta, resultingBalance, code, ok, metadata }`. `reasonType` is `trade`.

## `gm` / `allowlist`


| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Purpose           | Server-owned GM authorization. Default `{ enabled: false, userIds: [], customIds: [], emails: [] }` disables all commands. |
| Owner             | Operators via Nakama console / storage write. Never the Godot client.                          |
| Scope             | System user `00000000-0000-0000-0000-000000000000`                                             |
| `permissionRead`  | 0                                                                                              |
| `permissionWrite` | 0                                                                                              |
| Schema version    | 1                                                                                              |
| Client access     | No                                                                                             |


## `gm` / `recent`


| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| Purpose           | Ring of recent GM audit ids (max 20)               |
| Owner             | Server `gm_command`                                |
| Scope             | System user                                        |
| `permissionWrite` | 0                                                  |
| Schema version    | 1                                                  |
| Client access     | No                                                 |


## `gm` / `r`


| Field             | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Purpose           | Match-signal result keyed `r_<requestId>` so the RPC can read live apply outcome |
| Owner             | Match `matchSignal` GM path                                           |
| Scope             | System user                                                           |
| `permissionWrite` | 0                                                                     |
| Schema version    | 1                                                                     |
| Client access     | No                                                                    |


## `gm_audit` / `a`


| Field             | Value                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Purpose           | One audit object per GM command: administrator user, target character, command, reason, timestamp, result |
| Owner             | Server `gm_command`                                                                            |
| Scope             | System user; keys `a_<auditId>`                                                                |
| `permissionRead`  | 0                                                                                              |
| `permissionWrite` | 0                                                                                              |
| Schema version    | 1                                                                                              |
| Client access     | No. Operators read storage or `view_recent_transaction_audit`.                                 |


## `ops` / `maintenance`


| Field             | Value |
| ----------------- | --- |
| Purpose           | Server-controlled maintenance: reject new gameplay joins, optional transaction block, shutdown warning timestamps, operator message |
| Owner             | Server `ops_set_maintenance` (GM allowlist) and optional `VIBECODE_MAINTENANCE` env force-on at load |
| Scope             | System user `00000000-0000-0000-0000-000000000000` |
| `permissionRead`  | 0 |
| `permissionWrite` | 0 |
| Schema version    | 1 |
| Client access     | No. Clients see `server_maintenance` / handshake `maintenance` and `SYSTEM_MESSAGE`. |


## `ops` / `metrics`


| Field             | Value |
| ----------------- | --- |
| Purpose           | Optional persisted snapshot of in-memory ops counters |
| Owner             | Server match/RPC adapters |
| Scope             | System user |
| `permissionRead`  | 0 |
| `permissionWrite` | 0 |
| Schema version    | 1 |
| Client access     | No. Summaries also appear on `vibecode_health` / `ops_status`. |


## `account_compat` / `email_index`


| Field             | Value |
| ----------------- | --- |
| Purpose           | ACCT-01 compatibility index proving HMAC email lookup. Not a player save. Value is `{ hmac, userId }` only. |
| Owner             | Server `acct_compat_probe` when `developmentToolsEnabled` |
| Scope             | Account-scoped |
| `permissionRead`  | 0 |
| `permissionWrite` | 0 |
| Schema version    | absent (not a player-save kind) |
| Creation          | Test `put` only |
| Read              | `storageRead` after three-argument `storageIndexList` on index `acct_compat_email_hmac` with `+value.hmac:<hex>`. Never trust the index alone. |
| Update            | Overwrite hmac for changed-email proofs |
| Deletion          | Test `delete_object` or recorded account delete |
| Client access     | No. The Godot client does not call this RPC. |


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

Match-only: live pose interpolation, health, slime AI, ground loot, cooldowns, `actionRates`, disconnected grace records, and the in-match party cache (invalidated on `revision`). Health is still not a canonical field; if a v0 blob had a `health` extra, migration preserves it and join still uses full `player.base.maxHealth`. Temporary party records live in storage until grace/idle expiry; they are not a player-save kind. Cave completion and ownership persist; transient cave enemies and combat effects do not. Live trades persist for recovery; they are not a player-save kind.

No custom SQL tables.