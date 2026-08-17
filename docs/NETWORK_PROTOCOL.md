# Network protocol

Opcode tables and envelopes for the starter-zone match. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md).

Current protocol version: **1**. Current content hash is the generated catalog hash (64 lowercase hex). Mismatch of either is a hard rejection. The client shows a fatal compatibility error and does not enter the world.

JSON keys are camelCase (`protocolVersion`, `contentHash`, `requestId`, `selfId`). Nakama match opcodes are numeric; the JSON body does not repeat the opcode.

## Versioned protocol

Every client→server and server→client envelope includes a protocol version integer.

- The server advertises the version it speaks (`vibecode_health`, `find_or_create_starter_zone`, and `FULL_STATE`).
- The client sends the version it encoded.
- Join metadata carries `protocolVersion`, `contentHash`, and `selectionTicket` as strings (Nakama metadata is string-valued). `characterId` is rejected as `stat_injection`.
- Mismatch is a hard rejection. The client shows a visible error. No partial apply.

## JSON for the first slice

Match and RPC payloads for the slice are JSON objects.

- Envelopes are UTF-8 JSON.
- Strict client intentions reject unknown fields.
- Client→server match payloads are rejected above **2048** bytes (`payload_too_large`).
- Limits: `INPUT` **20**, `ATTACK`/`USE_ABILITY`/`CANCEL_CAST`/`SET_TARGET` **8**, `INTERACT` **8**, `PICKUP` **8**, `EQUIP`/`DESTROY_ITEM`/`SPLIT_STACK`/`MOVE_ITEM` **8**, `QUEST_ACCEPT`+`QUEST_TURN_IN`+`VENDOR_BUY`+`VENDOR_SELL`+`INN_REST`+`CAVE_ENTER` **8**, `ALLOCATE_ATTRIBUTES`/`ASSIGN_HOTBAR`/`UNLOCK_ABILITY`/`RELEASE_RESPAWN` **8**, `RESYNC_REQUEST` **2**. Extra requests are `rate_limited` (`SYSTEM_MESSAGE`), are logged, and do not apply. At most **24** match messages are parsed per player per tick.
- `FULL_STATE` / `SNAPSHOT` require the documented fields. `SNAPSHOT` is broadcast at **10 Hz** (the match tick rate) while the zone is occupied.

## Opcodes

### Client → server

