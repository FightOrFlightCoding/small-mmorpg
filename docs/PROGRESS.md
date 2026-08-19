# Progress

Last accepted phase: **Account lifecycle audit and Nakama compatibility (ACCT-01)**.

Current phase: none.

The Prompt 18 vertical slice remains accepted. Foundation v1 (Prompt 35) remains accepted. Foundation v1 scope is locked in [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md). Do not implement later account-lifecycle features until a later ACCT phase names them.

## Phase 0 acceptance (2026-08-15)

All required directories and documents exist. Internal links among `docs/` and `AGENTS.md` are consistent. The server is documented as the only authority for simulation and rewards. Dependency versions are pinned in [DEPENDENCIES.md](DEPENDENCIES.md). Slice completion is testable via VS-T* and VS-M* in [VERTICAL_SLICE.md](VERTICAL_SLICE.md). No gameplay or networking implementation is present.

## Godot package compatibility spike acceptance (2026-08-15)

Godot 4.7.1 (`4.7.1.stable.official.a13da4feb`) imported `client/` without parser errors. Nakama 3.4.0, GLoot 3.0.2, Dialogue Manager 3.10.5, and GdUnit4 6.2.0 load from unmodified `client/addons/` trees. The compatibility scene printed `COMPATIBILITY_OK` and exited 0 in headless mode. GdUnit4 ran `res://tests/compatibility/compatibility_test.gd` with 4/4 passed. Ledger fields are in [DEPENDENCIES.md](DEPENDENCIES.md) and [THIRD_PARTY.md](THIRD_PARTY.md). No gameplay scenes were added.

Reproduction: `powershell -File scripts/run-client-compatibility.ps1`

## Local Nakama and PostgreSQL infrastructure acceptance (2026-08-15)

`npm ci`, `npm run typecheck`, `npm test` (7/7), and `npm run build` succeeded in `server/`. Docker Compose started PostgreSQL `16.15-alpine` and Nakama `3.40.0`. Nakama reported healthy. The JS runtime loaded `build/index.js` and registered `vibecode_health`. The RPC returned `{"ok":true,"service":"vibecode-server","protocol_version":1,"content_version":"uninitialized"}`. `docker compose down` kept named volume `vibecode_postgres_data`; a subsequent up applied 0 migrations and still had 20 public tables. Destroying that volume is `scripts/backend-volume-destroy.ps1` only. No authentication or match code was added.

Reproduction:

```powershell
Set-Location server
npm ci
npm run typecheck
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
```

## Shared content database and build pipeline acceptance (2026-08-15)

`tools/content-build` `npm ci`, typecheck, and tests succeeded (9/9): valid source, duplicate IDs, broken references, invalid ranges, unknown equipment slots, duplicate quest rewards, deterministic generation, matching client/server hashes, and no absolute paths in generated files. Regenerating twice produced byte-identical `server/src/generated/content.ts` and `client/content/bundle.json` with hash `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. Server `npm run typecheck`, `npm test` (8/8), and `npm run build` succeeded. The Rollup bundle embeds the catalog (not source JSON). `vibecode_health` now returns that hash as `content_version`. No gameplay logic was added.

Reproduction:

```powershell
powershell -File scripts/content-test.ps1
powershell -File scripts/content-build.ps1
Set-Location server
npm test
npm run build
```

## Godot application shell acceptance (2026-08-15)

Godot 4.7.1 imported `client/` and ran `res://scenes/boot/boot.tscn` headless. Boot loaded `res://content/bundle.json`, validated `schemaVersion` 1, and reached the login scene (`SHELL_LOGIN`, exit 0). All required scenes instantiated without parser errors: boot, login, character, world, error dialog, loading overlay. Autoloads `AppState`, `ContentRegistry`, `NetworkService`, `GameService`, and `SceneRouter` are registered. `NetworkService` does not create a Nakama client or open a socket. Missing, malformed, and incompatible bundles are fatal and stay on boot. GdUnit4 ran `res://tests` with 16/16 passed (content lookup, missing ID, content hash, scene routing, error-state transitions, scene instantiate, plus the prior compatibility suite). No canonical game state is written to `user://`.

Reproduction: `powershell -File scripts/run-client-shell.ps1`

## Authentication and one-character bootstrap acceptance (2026-08-15)

Server `npm run typecheck`, `npm test` (18/18), and `npm run build` succeeded. Domain tests cover unauthenticated `character_bootstrap`, valid creation, repeated creation, invalid names, stat injection, existing-character retrieval, distinct Alice/Bob records, and `permissionWrite: 0` storage writes. The RPC is registered as `character_bootstrap`. No match module was added.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 29/29 passed: authentication state transitions, session-expired reauth and visible failure, character-created and character-existing paths, visible network errors, logout, development device IDs, plus prior shell and compatibility suites. `NetworkService` creates a Nakama client, authenticates by device, caches the session in memory, refreshes, reauthenticates, opens a realtime socket, and logs out. Tokens are not logged and are not written to `user://`. Continue on the character scene enters the temporary world screen and does not join a match.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack with `scripts/backend-up.ps1`, then launch the Godot client with `-- --dev-user=alice` or `-- --dev-user=bob`.

## Network protocol and authoritative zone skeleton acceptance (2026-08-15)

Server `npm run typecheck`, `npm test` (44/44), and `npm run build` succeeded. Domain tests cover opcode allocation, malformed JSON, unknown opcodes, unknown fields, protocol and content mismatch, required `requestId` on reward opcodes, stat injection, oversized payloads, Alice/Bob in one `FULL_STATE`, join rejection, resync, ignored `INPUT` (no movement), malformed payloads that do not crash the match, empty-match shutdown after 30s at 10 Hz, and canonical match-id selection for concurrent `find_or_create_starter_zone`.

The runtime registers match module `starter_zone` (label `zone.starter`, tick 10 Hz, max 8 players) and authenticated RPC `find_or_create_starter_zone`. Character storage is loaded on join only. The tick loop does not read storage.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 39/39 passed: matching client opcodes, `FULL_STATE` parse/reject, world entry only after valid full state, fatal protocol/content mismatch, resync, plus prior auth, shell, and compatibility suites. Continue calls `find_or_create_starter_zone`, joins the returned match, and enters the world only after a valid `FULL_STATE`. There is no gameplay movement.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack with `scripts/backend-up.ps1`, then launch two Godot clients with `-- --dev-user=alice` and `-- --dev-user=bob`. Both should join the same starter-zone match and see each other in the presence list.

