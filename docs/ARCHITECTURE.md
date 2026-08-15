# Architecture

This document is binding. Implementation phases must not contradict it.

Related: [VERTICAL_SLICE.md](VERTICAL_SLICE.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [CONTENT_MODEL.md](CONTENT_MODEL.md), [DEPENDENCIES.md](DEPENDENCIES.md), [THIRD_PARTY.md](THIRD_PARTY.md).

## Godot client responsibilities

The Godot 4.7.1 client (`client/`) is a presentation and input device.

It may:

- Render the starter-zone TileMap and entities from server snapshots.
- Capture local input and send **intentions** (move, attack, interact, loot, equip, dialogue choice).
- Predict cosmetic motion only when a later phase explicitly allows it; prediction never grants rewards or changes canonical stats.
- Display inventory, equipment, dialogue, quest, and currency **views** from server-owned state.
- Map stable content IDs to scenes, sprites, and Dialogue Manager resources through a project-owned catalog.
- Show visible connection, validation, and rejection errors. It must not spin on an indefinite loading state.

It must not:

- Decide hits, damage, deaths, loot tables, quest completion, or currency changes.
- Send authoritative position, speed, health, damage, item grants, quest flags, or wallet deltas.
- Write Nakama storage records for inventory, equipment, quests, or currency.
- Reference content by filesystem paths in network messages or persistent records.

## Nakama server responsibilities

The Nakama 3.40.0 TypeScript runtime (`server/`) is the authority for the slice.

It must:

- Authenticate the player and load persistent state on join.
- Host **one** authoritative match for the starter zone.
- Simulate movement collision, combat, cooldowns, enemy behavior, loot, inventory, equipment, quests, and currency.
- Validate every external payload. Reject unknown opcodes, strict unknown fields, malformed JSON, invalid IDs, oversized messages, and protocol-version mismatch.
- Apply rewarded actions idempotently using a unique client `requestId`.
- Broadcast snapshots and support full-state resynchronization.
- Persist transactions immediately and position checkpoints periodically.
- Keep pure domain logic in modules that do not import Nakama APIs, with Nakama adapters in a separate layer.

It must not:

- Trust client-supplied outcomes.
- Use Node `fs`, `process`, `crypto`, or other APIs unavailable in the Nakama JS VM.
- Create custom SQL tables.
- Read or write persistent storage every tick.

## PostgreSQL persistence responsibilities

PostgreSQL is used only through Nakama’s built-in storage, wallet, and account APIs.

It stores:

- Account and session material owned by Nakama.
- Canonical player records (inventory, equipment, quest progress, and related metadata) with `permissionWrite: 0`.
- Wallet/currency balances via Nakama wallet APIs.
- Versioned storage objects so concurrent updates can retry safely.

It does not store:

- Per-tick transform streams.
- Transient match entities that exist only while the starter-zone match is alive, except for periodic position checkpoints and durable transaction results.

No project-defined SQL schema is allowed.

## The authoritative starter-zone match

There is exactly one gameplay match module for this slice: the starter zone.

- Players join that match after authentication and character bootstrap (single character, no slots).
- The match owns live positions, collision, combatants, ground loot, and in-memory cooldowns.
- The client never hosts a second simulation of those values.
- Leaving the match does not invent extra zones; reconnect re-enters the same starter-zone match with loaded persistent state plus last checkpointed position.

## Client/server trust boundaries

| Data | Trusted source |
| --- | --- |
| Intended facing/move/attack/interact | Client request, then server validates |
| Position, velocity, collision result | Server match |
| Health, damage, death | Server match |
| Cooldown eligibility | Server match |
| Inventory, equipment, loot grants | Server + persistent storage |
| Quest stage and completion | Server + persistent storage |
| Currency | Nakama wallet via server |
| Content definitions | Server-loaded generated content, IDs only |

The client is untrusted. A well-formed intention can still be rejected (invalid target, on cooldown, out of range, unknown ID, duplicate `requestId`).

## Project-owned service adapters

Third-party libraries are implementation details. Game code talks to project-owned services.

| Adapter (to be created in later phases) | Wraps | Owns |
| --- | --- | --- |
| Nakama client gateway | Nakama Godot SDK 3.4.0 | Sessions, RPCs, sockets, match send |
| Inventory presenter | GLoot 3.0.2 | Display of server inventory/equipment |
| Dialogue presenter | Dialogue Manager 3.10.5 | Display of server-offered lines/choices |
| Test runner scripts | GdUnit4 6.2.0 | Client unit/scene tests |

Do not call addon APIs from feature scenes except through these adapters. Do not edit files under `client/addons/`. See [THIRD_PARTY.md](THIRD_PARTY.md).

## Shared content generation

Authoritative content lives in `content/`:

- `content/schemas/` — JSON Schema contracts.
- `content/source/` — human-authored documents keyed by stable IDs (`zone.starter`, `item.rusty_sword`).
- `tools/` — later-phase generators that emit client catalogs and server modules.

Generated artifacts must preserve IDs. Network messages and storage records carry IDs only, never `res://` paths. The client catalog is the only place an ID becomes a Godot resource path, and that mapping is local.

## Persistent versus transient state

**Persistent** (load on join, write on transaction or checkpoint):

- Inventory and equipment
- Quest progress
- Currency/wallet
- Position checkpoints

**Transient** (match memory only):

- Current interpolation/render pose on the client
- In-flight projectile or swing presentation
- Enemy aggro unless a later accepted phase persists it (the slice does not)
- Cooldown remaining time, reconstructed from server timestamps after resync
- Unacked movement intentions

Transactions that grant items or currency persist immediately with `nk.multiUpdate` when storage and wallet must change together. Positions persist on a checkpoint interval, not every tick.
