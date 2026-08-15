# Decisions

## 2026-08-15 — Phase 0 is contract only

The repository contains documentation and empty layout directories. No Godot project, Nakama runtime, Docker Compose stack, or gameplay code is included in Phase 0.

## 2026-08-15 — Repository path

The working tree is `C:\Users\Eszter\small-mmorpg`. Godot must import `client/` (`client/project.godot`), never the repo root. A previous project at `C:\Users\Eszter\Documents\small-mmorpg` was decommissioned; do not revive it.

## 2026-08-15 — Directory names

`server/` holds the future Nakama TypeScript runtime (not `nakama-runtime/`). `content/source/` holds authored JSON (not `content/data/`).

## 2026-08-15 — Prior scaffolding discarded

An earlier experimental Godot/Nakama tree in this folder was removed so Phase 0 matches the empty-repository contract. Nothing from that tree is authoritative.

## 2026-08-15 — Postgres image tag (deferred, then pinned)

The exact Postgres Docker tag was deferred at Phase 0. The infra phase pinned `postgres:16.15-alpine`. See the later decision in this file.

## 2026-08-15 — nakama-runtime install source

Version 1.47.0 is the Heroic Labs `nakama-common` tag. The npm package name is `nakama-runtime`. Install from Git, not an unpublished npm version number.

## 2026-08-15 — Godot package compatibility spike

`client/` is now a minimal Godot 4.7.1 project used only to prove the pinned addons load. There are still no gameplay scenes, no Nakama server runtime, and no networking implementation.

Official install rules used:

- Nakama 3.4.0 has no `plugin.cfg`. Autoload `res://addons/com.heroiclabs.nakama/Nakama.gd` as `Nakama`.
- GLoot 3.0.2: enable the editor plugin; instantiate `Inventory` in project code.
- Dialogue Manager 3.10.5: enable the plugin and autoload `res://addons/dialogue_manager/dialogue_manager.gd` as `DialogueManager`.
- GdUnit4 6.2.0: enable the plugin; run `res://addons/gdUnit4/bin/GdUnitCmdTool.gd`.

The Nakama 3.4.0 release zip includes `Satori.gd` inside `addons/com.heroiclabs.nakama`. That file is left in place as shipped and is not autoloaded.

Godot 4.7.1 writes `.uid` files for vendored scripts that predate UID sidecars (Nakama 3.4.0, GdUnit4 6.2.0 zipball). Those generated files are gitignored. They are not treated as package source modifications.

## 2026-08-15 — Postgres image tag

Image is `postgres:16.15-alpine`. Host port 5432 is not published; Nakama talks to Postgres on the Compose network. Named volume `vibecode_postgres_data` survives `docker compose down`. `docker compose down -v` / `scripts/backend-volume-destroy.ps1` is the only volume-destroy path. No custom SQL tables.

## 2026-08-15 — TypeScript runtime bundle

Nakama 3.40.0 requires a global `function InitModule` and RPC handlers as named function declarations. The official path is Rollup + Babel `@babel/preset-env` to ES5, `output.format: "cjs"`, and `runtime.js_entrypoint: "build/index.js"`. `registerRpc` IDs are string literals. Bundled `server/src` must not use Node `fs`, `process`, `crypto`, or other Node APIs. TypeScript is pinned at 5.8.3. The Docker builder is `node:20.20.2-alpine`. Rollup `treeshake` is disabled so the generated content catalog is not stripped down to the few fields `InitModule` currently reads.

## 2026-08-15 — Local Nakama Console credentials

Console is `http://127.0.0.1:7351`. Username `admin` and password `password` are Nakama's built-in insecure local defaults. They are documented, not stored as project production secrets. Do not commit production console, session, or HTTP keys. `infra/.env` is gitignored for future overrides.

## 2026-08-15 — Local backend is health-only

This phase adds PostgreSQL, Nakama, and RPC `vibecode_health`. Player authentication, storage, and the starter-zone match are not implemented yet.

## 2026-08-15 — Previous Documents small-mmorpg removed