## Content-driven starter-zone rendering acceptance (2026-08-15)

Kenney RPG Base (CC0) was installed from https://kenney.nl/assets/rpg-base into `client/assets/third_party/kenney_rpg_base/` (zip SHA-256 `49759ab087fdc28d8357010e0f2a17d1c9db61c8fe9b320da965acdfbc298ef5`). License is `license.txt`. Client visual IDs in `client/content/visual_map.json` map to those textures; gameplay scripts do not hard-code Kenney paths. The pack has no adventurer sprite, so `visual.player` uses a labeled primitive fallback.

The world scene renders zone bounds, a tiled floor, collision AABBs, the player spawn, Elder, green slime, local and remote players, and a camera that follows the local avatar. `EntityRegistry` creates/updates/removes by server ID, distinguishes the local player, rejects unknown kinds, and does not duplicate on repeated `FULL_STATE`. Missing visual IDs show a magenta `MISSING` marker instead of crashing.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 48/48 passed, including entity-registry and world-render suites. There is still no movement or combat.

Reproduction: `powershell -File scripts/run-client-shell.ps1`

## Server-authoritative movement acceptance (2026-08-15)

`INPUT` now carries `{ protocolVersion, seq, axisX, axisY }` only. The match validates finite numbers, clamps axes, normalizes diagonals, applies `player.base` move speed at 10 Hz, resolves `zone.starter` walkable bounds and collision AABBs, ignores stale sequence numbers, and broadcasts `SNAPSHOT` at 10 Hz with entity positions and `lastProcessedSeq`. Client-supplied position, speed, or dt is rejected. Dead and disconnected players do not move.

The client sends normalized WASD/arrow intent at 10 Hz, snaps the local avatar to server poses, interpolates remote players between snapshots, and shows a visible `snapshot_timeout` after 2 seconds without a snapshot. There is no local prediction, input replay, or combat.

Server `npm test` 55/55, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 53/53 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

## Local prediction and reconciliation acceptance (2026-08-15)

The client predicts local movement with the same speed, dt, bounds, and AABB collision as the server. Unacked `INPUT` commands are stored, dropped when `lastProcessedSeq` advances, and replayed from the authoritative pose. Display error at or below 0.5 px is left alone; error up to 24 px is blended; larger error snaps. Remote players render one snapshot tick behind from a short buffer, without extrapolation. After 2 seconds without a snapshot the remotes freeze and the HUD shows a degraded connection. A net debug overlay (ping, tick, sent/ack seq, prediction error, buffer depth, protocol version, content-hash prefix) is shown only in debug builds.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 61/61 passed. No combat or interaction prediction was added. Server tests were not required this phase (authority unchanged).

## Starter-zone room chat acceptance (2026-08-15)

After a valid `FULL_STATE`, the client joins Nakama room `zone.starter` (persistence false) and leaves on logout. Join failure is recoverable and visible; the world still opens. Channel message and presence signals are connected once. Chat history is a `Label` (50 lines) with sender name and timestamp. Enter focuses the input; Escape unfocuses; focused input does not move the avatar. User markup is shown as text. Empty and >200 character bodies are rejected by a stateless `ChannelMessageSend` before hook; only `{ "message": string }` is allowed. Direct-message and group joins are rejected. There are no parties, private messages, or moderation tools.

Server `npm test` 62/62, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 76/76 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: two clients with `-- --dev-user=alice` and `-- --dev-user=bob`. Each can send a zone chat line the other receives. Restart Nakama after this build so the chat before hooks load.

## NPC interaction, dialogue, and quest acceptance (2026-08-16)

Press **E** near `npc.elder`. The client picks the nearest NPC for usability, then sends `INTERACT` with `targetId` and `requestId`. The match validates NPC existence, Euclidean distance from **server** poses against `player.base.interactionRange` (48), and rejects dead players. Spawn is out of range of the elder; walking away and sending a fabricated interact is `out_of_range`. `DialoguePresenter` opens the elder balloon only after a matching `INTERACTION_RESULT` `ok`.

Elder dialogue (greeting, explanation, accept/decline, in-progress, ready-to-turn-in, completed) is local `client/content/dialogue/npc.elder.dialogue`. Accept sends `QUEST_ACCEPT` through `QuestService.request_accept` and does not mutate the journal. QuestSystem is not used. The HUD journal shows title, state, objective, current/required counts, and turn-in NPC from server `QUEST_STATE` / `FULL_STATE`.

The server validates `quest.slime_problem`, elder range, and creates accepted progress once (`current` 0 / `required` 1). Duplicate `requestId` is idempotent; a later accept returns `already_accepted`. Unknown quest IDs are `invalid_id`. Client `status` / `questComplete` fields are rejected. Progress persists at collection `player`, key `quests`, `permissionWrite: 0`, loaded on join so relog restores the accepted quest. Turn-in, loot, and combat are not in this phase.

Server `npm test` 74/74, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 85/85 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk to the elder (spawn is too far), press E, accept **Slime Problem**. The journal should show the accepted quest. Relog should restore it. Restart Nakama after this build so the match module loads.

## Authoritative enemy AI and combat (2026-08-16)

One shared green slime is simulated in the starter-zone match. The AI is a 10 Hz state machine (`idle`, `chasing`, `attacking`, `returning`, `dead`) using `enemy.green_slime` aggro, leash, speed, damage, cooldown, and respawn. The Godot client does not run enemy AI. `ATTACK` sends `targetId` and `requestId` only; the server applies `player.base.attack` after alive/target/range/cooldown checks. Duplicate `requestId` does not double-hit. Client `damage` is rejected. `SNAPSHOT` includes slime pose, health, `alive`, and `state`. `COMBAT_EVENT` carries hits, death, and respawn for floating numbers. Player death stops movement and attacks, then respawns at `zone.starter.playerSpawn` after 3 seconds with full health. The slime respawns at its spawn after 10 seconds. No loot is created.

