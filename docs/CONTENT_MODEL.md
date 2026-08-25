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

Authors edit `content/source/` only. Do not hand-edit generated output. After source changes, run `powershell -File scripts/content.ps1 validate` then `powershell -File scripts/content-build.ps1` and commit the regenerated artifacts. Full command list and examples: [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md).

The Nakama JS runtime must not read `content/source/` or any other JSON from disk. It imports `server/src/generated/content.ts`, which Rollup embeds in `server/build/index.js`.

## Stable IDs

IDs match `^[a-z]+(\.[a-z0-9_]+)+$` (two or more segments). The source filename stem must equal the document `id` (for example `item.training_sword.json`, `test.class.vanguard.json`).

- Network, storage, and quest logic use IDs only.
- Visual assets are referenced by IDs such as `visual.zone_starter`, never by `res://` paths or machine-absolute paths.
- Godot `res://` paths exist only in the client-side map `client/content/visual_map.json`, keyed by those visual IDs. Character/enemy/NPC visual sets, icons, tilesets, projectiles, impacts, and audio ids live in `client/content/asset_manifest.json`. Neither file is hashed into `contentHash`.

## Kinds

| Kind | Source file | Role |
| --- | --- | --- |
| `player` | `player.base.json` | Base max health, attack, movement speed, attack range, attack cooldown, interaction range, pickup range, `inventoryCapacity`, optional `basicAbilityId`, optional `groupCredit` (range, death window, XP formula, default loot policy) |
| `npc` | `npc.elder.json` plus test vendor/inn/herald/cave NPCs, `npc.proof_giver.json`, and development-only `npc.lab_*` | One NPC type. Services: `dialogue`, `quest_offer`, `quest_turn_in`, `vendor`, `inn`, `healer`, `cave_entrance`, `cave_exit`. Per-NPC pose, `interactionRange`, `dialogueId`. No elder/merchant/innkeeper classes. |
| `enemy` | `enemy.green_slime.json`, `enemy.proof_critter.json`, `test.enemy.melee.json`, `test.enemy.ranged.json`, `test.enemy.caster.json`, `test.enemy.cave_boss.json` | Combat stats, loadout, `aiProfileId`, `lootTableId`, visual/collision ids, tags; slime remains the Prompt 18 wildlife enemy; proof critter is a content-only far-corner spawn |
| `ai_profile` | `test.ai.melee.json`, `test.ai.ranged.json`, `test.ai.caster.json`, `test.ai.boss.json` | Server state-machine style, threat weights, preferred/kite range, leash reset flags |
| `loot_table` | `loot.green_slime.json`, `loot.empty.json`, plus test tables | Guaranteed, independent chance, and weighted-group entries; `ownershipPolicy` `ground_free` / `personal` / `server_assigned` (`party_split` maps to personal); empty tables allowed |
| `spawn` | `spawn.starter.green_slime.json` plus manual test/boss spawns and `spawn.cave.boss.json` | Zone placement, count, respawn delay, `always`/`manual` activation, group id |
| `item` | `item.training_sword.json`, `item.slime_gel.json`, `item.iron_sword.json`, plus ordinary test items | Categories `weapon`/`armor`/`consumable`/`quest`/`material`/`miscellaneous`; stack, trade/destroy, unique policy, slot tags, class/level, stat modifiers, sell value, icon/world asset ids |
| `equipment_slot` | `slot.main_hand.json` and the other temporary tags | Content-defined equipment tags (`main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`). Classes list allowed tags; not every class uses every slot. |
| `quest` | `quest.slime_problem.json`, `quest.proof_errand.json`, plus `quest.test.*` examples | Generic engine: categories, optional stages, prerequisites, reusable objectives (`talk_to_npc`, `kill_enemy`, `collect_item`/`acquire_item`, `enter_location`, `defeat_boss`, `return_to_npc`). Kill objectives may set `partyCreditPolicy`. Slime quest remains the Prompt 18 public quest. Proof errand is a content-only chain. Test quests are not final story. |
| `vendor` | `vendor.test_general.json`, development-only `vendor.lab_general.json` | Static stock, server prices, sell multiplier. Infinite quantity. |
| `zone` | `zone.starter.json`, `zone.cave.json`, development-only `test.zone.systems_lab.json` | World size, tile size, spawn points, walkable bounds, collision AABBs, visual ID. `zone.starter` is the public-world template; `zone.cave` is the party-cave template. Systems lab is omitted from production generate unless `--include-dev`. |
| `class` | `class.warrior.json`, `class.marksman.json`, `class.mage.json`, `class.mystic.json` (`rosterSelectable: false`), plus `test.class.vanguard.json` / `arcanist` / `warden` | Production Character Select classes with presentation keys, placeholder visuals, provisional live stats/loadouts, plus canonical `baseStats` / growth / trees. Test classes remain for cert/e2e. Exactly one class may set `legacyMigrationDefault` (currently `class.warrior`). Class id is immutable after character create. Live combat numbers still come from `class_progression`. |
| `ability` | `test.ability.basic_melee.json` and other live test skills, plus canonical `ability.<class>.*` (`runtimeEnabled: false`) | Content-defined abilities: target mode, relation filter, range, cast/channel/cooldowns, resource costs, interrupt flags, structured effects. Canonical combat rows are data-only until a later PROG phase. Adding another ordinary ability that uses existing effect handlers is content-only. |
| `attribute` | `test.attribute.might.json`, `test.attribute.vitality.json`, `test.attribute.focus.json` | Temporary named attributes. Runtime looks up by stable ID, never a fixed enum of these examples. |
| `resource` | `test.resource.health.json`, `test.resource.mana.json`, `resource.none.json` | Temporary resources with roles (`health`, `mana`, `generic`). Canonical physical classes point `resourceType` at `resource.none`. |
| `derived_stat` | `test.stat.attack.json`, `test.stat.max_health.json`, `test.stat.max_mana.json` | Structured formula components (layers). No script strings. Roles `attack`, `max_health`, `max_mana`. |
| `level_curve` | `test.curve.standard.json` (live cap 5), `curve.vibecode.l10.json` (canonical cap 10, unused) | Max level, XP per level, attribute/skill points per level, optional automatic unlocks. |
| `class_progression` | `progression.warrior.json`, `progression.marksman.json`, `progression.mage.json`, `progression.mystic.json`, plus `test.progression.*` | Per-class starting attributes/resources/derived values, growth, allowed attributes, points at create. Production numbers are provisional. |
| `stat_definition` | `stat.strength.json` … `stat.endurance.json` | Canonical eight stats and per-point effects. Not evaluated by live combat yet. |
| `branch_definition` | `branch.warrior.bulwark.json` and the other seven locked branches | Class specialization: signature, capstone, tree, recommended builds. |
| `progression_timeline` | `timeline.vibecode.l10.json` | Level-gated grants (auto-attack, basic, class/branch points, capstone). Unused at runtime. |
| `auto_attack_definition` | `ability.<class>.auto_attack.json` | Per-class auto-attack data (`runtimeEnabled: false`). Same `ability.` ID prefix, different kind from `ability`. |
| `effect_definition` | `effect.<ability>.<effect>.json` | Structured effect bodies referenced by abilities. No executable scripts. |
| `talent_tree` / `talent_node` | `tree.*.json`, `talent.*.json` | Class and branch trees: tier, rank, cost, prereqs, rank replacement, modifiers, grants. Protocol does not special-case node names. |
| `reference_build` | `build.*.json` | Sixteen recommended stat/node pairings. |
| `enemy_scaling_profile` | `enemy.scaling.standard.json`, `enemy.scaling.elite.json` | §13 HP/damage/XP baselines. Unused by live enemies. |
| `xp_reward` | `xp.reward.kill.json` | Kill XP formula. Live enemies still use per-enemy `xpReward`. |
| `equipment_modifier_category` | `mod.stat.*.json` | Canonical stat modifier channels for later equipment work. |

