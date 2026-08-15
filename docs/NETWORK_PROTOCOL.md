# Network protocol

Phase 0 records principles only. Opcode tables and JSON schemas for match messages are added when the networking phase lands. They must not contradict this file.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md).

## Versioned protocol

Every client→server and server→client envelope includes a protocol version integer.

- The server advertises the version it speaks (RPC hello and match join snapshot).
- The client sends the version it encoded.
- Mismatch is a hard rejection. The client shows a visible error. No partial apply.

## JSON for the first slice

Match and RPC payloads for the slice are JSON objects.

- Envelopes are UTF-8 JSON.
- Strict messages reject unknown fields.
- Non-strict snapshots may include additive fields only if a later accepted phase documents them; Phase 0 assumes strict intentions and strict rewarded requests.

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

## Unique request ID on rewarded actions

Any action that can grant loot, quest rewards, or currency **must** include a client-generated `requestId` (UUID string).

- First successful apply stores the `requestId` with the result.
- Replays of the same `requestId` return the original result and must not mutate inventory or wallet again.
- Missing or malformed `requestId` is rejected.

## Full-state resynchronization

The server can send a full snapshot of the local player and visible zone state.

- Used on join, on explicit resync request, and when the server detects the client is too far behind.
- The client replaces local view state with the snapshot. It does not merge client-invented stats over it.

## Rejection of unknown or malformed messages

The server rejects:

- unknown opcodes
- unknown fields on strict messages
- malformed JSON
- invalid content or entity IDs
- oversized payloads (limit to be set in the networking phase; must be finite and enforced)
- wrong protocol version

Rejections are typed (`unknown_opcode`, `malformed_json`, `unknown_field`, `invalid_id`, `protocol_mismatch`, `payload_too_large`). They are logged without tokens or personal data. They are never silently ignored.