Server `npm test` 87/87, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 89/89 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk east to the slime, press **Space** to attack. Both Alice and Bob should see the same slime health. Dying shows **Defeated. Respawning...** then return to spawn. Restart Nakama after this build so the combat runtime loads.

## Loot and server-owned inventory (2026-08-16)

Match init copies `content.enemies` through `enemyDefinitionsFromContent`, including `loot`. Slime death creates one unique ground loot entity with one `item.slime_gel` at the death pose. It is broadcast on `SNAPSHOT`, expires after 30 seconds, and is never persisted. Press **F** to send `PICKUP` `{ lootId, requestId }`. The match validates alive, existence, `pickupRange` 40, capacity, item definition, and that the `requestId` has not already succeeded. The first valid pickup wins, persists inventory (`player`/`inventory`, `permissionWrite: 0`), sends `INVENTORY_STATE`, and removes the loot. Duplicate successful `requestId`s do not grant again. Existing accounts without an inventory record receive one `item.training_sword` and capacity 20 once. `InventoryService` rebuilds GLoot from canonical server items; local GLoot mutations are reverted. `client/addons/` is unmodified.

Server `npm test` 104/104, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 96/96 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, kill the slime, press **F** on the gel. The HUD inventory list should show the training sword plus slime gel. Relog should restore inventory. A second client cannot pick up the same drop. Restart Nakama after this build so the inventory runtime loads.

## Equipment and authoritative derived stats (2026-08-16)

The starter-zone match owns one `main_hand` slot stored as an item-instance ID (`player`/`equipment`, `permissionWrite: 0`). `EQUIP` is `{ instanceId?, slot, requestId }` with `slot` `main_hand`. The match checks the player is alive, owns the instance, the item is equippable into that slot, and the `requestId` has not already succeeded. Omit `instanceId` to unequip. Duplicate successful `requestId` replays `ok` without mutating. `item.slime_gel` is `not_equippable`. Client `attack` / `attackBonus` are `stat_injection`. Derived attack is `player.base.attack` (4) plus the equipped main-hand `attackBonus` (training sword +2). Combat uses that server value. Recalculation runs after character load, equip, unequip, and inventory repair that clears a missing equipped instance. `FULL_STATE` includes recipient `equipment` and `derived`; successful equip/unequip persist immediately and send `EQUIPMENT_STATE`.

`EquipmentService` wraps a GLoot `ItemSlot` as a display-only mirror. The HUD shows the main-hand slot, Equip/Unequip, and the server attack. Select the training sword and Equip (or double-click). The client does not compute attack. Quest turn-in and wallet grants are not in this phase.

Server `npm test` 118/118, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 101/101 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, select **Training Sword**, click **Equip** (or double-click). Attack should become **6**. **Unequip** restores **4**. Slime gel cannot be equipped. Relog should keep the sword in main hand. Combat uses the server derived attack. Restart Nakama after this build so the equipment runtime loads.

## Quest progress, turn-in, and atomic rewards (2026-08-16)

Picking up slime gel while `quest.slime_problem` is accepted recounts the `acquire_item` objective from inventory (`current` capped at required) and persists `player` / `quests`. The client cannot send objective counts. Elder ready dialogue sends `QUEST_TURN_IN` `{ questId, npcId, requestId }`. The match checks alive, NPC, range, accepted-not-completed, satisfied objective, and required gel. Success runs `nk.multiUpdate` before live apply: consume one gel, grant one unique iron sword, mark the quest completed, credit 25 gold with ledger metadata, and write inventory plus quests at `permissionWrite: 0`. Duplicate `requestId` replays without another grant. A later `requestId` is `already_completed`. Persistence failure leaves state unchanged. `FULL_STATE` includes `wallet.gold`. `WalletService` and the HUD gold label / quest-complete notice update only after server confirmation. The iron sword equips through the existing main-hand path.

Server `npm test` 134/134, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 107/107 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk to the elder, accept **Slime Problem**, kill the slime, press **F** on the gel. The journal should show **1 / 1**. Talk to the elder and choose **Turn in the slime gel**. Inventory should lose the gel, gain **Iron Sword**, gold should be **25**, and the journal should show **Completed**. Relog should keep the completed quest, gold, and iron sword. Equip the iron sword; attack should become **9**. Duplicate turn-in should not grant again. Restart Nakama after this build so the reward runtime loads.

## Persistence, disconnect, and reconnection (2026-08-16)

Inventory, equipment, quest, and reward writes stay on those transactions (`permissionWrite: 0`, `nk.multiUpdate` for turn-in). Position checkpoints write `player` / `character` every **5 seconds** (50 ticks) only when the pose changed, plus immediately on `matchLeave` and `matchTerminate`. Occupied ticks do not persist. Health is not persisted: after grace expiry or a new match, join uses full `player.base.maxHealth`.

A disconnected presence is removed from `SNAPSHOT` / `FULL_STATE` immediately (no ghost). For **5 seconds** the match keeps live pose, health, and in-memory request ids. Same-session resume keeps `lastProcessedSeq`. A new session during grace restores pose and health but resets `lastProcessedSeq` so a fresh client is not stuck until it catches up. After grace, or after the empty match times out and a new match starts, join uses the checkpointed position and full health. Ground loot, slime AI, and cooldowns reset with the match. Abandoned `requestId` maps are pruned after **10 minutes**.

The client checks session validity, refreshes, then reauthenticates with the same device id. Socket close starts bounded exponential backoff (0.5s doubling to 8s, 8 attempts), rejoins `find_or_create_starter_zone`, and waits for a fresh `FULL_STATE`. Match, chat, and socket-closed handlers connect once. A `closed` event is ignored until the client has zone state, while a join is in progress, or if the current socket is still connected. Nested loading completion does not hide the reconnect overlay. The overlay shows **Reconnecting…** with **Cancel**, which logs out. Tokens stay in memory.

Server `npm test` 145/145, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 115/115 passed (0 orphans), including graceful/abrupt leave, grace rejoin, post-restart persistent character state, session refresh/reauth, socket reconnect, duplicate callback prevention, full-state resync, and reconnect UI cancel.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk away from spawn, pick up loot, equip, accept or complete the quest. Close the client and reopen with the same `-- --dev-user=`. Position, inventory, equipment, quest, and gold should restore. A second client should stop seeing the disconnected avatar immediately. Kill the Godot process mid-session: the ghost should disappear and reconnect should not duplicate entities. Restart Nakama after this build so the persistence runtime loads; after restart, character data should survive while slime, loot, and cooldowns reset.

