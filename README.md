# vibecode

Server-authoritative 2D MMORPG vertical slice.

The Godot 4.7.1 client exists as a **package compatibility spike** only. There is still no gameplay, Nakama runtime, or networking to run.

## Read first

1. [AGENTS.md](AGENTS.md)
2. [docs/PROGRESS.md](docs/PROGRESS.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md)
5. [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)

## Layout

```
client/     Godot 4.7.1 project (compatibility spike; import this folder)
server/     Nakama TypeScript runtime (later phase)
content/    JSON Schema + source content
infra/      Docker Compose + Nakama config (later phase)
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
