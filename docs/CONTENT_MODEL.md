# Content model

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [DEPENDENCIES.md](DEPENDENCIES.md).

## Locations

| Path | Contents |
| --- | --- |
| `content/schemas/` | JSON Schema documents that authored files must satisfy |
| `content/source/` | Source documents, one logical entity per file, named by stable ID |
| `tools/content-build/` | Deterministic validator and generator (Node 20, TypeScript 5.8.3, Ajv 8.17.1) |
| `server/src/generated/content.ts` | Generated TypeScript catalog imported by the Nakama runtime |
| `client/content/bundle.json` | Generated Godot-readable JSON catalog |

Authors edit `content/source/` only. Do not hand-edit generated output. After source changes, run `powershell -File scripts/content-build.ps1` and commit the regenerated artifacts.

The Nakama JS runtime must not read `content/source/` or any other JSON from disk. It imports `server/src/generated/content.ts`, which Rollup embeds in `server/build/index.js`.

## Stable IDs

IDs match `^[a-z]+(\.[a-z0-9_]+)+$` (two or more segments). The source filename stem must equal the document `id` (for example `item.training_sword.json`, `test.class.vanguard.json`).

- Network, storage, and quest logic use IDs only.
- Visual assets are referenced by IDs such as `visual.zone_starter`, never by `res://` paths or machine-absolute paths.
- Godot `res://` paths exist only in the client-side map `client/content/visual_map.json`, keyed by those visual IDs. That file is not hashed into `contentHash`.

## Kinds

| Kind | Source file | Role |
| --- | --- | --- |
| `player` | `player.base.json` | Base max health, attack, movement speed, attack range, attack cooldown, interaction range, pickup range, `inventoryCapacity`, optional `basicAbilityId`, optional `groupCredit` (range, death window, XP formula, default loot policy) |
| `npc` | `npc.elder.json` plus test vendor/inn/herald/cave NPCs | One NPC type. Services: `dialogue`, `quest_offer`, `quest_turn_in`, `vendor`, `inn`, `healer`, `cave_entrance`, `cave_exit`. Per-NPC pose, `interactionRange`, `dialogueId`. No elder/merchant/innkeeper classes. |
| `enemy` | `enemy.green_slime.json`, `test.enemy.melee.json`, `test.enemy.ranged.json`, `test.enemy.caster.json`, `test.enemy.cave_boss.json` | Combat stats, loadout, `aiProfileId`, `lootTableId`, visual/collision ids, tags; slime remains the Prompt 18 wildlife enemy |
| `ai_profile` | `test.ai.melee.json`, `test.ai.ranged.json`, `test.ai.caster.json`, `test.ai.boss.json` | Server state-machine style, threat weights, preferred/kite range, leash reset flags |
| `loot_table` | `loot.green_slime.json`, `loot.empty.json`, plus test tables | Guaranteed, independent chance, and weighted-group entries; `ownershipPolicy` `ground_free` / `personal` / `server_assigned` (`party_split` maps to personal); empty tables allowed |
| `spawn` | `spawn.starter.green_slime.json` plus manual test/boss spawns and `spawn.cave.boss.json` | Zone placement, count, respawn delay, `always`/`manual` activation, group id |
| `item` | `item.training_sword.json`, `item.slime_gel.json`, `item.iron_sword.json`, plus ordinary test items | Categories `weapon`/`armor`/`consumable`/`quest`/`material`/`miscellaneous`; stack, trade/destroy, unique policy, slot tags, class/level, stat modifiers, sell value, icon/world asset ids |
| `equipment_slot` | `slot.main_hand.json` and the other temporary tags | Content-defined equipment tags (`main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`). Classes list allowed tags; not every class uses every slot. |
| `quest` | `quest.slime_problem.json` plus `quest.test.*` examples | Generic engine: categories, optional stages, prerequisites, reusable objectives (`talk_to_npc`, `kill_enemy`, `collect_item`/`acquire_item`, `enter_location`, `defeat_boss`, `return_to_npc`). Kill objectives may set `partyCreditPolicy`. Slime quest remains the Prompt 18 public quest. Test quests are not final story. |
| `vendor` | `vendor.test_general.json` | Static stock, server prices, sell multiplier. Infinite quantity. |
| `zone` | `zone.starter.json`, `zone.cave.json` | World size, tile size, spawn points, walkable bounds, collision AABBs, visual ID. `zone.starter` is the public-world template; `zone.cave` is the party-cave template. |
| `class` | `test.class.vanguard.json`, `test.class.arcanist.json` | Temporary Foundation test classes: `progressionId`, starting equipment/abilities, allowed equipment tags, class tags, visual asset set. Exactly one class may set `legacyMigrationDefault`. Class id is immutable after character create. Numeric bases live on `class_progression`, not on the class document. |
| `ability` | `test.ability.basic_melee.json`, `test.ability.ranged_bolt.json`, `test.ability.small_heal.json`, `test.ability.power_buff.json`, `test.ability.damage_over_time.json` | Content-defined abilities: target mode, relation filter, range, cast/channel/cooldowns, resource costs, interrupt flags, structured effects. Certification examples, not final skills. Adding another ordinary ability that uses existing effect handlers is content-only. |
| `attribute` | `test.attribute.might.json`, `test.attribute.vitality.json`, `test.attribute.focus.json` | Temporary named attributes. Runtime looks up by stable ID, never a fixed enum of these examples. |
| `resource` | `test.resource.health.json`, `test.resource.mana.json` | Temporary resources with roles (`health`, `mana`). |
| `derived_stat` | `test.stat.attack.json`, `test.stat.max_health.json`, `test.stat.max_mana.json` | Structured formula components (layers). No script strings. Roles `attack`, `max_health`, `max_mana`. |
| `level_curve` | `test.curve.standard.json` | Max level, XP per level, attribute/skill points per level, optional automatic unlocks. Shared by test classes. |
| `class_progression` | `test.progression.vanguard.json`, `test.progression.arcanist.json` | Per-class starting attributes/resources/derived values, growth, allowed attributes, points at create. |