## Security and abuse test pass (2026-08-16)

No gameplay was added. Strict `parseClientMessage` still rejects malformed JSON, missing required fields, unknown fields, unknown opcodes, wrong protocol version, wrong content hash, NaN/Infinity, oversized bodies, fabricated position, client damage/stats, item-instance injection, and quest-progress injection. Match apply still ignores stale `seq`, clamps speed, enforces cooldown and range, blocks dead-player actions, unknown IDs, unowned equip, quest skip, duplicate pickup/reward, and oversized chat.

Per-player `actionRates` live on match state (not TypeScript globals) with a 10-tick window: `INPUT` 20, attack/interact/pickup/equip/quest 8, `RESYNC_REQUEST` 2, plus 24 parsed messages per player per tick. Excess is `rate_limited` and is not applied. Honest 10 Hz movement stays under the cap. Rejected match actions log `match_action rejected user_id=… action=… reason=… tick=…` without tokens or payloads. `docs/SECURITY_MODEL.md` maps each documented attack to a rule, a test, and a safe response. Fixtures: `server/tests/fixtures/malformed_messages.ts`.

Server `npm test` 161/161, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 119/119 passed (0 orphans). Existing movement, combat, loot, equip, quest, and persistence tests still pass.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

## Quick logout rejoin (2026-08-16)

Logout then login during reconnect grace no longer ignores early `INPUT` seqs. A new session resets `lastProcessedSeq`; the client adopts `ack_seq` from `FULL_STATE` / `SNAPSHOT` when the server is ahead. Logout shows **Leaving…** and waits for match leave. Same-session socket resume still keeps sequence.

This is a bugfix on the persistence/reconnect path, not a new gameplay phase.

Server `npm test` 165/165. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 120/120 passed (0 orphans).

## End-to-end automation and final vertical-slice audit acceptance (2026-08-16)

The slice is accepted. `docs/VERTICAL_SLICE.md` VS-T1–VS-T10 and VS-M1–VS-M5 are complete. No post-slice systems were added.

Developer scripts exist as PowerShell and bash pairs: `setup`, `dev-up`, `dev-down`, `server-build`, `run-client`, `run-two-clients`, `test-client`, `test-server`, `test-content`, `test-e2e`, `test-all`. Nested PowerShell steps fail the parent when the child exit code is nonzero.

The debug-only headless driver `res://scenes/e2e/e2e_slice.tscn` (`--e2e-slice`) authenticated Alice and Bob, joined `zone.starter`, proved mutual `FULL_STATE` visibility, moved Alice so Bob saw the new pose, interacted with `npc.elder`, accepted `quest.slime_problem`, killed `enemy.green_slime:0`, picked up `item.slime_gel`, turned in for one `item.iron_sword` and 25 gold, reconnected with that quest/sword/gold intact, and received `already_completed` with no extra reward on a duplicate turn-in. Release builds refuse the hook. The driver sends documented match opcodes only.

### Gate results

`powershell -File scripts/test-all.ps1` exited 0:

| Suite | Result |
| --- | --- |
| Content | 9/9, client/server `contentHash` `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85` |
| Server | 165/165 |
| Client GdUnit | 122/122, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 |

### Definition of done

| ID | Evidence |
| --- | --- |
| VS-T1–VS-T9 | Existing protocol, movement, combat, inventory, quest, security, and client catalog tests still pass. |
| VS-T10 | `scripts/test-e2e` printed every journey step and `E2E_SLICE_OK`. |
| VS-M1 | E2E: both identities appear in `FULL_STATE`; Bob observes Alice’s +x move. Graphical entry is `scripts/run-two-clients.ps1` (Sign in as Alice / Bob). |
| VS-M2 | E2E: one slime kill and one gel pickup. Duplicate `requestId` remains a no-op in server inventory tests. |
| VS-M3 | E2E reconnect still has 25 gold; duplicate turn-in does not credit again. |
| VS-M4 | `auth_flow_test` / `error_state_test` show `network_unreachable` in the dialog. Boot, login, reconnect, and logout overlays complete or fail. |
| VS-M5 | E2E reconnect restores completed quest, iron sword, and gold from Nakama storage/wallet. Position checkpoints remain covered by persistence tests. |

### Audit

- No TODOs in `client/scripts` or `server/src` (addon TODOs only; `client/addons/` was not edited).
- Project client scripts do not write canonical state to `user://`.
- No new packages. Licenses remain in [THIRD_PARTY.md](THIRD_PARTY.md). Kenney RPG Base is CC0.
- No production secrets committed. Local Compose still uses Nakama’s documented insecure defaults.
- Generated content is deterministic; client and server hashes match.
- README covers prerequisites, versions, setup, backend, opening `client/`, Alice/Bob, tests, volume reset, troubleshooting, licenses, and slice limits.

Reproduction:

```powershell
powershell -File scripts/test-all.ps1
```

## Freeze, scope, and audit the Prompt 18 baseline acceptance (2026-08-16)

No gameplay, protocol, storage schema, or dependency change. Catalogs: [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), [FOUNDATION_BASELINE.md](FOUNDATION_BASELINE.md), [MODULE_OWNERSHIP.md](MODULE_OWNERSHIP.md), [STORAGE_CATALOG.md](STORAGE_CATALOG.md), [PROTOCOL_CATALOG.md](PROTOCOL_CATALOG.md), [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md), [FOUNDATION_ROADMAP.md](FOUNDATION_ROADMAP.md), [TEST_CATALOG.md](TEST_CATALOG.md). `tools/foundation-audit/audit.cjs` plus `scripts/test-audit` fail if those catalogs drift.

