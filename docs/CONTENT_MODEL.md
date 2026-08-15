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

IDs match `^[a-z]+\.[a-z0-9_]+$`. The source filename stem must equal the document `id` (for example `item.training_sword.json`).

- Network, storage, and quest logic use IDs only.
- Visual assets are referenced by IDs such as `visual.zone_starter`, never by `res://` paths or machine-absolute paths.
- Godot `res://` paths, when a later phase adds TileMap scenes, exist only in a client-side catalog keyed by those visual IDs.

## Kinds

| Kind | Source file | Role |
| --- | --- | --- |
| `player` | `player.base.json` | Base max health, attack, movement speed, attack range, attack cooldown, interaction range, pickup range |
| `npc` | `npc.elder.json` | Slice NPC definition |
| `enemy` | `enemy.green_slime.json` | Combat stats, aggro/leash, respawn, guaranteed `item.slime_gel` drop |
| `item` | `item.training_sword.json`, `item.slime_gel.json`, `item.iron_sword.json` | Stack size, optional `main_hand` slot, attack bonus |
| `quest` | `quest.slime_problem.json` | Accept/turn-in at `npc.elder`, acquire and consume one gel, reward iron sword + 25 gold, once only |
| `zone` | `zone.starter.json` | World size, tile size, spawn points, walkable bounds, collision AABBs, visual ID |

Equipment slots allowed in this slice: `main_hand`. Equippable items must have `maxStack` 1. Unequippable items omit `equipSlot`.

No RPG database plugin is used. Dialogue source is not part of this phase.

## Generation

`tools/content-build` validates every source file against its kind schema, then applies semantic checks:

- duplicate IDs
- missing references
- invalid numerical ranges (including negatives)
- unknown equipment slots
- impossible stack sizes
- duplicate quest item rewards

It then:

1. Canonicalizes the gameplay payload (sorted object keys).
2. Hashes SHA-256 of the compact canonical JSON (Node `crypto` in the **tool only**). The digest does **not** include `schemaVersion`.
3. Wraps the payload with envelope fields `schemaVersion` (currently `1`) and `contentHash`.
4. Writes `server/src/generated/content.ts` (`schemaVersion`, `contentHash`, `content`).
5. Writes `client/content/bundle.json` with the same `schemaVersion` and `contentHash`.

Unchanged source produces byte-identical outputs. Generated files contain no machine-specific absolute paths.

The Godot `ContentRegistry` loads `res://content/bundle.json` at boot and rejects any bundle that is missing, malformed, or not `schemaVersion` 1. A fatal content error must not continue into login, character, or world.

## Reproduction

```powershell
powershell -File scripts/content-build.ps1
powershell -File scripts/content-test.ps1
```

Valid source must succeed. Invalid fixtures in `tools/content-build/tests` must fail for `duplicate_id`, `missing_reference`, `invalid_range`, `unknown_equipment_slot`, and `duplicate_quest_reward`.
