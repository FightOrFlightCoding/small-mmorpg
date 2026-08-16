# vibecode

Server-authoritative 2D MMORPG **vertical slice**.

The Godot 4.7.1 client authenticates locally by device, bootstraps one character per account, and joins the shared starter-zone match. Movement, combat, loot, equipment, quests, and gold are server-authoritative. The client predicts movement and mirrors inventory, equipment, quest, and wallet views.

## Read first

1. [AGENTS.md](AGENTS.md)
2. [docs/PROGRESS.md](docs/PROGRESS.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md)
5. [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Godot | **4.7.1 stable** (`4.7.1.stable.official.a13da4feb`) | Console binary for tests; game binary for play. Set `GODOT_BIN` if it is not at `C:\Users\Eszter\Desktop\godot\`. |
| Node.js | **>= 20.20.0** (Docker builder uses 20.20.2) | `npm ci` in `server/` and `tools/content-build/` |
| Docker Desktop | current, with Compose | PostgreSQL 16.15 and Nakama 3.40.0 |
| PowerShell 5+ or bash | — | `scripts/*.ps1` and `scripts/*.sh` |

## Exact versions

Pinned in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md) and [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md). Do not upgrade these without a phase that edits those files:

- Godot 4.7.1, GDScript
- Nakama 3.40.0, `nakama-runtime` 1.47.0, Nakama Godot SDK 3.4.0
- PostgreSQL 16.15 (`postgres:16.15-alpine`)
- GLoot 3.0.2, Dialogue Manager 3.10.5, GdUnit4 6.2.0
- TypeScript 5.8.3, Ajv 8.17.1
- Kenney RPG Base 1.0 (CC0)

## Initial setup

Import **`client/`**, not the repository root.

```powershell
powershell -File scripts/setup.ps1
```

```bash
bash scripts/setup.sh
```

That checks Godot, Node, and Docker, runs `npm ci` in `server/` and `tools/content-build/`, and asserts the client and server content hashes match.

## Starting backend

```powershell
powershell -File scripts/dev-up.ps1
```

```bash
bash scripts/dev-up.sh
```

This builds `server/build/index.js`, recreates Nakama so it loads that bundle (JS is not hot-reloaded), and verifies `character_bootstrap` and `find_or_create_starter_zone`.

Stop without deleting data:

```powershell
powershell -File scripts/dev-down.ps1
```

Nakama Console: [http://127.0.0.1:7351](http://127.0.0.1:7351) (local defaults `admin` / `password`). Health RPC:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap" -ContentType "application/json" -Body "{}"
```

`http_key=defaulthttpkey` and `defaultkey` are Nakama's insecure local defaults, not production secrets.

## Opening the project

1. Start the backend (`scripts/dev-up.ps1`).
2. Open Godot 4.7.1.
3. Import `C:\Users\Eszter\small-mmorpg\client`.
4. Main scene is `scenes/boot/boot.tscn`.

Do not Play nested UI scenes (login/character/world) as the main scene; autoloads and boot order expect the boot scene.

## Running Alice and Bob

Fastest two-client path (game windows, not the editor Game workspace):

```powershell
powershell -File scripts/run-two-clients.ps1
```

```bash
bash scripts/run-two-clients.sh
```

One client:

```powershell
powershell -File scripts/run-client.ps1 -DevUser alice
powershell -File scripts/run-client.ps1 -DevUser bob
```

`--dev-user=alice` authenticates as device id `vibecode-dev-alice`. The editor Play button does not pass that flag; use **Sign in as Alice** in one window and **Sign in as Bob** in the other. Those buttons continue into the zone after character bootstrap. A second join on the same account is `already_in_match`.

Manual loop: WASD/arrows move, **E** talk to the Elder, accept **Slime Problem**, **Space** attack the slime, **F** pick up gel, turn in at the Elder, then log out and back in. Inventory should keep the Iron Sword and **25** gold; a second turn-in must not pay again.

## Running all tests

From a machine that already has the prerequisites:

```powershell
powershell -File scripts/test-all.ps1
```

```bash
bash scripts/test-all.sh
```

`test-all` fails with a nonzero exit status if any step fails. It runs setup, content tests + hash check, server tests, client GdUnit, then the headless two-client journey (`scripts/test-e2e.ps1`). The e2e driver starts Nakama if needed.

| Script | What it runs |
| --- | --- |
| `scripts/test-content` | `tools/content-build` unit tests and matching content hashes |
| `scripts/test-server` | Nakama runtime domain tests |
| `scripts/test-client` | Godot import, `SHELL_LOGIN`, GdUnit4 `res://tests` |
| `scripts/test-e2e` | Debug-only headless Alice+Bob journey against live Nakama |
| `scripts/server-build` | Rollup bundle `server/build/index.js` |

The e2e scene is `res://scenes/e2e/e2e_slice.tscn`. It runs only in a **debug** Godot build with `--e2e-slice`. It uses two real Nakama sessions and the same match opcodes as the graphical client. It does not skip server validation. Release exports refuse the hook.

## Resetting local development data

`dev-down` **keeps** Docker volume `vibecode_postgres_data`. To wipe accounts, characters, inventory, quests, and gold:

```powershell
powershell -File scripts/backend-volume-destroy.ps1
```

```bash
bash scripts/backend-volume-destroy.sh
```

Then `scripts/dev-up.ps1` again. The headless e2e journey uses unique device ids and does not require a wipe.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Sign-in error, cannot reach Nakama | `scripts/dev-up.ps1`. Client talks to `127.0.0.1:7350`. |
| `rpc_missing` / stale health RPC | Rebuild and recreate Nakama (`dev-up`). JS is not hot-reloaded. |
| Protocol or content mismatch | Run `scripts/content-build.ps1`, then `dev-up`, and use a client with the same `bundle.json` hash. |
| Stuck after logout/login | Wait for **Leaving…**, then sign in. New sessions reset movement `seq`. |
| Second window rejected `already_in_match` | Alice in one window, Bob in the other. One account cannot occupy two presences. |
| Two editor Play windows feel slow | Use `scripts/run-two-clients.ps1` instead of nested Game workspace debuggers. |
| Godot not found | Set `GODOT_BIN` to `Godot_v4.7.1-stable_win64_console.exe` for tests. |
| Tests pass but play does not | Confirm Nakama health `content_version` matches `client/content/bundle.json` `contentHash`. |
| Need a clean database | `backend-volume-destroy`, then `dev-up`. |

Visible errors use the in-game dialog. There is no infinite spinner: boot, login, reconnect, and logout overlays complete or fail.

## Package licenses

Recorded in [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md):

| Package | License |
| --- | --- |
| Godot 4.7.1 | MIT |
| Nakama 3.40.0, Nakama Godot SDK 3.4.0, nakama-runtime 1.47.0 | Apache-2.0 |
| GLoot 3.0.2, Dialogue Manager 3.10.5, GdUnit4 6.2.0 | MIT |
| PostgreSQL 16.15 | PostgreSQL License |
| Node 20.20.2, TypeScript 5.8.3, Rollup, Ajv | MIT / Apache-2.0 as upstream |
| Kenney RPG Base 1.0 | CC0 1.0 (`client/assets/third_party/kenney_rpg_base/license.txt`) |

Do not modify `client/addons/`. Godot may rewrite GLoot `images/*.svg.import`; do not commit those engine rewrites.

## Known vertical-slice limitations

This repository implements only [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md). It does **not** include extra zones, character slots, guilds, parties, trading, auction houses, crafting, PvP, monetization, procedural generation, or open-world streaming.

Other slice limits:

- One shared `zone.starter` match, maximum 8 players, empty-match shutdown after 30 seconds.
- Health is not persisted. After reconnect grace (5 seconds) or a new match, HP is full `player.base.maxHealth`.
- Ground loot, slime AI, and cooldowns reset with the match.
- Device auth and Nakama local keys are for development, not production identity or secrets management.
- Chat is the `zone.starter` room only (200 character plain text).

## Layout

```
client/     Godot 4.7.1 client (import this folder)
server/     Nakama TypeScript runtime (RPCs + starter-zone match + generated content)
content/    JSON Schema + source content
infra/      Docker Compose + Nakama config
scripts/    Developer commands (PowerShell and bash)
tools/      Content generation (`tools/content-build`)
docs/       Binding architecture and slice contract
```

## Content database

Author `content/source/` only. Do not hand-edit generated files.

```powershell
powershell -File scripts/content-test.ps1
powershell -File scripts/content-build.ps1
```

That writes `server/src/generated/content.ts` and `client/content/bundle.json` with the same `contentHash`. The Nakama runtime never reads source JSON from disk.

## Local Git

```powershell
git status
```

`.gitignore` excludes Godot `.godot/` caches, `node_modules`, build output, reports, and secrets. Do not commit those.