Prompt 18 gate unchanged: content 9/9, server 165/165, client 122/122 0 orphans, `E2E_SLICE_OK`, hash `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. `FOUNDATION_AUDIT_OK`. Canonical records remain `permissionWrite: 0` and still lack a gameplay `schemaVersion` (documented, not migrated).

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Versioned content, save schemas, and migration kernel acceptance (2026-08-16)

No new player-facing gameplay. Content packages use `content/package.manifest.json`; production generate excludes `developmentOnly`; client and server hashes remain `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. Canonical player records (`character`, `inventory`, `equipment`, `quests`, `wallet_ref`) store `schemaVersion` 1, `createdAt`, and `updatedAt`. Prompt 18 blobs migrate on load without duplicating starter items, quest rewards, or gold. The client cannot send a save version. Commands are in [MIGRATIONS.md](MIGRATIONS.md). Future or corrupted required saves reject with a visible `save_incompatible` error.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash |
| Audit | `FOUNDATION_AUDIT_OK` |
| Server | 181/181 |
| Client GdUnit | 122/122, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |
| Migrate CLI | fixture status/dry-run/apply then verify `already_current` |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
powershell -File scripts/migrate-status.ps1 --fixture server/tests/fixtures/saves/p18-alice.json
```

## Real authentication, character slots, and class selection acceptance (2026-08-16)

Email-and-password registration and login replace the one-character development bootstrap as the supported account path. The client confirms the password on register, caches session tokens (never passwords) in `user://session_cache.json`, refreshes, and shows `session_expired` when email refresh fails. Debug device identities (Alice, Bob, machine unique id) remain only when `OS.is_debug_build()` is true and `DevIdentity.force_release_config` is false. Password-recovery email is out of Foundation v1; operators reset accounts from the Nakama console.

An account may have three live characters. Server RPCs `character_list`, `character_create`, `character_select`, `character_soft_delete`, and `character_restore` own the roster. Names go through one validator; canonical names are reserved on system-owned `names` objects. Concurrent creates of the same canonical name leave one winner. Class definitions are content (`test.class.vanguard`, `test.class.arcanist`); runtime does not hard-code class IDs. Class id is immutable after create. Prompt 18 characters migrate into slot 1, keep gameplay state, receive the `legacyMigrationDefault` class, and do not get a second starter grant. Gold stays the account wallet.

Selecting a character issues a 300-second ticket. Match join metadata is `{ protocolVersion, contentHash, selectionTicket }`. The match checks ownership, existence, not deleted, and that the ticket is unexpired and not previously invalidated, then invalidates it on successful join. A new join after leave must select again. `character_bootstrap` remains a compatibility wrapper.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `e7e2625ff9e92d4905422efeba0c36554d45136578c27f8a6989f06e0ce94721` |
| Audit | `FOUNDATION_AUDIT_OK` (9 storage records, 8 RPCs) |
| Server | 191/191 |
| Client GdUnit | 131/131, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect with a fresh selection ticket) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic statistics, experience, levels, and point allocation acceptance (2026-08-16)

Content defines attributes, resources, derived stats, a shared level curve, and per-class progression documents. Classes reference `progressionId`; runtime looks up stable IDs and roles rather than a fixed enum of the temporary `test.*` examples. The server grants XP only from trusted events (slime kill 10, quest 20, domain admin grant) with `reasonType`, `reasonId`, `eventId`, `characterId`, and `amount`. Duplicate event IDs do not grant twice. One grant can cross multiple levels. At max level leftover XP raises `lifetimeXp` only; no extra points are generated.

`ALLOCATE_ATTRIBUTES` (opcode 9) spends unspent attribute points. Skill points persist and display; ability unlock remains later. The derived-stat pipeline is fixed-order structured components (no script strings). Combat uses those canonical finals when class and progression are present. The client never submits an XP amount; `ProgressionService` may preview an allocate and then replaces it from `FULL_STATE` / `PROGRESSION_STATE`. Prompt 18 characters without a progression blob join at level 1; default-class vanguard with the training sword still deals previous combat numbers.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `92acd85d31c8e291790ef67e27cea10ada40932529885d744b15dc1af6f6c0cf` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 9 client opcodes, 11 server opcodes) |
| Server | 208/208 |
| Client GdUnit | 134/134, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic items, inventory, equipment, currency, and transaction core acceptance (2026-08-16)

Prompt 18 inventory and equipment behavior is unchanged for the slice path. Item definitions are content-driven with categories `weapon`, `armor`, `consumable`, `quest`, `material`, and `miscellaneous`. Non-stackable items use server-generated instance IDs. Inventory supports capacity, stack merge/split/move, destroy, locks, full-inventory errors, and idempotent mutations. Equipment slots are content-defined (temporary tags `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`); class and level requirements are server-enforced. Gold mutations go through `applyGoldMutation` with character id, delta, reason, request id, and resulting balance. Loot, quest rewards, equipment, and item destruction persist through one transaction boundary (`commitTransaction` / `nk.multiUpdate`, `memoryCommitter` in tests). Existing instance IDs, stacks, equipment, and gold migrate without duplication. GLoot remains a presentation mirror. A new ordinary item is added through content without protocol changes. Merchants and trading were not added. Ability unlock remains later.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `5f2d9340dc76b62b169af5f0ec85372394adc0e4be2d8a77b9ae608b42780ceb` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 12 client opcodes, 11 server opcodes) |
| Server | 227/227 |
| Client GdUnit | 138/138, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic ability, casting, cooldown, resource, and effect engine acceptance (2026-08-16)

The Prompt 18 basic attack is `test.ability.basic_melee` (`player.base.basicAbilityId`). Opcode 3 `ATTACK` and opcode 13 `USE_ABILITY` share one server path. The client may send ability id, target entity or point, and `requestId` only. The match owns cast timing, cooldowns, resource spend, and effect results. Hostile player targeting returns `pvp_disabled`. Unlocked abilities, hotbar, and optional ranks persist on the progression record (`permissionWrite: 0`); reconnect clears transient casts. Certification abilities (`basic_melee`, `ranged_bolt`, `small_heal`, `power_buff`, `damage_over_time`) exercise direct, periodic, and status handlers. Adding another ordinary ability that uses those handlers is content-only. Merchants, trading, parties, public world, and extra enemy AI were not added.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `7a3006806260ec57ddf338c72dbf5d932786909143acab0abc7b5d9e2e6b024a` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 16 client opcodes, 12 server opcodes) |
| Server | 254/254 |
| Client GdUnit | 142/142, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic combat pipeline, targeting, death, respawn, and XP hooks acceptance (2026-08-17)

