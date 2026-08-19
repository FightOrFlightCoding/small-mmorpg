# Protocol catalog

Every registered match opcode, RPC, realtime hook, and authenticate hook. Duplicate numeric identifiers are a defect; `tools/foundation-audit` fails if client/server tables diverge.

Related: [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [DEPLOYMENT.md](DEPLOYMENT.md). Machine-readable opcodes/RPCs: `tools/foundation-audit/expected.json`.

Shared envelope: JSON camelCase, `protocolVersion` must be `1`. Optional client `contentHash` must match the server catalog. Client→server match bodies > **2048** bytes are `payload_too_large`. Unknown fields on client match JSON are `unknown_field:<key>`. Outcome keys are `stat_injection:<key>`.

Authentication: Nakama built-in email/password and (debug builds only) device auth. This repository registers `registerBeforeAuthenticateEmail` and `registerBeforeAuthenticateDevice` to enforce environment registration and device-auth policy (`registration_disabled`, `device_auth_disabled`). Password-recovery email is out of Foundation v1; operators reset accounts in the Nakama console.

Notifications: **none** registered.

## RPCs

### `vibecode_health`

| Field | Value |
| --- | --- |
| Direction | Client/ops → server HTTP RPC |
| Request | Empty or `{}` |
| Response | `{ ok, service, protocol_version, content_version, content_package_version, server_version, environment, min_client_version, max_client_version, maintenance, rpcs, counters }` |
| Authority | Server catalog hash |
| Auth | Nakama HTTP key (`defaulthttpkey` locally). Not a user session. |
| Rate limit | None in-app |
| Payload | Empty object; extra keys `unknown_field` |
| Idempotency | Read-only |
| Errors | `malformed_json`, `unknown_field` |
| Tests | `server/tests/health.test.ts`, `scripts/backend-verify` |

Email accounts must pass `requirePlayableUser` (`ACTIVE`, verified, not disabled, not deleting) before character, cave, party, GM, match discovery, match join, and chat. Device accounts with no email and no profile remain playable. Domain character-lifecycle unit tests do not load the profile gate; Nakama adapters do.

### `character_bootstrap`

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC |
| Request | `` or `{ "name"?: string }` |
| Response | `{ characterId, name, created, storageVersion, contentId, zoneId, baseStats, position }` |
| Authority | Compatibility wrapper: migrate Prompt 18 → roster slot 1, then return the first live character or create one |
| Auth | Nakama session (`ctx.userId` required) |
| Rate limit | None in-app |
| Payload | Strict keys; stats/position `stat_injection` |
| Idempotency | Existing live character returned unchanged |
| Errors | `unauthenticated`, `malformed_json`, `invalid_name`, `stat_injection`, `unknown_field`, `name_taken`, `slot_limit`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |
| Tests | `server/tests/character.test.ts`, `character_lifecycle.test.ts`, `client/tests/app/auth_flow_test.gd` |

### `character_list`

| Field | Value |
| --- | --- |
| Request | `{}` |
| Response | `{ slotLimit, liveCount, characters[] }` |
| Authority | Server roster |
| Errors | `unauthenticated`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |
| Tests | `character_lifecycle.test.ts`, `auth_flow_test.gd` |

### `character_create`

| Field | Value |
| --- | --- |
| Request | `{ name, classId }` |
| Response | `{ characterId, name, canonicalName, classId, created: true }` |
| Authority | Server name policy, class catalog, slot limit 3, canonical reservation |
| Errors | `invalid_name`, `invalid_class`, `name_taken`, `slot_limit`, `stat_injection`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |
| Tests | `character_lifecycle.test.ts` |

### `character_select`

| Field | Value |
| --- | --- |
| Request | `{ characterId }` |
| Response | `{ ticketId, characterId, accountUserId, expiresAt, name, classId }` |
| Authority | Ownership, not deleted, replaces the account's previous ticket |
| Errors | `character_missing`, `character_deleted`, `selection_foreign`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |
| Tests | `character_lifecycle.test.ts` |

### `character_soft_delete` / `character_restore`

| Field | Value |
| --- | --- |
| Request | `{ characterId }` |
| Response | Updated list payload |
| Authority | Soft-delete sets `deletedAt`; restore requires a free live slot |
| Tests | `character_lifecycle.test.ts` |

### `find_or_create_starter_zone`

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC |
| Request | Empty or `{}` |
| Response | `{ matchId, zoneId, instanceId, instanceType, protocolVersion, contentHash }` |
| Authority | Server public-world singleton, or a live owned cave on reconnect |
| Auth | Session required |
| Rate limit | None in-app |
| Payload | Empty object |
| Idempotency | Concurrent public-world callers converge on one match id |
| Errors | `unauthenticated`, `malformed_json`, `unknown_field`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |

### Party RPCs

Authenticated session RPCs. Canonical party state is server-owned (`PartyService` + storage). Clients send owned `characterId`, optional `revision`, and `requestId`. They never send member lists or credit/loot recipients (`stat_injection:members` and related keys). Invite by display name uses the name reservation; domain tests may pass a `PartyActor` directly.

Shared errors: `unauthenticated`, `malformed_json`, `unknown_field`, `stat_injection`, `invalid_id`, `invalid_request_id`, `character_missing`, `selection_foreign`, `already_in_party`, `party_full`, `not_leader`, `not_member`, `invite_missing`, `invite_expired`, `invalid_target`, `revision_mismatch`, `party_missing`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted`.

| RPC | Request keys | Authority |
| --- | --- | --- |
| `party_create` | `characterId`, `requestId` | Creates a size-1 party; max 5 |
| `party_invite` | `characterId`, `requestId`, `targetName`, optional `targetCharacterId`, `revision` | Leader only; invite TTL 60 s |
| `party_accept` | `characterId`, `requestId`, `partyId`, optional `revision` | Invitee ownership; capacity and membership checks |
| `party_decline` | `characterId`, `requestId`, `partyId` | Invitee only |
| `party_leave` | `characterId`, `requestId`, optional `revision` | Member; last member or leader leave disbands |
| `party_kick` | `characterId`, `requestId`, `targetCharacterId`, optional `revision` | Leader; cannot kick self |
| `party_promote` | `characterId`, `requestId`, `targetCharacterId`, optional `revision` | Leader transfers leadership |
| `party_disband` | `characterId`, `requestId`, optional `revision` | Leader; expires storage and closes party chat |
| `party_get_state` | `characterId` | Read-only unless the party was already expired |

Successful mutating RPCs `matchSignal` the starter-zone match so the in-memory party cache refreshes from `revision` without a storage read every tick. Tests: `server/tests/party.test.ts`, `client/tests/app/party_service_test.gd`.

### Cave RPCs

Authenticated session RPCs. They validate selection and eligibility and allocate or look up an owned cave. They do **not** issue transfer tickets. Tickets are issued from the match loop after `CAVE_ENTER` / `CAVE_EXIT`.

Shared errors: `unauthenticated`, `malformed_json`, `unknown_field`, `selection_required`, `character_missing`, `invalid_origin`, `already_transferring`, `player_dead`, `invalid_target`, `out_of_range`, `invalid_service`, `not_party_member`, `content_mismatch`, `instance_not_ready`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted`.

| RPC | Request keys | Authority |
| --- | --- | --- |
| `request_cave_entry` | optional `npcId` | Validates public-world entrance and returns `{ matchId, instanceId, zoneId, instanceType, protocolVersion, contentHash }` |
| `find_or_create_owned_cave` | empty or `{ npcId? }` | First-write-wins owner index; same party members share `instanceId`/`matchId` |
| `request_cave_exit` | optional `npcId` | Validates cave exit; returns the public-world locator payload |

Tests: `server/tests/cave.test.ts`.

### `gm_command`

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC |
| Request | `{ command, reason, characterId, requestId?, x?, y?, itemId?, quantity?, amount?, questId?, status?, stageIndex?, spawnId?, enemyInstanceId?, zoneTemplateId?, tradeId? }` |
| Response | `{ ok, code, command, characterId, result }` |
| Authority | Server allowlist `gm` / `allowlist`. Debug client UI is presentation only. |
| Auth | Nakama session (`ctx.userId` required) plus allowlist (`enabled` + userId / customId / email) |
| Rate limit | None in-app |
| Payload | Strict keys; `reason` required (max 240, no `token=`) |
| Idempotency | Command `requestId`; XP grants use `gm:<requestId>` |
| Errors | `unauthenticated`, `gm_disabled`, `unauthorized`, `malformed_json`, `unknown_field`, `unknown_command`, `reason_required`, `character_missing`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted`, plus per-command codes |
| Tests | `server/tests/gm.test.ts`, `client/tests/app/gm_service_test.gd` |

Commands: `inspect_character`, `teleport_character`, `repair_invalid_location`, `grant_test_item`, `remove_test_item`, `grant_test_gold`, `grant_test_xp`, `reset_attribute_allocation`, `reset_skill_allocation`, `set_quest_state`, `reset_quest`, `spawn_enemy`, `kill_enemy`, `open_cave`, `inspect_party`, `cancel_trade`, `view_recent_transaction_audit`. Not match opcodes. `open_cave` may issue a transfer ticket (GM exception to Prompt 29 match-loop tickets). Every call writes `gm_audit`.

### `session_handshake`

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC after socket connect |
| Request | `{ clientVersion, protocolVersion, contentHash, contentVersion? }` |
| Response | `{ ok, code, serverVersion, protocolVersion, contentHash, contentVersion, minClientVersion, maxClientVersion, environment, maintenance, rejectJoins, blockTransactions, message }` |
| Authority | Server catalog hash, compiled min/max client versions, protocol **1** |
| Auth | Nakama session |
| Payload | Strict keys |
| Errors | `unauthenticated`, `malformed_json`, `unknown_field`, `client_too_old`, `client_too_new`, `protocol_mismatch`, `content_mismatch` |
| Notes | Does not throw `server_maintenance` so GM/character list still work; body may set `maintenance: true` and `code: server_maintenance` |
| Tests | `server/tests/compatibility.test.ts`, `client/tests/app/handshake_test.gd` |

### `ops_status`

| Field | Value |
| --- | --- |
| Direction | Client/ops → server HTTP RPC |
| Request | Empty or `{}` |
| Response | Environment policy, maintenance block, counters |
| Auth | Nakama session |
| Errors | `unauthenticated`, `malformed_json`, `unknown_field` |

### `ops_set_maintenance`

| Field | Value |
| --- | --- |
| Direction | Operator → server HTTP RPC |
| Request | `{ enabled, message?, rejectJoins?, blockTransactions?, shutdownAt?, warnAt?, reason? }` |
| Authority | Same GM allowlist as `gm_command` |
| Errors | `unauthenticated`, `gm_disabled`, `unauthorized`, `malformed_json`, `unknown_field` |

### `acct_compat_probe`

| Field | Value |
| --- | --- |
| Direction | Compatibility tests → server HTTP RPC |
| Request | `{ op, hmac? }` where `op` is `put` / `get` / `list` / `delete_object` / `verify` / `export` / `delete_account` / `account_summary` |
| Authority | Gated by `developmentToolsEnabled`. Not a player UI. Uses `nk.accountExportId`, `nk.accountDeleteId(userId, true)`, and `nk.storageIndexList` |
| Auth | Nakama session |
| Storage | `account_compat` / `email_index`, `permissionWrite: 0`, HMAC only (no raw email) |
| Errors | `unauthenticated`, `dev_tools_disabled`, `malformed_json`, `unknown_field`, `invalid_payload` |
| Tests | `server/tests/account_compat.test.ts`, `server/tests/account_compat.live.test.ts` |

### `auth_gateway`

| Field | Value |
| --- | --- |
| Direction | Auth gateway → server HTTP RPC |
| Request | `{ assertion, op, ... }` where `op` is `ping` / `put_email_index` / `lookup_email` / `get_profile` / `mark_verified` / `challenge_put` / `challenge_get` / `challenge_find` / `challenge_consume` / `purge_unverified` / `replace_password` / `replace_email` / `delete_account` / `support_snapshot`. `assertion` is `{ request_id, timestamp, nonce, operation, payload_hash, signature }` |
| Authority | Nakama HTTP key **and** HMAC assertion using `VIBECODE_GATEWAY_HMAC_SECRET`. Session JWT is `gateway_rpc_forbidden`. Timestamp skew 60s; nonce replay cache 4096 |
| Auth | HTTP key. Not a player UI |
| Storage | `account_profile` / `email_index`, `auth_challenge` / `c_<id>`, `permissionWrite: 0`, hashes only |
| Errors | `gateway_rpc_forbidden`, `missing_assertion`, `stale_assertion`, `replayed_nonce`, `bad_signature`, `invalid_payload`, `malformed_json`, `unknown_field` |
| Tests | `server/tests/auth_gateway_rpc.test.ts`, `server/tests/gateway_assertion.test.ts`, `server/tests/auth_challenge.test.ts`, `server/tests/auth_gateway.live.test.ts` |

## Client → server match opcodes

Per-player windows (10 ticks): INPUT 20; ATTACK/USE_ABILITY/CANCEL_CAST/SET_TARGET 8; INTERACT/PICKUP/EQUIP/DESTROY_ITEM/SPLIT_STACK/MOVE_ITEM/quest/VENDOR_BUY/VENDOR_SELL/INN_REST/CAVE_ENTER/CAVE_EXIT/TRADE_*/ALLOCATE_ATTRIBUTES/ASSIGN_HOTBAR/UNLOCK_ABILITY 8; RESYNC 2. Max 24 parsed messages per player per tick. Excess: `SYSTEM_MESSAGE` `rate_limited`.

### 1 `INPUT`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, seq, axisX, axisY }` |
| Authority | Server integrates movement; client pose ignored |
| Auth | Match presence |
| Idempotency | `seq <= lastProcessedSeq` ignored |
| Errors | `stat_injection` if `x`/`y`/`speed` present; `player_dead` skip |
| Tests | `movement.test.ts`, `protocol.test.ts`, `security.test.ts`, `prediction_test.gd` |

### 2 `INTERACT`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, targetId, requestId }` |
| Authority | Server range vs per-NPC `interactionRange` (fallback `player.base.interactionRange`) |
| `requestId` | Required (correlation, not a grant) |
| Errors | `out_of_range`, `invalid_target`, `invalid_zone`, `player_dead`, `invalid_request_id` |
| Tests | `interaction.test.ts`, `interaction_client_test.gd` |

### 3 `ATTACK`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, targetId, requestId }` |
| Authority | Server derived attack, range, cooldown. When the catalog and unlock exist, ATTACK uses `player.base.basicAbilityId`; otherwise Prompt 18 `applyPlayerAttack`. |
| Idempotency | Same `requestId` does not hit twice |
| Errors | `on_cooldown`, `out_of_range`, `invalid_target`, `target_dead`, `player_dead`, `stat_injection:damage` |
| Tests | `combat.test.ts`, `security.test.ts`, `combat_client_test.gd`, `progression.test.ts` |

### 4 `PICKUP`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, lootId, requestId }` |
| Authority | Server loot entity + inventory |
| Idempotency | Successful `requestId` replays `ok` without a second grant |
| Errors | `out_of_range`, `invalid_target`, `inventory_full`, `player_dead`, `stat_injection:instanceId` |
| Tests | `inventory.test.ts`, `security.test.ts`, `inventory_service_test.gd` |

### 5 `EQUIP`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, instanceId?, slot, requestId }` |
| Authority | Server ownership, category, slot tags, class, level, locks |
| Idempotency | Successful `requestId` replays `ok` |
| Errors | `unowned`, `not_equippable`, `invalid_slot`, `invalid_id`, `player_dead`, `item_locked`, `class_restricted`, `level_restricted`, `unique_restricted`, `invalid_category` |
| Tests | `equipment.test.ts`, `equipment_service_test.gd` |

### 6 `QUEST_ACCEPT`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, questId, requestId }` |
| Authority | Server quest def + accept-NPC range, level, and class |
| Idempotency | Same `requestId` → `accepted`; later id → `already_accepted` |
| Errors | `invalid_id`, `out_of_range`, `player_dead`, `unknown_field:status` |
| Tests | `quest.test.ts`, `quest_service_test.gd` |

### 7 `QUEST_TURN_IN`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, questId, npcId, requestId }` |
| Authority | Server objectives + `multiUpdate` |
| Idempotency | Successful `requestId` replays `ok`; later id after complete → `already_completed` |
| Errors | `incomplete_objective`, `missing_item`, `already_completed`, `persist_failed`, `stat_injection:gold` |
| Tests | `quest_reward.test.ts`, `security.test.ts`, e2e slice |

### 8 `RESYNC_REQUEST`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion }` |
| Authority | Server `FULL_STATE` |
| Rate limit | 2 / window |
| Tests | `match.test.ts`, `reconnect_test.gd` |

### 9 `ALLOCATE_ATTRIBUTES`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, attributeId, amount, requestId }` (`amount` is a JSON number) |
| Authority | Server unspent points, class `allowedAttributeIds`, content attribute catalog |
| Idempotency | Same `requestId` replays the stored result |
| Errors | `invalid_amount`, `unknown_attribute`, `class_restricted`, `insufficient_points`, `invalid_request_id`, `stat_injection:xp` |
| Rate limit | 8 / window |
| Tests | `progression.test.ts`, `progression_service_test.gd` |

### 10 `DESTROY_ITEM`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, instanceId, quantity?, requestId }` (`quantity` optional JSON number) |
| Authority | Server destroyable flag, locks, equipped check |
| Idempotency | Successful `requestId` replays `ok` |
| Errors | `not_destroyable`, `item_locked`, `item_equipped`, `invalid_id`, `player_dead` |
| Rate limit | Shares EQUIP window (8) |
| Tests | `inventory.test.ts`, `inventory_service_test.gd` |

### 11 `SPLIT_STACK`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, instanceId, quantity, requestId }` (`quantity` is a JSON number) |
| Authority | Server generates the new `instanceId` |
| Idempotency | Successful `requestId` replays `ok` without a second split |
| Errors | `inventory_full`, `item_locked`, `item_equipped`, `invalid_id`, `player_dead` |
| Rate limit | Shares EQUIP window (8) |
| Tests | `inventory.test.ts`, `inventory_service_test.gd` |

### 12 `MOVE_ITEM`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, instanceId, toSlotIndex, requestId }` (`toSlotIndex` is a JSON number) |
| Authority | Server slot indices; local GLoot drag is display-only |
| Idempotency | Successful `requestId` replays `ok` |
| Errors | `invalid_slot`, `item_locked`, `invalid_id`, `player_dead` |
| Rate limit | Shares EQUIP window (8) |
| Tests | `inventory.test.ts` |

### 13 `USE_ABILITY`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, abilityId, targetId?, targetX?, targetY?, requestId }` |
| Authority | Server catalog, unlocks, range, relation, resources, cooldowns, control, LOS |
| Idempotency | Same `requestId` replays the stored result |
| Errors | `ability_locked`, `out_of_range`, `pvp_disabled`, `invalid_relation`, `insufficient_resource`, `on_cooldown`, `on_global_cooldown`, `invalid_target`, `control_restricted`, `already_casting`, `line_of_sight`, `stat_injection:*` |
| Rate limit | Shares ATTACK window (8) |
| Tests | `ability.test.ts`, `ability_service_test.gd` |

### 14 `CANCEL_CAST`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, requestId }` |
| Authority | Server active cast |
| Errors | `not_casting` |
| Rate limit | Shares ATTACK window (8) |
| Tests | `ability.test.ts` |

### 15 `ASSIGN_HOTBAR`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, slotIndex, abilityId?, requestId }` (`slotIndex` is a JSON number; omit `abilityId` to clear) |
| Authority | Server unlock list; client hotbar is not proof of ownership |
| Errors | `invalid_slot`, `ability_locked` |
| Rate limit | Shares ALLOCATE window (8) |
| Tests | `ability.test.ts` |

### 16 `UNLOCK_ABILITY`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, abilityId, requestId }` |
| Authority | Server skill points, level, class tags, prerequisites |
| Idempotency | Same `requestId` replays the stored result |
| Errors | `insufficient_points`, `already_unlocked`, `level_restricted`, `class_restricted`, `prerequisite_missing` |
| Rate limit | Shares ALLOCATE window (8) |
| Tests | `ability.test.ts` |

### 17 `SET_TARGET`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, targetId?, intent?, requestId }` |
| Authority | Match entity ids; other players are friendly |
| Idempotency | Same `requestId` replays the stored result |
| Errors | `invalid_target`, `target_dead`, `pvp_disabled`, `invalid_relation`, `invalid_id` |
| Rate limit | Shares ATTACK window (8) |
| Tests | `combat_pipeline.test.ts`, `targeting.test.ts`, `combat_client_test.gd` |

### 18 `RELEASE_RESPAWN`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, requestId }` |
| Authority | Server death flag and respawn destination (live bind or `zone.starter.playerSpawn`) |
| Idempotency | Same `requestId` replays the stored result |
| Errors | `not_dead`, `player_missing` |
| Rate limit | Shares ALLOCATE window (8) |
| Tests | `combat_pipeline.test.ts`, `combat_client_test.gd` |

### 19 `VENDOR_BUY`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, npcId, itemId, quantity?, requestId }` |
| Authority | Server vendor stock and prices; client must not send `price` / `gold` |
| Idempotency | Successful `requestId` replays `ok` without a second grant |
| Errors | `invalid_id`, `out_of_range`, `insufficient_gold`, `inventory_full`, `class_restricted`, `level_restricted`, `player_dead`, `unknown_field:price`, `stat_injection:gold` |
| Rate limit | Shares quest window (8) |
| Tests | `vendor.test.ts`, `protocol.test.ts`, `vendor_inn_service_test.gd` |

### 20 `VENDOR_SELL`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, npcId, instanceId, quantity?, requestId }` |
| Authority | Server sell value × vendor multiplier; equipped is `item_locked`; floor 0 is unsellable |
| Idempotency | Successful `requestId` replays `ok` without a second gold grant |
| Errors | `invalid_id`, `out_of_range`, `unowned`, `item_locked`, `unsellable`, `player_dead` |
| Rate limit | Shares quest window (8) |
| Tests | `vendor.test.ts`, `protocol.test.ts`, `vendor_inn_service_test.gd` |

### 21 `INN_REST`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, npcId, mode?, requestId }` (`mode` is `inn` or `healer`) |
| Authority | Server gold cost, full heal, resource restore, bind persistence. Healer may skip gold and rebind. Client health/gold rejected. |
| Idempotency | Successful `requestId` replays `ok` without a second charge |
| Errors | `invalid_id`, `out_of_range`, `insufficient_gold`, `player_dead`, `stat_injection:gold` |
| Rate limit | Shares quest window (8) |
| Tests | `inn.test.ts`, `protocol.test.ts`, `vendor_inn_service_test.gd` |

### 22 `CAVE_ENTER`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, npcId, requestId }` |
| Authority | Match loop validates entrance, allocates the owned cave, checkpoints origin pose, issues a one-time transfer ticket. Client never nominates `matchId`. |
| Idempotency | Successful `requestId` does not issue a second ticket while transfer is `pending`/`issued` |
| Errors | `invalid_target`, `out_of_range`, `player_dead`, `already_transferring`, `invalid_origin`, `invalid_service`, `not_party_member`, `content_mismatch`, `instance_not_ready` |
| Rate limit | Shares quest window (8) |
| Tests | `cave.test.ts`, `inn.test.ts`, `protocol.test.ts`, `cave_service_test.gd` |

### 23 `CAVE_EXIT`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, npcId, requestId }` |
| Authority | Match loop validates the cave-exit NPC and issues a ticket to the public world |
| Idempotency | Same as `CAVE_ENTER` |
| Errors | `invalid_origin`, `already_transferring`, `player_dead`, `invalid_target`, `out_of_range`, `invalid_service` |
| Rate limit | Shares quest window (8) |
| Tests | `cave.test.ts`, `protocol.test.ts`, `cave_service_test.gd` |

### 24 `TRADE_INVITE`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, targetId, requestId }` |
| Authority | Server eligibility: same match, alive, in range, not transferring, not already trading, not combat/cast/stun restricted |
| Idempotency | Successful `requestId` replays without a second invite |
| Errors | `invalid_target`, `already_trading`, `out_of_range`, `player_dead`, `already_transferring`, `in_combat`, `casting`, `trade_restricted`, `not_in_match` |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts`, `protocol.test.ts`, `trade_service_test.gd` |

### 25 `TRADE_ACCEPT_INVITE`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, requestId }` |
| Authority | Invitee only; rechecks eligibility and invite TTL |
| Idempotency | Successful `requestId` replays |
| Errors | `invite_expired`, `invalid_target`, `already_trading`, plus invite eligibility codes |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts` |

### 26 `TRADE_DECLINE_INVITE`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, requestId }` |
| Authority | Participant cancels an inviting trade |
| Idempotency | Successful `requestId` replays |
| Errors | `invalid_target`, `invalid_id` |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts`, `trade_service_test.gd` |

### 27 `TRADE_SET_OFFER`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, instanceId, quantity?, requestId }` |
| Authority | Locks an owned tradeable stack; bumps revision; clears acceptances |
| Idempotency | Successful `requestId` replays |
| Errors | `unowned_item`, `not_tradeable`, `item_locked`, `item_equipped`, `invalid_amount` |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts` |

### 28 `TRADE_REMOVE_OFFER`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, instanceId, requestId }` |
| Authority | Unlocks the stack; bumps revision; clears acceptances |
| Idempotency | Successful `requestId` replays |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts` |

### 29 `TRADE_SET_GOLD`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, amount, requestId }` |
| Authority | Server wallet balance; `gold` is `stat_injection` |
| Idempotency | Successful `requestId` replays |
| Errors | `insufficient_gold`, `invalid_amount`, `stat_injection:gold` |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts`, `protocol.test.ts` |

### 30 `TRADE_ACCEPT_REVISION`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, revision, requestId }` |
| Authority | Accepts one revision. Commit only when both accepted the current revision. Atomic two-inventory + two-wallet write or recover from `committing`. |
| Idempotency | Successful `requestId` and completed trades replay without a second mutation |
| Errors | `revision_mismatch`, `inventory_full`, `insufficient_gold`, `persist_failed`, `already_trading` |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts` |

### 31 `TRADE_CANCEL`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, tradeId, requestId }` |
| Authority | Cancels inviting or open trades and unlocks items. Committing trades are recovered, not cancelled. |
| Idempotency | Successful `requestId` replays |
| Rate limit | Shares quest window (8) |
| Tests | `trade.test.ts`, `trade_service_test.gd` |

No other client opcodes exist. Unknown opcode → `unknown_opcode`.

## Server → client match opcodes

No client rate limit. Occupied matches send **102** every tick.

| Opcode | Name | Body (summary) | Tests |
| --- | --- | --- | --- |
| 101 | `FULL_STATE` | tick, zone, self, players, npcs, enemies, loot, quests, inventory, equipment, derived, wallet, progression, abilities, optional party, optional instance | `protocol.test.ts`, `zone_join_test.gd`, `progression.test.ts`, `ability.test.ts`, `party_service_test.gd`, `cave.test.ts` |
| 102 | `SNAPSHOT` | tick, players, enemies, loot | `movement.test.ts`, `entity_registry_test.gd` |
| 103 | `ACTION_RESULT` | ok, code, requestId?, ticket extras, optional tradeId | combat/inventory/quest/cave/trade tests |
| 104 | `COMBAT_EVENT` | tick, events[] (`hit`, `heal`, `death`, `respawn`, `interrupt`, `effect_*`, `resource`, `threat`, `credit`, `message`) | `combat.test.ts`, `combat_pipeline.test.ts`, `boss.test.ts`, `combat_client_test.gd` |
| 105 | `INVENTORY_STATE` | capacity, items | `inventory.test.ts` |
| 106 | `QUEST_STATE` | quests | `quest.test.ts` |
| 107 | `INTERACTION_RESULT` | ok, code, requestId, targetId, optional dialogueId/services/context | `interaction.test.ts` |
| 108 | `SYSTEM_MESSAGE` | code, message | protocol/security/chat |
| 109 | `EQUIPMENT_STATE` | slots, derived | `equipment.test.ts` |
| 110 | `WALLET_STATE` | gold | `quest_reward.test.ts`, `wallet_service_test.gd` |
| 111 | `PROGRESSION_STATE` | progression (class, level, XP, attributes, derived, unspent points) | `progression.test.ts`, `progression_service_test.gd` |
| 112 | `ABILITY_STATE` | unlocked ids, hotbar, ranks, resources, cooldowns, active cast, effects | `ability.test.ts`, `ability_service_test.gd` |
| 113 | `PARTY_STATE` | optional `party` view for the recipient (ids, leader, members, revision, connection state, pending invite) | `party.test.ts`, `party_service_test.gd` |
| 114 | `PARTY_EVENT` | `partyId`, `eventType`, optional `systemMessage` / loot assignment | `party.test.ts`, `party_credit_loot.test.ts` |
| 115 | `TRADE_STATE` | canonical trade: ids, state, revision, offers, goldOffers, acceptances, expiresAt | `trade.test.ts`, `trade_service_test.gd` |

`FULL_STATE` may include optional `party` for the recipient and optional `instance` (`type`, `instanceId`, `zoneTemplateId`, `completionState`, `bossAlive`, owners). Snapshots do not carry party membership. Join metadata: `{ protocolVersion, contentHash }` strings plus `selectionTicket` or `transferTicket`. Mismatch → join reject / fatal client error. Transfer join rejects `ticket_reused`, `ticket_expired`, `ticket_wrong_character`, `ticket_wrong_destination`, `still_in_origin`, `already_elsewhere`. Email accounts that are not playable are rejected at `matchJoinAttempt` (`email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted`).

## Realtime hooks

### `ChannelMessageSend` before

| Field | Value |
| --- | --- |
| Direction | Client chat send → server |
| Request | Nakama envelope; content JSON `{ message, partyId? }` |
| Response | Same envelope with trimmed message, or throw |
| Auth | Session + channel membership. `partyId` requires current party membership. Email accounts must be playable. |
| Limits | 1–200 characters; no extra JSON keys besides `partyId`. Party sends: 4 per 2 s (process-local). Zone chat stays stateless. |
| Errors | `empty_message`, `message_too_long`, `malformed_json`, `invalid_payload`, `not_party_member`, `rate_limited`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |
| Tests | `chat.test.ts`, `chat_client_test.gd`, `security.test.ts` |

### `ChannelJoin` before

| Field | Value |
| --- | --- |
| Request | Room type `1`, target `zone.starter` or `party.<partyId>` for current members |
| Errors | `invalid_channel`, `email_verification_required`, `account_disabled`, `account_deleting`, `account_deleted` |
| Tests | `chat.test.ts` |

No `registerRtAfter`. No group/DM channels. Party chat messages never drive gameplay state.

## Authentication and notifications

| Identifier | Status |
| --- | --- |
| AuthenticateDevice / AuthenticateEmail / custom auth hooks | `registerBeforeAuthenticateEmail` and `registerBeforeAuthenticateDevice` are registered. They enforce rate limits plus `registration_disabled` / `device_auth_disabled`. There is no after-auth hook and no custom authenticate handler. |
| Notification codes | None |

## Duplicate / undocumented scan

`tools/foundation-audit/audit.cjs` compares `server/src/domain/protocol.ts`, `client/scripts/network/protocol.gd`, and `InitModule` registrations to `expected.json`. Extra `registerRpc` / `registerRtBefore` / `registerRtAfter` / matchmaker / notification registrations fail the audit.