Equipment slots are content-defined (`kind` `equipment_slot`). Equippable items list `equipmentSlotTags` (and may keep `equipSlot` as an alias). Unequippable items omit slot tags. A new ordinary item is introduced through content without protocol changes.

No RPG database plugin is used. Client `.dialogue` files are presentation keyed by server `dialogueId`; they are not hashed into `contentHash`.

## Generation

`tools/content-build` loads `content/package.manifest.json` (package id, package version, minimum protocol version, per-kind definition schema versions). It then:

1. Validates every source file against its kind schema, including optional `schemaVersion` and `developmentOnly`.
2. Applies semantic checks: duplicate IDs, missing references, cyclic prerequisites, impossible quest stages, missing quest NPCs, missing enemy abilities, invalid loot/slots/classes/curves, missing assets, development-content leakage, orphaned NPC/quest/enemy definitions, unsupported schema versions, and PROG-02 canonical progression invariants.
3. Excludes `developmentOnly` definitions from the production payload (`test.zone.systems_lab` and lab NPCs/quests/spawns/vendor). Pass `--include-dev` to include them.
4. Canonicalizes the gameplay payload (sorted object keys). Envelope fields, `developmentOnly` flags, per-definition `schemaVersion`, and `buildTimestamp` are **not** hashed.
5. Hashes SHA-256 of the compact canonical gameplay JSON (Node `crypto` in the **tool only**).
6. Wraps the payload with `packageId`, `packageVersion`, `schemaVersion` (package envelope, currently `1`), `contentHash`, `minimumProtocolVersion`, and `developmentOnly` (excluded ids).
7. Writes `server/src/generated/content.ts` and `client/content/bundle.json` with the same hash. `buildTimestamp` is printed by the CLI only so generated artifacts stay deterministic. PROG-02 also writes a human-readable `content/reports/canonical-progression.md` and optional Godot `.tres` conveniences under `client/content/generated/` (gitignored; not source).

