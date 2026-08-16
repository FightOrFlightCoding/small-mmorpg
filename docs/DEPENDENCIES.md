# Dependencies

Pinned versions. Do not upgrade, replace, or add foundational packages unless the current phase explicitly instructs it.

Upgrade policy for every row: **locked**. A later phase may change a pin only by editing this file and [DECISIONS.md](DECISIONS.md) in the same change.

## Godot

| Field | Value |
| --- | --- |
| Purpose | Client engine, TileMap, scenes, GDScript |
| Version | 4.7.1 stable |
| Official source | https://godotengine.org/download |
| License | MIT |
| Installation | Local editor already on this machine: `C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64.exe` |
| Executes on | Client editor, exported client, GdUnit4 host |
| Upgrade policy | Locked |
| Compatibility result | **Pass.** Headless binary `Godot_v4.7.1-stable_win64_console.exe` reports `4.7.1.stable.official.a13da4feb`. Project import, compatibility scene, application shell (boot → login), and GdUnit4 tests succeeded on 2026-08-15. |

## Nakama

| Field | Value |
| --- | --- |
| Purpose | Authoritative game server, accounts, storage, wallet, matches |
| Version | 3.40.0 |
| Official source | https://github.com/heroiclabs/nakama and Docker image `heroiclabs/nakama:3.40.0` |
| License | Apache-2.0 |
| Installation | Docker Compose in `infra/`. Image `heroiclabs/nakama:3.40.0`. |
| Executes on | Server |
| Upgrade policy | Locked |

## nakama-runtime (Nakama Common TypeScript types)

| Field | Value |
| --- | --- |
| Purpose | TypeScript typings for the Nakama JS runtime API |
| Version | 1.47.0 |
| Official source | https://github.com/heroiclabs/nakama-common/tree/v1.47.0 (npm package name `nakama-runtime`; install from the Git tag, not the public npm copy) |
| License | Apache-2.0 |
| Installation | `server/package.json` devDependency: `github:heroiclabs/nakama-common#v1.47.0` (resolved commit `449b77ecc8789aa466c36b67f6e498033dfcd9c5`) |
| Executes on | Build tooling (types only). Runtime code executes inside Nakama, not Node. |
| Upgrade policy | Locked |

## Nakama Godot SDK

| Field | Value |
| --- | --- |
| Purpose | Official GDScript client for Nakama HTTP and realtime APIs |
| Version | 3.4.0 |
| Tag | `v3.4.0` |
| Official source | https://github.com/heroiclabs/nakama-godot/releases/tag/v3.4.0 |
| Source archive | `nakama-3.4.0.zip` |
| Commit | `14b7f7078a9822c15b0424624e4c883c87730cee` |
| Archive SHA-256 | `540c7ff3556ef114188b93750626fe93cd5e5d151c5850061eb7a163ba7c6f3e` |
| Installed tree SHA-256 | `acd6016e66dbb9b5d3845cc1cf848c47a64ff9ce92e37a7ace005ef8d30664b1` (`client/addons/com.heroiclabs.nakama`, 30 files as shipped) |
| License | Apache-2.0 (`LICENSE` is at the zip root, not inside the addon folder) |
| Installation | Vendor `addons/com.heroiclabs.nakama` from the release zip into `client/addons/`. Autoload `Nakama.gd` per official docs. The SDK has no `plugin.cfg`. |
| Local modifications | none |
| Executes on | Client |
| Upgrade policy | Locked |
| Compatibility result | **Pass** under Godot 4.7.1. `Nakama.create_client` returns a `NakamaClient`. The 3.4.0 zip also ships `Satori.gd` inside this same addon folder; Satori is not autoloaded and is not a separate installed package. |

## GLoot

| Field | Value |
| --- | --- |
| Purpose | Inventory/equipment presentation widgets |
| Version | 3.0.2 |
| Tag | `v3.0.2` |
| Official source | https://github.com/peter-kish/gloot/releases/tag/v3.0.2 |
| Source archive | GitHub zipball saved as `gloot-v3.0.2.zip` (`https://github.com/peter-kish/gloot/archive/refs/tags/v3.0.2.zip`) |
| Commit | `ce88b7adc7b952b4df8ebe4836339de334d0d0cc` |
| Archive SHA-256 | `d4d08157860abbd0ccee9fc8657ebf79fdbe1ecb10f986343a3bfea417ff6937` |
| Installed tree SHA-256 | `15d2a5055536d1d7a0f10d8f3e2ca6f3d4d76495f35a681060dc4bb8c43fb618` (`client/addons/gloot`, 112 files as shipped) |
| License | MIT (upstream). The v3.0.2 addon tree does not include a LICENSE file. |
| Installation | Copy `addons/gloot` from the tag zipball. Enable the GLoot editor plugin. |
| Local modifications | none |
| Executes on | Client |
| Upgrade policy | Locked |
| Compatibility result | **Pass** under Godot 4.7.1. `Inventory.new()` instantiates and reports `get_item_count() == 0`. Godot 4.7.1 may rewrite `addons/gloot/images/*.svg.import` on import; those sidecars were restored to the v3.0.2 bytes and must not be committed as engine rewrites. |