An older Nakama/Docker project lived at `C:\Users\Eszter\Documents\small-mmorpg` and used Compose project name `infra`. It bound host ports 5432 and 7349–7351 and left containers, volumes, and images that collided with this repo.

That tree and its Docker resources were deleted. This repository’s Compose project is `vibecode` only (`vibecode-nakama`, `vibecode-postgres`, volume `vibecode_postgres_data`). Do not start leftover `infra` or `small-mmorpg-*` stacks. If an old bind-mount directory under Documents is locked by Windows, delete it from a container that mounts `C:\Users\Eszter\Documents`.

## 2026-08-15 — Shared content database

Content is authored as one JSON file per ID under `content/source/`, validated by JSON Schema plus semantic checks in `tools/content-build`. There is no RPG database plugin. Visual fields are stable IDs (`visual.*`), not Godot paths.

Generated artifacts are `server/src/generated/content.ts` and `client/content/bundle.json`. They share one SHA-256 content hash computed from canonical JSON. The Nakama runtime imports the TypeScript module; it does not read source JSON at runtime. Node `fs` / `crypto` are allowed only in the build tool.

Slice IDs: `zone.starter`, `npc.elder`, `enemy.green_slime`, `item.training_sword`, `item.slime_gel`, `item.iron_sword`, `quest.slime_problem`, `player.base`. Quest gold is content data only; wallet apply is a later phase. Gameplay simulation is not implemented in this phase.

Ajv 8.17.1 is pinned for schema validation in the tool.

## 2026-08-15 — Content envelope schemaVersion

Generated client and server catalogs include `schemaVersion: 1` beside `contentHash`. The SHA-256 digest is still computed from the gameplay payload only (player, items, npcs, enemies, quests, zones). Changing the envelope version does not rewrite the hash. The Godot client refuses to leave boot if the bundle is absent, malformed, missing `schemaVersion`, or not version 1.

## 2026-08-15 — Godot application shell

The client main scene is `res://scenes/boot/boot.tscn`. Boot loads the generated content bundle, then `SceneRouter` transitions to login. Character and world scenes exist as empty shells; they are not entered in this phase.

Project-owned autoloads, in order: `AppState`, `ContentRegistry`, `NetworkService`, `GameService`, `SceneRouter`. Then the existing Nakama and Dialogue Manager autoloads. Game code must not call Nakama or Dialogue Manager APIs except through project-owned services.

`NetworkService.authenticate_device` is an interface only. It does not construct `Nakama.create_client`, open a socket, or send HTTP. Sign-in on the login scene reports a recoverable `authentication_not_configured` error.

`AppState` holds only non-authoritative client/session flags (loading, content ready, last error, current scene id). `GameService` orchestrates boot and the future auth call; it is not a gameplay authority. The client does not write canonical inventory, equipment, quest, currency, or position records to `user://`.

Fatal content errors keep the tree on boot and hide the error-dialog dismiss button. `SceneRouter.apply_scene_changes` is true in the running app; GdUnit tests set it false so the runner tree is not replaced.

Headless smoke uses user argument `--quit-after-login`: login prints `SHELL_LOGIN` and exits 0; a fatal boot prints `SHELL_FATAL` and exits 1.

## 2026-08-15 — Authentication and one-character bootstrap

Local development identities use `--dev-user=alice` / `--dev-user=bob`. Those become Nakama device IDs `vibecode-dev-alice` and `vibecode-dev-bob` (10–128 characters, `[a-zA-Z0-9._-]`). Different device IDs produce different Nakama accounts.

When `--dev-user` is omitted, the client uses `vibecode-local-` plus a sanitized `OS.get_unique_id()`. Limitations: it is not a production identity; every launch on the same machine shares one account; another machine or a reinstall can create a different account; if the unique id is empty the client falls back to `vibecode-local-shared`, which is shared by all such clients. Invalid `--dev-user` values show a recoverable error and do not authenticate.