Player attacks, enemy attacks, abilities, and periodic effects share one server combat pipeline with structured formulas (no eval). Targeting validates match entity IDs. Death and respawn are server-authoritative (3s auto-respawn or `RELEASE_RESPAWN`; bind if set, else `zone.starter.playerSpawn`). PvP remains impossible. XP grants go through trusted server hooks; clients cannot forge amounts. Prompt 18 combat numbers and the slime-kill e2e path remain. Parties, inns as a full system, extra enemy AI, merchants, and PvP were not added.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `7a3006806260ec57ddf338c72dbf5d932786909143acab0abc7b5d9e2e6b024a` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 18 client opcodes, 12 server opcodes) |
| Server | 276/276 |
| Client GdUnit | 145/145, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic enemies, spawn controllers, AI profiles, loot tables, and bosses acceptance (2026-08-17)

The Prompt 18 slime is a normal enemy definition (`enemy.green_slime`, `test.ai.melee`, `loot.green_slime`, instance `enemy.green_slime:0`). Spawn controllers create, track, respawn in place, ignore duplicate slot respawns, and reset spawn groups. Melee, ranged, and caster AI profiles run as a server state machine; the client only presents `state`. Threat is nearest-plus-damage (heal when configured), with leash/return. Loot tables and XP process each enemy death event once. The two-phase test cave boss enrages, resets on wipe or leash, and is not auto-spawned in the live starter zone. A new ordinary enemy that reuses an existing AI profile is content-only. Caves, parties, merchants, and PvP were not added.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `e25c7589697354405e85712f6b166bdfd202eeb38e08b26d10e26451957dc682` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 18 client opcodes, 12 server opcodes) |
| Server | 301/301 |
| Client GdUnit | 146/146, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic NPC services, dialogue, quests, merchants, and inn acceptance (2026-08-17)

The Prompt 18 elder is a normal NPC with content services (`dialogue`, `quest_offer`, `quest_turn_in`). There are no elder, merchant, or innkeeper classes. `quest.slime_problem` runs on the generic quest engine (stages, reusable objectives, prerequisites). Vendors buy and sell at server prices through the transaction service. Inn/healer rest heals, restores class resources, optionally charges gold, and persists bind on the character record. `CAVE_ENTER` returns `cave_unavailable` and does not transfer the player. Dialogue opens only after server-approved `INTERACTION_RESULT` extras. Adding another ordinary quest that uses existing objective types is content-only. Cave instances, parties, and player trading were not added. Prompt 18 elder/slime positions and the slime-quest complete notice remain.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `5b41c0cdfdf7e6130c4198b098cc88c1e7be512074589b577991f37f34ee3a0d` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 22 client opcodes, 12 server opcodes) |
| Server | 325/325 |
| Client GdUnit | 149/149, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Temporary parties, party chat, group credit, and group loot acceptance (2026-08-17)

Up to five characters can form a server-owned temporary party. Canonical records live in Nakama storage (`party` / `p`, `player` / `party`) with `permissionWrite: 0` and are not a player-save kind. Parties survive a 60 s disconnect grace, then disband when all members stay absent. Party chat is room `party.<partyId>` with membership checks, 200-character Label text, and a 4/2 s send limit. Group kill and quest credit use the match party cache (same match, alive or recently dead, 512 px). XP defaults to `full` per eligible member; solo remains killer-only. Loot policies `personal` and `server_assigned` cannot duplicate a death `eventId`. Clients cannot nominate members or recipients. Cave entry remains `cave_unavailable`. Prompt 18 elder/slime/gel/solo XP behavior is unchanged when not in a party. The e2e elder approach standoff is 24 px so walk arrival stays inside interaction range.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `231a99ccee7209e8e1faf4392e97863f57f73a68d3b3f194343a532d80bb380f` |
| Audit | `FOUNDATION_AUDIT_OK` (12 storage records, 22 client opcodes, 14 server opcodes, 17 rpcs) |
| Server | 343/343 |
| Client GdUnit | 163/163, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Public world, party cave instances, transfers, and reconnection acceptance (2026-08-18)

Players share one discoverable `public_world` match (`zone.starter`). A solo character or a party of up to five can enter one private `party_cave` (`zone.cave`) through the valley portal. Party members receive the same instance and match ids; non-members are denied. `CAVE_ENTER` / `CAVE_EXIT` issue one-time server tickets (25 s TTL). The destination consumes the ticket and sends `FULL_STATE`. Canonical location forbids two live matches. Disconnecting cave players rejoin during a 60 s grace, then fall back to the public world. Cave matches empty-timeout, expire, and terminate without persisting transient enemies. There is no public-world sharding or extra world-directory system. `find_or_create_starter_zone` remains the locator. Prompt 18 elder/slime/gel/solo XP and the e2e slice stay on the public world.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `58134490916197c49e40642465d949fe17350fe7f798edc5857bed947a1ade86` |
| Audit | `FOUNDATION_AUDIT_OK` (17 storage records, 23 client opcodes, 14 server opcodes, 20 rpcs) |
| Server | 370/370 |
| Client GdUnit | 174/174, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Secure direct player trading acceptance (2026-08-18)

Two nearby living players in the same match can invite, offer items and gold, accept a revision, and exchange once. Offers bump `revision` and clear both acceptances. Offered stacks are locked against equip, destroy, vendor sale, consume, stack moves that invalidate quantity, and other trades. Gold is validated at offer and commit and reserved against vendor buy and inn spend. Commit uses `nk.multiUpdate` for both inventories and both wallets, or retries a `committing` snapshot so a crash cannot duplicate items or gold. Duplicate `requestId` replays. Cancel, invite/session timeout, disconnect beyond 5 s, zone transfer, death, and out-of-range leave both players valid. The HUD mirrors invite, two offer panels, gold, revision, acceptances, an offer-changed warning, cancel, and completion/error without predicting ownership. Mail, auction houses, and offline trade were not added. Content hash is unchanged.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `58134490916197c49e40642465d949fe17350fe7f798edc5857bed947a1ade86` |
| Audit | `FOUNDATION_AUDIT_OK` (20 storage records, 31 client opcodes, 15 server opcodes, 20 rpcs) |
| Server | 399/399 |
| Client GdUnit | 178/178, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Complete functional UI, settings, and asset contracts acceptance (2026-08-18)