## Dialogue Manager

| Field | Value |
| --- | --- |
| Purpose | Dialogue presentation and `.dialogue` editing |
| Version | 3.10.5 |
| Tag | `v3.10.5` |
| Official source | https://github.com/nathanhoad/godot_dialogue_manager/releases/tag/v3.10.5 |
| Source archive | GitHub zipball saved as `godot_dialogue_manager-v3.10.5.zip` (`https://github.com/nathanhoad/godot_dialogue_manager/archive/refs/tags/v3.10.5.zip`) |
| Commit | `0049d4d14f62aeb6377be8e6529d12e8e256ef27` |
| Archive SHA-256 | `b96950edda194d040100f89ee2d83fb25d6beb83183807d720933ddb235940dc` |
| Installed tree SHA-256 | `2e324c5188237f43b46d7d6d5a2599375cb4491d9c9d581dd9b6bb31942ed9ef` (`client/addons/dialogue_manager`, 122 files as shipped) |
| License | MIT (`client/addons/dialogue_manager/LICENSE`) |
| Installation | Copy `addons/dialogue_manager` from the tag zipball. Enable the plugin. Autoload `DialogueManager` → `res://addons/dialogue_manager/dialogue_manager.gd` as the plugin does on enable. |
| Local modifications | none |
| Executes on | Client |
| Upgrade policy | Locked |
| Compatibility result | **Pass** under Godot 4.7.1. Autoload registers the `DialogueManager` engine singleton and exposes `get_next_dialogue_line` and `show_dialogue_balloon`. |

## GdUnit4

| Field | Value |
| --- | --- |
| Purpose | Godot unit and scene tests |
| Version | 6.2.0 |
| Tag | `v6.2.0` |
| Official source | https://github.com/godot-gdunit-labs/gdUnit4/releases/tag/v6.2.0 |
| Source archive | GitHub zipball saved as `gdUnit4-v6.2.0.zip` (`https://github.com/godot-gdunit-labs/gdUnit4/archive/refs/tags/v6.2.0.zip`) |
| Commit | `d18770221c2df4a3c991a42fdce7907df40eea75` |
| Archive SHA-256 | `99e86a1c0c91deef9ab88c4a0bfea8802bf2d6ffb8167634c16ca12fee16338b` |
| Installed tree SHA-256 | `c8e629f31923c36a3429e924d24cc1aeb4d9926fa9bcda9adddfcd3aadc834e8` (`client/addons/gdUnit4`, 272 files as shipped) |
| License | MIT (`client/addons/gdUnit4/LICENSE`) |
| Installation | Copy `addons/gdUnit4` from the tag zipball. Enable the gdUnit4 editor plugin. Run tests with `GdUnitCmdTool.gd` (see reproduction commands). |
| Local modifications | none |
| Executes on | Build tooling (Godot headless test host) |
| Upgrade policy | Locked |
| Compatibility result | **Pass** under Godot 4.7.1. `res://tests/compatibility/compatibility_test.gd`: 4/4 passed, 0 errors, 0 failures, exit code 0. |

## PostgreSQL (via Docker Compose)

| Field | Value |
| --- | --- |
| Purpose | Nakama persistence backend |
| Version | 16.15 |
| Official source | https://hub.docker.com/_/postgres |
| License | PostgreSQL License |
| Installation | Docker image `postgres:16.15-alpine` in `infra/docker-compose.yml`. Data lives in named volume `vibecode_postgres_data`. Not published to the host; Nakama reaches it on the Compose network. |
| Executes on | Server infrastructure |
| Upgrade policy | Locked. No custom SQL. |

## TypeScript

| Field | Value |
| --- | --- |
| Purpose | Compile `server/` to JS for Nakama |
| Version | 5.8.3 |
| Official source | https://www.typescriptlang.org/ |
| License | Apache-2.0 |
| Installation | `server/package.json` devDependency `typescript` `5.8.3` |
| Executes on | Build tooling |
| Upgrade policy | Locked |

## Node.js (runtime build image)

| Field | Value |
| --- | --- |
| Purpose | Reproducible `npm ci` + Rollup build inside `server/Dockerfile` |
| Version | 20.20.2 |
| Official source | https://hub.docker.com/_/node |
| License | MIT |
| Installation | Docker image `node:20.20.2-alpine` (builder stage). Host `npm` commands require Node `>=20.20.0`. |
| Executes on | Build tooling |
| Upgrade policy | Locked |

## Rollup + Babel (Nakama JS bundle)

