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
- Godot `res://` paths exist only in the client-side map `client/content/visual_map.json`, keyed by those visual IDs. That file is not hashed into `contentHash`.

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

| Field | Character | Quests | Inventory | Equipment |
| --- | --- | --- | --- | --- |
| Collection | `player` | `player` | `player` | `player` |
| Key | `character` | `quests` | `inventory` | `equipment` |
| Owner | Authenticated Nakama user id | Authenticated Nakama user id | Authenticated Nakama user id | Authenticated Nakama user id |
| `permissionRead` | `1` (owner) | `1` (owner) | `1` (owner) | `1` (owner) |
| `permissionWrite` | `0` (server only) | `0` (server only) | `0` (server only) | `0` (server only) |

There is exactly one character object per account. The storage key is `character`; the character id is a server-generated UUID stored in the value. The value stores `schemaVersion`, `createdAt`, `updatedAt`, `characterId`, `name`, `contentId`, `zoneId`, and `position`. It does not store client-supplied stats. RPC `character_bootstrap` is the only writer of new character objects. Base stats in the RPC response always come from content `player.base`. Prompt 18 blobs without `schemaVersion` migrate on load; see [MIGRATIONS.md](MIGRATIONS.md).

Quest progress is a second object (`key` `quests`), loaded when the player joins `zone.starter` and written when `QUEST_ACCEPT` first succeeds, when pickup advances an objective, and when turn-in completes the quest. Inventory is a third object (`key` `inventory`), loaded or initialized on join and written when a pickup first succeeds or when turn-in consumes and grants items. Equipment is a fourth object (`key` `equipment`), loaded on join and written when equip or unequip first succeeds. Gold is the Nakama wallet currency `gold`, loaded on join and credited only through `nk.multiUpdate` on successful turn-in. `player`/`wallet_ref` is a versioned pointer at that wallet; it does not store the gold amount. The Godot client must not write any of those objects.

## Reproduction

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
```

Valid source must succeed. Invalid fixtures in `tools/content-build/tests` must fail for `duplicate_id`, `missing_reference`, `invalid_range`, `unknown_equipment_slot`, and `duplicate_quest_reward`. `scripts/test-content` and `scripts/test-all` also assert `client/content/bundle.json` and `server/src/generated/content.ts` share the same 64-hex `contentHash`. Regenerating twice from unchanged source must stay byte-identical.