| Opcode | Name | Body | Notes |
| --- | --- | --- | --- |
| 1 | `INPUT` | `{ protocolVersion, seq, axisX, axisY }` | Direction and sequence only. `seq` is a finite integer. Axes are finite numbers. Position, speed, and dt are rejected. |
| 2 | `INTERACT` | `{ protocolVersion, targetId, requestId }` | Correlation `requestId` required. Server checks NPC existence, server-side distance vs per-NPC `interactionRange` (fallback `player.base.interactionRange`), zone, and live health. Returns `INTERACTION_RESULT` (optional `dialogueId`, `services`, `context`). |
| 3 | `ATTACK` | `{ protocolVersion, targetId, requestId }` | Correlation `requestId` required. When the match has a catalog `basicAbilityId` unlocked, this opcode uses that ability (range, cooldown, and `direct_damage` from content). Otherwise Prompt 18 `applyPlayerAttack` (`player.base.attackRange` / `attackCooldown`, derived attack). Client `damage` / `attack` / `xp` are rejected. Returns `ACTION_RESULT` plus `COMBAT_EVENT` on a hit. |
| 4 | `PICKUP` | `{ protocolVersion, lootId, requestId }` | Reward opcode. `requestId` required. |
| 5 | `EQUIP` | `{ protocolVersion, instanceId?, slot, requestId }` | Equip or unequip a content-defined slot (`main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet` in the current catalog). Omit `instanceId` to unequip. `requestId` required. Client `attack` / `attackBonus` are rejected. |
| 6 | `QUEST_ACCEPT` | `{ protocolVersion, questId, requestId }` | Reward opcode. `requestId` required. Validates quest ID, accept-NPC range, level, and class; creates accepted state once; persists; returns `ACTION_RESULT` plus `QUEST_STATE`. |
| 7 | `QUEST_TURN_IN` | `{ protocolVersion, questId, npcId, requestId }` | Reward opcode. `requestId` required. Validates NPC, range, accepted quest, satisfied objective, and required item. Client `gold` / `questComplete` / `resultingGold` / `resultingBalance` are rejected. |
| 8 | `RESYNC_REQUEST` | `{ protocolVersion }` | Replies with a fresh `FULL_STATE`. |
| 9 | `ALLOCATE_ATTRIBUTES` | `{ protocolVersion, attributeId, amount, requestId }` | Spend unspent attribute points. `amount` is a finite integer. Client `xp` / `level` / `currentXp` are rejected. |
| 10 | `DESTROY_ITEM` | `{ protocolVersion, instanceId, quantity?, requestId }` | Destroy an owned stack or part of it. Optional `quantity` is a finite integer. |
| 11 | `SPLIT_STACK` | `{ protocolVersion, instanceId, quantity, requestId }` | Split off `quantity` into a new server-generated instance. |
| 12 | `MOVE_ITEM` | `{ protocolVersion, instanceId, toSlotIndex, requestId }` | Move or merge into `toSlotIndex`. Local drag/drop is not authoritative. |
| 13 | `USE_ABILITY` | `{ protocolVersion, abilityId, targetId?, targetX?, targetY?, requestId }` | Intention only. Server owns range, cost, cooldown, cast time, and effect results. `damage` / `heal` / `castTime` / `cooldown` / `duration` are `stat_injection`. |
| 14 | `CANCEL_CAST` | `{ protocolVersion, requestId }` | Cancels the caster's active cast. |
| 15 | `ASSIGN_HOTBAR` | `{ protocolVersion, slotIndex, abilityId?, requestId }` | Server validates ownership. Empty `abilityId` clears the slot. |
| 16 | `UNLOCK_ABILITY` | `{ protocolVersion, abilityId, requestId }` | Spends unspent skill points. |
| 17 | `SET_TARGET` | `{ protocolVersion, targetId?, intent?, requestId }` | Selects current hostile or friendly target. Empty `targetId` clears. `intent` `hostile` against a player is `pvp_disabled`. |
| 18 | `RELEASE_RESPAWN` | `{ protocolVersion, requestId }` | Explicit PvE release while dead. Auto-respawn after 3s still applies. |
| 19 | `VENDOR_BUY` | `{ protocolVersion, npcId, itemId, quantity?, requestId }` | Reward opcode. Server stock and prices. Client `price` / `gold` rejected. |
| 20 | `VENDOR_SELL` | `{ protocolVersion, npcId, instanceId, quantity?, requestId }` | Reward opcode. Server sell value. Equipped items are locked. |
| 21 | `INN_REST` | `{ protocolVersion, npcId, mode?, requestId }` | Reward opcode. `mode` `inn` or `healer`. Server gold, heal, resources, bind. |
| 22 | `CAVE_ENTER` | `{ protocolVersion, npcId, requestId }` | Always `cave_unavailable`. No match transfer. |

`contentHash` is optional on client messages. If present it must match the server catalog.

`requestId` must match `^[A-Za-z0-9_-]{8,64}$` (UUIDs are valid).

### Server → client

| Opcode | Name | Body |
| --- | --- | --- |
| 101 | `FULL_STATE` | `{ protocolVersion, contentHash, tick, zoneId, selfId, players, npcs, enemies, loot, quests, inventory, equipment, derived, wallet, progression, abilities }` |
| 102 | `SNAPSHOT` | `{ protocolVersion, contentHash, tick, zoneId, players, enemies, loot }` |
| 103 | `ACTION_RESULT` | `{ protocolVersion, ok, code, requestId? }` |
| 104 | `COMBAT_EVENT` | `{ protocolVersion, tick, events }` |
| 105 | `INVENTORY_STATE` | `{ protocolVersion, contentHash, requestId?, capacity, items }` |
| 106 | `QUEST_STATE` | `{ protocolVersion, contentHash, requestId?, quests }` |
| 107 | `INTERACTION_RESULT` | `{ protocolVersion, ok, code, requestId?, targetId?, dialogueId?, services?, context? }` |
| 108 | `SYSTEM_MESSAGE` | `{ protocolVersion, code, message }` |
| 109 | `EQUIPMENT_STATE` | `{ protocolVersion, contentHash, requestId?, slots, derived }` |
| 110 | `WALLET_STATE` | `{ protocolVersion, contentHash, requestId?, gold }` |
| 111 | `PROGRESSION_STATE` | `{ protocolVersion, contentHash, requestId?, progression }` |
| 112 | `ABILITY_STATE` | `{ protocolVersion, contentHash, requestId?, abilities }` |

