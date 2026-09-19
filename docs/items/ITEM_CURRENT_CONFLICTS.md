# Current item-system conflicts (ITEM-04)

ITEM-04 closed the 6×5 bag UI, item tooltips, drag-drop intentions, split/merge/swap, and equipment drag through the shared context router. Remaining rows stay OPEN until a later numbered ITEM phase names them.

Status: `OPEN` = live Foundation differs from the completed ITEM platform. `KEEP` = live behavior that a later phase may still keep (for example `VENDOR_SELL`) until that phase names the change.

| ID | Status | Live evidence | Target | Resolution owner |
| --- | --- | --- | --- | --- |
| ITEM-C01 | CLOSED | Live bag is 30 slots, indices 0–29; HUD “N / 30 stacks” | 6×5 grid | ITEM-02 closed capacity. ITEM-04 closed the grid ([ITEM-C15](ITEM_CURRENT_CONFLICTS.md)) |
| ITEM-C02 | CLOSED | Equipped instances live in `PlayerEquipment.items`; unequip needs a free bag slot | Equipment outside bag | ITEM-02 |
| ITEM-C03 | OPEN | No `rarity` roll opcodes; `party_loot.ts` has no Need/Greed | Uncommon+ party corpse Need/Greed, 60 s, Need>Greed>Pass, server 1–100 | Later corpse/roll phase |
| ITEM-C04 | OPEN | `MatchLoot` public, `LOOT_TTL_SEC = 30`, spawn on death at corpse pose | Corpse container; 60 s private; 5 min expire | Later corpse phase |
| ITEM-C05 | OPEN | Credit = killer + current threat table; no first-hit tag; no snapshotted roster | First damaging attacker tags; snapshot party; leash clears tag | Later tagging phase |
| ITEM-C06 | OPEN | `party_split` → `normalizedLootPolicy` `personal` (duplicate grants); `server_assigned` one LCG winner | Ordinary items: first eligible claimant; not round-robin; not full duplicates | Later party-loot phase |
| ITEM-C07 | OPEN | Loot tables have no gold; kills grant XP not coin | Corpse gold; private equal split + remainder order; then public whole remainder | Later gold-loot phase |
| ITEM-C08 | OPEN | Client `PICKUP` one `lootId` | Loot All with detailed summary; skip rolls and foreign pending awards | Later loot-all phase |
| ITEM-C09 | CLOSED | `item.slime_gel` / `item.proof_token` are tradeable and droppable; `destroyable` stays false | Quest items tradeable and droppable | ITEM-02. Possession recount remains live |
| ITEM-C10 | OPEN | `DESTROY_ITEM` deletes; no player ground spawn | Public 5 min ground items; server placement; full-stack pickup | Later ground-drop phase. Domain drop intent exists in ITEM-03 |
| ITEM-C11 | OPEN | `TradeOfferLine[]` unbounded | 20 offer slots per participant | Later trade phase |
| ITEM-C12 | KEEP | `VENDOR_SELL` (20) live and tested | This ITEM pack is buy-only | Keep sell until a later phase names removal |
| ITEM-C13 | CLOSED | Optional `expectedRevision` on item opcodes; stale → `inventory_stale` + `FULL_STATE`; omitted keeps old clients | Monotonic revision + `expected_revision` | ITEM-03 |
| ITEM-C14 | CLOSED | Schema `itemMaxStack` 1–99; equippable forced 1; no production item exceeds 99 | Non-gear 1–99, gear 1 | ITEM-02 |
| ITEM-C15 | CLOSED | 6×5 `BagGrid` slots 0–29; canonical tooltips; drag-drop move/merge/swap/split; `request_move` from HUD | 6×5; tooltips; drag-drop; split/merge/swap | ITEM-04 |
| ITEM-C16 | CLOSED | No bind/soulbind fields; production items must be tradeable and droppable | No soulbind | ITEM-02. `uniquePolicy` remains uniqueness, not binding |
| ITEM-C17 | CLOSED | Typed locks on instances (`TRADE`, `DROP_INTENT`, …); TTL 120 s; tick expiry + orphan release | Typed locks listed in [ITEM_LOCK_MODEL.md](ITEM_LOCK_MODEL.md) | ITEM-03. Production trade still also writes `lockReason: "trade"` |
| ITEM-C18 | OPEN | Catalog `killer` normalizes to **ground** (public) | Private tagged corpse for the killer/roster | Later corpse/tag phase |
| ITEM-C19 | OPEN | `MigrationOverflow` is live; PendingRollAward and CorpseLootContainer remain absent | Remaining corpse/roll containers | Later corpse phase |
| ITEM-C20 | OPEN | Gold is **account** Nakama wallet | Still a wallet (not an item); per-character split is **not** required by the ITEM pack — document only | Keep unless a later phase names a split |
| ITEM-C21 | CLOSED | Match persistEconomy stamps `item_destroy` / `item_split` / `item_move` / `loot` / `equipment` via `inventory.persistReason` | Reason matches the mutation | ITEM-03 |
| ITEM-C22 | CLOSED | `planCapacity` / `planTwoWayTrade` serve grant, trade, unequip, preferred slot, outgoing, and locks; `acceptItemFailureCode` delegates | Full multi-stack planner | ITEM-03 |
| ITEM-C23 | CLOSED | `DragDropService` bag/equipment payloads and ghosts; slots send intentions only | Bag drag-drop intentions | ITEM-04 |
| ITEM-C24 | OPEN | No foraging/gathering grant | Future source uses existing transaction/inventory | Later grant-path phase. Acquisition intent is ready |
| ITEM-C25 | OPEN | Ground loot lost on match restart (30 s anyway) | Player drops also transient; corpses match-lifetime | Documented limitation; do not persist ground items |
| ITEM-C26 | OPEN | Slime journey depends on public gel + F pickup | Must remain completable when corpse rules land (content or dual-path) | Corpse phase must not break Prompt 18 |

