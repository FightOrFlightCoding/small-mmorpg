# Item-system architecture contract (ITEM-07)

**Last accepted gameplay phase:** NPC-07 — Lifecycle, security, and final certification (playable line `origin/main`, including later client crash/hang repairs).  
**Last accepted progression phase:** PROG-15.  
**Current requested phase:** ITEM-07 — Merchant purchasing and bag integration.

ITEM-07 adds merchant purchasing on the accepted NPC interaction session and the 30-slot bag. The client never finalizes bag, wallet, or loot ownership before server confirmation. Do not create parallel inventory, equipment, wallet, loot, transaction, merchant, trade, or quest-item systems.

## Preparation snapshot (this phase)

| Topic | Value |
| --- | --- |
| Canonical git line | ITEM-07 stacks on ITEM-06 (`cursor/item-06-need-greed-7369`). |
| Inventory save envelope | Gameplay `schemaVersion` **1** (`SAVE_SCHEMA_VERSION`). Journal, intents, audits, and typed lock fields persist **inside** the inventory record. There is no 36th storage collection. Corpses are match-lifetime only. |
| Pre-existing test failures | **None.** Trade suite included. |
| Duplicate ownership | One server inventory, one equipment map, one Nakama wallet `gold`, one match loot list, one corpse list, one trade state machine, one capacity simulator, one item transaction boundary. GLoot is a client mirror only. |
| Files changed in ITEM-05 | `enemy_tag.ts`, `corpse.ts`, loot table gold/kind, match loop death/corpse opcodes, `CorpseService` / `CorpseWindow`, `KIND_CORPSE`, dual-path sparkles |

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
| Loot tables | `loot_table.ts`, `content/schemas/loot_table.json` | LCG `kill:<instanceId>:<deathCount>`. Optional entry `kind` `item` \| `gold`. Quantity ranges, guaranteed/chance/weighted groups. |
| Ground loot | `loot.ts` `MatchLoot`, match `state.loot` | Public 30 s TTL sparkles. Mob deaths also create corpses. Sparkles linked with `corpseId`/`corpseEntryId` for Prompt 18. SNAPSHOT omits `instanceId`. |
| Corpse loot | `corpse.ts` `CorpseLootContainer`, match `state.corpses` | First-hit tag; 60 s private; 5 min expire; Loot All; gold split. Match-lifetime. Client window is presentation only. |
| Party credit / loot | `party_credit.ts`, `party_loot.ts`, `enemy_tag.ts`, `loot_roll.ts` | First damaging hit snapshots the encounter roster. Ordinary corpse loot is first-come. Uncommon+ party drops Need/Greed. |
| Merchant | `vendor.ts`, `MerchantWindow`, NPC `vendor` service | Static unlimited catalog, server `buyPrice`, `stockEntryId`. `VENDOR_BUY` session-gated with preferred bag slot. **`VENDOR_SELL` exists but is not in the ITEM-07 window.** |
| Wallet | `wallet.ts`, Nakama wallet `gold`, `player`/`wallet_ref` | Account-scoped gold. Not an item instance. Not a bag slot. |
| Trade | `trade.ts`, `match_trade.ts`, `trade_store.ts`, `TradeService` | Nearby same-match item+gold trade. Typed `TRADE` locks. `planTwoWayTrade` gates commit. Atomic `multiUpdate`. |
| Quest items | `quest.ts` `syncAcquireObjectives`, `quest_reward.ts` consume | Possession recount. Gel and proof token are tradeable and droppable; `destroyable` is false. |
| Transactions | `item_txn.ts`, `transaction.ts`, `nakama/transaction_store.ts` | One domain boundary plus OCC gold/inventory committers. Idempotent `requestId`. |
| Locks | `item_lock.ts` on `ItemInstance` | Typed locks, TTL 120 s, tick expiry, orphan release. Partial quantity lock still immobilizes the stack. |
| Journal / intents / audit | Inventory fields `journalByRequestId`, `intentsByRequestId`, `itemAudits` | No new storage key. Audit cap 32. |
| Recovery | `recovery.ts`, trade `committing` snapshot, GM `cancel_trade`, journal retry/compensate | Interrupted commit retries. Ground loot dies with the match. |

## Authority boundary

The Godot client sends intentions: `PICKUP`, `OPEN_CORPSE`, `CLOSE_CORPSE`, `CLAIM_CORPSE_ITEM`, `CLAIM_CORPSE_GOLD`, `LOOT_ALL_CORPSE`, `SUBMIT_LOOT_ROLL`, `EQUIP`, `DESTROY_ITEM`, `SPLIT_STACK`, `MOVE_ITEM`, `RECOVER_OVERFLOW_ITEM`, `VENDOR_BUY`, `VENDOR_SELL`, `TRADE_*`, plus optional `expectedRevision`. It must never submit a new instance id, ownership, definition, stack result, bag layout, merchant price, gold balance, loot winner, roll number, corpse timer, ground position, trade result, quest count, or a generic container command.

