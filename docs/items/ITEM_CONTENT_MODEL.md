# Item content model (ITEM-06)

ITEM-03 does not change authored item JSON. Content hash remains the ITEM-02 digest.

Authored under `content/source/`. Schemas under `content/schemas/`. Generated catalogs are derived artifacts. Test items use `item.test_*` / `loot.test*` and `developmentOnly` where applicable. Production generate must not leak development-only definitions.

## Item definition

Schema: `content/schemas/item.json`. Runtime type: `inventory.ts` `ItemDefinition`.

| Field | Live | Target (later ITEM) |
| --- | --- | --- |
| `id`, `kind: item` | Required | Unchanged |
| `displayName` / `displayNameKey` / `descriptionKey` | Present | Unchanged |
| `visualId`, `iconAssetId`, `worldAssetId` | Present | Unchanged |
| `category` | `weapon` `armor` `consumable` `quest` `material` `miscellaneous` | Keep; do not invent protocol enums of definition ids |
| `maxStack` | `itemMaxStack` 1–99; equippable forced 1 | Unchanged |
| `tradeable` | Optional; default **true** unless `false`; production required true | Unchanged |
| `destroyable` | Optional; default **true** unless `false` | Distinct from droppable |
| `droppable` | Present; production required true | Player drop still later |
| `rarity` | `rarity.poor` … `rarity.legendary`; production required | Uncommon+ party Need/Greed is live |
| `uniquePolicy` | `none` `character` `equipped` | Not soulbind. Keep until a later phase names removal |
| `equipSlot` / `equipmentSlotTags` | Present | Unchanged tags; equipped container changes |
| `classRequirements` / `levelRequirement` | Present | Equip gates only; Need is unrestricted |
| `attackBonus` / `statModifiers` | Present | Canonical stat pipeline only |
| `sellValue` | Present | Merchant buy-only target still uses catalog prices; sell is a live conflict |

No soulbind, bind-on-pickup, bind-on-equip, account-bind, or character-bind fields exist.

## Live source items

| Id | Category | maxStack | tradeable | destroyable | Notes |
| --- | --- | --- | --- | --- | --- |
| `item.training_sword` | weapon | 1 | true | true | Starter (`STARTER_ITEM_ID`); main_hand +2 |
| `item.iron_sword` | weapon | 1 | true | true | Quest reward; main_hand +5 |
| `item.slime_gel` | quest | 20 | **true** | **false** | Prompt 18 collect item; droppable true |
| `item.proof_token` | quest | 20 | **true** | **false** | Proof journey; droppable true |
| `item.cert_mail` | armor | 1 | true | true | chest |
| `item.test_potion` | consumable | 10 | true | true | Test |
| `item.test_pebble` | miscellaneous | 50 | true | true | Test; stack 50 ≠ 99 |
| `item.test_cloth` | material | 20 | true | true | Test |
| `item.test_leather_cap` | armor | 1 | true | true | head |
| `item.test_relic_blade` | weapon | 1 | true | true | `uniquePolicy: character`, level 5 |
| `item.test_vanguard_mail` | armor | 1 | true | true | class lock `test.class.vanguard` |

## Equipment slots

Schema: `content/schemas/equipment_slot.json`. Runtime: `equipment.ts` `TEMPORARY_EQUIPMENT_SLOT_TAGS`.

Live tags: `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`. Classes list `allowedEquipmentTags`.

## Loot tables

Schema: `content/schemas/loot_table.json`.

Required: `ownershipPolicy`, `entries[]` with `itemDefinitionId`, min/max quantity, `chance`, optional `weight` / `groupId` / `guaranteed` / `kind` (`item` | `gold`). Gold entries roll a quantity into corpse gold, not an item instance. Existing production tables are unchanged (content hash unchanged).

`loot.green_slime`: `ground_free`, guaranteed 1× `item.slime_gel`. Mob deaths generate corpse loot once; slime also keeps a 30 s sparkle dual-path.

Normalized runtime policy (`normalizedLootPolicy`):

| Catalog | Runtime |
| --- | --- |
| `ground_free`, `killer`, unknown | `ground` (public `MatchLoot`) |
| `personal`, `party_split` | `personal` (duplicate grant to each eligible) |
| `server_assigned` | `server_assigned` (one LCG assignee) |

## Vendor catalogs

Schema: `content/schemas/vendor.json`. `currencyId` must be `gold`. Stock: `itemId` + `buyPrice` + optional class/level locks. `sellMultiplier` required. Stock is infinite and static. No buyback, scarcity, or restock documents.

## Player bag capacity (content)

`content/source/player.base.json` `inventoryCapacity`: **30**. `pickupRange`: **40**. Group credit default loot policy: **personal** (XP/party tables; slime table stays ground_free).

## Quest item consumption

Quest documents `consume[]` / `rewards.items[]` reference item ids. `acquire_item` / `collect_item` recount inventory possession (`syncAcquireObjectives`). Turn-in removes consumed stacks then grants rewards through `quest_reward.ts`.

## Future foraging grant

No gathering node content or opcode exists. Later grant sources must call the same `planCapacity` / `runItemTransaction` boundary with a new `sourceType` (for example `forage`) and must not add a second inventory writer. Acquisition intent is ready.
