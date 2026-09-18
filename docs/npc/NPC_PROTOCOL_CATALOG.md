# NPC protocol catalog (NPC-05)

NPC-05 keeps `INTERACT` (2), `DIALOGUE_CHOOSE` (39), and `INTERACTION_CLOSE` (40). It extends `QUEST_ACCEPT` (6) and `QUEST_TURN_IN` (7) with session fields. No NPC RPC or storage collection is added.

`FULL_STATE.npcs` always includes the current public movement plan. `SNAPSHOT` includes `npcs` when a movement revision changes, including pause and resume. Plans never include `rngState`. `npcQuestMarkers` is character-specific and appears on `FULL_STATE` and `QUEST_STATE` only, never on `SNAPSHOT`.

## Match messages

| Direction | Message | Body | Authority |
| --- | --- | --- | --- |
| Client → server | `INTERACT` (2) | `{ protocolVersion, targetId, requestId }` | Server validates ownership, account/match presence, alive, not link-dead, not transferring, NPC existence, current pose/range, and the interact rate limit, then creates a session. Repeated `requestId` replays the stored result. |
| Client → server | `DIALOGUE_CHOOSE` (39) | `{ protocolVersion, interactionSessionId, optionId, requestId }` | Server validates the live session and option, then returns the next node. |
| Client → server | `INTERACTION_CLOSE` (40) | `{ protocolVersion, interactionSessionId, npcInstanceId, requestId }` | Server closes that player's session. Last close on an NPC resumes movement. |
| Server → client | `INTERACTION_RESULT` (107) | `{ protocolVersion, ok, code, requestId, targetId, dialogueId?, services?, context?, interactionSessionId?, currentNodeId?, allowedOptionIds?, availableServiceIds?, expiresAtTick? }` | Presentation only. Not a quest/gold grant. Accept and turn-in refresh the current node after canonical quest mutation. |
| Client → server | `QUEST_ACCEPT` (6) | `{ protocolVersion, interactionSessionId, npcInstanceId, questId, requestId }` | Canonical quest engine. Requires a live session (same `requestId` may replay without one). Validates offer bind, range, prerequisites. Idempotent. Returns `ACTION_RESULT`, `QUEST_STATE`, and accepted dialogue. |
| Client → server | `QUEST_TURN_IN` (7) | `{ protocolVersion, interactionSessionId, npcInstanceId, questId, requestId }` | Canonical quest/transaction boundary. Requires a live session except same-`requestId` replay. Validates turn-in bind, range, server-side objectives. Rewards once. Returns completion dialogue. |
| Server → client | `QUEST_STATE` (106) | `{ protocolVersion, contentHash, requestId?, quests, npcQuestMarkers? }` | Recipient quest log plus character-specific markers (`!` / `?` / `·`). |
| Client → server | `VENDOR_BUY` / `VENDOR_SELL` (19/20) | NPC plus item/instance, quantity, request ID | Existing vendor/transaction owner supplies every price and wallet delta. |
| Client → server | `INN_REST` (21) | `{ npcId, mode?, requestId }` | Existing inn owner calculates healing, resources, bind, and gold. |
| Client → server | `CAVE_ENTER` / `CAVE_EXIT` (22/23) | `{ npcId, requestId }` | Existing cave owner validates service and issues one-time transfer tickets. |
| Client → server | `TRAINER_RESPEC` (37) | `{ npcId, requestId }` | Existing progression owner validates authored `respec` service and commits the existing respec transaction. |

All payloads are protocol version 1, strict, bounded to 2048 bytes, and rate-limited. `INTERACT`, `DIALOGUE_CHOOSE`, and `INTERACTION_CLOSE` share the interact bucket (8 / 10 ticks). Rewarding operations use the existing idempotency rules.

## Interaction behavior

The client creates an interaction request from the NPC under the cursor on `interact_pointer` (right mouse default), or the nearest content-known NPC on the keyboard interact action. `DialoguePresenter` records the request ID, shows loading, and presents the reusable window only from a matching `INTERACTION_RESULT`. Failed results surface a visible error. Manual close, ESC, out of range, death, link-dead, disconnect, transfer, match leave, and expiry invalidate the session.

`services` / `availableServiceIds` are advisory presentation data, never a client authorization. `dialogueId` and `currentNodeId` select local presentation text. Service buttons call only the existing `QuestService`, `ProgressionService`, `VendorService`, `InnService`, or `CaveService`, now including `interactionSessionId` and `npcInstanceId` on quest accept/turn-in. Prompt 18 `.dialogue` files remain for freeze compile tests; live presentation uses hashed dialogue graphs.

## Future-compatible rules

Later NPC service actions must send `interactionSessionId`, `npcInstanceId`, and `requestId` and re-run that service's current server validation. They must not send a dialogue choice as a completed quest, a merchant price or gold result, a target match ID, or an NPC position.