The Nakama match remains authoritative for grants, capacity, prices, locks, loot entities, corpse containers, gold splits, trade revision, overflow recovery, and wallet deltas. Stale `expectedRevision` cannot overwrite canonical state.

## Target platform (later ITEM phases)

The completed item platform, without implementing remaining features in ITEM-04:

- One **30-slot** character bag, indices **0–29**, visual **6×5**.
- Persistent slot order.
- Equippable items **max stack 1**; non-equippable content max **1–99** (default 99, absolute 99).
- Equipment **outside** the bag; unequip requires a free bag slot.
- Item tooltips; drag-and-drop bag management; split/merge/swap. **Done in ITEM-04.**
- Corpse loot with first-attacker tag, 60 s private, 5 min expire, Loot All, shared first-come quest-item loot, corpse gold split, Need/Greed for Uncommon+ party drops. **Done in ITEM-05/ITEM-06.**
- Public player-dropped ground items, 5 min, full-stack pickup, server-selected placement.
- Trade: **20** offer slots per side, gold offer, atomic commit.
- All production items tradeable and droppable (including quest items). No soulbind / BoP / BoE.
- Possession-based collection quests (already live; must survive drop/trade).
- Future-safe foraging/gathering **grant path** through the same transaction core.
- One capacity simulator; container revisions; typed locks; audited idempotent mutations. **Done in ITEM-03.**

## Certified owners (reuse, do not fork)

`inventory.ts`, `inventory_store.ts` (domain + nakama), `equipment.ts`, `equipment_store.ts`, `overflow.ts`, `overflow_store.ts` (domain + nakama), `item_migration.ts`, `item_capacity.ts`, `item_lock.ts`, `item_journal.ts`, `item_intent.ts`, `item_audit.ts`, `item_txn.ts`, `item_errors.ts`, `loot.ts`, `loot_table.ts`, `enemy_tag.ts`, `corpse.ts`, `loot_roll.ts`, `party_loot.ts`, `party_credit.ts`, `vendor.ts`, `trade.ts`, `match_trade.ts`, `trade_store.ts`, `wallet.ts`, `transaction.ts`, `transaction_store.ts`, `quest.ts`, `quest_reward.ts`, `quest_objectives.ts`, `match_loop.ts`, `match_state.ts`, `persistence.ts`, `InventoryService`, `EquipmentService`, `WalletService`, `VendorService`, `TradeService`, `CorpseService`, `LootRollService`, `PickupIntent`, `MerchantWindow`, `CorpseWindow`, `LootRollWindow`, `BagGrid`, `ItemSlotView`, `ItemPresentation`, `ItemContextRouter`, `SplitStackDialog`, `DragDropService` (bag/equipment ghosts plus ability preview), `TooltipService` (canonical item rows plus ability/hotbar).

## ITEM-07 change inventory

Merchant purchasing on the accepted NPC interaction session. `VENDOR_BUY` uses `vendorId` + `stockEntryId` + optional `preferredSlot`. Prices stay server-owned. Purchases are all-or-nothing through `planCapacity` / `applyCapacityPlan`, including multi-stack buys. The merchant window shows stock icons, tooltips, canonical prices, the player bag, gold, a quantity selector, and buy results. Player-to-merchant selling stays unimplemented in that window; live `VENDOR_SELL` is unchanged. No new opcode. No new storage collection. Content hash unchanged.

## ITEM-06 change inventory

Need/Greed for Uncommon-or-higher party-tagged corpse entries when two or more characters are death-eligible. One eligible character auto-awards. Server integers 1–100 with injectable RNG. Winner bag simulation grants the whole stack or `AWARDED_PENDING_PICKUP`. All-pass becomes public at 60 s after roll resolution. Opcodes 47 and 118. No new storage collection.

## ITEM-05 change inventory

Authoritative first-hit tagging with an immutable encounter roster; death-eligible roster created once; loot generated once at death with stack splitting; match-lifetime corpse containers; 60 s private / 5 min expire; Loot All; private gold split with durable idempotent shares; public remainder; dual-path slime sparkles. Need/Greed is resolved in ITEM-06. No new storage collection. Opcodes 42–46 and 116–117.

## ITEM-04 change inventory

Player-facing 6×5 `BagGrid`, canonical item tooltips, drag-drop move/merge/swap/split, equipment drag/right-click Equip, pending ghosts, timeout/`inventory_stale` resync that keeps `requestId`. Compatible full stacks reject `stack_full`. No new opcode. No new storage collection. No corpse, merchant, ground, or trade windows.

## ITEM-03 change inventory

Shared capacity simulator, `expectedRevision` + `inventory_stale` resync, typed locks with TTL/orphan recovery, journal/intents/audits on the inventory record, persist reasons that match the mutation, drop/acquisition domain helpers. No new opcode. No new storage collection. No corpse, merchant, ground-drop, or trade UI.
