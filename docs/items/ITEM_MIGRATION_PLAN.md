# Item migration plan (ITEM-03)

`SAVE_SCHEMA_VERSION` stays **1**. Prompt 23 already defaulted missing instance fields (`sourceType` `migration`, `createdAt` 0, empty locks, sequential `slotIndex`). ITEM-02 migrates containers without raising the envelope. ITEM-03 adds lock/journal/intent/audit fields with empty defaults on load; missing typed lock fields are empty strings / zeros.

Do not re-grant starter swords, quest rewards, or gold during ITEM migrations. Preserve instance ids when a full stack moves.

## Ordered workstreams

ITEM-02 closed content stack rules, bag capacity 30, equipment-out-of-bag, and MigrationOverflow. ITEM-03 closed the capacity planner, revisions, typed locks, and transaction journal. Implement later rows only when a later prompt names the work:

1. **Content** — **done in ITEM-02.** `rarity`, `droppable`, maxStack 1–99, bag 30 in `player.base` + `INVENTORY_CAPACITY` fallback, quest items `tradeable`/`droppable` true. Gel/proof stay non-destroyable.
2. **Capacity planner** — **done in ITEM-03.** One dry-run simulator; optional `expectedRevision` on mutations; typed locks; journal/intents/audit on the inventory record.
3. **Equipment out of bag** — **done in ITEM-02.** Instances leave CharacterBag; unequip needs a free slot; MigrationOverflow for characters who cannot fit after the split; recalc stats from instance ids.
4. **Bag UI** — 6×5, tooltips, drag-drop calling `MOVE_ITEM` / split / merge; GLoot remains a mirror. **Done in ITEM-04.**
5. **Corpse + tag + gold + Loot All** — **done in ITEM-05**. Need/Greed resolution **done in ITEM-06**. Dual-path slime sparkles keep Prompt 18. Reuse acquisition intent.
6. **Player ground drop** — **done in ITEM-08.** 5 min public; server placement; full pickup. Reuses `executeDropIntent`.
7. **Trade 20 offer slots** — cap live unbounded offers; UI already shows two offer lists.
8. **Quest possession** — already live; ITEM-08 drop/pickup recounts `acquire_item` / `collect_item`. Gel remains reacquirable from slimes.
9. **Merchant direction** — **ITEM-07 buy path is live** (session, `stockEntryId`, preferred slot, all-or-nothing multi-stack). `VENDOR_SELL` only if a later phase keeps or removes it.
10. **Forage grant hook** — same transaction core, new `sourceType`. Acquisition intent is ready.
11. **Security/recovery certification** — no parallel systems; audit coverage.

## Saved inventory shape

Live stored value: `capacity`, `items[]` (instance fields including typed lock columns), `revision`, request-id maps, `journalByRequestId`, `intentsByRequestId`, `itemAudits`, envelope timestamps.

When capacity became 30: existing `capacity: 20` records migrate **once** on load to 30 without shuffling `slotIndex` unless a slot is `>= 30`. Do not compact holes.

When equipment left the bag: equipped instance ids are removed from bag `items` and stored on `equipment.items`. Characters who cannot fit remaining stacks after that split receive MigrationOverflow. Recover only into free bag slots. Delete overflow when empty.

Repeated migration is idempotent and does not duplicate stacks. Compatible legacy stacks merge; equipment and metadata-incompatible instances do not.

Missing ITEM-03 lock fields default unlocked. Missing journal/intent/audit maps default absent.

## Match-transient

Ground loot, corpses, loot rolls, and player-created ground items are **not** migrated across match restart. Document as expected loss.

## Trade

Live states map to the target names without a storage bump:

| Live | Target name |
| --- | --- |
| `inviting` | `INVITED` |
| `open` (0 current accepts) | `OPEN` |
| `open` (exactly one current accept) | `ACCEPTED_BY_ONE` |
| `committing` | `COMMITTING` / `RECOVERY_REQUIRED` if snapshot present |
| `completed` | `COMPLETED` |
| `cancelled` | `CANCELLED` or `EXPIRED` via `cancelReason` |

Cap offers at 20 in the trade phase; reject extra lines with a new error, do not silently drop.

## Wallet

Keep account Nakama `gold` until a later phase explicitly splits per character. Corpse gold still writes that wallet.

## Content hash

Any source JSON change rebuilds catalogs. ITEM-03 does not change source items. Recreate Nakama after content-hash changes so clients do not see `content_mismatch`.
