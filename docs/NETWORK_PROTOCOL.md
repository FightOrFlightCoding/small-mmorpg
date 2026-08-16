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
| 2 | `INTERACT` | `{ protocolVersion, targetId, requestId }` | Correlation `requestId` required. Server checks NPC existence, server-side distance vs `player.base.interactionRange`, and live health. Returns `INTERACTION_RESULT`. |
| 3 | `ATTACK` | `{ protocolVersion, targetId, requestId }` | Correlation `requestId` required. Server checks live health, enemy existence, range vs `player.base.attackRange`, and cooldown vs `player.base.attackCooldown`. Damage is the server's derived attack (`player.base.attack` plus equipped main-hand `attackBonus`). Client `damage` / `attack` are rejected. Returns `ACTION_RESULT` plus `COMBAT_EVENT` on a hit. |
| 4 | `PICKUP` | `{ protocolVersion, lootId, requestId }` | Reward opcode. `requestId` required. |
| 5 | `EQUIP` | `{ protocolVersion, instanceId?, slot, requestId }` | Equip or unequip. `slot` must be `main_hand`. Omit `instanceId` to unequip. `requestId` required. Client `attack` / `attackBonus` are rejected. |
| 6 | `QUEST_ACCEPT` | `{ protocolVersion, questId, requestId }` | Reward opcode. `requestId` required. Validates quest ID and elder range, creates accepted state once, persists, returns `ACTION_RESULT` plus `QUEST_STATE`. |
| 7 | `QUEST_TURN_IN` | `{ protocolVersion, questId, requestId }` | Reward opcode. `requestId` required. |
| 8 | `RESYNC_REQUEST` | `{ protocolVersion }` | Replies with a fresh `FULL_STATE`. |

`contentHash` is optional on client messages. If present it must match the server catalog.

`requestId` must match `^[A-Za-z0-9_-]{8,64}$` (UUIDs are valid).

### Server → client

| Opcode | Name | Body |
| --- | --- | --- |
| 101 | `FULL_STATE` | `{ protocolVersion, contentHash, tick, zoneId, selfId, players, npcs, enemies, loot, quests, inventory, equipment, derived }` |
| 102 | `SNAPSHOT` | `{ protocolVersion, contentHash, tick, zoneId, players, enemies, loot }` |
| 103 | `ACTION_RESULT` | `{ protocolVersion, ok, code, requestId? }` |
| 104 | `COMBAT_EVENT` | `{ protocolVersion, tick, events }` |
| 105 | `INVENTORY_STATE` | `{ protocolVersion, contentHash, requestId?, capacity, items }` |
| 106 | `QUEST_STATE` | `{ protocolVersion, contentHash, requestId?, quests }` |
| 107 | `INTERACTION_RESULT` | `{ protocolVersion, ok, code, requestId?, targetId? }` |
| 108 | `SYSTEM_MESSAGE` | `{ protocolVersion, code, message }` |
| 109 | `EQUIPMENT_STATE` | `{ protocolVersion, contentHash, requestId?, slots, derived }` |

`FULL_STATE` is sent to the joining presence after character, quest, inventory, and equipment storage load, and again on `RESYNC_REQUEST`. Occupied matches broadcast `SNAPSHOT` every tick (10 Hz) with player poses, the shared slime, and ground loot. Each player record includes `x`, `y`, `health`, `maxHealth`, `alive`, and `lastProcessedSeq`. `quests`, `inventory`, `equipment`, and `derived` on `FULL_STATE` are the recipient's records only. `inventory` is `{ capacity, items: [{ instanceId, itemId, quantity, metadata }] }`. `equipment` is `{ slots: { main_hand: instanceId | null } }`. `derived` is `{ attack }` computed as `player.base.attack` plus the equipped main-hand `attackBonus`. Public loot is `{ id, itemId, quantity, x, y, expiresAtTick }` and does not include item instance IDs. A client that receives no snapshot or full state for **2 seconds** freezes remote interpolation and shows a degraded-connection state (`snapshot_timeout`). Local prediction still reconciles when snapshots resume. Dialogue opens only after `INTERACTION_RESULT` `ok`. `COMBAT_EVENT.events` entries are `{ type, sourceId, sourceKind, targetId, targetKind, damage?, remainingHealth?, x?, y?, respawnDelaySec? }` with `type` `hit`, `death`, or `respawn`. Damage numbers are presentation only.

## Client sends intentions only

Legal client messages name what the player **wants to try**:

- move intent (direction or target point — never a final authoritative transform)
- attack intent (target ID and `requestId` — never a damage or health value)
- interact / loot / equip / dialogue-choice intents

Illegal client messages (must be rejected if they appear):

- authoritative position or velocity
- damage dealt
- new health value
- item grant list
- quest completed flag
- currency delta

Those keys are rejected as `stat_injection:<key>`.

## Local prediction and remote interpolation

Prediction is client presentation only. `INPUT` still carries direction and sequence. The client applies the same speed, dt, and AABB rules as the match, stores unacked commands, and on each `SNAPSHOT` / `FULL_STATE`:

