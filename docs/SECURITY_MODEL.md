# Security model

The client is an untrusted renderer. Mitigations are server-side. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md).

## Expected attacks and required defenses

### Position spoofing

**Attack:** Client sends a world position or snaps itself across the map.

**Defense:** Movement messages are intentions. The match integrates movement, clamps to max speed, and resolves collision. Broadcast state uses server position only. Local prediction is display-only and is never accepted as an authoritative transform.

### Speed hacking

**Attack:** Client reports larger deltas than legal dt × speed.

**Defense:** Server applies its own dt and move speed from content. Excess intent is truncated or rejected. Time is server time.

### Damage spoofing

**Attack:** Client sends damage dealt or victim health.

**Defense:** Attack intent carries target ID and `requestId` only. Damage and health exist only in match simulation. Player damage is `player.base.attack` plus the equipped main-hand `attackBonus`. Duplicate `requestId` does not apply a second hit. Client `attack` / `attackBonus` fields are rejected.

### Cooldown bypassing

**Attack:** Client fires attack intents faster than the weapon/skill cooldown.

**Defense:** Cooldown clocks live on the server. Early intents are rejected. Client cooldown UI is cosmetic.

### Item injection

**Attack:** Client writes storage objects or sends a grant list.

**Defense:** Canonical inventory storage uses `permissionWrite: 0`. Grant opcodes from the client are rejected. Only server loot/quest pipelines create items. Equipment stores instance IDs, not client-computed stats.

### Equipment spoofing

**Attack:** Client equips an unowned or unequippable instance, or sends a calculated attack value.

**Defense:** `EQUIP` is `{ instanceId?, slot, requestId }`. The match checks the player is alive, owns the instance, the item definition is equippable into `main_hand`, and the `requestId` has not already succeeded. Derived attack is recalculated on the server after load, equip, unequip, and inventory repair. Client `attack` / `attackBonus` are `stat_injection`.

### Duplicate pickup

**Attack:** Two pickup intents for the same ground item.

**Defense:** Ground items are match entities. First successful pickup despawns them. Second intent is `invalid_target` or equivalent.

### Duplicate reward

**Attack:** Replay loot or quest-complete with the same or mutated payload.

**Defense:** Rewarded actions require `requestId` and are idempotent. Quest stage advances only forward through legal transitions.

### Quest skipping

**Attack:** Client sends `questComplete` or a later stage ID.

**Defense:** Client may send an interact, `QUEST_ACCEPT`, or `QUEST_TURN_IN` intention. The server checks current stage, objectives, required items, and target NPC ID using server positions. Objective counts and `status` / `questComplete` / reward fields on the client payload are rejected. Dialogue Manager does not own quest state. Turn-in uses `nk.multiUpdate` so inventory, quest completion, and gold cannot apply separately.

### Fabricated NPC interaction

**Attack:** Client opens dialogue locally, or sends `INTERACT` / `QUEST_ACCEPT` from across the map.

**Defense:** The client may pick a nearby NPC for usability, but dialogue opens only after `INTERACTION_RESULT` `ok`. The match validates NPC existence, Euclidean distance from server poses against `player.base.interactionRange` (48), and rejects `health <= 0`. Out-of-range and unknown NPC IDs return `out_of_range` / `invalid_target` and do not open dialogue.

### Invalid target IDs

**Attack:** Attack, loot, or talk using unknown or out-of-range IDs.

**Defense:** IDs validated against match entities and content indexes. Unknown IDs are rejected; they do not crash the match.

### Oversized payloads

**Attack:** Huge JSON to stall the runtime.

**Defense:** Nakama socket limits plus application max payload size (**2048** bytes for client→server match bodies). Oversize is rejected before domain apply. Each player is also limited to **24** parsed match messages per tick and the documented per-action windows. Zone chat messages longer than 200 characters are rejected by a realtime before hook.

### Chat injection and markup

**Attack:** Empty, malformed, or oversized chat; extra JSON fields; BBCode or other markup meant to restyle or execute in the client.

**Defense:** `ChannelMessageSend` is validated in a Nakama realtime before hook with no module-level memory. Content must be JSON `{ "message": string }` only. Empty and >200 character bodies are rejected. The client renders chat in a `Label` and never enables BBCode on untrusted text. Direct-message and group channel joins are rejected; only room `zone.starter` is allowed.

### Protocol-version mismatch

**Attack or accident:** Client speaks a different envelope version.

**Defense:** Version field checked first. Mismatch is rejected; no state apply.

### Character stat injection

**Attack:** Client sends max health, attack, or position in `character_bootstrap`.

**Defense:** The RPC is strict. Only optional `name` is accepted. Stat and position fields return `stat_injection`. Created records use `player.base` and `zone.starter` spawn. Storage writes use `permissionWrite: 0`.

### Rate-limit abuse

**Attack:** Flood `INPUT`, `ATTACK`, `INTERACT`, `PICKUP`, `EQUIP`, quest opcodes, or `RESYNC_REQUEST` faster than an honest client.

