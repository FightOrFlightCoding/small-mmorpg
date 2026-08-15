# vibecode

Server-authoritative 2D MMORPG vertical slice.

This repository is currently **Phase 0 — project contract**. There is no Godot project, Nakama runtime, or gameplay to run yet.

## Read first

1. [AGENTS.md](AGENTS.md)
2. [docs/PROGRESS.md](docs/PROGRESS.md)
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
4. [docs/VERTICAL_SLICE.md](docs/VERTICAL_SLICE.md)
5. [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)

## Layout

```
client/     Godot 4.7.1 project (later phase)
server/     Nakama TypeScript runtime (later phase)
content/    JSON Schema + source content
infra/      Docker Compose + Nakama config (later phase)
scripts/    Developer commands (later phase)
tools/      Content generation (later phase)
docs/       Binding architecture and slice contract
```

## Local Git

```powershell
git status
```

`.gitignore` excludes Godot `.godot/` caches, `node_modules`, build output, reports, and secrets. Do not commit those.

## Godot

Do not import the repository root. A later phase will create `client/project.godot`. Until then, Godot Project Manager will correctly reject this tree as a Godot project.
