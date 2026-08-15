# Network protocol

Opcode tables and envelopes for the starter-zone match. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md).

Current protocol version: **1**. Current content hash is the generated catalog hash (64 lowercase hex). Mismatch of either is a hard rejection. The client shows a fatal compatibility error and does not enter the world.

JSON keys are camelCase (`protocolVersion`, `contentHash`, `requestId`, `selfId`). Nakama match opcodes are numeric; the JSON body does not repeat the opcode.

## Versioned protocol

Every client→server and server→client envelope includes a protocol version integer.

- The server advertises the version it speaks (`vibecode_health`, `find_or_create_starter_zone`, and `FULL_STATE`).
- The client sends the version it encoded.
- Join metadata carries `protocolVersion` and `contentHash` as strings (Nakama metadata is string-valued).
- Mismatch is a hard rejection. The client shows a visible error. No partial apply.

## JSON for the first slice

Match and RPC payloads for the slice are JSON objects.

- Envelopes are UTF-8 JSON.
- Strict client intentions reject unknown fields.
- Client→server match payloads are rejected above **2048** bytes (`payload_too_large`).
- `FULL_STATE` / `SNAPSHOT` require the documented fields. `SNAPSHOT` is broadcast at **10 Hz** (the match tick rate) while the zone is occupied.

## Opcodes

### Client → server

| Opcode | Name | Body | Notes |
| --- | --- | --- | --- |
| 1 | `INPUT` | `{ protocolVersion, seq, axisX, axisY }` | Direction and sequence only. `seq` is a finite integer. Axes are finite numbers. Position, speed, and dt are rejected. |
| 2 | `INTERACT` | `{ protocolVersion, targetId }` | Returns `INTERACTION_RESULT` `not_implemented`. |
| 3 | `ATTACK` | `{ protocolVersion, targetId }` | Returns `ACTION_RESULT` `not_implemented`. |
| 4 | `PICKUP` | `{ protocolVersion, lootId, requestId }` | Reward opcode. `requestId` required. |
| 5 | `EQUIP` | `{ protocolVersion, itemId, slot? }` | Returns `ACTION_RESULT` `not_implemented`. |
| 6 | `QUEST_ACCEPT` | `{ protocolVersion, questId, requestId }` | Reward opcode. `requestId` required. |
| 7 | `QUEST_TURN_IN` | `{ protocolVersion, questId, requestId }` | Reward opcode. `requestId` required. |
| 8 | `RESYNC_REQUEST` | `{ protocolVersion }` | Replies with a fresh `FULL_STATE`. |

`contentHash` is optional on client messages. If present it must match the server catalog.

`requestId` must match `^[A-Za-z0-9_-]{8,64}$` (UUIDs are valid).

### Server → client

| Opcode | Name | Body |
| --- | --- | --- |
| 101 | `FULL_STATE` | `{ protocolVersion, contentHash, tick, zoneId, selfId, players, npcs, enemies, loot }` |
| 102 | `SNAPSHOT` | `{ protocolVersion, contentHash, tick, zoneId, players }` |
| 103 | `ACTION_RESULT` | `{ protocolVersion, ok, code, requestId? }` |
| 104 | `COMBAT_EVENT` | reserved; unused in this phase |
| 105 | `INVENTORY_STATE` | reserved; unused in this phase |
| 106 | `QUEST_STATE` | reserved; unused in this phase |
| 107 | `INTERACTION_RESULT` | `{ protocolVersion, ok, code }` |
| 108 | `SYSTEM_MESSAGE` | `{ protocolVersion, code, message }` |

`FULL_STATE` is sent to the joining presence after character load, and again on `RESYNC_REQUEST`. Occupied matches broadcast `SNAPSHOT` every tick (10 Hz). Each player record includes `x`, `y`, and `lastProcessedSeq` so the local client can ack input. A client that receives no snapshot or full state for **2 seconds** shows a visible `snapshot_timeout`. There is no combat.

## Client sends intentions only

Legal client messages name what the player **wants to try**:

- move intent (direction or target point — never a final authoritative transform)
- attack intent (target ID)
- interact / loot / equip / dialogue-choice intents

Illegal client messages (must be rejected if they appear):

- authoritative position or velocity
- damage dealt
- new health value
- item grant list
- quest completed flag
- currency delta

Those keys are rejected as `stat_injection:<key>`.

## Unique request ID on rewarded actions

Any action that can grant loot, quest rewards, or currency **must** include a client-generated `requestId`.

- First successful apply stores the `requestId` with the result.
- Replays of the same `requestId` return the original result and must not mutate inventory or wallet again.
- Missing or malformed `requestId` is rejected as `invalid_request_id`.

`PICKUP`, `QUEST_ACCEPT`, and `QUEST_TURN_IN` are defined but not applied in this phase (`not_implemented`).

## Full-state resynchronization

The server can send a full snapshot of the local player and visible zone state.

- Used on join, on explicit resync request, and when the server detects the client is too far behind.
- The client replaces local view state with the snapshot. It does not merge client-invented stats over it.
- The client enters the world scene only after a valid `FULL_STATE`.

## Rejection of unknown or malformed messages

The server rejects:

- unknown opcodes
- unknown fields on strict messages
- malformed JSON
- invalid content or entity IDs
- oversized payloads (2048 bytes for client→server match bodies)
- wrong protocol version
- wrong content hash
- missing/malformed `requestId` on reward opcodes

Rejections are typed (`unknown_opcode`, `malformed_json`, `unknown_field`, `invalid_id`, `protocol_mismatch`, `content_mismatch`, `payload_too_large`, `unauthenticated`, `invalid_name`, `stat_injection`, `invalid_request_id`, `match_full`, `character_missing`). They are logged without tokens or personal data. They are sent as `SYSTEM_MESSAGE` (or join reject) and never crash the match.

## RPC `character_bootstrap`

Authenticated HTTP/RPC only. Payload is JSON, optional `{"name":"Alice"}`, or empty. Unknown fields and any client-supplied stats or position are rejected. Response includes `characterId`, `name`, `created`, `storageVersion`, `contentId`, `zoneId`, `baseStats` (from `player.base`), and `position` (saved or starter spawn).

## RPC `find_or_create_starter_zone`

Authenticated HTTP/RPC only. Payload is empty or `{}`. Returns `{ matchId, zoneId, protocolVersion, contentHash }` for the shared development starter zone. Concurrent callers converge on one running match: prefer a live stored match id, otherwise `matchList` by label `zone.starter`, otherwise `matchCreate`. A system-owned storage singleton (`collection` `match`, key `starter_zone`, `permissionWrite: 0`) records the canonical id. Extra raced matches stay empty and shut down after the empty-match timeout.

## Starter-zone match

- Module name: `starter_zone`
- Label: `zone.starter`
- Tick rate: **10 Hz**
- Maximum players: **8**
- Empty-match shutdown: **30 seconds** (300 ticks) after the last presence leaves, or if nobody ever joins
- Join loads the character from storage once. The tick loop does not read storage
- Join metadata must include matching `protocolVersion` and `contentHash`
- Players spawn at their saved position, or the zone default if that is what was stored
- Movement uses content `moveSpeed`, server `dt`, zone `walkableBounds`, and zone `collisions`. Client position is never accepted