`FULL_STATE` is sent to the joining presence after character, quest, inventory, equipment, wallet, and progression load, and again on `RESYNC_REQUEST`. Occupied matches broadcast `SNAPSHOT` every tick (10 Hz) with player poses, enemies, and ground loot. Each player record includes `x`, `y`, `health`, `maxHealth`, `alive`, `lastProcessedSeq`, `resources`, `effects`, `activeCast`, `inCombat`, `hostileTargetId`, `friendlyTargetId`, `deadUntilTick`, `stunned`, and `rooted`. Each enemy record includes `id`, `enemyId`, `x`, `y`, `health`, `maxHealth`, `alive`, `state`, `phaseId`, `aiProfileId`, and `effects`. `quests`, `inventory`, `equipment`, `derived`, `wallet`, `progression`, and `abilities` on `FULL_STATE` are the recipient's records only. `abilities` is `{ unlockedAbilityIds, hotbar, abilityRanks, resources, cooldowns, globalCooldownRemaining, activeCast, effects }`. Public loot is `{ id, itemId, quantity, x, y, expiresAtTick }` and does not include item instance IDs. A client that receives no snapshot or full state for **2 seconds** freezes remote interpolation and shows a degraded-connection state (`snapshot_timeout`). Local prediction still reconciles when snapshots resume. Dialogue opens only after `INTERACTION_RESULT` `ok`. `COMBAT_EVENT.events` entries are `{ type, sourceId, sourceKind, targetId, targetKind, damage?, healing?, remainingHealth?, x?, y?, respawnDelaySec?, interruptReason?, effectId?, abilityId?, resourceId?, resourceDelta?, message? }` with `type` `hit`, `heal`, `death`, `respawn`, `interrupt`, `effect_applied`, `effect_tick`, `resource`, `threat`, `credit`, or `message`. Damage and healing numbers are presentation only.

## Client sends intentions only

Legal client messages name what the player **wants to try**:

- move intent (direction or target point — never a final authoritative transform)
- attack intent (target ID and `requestId` — never a damage or health value)
- interact / loot / equip / allocate-attribute / dialogue-choice intents

Illegal client messages (must be rejected if they appear):

- authoritative position or velocity
- damage dealt
- new health value
- item grant list
- quest completed flag
- currency delta
- XP amount, current XP, lifetime XP, or level

Those keys are rejected as `stat_injection:<key>`.

## Local prediction and remote interpolation

Prediction is client presentation only. `INPUT` still carries direction and sequence. The client applies the same speed, dt, and AABB rules as the match, stores unacked commands, and on each `SNAPSHOT` / `FULL_STATE`:

1. Sets local `INPUT` seq to `max(current, lastProcessedSeq)` so a recreated world never sends sequence numbers the match will ignore.
2. Drops commands with `seq <= lastProcessedSeq`.
3. Replays remaining commands from the server pose.
4. Leaves the display pose if error ≤ 0.5 px, blends toward the replayed pose if error ≤ 24 px, and snaps if error is larger.

Remote entities are sampled from one snapshot buffer (max 8 frames) keyed `kind:id`. The render tick is an estimated server tick (`latest + time since that snapshot / 0.1`) minus one snapshot, clamped to the latest received tick so sampling stays between frames and never extrapolates. After 2 seconds without a snapshot the buffer freezes and the HUD reports a degraded connection. Enemy poses and health come from `SNAPSHOT`; the client does not run slime AI. There is no combat prediction.

## Unique request ID on rewarded actions

Any action that can grant loot, quest rewards, or currency **must** include a client-generated `requestId`.

- First successful apply stores the `requestId` with the result.
- Replays of the same `requestId` return the original result and must not mutate inventory or wallet again.
- Missing or malformed `requestId` is rejected as `invalid_request_id`.

`INTERACT` also requires `requestId` so the client can match `INTERACTION_RESULT` before opening dialogue. It is not a loot grant. `ATTACK`, `USE_ABILITY`, `CANCEL_CAST`, `ASSIGN_HOTBAR`, and `UNLOCK_ABILITY` require `requestId` so a replay of the same id cannot apply twice. `EQUIP`, `DESTROY_ITEM`, `SPLIT_STACK`, `MOVE_ITEM`, `ALLOCATE_ATTRIBUTES`, `VENDOR_BUY`, `VENDOR_SELL`, `INN_REST`, and `CAVE_ENTER` require `requestId` so a replay of a successful id cannot re-apply. Missing or malformed `requestId` is `invalid_request_id`.

