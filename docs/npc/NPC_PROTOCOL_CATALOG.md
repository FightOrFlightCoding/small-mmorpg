# NPC protocol catalog (NPC-01)

NPC-01 creates no opcode, RPC, notification, or storage protocol. It documents the accepted protocol surface. Conflict closure reused existing `INTERACT` / `INTERACTION_RESULT` without new fields.

## Existing match messages

| Direction | Message | Body | Authority |
| --- | --- | --- | --- |
| Client → server | `INTERACT` (2) | `{ protocolVersion, targetId, requestId }` | Server validates target NPC, server pose/range, zone, alive player, and `dialogue` service when catalogued. Repeated `requestId` replays the stored result. |
| Server → client | `INTERACTION_RESULT` (107) | `{ protocolVersion, ok, code, requestId, targetId, dialogueId?, services?, context? }` | Server-approved dialogue ID and public service list. Not a quest/gold grant. |
| Client → server | `QUEST_ACCEPT` (6) | `{ questId, requestId }` | Existing quest engine validates authored accept NPC/service/range. |
| Client → server | `QUEST_TURN_IN` (7) | `{ questId, npcId, requestId }` | Existing quest/transaction boundary validates authored turn-in NPC/service/range and persists rewards atomically. |
| Client → server | `VENDOR_BUY` / `VENDOR_SELL` (19/20) | NPC plus item/instance, quantity, request ID | Existing vendor/transaction owner supplies every price and wallet delta. |
| Client → server | `INN_REST` (21) | `{ npcId, mode?, requestId }` | Existing inn owner calculates healing, resources, bind, and gold. |
| Client → server | `CAVE_ENTER` / `CAVE_EXIT` (22/23) | `{ npcId, requestId }` | Existing cave owner validates service and issues one-time transfer tickets. |
| Client → server | `TRAINER_RESPEC` (37) | `{ npcId, requestId }` | Existing progression owner validates authored `respec` service and commits the existing respec transaction. |

All payloads are protocol version 1, strict, bounded to 2048 bytes, and rate-limited in the existing match action window. Rewarding operations use the existing idempotency rules. There is no NPC RPC.

## Interaction behavior

The client creates an interaction request from the NPC under the cursor on right-click, or the nearest content-known NPC on the keyboard interact action. `DialoguePresenter` records the request ID and opens a local resource only when it receives a matching successful `INTERACTION_RESULT`. A failed result clears the pending presentation request and surfaces a visible error.

`services` is advisory presentation data, never a client authorization. `dialogueId` selects local presentation text. Client dialogue commands may call only the existing `QuestService`, `ProgressionService`, `VendorService`, `InnService`, or `CaveService`, each of which sends an existing intention. Elder/proof/cert scripts use offered helpers that read NPC content rather than embedding quest IDs. Unknown dialogue action owners fail repository audit.

## Future-compatible rules

An interaction session extension must retain request correlation and server validation. It must not send a dialogue choice as a completed quest, a merchant price or gold result, a target match ID, or an NPC position. New service types require all of: a strict content-schema entry, content-build semantic validation, server domain owner, protocol catalog row when traffic changes, client presentation adapter, security test, and a migration/compatibility statement.
