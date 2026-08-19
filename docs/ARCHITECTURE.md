# Architecture

This document is binding. Implementation phases must not contradict it.

Related: [VERTICAL_SLICE.md](VERTICAL_SLICE.md), [SECURITY_MODEL.md](SECURITY_MODEL.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [CONTENT_MODEL.md](CONTENT_MODEL.md), [MIGRATIONS.md](MIGRATIONS.md), [DEPENDENCIES.md](DEPENDENCIES.md), [THIRD_PARTY.md](THIRD_PARTY.md), [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), [MODULE_OWNERSHIP.md](MODULE_OWNERSHIP.md), [ENVIRONMENTS.md](ENVIRONMENTS.md), [DEPLOYMENT.md](DEPLOYMENT.md), [RECOVERY.md](RECOVERY.md), [account/ACCOUNT_ARCHITECTURE.md](account/ACCOUNT_ARCHITECTURE.md).

## Godot client responsibilities

The Godot 4.7.1 client (`client/`) is a presentation and input device. Its main scene is `res://scenes/boot/boot.tscn`. Boot loads the generated content bundle, then the shell routes to login. It does not persist canonical game state under `user://`.

It may:

- Render the current zone floor, bounds, collision AABBs, spawn marker, and entities from server snapshots plus content IDs (`zone.starter` public world or `zone.cave` party cave).
- Capture local input and send **intentions** (move, attack, interact, loot, equip, destroy, split, move item, dialogue choice).
- Predict local movement presentation using the same speed, dt, and collision rules as the server, then reconcile to `lastProcessedSeq`. After `FULL_STATE` or `SNAPSHOT`, the client adopts `lastProcessedSeq` when the server is ahead so a new world scene does not send stale `INPUT`. Prediction never grants rewards or changes canonical stats.
- Display inventory, equipment, dialogue, quest, and currency **views** from server-owned state.
- Join the starter-zone Nakama room channel after entering `zone.starter`, send chat text, and render received messages as plain text.
- Join `party.<partyId>` when the server reports party membership, send party chat, and render it as a `Label`.
- Map stable content IDs to scenes, sprites, and Dialogue Manager resources through a project-owned catalog. Client visual/audio sets live in `client/content/asset_manifest.json` (not hashed) so 4-dir vs 8-dir art is data, not renderer branches.
- Persist only non-authoritative local settings (keybinds, volume, window mode, UI scale) under `user://client_settings.json`, and optionally a remembered email under `user://remember_email.json`. Never passwords, refresh tokens, tickets, or canonical game records.
- Show visible connection, validation, reconnecting, transfer, and rejection errors. It must not spin on an indefinite loading state.
- In **debug** builds only, a headless `--e2e-slice` driver may open two Nakama sessions and send the same intentions as a player. Release builds refuse that hook.
- In **debug** builds only, show a GM panel that sends `gm_command` RPC intentions with a required reason. The panel does not grant items, gold, XP, or location changes locally.

It must not:

- Decide hits, damage, deaths, loot tables, quest completion, or currency changes.
- Send authoritative position, speed, health, damage, item grants, quest flags, wallet deltas, party member lists, credit/loot recipients, destination match ids, or fabricated transfer tickets.
- Grant GM or administrator authority from a client build flag, debug panel, or local setting.
- Write Nakama storage records for inventory, equipment, quests, or currency.
- Persist canonical inventory, equipment, quest, currency, health, or position records under `user://`.
- Reference content by filesystem paths in network messages or persistent records.

## Nakama server responsibilities

The Nakama 3.40.0 TypeScript runtime (`server/`) is the authority for the slice and Foundation world lifecycle.

It must:

- Load persistent player state when the player joins, migrate older save versions server-side, persist the migrated result once, and reject unsupported future or corrupted required fields without resetting them.
- Host **one** authoritative public-world match (`public_world`, template `zone.starter`) and private `party_cave` matches (`zone.cave`) on the same `starter_zone` module. No public-world sharding.
- Simulate movement collision, combat, cooldowns, enemy behavior, loot, inventory, equipment, quests, currency, temporary parties, group credit, group loot, cave lifecycle, transfer tickets, and direct player trades.
- Authorize developer/GM commands only from a server-owned allowlist (default disabled). Record an audit row for every `gm_command`. A client debug flag is not authority.
- Maintain canonical character location and consume one-time transfer tickets on destination join.
- Validate every external payload. Reject unknown opcodes, strict unknown fields, malformed JSON, invalid IDs, oversized messages, protocol-version mismatch, client-version mismatch, content mismatch, and rate-limited floods.
- Reject new gameplay joins while maintenance `rejectJoins` is on; allow reconnect and administrative access.
- Reject empty, oversized, and malformed zone-chat and party-chat payloads in a realtime before hook.
- Apply rewarded actions idempotently using a unique client `requestId`.
- Broadcast snapshots and support full-state resynchronization.
- Persist transactions immediately and position checkpoints periodically.
- Persist position on graceful match leave and match terminate.
- Keep a 10-second public-world **and cave** link-dead hold after disconnect **detection** so the avatar remains in the world and vulnerable. Party membership grace and cave instance empty timeout remain 60 seconds. The new socket is not rebound during the hold.
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
- Temporary party records and per-character party indexes (`permissionWrite: 0`). Not a player-save kind.
- Wallet/currency balances via Nakama wallet APIs.
- Versioned storage objects so concurrent updates can retry safely.

It does not store:

- Per-tick transform streams.
- Transient match entities that exist only while the starter-zone match is alive, except for periodic position checkpoints and durable transaction results.

No project-defined SQL schema is allowed.

## The authoritative public world and party caves

There is exactly one gameplay match **module**: `starter_zone`. Foundation v1 uses two instance types on that module.

- Public world: label `zone.starter`, type `public_world`, template `zone.starter`, 10 Hz, maximum 8 players. Empty shutdown **30 s**. Link-dead hold **10 s after detection**.
- Party cave: label `party.cave`, type `party_cave`, template `zone.cave`, 10 Hz, maximum 5 players. Empty timeout **60 s**. Entity link-dead hold **10 s**. Party disconnect grace **60 s**.
- Players discover the public world (or a still-running owned cave) after authentication and character select via `find_or_create_starter_zone`. Transfers use a server-issued one-time ticket in join metadata.
- Each match owns live positions, collision, combatants, ground loot, in-memory cooldowns, live quest logs, live inventories, live equipment, and live wallet gold loaded from storage. Position checkpoints, disconnected-ghost removal, persistent restore, and session refresh still apply. Cave matches skip periodic character-position checkpoints so exit returns to the public-world portal pose.
- The client never hosts a second simulation of those values.
- An empty public-world match shuts down after 30 seconds. An empty cave persists ownership/completion for 60 seconds, then terminates. After the 10 s entity despawn, Play requires a new selection ticket; a still-owned cave can be re-entered if the instance has not expired. Health is not persisted: the next join uses full `player.base.maxHealth`. Ground loot, AI, and cooldowns reset with the match and are not persisted across cave destruction.

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
| Canonical location, cave ownership, transfer tickets | Server storage + match |
| Account challenges, email HMAC lookup, recorded delete | Auth gateway + `auth_gateway` RPC |
| Direct player trades | Server match + storage |
| Developer/GM commands | Server allowlist + `gm_command` RPC; audit storage |
| Content definitions | Server-loaded generated content, IDs only |

The client is untrusted. A well-formed intention can still be rejected (invalid target, on cooldown, out of range, unknown ID, duplicate `requestId`).

## Project-owned service adapters

Third-party libraries are implementation details. Game code talks to project-owned services.

| Adapter | Wraps | Owns |
| --- | --- | --- |
| `AppState` | none | Non-authoritative client/session flags and shell signals. Never canonical game data. |
| `ContentRegistry` | generated `client/content/bundle.json` plus `client/content/visual_map.json` and `client/content/asset_manifest.json` | Schema version check, content hash, lookup by stable ID, visual ID → local texture/fallback, visual sets |
| `AccountService` | auth-gateway HTTP | Product register/verify/login/refresh/logout/logout-all, in-memory access and refresh tokens, account-status signals, error-code mapping. Does not own character gameplay. Stay Signed In is not enabled. |
| `NetworkService` | Nakama Godot SDK 3.4.0 | Debug device auth, `import_session` from gateway tokens, device-only `user://` session cache, refresh (email via AccountService, device via SDK), realtime socket, bounded reconnect backoff, logout/cancel, character list/create/select/delete/restore, `character_bootstrap` wrapper, `session_handshake` after login, `find_or_create_starter_zone`, match join with `clientVersion` plus `selectionTicket` or `transferTicket`, leave/rejoin, match opcodes, party RPCs, `gm_command` RPC, starter-zone and party room chat, transfer overlay. Socket match/chat/closed signals are connected once. |
| `GameService` | the autoloads above | Boot, email register/login/verify via AccountService, debug device login, character lifecycle, starter-zone join. Not a gameplay authority. |
| `SceneRouter` | Godot scene tree | Transitions among boot, login, register, verify, server-unavailable, account-disabled, character, and world |
| `EntityRegistry` / `ZoneView` / `WorldHud` | none | Presentation of authoritative `FULL_STATE`/`SNAPSHOT`. Local movement is predicted and reconciled; all remote entities interpolate from one snapshot buffer keyed `kind:id`. The HUD journal mirrors `QuestService`. The HUD inventory list mirrors `InventoryService`. The HUD equipment slots and attack label mirror `EquipmentService`. The HUD gold label mirrors `WalletService`. The HUD progression panel mirrors `ProgressionService`. The HUD hotbar, cast bar, resource hint, and status icons mirror `AbilityService`. The HUD party panel mirrors `PartyService` (members, leader, connection state, vitals, invite/leave/kick/promote, party chat Label). The HUD trade panel mirrors `TradeService` (invite, two offer lists, gold, revision, acceptances, offer-changed warning, cancel, result). Cave objective/boss copy mirrors `FULL_STATE.instance`. Target frame, combat-state label, health, death overlay, and respawn copy server vitals. Settings, inn, and cave panels send intentions only. Not a gameplay authority. |
| `WindowManager` / `HudController` / `UiStateService` / `TooltipService` / `DragDropService` / `NotificationService` | none | Shell and HUD windowing, tooltips, drag preview, toasts. Never canonical game state. |
| `InputSettingsService` / `AudioSettingsService` / `LocalSettingsStore` | none | Local keybinds, volume, window mode, UI scale. `user://client_settings.json` only. Never credentials. |
| `AssetManifest` / `VisualSetMath` | `asset_manifest.json` | Visual/audio set lookup by stable ID; 4-dir vs 8-dir is authored `directionCount`. Missing IDs warn and fall back. |
| `ChatPanel` / `ZoneChat` | none | Presentation of the starter-zone room channel and helpers for party chat payloads. History is a `Label` (no BBCode). Not a gameplay authority. |
| `QuestService` | none | In-memory mirror of server quest records from `FULL_STATE` / `QUEST_STATE`. Accept sends `QUEST_ACCEPT` only. Turn-in sends `QUEST_TURN_IN` with `questId`, `npcId`, and `requestId`. Not a gameplay authority. Do not use QuestSystem. |
| `AttackIntent` / `CombatFeedback` | none | Nearby enemy pick and floating damage numbers. Attack sends `targetId` + `requestId` only. Not a gameplay authority. |
| `InventoryService` | GLoot 3.0.2 | Client-side mirror of canonical server inventory. Rebuilds from `FULL_STATE` / `INVENTORY_STATE`. UI mutations are disabled or reverted. Pickup, destroy, split, and move send intentions only. Not a gameplay authority. |
| `EquipmentService` | GLoot 3.0.2 `ItemSlot` | Client-side mirror of canonical server equipment and derived attack. Rebuilds from `FULL_STATE` / `EQUIPMENT_STATE`. Equip sends `instanceId` + `slot` + `requestId` only. Unequip omits `instanceId`. Slot tags come from content. Not a gameplay authority. |
| `WalletService` | none | Client-side mirror of Nakama wallet gold from `FULL_STATE` / `WALLET_STATE`. Never sends gold or currency deltas. Not a gameplay authority. |
| `ProgressionService` | none | Client-side mirror of server progression from `FULL_STATE` / `PROGRESSION_STATE`. Allocate sends `attributeId` + `amount` + `requestId` only. Never sends XP. Not a gameplay authority. |
| `AbilityService` | none | Client-side mirror of server abilities from `FULL_STATE` / `ABILITY_STATE` / snapshots. Use sends `abilityId` + target + `requestId` only. Never sends damage, healing, range, cooldown, cast time, cost, or duration. Not a gameplay authority. |
| `PickupIntent` | none | Nearby loot pick for usability. Server range, capacity, and grants are authoritative. |
| `DialoguePresenter` / `DialogueCatalog` | Dialogue Manager 3.10.5 | Opens dialogue only after a matching `INTERACTION_RESULT`. Prefers server `dialogueId`. Local `.dialogue` text; quest/vendor/inn/cave mutations go through project services. |
| `VendorService` / `InnService` / `CaveService` | none | Buy/sell/rest/cave-enter/cave-exit intentions after server-approved services. Never send prices, gold, health, bind, destination match ids, or tickets. |
| `PartyService` | none | Client-side mirror of server party state from `FULL_STATE` / `PARTY_STATE` / `PARTY_EVENT`. RPCs send owned `characterId` and `requestId` only. Never sends member lists or credit/loot recipients. Not a gameplay authority. |
| `TradeService` | none | Client-side mirror of server trade state from `TRADE_STATE`. Sends invite/offer/gold/accept/cancel intentions only. Never predicts ownership or gold. Not a gameplay authority. |
| `GmService` | none | Debug-only `gm_command` RPC intention plus required reason. Never grants locally. Not a gameplay authority. |
| `Test runner scripts` | GdUnit4 6.2.0 | Client unit/scene tests |
| `SliceJourney` / `SliceSession` | Nakama Godot SDK via `NakamaNetworkBackend` | Debug-only headless two-identity journey (`--e2e-slice`). Sends the same intentions as the graphical client. Unavailable in release builds. Not a gameplay authority. |
| Auth gateway (`auth-gateway/`) | Fastify 5.6.1, Mailpit, SendGrid | Trusted public boundary for register/verify/login/refresh/logout/reset/email-change/delete. Holds Nakama and mail secrets. Not a gameplay authority. Godot `AccountService` calls versioned `/v1/auth/*` routes. |

Do not call addon APIs from feature scenes except through these adapters. Do not edit files under `client/addons/`. See [THIRD_PARTY.md](THIRD_PARTY.md).

Shell signals live on `AppState`: `loading_started`, `loading_completed`, `recoverable_error`, `fatal_compatibility_error`, `content_loaded`, `scene_changed`, `user_authenticated`, `logged_out`, `character_loaded`, `zone_state_updated`, `reconnecting_changed`, `session_status_changed`. After a fatal content or protocol error the client must not enter login, character, or world. Character requires a successful sign-in; world also requires a bootstrapped character and a valid `FULL_STATE`. Unexpected disconnect restores the socket, returns to Character Select, and does not rebind the match during the ten-second hold.

## Shared content generation

Authoritative content lives in `content/`:

- `content/schemas/` — JSON Schema contracts.
- `content/source/` — human-authored documents keyed by stable IDs (`zone.starter`, `item.training_sword`).
- `tools/content-build/` — project-owned CLI (`validate`, `build`, `diff`, `references`, `unused`, `new`, `copy`, `migrate`, `package`, CSV import/export) that emits `server/src/generated/content.ts` and `client/content/bundle.json`. Authoring examples: [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md).

Generated artifacts must preserve IDs. Network messages and storage records carry IDs only, never `res://` paths. The client catalog is the only place an ID becomes a Godot resource path, and that mapping is local.

## Persistent versus transient state

**Persistent** (load on join, write on transaction or checkpoint):

- Inventory and equipment (`schemaVersion` 1 after Prompt 20; Prompt 18 blobs migrate on load)
- Quest progress
- Currency/wallet (gold amount) plus `player`/`wallet_ref` pointer
- Character progression (level, XP, allocated attributes, unspent points, unlocked abilities, hotbar, optional ranks)
- Position checkpoints
- Nearby trade records and trade audit events (not a player-save kind)
- GM allowlist, recent command ids, per-command signal results, and GM audit events (not a player-save kind; production allowlist defaults to disabled)
- Ops maintenance flag and a metrics snapshot (`ops` collection; not a player-save kind)

**Transient** (match memory only):

- Current interpolation/render pose on the client
- In-flight projectile or swing presentation
- Player health (full on join after link-dead despawn or a new match)
- In-combat flags, last hostile/damage ticks, current targets, death timer (the 10 s link-dead hold keeps them in the match; they are not stored)
- Enemy aggro unless a later accepted phase persists it (the slice does not)
- Cooldown remaining time, reconstructed from server timestamps after resync
- Active casts (interrupted on unexpected disconnect; not persisted)
- Status effects (match-lived unless a later phase persists them)
- Unacked movement intentions
- Ground loot entities (slime gel and other table rolls expire after 30 seconds and are not stored)

Transactions that grant items or currency persist immediately with `nk.multiUpdate` when storage and wallet must change together. Inventory, equipment, quest, and progression writes happen on those transactions, not every tick. Positions persist every **5 seconds** if they changed, on graceful leave, and on match terminate. Unexpected disconnect keeps the entity in snapshots for **10 server seconds after detection** (`linkDead`). The body stays targetable and takes PvE damage; player input is rejected. After despawn, join uses the checkpointed position and `joinHealth`. Abandoned `requestId` maps are pruned after **10 minutes**.

## Developer scripts

PowerShell and bash variants live in `scripts/`: `setup`, `dev-up`, `dev-down`, `server-build`, `server-typecheck`, `run-client`, `run-two-clients`, `test-client`, `headless-client-test`, `test-server`, `test-content`, `test-e2e`, `test-capacity`, `test-soak`, `test-cert-journey`, `test-failure`, `test-all`, `content` / `content-validate` / `content-build`, `migrate-status` / `migrate-dry-run` / `migrate-apply` / `migrate-verify`, `backup-create` / `backup-restore-test` / `test-backup`, `export-client-dev` / `export-client-release`, `docker-build`, `deploy-check`, and `verify-release`. Each command must exit nonzero when a required step fails. `scripts/test-all` is the clean-setup gate. `scripts/verify-release` adds migration fixture apply/verify and the backup restore drill. Graphical Alice/Bob windows are `scripts/run-two-clients`. Local Nakama data is kept across `dev-down`; wipe it only with `scripts/backend-volume-destroy` when the environment allows data reset. Save-schema commands are documented in [MIGRATIONS.md](MIGRATIONS.md). Deploy order and environments: [DEPLOYMENT.md](DEPLOYMENT.md), [ENVIRONMENTS.md](ENVIRONMENTS.md).
