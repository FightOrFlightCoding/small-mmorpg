# vibecode

Server-authoritative 2D MMORPG vertical slice.

The Godot 4.7.1 client is a **package compatibility spike**. The Nakama stack currently exposes a health RPC only. There is still no player authentication, match, or gameplay.

## Read first

1. [AGENTS.md](AGENTS.md)
2. [docs/PROGRESS.md](docs/PROGRESS.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md)
5. [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)

## Layout

```
client/     Godot 4.7.1 project (compatibility spike; import this folder)
server/     Nakama TypeScript runtime (health RPC)
content/    JSON Schema + source content
infra/      Docker Compose + Nakama config
scripts/    Developer commands
tools/      Content generation (later phase)
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

The main scene is `scenes/compatibility_check.tscn`. It starts, checks the four packages, prints `COMPATIBILITY_OK`, and quits. Do not add game scenes until a later phase.

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

`backend-up.ps1` builds `server/build/index.js` then starts Compose. `backend-down.ps1` stops containers and **keeps** named volume `vibecode_postgres_data`. Restarting the stack therefore keeps PostgreSQL data.

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

`http_key=defaulthttpkey` is also a Nakama local default. Expected body:

```json
{"ok":true,"service":"vibecode-server","protocol_version":1,"content_version":"uninitialized"}
```
