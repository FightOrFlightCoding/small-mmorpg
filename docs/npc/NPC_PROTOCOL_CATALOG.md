# NPC protocol catalog (NPC-07)

NPC-07 adds no opcodes. It keeps `INTERACT` (2), `DIALOGUE_CHOOSE` (39), `INTERACTION_CLOSE` (40), `QUEST_ACCEPT` (6), `QUEST_TURN_IN` (7), and session-gated `VENDOR_BUY` (19). `VENDOR_SELL` (20) is unchanged. No NPC RPC or storage collection is added.

`FULL_STATE.npcs` always includes the current public movement plan. `SNAPSHOT` includes `npcs` when a movement revision changes, including pause and resume. Plans never include `rngState`. `npcQuestMarkers` is character-specific and appears on `FULL_STATE` and `QUEST_STATE` only, never on `SNAPSHOT`.

## Match messages

| Direction | Message | Body | Authority |
| --- | --- | --- | --- |
| Client → server | `INTERACT` (2) | `{ protocolVersion, targetId, requestId }` | Server validates ownership, account/match presence, alive, not link-dead, not transferring, NPC existence, current pose/range, and the interact rate limit, then creates a session. Repeated `requestId` replays the stored result. Vendor NPCs include `vendorId`, `currencyId`, and catalog `stock` as presentation extras. |
| Client → server | `DIALOGUE_CHOOSE` (39) | `{ protocolVersion, interactionSessionId, optionId, requestId }` | Server validates the live session and option, then returns the next node. |
| Client → server | `INTERACTION_CLOSE` (40) | `{ protocolVersion, interactionSessionId, npcInstanceId, requestId }` | Server closes that player's session. Last close on an NPC resumes movement. |
| Server → client | `INTERACTION_RESULT` (107) | `{ protocolVersion, ok, code, requestId, targetId, dialogueId?, services?, context?, interactionSessionId?, currentNodeId?, allowedOptionIds?, availableServiceIds?, expiresAtTick?, vendorId?, currencyId?, stock? }` | Presentation only. Not a gold or item grant. `stock` is catalog display; the match recomputes price on buy. |
| Client → server | `QUEST_ACCEPT` (6) | `{ protocolVersion, interactionSessionId, npcInstanceId, questId, requestId }` | Canonical quest engine. |
| Client → server | `QUEST_TURN_IN` (7) | `{ protocolVersion, interactionSessionId, npcInstanceId, questId, requestId }` | Canonical quest/transaction boundary. |
| Server → client | `QUEST_STATE` (106) | `{ protocolVersion, contentHash, requestId?, quests, npcQuestMarkers? }` | Recipient quest log plus character-specific markers. |
| Client → server | `VENDOR_BUY` (19) | `{ protocolVersion, interactionSessionId, npcInstanceId, itemId, quantity?, requestId }` | Existing vendor/transaction owner supplies every price and wallet delta. Client `price` / `gold` / `resultingBalance` rejected. Quantity omitted means 1; 0, negative, non-integer, and values above 99 are `invalid_amount`. |
| Client → server | `VENDOR_SELL` (20) | `{ protocolVersion, npcId, instanceId, quantity?, requestId }` | Preserved sell path. Server sell value. Equipped items are locked. |
| Client → server | `INN_REST` (21) | `{ npcId, mode?, requestId }` | Existing inn owner calculates healing, resources, bind, and gold. |
| Client → server | `CAVE_ENTER` / `CAVE_EXIT` (22/23) | `{ npcId, requestId }` | Existing cave owner validates service and issues one-time transfer tickets. |
| Client → server | `TRAINER_RESPEC` (37) | `{ npcId, requestId }` | Existing progression owner validates authored `respec` service and commits the existing respec transaction. |
| Client → server | `RETURN_TO_CHARACTER_SELECT` (32) | `{ protocolVersion, requestId }` | Safe leave. Session does not survive. Quests, inventory, and gold persist. |
| Client → server | `RESYNC_REQUEST` (8) | `{ protocolVersion }` | Fresh `FULL_STATE` with current NPC plans plus persisted quests, inventory, and wallet. |

All payloads are protocol version 1, strict, bounded to 2048 bytes, and rate-limited. Rewarding operations use the existing idempotency rules. Join metadata must match `protocolVersion` and `contentHash`.

## Interaction behavior

The client creates an interaction request from the NPC under the cursor on `interact_pointer` (right mouse default), or the nearest content-known NPC on the keyboard interact action. `DialoguePresenter` records the request ID, shows loading, and presents the reusable window only from a matching `INTERACTION_RESULT`. The vendor service button opens `MerchantWindow` without closing the session. Back restores dialogue. Failed buys surface a visible error. Manual close, ESC, out of range, death, link-dead, disconnect, transfer, match leave, and expiry invalidate the session. Persistence leave paths resume the NPC immediately when no usable sessions remain.

`services` / `availableServiceIds` / `stock` are advisory presentation data, never a client authorization. Service buttons call only the existing `QuestService`, `ProgressionService`, `VendorService`, `InnService`, or `CaveService`.

## Future-compatible rules

Later NPC service actions must send `interactionSessionId`, `npcInstanceId`, and `requestId` and re-run that service's current server validation. They must not send a dialogue choice as a completed quest, a merchant price or gold result, a target match ID, or an NPC position. Adding an ordinary dialogue, quest-giver, or merchant NPC must not require a new opcode.
