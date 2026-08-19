# AGENTS.md

Rules for every coding agent working on this repository. Recover project constraints from this file and `docs/` before writing code.

## Before editing

1. Read this file.
2. Read `docs/PROGRESS.md` and identify the last accepted phase.
3. Read `docs/ARCHITECTURE.md`, `docs/VERTICAL_SLICE.md`, `docs/SECURITY_MODEL.md`, and `docs/DECISIONS.md`.
4. After Prompt 18, also read `docs/FOUNDATION_SCOPE.md`, `docs/FOUNDATION_BASELINE.md`, and any catalog in `docs/` named by the current phase.
5. Read any other `docs/` file relevant to the requested phase.
6. Inspect the repository. Do not rebuild systems that already exist. Do not duplicate services, models, or protocols.
7. Run the currently documented baseline tests, if any exist for the accepted phases.
8. Implement only the requested phase. Do not continue into a later phase.

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
- One server-authoritative Nakama match module `starter_zone` hosting the public world (`zone.starter`) and private party caves (`zone.cave`). Prompt 18 freeze still applies to village/slime behavior. No public-world sharding.

## Architecture

- The server is authoritative for position, collision, health, damage, cooldowns, enemy behavior, inventory, equipment, loot, quests, rewards, currency, experience, levels, attribute allocation, abilities, casts, resources, derived statistics, targeting, death, respawn, party membership, group credit, group loot, canonical location, transfer tickets, cave instance ownership, direct player trades, and developer/GM commands.
- The client sends intentions, never outcomes.
- The client must never send an authoritative position, damage value, health value, item grant, quest completion, currency change, XP amount, party member list, credit/loot recipient list, destination match id, instance id, fabricated transfer ticket, or completed trade.
- Important player storage must use `permissionWrite: 0`.
- Do not allow the Godot client to write canonical inventory, equipment, quest, currency, or progression storage records.
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
- No client build flag alone may grant GM or administrator authority.
- The Nakama TypeScript runtime must not use Node `fs`, `process`, `crypto`, or other unavailable Node APIs.
- Separate pure server-domain logic from Nakama adapter code so it can be unit tested outside Nakama.
- Validate every external payload.
- Unknown opcodes, unknown fields where strict parsing applies, malformed JSON, and invalid IDs must be rejected safely.
- Every player action that can produce a reward must be idempotent.
- Do not leave TODOs, dummy success responses, or silently swallowed errors in the accepted vertical-slice path.

## Scope

Prompt 18 is accepted and frozen. Do not change its player-visible behavior unless the current phase explicitly repairs a defect.

Foundation v1 product scope is [docs/FOUNDATION_SCOPE.md](docs/FOUNDATION_SCOPE.md). Implement a Foundation feature only when the current phase prompt names it. Prompt 19 is documentation and audit only. Prompt 20 is accepted: versioned content packages and save-schema migrations without new player-facing gameplay. Prompt 21 is accepted: email accounts, slots, and class selection. Prompt 22 is accepted: server-authoritative XP, levels, derived stats, and attribute allocation. Prompt 23 is accepted: generic items, inventory, equipment, gold, and the transaction core. Prompt 24 is accepted: data-defined abilities, casting, cooldowns, resources, and the effect engine (PvP remains disabled). Prompt 25 is accepted: one combat-resolution pipeline, targeting, PvE death/respawn, and XP hooks (PvP remains disabled). Prompt 26 is accepted: data-defined enemies, spawn controllers, AI profiles, loot tables, and simple bosses (PvP remains disabled). Prompt 27 is accepted: generic NPC services, dialogue, quests, merchants, and inn. Prompt 28 is accepted: temporary parties (max 5), party chat, group credit, and group loot (guilds, matchmaking, need/greed remain later). Prompt 29 is accepted: one public world, party cave instances, one-time transfer tickets, canonical location, and reconnection (no sharding). Prompt 30 is accepted: nearby online same-match direct trading of items and gold (mail, auction houses, and offline trade remain later). Prompt 31 is accepted: complete functional UI, settings, and asset contracts. Prompt 32 is accepted: content production workflow, systems lab, and server-authorized GM tools. Prompt 33 is accepted: environments, version compatibility, deployment, backups, and recovery. Prompt 34 is accepted: security, abuse, failure, load, and soak certification.

Always excluded: public-world sharding, extra overworlds, guilds, auction houses, crafting, PvP, monetization, procedural generation as a world system, open-world streaming, extra gameplay frameworks (QuestSystem, LimboAI, netfox, RPG database plugins).

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
| `client/` | Godot 4.7.1 application (boot → login → character list → content-driven public world or owned cave after `FULL_STATE`). Email/password; debug device auth; joins with a selection ticket or a one-time transfer ticket. Progression panel, ability HUD, party panel, trade panel, cave objective, settings, transfer overlay, and a debug-only GM panel mirror server state. Visual IDs in `client/content/visual_map.json`; visual/audio sets in `client/content/asset_manifest.json`. A debug GM panel never grants authority. |
| `server/` | TypeScript Nakama runtime (health RPC, character lifecycle RPCs, `find_or_create_starter_zone`, cave RPCs, `gm_command`, `session_handshake`, ops maintenance RPCs, public-world and party-cave matches; generated content catalog including classes, attributes, resources, derived stats, level curves, class progression, equipment slots, and item categories). |
| `content/schemas/` | JSON Schemas for authored content. |
| `content/source/` | ID-addressed source content documents. |
| `infra/` | Docker Compose, Nakama configuration, and committed environment presets (no production secrets). |
| `scripts/` | Repeatable developer and CI commands, including `scripts/content.ps1` (`validate` / `build` / `diff` / `references` / `unused` / `new` / `copy` / `migrate` / `package`) and backup/export/verify scripts in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). |
| `tools/` | Content CLI (`tools/content-build`) and Prompt 18 freeze audit (`tools/foundation-audit`). |
| `docs/` | Binding project contract, including Foundation catalogs and [CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md). |
