# Item container catalog (ITEM-06)

Containers are logical owners of item instances or gold. ITEM-01 records **live** vs **target**. Live names in code are used until a later phase migrates. ITEM-05 adds a client-visible corpse window over a match-lifetime `CorpseLootContainer`.

## CharacterBag

| | Live | Target |
| --- | --- | --- |
| Identity | `PlayerInventory` (`capacity` **30** + `items[]`) | 30 slots, indices 0–29 |
| Persistence | `player` / `inventory_<compactId>` (`permissionWrite: 0`) | Same collection; capacity 30 |
| Occupancy | `items.length` ≤ 30; `slotIndex` in `0 .. 29`; holes kept | Fixed 30 positions; empty slots allowed |
| Equipment | Equipped instances **leave this bag** | Equipment **not** in this bag |
| Gold | Not stored here | Unchanged |
| Revision | Container `revision` + `mutationByRequestId` / `pickupByRequestId`; optional `expectedRevision` | Stale → `inventory_stale` + `FULL_STATE` |
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

Live: match-lifetime `CorpseLootContainer` on `StarterZoneState.corpses`. Not a player storage collection. Prompt 18 dual-path also spawns corpse-linked `MatchLoot` sparkles (`corpseId` / `corpseEntryId`) so F/`PICKUP` remains completable.

Entry states:

`PRIVATE_AVAILABLE` → `ROLL_PENDING` → `CLAIMING` → `AWARDED_PENDING_PICKUP` / `PUBLIC_AVAILABLE` → `CLAIMED` / `EXPIRED`

Timing: 60 s private from death; Need/Greed resolves at that boundary before remaining unreserved entries become public; expire 5 minutes from death. Empty corpses may vanish immediately. Sparkle TTL stays 30 s.

Need/Greed is live. Qualifying Uncommon-or-higher party-tagged drops open a roll when two or more characters are death-eligible. One death-eligible character auto-awards (pending pickup if the whole stack does not fit). Quest items never enter `ROLL_PENDING`. Ordinary party loot is first successful claimant. Solo-tagged drops never roll.

## MerchantCatalog

Live: content `vendor` documents + `vendor.ts` `VendorDefinition.stock`. Not an item container. Infinite static rows. Buy creates new instances into CharacterBag. Sell (live) removes bag stacks for gold.

Target for this ITEM pack: merchants **sell to players only**; player sell is out of this implementation. Live `VENDOR_SELL` remains until a later phase names removal ([ITEM-C12](ITEM_CURRENT_CONFLICTS.md)).

## GroundItemContainer

**Absent as a typed container.** Live: the same `state.loot: MatchLoot[]` used for mob drops.

Target: public player-dropped stacks, 5 min TTL, server-selected nearby placement, full-stack pickup only, transient across match/server restart. States: `PUBLIC_AVAILABLE` → `CLAIMING` → `CLAIMED` / `EXPIRED`. ITEM-03 provides `executeDropIntent` without a drop opcode.

## TradeOfferContainer

Live: `TradeRecord.offers[characterId]: TradeOfferLine[]` plus `goldOffers`. Unbounded list (practical cap = bag stack count). Offered instances stay in CharacterBag with typed `TRADE` lock (`lockReason` still `"trade"`). Partial quantity locks still make the source stack immovable. Commit is gated by `planTwoWayTrade`.

Target: **20** item-offer slots per participant + one gold field. UI shows local bag, local offer, remote offer, both gold, both acceptances, revision — never the remote bag.

## PendingRollAward

Live as corpse entry state `AWARDED_PENDING_PICKUP`. Owner = Need/Greed (or single-eligible auto-award) winner only. Remains on the corpse until 5 min expire, not public, not rerolled. Winner claims through ordinary corpse claim / Loot All.

## Gold

Not a container of items. Live: Nakama wallet `gold` (account-scoped) + `player`/`wallet_ref` pointer. Target corpse gold is a currency amount on the corpse, never an item instance.