`PICKUP` is applied: first success removes the loot entity, stacks or inserts the item, persists inventory through the transaction boundary, recalculates accepted `acquire_item` objectives from owned quantity capped at required, persists quests if they changed, and sends `INVENTORY_STATE` plus `QUEST_STATE` when progress changes. A replay of the same successful `requestId` returns `ok` without granting again. Codes: `ok`, `out_of_range`, `invalid_target`, `inventory_full`, `invalid_id`, `player_dead`, `unique_restricted`. Client-supplied `instanceId` or `items` are protocol rejections. The server generates item-instance IDs. `EQUIP` is applied: first success stores the content-defined slot by item-instance ID, validates category, slot tags, class, level, locks, uniqueness, and character state, recalculates canonical derived stats, persists equipment through the transaction boundary, and sends `EQUIPMENT_STATE`. Omit `instanceId` to unequip. Duplicate successful `requestId` replays `ok` without mutating. Codes: `ok`, `invalid_id`, `unowned`, `not_equippable`, `invalid_slot`, `player_dead`, `item_locked`, `class_restricted`, `level_restricted`, `unique_restricted`, `invalid_category`. Client `attack` / `attackBonus` are protocol rejections. `DESTROY_ITEM` / `SPLIT_STACK` / `MOVE_ITEM` persist inventory through the same transaction boundary. Split always assigns a server-generated `instanceId`. Client `resultingGold` / `resultingBalance` are protocol rejections. `ALLOCATE_ATTRIBUTES` spends unspent points on a catalog attribute the class permits. Codes: `ok`, `invalid_amount`, `unknown_attribute`, `class_restricted`, `insufficient_points`. Duplicate `requestId` replays the stored result. Success sends `PROGRESSION_STATE`. `QUEST_TURN_IN` is applied atomically with `nk.multiUpdate` through the transaction boundary: consume required items from the quest definition, grant reward items, mark the quest completed, credit authored gold with ledger metadata (character id, delta, reason, request id, resulting balance), and write inventory plus quests with `permissionWrite: 0`. Quest XP is a separate trusted match grant keyed by `quest:<questId>:<requestId>`. Duplicate successful `requestId` replays `ok` without mutating. A later `requestId` for a completed quest is `already_completed`. Codes: `ok`, `out_of_range`, `invalid_target`, `invalid_id`, `incomplete_objective`, `missing_item`, `already_completed`, `inventory_full`, `player_dead`, `persist_failed`. Client `gold` / `questComplete` / `xp` / `resultingGold` are protocol rejections. Success also sends `QUEST_STATE`, `INVENTORY_STATE`, `WALLET_STATE`, and `SYSTEM_MESSAGE` `quest_complete`. The Prompt 18 slime quest still consumes one `item.slime_gel`, grants one unique `item.iron_sword`, and credits **25** gold as authored data. `VENDOR_BUY` / `VENDOR_SELL` persist inventory and gold through the same transaction boundary (`TX_REASON_VENDOR`). `INN_REST` charges gold when the inn service requires it, heals, restores class resources, and may persist bind on the character record (`TX_REASON_INN`). `CAVE_ENTER` returns `cave_unavailable` and does not transfer the player. `QUEST_ACCEPT` is applied: first success stores accepted progress (`current` 0, then recalculated from inventory and talk/enter objectives) and the `requestId`; a replay of the same `requestId` returns `accepted` without writing again; a later `requestId` for the same quest returns `already_accepted` and the current log. Client-supplied `status`, `questComplete`, or reward fields are rejected. `ATTACK` is applied using the server's canonical derived attack: codes `ok`, `out_of_range`, `on_cooldown`, `invalid_target`, `target_dead`, `player_dead`. Enemy death grants content `xpReward` once per `kill:<enemyInstanceId>:<deathCount>`.

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
- rate-limited match actions (`rate_limited`)
- wrong protocol version
- wrong content hash
- missing/malformed `requestId` on `INTERACT`, `ATTACK`, `USE_ABILITY`, `CANCEL_CAST`, `ASSIGN_HOTBAR`, `UNLOCK_ABILITY`, `EQUIP`, `DESTROY_ITEM`, `SPLIT_STACK`, `MOVE_ITEM`, `ALLOCATE_ATTRIBUTES`, `VENDOR_BUY`, `VENDOR_SELL`, `INN_REST`, `CAVE_ENTER`, and reward opcodes

Rejections are typed (`unknown_opcode`, `malformed_json`, `unknown_field`, `invalid_id`, `protocol_mismatch`, `content_mismatch`, `payload_too_large`, `rate_limited`, `unauthenticated`, `invalid_name`, `stat_injection`, `invalid_request_id`, `match_full`, `already_in_match`, `character_missing`, `empty_message`, `message_too_long`, `invalid_payload`, `invalid_channel`). They are logged as `match_action rejected user_id=… action=… reason=… tick=…` without tokens, device credentials, or raw private payloads. They are sent as `SYSTEM_MESSAGE` or `ACTION_RESULT` / `INTERACTION_RESULT` (or join reject) and never crash the match.

