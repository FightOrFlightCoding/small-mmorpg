# Progress

Last accepted phase: **Server-authoritative movement**.

Current phase: none requested. Do not add combat until asked.

## Phase 0 acceptance (2026-08-15)

All required directories and documents exist. Internal links among `docs/` and `AGENTS.md` are consistent. The server is documented as the only authority for simulation and rewards. Dependency versions are pinned in [DEPENDENCIES.md](DEPENDENCIES.md). Slice completion is testable via VS-T* and VS-M* in [VERTICAL_SLICE.md](VERTICAL_SLICE.md). No gameplay or networking implementation is present.

## Godot package compatibility spike acceptance (2026-08-15)

Godot 4.7.1 (`4.7.1.stable.official.a13da4feb`) imported `client/` without parser errors. Nakama 3.4.0, GLoot 3.0.2, Dialogue Manager 3.10.5, and GdUnit4 6.2.0 load from unmodified `client/addons/` trees. The compatibility scene printed `COMPATIBILITY_OK` and exited 0 in headless mode. GdUnit4 ran `res://tests/compatibility/compatibility_test.gd` with 4/4 passed. Ledger fields are in [DEPENDENCIES.md](DEPENDENCIES.md) and [THIRD_PARTY.md](THIRD_PARTY.md). No gameplay scenes were added.

Reproduction: `powershell -File scripts/run-client-compatibility.ps1`

## Local Nakama and PostgreSQL infrastructure acceptance (2026-08-15)

`npm ci`, `npm run typecheck`, `npm test` (7/7), and `npm run build` succeeded in `server/`. Docker Compose started PostgreSQL `16.15-alpine` and Nakama `3.40.0`. Nakama reported healthy. The JS runtime loaded `build/index.js` and registered `vibecode_health`. The RPC returned `{"ok":true,"service":"vibecode-server","protocol_version":1,"content_version":"uninitialized"}`. `docker compose down` kept named volume `vibecode_postgres_data`; a subsequent up applied 0 migrations and still had 20 public tables. Destroying that volume is `scripts/backend-volume-destroy.ps1` only. No authentication or match code was added.

Reproduction:

```powershell
Set-Location server
npm ci
npm run typecheck
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
```

## Shared content database and build pipeline acceptance (2026-08-15)

`tools/content-build` `npm ci`, typecheck, and tests succeeded (9/9): valid source, duplicate IDs, broken references, invalid ranges, unknown equipment slots, duplicate quest rewards, deterministic generation, matching client/server hashes, and no absolute paths in generated files. Regenerating twice produced byte-identical `server/src/generated/content.ts` and `client/content/bundle.json` with hash `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. Server `npm run typecheck`, `npm test` (8/8), and `npm run build` succeeded. The Rollup bundle embeds the catalog (not source JSON). `vibecode_health` now returns that hash as `content_version`. No gameplay logic was added.

Reproduction:

```powershell
powershell -File scripts/content-test.ps1
powershell -File scripts/content-build.ps1
Set-Location server
npm test
npm run build
```

## Godot application shell acceptance (2026-08-15)

Godot 4.7.1 imported `client/` and ran `res://scenes/boot/boot.tscn` headless. Boot loaded `res://content/bundle.json`, validated `schemaVersion` 1, and reached the login scene (`SHELL_LOGIN`, exit 0). All required scenes instantiated without parser errors: boot, login, character, world, error dialog, loading overlay. Autoloads `AppState`, `ContentRegistry`, `NetworkService`, `GameService`, and `SceneRouter` are registered. `NetworkService` does not create a Nakama client or open a socket. Missing, malformed, and incompatible bundles are fatal and stay on boot. GdUnit4 ran `res://tests` with 16/16 passed (content lookup, missing ID, content hash, scene routing, error-state transitions, scene instantiate, plus the prior compatibility suite). No canonical game state is written to `user://`.

Reproduction: `powershell -File scripts/run-client-shell.ps1`

## Authentication and one-character bootstrap acceptance (2026-08-15)

