# Security model

The client is an untrusted renderer. Mitigations are server-side. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md).

## Expected attacks and required defenses

### Position spoofing

**Attack:** Client sends a world position or snaps itself across the map.

**Defense:** Movement messages are intentions. The match integrates movement, clamps to max speed, and resolves collision. Broadcast state uses server position only.

### Speed hacking

**Attack:** Client reports larger deltas than legal dt × speed.

**Defense:** Server applies its own dt and move speed from content. Excess intent is truncated or rejected. Time is server time.

### Damage spoofing

**Attack:** Client sends damage dealt or victim health.

**Defense:** Attack intent carries target ID only. Damage and health exist only in match simulation.

### Cooldown bypassing

**Attack:** Client fires attack intents faster than the weapon/skill cooldown.

**Defense:** Cooldown clocks live on the server. Early intents are rejected. Client cooldown UI is cosmetic.

### Item injection

**Attack:** Client writes storage objects or sends a grant list.

**Defense:** Canonical inventory storage uses `permissionWrite: 0`. Grant opcodes from the client are rejected. Only server loot/quest pipelines create items.

### Duplicate pickup

**Attack:** Two pickup intents for the same ground item.

**Defense:** Ground items are match entities. First successful pickup despawns them. Second intent is `invalid_target` or equivalent.

### Duplicate reward

**Attack:** Replay loot or quest-complete with the same or mutated payload.

**Defense:** Rewarded actions require `requestId` and are idempotent. Quest stage advances only forward through legal transitions.

### Quest skipping

**Attack:** Client sends `questComplete` or a later stage ID.

**Defense:** Client may send an interact/turn-in intention. The server checks current stage, objectives, and target NPC ID.

### Invalid target IDs

**Attack:** Attack, loot, or talk using unknown or out-of-range IDs.

**Defense:** IDs validated against match entities and content indexes. Unknown IDs are rejected; they do not crash the match.

### Oversized payloads

**Attack:** Huge JSON to stall the runtime.

**Defense:** Nakama socket limits plus application max payload size. Oversize is rejected before domain apply.

### Protocol-version mismatch

**Attack or accident:** Client speaks a different envelope version.

**Defense:** Version field checked first. Mismatch is rejected; no state apply.

## Logging

Structured logs may include opcode, rejection reason, user ID, match ID, and `requestId`. They must not include session tokens, passwords, device identifiers beyond Nakama’s own account ID, or raw full untrusted payloads when oversized.