The client shell covers registration, login, character list/create/class select, loading/reconnect, the main HUD (health/resources, target, hotbar, cast bar, status effects, stats, attributes, skills, inventory, equipment, journal, dialogue, merchant, inn, party, zone/party chat, trade, cave, death/respawn, settings, logout, errors). `WindowManager`, `HudController`, `TooltipService`, `DragDropService`, `InputSettingsService`, `AudioSettingsService`, `UiStateService`, and `NotificationService` own presentation only. Local settings persist without credentials. Visual/audio sets use stable IDs in `client/content/asset_manifest.json` (4-dir vs 8-dir is `directionCount`). Missing IDs warn, fall back, and do not crash. No final art. Content hash is unchanged.

| Gate | Result |
| --- | --- |
| Content | unchanged hash `58134490916197c49e40642465d949fe17350fe7f798edc5857bed947a1ade86` |
| Audit | `FOUNDATION_AUDIT_OK` (20 storage records, 31 client opcodes, 15 server opcodes, 20 rpcs) |
| Client GdUnit | 190/190, 0 orphans, `SHELL_LOGIN` |

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-client.ps1
```

## Content production workflow, systems lab, and developer/GM tools acceptance (2026-08-19)

One developer can author Foundation content through `scripts/content.ps1` (`validate`, `build`, `diff`, `references`, `unused`, `new <type>`, `copy`, `migrate`, `package`, optional CSV). Templates are schema-valid starters without generated balance or prose. Validation covers duplicate IDs, missing references, cyclic prerequisites, impossible quest stages, missing quest NPCs and enemy abilities, invalid loot/equipment/class/level-curve data, missing assets, development-content leakage, orphans, and unsupported schema versions. `test.zone.systems_lab` is `developmentOnly` and is omitted from the production payload unless `--include-dev`. A content-only proof chain (`item.proof_token`, `enemy.proof_critter`, `loot.proof_critter`, `npc.proof_giver`, `quest.proof_errand`) is in production; elder stays at 160,320 and slime at 960,400. `gm_command` is server-allowlisted (default disabled) and audited; the debug GM panel is not authority. No RPG database plugin. Protocol version and `SAVE_SCHEMA_VERSION` stay 1. Guide: [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md).

| Gate | Result |
| --- | --- |
| Content | 23/23, matching hash `985e5073b1e51f52205f73f85c65982f63454ed87ca4142765fd17a97692b7bc` |
| Audit | `FOUNDATION_AUDIT_OK` (24 storage records, 31 client opcodes, 15 server opcodes, 21 rpcs) |
| Server | 405/405 |
| Client GdUnit | 193/193, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Environments, version compatibility, deployment, backups, and recovery acceptance (2026-08-19)

Local, `automated_test`, staging, and production policies are distinct (`infra/environments/*.json` plus compiled presets). Secrets stay in gitignored env files; committed examples use `REPLACE_ME`. Login RPC `session_handshake` and match join metadata carry `clientVersion`. Incompatible clients get `client_too_old`, `client_too_new`, `protocol_mismatch`, `content_mismatch`, `unsupported_save_version` and do not enter gameplay. Maintenance rejects new joins, keeps GM/ops login, warns before `shutdownAt`, and blocks ordinary transactions with `migration_required`. Ops counters use lexical storage so Nakama’s JS VM can increment them. A local Postgres dump restored into `nakama_restore_drill` matched 20 public tables. Rollback and recovery procedures are in [RECOVERY.md](RECOVERY.md). Protocol version and `SAVE_SCHEMA_VERSION` stay 1. Content hash is unchanged. Prompt 18 village/slime stay frozen.

| Gate | Result |
| --- | --- |
| Content | 23/23, matching hash `985e5073b1e51f52205f73f85c65982f63454ed87ca4142765fd17a97692b7bc` |
| Audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 rpcs) |
| Server | 419/419 |
| Client GdUnit | 200/200, 0 orphans, `SHELL_LOGIN` |
| Backup drill | dump local `nakama` → restore `nakama_restore_drill` → 20 public tables |
| Live backend | `session_handshake` + `find_or_create_starter_zone` (Alice/Bob) |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-backup.ps1
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-e2e.ps1
```

Release export: `powershell -File scripts/export-client-release.ps1` (requires Godot 4.7.1 Windows export templates). Docker image: `powershell -File scripts/docker-build.ps1` or `scripts/backend-up.ps1`. Guides: [ENVIRONMENTS.md](ENVIRONMENTS.md), [DEPLOYMENT.md](DEPLOYMENT.md), [RECOVERY.md](RECOVERY.md).

## Security, abuse, failure, load, and soak certification acceptance (2026-08-19)

No gameplay was added. Protocol version and `SAVE_SCHEMA_VERSION` stay 1. Content hash is unchanged. Public-world cap stays 8; the capacity scenario simulates 20 characters with match extras. Cave cap stays 5. Prompt 18 village/slime poses stay frozen.

Every listed attack has a seven-field control in [SECURITY_MODEL.md](SECURITY_MODEL.md) and `server/src/domain/security_catalog.ts`. Match rate buckets are split (inventory, equip, quest, vendor, cave, trade). Session rates for auth, chat, and mutating party RPCs use a lexical replace-whole-map engine. Deterministic fuzz fixtures do not crash the match or mutate gold/items. Headless `--cert-five` bots use ordinary RPCs and opcodes. Domain failure coverage includes disconnect, delayed/duplicate messages, cave terminate, stale presence, and trade recovery. Live Nakama/Postgres restart is opt-in (`scripts/test-failure.ps1 -Live`).

| Gate | Result |
| --- | --- |
| Content | 23/23, matching hash `985e5073b1e51f52205f73f85c65982f63454ed87ca4142765fd17a97692b7bc` |
| Audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 rpcs) |
| Server | 440/440 |
| Client GdUnit | 203/203, 0 orphans, `SHELL_LOGIN` |
| Capacity | `reports/capacity.cert.json`: 20 public-world characters + 2×5 cave instances, cave cleanup ok, 0 ghosts |
| Soak | `reports/soak.cert.json`: 200 ticks, 4 bots, 0 errors, gold unchanged, no ghosts/locks/live trades/parties. Manual: `powershell -File scripts/test-soak.ps1 -DurationSec 3600` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 |
| Five-client | `CERT_FIVE_OK` (auth, join, combat, loot, quest, vendor, party, chat, cave, boss, trade, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
powershell -File scripts/test-capacity.ps1
powershell -File scripts/test-soak.ps1
powershell -File scripts/test-cert-journey.ps1
```

## Final content-ready foundation certification acceptance (2026-08-19)

No gameplay systems, opcodes, storage record types, persistence permissions, transaction mechanisms, or world-lifecycle changes were added. Protocol version and `SAVE_SCHEMA_VERSION` stay **1**. Prompt 18 elder **160,320** and slime **960,400** stay frozen. Suggested tag **`foundation-v1`** is not created until the working tree is clean and the user approves.

The content-only mini-pack (`test.class.warden`, `test.ability.cert_strike`, `item.cert_mail`, `enemy.cert_scout`, `loot.cert_scout`, `npc.cert_quartermaster`, `quest.cert_scout`, `vendor.cert_quartermaster`, `spawn.starter.cert_scout`) completes `quest.cert_scout` through existing opcodes. Asset-manifest replacements cover character, enemy, NPC, item icon, ability icon, world tile, and SFX without gameplay-script edits. Existing-save fixtures `p18-alice`, `p20-v1-alice`, `p21-class-alice`, and `current-v1-alice` dry-run to schema 1 with gold **25** and a single completed slime quest.

Headless `--cert-five` (stamp `1787139186964`) used five accounts (three `test.class.vanguard`, two `test.class.arcanist`): shared world, zone and party chat, Slime Problem, combat, loot, vendor buy/sell, inn rest/bind, `item.cert_mail` equip, party of five, one cave, in-cave reconnect, one boss credit (first HP wrap; cave `respawnDelay` is 0), attribute allocate, `test.ability.small_heal` unlock, cave exit, item-and-gold trade, logout, Nakama and Postgres restart, `--cert-five-resume` with persistent quest/gold/item. Prompt 18 `E2E_SLICE_OK` still holds.

| Gate | Result |
| --- | --- |
| Content | 23/23, hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` |
| Audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 rpcs) |
| Server | 447/447, `tsc --noEmit` clean |
| Client GdUnit | 206/206, 0 orphans, `SHELL_LOGIN` |
| Capacity | `reports/capacity.cert.json`: 20 public-world characters + 2×5 cave instances, cave cleanup ok, 0 ghosts |
| Soak | `reports/soak.cert.json`: 200 ticks, 4 bots, 0 errors, gold unchanged, no ghosts/locks/live trades/parties. Manual: `powershell -File scripts/test-soak.ps1 -DurationSec 3600` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 |
| Five-client | `CERT_FIVE_OK` then backend restart then `CERT_FIVE_RESUME_OK` |
| Backup | dump `nakama` → `nakama_restore_drill`, 20 public tables |
| Existing saves | all four fixtures dry-run ok, gold 25, no duplicated slime quest or iron sword |
| Release export | `scripts/export-client-release.ps1` produced `client/exports/windows/small-mmorpg.exe` after `scripts/install-export-templates.ps1` |

Clean checkout commands: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Certificate summary: [FOUNDATION_READY.md](FOUNDATION_READY.md).

Reproduction:

```powershell
powershell -File scripts/setup.ps1
powershell -File scripts/content-validate.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/server-build.ps1
powershell -File scripts/dev-up.ps1
powershell -File scripts/test-all.ps1
```

## Post-certification defect repair (2026-08-19)

Not a new phase. Proof/cert quest turn-in now passes the NPC id (Elder was already correct). Ground loot uses item visuals instead of missing `visual_set.item.*` warnings. Cave death uses cave spawn when the inn bind is in `zone.starter`. Server tests **447/447**. Client GdUnit **206/206**. Godot 4.7.1 Windows templates were installed with `scripts/install-export-templates.ps1`; `scripts/export-client-release.ps1` produced `client/exports/windows/small-mmorpg.exe`. Suggested tag **`foundation-v1`** is still not created until the tree is clean and the user approves.

## Account lifecycle audit and Nakama compatibility acceptance (ACCT-01, 2026-08-19)

Documentation and compatibility proofs only. Player-visible login, character select, world, slots, classes, disconnect grace, and logout UI are unchanged. No second authentication service or character model. No dependency upgrades. No custom SQL on Nakama auth tables.

Catalogs live under [docs/account/](account/ACCOUNT_ARCHITECTURE.md). Live proofs against pinned **Nakama 3.40.0** / **nakama-runtime 1.47.0** are in [docs/account/NAKAMA_COMPATIBILITY_RESULTS.md](account/NAKAMA_COMPATIBILITY_RESULTS.md). Later phases must use those sequences.

Development-gated RPC `acct_compat_probe` and storage index `acct_compat_email_hmac` exist for proofs. The Godot client does not call the probe. Production `developmentToolsEnabled` is false.

| Gate | Result |
| --- | --- |
| Content | 23/23, hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` |
| Audit | `FOUNDATION_AUDIT_OK` (27 storage records, 31 client opcodes, 15 server opcodes, 25 rpcs) |
| Server hermetic | 457 passed, 10 skipped (live suite off), `tsc --noEmit` clean |
| Account live | 10/10 with `ACCT_COMPAT_LIVE=1` (`scripts/test-account-compat.ps1`) |
| Client GdUnit | 220/220, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` (Prompt 18 automated journey) |

Proven: email create / `create=false` / uniqueness; Nakama lowercase vs project canonicalize (plus-tags kept); same-email `linkEmail` password replace; unlink-only-method **403**; email replace via temp device; logout current vs all (empty tokens after the next Unix second); `nk.accountExportId` + console export; recorded `accountDeleteId(id, true)` + email reuse with a new user id; HMAC index lookup with re-read.

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-account-compat.ps1 -SkipDomain
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```


