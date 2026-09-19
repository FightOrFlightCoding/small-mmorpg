# Current item-system conflicts (ITEM-10)

ITEM-10 closed quest possession, turn-in rewards, and the shared future grant path. Remaining rows stay OPEN until a later numbered ITEM phase names them.

Status: `OPEN` = live Foundation differs from the completed ITEM platform. `KEEP` = live behavior that a later phase may still keep (for example `VENDOR_SELL`) until that phase names the change.

| ID | Status | Live evidence | Target | Resolution owner |
| --- | --- | --- | --- | --- |
| ITEM-C01 | CLOSED | Live bag is 30 slots, indices 0–29; HUD “N / 30 stacks” | 6×5 grid | ITEM-02 closed capacity. ITEM-04 closed the grid ([ITEM-C15](ITEM_CURRENT_CONFLICTS.md)) |
| ITEM-C02 | CLOSED | Equipped instances live in `PlayerEquipment.items`; unequip needs a free bag slot | Equipment outside bag | ITEM-02 |
| ITEM-C03 | CLOSED | Uncommon+ party drops roll Need/Greed; opcode 47/118; 60 s Need>Greed>Pass; server 1–100 | Uncommon+ party corpse Need/Greed, 60 s, Need>Greed>Pass, server 1–100 | ITEM-06 |
| ITEM-C04 | CLOSED | `CorpseLootContainer` 60 s private, 5 min expire; sparkle dual-path TTL 30 s | Corpse container; 60 s private; 5 min expire | ITEM-05 |
| ITEM-C05 | CLOSED | First damaging hit tags owner/party/roster; leash/full reset clears tag | First damaging attacker tags; snapshot party; leash clears tag | ITEM-05 |
| ITEM-C06 | CLOSED | Ordinary corpse items: first eligible claimant. `party_split` personal duplicates remain only for non-corpse personal grants | Ordinary items: first eligible claimant; not round-robin; not full duplicates | ITEM-05 |
| ITEM-C07 | CLOSED | Corpse gold; private equal split + remainder (tag owner then ascending character id); public remainder first claimant | Corpse gold; private equal split + remainder order; then public whole remainder | ITEM-05 |
| ITEM-C08 | CLOSED | `LOOT_ALL_CORPSE` with per-entry summary; skips rolls and foreign pending awards | Loot All with detailed summary; skip rolls and foreign pending awards | ITEM-05 |
| ITEM-C09 | CLOSED | `item.slime_gel` / `item.proof_token` are tradeable and droppable; `destroyable` stays false | Quest items tradeable and droppable | ITEM-02. Possession recount remains live |
| ITEM-C10 | CLOSED | `DROP_ITEM` / `PICKUP_GROUND_ITEM` spawn public 5 min ground items; `DESTROY_ITEM` still deletes | Public 5 min ground items; server placement; full-stack pickup | ITEM-08 |
| ITEM-C11 | CLOSED | `TradeOfferLine[]` is 20 slots per side (`TRADE_OFFER_SLOTS`); 21st is `offer_full` | 20 offer slots per participant | ITEM-09 |
| ITEM-C12 | KEEP | `VENDOR_SELL` (20) live and tested | This ITEM pack is buy-only | Keep sell until a later phase names removal |
| ITEM-C13 | CLOSED | Optional `expectedRevision` on item opcodes; stale → `inventory_stale` + `FULL_STATE`; omitted keeps old clients | Monotonic revision + `expected_revision` | ITEM-03 |
| ITEM-C14 | CLOSED | Schema `itemMaxStack` 1–99; equippable forced 1; no production item exceeds 99 | Non-gear 1–99, gear 1 | ITEM-02 |
| ITEM-C15 | CLOSED | 6×5 `BagGrid` slots 0–29; canonical tooltips; drag-drop move/merge/swap/split; `request_move` from HUD | 6×5; tooltips; drag-drop; split/merge/swap | ITEM-04 |
| ITEM-C16 | CLOSED | No bind/soulbind fields; production items must be tradeable and droppable | No soulbind | ITEM-02. `uniquePolicy` remains uniqueness, not binding |
| ITEM-C17 | CLOSED | Typed locks on instances (`TRADE`, `DROP_INTENT`, …); TTL 120 s; tick expiry + orphan release | Typed locks listed in [ITEM_LOCK_MODEL.md](ITEM_LOCK_MODEL.md) | ITEM-03. Production trade still also writes `lockReason: "trade"` |
| ITEM-C18 | CLOSED | First-hit tag owns the private corpse; `killer` catalog policy no longer public-grounds mob deaths | Private tagged corpse for the killer/roster | ITEM-05 |
| ITEM-C19 | CLOSED | `CorpseLootContainer` plus `AWARDED_PENDING_PICKUP` winner-only pending awards | Remaining roll award container | ITEM-06 |
| ITEM-C20 | OPEN | Gold is **account** Nakama wallet | Still a wallet (not an item); per-character split is **not** required by the ITEM pack — document only | Keep unless a later phase names a split |
| ITEM-C21 | CLOSED | Match persistEconomy stamps `item_destroy` / `item_split` / `item_move` / `loot` / `equipment` via `inventory.persistReason` | Reason matches the mutation | ITEM-03 |
| ITEM-C22 | CLOSED | `planCapacity` / `planTwoWayTrade` serve grant, trade, unequip, preferred slot, outgoing, and locks; `acceptItemFailureCode` delegates | Full multi-stack planner | ITEM-03 |
| ITEM-C23 | CLOSED | `DragDropService` bag/equipment payloads and ghosts; slots send intentions only | Bag drag-drop intentions | ITEM-04 |
| ITEM-C24 | CLOSED | `grantItemFromSource` is the trusted-server grant; GM `grant_test_item` uses it; no client grant opcode | Future source uses existing transaction/inventory | ITEM-10. Harvesting/cooking/mining/blacksmithing remain later |
| ITEM-C25 | CLOSED | Sparkles, corpses, and player ground items are match-lifetime; restart drops unclaimed ground/corpse loot | Player drops also transient; corpses match-lifetime | ITEM-08 documented limitation; do not persist ground items |
| ITEM-C26 | CLOSED | Slime death still spawns a corpse-linked gel sparkle; F/`PICKUP` and corpse claim both grant | Must remain completable when corpse rules land | ITEM-05 dual-path |

