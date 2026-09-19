# Item protocol catalog (ITEM-03)

Live opcodes from [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md) and `server/src/domain/protocol.ts`. Foundation audit at ITEM-02/ITEM-03: **41** client opcodes, **15** server opcodes, **29** RPCs, **35** storage records. ITEM-03 adds no opcode and no storage collection.

Item mutations may include optional `expectedRevision` (camelCase). Omitted keeps older clients. Present and stale → `inventory_stale` and canonical `FULL_STATE`. Trade accept still carries trade-record `revision` (not bag). Container `revision` is included on `INVENTORY_STATE` / `EQUIPMENT_STATE` / overflow.

There is **no** generic arbitrary-container client command.

## Client → server (live)

| Op | Name | Body (item-relevant) | Authority | Idempotency | Notable errors |
| --- | --- | --- | --- | --- | --- |
| 4 | `PICKUP` | `lootId`, `requestId`, `expectedRevision?` | Match loot + bag | Successful id replays without a second grant | `out_of_range`, `invalid_target`, `inventory_full`, `player_dead`, `inventory_stale`, `stat_injection:instanceId` |
| 5 | `EQUIP` | `instanceId?`, `slot`, `requestId`, `expectedRevision?` | Ownership, tags, class, level, locks | Successful replay | `unowned`, `not_equippable`, `invalid_slot`, `item_locked`, `class_restricted`, `level_restricted`, `unique_restricted`, `player_dead`, `inventory_full`, `inventory_stale` |
| 10 | `DESTROY_ITEM` | `instanceId`, `quantity?`, `requestId`, `expectedRevision?` | `destroyable`, not equipped, unlocked | Successful and terminal failed replay | `not_destroyable`, `item_locked`, `item_equipped`, `inventory_stale` |
| 11 | `SPLIT_STACK` | `instanceId`, `quantity`, `requestId`, `expectedRevision?` | Server mints `newInstanceId` | Replay returns stored new id | `inventory_full`, `item_locked`, `item_equipped`, `inventory_stale` |
| 12 | `MOVE_ITEM` | `instanceId`, `toSlotIndex`, `requestId`, `expectedRevision?` | Server slots; merge or swap | Successful replay | `invalid_slot`, `item_locked`, `inventory_stale` |
| 41 | `RECOVER_OVERFLOW_ITEM` | `instanceId`, `toSlotIndex?`, `requestId`, `expectedRevision?` | Overflow → free bag slot only | Successful replay | `invalid_id`, `inventory_full`, `invalid_slot`, `item_locked`, `player_dead`, `inventory_stale` |
| 19 | `VENDOR_BUY` | `interactionSessionId`, `npcInstanceId`, `itemId`, `quantity?`, `requestId`, `expectedRevision?` | Session, stock, server price, qty 1–99 | Replay no second grant | `invalid_session`, `insufficient_gold`, `inventory_full`, `unknown_field:price`, `inventory_stale` |
| 20 | `VENDOR_SELL` | `npcId`, `instanceId`, `quantity?`, `requestId`, `expectedRevision?` | Server `sellValue` × multiplier | Replay no second gold | `unsellable`, `item_locked`, `inventory_stale` |
| 24–31 | `TRADE_*` | `targetId` / `tradeId` / `instanceId` / `amount` / `revision` / `requestId` | Range 80 px, locks, mutual accept, `planTwoWayTrade` | `requestId` + completed trade | `not_tradeable`, `revision_mismatch`, `insufficient_gold`, `inventory_full` |
| 6–7 | `QUEST_ACCEPT` / `QUEST_TURN_IN` | quest/npc/`requestId`, turn-in `expectedRevision?` | Consume/grant server-side | Turn-in replay | `missing_item`, `inventory_full`, `stat_injection:gold`, `inventory_stale` |

Rate: pickup/equip/inventory/vendor/trade share 8 / 10-tick window. Max body 2048 bytes. Unknown fields rejected where strict parse applies.

`gold`, `price`, `resultingBalance`, `instanceId` on pickup, `lootRecipients`, client quest counts: injection / unknown_field.

Stable ITEM-03 codes (snake_case): `inventory_stale`, `inventory_full`, `invalid_slot`, `invalid_quantity`, `stack_incompatible`, `stack_full`, `item_locked`, `item_not_owned`, `item_not_found`, `item_already_claimed`, `source_unavailable`, `destination_unavailable`, `transaction_conflict`, `transaction_recovery_pending`.

## Server → client (live)

| Op | Name | Item payload |
| --- | --- | --- |
| 101 | `FULL_STATE` | `inventory`, `equipment`, `wallet.gold`, `loot[]` (public, no instance ids). Also sent after `inventory_stale`. |
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
| Player ground drop | Domain `executeDropIntent`; live `DESTROY_ITEM` still deletes | No drop opcode / ground spawn |
| Ground pickup (player drop) | `PICKUP` | Same public 30 s path |
| Foraging grant | Acquisition intent ready | No world-node grant opcode |

Do not let the client submit roll numbers, winners, corpse expiry, drop coordinates, or a generic container mutation.