## RPC `character_bootstrap`

Authenticated HTTP/RPC only. Compatibility wrapper around the roster. Payload is JSON, optional `{"name":"Alice"}`, or empty. Unknown fields and any client-supplied stats or position are rejected. Response includes `characterId`, `name`, `created`, `storageVersion`, `contentId`, `zoneId`, `baseStats` (from `player.base`), and `position` (saved or starter spawn). New clients should list/create/select and join with a selection ticket.

## RPC `character_list` / `character_create` / `character_select` / `character_soft_delete` / `character_restore`

Authenticated. Create takes `{ name, classId }`. Select takes `{ characterId }` and returns `{ ticketId, expiresAt, ... }`. Soft-delete and restore take `{ characterId }`. Slot limit is 3 live characters. Canonical names are globally unique.

## RPC `find_or_create_starter_zone`

Authenticated HTTP/RPC only. Payload is empty or `{}`. Returns `{ matchId, zoneId, protocolVersion, contentHash }` for the shared development starter zone. Concurrent callers converge on one running match: prefer a live stored match id, otherwise `matchList` by label `zone.starter`, otherwise `matchCreate`. A system-owned storage singleton (`collection` `match`, key `starter_zone`, `permissionWrite: 0`) records the canonical id. Extra raced matches stay empty and shut down after the empty-match timeout.

## Starter-zone match

- Module name: `starter_zone`
- Label: `zone.starter`
- Tick rate: **10 Hz**
- Maximum players: **8**
- Empty-match shutdown: **30 seconds** (300 ticks) after the last presence leaves, or if nobody ever joins
- Join loads the character, quest, inventory, equipment, and wallet once. The tick loop does not read storage. Quest acceptance and objective progress write `collection` `player`, key `quests`, `permissionWrite: 0`. Successful pickup writes `collection` `player`, key `inventory`, `permissionWrite: 0`. Successful equip or unequip writes `collection` `player`, key `equipment`, `permissionWrite: 0`. Successful turn-in, vendor buy/sell, and inn rest use `nk.multiUpdate` for inventory, quests, and wallet gold together when those records change. Position checkpoints write `collection` `player`, key `character` every 5 seconds if the pose changed, on leave, and on match terminate, and they persist inn bind when `bindX`/`bindY` are set. Ground loot is match-only and is not persisted. Health is not written.
- Join metadata must include matching `protocolVersion`, `contentHash`, and a live `selectionTicket` on a new join
- A second socket for an account already in the match is rejected with `already_in_match`. True reconnect of the same session is allowed. After leave, a new session may rejoin: within **5 seconds** the match restores live pose and health from grace memory but resets `lastProcessedSeq` (a new Godot world starts sending seq 1). Same-session resume keeps `lastProcessedSeq`. After grace, or after a new match, join loads the checkpointed position and full health. If a live player record remains but the presence is already gone, join is treated as reconnect rather than `already_in_match`; a different sessionId on that live record also resets `lastProcessedSeq`. The same account cannot occupy two visible presences. Snapshots omit disconnected players immediately.
- Logout waits for match leave, shows **Leaving…**, then returns to login. There is no extra multi-second logout delay; new-session sequence reset is what makes an immediate rejoin movable.
- Debug builds may run `res://scenes/e2e/e2e_slice.tscn` with `--e2e-slice`. That driver opens two device-auth sessions and sends the documented opcodes only. Release builds refuse it. It does not grant items, complete quests, or move the player without match validation.
- Abandoned pickup, equip, and quest `requestId` history is pruned after **10 minutes** (`6000` ticks) and is not scanned every tick.
- Per-player action counters live in match state and enforce the documented 1-second windows. They are not TypeScript globals.
- Players spawn at their saved position, or the zone default if that is what was stored
- Movement uses content `moveSpeed`, server `dt`, zone `walkableBounds`, and zone `collisions`. Client position is never accepted
- One shared `enemy.green_slime:0` is simulated in the match. Snapshots include its pose, health, and AI state. Player death restores health at the persisted inn bind when set, otherwise `zone.starter.playerSpawn`, after 3 seconds. Slime death restores it at its spawn after `respawnDelay` (10 seconds) and creates one transient `item.slime_gel` loot entity at the death pose. That loot expires after 30 seconds.

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
- If the realtime socket drops, the client refreshes or reauthenticates the session, reconnects with bounded exponential backoff (0.5s doubling to 8s, 8 attempts), rejoins `find_or_create_starter_zone`, waits for a fresh `FULL_STATE`, and resubscribes to chat without duplicating socket callbacks. Cancel/Log out stops reconnect and returns to login.