**Defense:** Match state stores per-user `actionRates` for a 10-tick window. Excess is `rate_limited`, logged, and not applied. Honest 10 Hz movement stays under the `INPUT` cap of 20/s.

## Client local storage

The Godot client must not write canonical inventory, equipment, quest, currency, health, or position records to `user://` or other local files. `AppState` is in-memory presentation/session flags only. Persistence is Nakama storage and wallet, written by the server. Session tokens stay in memory; reconnect uses refresh then device reauthentication.

Debug-only `--e2e-slice` opens two real sessions and sends ordinary intentions. It is compiled out of usefulness in release builds (`OS.is_debug_build()` plus an explicit flag). GdUnit `client/tests/app/e2e_hooks_test.gd` requires the flag. `scripts/test-e2e` drives the live journey. It must not call storage, wallet, or match APIs that a player client cannot call, and it must not skip match validation.

## Logging

Structured logs may include opcode, rejection reason, user ID, match ID, and `requestId`. Match rejections use `match_action rejected user_id=… action=… reason=… tick=…`. They must not include session tokens, passwords, device identifiers beyond Nakama’s own account ID, or raw full untrusted payloads when oversized.

## Attack mapping

Every expected attack maps to a validation rule, an automated test, and a safe server response:

| Attack | Rule | Test | Response |
| --- | --- | --- | --- |
| Position spoofing | `INPUT` is axes+seq only; `x`/`y` are `stat_injection` | `server/tests/security.test.ts`, `protocol.test.ts`, `movement.test.ts` | `SYSTEM_MESSAGE` `stat_injection:x`; pose unchanged |
| Speed hacking | Server dt and `moveSpeed`; extra axis magnitude clamped | `movement.test.ts`, `security.test.ts` | Applied speed matches a unit vector |
| Damage spoofing | `ATTACK` is `targetId`+`requestId`; `damage` rejected | `combat.test.ts`, `protocol.test.ts`, `security.test.ts` | `stat_injection:damage`; HP uses server attack |
| Cooldown bypassing | Server `lastAttackTick` vs `attackCooldown` | `combat.test.ts`, `security.test.ts` | `ACTION_RESULT` `on_cooldown` |
| Item injection | No grant opcode; `instanceId` on `PICKUP` rejected; storage `permissionWrite: 0` | `protocol.test.ts`, `inventory.test.ts`, `security.test.ts` | `unknown_opcode` / `stat_injection:instanceId` |
| Equipment spoofing | Own instance, equippable `main_hand`, server derived attack | `equipment.test.ts`, `security.test.ts` | `unowned` / `not_equippable` / `stat_injection:attack` |
| Duplicate pickup | First success despawns loot; same `requestId` replays | `inventory.test.ts`, `security.test.ts` | Second apply `ok` without a second grant |
| Duplicate reward | `requestId` idempotency on pickup, equip, quest | `inventory.test.ts`, `quest.test.ts`, `quest_reward.test.ts`, `security.test.ts` | Replay `ok`/`accepted`; no second mutate |
| Quest skipping | Turn-in requires accepted stage, NPC, range, items | `quest_reward.test.ts`, `security.test.ts` | `invalid_id` / `incomplete_objective`; gold unchanged |
| Client quest progress | `status` / `questComplete` / `gold` rejected | `protocol.test.ts`, `security.test.ts` | `unknown_field` / `stat_injection:questComplete` |
| Fabricated NPC interaction | Server range and live health | `interaction.test.ts` | `out_of_range` / `invalid_target` / `player_dead` |
| Invalid target IDs | Match entity + content indexes | `combat.test.ts`, `inventory.test.ts`, `interaction.test.ts`, `security.test.ts` | `invalid_target` / `invalid_id`; match continues |
| Oversized payloads | 2048-byte client match cap; 24 messages/tick | `protocol.test.ts`, `security.test.ts` | `payload_too_large` / `rate_limited` |
| Chat injection | Before-hook JSON `{message}`; Label render, no BBCode | `chat.test.ts`, `chat_client_test.gd`, `security.test.ts` | `message_too_long` / `invalid_payload`; markup is plain text |
| Protocol-version mismatch | Envelope version checked first | `protocol.test.ts`, `match.test.ts` | `protocol_mismatch`; no apply |
| Character stat injection | Bootstrap accepts optional `name` only | `character.test.ts` | `stat_injection`; `permissionWrite: 0` |
| Stale movement sequence | `seq <= lastProcessedSeq` ignored | `movement.test.ts`, `security.test.ts` | Pose unchanged |
| Excessive movement / resync | Per-player `actionRates` in match state | `security.test.ts` | `rate_limited`; extra seq/full states dropped |
| Dead-player actions | Health checked before move/attack/interact/loot/equip | `combat.test.ts`, `interaction.test.ts`, `inventory.test.ts`, `equipment.test.ts`, `security.test.ts` | `player_dead`; no mutate |
| Malformed JSON / unknown opcode / unknown fields / NaN / missing fields | Strict `parseClientMessage` | `protocol.test.ts`, `match.test.ts`, `security.test.ts` fixtures | `SYSTEM_MESSAGE`; match does not crash |

