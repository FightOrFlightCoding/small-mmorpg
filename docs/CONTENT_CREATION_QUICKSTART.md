# Content creation quickstart

Add original classes, items, enemies, quests, and vendors as **data**. Do not add opcodes, storage records, or runtime `switch` cases on new IDs.

Full CLI, validation, and worked examples: [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md). Schemas: `content/schemas/`. Source of truth: `content/source/`.

## Loop

```powershell
powershell -File scripts/content.ps1 new <type> --id <stable.id>
# edit the JSON (and client visual/dialogue maps if the player must see it)
powershell -File scripts/content.ps1 validate
powershell -File scripts/content-build.ps1
powershell -File scripts/dev-up.ps1
```

Then play or run `scripts/test-server.ps1`. Commit source JSON together with generated `server/src/generated/content.ts` and `client/content/bundle.json`. Update `tools/foundation-audit/expected.json` `contentHash` (and `productionContentFiles` when adding a source file).

Production generate **omits** `developmentOnly` documents. Do not mark shipping story content `developmentOnly`.

## Minimum set for a new kill quest

Mirror the Prompt 35 cert pack (no runtime edits):

1. Class or class variation (optional) — `test.class.warden`
2. Ability using an existing effect type (`direct_damage`, heal, DoT, …)
3. Item (weapon/armor)
4. Enemy + loot table + spawn
5. NPC with `quest_offer` / `quest_turn_in` (and optional `vendor`)
6. Quest with `kill_enemy` (or another existing objective type)
7. Place the NPC and spawn on a zone document
8. `client/content/visual_map.json`, `asset_manifest.json`, and a Dialogue Manager file if the NPC speaks

The cert quest `quest.cert_scout` completes through existing match opcodes. If a design needs a new opcode or storage collection, it is **not** content-only.

## Assets without gameplay edits

Swap presentation in `client/content/asset_manifest.json` (and `visual_map.json` when adding a new visual ID). Gameplay scripts must keep using stable content IDs, never Kenney paths.

| Slot | Manifest key |
| --- | --- |
| Character / enemy / NPC sprite | `sets.visual_set.<contentId>.spriteVisualId` |
| Item / ability icon | `icons.item` / `icons.ability` |
| Zone floor | `tilesets.<zoneId>` |
| SFX | `audio.<id>.stream` as a `res://` path |

## Do not

- Hand-edit generated catalogs
- Put secrets in content JSON
- Reference `test.zone.systems_lab` from production definitions
- Special-case `npc.elder`, `enemy.green_slime`, or `quest.slime_problem` in new runtime code
