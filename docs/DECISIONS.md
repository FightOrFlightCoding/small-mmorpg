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