Server `npm run typecheck`, `npm test` (18/18), and `npm run build` succeeded. Domain tests cover unauthenticated `character_bootstrap`, valid creation, repeated creation, invalid names, stat injection, existing-character retrieval, distinct Alice/Bob records, and `permissionWrite: 0` storage writes. The RPC is registered as `character_bootstrap`. No match module was added.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 29/29 passed: authentication state transitions, session-expired reauth and visible failure, character-created and character-existing paths, visible network errors, logout, development device IDs, plus prior shell and compatibility suites. `NetworkService` creates a Nakama client, authenticates by device, caches the session in memory, refreshes, reauthenticates, opens a realtime socket, and logs out. Tokens are not logged and are not written to `user://`. Continue on the character scene enters the temporary world screen and does not join a match.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack with `scripts/backend-up.ps1`, then launch the Godot client with `-- --dev-user=alice` or `-- --dev-user=bob`.

## Network protocol and authoritative zone skeleton acceptance (2026-08-15)

Server `npm run typecheck`, `npm test` (44/44), and `npm run build` succeeded. Domain tests cover opcode allocation, malformed JSON, unknown opcodes, unknown fields, protocol and content mismatch, required `requestId` on reward opcodes, stat injection, oversized payloads, Alice/Bob in one `FULL_STATE`, join rejection, resync, ignored `INPUT` (no movement), malformed payloads that do not crash the match, empty-match shutdown after 30s at 10 Hz, and canonical match-id selection for concurrent `find_or_create_starter_zone`.

The runtime registers match module `starter_zone` (label `zone.starter`, tick 10 Hz, max 8 players) and authenticated RPC `find_or_create_starter_zone`. Character storage is loaded on join only. The tick loop does not read storage.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 39/39 passed: matching client opcodes, `FULL_STATE` parse/reject, world entry only after valid full state, fatal protocol/content mismatch, resync, plus prior auth, shell, and compatibility suites. Continue calls `find_or_create_starter_zone`, joins the returned match, and enters the world only after a valid `FULL_STATE`. There is no gameplay movement.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack with `scripts/backend-up.ps1`, then launch two Godot clients with `-- --dev-user=alice` and `-- --dev-user=bob`. Both should join the same starter-zone match and see each other in the presence list.

## Content-driven starter-zone rendering acceptance (2026-08-15)

Kenney RPG Base (CC0) was installed from https://kenney.nl/assets/rpg-base into `client/assets/third_party/kenney_rpg_base/` (zip SHA-256 `49759ab087fdc28d8357010e0f2a17d1c9db61c8fe9b320da965acdfbc298ef5`). License is `license.txt`. Client visual IDs in `client/content/visual_map.json` map to those textures; gameplay scripts do not hard-code Kenney paths. The pack has no adventurer sprite, so `visual.player` uses a labeled primitive fallback.

The world scene renders zone bounds, a tiled floor, collision AABBs, the player spawn, Elder, green slime, local and remote players, and a camera that follows the local avatar. `EntityRegistry` creates/updates/removes by server ID, distinguishes the local player, rejects unknown kinds, and does not duplicate on repeated `FULL_STATE`. Missing visual IDs show a magenta `MISSING` marker instead of crashing.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 48/48 passed, including entity-registry and world-render suites. There is still no movement or combat.

Reproduction: `powershell -File scripts/run-client-shell.ps1`

## Server-authoritative movement acceptance (2026-08-15)

`INPUT` now carries `{ protocolVersion, seq, axisX, axisY }` only. The match validates finite numbers, clamps axes, normalizes diagonals, applies `player.base` move speed at 10 Hz, resolves `zone.starter` walkable bounds and collision AABBs, ignores stale sequence numbers, and broadcasts `SNAPSHOT` at 10 Hz with entity positions and `lastProcessedSeq`. Client-supplied position, speed, or dt is rejected. Dead and disconnected players do not move.

The client sends normalized WASD/arrow intent at 10 Hz, snaps the local avatar to server poses, interpolates remote players between snapshots, and shows a visible `snapshot_timeout` after 2 seconds without a snapshot. There is no local prediction, input replay, or combat.

Server `npm test` 55/55, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 53/53 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```
