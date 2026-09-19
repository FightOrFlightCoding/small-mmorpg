# Item-system architecture contract (ITEM-04)

**Last accepted gameplay phase:** NPC-07 — Lifecycle, security, and final certification (playable line `origin/main`, including later client crash/hang repairs).  
**Last accepted progression phase:** PROG-15.  
**Current requested phase:** ITEM-04 — Complete thirty-slot bag UI and bag interactions.

ITEM-04 is the player-facing 6×5 bag. It does **not** add corpse, merchant, ground, or trade windows. The client never finalizes bag or equipment ownership before server confirmation. Do not create parallel inventory, equipment, wallet, loot, transaction, merchant, trade, or quest-item systems.

## Preparation snapshot (this phase)

| Topic | Value |
| --- | --- |
| Canonical git line | `origin/main` (`bcfb3c4` at ITEM-01 branch creation). ITEM-04 stacks on ITEM-03. |
| Inventory save envelope | Gameplay `schemaVersion` **1** (`SAVE_SCHEMA_VERSION`). Journal, intents, audits, and typed lock fields persist **inside** the inventory record. There is no 36th storage collection. |
| Pre-existing test failures | **None.** Trade suite included. |
| Duplicate ownership | One server inventory, one equipment map, one Nakama wallet `gold`, one match loot list, one trade state machine, one capacity simulator, one item transaction boundary. GLoot is a client mirror only. |
| Files changed in ITEM-04 | `BagGrid` / `ItemSlotView` / `ItemPresentation` / `ItemContextRouter` / `SplitStackDialog`; InventoryService pending/resync; EquipmentService slot attach; DragDropService ghosts; world HUD 6×5; `applyMoveItem` `stack_full`; `bag_ui_test.gd` |

## Ownership (live)

| Concern | Owner | Contract |
| --- | --- | --- |
| Item definitions | `content/schemas/item.json`, `content/source/item.*.json`, generated catalogs | Immutable shared content. Wire/storage keep `itemId`. |
| Item instances | `inventory.ts` `ItemInstance` | Server-created `instanceId` (Nakama `uuidv4` in adapters; tests inject a factory). |
| Stacks | `inventory.ts` `addOrStackItem` / `applySplitStack` / `applyMoveItem` | One instance + `quantity`. Merge keeps destination instance. Split keeps original id and mints a new id. |
| Capacity | `item_capacity.ts` `planCapacity` | One deterministic planner for all later ITEM systems. |
| Bag | `PlayerInventory.capacity` + `items[].slotIndex` | Live capacity from `player.base.inventoryCapacity` (**30**). Fallback `INVENTORY_CAPACITY = 30`. Occupancy is stack count; valid indices are `0 .. 29`. Order is persistent; holes are not compacted. |
| Equipment | `equipment.ts` `PlayerEquipment.slots` + `items[]` | Content tags `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`. Equipped instances **leave the bag**. Unequip uses the planner and needs a free slot. |
| Overflow | `overflow.ts` `MigrationOverflow` | Server-owned recovery container. Drain into bag only. Drop compensation may use overflow. Not extra storage. |
| GLoot | `InventoryService`, `EquipmentService` | Presentation rebuild from `INVENTORY_STATE` / `EQUIPMENT_STATE`. Local GLoot edits revert. Do not edit `client/addons/gloot`. |
| Inventory UI | `world_hud.tscn` `Inventory` panel plus Inventory Recovery | 6×5 `BagGrid` (slots 0–29), item tooltips, drag-drop / right-click via `ItemContextRouter`, equip/unequip, destroy, split selector, overflow recover. Mutations send optional `expectedRevision`. |
| Loot tables | `loot_table.ts`, `content/schemas/loot_table.json` | LCG `kill:<instanceId>:<deathCount>`. Policies `ground_free` / `killer` / `party_split` / `personal` / `server_assigned`. |
| Ground loot | `loot.ts` `MatchLoot`, match `state.loot` | Public 30 s TTL. Spawned at death pose. Not persisted. SNAPSHOT omits `instanceId`. Pickup uses acquisition intent. |
| Party credit / loot | `party_credit.ts`, `party_loot.ts` | Credit = killer + threat contributors in range. `party_split` maps to **personal duplicate grants**. No Need/Greed. |
| Merchant | `vendor.ts`, `MerchantWindow`, NPC `vendor` service | Static unlimited catalog, server `buyPrice`. `VENDOR_BUY` session-gated. **`VENDOR_SELL` exists.** |
| Wallet | `wallet.ts`, Nakama wallet `gold`, `player`/`wallet_ref` | Account-scoped gold. Not an item instance. Not a bag slot. |
| Trade | `trade.ts`, `match_trade.ts`, `trade_store.ts`, `TradeService` | Nearby same-match item+gold trade. Typed `TRADE` locks. `planTwoWayTrade` gates commit. Atomic `multiUpdate`. |
| Quest items | `quest.ts` `syncAcquireObjectives`, `quest_reward.ts` consume | Possession recount. Gel and proof token are tradeable and droppable; `destroyable` is false. |
| Transactions | `item_txn.ts`, `transaction.ts`, `nakama/transaction_store.ts` | One domain boundary plus OCC gold/inventory committers. Idempotent `requestId`. |
| Locks | `item_lock.ts` on `ItemInstance` | Typed locks, TTL 120 s, tick expiry, orphan release. Partial quantity lock still immobilizes the stack. |
| Journal / intents / audit | Inventory fields `journalByRequestId`, `intentsByRequestId`, `itemAudits` | No new storage key. Audit cap 32. |
| Recovery | `recovery.ts`, trade `committing` snapshot, GM `cancel_trade`, journal retry/compensate | Interrupted commit retries. Ground loot dies with the match. |

