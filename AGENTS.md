# AGENTS.md

Rules for every coding agent working on this repository. Recover project constraints from this file and `docs/` before writing code.

## Before editing

1. Read this file.
2. Read `docs/PROGRESS.md` and identify the last accepted phase.
3. Read `docs/ARCHITECTURE.md`, `docs/VERTICAL_SLICE.md`, `docs/SECURITY_MODEL.md`, and `docs/DECISIONS.md`.
4. Read any `docs/` file relevant to the requested phase.
5. Inspect the repository. Do not rebuild systems that already exist. Do not duplicate services, models, or protocols.
6. Run the currently documented baseline tests, if any exist for the accepted phases.
7. Implement only the requested phase. Do not continue into a later phase.

## Locked stack

Do not upgrade, replace, or add foundational packages unless the current phase explicitly instructs it. Versions are pinned in `docs/DEPENDENCIES.md`.

- Godot 4.7.1 stable
- GDScript for the Godot client
- Nakama 3.40.0
- PostgreSQL through Docker Compose
- TypeScript Nakama runtime
- `nakama-runtime` 1.47.0
- Official Nakama Godot SDK 3.4.0
- GLoot 3.0.2
- Dialogue Manager 3.10.5
- GdUnit4 6.2.0
- JSON Schema-based content definitions
- Built-in Godot TileMap workflow
- One server-authoritative Nakama match representing the starter zone

## Architecture

- The server is authoritative for position, collision, health, damage, cooldowns, enemy behavior, inventory, equipment, loot, quests, rewards, and currency.
- The client sends intentions, never outcomes.
- The client must never send an authoritative position, damage value, health value, item grant, quest completion, or currency change.
- Important player storage must use `permissionWrite: 0`.
- Do not allow the Godot client to write canonical inventory, equipment, quest, or currency storage records.
- Do not read or write persistent storage every server tick.
- Load persistent player state when the player joins.
- Keep active state in the authoritative match.
- Persist meaningful transactions immediately and position checkpoints periodically.
- Use storage versions or retry-safe operations where concurrent modification matters.
- Use `nk.multiUpdate` for operations requiring atomic storage and wallet updates.
- Do not create custom SQL tables.
- Do not modify code inside `client/addons/`.
- Wrap third-party APIs behind project-owned services.
- Keep all content references based on stable IDs, never arbitrary asset paths.
- The Nakama TypeScript runtime must not use Node `fs`, `process`, `crypto`, or other unavailable Node APIs.
- Separate pure server-domain logic from Nakama adapter code so it can be unit tested outside Nakama.
- Validate every external payload.
- Unknown opcodes, unknown fields where strict parsing applies, malformed JSON, and invalid IDs must be rejected safely.
- Every player action that can produce a reward must be idempotent.
- Do not leave TODOs, dummy success responses, or silently swallowed errors in the accepted vertical-slice path.

## Scope exclusions

Do not add:

- Multiple zones
- Multiple character slots
- Guilds
- Parties
- Trading
- Auction houses
- Crafting
- PvP
- Monetization
- Procedural generation
- Open-world streaming
- Additional gameplay frameworks

Record necessary assumptions in `docs/DECISIONS.md`.

## Quality

- Use typed GDScript where practical.
- Use strict TypeScript.
- Prefer small modules with explicit responsibilities.
- Add tests for new pure logic and critical state transitions.
- Do not weaken existing tests to make a new implementation pass.
- Do not claim a test passed unless you ran it.
- Use structured logs without authentication tokens or personal data.
- Provide visible error states instead of indefinite loading.
- Preserve compatibility with existing accepted phases.
- Update `docs/PROGRESS.md` only when every acceptance criterion for the phase passes.

## Layout

| Path | Role |
| --- | --- |
| `client/` | Godot 4.7.1 project. Created in a later phase. |
| `server/` | TypeScript Nakama runtime. Created in a later phase. |
| `content/schemas/` | JSON Schemas for authored content. |
| `content/source/` | ID-addressed source content documents. |
| `infra/` | Docker Compose and Nakama configuration. |
| `scripts/` | Repeatable developer and CI commands. |
| `tools/` | Content generation and repo utilities. |
| `docs/` | Binding project contract. |