1. Drops commands with `seq <= lastProcessedSeq`.
2. Replays remaining commands from the server pose.
3. Leaves the display pose if error ≤ 0.5 px, blends toward the replayed pose if error ≤ 24 px, and snaps if error is larger.

Remote entities are sampled from one snapshot buffer (max 8 frames) keyed `kind:id`. The render tick is an estimated server tick (`latest + time since that snapshot / 0.1`) minus one snapshot, clamped to the latest received tick so sampling stays between frames and never extrapolates. After 2 seconds without a snapshot the buffer freezes and the HUD reports a degraded connection. Enemy poses and health come from `SNAPSHOT`; the client does not run slime AI. There is no combat prediction.

## Unique request ID on rewarded actions

Any action that can grant loot, quest rewards, or currency **must** include a client-generated `requestId`.

- First successful apply stores the `requestId` with the result.
- Replays of the same `requestId` return the original result and must not mutate inventory or wallet again.
- Missing or malformed `requestId` is rejected as `invalid_request_id`.

`INTERACT` also requires `requestId` so the client can match `INTERACTION_RESULT` before opening dialogue. It is not a loot grant. `ATTACK` requires `requestId` so a replay of the same id cannot apply damage twice. `EQUIP` requires `requestId` so a replay of a successful id cannot re-apply. Missing or malformed `requestId` is `invalid_request_id`.

`PICKUP` is applied: first success removes the loot entity, stacks or inserts the item, persists inventory, and sends `INVENTORY_STATE`. A replay of the same successful `requestId` returns `ok` without granting again. Codes: `ok`, `out_of_range`, `invalid_target`, `inventory_full`, `invalid_id`, `player_dead`. Client-supplied `instanceId` or `items` are protocol rejections. `EQUIP` is applied: first success stores `main_hand` by item-instance ID, recalculates `derived.attack` as `player.base.attack` plus the item `attackBonus`, persists equipment, and sends `EQUIPMENT_STATE`. Omit `instanceId` to unequip. Duplicate successful `requestId` replays `ok` without mutating. Codes: `ok`, `invalid_id`, `unowned`, `not_equippable`, `invalid_slot`, `player_dead`. Client `attack` / `attackBonus` are protocol rejections. `QUEST_TURN_IN` is defined but not applied in this phase (`not_implemented`). `QUEST_ACCEPT` is applied: first success stores accepted progress (`current` 0) and the `requestId`; a replay of the same `requestId` returns `accepted` without writing again; a later `requestId` for the same quest returns `already_accepted` and the current log. Client-supplied `status`, `questComplete`, or reward fields are rejected. `ATTACK` is applied using the server's derived attack: codes `ok`, `out_of_range`, `on_cooldown`, `invalid_target`, `target_dead`, `player_dead`.

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
- missing/malformed `requestId` on `INTERACT`, `ATTACK`, `EQUIP`, and reward opcodes

Rejections are typed (`unknown_opcode`, `malformed_json`, `unknown_field`, `invalid_id`, `protocol_mismatch`, `content_mismatch`, `payload_too_large`, `unauthenticated`, `invalid_name`, `stat_injection`, `invalid_request_id`, `match_full`, `already_in_match`, `character_missing`, `empty_message`, `message_too_long`, `invalid_payload`, `invalid_channel`). They are logged without tokens or personal data. They are sent as `SYSTEM_MESSAGE` (or join reject) and never crash the match.

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
- Join loads the character, quest, inventory, and equipment storage once. The tick loop does not read storage. Quest acceptance writes `collection` `player`, key `quests`, `permissionWrite: 0`. Successful pickup writes `collection` `player`, key `inventory`, `permissionWrite: 0`. Successful equip or unequip writes `collection` `player`, key `equipment`, `permissionWrite: 0`. Ground loot is match-only and is not persisted.
- Join metadata must include matching `protocolVersion` and `contentHash`
- A second socket for an account already in the match is rejected with `already_in_match`. True reconnect of the same session is allowed. The same account cannot occupy two presences.
- Players spawn at their saved position, or the zone default if that is what was stored
- Movement uses content `moveSpeed`, server `dt`, zone `walkableBounds`, and zone `collisions`. Client position is never accepted
- One shared `enemy.green_slime:0` is simulated in the match. Snapshots include its pose, health, and AI state. Player death restores health at `zone.starter.playerSpawn` after 3 seconds. Slime death restores it at its spawn after `respawnDelay` (10 seconds) and creates one transient `item.slime_gel` loot entity at the death pose. That loot expires after 30 seconds.

## Starter-zone room chat

Chat is a Nakama room channel, not a match opcode.

- Room name: `zone.starter`
- Type: room (`1`)
- Persistence: false
- Hidden: false
- Client send body: `{ "message": "<text>" }`
- Server before hook `ChannelMessageSend` rejects empty text, text longer than **200** characters, non-object JSON, and extra fields (`empty_message`, `message_too_long`, `malformed_json`, `invalid_payload`)
- Server before hook `ChannelJoin` allows only that room (`invalid_channel` otherwise)
- The client joins after `FULL_STATE`, leaves on logout, and subscribes once to channel message and presence events