## Hard-coded provisional assumptions

| Assumption | Where |
| --- | --- |
| Bag 30 | `inventory.ts` `INVENTORY_CAPACITY`; `player.base.json`; `InventoryService` default 30 |
| Starter `item.training_sword` | `STARTER_ITEM_ID` |
| Loot TTL 30 s | `LOOT_TTL_SEC` |
| Pickup range 40 | `player.base.pickupRange` |
| Trade range 80 px, invite 30 s, session 120 s | `TRADE_RANGE_PX`, `TRADE_INVITE_TTL_TICKS` 300, `TRADE_TTL_TICKS` 1200 |
| Vendor max qty 99 | `VENDOR_MAX_QUANTITY` (purchase cap, not stack cap) |
| Item lock TTL 120 s | `ITEM_LOCK_TTL_MS` |
| Credit range 512 px, death grace 15 s | `player.base.groupCredit` |
| Equipment tags six Foundation slots | `TEMPORARY_EQUIPMENT_SLOT_TAGS` |
| Gel not destroyable | `item.slime_gel.json` (`tradeable`/`droppable` true) |
| GLoot mirror plus 6×5 bag | `InventoryService.attach_bag`; `attach_list` remains the GLoot adapter |

## Duplicate ownership (none)

There is one inventory writer family (`inventory.ts` + nakama `inventory_store`), one wallet, one trade machine, one vendor apply, one loot list, **one** capacity simulator, **one** item transaction boundary. Client GLoot is not a second bag. Do not add another. Journal/intents/audits live on the inventory record (not a 36th storage key).

## Baseline trade failure rule

ITEM-01 reran `trade.test.ts` as part of 856 passing server tests. No retargeting. ITEM-02 reran trade after making gel/proof tradeable; non-tradeable coverage uses a cloned catalog flag. ITEM-03 gates trade commit through `planTwoWayTrade` without changing live take/give instance-id behavior.
