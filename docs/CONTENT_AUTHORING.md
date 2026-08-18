# Content authoring guide

Project-owned workflow for adding and verifying Foundation content. There is no external RPG database. JSON under `content/source/` is canonical. Visual and dialogue files under `client/content/` are presentation only and are not hashed into `contentHash`.

Related: [CONTENT_MODEL.md](CONTENT_MODEL.md), [ARCHITECTURE.md](ARCHITECTURE.md).

## CLI

Use the wrappers (they typecheck and run `tools/content-build`):

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/content.ps1 build
powershell -File scripts/content.ps1 diff
powershell -File scripts/content.ps1 references --id item.slime_gel
powershell -File scripts/content.ps1 unused
powershell -File scripts/content.ps1 new item --id item.example_token
powershell -File scripts/content.ps1 copy item.training_sword --to item.example_copy
powershell -File scripts/content.ps1 migrate
powershell -File scripts/content.ps1 package
powershell -File scripts/content.ps1 csv-export --type loot_entries
powershell -File scripts/content.ps1 csv-import --type loot_entries --from loot.csv
```

Equivalent npm scripts live in `tools/content-build`. `content build` and `content generate` write `server/src/generated/content.ts` and `client/content/bundle.json`. Production builds **exclude** `developmentOnly` definitions unless you pass `--include-dev`.

`content new <type>` writes schema-valid starter templates. It does not invent final names, balance, or prose. Types: `class`, `attribute`, `resource`, `level_curve`, `ability`, `effect`, `item`, `equipment_slot`, `enemy`, `ai_profile`, `spawn`, `loot_table`, `npc`, `dialogue_reference`, `quest`, `vendor`, `inn_service`, `zone`, `cave_template`, `asset_manifest_entry`.

CSV import/export is optional and only for tabular kinds: `level_curve`, `vendor_stock`, `enemy_stats`, `loot_entries`. Round-trip is deterministic. JSON remains canonical.

## Validation

`content validate` / `content build` detect:

- Duplicate IDs
- Missing references
- Cyclic invalid prerequisites
- Impossible quest stages
- Missing quest NPCs
- Missing enemy abilities
- Invalid loot entries
- Invalid equipment slots
- Invalid class references
- Invalid level curves
- Missing assets (visual/icon/dialogue ids vs `visual_map.json` / `asset_manifest.json` / `dialogue_map.json`)
- Development-content leakage into production definitions
- Orphaned NPC, quest, and enemy definitions
- Unsupported schema versions

## Reference graph

`content references --id <id>` (alias `trace`) reports where a definition is used. Examples:

- Which quests reference this enemy?
- Which classes start with this ability?
- Which loot tables contain this item?
- Which zones spawn this NPC?
- `content unused` lists unused asset IDs and orphaned definitions.

## After every source change

1. Edit `content/source/` (and client visual/dialogue maps when presentation is required).
2. `powershell -File scripts/content.ps1 validate`
3. `powershell -File scripts/content-build.ps1` (production payload; omit `--include-dev`).
4. Commit generated `server/src/generated/content.ts` and `client/content/bundle.json` with the source.
5. Update `tools/foundation-audit/expected.json` `contentHash` when the gameplay payload changes.

Do not hand-edit generated catalogs.

## Systems lab

`test.zone.systems_lab` is `developmentOnly`. Production generate omits it. Load it with `content build --include-dev`, then enter via an authorized `gm_command` `open_cave` (default template is the lab when that zone exists in the catalog). The lab is a manual exercise area for classes, level-up, attributes, skill unlock, abilities, status effects, equipment, melee/ranged/caster/boss enemies, quest objective types, vendor, inn, party, cave entry, and trade. It does **not** replace automated tests.

## Adding a class

```powershell
powershell -File scripts/content.ps1 new class --id test.class.example
```

Fill `progressionId`, `startingEquipment`, `startingAbilities`, and `allowedEquipmentTags` from existing catalog IDs. Example (existing test class, not final fantasy writing):

```json
{
  "id": "test.class.vanguard",
  "kind": "class",
  "displayName": "Test Vanguard",
  "visualAssetSetId": "visual.class_vanguard",
  "legacyMigrationDefault": true,
  "progressionId": "test.progression.vanguard",
  "startingEquipment": [{ "itemId": "item.training_sword", "quantity": 1 }],
  "startingAbilities": ["test.ability.basic_melee"],
  "allowedEquipmentTags": ["main_hand", "off_hand", "head", "chest", "legs", "feet"],
  "tags": ["vanguard", "melee"]
}
```

Exactly one class may set `legacyMigrationDefault`. Class id is immutable after character create. Numeric bases live on `class_progression`, not here. Add a matching visual set in `client/content/asset_manifest.json`.

## Adding an ability

```powershell
powershell -File scripts/content.ps1 new ability --id test.ability.example
```

Point effects at existing handlers (`direct_damage`, `heal`, `timed_stat_modifier`, `damage_over_time`, …). Do not invent new runtime effect types in a content-only change. Example:

```json
{
  "id": "test.ability.small_heal",
  "kind": "ability",
  "displayName": "Small Heal",
  "resourceCosts": [{ "resourceId": "test.resource.mana", "amount": 8 }],
  "targetMode": "self",
  "effects": [{ "type": "heal", "magnitude": 12 }]
}
```

(Use the real file in `content/source/test.ability.small_heal.json` as the complete schema-valid document.) Unlock via class starting abilities, level-curve automatic unlocks, or quest `abilityUnlockIds`.

## Adding an item

```powershell
powershell -File scripts/content.ps1 new item --id item.example_token
```

Keep `visualId` / `iconAssetId` mapped in `visual_map.json` and `asset_manifest.json`. Example from the content-only proof:

```json
{
  "id": "item.proof_token",
  "kind": "item",
  "displayName": "Proof Token",
  "displayNameKey": "item.proof_token.name",
  "descriptionKey": "item.proof_token.desc",
  "visualId": "visual.item_proof_token",
  "iconAssetId": "visual.item_proof_token",
  "worldAssetId": "visual.item_proof_token",
  "category": "quest",
  "maxStack": 20,
  "tradeable": false,
  "destroyable": false,
  "uniquePolicy": "none",
  "classRequirements": [],
  "levelRequirement": 0,
  "attackBonus": 0,
  "statModifiers": [],
  "sellValue": 0
}
```

## Adding an enemy

```powershell
powershell -File scripts/content.ps1 new enemy --id enemy.example_critter
```

`abilityLoadout` entries must exist (empty loadout is legal). `aiProfileId` and `lootTableId` must exist. Place the enemy with a `spawn` document and a zone `enemies` row if it should appear in a zone. Proof wildlife example: `content/source/enemy.proof_critter.json` (tiny aggro, far corner of `zone.starter`).

## Adding a loot table

```powershell
powershell -File scripts/content.ps1 new loot_table --id loot.example
```

```json
{
  "id": "loot.proof_critter",
  "kind": "loot_table",
  "displayName": "Proof Critter",
  "ownershipPolicy": "ground_free",
  "entries": [
    {
      "itemDefinitionId": "item.proof_token",
      "minimumQuantity": 1,
      "maximumQuantity": 1,
      "chance": 1,
      "guaranteed": true
    }
  ]
}
```

Set the enemy `lootTableId` to this id. Optional: `powershell -File scripts/content.ps1 csv-export --type loot_entries`.

## Adding an NPC

```powershell
powershell -File scripts/content.ps1 new npc --id npc.example
```

Services are data (`dialogue`, `quest_offer`, `quest_turn_in`, `vendor`, `inn`, `healer`, `cave_entrance`, `cave_exit`). Add the NPC to the zone `npcs` list and a client `.dialogue` file keyed from `dialogue_map.json`. Proof giver:

```json
{
  "id": "npc.proof_giver",
  "kind": "npc",
  "displayName": "Proof Giver",
  "zoneId": "zone.starter",
  "position": { "x": 600, "y": 640 },
  "interactionRange": 48,
  "dialogueId": "dialogue.npc.proof_giver",
  "services": [
    { "type": "dialogue" },
    { "type": "quest_offer", "questIds": ["quest.proof_errand"] },
    { "type": "quest_turn_in", "questIds": ["quest.proof_errand"] }
  ]
}
```

## Adding a quest

```powershell
powershell -File scripts/content.ps1 new quest --id quest.example
```

Objectives: `talk_to_npc`, `kill_enemy`, `collect_item` / `acquire_item`, `enter_location`, `defeat_boss`, `return_to_npc`. Accept/turn-in NPC ids must exist. Proof errand (content-only):

```json
{
  "id": "quest.proof_errand",
  "kind": "quest",
  "displayName": "Proof Errand",
  "category": "side",
  "acceptNpcId": "npc.proof_giver",
  "turnInNpcId": "npc.proof_giver",
  "objectives": [{ "type": "acquire_item", "itemId": "item.proof_token", "quantity": 1 }],
  "consume": [{ "itemId": "item.proof_token", "quantity": 1 }],
  "rewards": { "gold": 8, "xp": 5, "items": [] },
  "completeOnce": true
}
```

## Adding a vendor

```powershell
powershell -File scripts/content.ps1 new vendor --id vendor.example
```

Attach `{ "type": "vendor", "vendorId": "vendor.example" }` on an NPC. Stock ids must exist. Lab example (development-only): `content/source/vendor.lab_general.json`. Production example: `content/source/vendor.test_general.json`. Optional CSV: `--type vendor_stock`.

## Adding a cave boss

Reuse the existing boss pipeline; do not add match opcodes. Typical set:

1. Enemy with `tags` including `boss` and optional `phases` (`content/source/test.enemy.cave_boss.json`).
2. Loot table (`loot.test_boss.json`).
3. Spawn with `activationPolicy` `always` or `manual` on `zone.cave` (`spawn.cave.boss.json`).
4. Zone `enemies` row on `zone.cave`.
5. Optional quest `defeat_boss` objective.

Production cave template remains `zone.cave`. The systems lab also places `test.enemy.cave_boss` for `--include-dev` catalogs.

## Content-only proof (Prompt 32)

One temporary production chain with **no** protocol, persistence, or runtime feature changes:

| File | Role |
| --- | --- |
| `content/source/item.proof_token.json` | Quest item |
| `content/source/enemy.proof_critter.json` | Far-corner wildlife (1184,700, aggro 40) |
| `content/source/loot.proof_critter.json` | Guaranteed token |
| `content/source/spawn.starter.proof_critter.json` | Always-on spawn group `group.starter_proof` |
| `content/source/npc.proof_giver.json` | Offer/turn-in at 600,640 |
| `content/source/quest.proof_errand.json` | Acquire token, consume, gold 8 / XP 5 |
| `content/source/zone.starter.json` | Adds the NPC and enemy rows (elder stays 160,320; slime stays 960,400) |
| `client/content/dialogue/npc.proof_giver.dialogue` | Presentation |
| `client/content/dialogue_map.json` | `dialogue.npc.proof_giver` |
| `client/content/visual_map.json` | Fallback colors for proof visual ids |
| `client/content/asset_manifest.json` | Visual set + item icon |

Regenerate catalogs after these files. `test.zone.systems_lab` and `npc.lab_*` / `quest.lab_tour` / `spawn.lab.*` / `vendor.lab_general` are development-only and must not appear in the production bundle.