`NetworkService` wraps the Nakama Godot SDK. It creates a client against `127.0.0.1:7350` with Nakama's local server key `defaultkey`, authenticates by device, caches the `NakamaSession` in memory, enables SDK auto-refresh, explicitly refreshes when the session is expired, reauthenticates with the same device id if refresh fails, connects a realtime socket, and logs out. The Nakama logger is set to ERROR so debug socket URLs that include tokens are not printed. Session tokens are not written to `user://`.

RPC `character_bootstrap` requires `ctx.userId`. Collection `player`, key `character`, `permissionRead: 1`, `permissionWrite: 0`. One character per account. Name is optional, 3–16 characters matching `^[A-Za-z][A-Za-z0-9_]{2,15}$`. Client-supplied stats, position, and unknown fields are rejected. Existing records are returned unchanged (idempotent). Base stats always come from `player.base`; spawn comes from `zone.starter.playerSpawn`.

Continue on the character scene calls `find_or_create_starter_zone`, joins the returned match, and opens the world only after a valid `FULL_STATE`.

## 2026-08-15 — Network protocol and authoritative zone skeleton

Protocol version is `1`, shared by `vibecode_health` and match envelopes. JSON keys are camelCase. Client→server match bodies are capped at 2048 bytes. Reward opcodes (`PICKUP`, `QUEST_ACCEPT`, `QUEST_TURN_IN`) require `requestId` matching `^[A-Za-z0-9_-]{8,64}$`.

The starter-zone match module is `starter_zone` with label `zone.starter`, tick rate 10 Hz, and a maximum of 8 players. An empty match shuts down after 30 seconds (300 ticks). Join metadata is `{ protocolVersion, contentHash }` as strings. Character state is loaded in `matchJoin` / `matchJoinAttempt` only; the tick loop does not read storage. `INPUT` is validated and ignored. There is no movement or combat simulation.

`find_or_create_starter_zone` is an authenticated RPC. It prefers a live system-owned storage singleton (`collection` `match`, key `starter_zone`, `permissionRead: 0`, `permissionWrite: 0`), then `matchList` by label, then `matchCreate`. Concurrent creates reconverge on the stored or lexicographically canonical running match id. Extra raced matches remain empty and time out.

The client enters `world` only after parsing a valid `FULL_STATE`. Protocol or content mismatch is a fatal compatibility error. `RESYNC_REQUEST` asks for a fresh `FULL_STATE`. `SNAPSHOT` updates the remote player list on join/leave.

## 2026-08-15 — Content-driven starter-zone rendering

Kenney RPG Base 1.0 was vendored from the official zip on kenney.nl (CC0). Gameplay never stores `res://assets/third_party/...` paths; `ContentRegistry.resolve_visual` reads `client/content/visual_map.json` keyed by `visual.*` IDs from the hashed catalog. That map is client-only and is not part of the content hash.

The pack is tiles and props, not a character sheet. `visual.player` therefore uses a colored primitive. Elder uses a doorway tile (`rpgTile165`), slime `rpgTile160`, floor `rpgTile019`, collisions `rpgTile080`. If a mapped texture is missing, avatars keep a polygon body and show `MISSING`.

World root is `Node2D` with `ZoneView`, `EntityRegistry`, `Camera2D` following the local avatar, and `WorldHud` as a `CanvasLayer`. No movement input is sent.

## 2026-08-15 — Server-authoritative movement

`INPUT` JSON is camelCase `{ protocolVersion, seq, axisX, axisY }`. The conceptual snake_case example is the same fields. The client never sends position, speed, or elapsed time.

The match applies the last accepted intent once per 10 Hz tick using `player.base.moveSpeed` (120) and `dt = 0.1`. Axes are clamped to [-1, 1] then shrunk if longer than 1 so diagonals and extreme axes cannot exceed content speed. Player collision is a 24×24 AABB (half-extent 12, matching the avatar primitive) tested against `walkableBounds` and the zone collision rectangles. Sequence numbers must be finite integers; `seq <= lastProcessedSeq` is ignored. Health `<= 0` or a missing presence produces no movement. `SNAPSHOT` is broadcast every occupied tick (10 Hz) and includes `lastProcessedSeq` on each player.

