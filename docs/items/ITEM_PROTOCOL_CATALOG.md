# Item protocol catalog (ITEM-05)

Live opcodes from [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md) and `server/src/domain/protocol.ts`. Foundation audit at ITEM-05: **46** client opcodes, **17** server opcodes, **29** RPCs, **35** storage records. Corpse containers are match-lifetime only (no new storage collection).

Item mutations may include optional `expectedRevision` (camelCase). Omitted keeps older clients. Present and stale → `inventory_stale` and canonical `FULL_STATE`. Trade accept still carries trade-record `revision` (not bag). Container `revision` is included on `INVENTORY_STATE` / `EQUIPMENT_STATE` / overflow / `CORPSE_STATE`.

There is **no** generic arbitrary-container client command.

## Client → server (live)

| Op | Name | Body (item-relevant) | Authority | Idempotency | Notable errors |
| --- | --- | --- | --- | --- | --- |
| 4 | `PICKUP` | `lootId`, `requestId`, `expectedRevision?` | Match loot + bag. Corpse-linked sparkles route to the corpse entry. | Successful id replays without a second grant | `out_of_range`, `invalid_target`, `inventory_full`, `player_dead`, `inventory_stale`, `not_eligible`, `stat_injection:instanceId` |
| 5 | `EQUIP` | `instanceId?`, `slot`, `requestId`, `expectedRevision?` | Ownership, tags, class, level, locks | Successful replay | `unowned`, `not_equippable`, `invalid_slot`, `item_locked`, `class_restricted`, `level_restricted`, `unique_restricted`, `player_dead`, `inventory_full`, `inventory_stale` |
| 10 | `DESTROY_ITEM` | `instanceId`, `quantity?`, `requestId`, `expectedRevision?` | `destroyable`, not equipped, unlocked | Successful and terminal failed replay | `not_destroyable`, `item_locked`, `item_equipped`, `inventory_stale` |
| 11 | `SPLIT_STACK` | `instanceId`, `quantity`, `requestId`, `expectedRevision?` | Server mints `newInstanceId` | Replay returns stored new id | `inventory_full`, `item_locked`, `item_equipped`, `inventory_stale` |
| 12 | `MOVE_ITEM` | `instanceId`, `toSlotIndex`, `requestId`, `expectedRevision?` | Server slots; merge or swap; full compatible stacks `stack_full` | Successful replay | `invalid_slot`, `item_locked`, `stack_full`, `inventory_stale` |
| 41 | `RECOVER_OVERFLOW_ITEM` | `instanceId`, `toSlotIndex?`, `requestId`, `expectedRevision?` | Overflow → free bag slot only | Successful replay | `invalid_id`, `inventory_full`, `invalid_slot`, `item_locked`, `player_dead`, `inventory_stale` |
| 42 | `OPEN_CORPSE` | `corpseId`, `requestId` | Alive, range, active corpse | Replay stored open | `invalid_target`, `out_of_range`, `player_dead` |
| 43 | `CLOSE_CORPSE` | `corpseId`, `requestId` | Viewer list | Stores `ok` | — |
| 44 | `CLAIM_CORPSE_ITEM` | `corpseId`, `entryId`, `toSlotIndex?`, `requestId`, `expectedRevision?` | Eligibility, phase, capacity. Preferred slot is strict. | Replay no second grant | `not_eligible`, `loot_item_no_longer_available`, `inventory_full`, `invalid_slot`, `roll_pending`, `inventory_stale` |
| 45 | `CLAIM_CORPSE_GOLD` | `corpseId`, `requestId` | Private roster split or public remainder | Replay original result | `not_eligible`, `loot_item_no_longer_available` |
| 46 | `LOOT_ALL_CORPSE` | `corpseId`, `requestId`, `expectedRevision?` | Gold then items; skip rolls and foreign awards | Replay `lootAll[]` | Per-entry codes; envelope `out_of_range` / `player_dead` / `inventory_stale` |
| 19 | `VENDOR_BUY` | `interactionSessionId`, `npcInstanceId`, `itemId`, `quantity?`, `requestId`, `expectedRevision?` | Session, stock, server price, qty 1–99 | Replay no second grant | `invalid_session`, `insufficient_gold`, `inventory_full`, `unknown_field:price`, `inventory_stale` |
| 20 | `VENDOR_SELL` | `npcId`, `instanceId`, `quantity?`, `requestId`, `expectedRevision?` | Server `sellValue` × multiplier | Replay no second gold | `unsellable`, `item_locked`, `inventory_stale` |
| 24–31 | `TRADE_*` | `targetId` / `tradeId` / `instanceId` / `amount` / `revision` / `requestId` | Range 80 px, locks, mutual accept, `planTwoWayTrade` | `requestId` + completed trade | `not_tradeable`, `revision_mismatch`, `insufficient_gold`, `inventory_full` |
| 6–7 | `QUEST_ACCEPT` / `QUEST_TURN_IN` | quest/npc/`requestId`, turn-in `expectedRevision?` | Consume/grant server-side | Turn-in replay | `missing_item`, `inventory_full`, `stat_injection:gold`, `inventory_stale` |

