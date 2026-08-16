# Progress

Last accepted phase: **Persistence, disconnect, and reconnection**.

Current phase: none.

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

A disconnected presence is removed from `SNAPSHOT` / `FULL_STATE` immediately (no ghost). For **5 seconds** the match keeps live pose, health, sequence, and in-memory request ids; a returning session restores them and overlays durable inventory, equipment, quests, and gold from storage. After grace, or after the empty match times out and a new match starts, join uses the checkpointed position and full health. Ground loot, slime AI, and cooldowns reset with the match. Abandoned `requestId` maps are pruned after **10 minutes**.

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