| Field | Value |
| --- | --- |
| Purpose | Emit an ES5 CommonJS bundle with a global `InitModule` for Nakama 3.40.0 |
| Version | Rollup 4.62.4 (lockfile); Babel preset-env via `server/babel.config.json` targeting IE 11 |
| Official source | https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/ |
| License | MIT |
| Installation | `server/` devDependencies; `npm run build` writes `server/build/index.js` |
| Executes on | Build tooling. Bundled JS executes inside Nakama, not Node. |
| Upgrade policy | Locked |

## Ajv (content-build)

| Field | Value |
| --- | --- |
| Purpose | JSON Schema validation for `content/source/` |
| Version | 8.17.1 |
| Official source | https://www.npmjs.com/package/ajv |
| License | MIT |
| Installation | `tools/content-build/package.json` devDependency |
| Executes on | Build tooling only. Not bundled into Nakama. |
| Upgrade policy | Locked |

## Reproduction commands (Godot 4.7.1 compatibility)

From the repo root, with Godot 4.7.1 console at `C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64_console.exe` (or `GODOT_BIN`):

```powershell
powershell -File scripts/run-client-compatibility.ps1
```

Equivalent steps:

```powershell
$Godot = "C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64_console.exe"
$Client = "C:\Users\Eszter\small-mmorpg\client"
& $Godot --headless --path $Client --import --quit
& $Godot --headless --path $Client --scene "res://scenes/compatibility_check.tscn"
& $Godot --headless --path $Client -s "res://addons/gdUnit4/bin/GdUnitCmdTool.gd" --ignoreHeadlessMode --add "res://tests/compatibility" -c
```

Expected: import exit 0, scene prints `COMPATIBILITY_OK` and exits 0, GdUnit4 reports 4/4 passed and exit 0.

## Reproduction commands (local Nakama + PostgreSQL)

From the repo root, Node `>=20.20.0` and Docker Desktop required:

```powershell
Set-Location server
npm ci
npm run typecheck
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
```

Equivalent script wrappers:

```powershell
powershell -File scripts/server-typecheck.ps1
powershell -File scripts/server-test.ps1
powershell -File scripts/server-build.ps1
powershell -File scripts/backend-up.ps1
powershell -File scripts/backend-logs.ps1
powershell -File scripts/backend-down.ps1
```

`backend-down.ps1` stops containers and **keeps** `vibecode_postgres_data`. Destroying local Postgres data is a separate explicit command:

```powershell
powershell -File scripts/backend-volume-destroy.ps1
```

Expected after `backend-up.ps1`: both services healthy; Nakama log line includes `character_bootstrap`; HTTP health RPC returns `rpcs` containing `character_bootstrap` and `find_or_create_starter_zone`. `scripts/backend-verify.ps1` fails if Nakama is still running a stale health-only module. `http_key=defaulthttpkey` is Nakama's built-in local default, not a production secret.

## Reproduction commands (content database)

From the repo root, Node `>=20.20.0`:

```powershell
powershell -File scripts/content-test.ps1
powershell -File scripts/content-build.ps1
```

Expected: content-build tests 9/9, generator prints `content_hash=` plus a 64-character hex digest, `server/src/generated/content.ts` and `client/content/bundle.json` share that hash.

## Kenney RPG Base

| Field | Value |
| --- | --- |
| Purpose | Starter-zone floor, obstacle, NPC, slime, and loot tiles |
| Version | 1.0 |
| Official source | https://kenney.nl/assets/rpg-base |
| Source archive | `https://kenney.nl/media/pages/assets/rpg-base/316dd80b01-1677669634/kenney_rpg-base.zip` |
| Archive SHA-256 | `49759ab087fdc28d8357010e0f2a17d1c9db61c8fe9b320da965acdfbc298ef5` |
| License | CC0 1.0 (`client/assets/third_party/kenney_rpg_base/license.txt`) |
| Installation | Unpack into `client/assets/third_party/kenney_rpg_base/`. See that folder's `README.md`. |
| Executes on | Client presentation only |
| Upgrade policy | Locked |

Installed-tree SHA-256 values are SHA-256 of a sorted `hash length relative-path` listing of every file in the addon folder as extracted from the pinned archive, before Godot generated extra `.uid`/`.import` sidecars.

## Reproduction commands (vertical slice gate)

From the repo root, with Node `>=20.20.0`, Docker Desktop, and Godot 4.7.1:

```powershell
powershell -File scripts/test-all.ps1
```

```bash
bash scripts/test-all.sh
```

Expected: content tests pass and hashes match (`e7e2625ff9e92d4905422efeba0c36554d45136578c27f8a6989f06e0ce94721` for the current source; Prompt 18 freeze snapshot remains `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`), `FOUNDATION_AUDIT_OK`, server tests pass, client prints `SHELL_LOGIN` and GdUnit4 passes with 0 orphans, then `E2E_SLICE_OK`. Any failed step exits nonzero. The e2e driver starts Nakama if the health RPC is down.