The local avatar snaps to the authoritative pose. Remote players lerp between snapshots. Missing snapshots for 2 seconds show a recoverable `snapshot_timeout`. There is still no input replay, prediction, or combat. Position checkpoints are not written this phase.

## 2026-08-15 — Local prediction and reconciliation

Movement prediction is presentation-only. `MovementSim` copies server constants (`moveSpeed` 120, `dt` 0.1, half-extent 12, zone AABBs). `MovementReconciler` keeps unacked seq/axis commands, replays them from the server pose, and never sends a client position.

Correction policy: error ≤ 0.5 px is agreement (no visual correction); error ≤ 24 px is smoothed with blend 0.35; larger error snaps. Local presentation integrates `axis * moveSpeed * frameDelta` every render frame so walking is not quantized to the 10 Hz send rate. `INPUT` is still sent at 10 Hz and reconciliation still replays unacked 10 Hz steps from the server pose.

Remote interpolation uses one snapshot buffer (max 8 frames) for every moving entity, keyed `kind:id` (`player:…`, later `npc:…`, `enemy:…`, `loot:…`). The buffer clocks with frame delta: estimated tick is `latest + timeSinceLatest / 0.1`, and the render tick is that value minus one snapshot (`INTERP_DELAY_TICKS` = 1.0), clamped to the latest received tick so the client never extrapolates. Sampling a fractional tick lerps between the two surrounding 10 Hz poses, so other players (and later NPCs/mobs) do not teleport every 100 ms. After `SNAPSHOT_TIMEOUT_SEC` (2 s) the buffer freezes and the HUD reports a degraded connection. Server snapshots remain players-only until a later phase moves NPCs or enemies; static poses stay in the buffer from `FULL_STATE` until then.

`NetDebugOverlay` is visible only when `OS.is_debug_build()` is true. It shows `Engine.get_frames_per_second()`, frame time, and an EMA of input-to-ack RTT. That ping is not ICMP; it jumps with the 10 Hz snapshot clock if shown raw. Release exports hide the overlay. Two editor Play sessions use the embedded Game workspace (Input/2D/3D toolbar) and are much slower than `scripts/run-client-dev.ps1`, which runs the main scene without the editor. There is still no combat or interaction prediction.

## 2026-08-15 — Editor login identities

Godot editor Play does not pass `--dev-user`. The login scene wraps copy in a 640 px column and offers **Sign in as Alice** / **Sign in as Bob**, which use the same device IDs as the CLI flags. **Sign in with this machine** remains the `OS.get_unique_id()` path. Local Nakama at `127.0.0.1:7350` is required before any of those buttons work.

Editor Play does not auto-authenticate. Two Play windows both signing in as Alice are the same Nakama user; the match keys presence by `userId` and a second join is rejected with `already_in_match`. Use Alice in one window and Bob in the other, or `powershell -File scripts/run-client-dev.ps1 -DevUser bob`. Alice/Bob buttons continue into the zone after character bootstrap so two-client setup is one click per window. GdUnit keeps `SceneRouter.apply_scene_changes` false so tests do not auto-join.

The 2D client uses the GL Compatibility renderer. Zone floor and collision overlays are a single repeating `Polygon2D` each (UVs in texture pixels), not tiled `TextureRect`s or oversized `Sprite2D` regions.

Nakama does not hot-reload `server/build/index.js`. A container started against an older bundle keeps only the RPCs it loaded at boot (`vibecode_health` in the first local stack). `scripts/backend-up.ps1` recreates the Nakama container after `npm run build` and `scripts/backend-verify.ps1` refuses a health-only runtime.

`nakama-runtime` is a type-only package and is Rollup-external. Runtime values such as `nkruntime.SystemUserId` are not available inside Goja. System-owned storage uses the literal UUID `00000000-0000-0000-0000-000000000000`.
