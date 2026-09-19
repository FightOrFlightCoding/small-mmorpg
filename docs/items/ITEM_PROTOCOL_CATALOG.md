# Item protocol catalog (ITEM-02)

Live opcodes from [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md) and `server/src/domain/protocol.ts`. Foundation audit at ITEM-02: **41** client opcodes, **15** server opcodes, **29** RPCs, **35** storage records.

Client item requests today carry `requestId`, never `expected_revision`. Trade accept carries `revision` (trade record, not bag). Container `revision` is included on `INVENTORY_STATE` / `EQUIPMENT_STATE` / overflow.

## Client → server (live)

| Op | Name | Body (item-relevant) | Authority | Idempotency | Notable errors |
| --- | --- | --- | --- | --- | --- |
| 4 | `PICKUP` | `lootId`, `requestId` | Match loot + bag | Successful id replays without a second grant | `out_of_range`, `invalid_target`, `inventory_full`, `player_dead`, `stat_injection:instanceId` |
| 5 | `EQUIP` | `instanceId?`, `slot`, `requestId` | Ownership, tags, class, level, locks | Successful replay | `unowned`, `not_equippable`, `invalid_slot`, `item_locked`, `class_restricted`, `level_restricted`, `unique_restricted`, `player_dead`, `inventory_full` |
| 10 | `DESTROY_ITEM` | `instanceId`, `quantity?`, `requestId` | `destroyable`, not equipped, unlocked | Successful replay | `not_destroyable`, `item_locked`, `item_equipped` |
| 11 | `SPLIT_STACK` | `instanceId`, `quantity`, `requestId` | Server mints `newInstanceId` | Replay returns stored new id | `inventory_full`, `item_locked`, `item_equipped` |
| 12 | `MOVE_ITEM` | `instanceId`, `toSlotIndex`, `requestId` | Server slots; merge or swap | Successful replay | `invalid_slot`, `item_locked` |
| 41 | `RECOVER_OVERFLOW_ITEM` | `instanceId`, `toSlotIndex?`, `requestId` | Overflow → free bag slot only | Successful replay | `invalid_id`, `inventory_full`, `invalid_slot`, `item_locked`, `player_dead` |
| 19 | `VENDOR_BUY` | `interactionSessionId`, `npcInstanceId`, `itemId`, `quantity?`, `requestId` | Session, stock, server price, qty 1–99 | Replay no second grant | `invalid_session`, `insufficient_gold`, `inventory_full`, `unknown_field:price` |
| 20 | `VENDOR_SELL` | `npcId`, `instanceId`, `quantity?`, `requestId` | Server `sellValue` × multiplier | Replay no second gold | `unsellable`, `item_locked` |
| 24–31 | `TRADE_*` | `targetId` / `tradeId` / `instanceId` / `amount` / `revision` / `requestId` | Range 80 px, locks, mutual accept | `requestId` + completed trade | `not_tradeable`, `revision_mismatch`, `insufficient_gold`, `inventory_full` |
| 6–7 | `QUEST_ACCEPT` / `QUEST_TURN_IN` | quest/npc/`requestId` | Consume/grant server-side | Turn-in replay | `missing_item`, `inventory_full`, `stat_injection:gold` |

Rate: pickup/equip/inventory/vendor/trade share 8 / 10-tick window. Max body 2048 bytes. Unknown fields rejected where strict parse applies.

`gold`, `price`, `resultingBalance`, `instanceId` on pickup, `lootRecipients`, client quest counts: injection / unknown_field.

## Server → client (live)

| Op | Name | Item payload |
| --- | --- | --- |
| 101 | `FULL_STATE` | `inventory`, `equipment`, `wallet.gold`, `loot[]` (public, no instance ids) |
| 102 | `SNAPSHOT` | Public loot poses when present |
| 105 | `INVENTORY_STATE` | `capacity`, `items[]`, `revision`, optional `overflow` |
| 109 | `EQUIPMENT_STATE` | `slots`, `items[]`, `revision`, derived |
| 110 | `WALLET_STATE` | `gold` |
| 115 | `TRADE_STATE` | ids, state, revision, offers, goldOffers, acceptances, expiry |
| 107 | `INTERACTION_RESULT` | Vendor shop presentation (`stock`, prices) — presentation, not a grant |
| 111 | `QUEST_STATE` | Objectives including `acquire_item` counts from possession |

## RPCs

No item-grant RPC for players. `gm_command` may grant items/gold under allowlist + audit. Character create initializes class `startingEquipment` stacks once. Account export includes inventory/gold; NPC pose/loot lists omitted as match-transient.

## Target operations not on the wire

Later ITEM phases must add intentions (opcode numbers **unassigned** here; update `tools/foundation-audit/expected.json` when they land):

| Operation | Live stand-in | Gap |
| --- | --- | --- |
| Corpse single loot | `PICKUP` of public `MatchLoot` | No corpse id, no private window, no entry state |
| Loot All | None | — |
| Need / Greed / Pass | None | — |
| Corpse gold claim | None | — |
| Player ground drop | `DESTROY_ITEM` (deletes) | No ground spawn |
| Ground pickup (player drop) | `PICKUP` | Same public 30 s path |
| Bag mutation with `expected_revision` | `requestId` only | Stale layout not version-checked as a bag revision |
| Foraging grant | None | Future source must still be server-only |

Do not let the client submit roll numbers, winners, corpse expiry, or drop coordinates.