Equipment slots are content-defined (`kind` `equipment_slot`). Equippable items list `equipmentSlotTags` (and may keep `equipSlot` as an alias). Unequippable items omit slot tags. A new ordinary item is introduced through content without protocol changes.

No RPG database plugin is used. Client `.dialogue` files are presentation keyed by server `dialogueId`; they are not hashed into `contentHash`.

## Generation

`tools/content-build` loads `content/package.manifest.json` (package id, package version, minimum protocol version, per-kind definition schema versions). It then:

1. Validates every source file against its kind schema, including optional `schemaVersion` and `developmentOnly`.
2. Applies semantic checks: duplicate IDs, missing references, invalid ranges, unknown equipment slots, impossible stacks, duplicate quest rewards.
3. Excludes `developmentOnly` definitions from the production payload.
4. Canonicalizes the gameplay payload (sorted object keys). Envelope fields, `developmentOnly` flags, per-definition `schemaVersion`, and `buildTimestamp` are **not** hashed.
5. Hashes SHA-256 of the compact canonical gameplay JSON (Node `crypto` in the **tool only**).
6. Wraps the payload with `packageId`, `packageVersion`, `schemaVersion` (package envelope, currently `1`), `contentHash`, `minimumProtocolVersion`, and `developmentOnly` (excluded ids).
7. Writes `server/src/generated/content.ts` and `client/content/bundle.json` with the same hash. `buildTimestamp` is printed by the CLI only so generated artifacts stay deterministic.

`npm run diff` / `npm run trace -- --id item.slime_gel` in `tools/content-build` report content changes and references. Future kinds are added by a schema file plus a `kinds` entry in the package manifest.

The Godot `ContentRegistry` loads `res://content/bundle.json` at boot and rejects any bundle that is missing, malformed, or not package `schemaVersion` 1. Extra envelope fields are ignored. A fatal content error must not continue into login, character, or world.

Unchanged source produces byte-identical outputs. Generated files contain no machine-specific absolute paths.

## Persistent player storage

Canonical character data lives in Nakama storage, not in Godot `user://`.

An account may have up to **three live** characters. The roster is `player`/`roster`. Each character object is keyed `character_<compactCharacterId>` after Prompt 21 (legacy `character` remains the Prompt 18 fallback). Quests, inventory, equipment, and progression follow the same namespacing. Gold is still the account wallet. RPC `character_bootstrap` remains a compatibility wrapper: it migrates a Prompt 18 character into slot 1 if needed, then returns the first live character (or creates one). New UI uses `character_list`, `character_create`, `character_select`, `character_soft_delete`, and `character_restore`. Match join requires a server-issued `selectionTicket`. Base stats in the bootstrap RPC response still come from content `player.base`. Live combat and HUD derived stats come from the server stat pipeline for the character's class. Class starting equipment is applied only to newly created characters. Missing progression blobs initialize at level 1 on join. Prompt 18 blobs without `schemaVersion` migrate on load; see [MIGRATIONS.md](MIGRATIONS.md).

Quest progress is a second object (`key` `quests`), loaded when the player joins `zone.starter` and written when `QUEST_ACCEPT` first succeeds, when pickup advances an objective, and when turn-in completes the quest. Inventory is a third object (`key` `inventory`), loaded or initialized on join and written when a pickup, destroy, split, or move first succeeds or when turn-in consumes and grants items. Equipment is a fourth object (`key` `equipment`), loaded on join and written when equip or unequip first succeeds. Progression is a fifth object (`key` `progression`), loaded or initialized on join and written on trusted XP grants, attribute allocation, and request-id pruning. Gold is the Nakama wallet currency `gold`, loaded on join and mutated only through the project-owned currency helper and transaction boundary (`nk.multiUpdate` when storage and wallet must change together). `player`/`wallet_ref` is a versioned pointer at that wallet; it does not store the gold amount. The Godot client must not write any of those objects.

## Reproduction

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
```

Valid source must succeed. Invalid fixtures in `tools/content-build/tests` must fail for `duplicate_id`, `missing_reference`, `invalid_range`, `unknown_equipment_slot`, and `duplicate_quest_reward`. `scripts/test-content` and `scripts/test-all` also assert `client/content/bundle.json` and `server/src/generated/content.ts` share the same 64-hex `contentHash`. Regenerating twice from unchanged source must stay byte-identical.