## Authority boundary

The Godot client sends intentions: `PICKUP`, `EQUIP`, `DESTROY_ITEM`, `SPLIT_STACK`, `MOVE_ITEM`, `RECOVER_OVERFLOW_ITEM`, `VENDOR_BUY`, `VENDOR_SELL`, `TRADE_*`, plus optional `expectedRevision`. It must never submit a new instance id, ownership, definition, stack result, bag layout, merchant price, gold balance, loot winner, roll number, corpse timer, ground position, trade result, quest count, or a generic container command.

The Nakama match remains authoritative for grants, capacity, prices, locks, loot entities, trade revision, overflow recovery, and wallet deltas. Stale `expectedRevision` cannot overwrite canonical state.

## Target platform (later ITEM phases)

The completed item platform, without implementing remaining features in ITEM-04:

- One **30-slot** character bag, indices **0–29**, visual **6×5**.
- Persistent slot order.
- Equippable items **max stack 1**; non-equippable content max **1–99** (default 99, absolute 99).
- Equipment **outside** the bag; unequip requires a free bag slot.
- Item tooltips; drag-and-drop bag management; split/merge/swap. **Done in ITEM-04.**
- Corpse loot with first-attacker tag, 60 s private, 5 min expire, Loot All, Need/Greed for Uncommon+ party drops, shared first-come quest-item loot, corpse gold split.
- Public player-dropped ground items, 5 min, full-stack pickup, server-selected placement.
- Trade: **20** offer slots per side, gold offer, atomic commit.
- All production items tradeable and droppable (including quest items). No soulbind / BoP / BoE.
- Possession-based collection quests (already live; must survive drop/trade).
- Future-safe foraging/gathering **grant path** through the same transaction core.
- One capacity simulator; container revisions; typed locks; audited idempotent mutations. **Done in ITEM-03.**

## Certified owners (reuse, do not fork)

`inventory.ts`, `inventory_store.ts` (domain + nakama), `equipment.ts`, `equipment_store.ts`, `overflow.ts`, `overflow_store.ts` (domain + nakama), `item_migration.ts`, `item_capacity.ts`, `item_lock.ts`, `item_journal.ts`, `item_intent.ts`, `item_audit.ts`, `item_txn.ts`, `item_errors.ts`, `loot.ts`, `loot_table.ts`, `party_loot.ts`, `party_credit.ts`, `vendor.ts`, `trade.ts`, `match_trade.ts`, `trade_store.ts`, `wallet.ts`, `transaction.ts`, `transaction_store.ts`, `quest.ts`, `quest_reward.ts`, `quest_objectives.ts`, `match_loop.ts`, `match_state.ts`, `persistence.ts`, `InventoryService`, `EquipmentService`, `WalletService`, `VendorService`, `TradeService`, `PickupIntent`, `MerchantWindow`, `BagGrid`, `ItemSlotView`, `ItemPresentation`, `ItemContextRouter`, `SplitStackDialog`, `DragDropService` (bag/equipment ghosts plus ability preview), `TooltipService` (canonical item rows plus ability/hotbar).

## ITEM-04 change inventory

Player-facing 6×5 `BagGrid`, canonical item tooltips, drag-drop move/merge/swap/split, equipment drag/right-click Equip, pending ghosts, timeout/`inventory_stale` resync that keeps `requestId`. Compatible full stacks reject `stack_full`. No new opcode. No new storage collection. No corpse, merchant, ground, or trade windows.

## ITEM-03 change inventory

Shared capacity simulator, `expectedRevision` + `inventory_stale` resync, typed locks with TTL/orphan recovery, journal/intents/audits on the inventory record, persist reasons that match the mutation, drop/acquisition domain helpers. No new opcode. No new storage collection. No corpse, merchant, ground-drop, or trade UI.
