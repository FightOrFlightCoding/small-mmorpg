# vibecode

Server-authoritative 2D MMORPG vertical slice.

The Godot 4.7.1 client authenticates locally by device, bootstraps one character per account, and joins the shared starter-zone authoritative match. The starter zone is rendered from content IDs. Movement is server-authoritative with local prediction. There is still no combat.

## Read first

1. [AGENTS.md](AGENTS.md)
2. [docs/PROGRESS.md](docs/PROGRESS.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md)
5. [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)

## Layout

```
client/     Godot 4.7.1 client (import this folder)
server/     Nakama TypeScript runtime (RPCs + starter-zone match + generated content)
content/    JSON Schema + source content
infra/      Docker Compose + Nakama config
scripts/    Developer commands
tools/      Content generation (`tools/content-build`)
docs/       Binding architecture and slice contract
```

## Local Git

```powershell
git status
```

`.gitignore` excludes Godot `.godot/` caches, `node_modules`, build output, reports, and secrets. Do not commit those.

## Godot

Import **`C:\Users\Eszter\small-mmorpg\client`**, not the repository root.

Pinned addons in `client/addons/`: Nakama Godot SDK 3.4.0, GLoot 3.0.2, Dialogue Manager 3.10.5, GdUnit4 6.2.0.

Prove they load under Godot 4.7.1:

```powershell
powershell -File scripts/run-client-compatibility.ps1
```

The compatibility scene is still `scenes/compatibility_check.tscn`. The **main scene** is `scenes/boot/boot.tscn`. It loads `res://content/bundle.json`, validates schema version 1, and transitions to login. Missing or incompatible content stays on boot with a visible error.

Prove the shell:

```powershell
powershell -File scripts/run-client-shell.ps1
```

That imports the project, smoke-tests boot-to-login (`SHELL_LOGIN`), and runs GdUnit4 under `res://tests`.

Local identities:

```powershell
# After scripts/backend-up.ps1
# In Godot: Project → Run (F5), then Sign in as Alice.
# Second window: Sign in as Bob.
# powershell -File scripts/run-client-dev.ps1 -DevUser bob
# Or from a terminal:
# Godot --path client -- --dev-user=alice
# Godot --path client -- --dev-user=bob
```

`--dev-user=alice` authenticates as device id `vibecode-dev-alice`. The editor Play button does not pass that flag and does not auto-sign in; use **Sign in as Alice** in one window and **Sign in as Bob** in the other. Those buttons continue into the zone after character bootstrap. A second join on the same account is rejected (`already_in_match`). Omit `--dev-user` and press **Sign in with this machine** to use `OS.get_unique_id()`. That fallback is not a production identity: launches on the same machine share one account. Sign-in failures are shown in the error dialog. Character storage is server-only (`permissionWrite: 0`). The world renders the zone, Elder, slime, and other players from content IDs. WASD or arrows send movement intentions; the client predicts locally and the server owns position. Protocol or content mismatch is a fatal compatibility error. There is no combat yet.

## Local Nakama and PostgreSQL

Requires Node `>=20.20.0` and Docker Desktop.

```powershell
Set-Location server
npm ci
npm run typecheck
npm test
npm run build
```

Or the script wrappers:

```powershell
powershell -File scripts/server-typecheck.ps1
powershell -File scripts/server-test.ps1
powershell -File scripts/server-build.ps1
powershell -File scripts/backend-up.ps1
powershell -File scripts/backend-logs.ps1
powershell -File scripts/backend-down.ps1
```

`backend-up.ps1` builds `server/build/index.js`, recreates the Nakama container so it loads that file (JS is not hot-reloaded), then runs `scripts/backend-verify.ps1`. That check requires `character_bootstrap` and `find_or_create_starter_zone` to be registered and bootstraps Alice and Bob. `backend-down.ps1` stops containers and **keeps** named volume `vibecode_postgres_data`. Restarting the stack therefore keeps PostgreSQL data.

Destroying the development volume is a separate explicit operation:

```powershell
powershell -File scripts/backend-volume-destroy.ps1
```

### Nakama Console

Open [http://127.0.0.1:7351](http://127.0.0.1:7351).

Nakama's built-in local defaults are username `admin` and password `password`. Those are Heroic Labs insecure development defaults, not production secrets. Do not commit production console, session, or HTTP keys. `infra/.env` is gitignored if a later phase needs overrides.

### Health RPC

After the stack is healthy:

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap" -ContentType "application/json" -Body "{}"
```

`http_key=defaulthttpkey` is also a Nakama local default. Expected body has `ok`, `service`, `protocol_version`, `rpcs` including `character_bootstrap` and `find_or_create_starter_zone`, and `content_version` set to the generated content hash (64 hex characters). Rebuild and recreate Nakama after `scripts/content-build.ps1` so the hash matches `client/content/bundle.json`. `scripts/backend-verify.ps1` performs that check.

## Content database

Author `content/source/`. Do not edit generated files by hand.

```powershell
powershell -File scripts/content-test.ps1
powershell -File scripts/content-build.ps1
```

That writes `server/src/generated/content.ts` and `client/content/bundle.json` with the same content hash. The Nakama runtime imports the TypeScript module; it never reads source JSON from disk.