`scripts/content.ps1` commands: `validate`, `build`, `diff`, `references` / `trace`, `unused`, `new <type>`, `copy <id>`, `migrate`, `package`, `csv-export` / `csv-import` for `level_curve`, `vendor_stock`, `enemy_stats`, `loot_entries`. No second content stack and no RPG database plugin. Future kinds are added by a schema file plus a `kinds` entry in the package manifest.

The Godot `ContentRegistry` loads `res://content/bundle.json` at boot and rejects any bundle that is missing, malformed, or not package `schemaVersion` 1. Extra envelope fields are ignored. A fatal content error must not continue into login, character, or world.

Unchanged source produces byte-identical outputs. Generated files contain no machine-specific absolute paths.

## Persistent player storage

Canonical character data lives in Nakama storage, not in Godot `user://`.

An account may have up to **five live** characters. The roster is `player`/`roster`. Each character object is keyed `character_<compactCharacterId>` after Prompt 21 (legacy `character` remains the Prompt 18 fallback). Quests, inventory, equipment, and progression follow the same namespacing. Gold is still the account wallet. RPC `character_bootstrap` remains a compatibility wrapper: it migrates a Prompt 18 character into slot 1 if needed, then returns the first live character (or creates one). New UI uses `character_list`, `character_create`, `character_select`, `character_delete_request`, `character_restore`, `character_name_available`, and `character_purge`. Match join requires a server-issued `selectionTicket`. Character Select lists safe summaries only. Base stats in the bootstrap RPC response still come from content `player.base`. Live combat and HUD derived stats come from the server stat pipeline for the character's class. Class starting equipment is applied only to newly created characters. Missing progression blobs initialize at level 1 on join. Prompt 18 blobs without a class id receive `class.warrior` without a second starter grant. Prompt 18 blobs without a `schemaVersion` migrate on load; see [MIGRATIONS.md](MIGRATIONS.md).

Quest progress is a second object (`key` `quests`), loaded when the player joins `zone.starter` and written when `QUEST_ACCEPT` first succeeds, when pickup advances an objective, and when turn-in completes the quest. Inventory is a third object (`key` `inventory`), loaded or initialized on join and written when a pickup, destroy, split, or move first succeeds or when turn-in consumes and grants items. Equipment is a fourth object (`key` `equipment`), loaded on join and written when equip or unequip first succeeds. Progression is a fifth object (`key` `progression`), loaded or initialized on join and written on trusted XP grants, attribute allocation, and request-id pruning. Gold is the Nakama wallet currency `gold`, loaded on join and mutated only through the project-owned currency helper and transaction boundary (`nk.multiUpdate` when storage and wallet must change together). `player`/`wallet_ref` is a versioned pointer at that wallet; it does not store the gold amount. The Godot client must not write any of those objects.

## Reproduction

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
```

Valid source must succeed. Invalid fixtures in `tools/content-build/tests` must fail for `duplicate_id`, `missing_reference`, `invalid_range`, `unknown_equipment_slot`, and `duplicate_quest_reward`. `scripts/test-content` and `scripts/test-all` also assert `client/content/bundle.json` and `server/src/generated/content.ts` share the same 64-hex `contentHash`. Regenerating twice from unchanged source must stay byte-identical.
