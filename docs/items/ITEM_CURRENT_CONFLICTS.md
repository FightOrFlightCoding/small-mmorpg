# Current item-system conflicts (ITEM-01)

All rows are **OPEN** unless a later numbered ITEM phase closes them. ITEM-01 must not close a row by changing gameplay.

Status: `OPEN` = live Foundation differs from the completed ITEM platform. `KEEP` = live behavior that a later phase may still keep (for example `VENDOR_SELL`) until that phase names the change.

| ID | Status | Live evidence | Target | Resolution owner |
| --- | --- | --- | --- | --- |
| ITEM-C01 | OPEN | `INVENTORY_CAPACITY = 20`; `player.base.inventoryCapacity` 20; HUD “N / 20 stacks” | 30 slots, indices 0–29, 6×5 | Later bag/content phase |
| ITEM-C02 | OPEN | Equipped instance ids remain in `PlayerInventory.items`; unequip only clears `equipment.slots` | Equipment outside bag; unequip needs a free slot | Later equipment-container phase |
| ITEM-C03 | OPEN | No `rarity`; no roll opcodes; `party_loot.ts` has no Need/Greed | Uncommon+ party corpse Need/Greed, 60 s, Need>Greed>Pass, server 1–100 | Later corpse/roll phase |
| ITEM-C04 | OPEN | `MatchLoot` public, `LOOT_TTL_SEC = 30`, spawn on death at corpse pose | Corpse container; 60 s private; 5 min expire | Later corpse phase |
| ITEM-C05 | OPEN | Credit = killer + current threat table; no first-hit tag; no snapshotted roster | First damaging attacker tags; snapshot party; leash clears tag | Later tagging phase |
| ITEM-C06 | OPEN | `party_split` → `normalizedLootPolicy` `personal` (duplicate grants); `server_assigned` one LCG winner | Ordinary items: first eligible claimant; not round-robin; not full duplicates | Later party-loot phase |
| ITEM-C07 | OPEN | Loot tables have no gold; kills grant XP not coin | Corpse gold; private equal split + remainder order; then public whole remainder | Later gold-loot phase |
| ITEM-C08 | OPEN | Client `PICKUP` one `lootId` | Loot All with detailed summary; skip rolls and foreign pending awards | Later loot-all phase |
| ITEM-C09 | OPEN | `item.slime_gel` / `item.proof_token` `tradeable: false`, `destroyable: false` | Quest items tradeable and droppable; possession recount on loss/gain | Later quest-item phase |
| ITEM-C10 | OPEN | No `droppable`; `DESTROY_ITEM` deletes; no player ground spawn | Public 5 min ground items; server placement; full-stack pickup | Later ground-drop phase |
| ITEM-C11 | OPEN | `TradeOfferLine[]` unbounded | 20 offer slots per participant | Later trade phase |
| ITEM-C12 | KEEP | `VENDOR_SELL` (20) live and tested | This ITEM pack is buy-only | Keep sell until a later phase names removal |
| ITEM-C13 | OPEN | Bag mutations use `requestId` only; no inventory `revision` | Monotonic container revision + `expected_revision` | Later transaction phase |
| ITEM-C14 | OPEN | Schema `maxStack` unbounded `positiveInteger`; potion 10, pebble 50, gel 20 | Non-gear 1–99, default 99, absolute 99; gear 1 | Later content phase |
| ITEM-C15 | OPEN | `CtrlInventory` list; split-half button; no item tooltip; `request_move` unused by HUD | Tooltips; drag-drop; split/merge/swap | Later UI phase |
| ITEM-C16 | OPEN | `uniquePolicy` character/equipped; content can set `tradeable: false` | No soulbind; all production items tradeable/droppable | Later content/policy phase |
| ITEM-C17 | OPEN | Production lock reason `"trade"` only | Typed locks listed in [ITEM_LOCK_MODEL.md](ITEM_LOCK_MODEL.md) | Later lock phase |
| ITEM-C18 | OPEN | Catalog `killer` normalizes to **ground** (public) | Private tagged corpse for the killer/roster | Later corpse/tag phase |
| ITEM-C19 | OPEN | No MigrationOverflow, PendingRollAward, CorpseLootContainer types | Those containers | Later container phase |
| ITEM-C20 | OPEN | Gold is **account** Nakama wallet | Still a wallet (not an item); per-character split is **not** required by the ITEM pack — document only | Keep unless a later phase names a split |
| ITEM-C21 | OPEN | `TX_REASON_ITEM_DESTROY` / `SPLIT` / `MOVE` unused by match persistEconomy (`TX_REASON_LOOT`) | Reason matches the mutation | Later transaction phase |
| ITEM-C22 | OPEN | `acceptItemFailureCode` is grant-only | Full multi-stack planner (outgoing, unequip, preferred slot, locks) | Later simulator phase |
| ITEM-C23 | OPEN | `DragDropService` is ability-preview; bag is not wired | Bag drag-drop intentions | Later UI phase |
| ITEM-C24 | OPEN | No foraging/gathering grant | Future source uses existing transaction/inventory | Later grant-path phase |
| ITEM-C25 | OPEN | Ground loot lost on match restart (30 s anyway) | Player drops also transient; corpses match-lifetime | Documented limitation; do not persist ground items |
| ITEM-C26 | OPEN | Slime journey depends on public gel + F pickup | Must remain completable when corpse rules land (content or dual-path) | Corpse phase must not break Prompt 18 |

## Hard-coded provisional assumptions

| Assumption | Where |
| --- | --- |
| Bag 20 | `inventory.ts` `INVENTORY_CAPACITY`; `player.base.json`; `InventoryService` default 20 |
| Starter `item.training_sword` | `STARTER_ITEM_ID` |
| Loot TTL 30 s | `LOOT_TTL_SEC` |
| Pickup range 40 | `player.base.pickupRange` |
| Trade range 80 px, invite 30 s, session 120 s | `TRADE_RANGE_PX`, `TRADE_INVITE_TTL_TICKS` 300, `TRADE_TTL_TICKS` 1200 |
| Vendor max qty 99 | `VENDOR_MAX_QUANTITY` (purchase cap, not stack cap) |
| Credit range 512 px, death grace 15 s | `player.base.groupCredit` |
| Equipment tags six Foundation slots | `TEMPORARY_EQUIPMENT_SLOT_TAGS` |
| Gel not tradeable | `item.slime_gel.json` |
| GLoot list presentation | `InventoryService.attach_list` |

## Duplicate ownership (none)

There is one inventory writer family (`inventory.ts` + nakama `inventory_store`), one wallet, one trade machine, one vendor apply, one loot list. Client GLoot is not a second bag. Do not add another.

## Baseline trade failure rule

ITEM-01 reran `trade.test.ts` as part of 856 passing server tests. No retargeting.
