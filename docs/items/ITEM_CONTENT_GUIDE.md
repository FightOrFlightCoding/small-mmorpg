# Item content guide

Author items as one JSON document per id under `content/source/item.*.json` against `content/schemas/item.json`. Build with `scripts/content.ps1`. Never put Godot paths in content; use visual ids.

## Required fields

`id`, `kind: item`, `displayName`, `visualId`, `maxStack`, `category`.

## Stack and equipment

| Rule | Value |
| --- | --- |
| Non-gear `maxStack` | 1–99 (absolute 99) |
| Equippable `maxStack` | Must be 1 |
| Equipment tags | `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet` |
| Unique | `uniquePolicy` is uniqueness, not binding |

There is no soulbind / BoP / BoE field. Production items must be tradeable and droppable, including quest items.

## Quest items

Set `questItem: true`, `tradeable: true`, `droppable: true`. `destroyable` may be false. A production quest that **consumes** such an item must declare `itemReacquisition` with a repeatable world source. `EXPLICIT_EXTERNAL_ACQUISITION` alone is invalid for production.

## Rarity

`rarity.poor` … `rarity.legendary`. Uncommon or higher party-tagged corpse drops enter Need/Greed. Quest items never roll.

## Development-only

`developmentOnly: true` documents are omitted from the production generate used by the starter zone. Foundation `item.test_*` vendor items are production catalog entries for the test vendor, not lab-only content.

## Vendors and loot

Merchant prices live on vendor stock (`buyPrice`), never on the client. Loot tables reference item ids. See [LOOT_TABLE_GUIDE.md](LOOT_TABLE_GUIDE.md) and [MERCHANT_GUIDE.md](MERCHANT_GUIDE.md).