## Hard-coded provisional assumptions

| Assumption | Where |
| --- | --- |
| Bag 30 | `inventory.ts` `INVENTORY_CAPACITY`; `player.base.json`; `InventoryService` default 30 |
| Starter `item.training_sword` | `STARTER_ITEM_ID` |
| Loot TTL 30 s | `LOOT_TTL_SEC` (sparkles). Corpse private 60 s / expire 300 s |
| Pickup range 40 | `player.base.pickupRange` |
| Trade range 80 px, invite 30 s, session 120 s, 20 offer slots | `TRADE_RANGE_PX`, `TRADE_INVITE_TTL_TICKS` 300, `TRADE_TTL_TICKS` 1200, `TRADE_OFFER_SLOTS` 20 |
| Vendor max qty 99 | `VENDOR_MAX_QUANTITY` (purchase cap, not stack cap) |
| Item lock TTL 120 s | `ITEM_LOCK_TTL_MS` |
| Player ground drop limit 20 | `PLAYER_GROUND_DROP_LIMIT` (noncanonical implementation value) |
| Player ground TTL 300 s | `GROUND_ITEM_TTL_SEC` |
| Credit range 512 px, death grace 15 s | `player.base.groupCredit` |
| Equipment tags six Foundation slots | `TEMPORARY_EQUIPMENT_SLOT_TAGS` |
| Gel not destroyable | `item.slime_gel.json` (`tradeable`/`droppable` true) |
| GLoot mirror plus 6×5 bag | `InventoryService.attach_bag`; `attach_list` remains the GLoot adapter |

## Duplicate ownership (none)

There is one inventory writer family (`inventory.ts` + nakama `inventory_store`), one wallet, one trade machine, one vendor apply, one loot list, **one** capacity simulator, **one** item transaction boundary. Client GLoot is not a second bag. Do not add another. Journal/intents/audits live on the inventory record (not a 36th storage key).

## Baseline trade failure rule

ITEM-01 reran `trade.test.ts` as part of 856 passing server tests. No retargeting. ITEM-02 reran trade after making gel/proof tradeable; non-tradeable coverage uses a cloned catalog flag. ITEM-03 gates trade commit through `planTwoWayTrade` without changing live take/give instance-id behavior.
