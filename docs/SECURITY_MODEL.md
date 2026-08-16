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

**Defense:** Nakama socket limits plus application max payload size. Oversize is rejected before domain apply. Zone chat messages longer than 200 characters are rejected by a realtime before hook.

### Chat injection and markup

**Attack:** Empty, malformed, or oversized chat; extra JSON fields; BBCode or other markup meant to restyle or execute in the client.

**Defense:** `ChannelMessageSend` is validated in a Nakama realtime before hook with no module-level memory. Content must be JSON `{ "message": string }` only. Empty and >200 character bodies are rejected. The client renders chat in a `Label` and never enables BBCode on untrusted text. Direct-message and group channel joins are rejected; only room `zone.starter` is allowed.

### Protocol-version mismatch

**Attack or accident:** Client speaks a different envelope version.

**Defense:** Version field checked first. Mismatch is rejected; no state apply.

### Character stat injection

**Attack:** Client sends max health, attack, or position in `character_bootstrap`.

**Defense:** The RPC is strict. Only optional `name` is accepted. Stat and position fields return `stat_injection`. Created records use `player.base` and `zone.starter` spawn. Storage writes use `permissionWrite: 0`.

## Client local storage

The Godot client must not write canonical inventory, equipment, quest, currency, health, or position records to `user://` or other local files. `AppState` is in-memory presentation/session flags only. Persistence is Nakama storage and wallet, written by the server. Session tokens stay in memory; reconnect uses refresh then device reauthentication.

## Logging

Structured logs may include opcode, rejection reason, user ID, match ID, and `requestId`. They must not include session tokens, passwords, device identifiers beyond Nakama’s own account ID, or raw full untrusted payloads when oversized.
