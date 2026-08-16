# Architecture

This document is binding. Implementation phases must not contradict it.

Related: [VERTICAL_SLICE.md](VERTICAL_SLICE.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [CONTENT_MODEL.md](CONTENT_MODEL.md), [DEPENDENCIES.md](DEPENDENCIES.md), [THIRD_PARTY.md](THIRD_PARTY.md), [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), [MODULE_OWNERSHIP.md](MODULE_OWNERSHIP.md).

## Godot client responsibilities

The Godot 4.7.1 client (`client/`) is a presentation and input device. Its main scene is `res://scenes/boot/boot.tscn`. Boot loads the generated content bundle, then the shell routes to login. It does not persist canonical game state under `user://`.

It may:

- Render the starter-zone floor, bounds, collision AABBs, spawn marker, and entities from server snapshots plus content IDs.
- Capture local input and send **intentions** (move, attack, interact, loot, equip, dialogue choice).
- Predict local movement presentation using the same speed, dt, and collision rules as the server, then reconcile to `lastProcessedSeq`. After `FULL_STATE` or `SNAPSHOT`, the client adopts `lastProcessedSeq` when the server is ahead so a new world scene does not send stale `INPUT`. Prediction never grants rewards or changes canonical stats.
- Display inventory, equipment, dialogue, quest, and currency **views** from server-owned state.
- Join the starter-zone Nakama room channel after entering `zone.starter`, send chat text, and render received messages as plain text.
- Map stable content IDs to scenes, sprites, and Dialogue Manager resources through a project-owned catalog.
- Show visible connection, validation, reconnecting, and rejection errors. It must not spin on an indefinite loading state.
- In **debug** builds only, a headless `--e2e-slice` driver may open two Nakama sessions and send the same intentions as a player. Release builds refuse that hook.

It must not:

- Decide hits, damage, deaths, loot tables, quest completion, or currency changes.
- Send authoritative position, speed, health, damage, item grants, quest flags, or wallet deltas.
- Write Nakama storage records for inventory, equipment, quests, or currency.
- Persist canonical inventory, equipment, quest, currency, health, or position records under `user://`.
- Reference content by filesystem paths in network messages or persistent records.

## Nakama server responsibilities

The Nakama 3.40.0 TypeScript runtime (`server/`) is the authority for the slice.

It must:

- Authenticate the player and load persistent state on join.
- Host **one** authoritative match for the starter zone.
- Simulate movement collision, combat, cooldowns, enemy behavior, loot, inventory, equipment, quests, and currency.
- Validate every external payload. Reject unknown opcodes, strict unknown fields, malformed JSON, invalid IDs, oversized messages, protocol-version mismatch, and rate-limited floods.
- Reject empty, oversized, and malformed zone-chat payloads in a realtime before hook.
- Apply rewarded actions idempotently using a unique client `requestId`.
- Broadcast snapshots and support full-state resynchronization.
- Persist transactions immediately and position checkpoints periodically.
- Persist position on graceful match leave and match terminate.
- Keep a 5-second reconnect grace in match memory so a returning presence can restore live pose and health without appearing as a ghost.
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

- Module name `starter_zone`, label `zone.starter`, 10 Hz, maximum 8 players.
- Players join that match after authentication and character bootstrap (single character, no slots) via `find_or_create_starter_zone`.
- The match owns live positions, collision, combatants, ground loot, in-memory cooldowns, live quest logs, live inventories, live equipment, and live wallet gold loaded from storage. This phase also checkpoints position, removes disconnected ghosts, restores persistent character state after rejoin or match restart, and reconnects the client with session refresh.
- The client never hosts a second simulation of those values.
- An empty match shuts down after 30 seconds. Reconnect re-enters the shared starter-zone match with loaded persistent state plus last checkpointed position. Health is not persisted: after grace expiry or a new match, the player joins at full `player.base.maxHealth`. Ground loot, slime AI, and cooldowns reset with the match.

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

| Adapter | Wraps | Owns |
| --- | --- | --- |
| `AppState` | none | Non-authoritative client/session flags and shell signals. Never canonical game data. |
| `ContentRegistry` | generated `client/content/bundle.json` plus `client/content/visual_map.json` | Schema version check, content hash, lookup by stable ID, visual ID → local texture/fallback |
| `NetworkService` | Nakama Godot SDK 3.4.0 | Device auth, in-memory session cache, refresh, reauth, realtime socket, bounded reconnect backoff, logout/cancel, `character_bootstrap`, `find_or_create_starter_zone`, match join/leave/rejoin, `INPUT`, `INTERACT`, `ATTACK`, `PICKUP`, `EQUIP`, `QUEST_ACCEPT`, `QUEST_TURN_IN`, `RESYNC_REQUEST`, starter-zone room chat join/leave/send. Socket match/chat/closed signals are connected once. |
| `GameService` | the autoloads above | Boot, login, character bootstrap, starter-zone join. Not a gameplay authority. |
| `SceneRouter` | Godot scene tree | Transitions among boot, login, character, and world |
| `EntityRegistry` / `ZoneView` / `WorldHud` | none | Presentation of authoritative `FULL_STATE`/`SNAPSHOT`. Local movement is predicted and reconciled; all remote entities interpolate from one snapshot buffer keyed `kind:id`. The HUD journal mirrors `QuestService`. The HUD inventory list mirrors `InventoryService`. The HUD main-hand slot and attack label mirror `EquipmentService`. The HUD gold label mirrors `WalletService`. Health, death, and respawn copy server vitals. Not a gameplay authority. |
| `ChatPanel` / `ZoneChat` | none | Presentation of the starter-zone room channel. History is a `Label` (no BBCode). Not a gameplay authority. |
| `QuestService` | none | In-memory mirror of server quest records from `FULL_STATE` / `QUEST_STATE`. Accept sends `QUEST_ACCEPT` only. Turn-in sends `QUEST_TURN_IN` with `questId`, `npcId`, and `requestId`. Not a gameplay authority. Do not use QuestSystem. |
| `AttackIntent` / `CombatFeedback` | none | Nearby enemy pick and floating damage numbers. Attack sends `targetId` + `requestId` only. Not a gameplay authority. |
| `InventoryService` | GLoot 3.0.2 | Client-side mirror of canonical server inventory. Rebuilds from `FULL_STATE` / `INVENTORY_STATE`. UI mutations are disabled or reverted. Pickup sends `lootId` + `requestId` only. Not a gameplay authority. |
| `EquipmentService` | GLoot 3.0.2 `ItemSlot` | Client-side mirror of canonical server equipment and derived attack. Rebuilds from `FULL_STATE` / `EQUIPMENT_STATE`. Equip sends `instanceId` + `slot` + `requestId` only. Unequip omits `instanceId`. Not a gameplay authority. |
| `WalletService` | none | Client-side mirror of Nakama wallet gold from `FULL_STATE` / `WALLET_STATE`. Never sends gold or currency deltas. Not a gameplay authority. |
| `PickupIntent` | none | Nearby loot pick for usability. Server range, capacity, and grants are authoritative. |
| `DialoguePresenter` / `DialogueCatalog` | Dialogue Manager 3.10.5 | Opens elder dialogue only after a matching `INTERACTION_RESULT`. Local `.dialogue` text; quest mutations go through `QuestService`. |
| `Test runner scripts` | GdUnit4 6.2.0 | Client unit/scene tests |
| `SliceJourney` / `SliceSession` | Nakama Godot SDK via `NakamaNetworkBackend` | Debug-only headless two-identity journey (`--e2e-slice`). Sends the same intentions as the graphical client. Unavailable in release builds. Not a gameplay authority. |

Do not call addon APIs from feature scenes except through these adapters. Do not edit files under `client/addons/`. See [THIRD_PARTY.md](THIRD_PARTY.md).

Shell signals live on `AppState`: `loading_started`, `loading_completed`, `recoverable_error`, `fatal_compatibility_error`, `content_loaded`, `scene_changed`, `user_authenticated`, `logged_out`, `character_loaded`, `zone_state_updated`, `reconnecting_changed`. After a fatal content or protocol error the client must not enter login, character, or world. Character requires a successful sign-in; world also requires a bootstrapped character and a valid `FULL_STATE`. Reconnect shows a cancelable overlay and does not spin indefinitely.

## Shared content generation

Authoritative content lives in `content/`:

- `content/schemas/` — JSON Schema contracts.
- `content/source/` — human-authored documents keyed by stable IDs (`zone.starter`, `item.training_sword`).
- `tools/content-build/` — generator that emits `server/src/generated/content.ts` and `client/content/bundle.json`.

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
- Player health (full on join after grace expiry or a new match)
- Enemy aggro unless a later accepted phase persists it (the slice does not)
- Cooldown remaining time, reconstructed from server timestamps after resync
- Unacked movement intentions
- Ground loot entities (slime gel drops expire after 30 seconds and are not stored)

Transactions that grant items or currency persist immediately with `nk.multiUpdate` when storage and wallet must change together. Inventory, equipment, and quest writes happen on those transactions, not every tick. Positions persist every **5 seconds** if they changed, on graceful leave, and on match terminate. A disconnected presence is removed from snapshots immediately (no ghost). Live pose, health, and in-match request ids are kept for **5 seconds** of reconnect grace, then discarded. Abandoned `requestId` maps are pruned after **10 minutes**.

## Developer scripts

PowerShell and bash variants live in `scripts/`: `setup`, `dev-up`, `dev-down`, `server-build`, `run-client`, `run-two-clients`, `test-client`, `test-server`, `test-content`, `test-e2e`, and `test-all`. Each command must exit nonzero when a required step fails. `scripts/test-all` is the clean-setup gate (dependencies, matching content hashes, server tests, client GdUnit, then the debug-only two-identity journey). Graphical Alice/Bob windows are `scripts/run-two-clients`. Local Nakama data is kept across `dev-down`; wipe it only with `scripts/backend-volume-destroy`.
