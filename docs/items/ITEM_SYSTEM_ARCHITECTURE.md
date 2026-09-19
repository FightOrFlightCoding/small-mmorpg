# Item-system architecture contract (ITEM-02)

**Last accepted gameplay phase:** NPC-07 — Lifecycle, security, and final certification (playable line `origin/main`, including later client crash/hang repairs).  
**Last accepted progression phase:** PROG-15.  
**Current requested phase:** ITEM-02 — Canonical item model, thirty-slot bag, equipment, and migration.

ITEM-02 extends the live inventory/equipment core. It does **not** add corpse, merchant, ground-drop, or trade UI. Do not create parallel inventory, equipment, wallet, loot, transaction, merchant, trade, or quest-item systems.

## Preparation snapshot (this phase)

| Topic | Value |
| --- | --- |
| Canonical git line | `origin/main` (`bcfb3c4` at ITEM-01 branch creation) |
| Inventory save envelope | Gameplay `schemaVersion` **1** (`SAVE_SCHEMA_VERSION`). Instance fields default on v0→v1 load. There is no separate inventory schema integer. |
| Pre-existing test failures | **None.** Trade suite included. |
| Duplicate ownership | One server inventory, one equipment map, one Nakama wallet `gold`, one match loot list, one trade state machine. GLoot is a client mirror only. |
| Files changed in ITEM-02 | inventory/equipment/overflow domain, match loop, lifecycle, content items, client recovery panel, docs |

## Ownership (live)

| Concern | Owner | Contract |
| --- | --- | --- |
| Item definitions | `content/schemas/item.json`, `content/source/item.*.json`, generated catalogs | Immutable shared content. Wire/storage keep `itemId`. |
| Item instances | `inventory.ts` `ItemInstance` | Server-created `instanceId` (Nakama `uuidv4` in adapters; tests inject a factory). |
| Stacks | `inventory.ts` `addOrStackItem` / `applySplitStack` / `applyMoveItem` | One instance + `quantity`. Merge keeps destination instance. Split keeps original id and mints a new id. |
| Bag | `PlayerInventory.capacity` + `items[].slotIndex` | Live capacity from `player.base.inventoryCapacity` (**30**). Fallback `INVENTORY_CAPACITY = 30`. Occupancy is stack count; valid indices are `0 .. 29`. Order is persistent; holes are not compacted. |
| Equipment | `equipment.ts` `PlayerEquipment.slots` + `items[]` | Content tags `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`. Equipped instances **leave the bag**. Unequip needs a free slot. |
| Overflow | `overflow.ts` `MigrationOverflow` | Server-owned recovery container. Drain into bag only. Not extra storage. |
| GLoot | `InventoryService`, `EquipmentService` | Presentation rebuild from `INVENTORY_STATE` / `EQUIPMENT_STATE`. Local GLoot edits revert. Do not edit `client/addons/gloot`. |
| Inventory UI | `world_hud.tscn` `Inventory` panel plus Inventory Recovery | `CtrlInventory` list, equip/unequip, destroy, split-half, overflow recover. `request_move` exists; no bag drag-drop UI. |
| Loot tables | `loot_table.ts`, `content/schemas/loot_table.json` | LCG `kill:<instanceId>:<deathCount>`. Policies `ground_free` / `killer` / `party_split` / `personal` / `server_assigned`. |
| Ground loot | `loot.ts` `MatchLoot`, match `state.loot` | Public 30 s TTL. Spawned at death pose. Not persisted. SNAPSHOT omits `instanceId`. |
| Party credit / loot | `party_credit.ts`, `party_loot.ts` | Credit = killer + threat contributors in range. `party_split` maps to **personal duplicate grants**. No Need/Greed. |
| Merchant | `vendor.ts`, `MerchantWindow`, NPC `vendor` service | Static unlimited catalog, server `buyPrice`. `VENDOR_BUY` session-gated. **`VENDOR_SELL` exists.** |
| Wallet | `wallet.ts`, Nakama wallet `gold`, `player`/`wallet_ref` | Account-scoped gold. Not an item instance. Not a bag slot. |
| Trade | `trade.ts`, `match_trade.ts`, `trade_store.ts`, `TradeService` | Nearby same-match item+gold trade. Locks `trade` / `tradeId`. Atomic `multiUpdate`. |
| Quest items | `quest.ts` `syncAcquireObjectives`, `quest_reward.ts` consume | Possession recount. Gel and proof token are tradeable and droppable; `destroyable` is false. |
| Transactions | `transaction.ts`, `nakama/transaction_store.ts` | Idempotent gold + OCC versions. Match inventory batches often persist as `TX_REASON_LOOT`. |
| Locks | `ItemInstance.lockReason` / `lockId` | Production lock reason `"trade"` (`TRADE_LOCK_REASON`). Free-form string, not an enum. |
| Recovery | `recovery.ts`, trade `committing` snapshot, GM `cancel_trade` | Interrupted trade commit retries. Ground loot dies with the match. |

