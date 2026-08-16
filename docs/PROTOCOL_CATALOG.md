# Protocol catalog

Every Prompt 18 match opcode, RPC, realtime hook, and the absence of auth/notification hooks. Duplicate numeric identifiers are a defect; `tools/foundation-audit` fails if client/server tables diverge.

Related: [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [SECURITY_MODEL.md](SECURITY_MODEL.md). Machine-readable opcodes/RPCs: `tools/foundation-audit/expected.json`.

Shared envelope: JSON camelCase, `protocolVersion` must be `1`. Optional client `contentHash` must match the server catalog. Client→server match bodies > **2048** bytes are `payload_too_large`. Unknown fields on client match JSON are `unknown_field:<key>`. Outcome keys are `stat_injection:<key>`.

Authentication: device auth is Nakama built-in. This repository registers **no** `Authenticate*` hooks.

Notifications: **none** registered.

## RPCs

### `vibecode_health`

| Field | Value |
| --- | --- |
| Direction | Client/ops → server HTTP RPC |
| Request | Empty or `{}` |
| Response | `{ ok, service, protocol_version, content_version, rpcs }` |
| Authority | Server catalog hash |
| Auth | Nakama HTTP key (`defaulthttpkey` locally). Not a user session. |
| Rate limit | None in-app |
| Payload | Empty object; extra keys `unknown_field` |
| Idempotency | Read-only |
| Errors | `malformed_json`, `unknown_field` |
| Tests | `server/tests/health.test.ts`, `scripts/backend-verify` |

### `character_bootstrap`

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC |
| Request | `` or `{ "name"?: string }` |
| Response | `{ characterId, name, created, storageVersion, contentId, zoneId, baseStats, position }` |
| Authority | Server creates/reads `player`/`character`. Stats from `player.base`. |
| Auth | Nakama session (`ctx.userId` required) |
| Rate limit | None in-app |
| Payload | Strict keys; stats/position `stat_injection` |
| Idempotency | Existing record returned unchanged |
| Errors | `unauthenticated`, `malformed_json`, `invalid_name`, `stat_injection`, `unknown_field` |
| Tests | `server/tests/character.test.ts`, `client/tests/app/auth_flow_test.gd` |

### `find_or_create_starter_zone`

| Field | Value |
| --- | --- |
| Direction | Client → server HTTP RPC |
| Request | Empty or `{}` |
| Response | `{ matchId, zoneId, protocolVersion, contentHash }` |
| Authority | Server match singleton |
| Auth | Session required |
| Rate limit | None in-app |
| Payload | Empty object |
| Idempotency | Concurrent callers converge on one match id |
| Errors | `unauthenticated`, `malformed_json`, `unknown_field` |
| Tests | `server/tests/starter_zone_registry.test.ts`, `client/tests/app/zone_join_test.gd` |

## Client → server match opcodes

Per-player windows (10 ticks): INPUT 20; ATTACK/INTERACT/PICKUP/EQUIP/quest 8; RESYNC 2. Max 24 parsed messages per player per tick. Excess: `SYSTEM_MESSAGE` `rate_limited`.

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
| Authority | Server range vs `interactionRange` |
| `requestId` | Required (correlation, not a grant) |
| Errors | `out_of_range`, `invalid_target`, `player_dead`, `invalid_request_id` |
| Tests | `interaction.test.ts`, `interaction_client_test.gd` |

### 3 `ATTACK`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, targetId, requestId }` |
| Authority | Server derived attack, range, cooldown |
| Idempotency | Same `requestId` does not hit twice |
| Errors | `on_cooldown`, `out_of_range`, `invalid_target`, `target_dead`, `player_dead`, `stat_injection:damage` |
| Tests | `combat.test.ts`, `security.test.ts`, `combat_client_test.gd` |

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
| Authority | Server ownership + `main_hand` |
| Idempotency | Successful `requestId` replays `ok` |
| Errors | `unowned`, `not_equippable`, `invalid_slot`, `invalid_id`, `player_dead` |
| Tests | `equipment.test.ts`, `equipment_service_test.gd` |

### 6 `QUEST_ACCEPT`

| Field | Value |
| --- | --- |
| Body | `{ protocolVersion, questId, requestId }` |
| Authority | Server quest def + elder range |
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

No other client opcodes exist. Unknown opcode → `unknown_opcode`.

## Server → client match opcodes

No client rate limit. Occupied matches send **102** every tick.

| Opcode | Name | Body (summary) | Tests |
| --- | --- | --- | --- |
| 101 | `FULL_STATE` | tick, zone, self, players, npcs, enemies, loot, quests, inventory, equipment, derived, wallet | `protocol.test.ts`, `zone_join_test.gd` |
| 102 | `SNAPSHOT` | tick, players, enemies, loot | `movement.test.ts`, `entity_registry_test.gd` |
| 103 | `ACTION_RESULT` | ok, code, requestId? | combat/inventory/quest tests |
| 104 | `COMBAT_EVENT` | tick, events[] | `combat.test.ts`, `combat_client_test.gd` |
| 105 | `INVENTORY_STATE` | capacity, items | `inventory.test.ts` |
| 106 | `QUEST_STATE` | quests | `quest.test.ts` |
| 107 | `INTERACTION_RESULT` | ok, code, requestId, targetId | `interaction.test.ts` |
| 108 | `SYSTEM_MESSAGE` | code, message | protocol/security/chat |
| 109 | `EQUIPMENT_STATE` | slots, derived | `equipment.test.ts` |
| 110 | `WALLET_STATE` | gold | `quest_reward.test.ts`, `wallet_service_test.gd` |

Join metadata: `{ protocolVersion, contentHash }` strings. Mismatch → join reject / fatal client error.

## Realtime hooks

### `ChannelMessageSend` before

| Field | Value |
| --- | --- |
| Direction | Client chat send → server |
| Request | Nakama envelope; content JSON `{ message }` |
| Response | Same envelope with trimmed message, or throw |
| Auth | Session + channel membership |
| Limits | 1–200 characters; no extra JSON keys |
| Errors | `empty_message`, `message_too_long`, `malformed_json`, `invalid_payload` |
| Tests | `chat.test.ts`, `chat_client_test.gd`, `security.test.ts` |

### `ChannelJoin` before

| Field | Value |
| --- | --- |
| Request | Room type `1`, target `zone.starter` only |
| Errors | `invalid_channel` |
| Tests | `chat.test.ts` |

No `registerRtAfter`. No group/DM channels.

## Authentication and notifications

| Identifier | Status |
| --- | --- |
| AuthenticateDevice / custom auth hooks | Not registered. Nakama built-in device auth. |
| Notification codes | None |

## Duplicate / undocumented scan

`tools/foundation-audit/audit.cjs` compares `server/src/domain/protocol.ts`, `client/scripts/network/protocol.gd`, and `InitModule` registrations to `expected.json`. Extra `registerRpc` / `registerRtBefore` / `registerRtAfter` / matchmaker / notification registrations fail the audit.
