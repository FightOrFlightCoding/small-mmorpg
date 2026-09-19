# Item container catalog (ITEM-02)

Containers are logical owners of item instances or gold. ITEM-01 records **live** vs **target**. Live names in code are used until a later phase migrates.

## CharacterBag

| | Live | Target |
| --- | --- | --- |
| Identity | `PlayerInventory` (`capacity` **30** + `items[]`) | 30 slots, indices 0–29 |
| Persistence | `player` / `inventory_<compactId>` (`permissionWrite: 0`) | Same collection; capacity 30 |
| Occupancy | `items.length` ≤ 30; `slotIndex` in `0 .. 29`; holes kept | Fixed 30 positions; empty slots allowed |
| Equipment | Equipped instances **leave this bag** | Equipment **not** in this bag |
| Gold | Not stored here | Unchanged |
| Revision | Container `revision` + `mutationByRequestId` / `pickupByRequestId` | `expected_revision` remains later |
| Owner | Server match | Unchanged |

## EquipmentContainer

| | Live | Target |
| --- | --- | --- |
| Identity | `PlayerEquipment.slots[tag] = instanceId` plus `items[]` | Canonical equipment container |
| Persistence | `player` / `equipment_<compactId>` | Same |
| Bag interaction | Instance leaves `PlayerInventory.items` on equip | Unequip requires a free bag slot |
| Stats | `derivedAttack` + `equipmentModifiersFromGear` / canonical pipeline | Unchanged pipeline; instance source identity |
| Repair | Missing instance clears the slot | Unchanged |

## MigrationOverflow

Live: `player` / `overflow` or `overflow_<compactId>` (`permissionWrite: 0`). Created only when migration cannot place every stack into the 30-slot bag. Owner-only recover via `RECOVER_OVERFLOW_ITEM` into a free bag slot. Not a grant destination. Deleted when empty.

## CorpseLootContainer

**Absent live.** Live equivalent: `MatchLoot` public ground entities at the death pose (`loot.ts`), 30 s TTL, no owner, no gold, no roll state.

Target states per corpse **entry**:

`PRIVATE_AVAILABLE` → `ROLL_PENDING` → `CLAIMING` → `AWARDED_PENDING_PICKUP` / `PUBLIC_AVAILABLE` → `CLAIMED` / `EXPIRED`

Timing: 60 s private from death; public after roll resolution at that boundary; expire 5 minutes from death. Match-lifetime only (not player-save).

## MerchantCatalog

Live: content `vendor` documents + `vendor.ts` `VendorDefinition.stock`. Not an item container. Infinite static rows. Buy creates new instances into CharacterBag. Sell (live) removes bag stacks for gold.

Target for this ITEM pack: merchants **sell to players only**; player sell is out of this implementation. Live `VENDOR_SELL` remains until a later phase names removal ([ITEM-C12](ITEM_CURRENT_CONFLICTS.md)).

## GroundItemContainer

**Absent as a typed container.** Live: the same `state.loot: MatchLoot[]` used for mob drops.

Target: public player-dropped stacks, 5 min TTL, server-selected nearby placement, full-stack pickup only, transient across match/server restart. States: `PUBLIC_AVAILABLE` → `CLAIMING` → `CLAIMED` / `EXPIRED`.

## TradeOfferContainer

Live: `TradeRecord.offers[characterId]: TradeOfferLine[]` plus `goldOffers`. Unbounded list (practical cap = bag stack count). Offered instances stay in CharacterBag with lock `trade` / `tradeId`.

Target: **20** item-offer slots per participant + one gold field. UI shows local bag, local offer, remote offer, both gold, both acceptances, revision — never the remote bag.

## PendingRollAward

**Absent live.** Target: Need/Greed winner who cannot receive the whole stack. State `AWARDED_PENDING_PICKUP`, owner = winner only, remains on the corpse until 5 min expire, not public, not rerolled.

## Gold

Not a container of items. Live: Nakama wallet `gold` (account-scoped) + `player`/`wallet_ref` pointer. Target corpse gold is a currency amount on the corpse, never an item instance.