## Authority boundary

The Godot client sends intentions: `PICKUP`, `EQUIP`, `DESTROY_ITEM`, `SPLIT_STACK`, `MOVE_ITEM`, `RECOVER_OVERFLOW_ITEM`, `VENDOR_BUY`, `VENDOR_SELL`, `TRADE_*`. It must never submit a new instance id, ownership, definition, stack result, bag layout, merchant price, gold balance, loot winner, roll number, corpse timer, ground position, trade result, or quest count.

The Nakama match remains authoritative for grants, capacity, prices, locks, loot entities, trade revision, overflow recovery, and wallet deltas.

## Target platform (later ITEM phases)

The completed item platform, without implementing it in ITEM-01:

- One **30-slot** character bag, indices **0–29**, visual **6×5**.
- Persistent slot order.
- Equippable items **max stack 1**; non-equippable content max **1–99** (default 99, absolute 99).
- Equipment **outside** the bag; unequip requires a free bag slot.
- Item tooltips; drag-and-drop bag management; split/merge/swap.
- Corpse loot with first-attacker tag, 60 s private, 5 min expire, Loot All, Need/Greed for Uncommon+ party drops, shared first-come quest-item loot, corpse gold split.
- Public player-dropped ground items, 5 min, full-stack pickup, server-selected placement.
- Trade: **20** offer slots per side, gold offer, atomic commit.
- All production items tradeable and droppable (including quest items). No soulbind / BoP / BoE.
- Possession-based collection quests (already live; must survive drop/trade).
- Future-safe foraging/gathering **grant path** through the same transaction core.
- One capacity simulator; container revisions; typed locks; audited idempotent mutations.

## Certified owners (reuse, do not fork)

`inventory.ts`, `inventory_store.ts` (domain + nakama), `equipment.ts`, `equipment_store.ts`, `overflow.ts`, `overflow_store.ts` (domain + nakama), `item_migration.ts`, `loot.ts`, `loot_table.ts`, `party_loot.ts`, `party_credit.ts`, `vendor.ts`, `trade.ts`, `match_trade.ts`, `trade_store.ts`, `wallet.ts`, `transaction.ts`, `transaction_store.ts`, `quest.ts`, `quest_reward.ts`, `quest_objectives.ts`, `match_loop.ts`, `match_state.ts`, `persistence.ts`, `InventoryService`, `EquipmentService`, `WalletService`, `VendorService`, `TradeService`, `PickupIntent`, `MerchantWindow`, `DragDropService` (today ability-preview only), `TooltipService` (today ability/hotbar, not item rows).

## ITEM-02 change inventory

Canonical item/instance fields, bag 30, equipment `items[]` outside the bag, MigrationOverflow, opcode 41, Inventory Recovery panel, content hash `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`. No corpse, merchant, ground-drop, or trade UI.