Rate: pickup **including corpse opcodes** /equip/inventory/vendor/trade share 8 / 10-tick window. Max body 2048 bytes. Unknown fields rejected where strict parse applies.

`gold`, `price`, `resultingBalance`, `instanceId` on pickup, `lootRecipients`, client quest counts: injection / unknown_field.

Stable ITEM codes (snake_case): `inventory_stale`, `inventory_full`, `invalid_slot`, `invalid_quantity`, `stack_incompatible`, `stack_full`, `item_locked`, `item_not_owned`, `item_not_found`, `item_already_claimed`, `source_unavailable`, `destination_unavailable`, `transaction_conflict`, `transaction_recovery_pending`, `not_eligible`, `loot_item_no_longer_available`, `roll_pending`.

## Server → client (live)

| Op | Name | Item payload |
| --- | --- | --- |
| 101 | `FULL_STATE` | `inventory`, `equipment`, `wallet.gold`, `loot[]` (public sparkles, no instance ids), `corpses[]` (pose/timers only). Also sent after `inventory_stale`. |
| 102 | `SNAPSHOT` | Public loot and corpse poses when present |
| 105 | `INVENTORY_STATE` | `capacity`, `items[]`, `revision`, optional `overflow` |
| 109 | `EQUIPMENT_STATE` | `slots`, `items[]`, `revision`, derived |
| 110 | `WALLET_STATE` | `gold` |
| 115 | `TRADE_STATE` | ids, state, revision, offers, goldOffers, acceptances, expiry |
| 116 | `CORPSE_STATE` | Viewer corpse: entries, gold, timers, eligible, public, revision |
| 117 | `CORPSE_REMOVED` | `corpseId`, `reason` |
| 107 | `INTERACTION_RESULT` | Vendor shop presentation (`stock`, prices) — presentation, not a grant |
| 111 | `QUEST_STATE` | Objectives including `acquire_item` counts from possession |
| 103 | `ACTION_RESULT` | Optional `lootAll[]` for opcode 46 |

## RPCs

No item-grant RPC for players. `gm_command` may grant items/gold under allowlist + audit. Character create initializes class `startingEquipment` stacks once. Account export includes inventory/gold; NPC pose/loot/corpse lists omitted as match-transient.

## Target operations not on the wire

Later ITEM phases must add intentions (update `tools/foundation-audit/expected.json` when they land):

| Operation | Live stand-in | Gap |
| --- | --- | --- |
| Need / Greed / Pass | Uncommon+ party entries enter `ROLL_PENDING`; public-boundary resolver is a no-op until ITEM-06 | No roll opcodes; no winner award |
| Player ground drop | Domain `executeDropIntent`; live `DESTROY_ITEM` still deletes | No drop opcode / ground spawn |
| Ground pickup (player drop) | `PICKUP` | Same public 30 s path |
| Foraging grant | Acquisition intent ready | No world-node grant opcode |

Do not let the client submit roll numbers, winners, corpse expiry, drop coordinates, or a generic container mutation.
