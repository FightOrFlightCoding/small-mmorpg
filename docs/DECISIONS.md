# Decisions

## 2026-08-15 — Phase 0 is contract only

The repository contains documentation and empty layout directories. No Godot project, Nakama runtime, Docker Compose stack, or gameplay code is included in Phase 0.

## 2026-08-15 — Repository path

The working tree is `C:\Users\Eszter\small-mmorpg`. Godot must import `client/` (`client/project.godot`), never the repo root. A previous project at `C:\Users\Eszter\Documents\small-mmorpg` was decommissioned; do not revive it.

## 2026-08-15 — Directory names

`server/` holds the future Nakama TypeScript runtime (not `nakama-runtime/`). `content/source/` holds authored JSON (not `content/data/`).

## 2026-08-15 — Prior scaffolding discarded

An earlier experimental Godot/Nakama tree in this folder was removed so Phase 0 matches the empty-repository contract. Nothing from that tree is authoritative.

## 2026-08-15 — Postgres image tag (deferred, then pinned)

The exact Postgres Docker tag was deferred at Phase 0. The infra phase pinned `postgres:16.15-alpine`. See the later decision in this file.

## 2026-08-15 — nakama-runtime install source

Version 1.47.0 is the Heroic Labs `nakama-common` tag. The npm package name is `nakama-runtime`. Install from Git, not an unpublished npm version number.

## 2026-08-15 — Godot package compatibility spike

`client/` is now a minimal Godot 4.7.1 project used only to prove the pinned addons load. There are still no gameplay scenes, no Nakama server runtime, and no networking implementation.

Official install rules used:

- Nakama 3.4.0 has no `plugin.cfg`. Autoload `res://addons/com.heroiclabs.nakama/Nakama.gd` as `Nakama`.
- GLoot 3.0.2: enable the editor plugin; instantiate `Inventory` in project code.
- Dialogue Manager 3.10.5: enable the plugin and autoload `res://addons/dialogue_manager/dialogue_manager.gd` as `DialogueManager`.
- GdUnit4 6.2.0: enable the plugin; run `res://addons/gdUnit4/bin/GdUnitCmdTool.gd`.

The Nakama 3.4.0 release zip includes `Satori.gd` inside `addons/com.heroiclabs.nakama`. That file is left in place as shipped and is not autoloaded.

Godot 4.7.1 writes `.uid` files for vendored scripts that predate UID sidecars (Nakama 3.4.0, GdUnit4 6.2.0 zipball). Those generated files are gitignored. They are not treated as package source modifications.

## 2026-08-15 — Postgres image tag

Image is `postgres:16.15-alpine`. Host port 5432 is not published; Nakama talks to Postgres on the Compose network. Named volume `vibecode_postgres_data` survives `docker compose down`. `docker compose down -v` / `scripts/backend-volume-destroy.ps1` is the only volume-destroy path. No custom SQL tables.

## 2026-08-15 — TypeScript runtime bundle

Nakama 3.40.0 requires a global `function InitModule` and RPC handlers as named function declarations. The official path is Rollup + Babel `@babel/preset-env` to ES5, `output.format: "cjs"`, and `runtime.js_entrypoint: "build/index.js"`. `registerRpc` IDs are string literals. `registerRtBefore` / `registerRtAfter` must be called with string literals and top-level named function identifiers **inside `InitModule`**. Nakama parses that function's AST and cannot extract hook keys from a helper such as `registerChatHooks(initializer)`. A missing key crash-loops the container (`js realtime registerRtBefore hook function key could not be extracted: not found`). Bundled `server/src` must not use Node `fs`, `process`, `crypto`, or other Node APIs. TypeScript is pinned at 5.8.3. The Docker builder is `node:20.20.2-alpine`. Rollup `treeshake` is disabled so the generated content catalog is not stripped down to the few fields `InitModule` currently reads.

## 2026-08-15 — Local Nakama Console credentials

Console is `http://127.0.0.1:7351`. Username `admin` and password `password` are Nakama's built-in insecure local defaults. They are documented, not stored as project production secrets. Do not commit production console, session, or HTTP keys. `infra/.env` is gitignored for future overrides.

## 2026-08-15 — Local backend is health-only

This phase adds PostgreSQL, Nakama, and RPC `vibecode_health`. Player authentication, storage, and the starter-zone match are not implemented yet.

## 2026-08-15 — Previous Documents small-mmorpg removed

An older Nakama/Docker project lived at `C:\Users\Eszter\Documents\small-mmorpg` and used Compose project name `infra`. It bound host ports 5432 and 7349–7351 and left containers, volumes, and images that collided with this repo.

That tree and its Docker resources were deleted. This repository’s Compose project is `vibecode` only (`vibecode-nakama`, `vibecode-postgres`, volume `vibecode_postgres_data`). Do not start leftover `infra` or `small-mmorpg-*` stacks. If an old bind-mount directory under Documents is locked by Windows, delete it from a container that mounts `C:\Users\Eszter\Documents`.

## 2026-08-15 — Shared content database

Content is authored as one JSON file per ID under `content/source/`, validated by JSON Schema plus semantic checks in `tools/content-build`. There is no RPG database plugin. Visual fields are stable IDs (`visual.*`), not Godot paths.

Generated artifacts are `server/src/generated/content.ts` and `client/content/bundle.json`. They share one SHA-256 content hash computed from canonical JSON. The Nakama runtime imports the TypeScript module; it does not read source JSON at runtime. Node `fs` / `crypto` are allowed only in the build tool.

Slice IDs: `zone.starter`, `npc.elder`, `enemy.green_slime`, `item.training_sword`, `item.slime_gel`, `item.iron_sword`, `quest.slime_problem`, `player.base`. Quest gold is content data only; wallet apply is a later phase. Gameplay simulation is not implemented in this phase.

Ajv 8.17.1 is pinned for schema validation in the tool.

## 2026-08-15 — Content envelope schemaVersion

Generated client and server catalogs include `schemaVersion: 1` beside `contentHash`. The SHA-256 digest is still computed from the gameplay payload only (player, items, npcs, enemies, quests, zones). Changing the envelope version does not rewrite the hash. The Godot client refuses to leave boot if the bundle is absent, malformed, missing `schemaVersion`, or not version 1.

## 2026-08-15 — Godot application shell

The client main scene is `res://scenes/boot/boot.tscn`. Boot loads the generated content bundle, then `SceneRouter` transitions to login. Character and world scenes exist as empty shells; they are not entered in this phase.

Project-owned autoloads, in order: `AppState`, `ContentRegistry`, `NetworkService`, `QuestService`, `InventoryService`, `EquipmentService`, `WalletService`, `GameService`, `SceneRouter`. Then the existing Nakama and Dialogue Manager autoloads. Game code must not call Nakama, GLoot, or Dialogue Manager APIs except through project-owned services.

`NetworkService.authenticate_device` is an interface only. It does not construct `Nakama.create_client`, open a socket, or send HTTP. Sign-in on the login scene reports a recoverable `authentication_not_configured` error.

`AppState` holds only non-authoritative client/session flags (loading, content ready, last error, current scene id). `GameService` orchestrates boot and the future auth call; it is not a gameplay authority. The client does not write canonical inventory, equipment, quest, currency, or position records to `user://`.

Fatal content errors keep the tree on boot and hide the error-dialog dismiss button. `SceneRouter.apply_scene_changes` is true in the running app; GdUnit tests set it false so the runner tree is not replaced.

Headless smoke uses user argument `--quit-after-login`: login prints `SHELL_LOGIN` and exits 0; a fatal boot prints `SHELL_FATAL` and exits 1.

## 2026-08-15 — Authentication and one-character bootstrap

Local development identities use `--dev-user=alice` / `--dev-user=bob`. Those become Nakama device IDs `vibecode-dev-alice` and `vibecode-dev-bob` (10–128 characters, `[a-zA-Z0-9._-]`). Different device IDs produce different Nakama accounts.

When `--dev-user` is omitted, the client uses `vibecode-local-` plus a sanitized `OS.get_unique_id()`. Limitations: it is not a production identity; every launch on the same machine shares one account; another machine or a reinstall can create a different account; if the unique id is empty the client falls back to `vibecode-local-shared`, which is shared by all such clients. Invalid `--dev-user` values show a recoverable error and do not authenticate.

`NetworkService` wraps the Nakama Godot SDK. It creates a client against `127.0.0.1:7350` with Nakama's local server key `defaultkey`, authenticates by device, caches the `NakamaSession` in memory, enables SDK auto-refresh, explicitly refreshes when the session is expired, reauthenticates with the same device id if refresh fails, connects a realtime socket, and logs out. The Nakama logger is set to ERROR so debug socket URLs that include tokens are not printed. Session tokens are not written to `user://`.

RPC `character_bootstrap` requires `ctx.userId`. Collection `player`, key `character`, `permissionRead: 1`, `permissionWrite: 0`. One character per account. Name is optional, 3–16 characters matching `^[A-Za-z][A-Za-z0-9_]{2,15}$`. Client-supplied stats, position, and unknown fields are rejected. Existing records are returned unchanged (idempotent). Base stats always come from `player.base`; spawn comes from `zone.starter.playerSpawn`.

Continue on the character scene calls `find_or_create_starter_zone`, joins the returned match, and opens the world only after a valid `FULL_STATE`.

## 2026-08-15 — Network protocol and authoritative zone skeleton

Protocol version is `1`, shared by `vibecode_health` and match envelopes. JSON keys are camelCase. Client→server match bodies are capped at 2048 bytes. Reward opcodes (`PICKUP`, `QUEST_ACCEPT`, `QUEST_TURN_IN`) require `requestId` matching `^[A-Za-z0-9_-]{8,64}$`.

The starter-zone match module is `starter_zone` with label `zone.starter`, tick rate 10 Hz, and a maximum of 8 players. An empty match shuts down after 30 seconds (300 ticks). Join metadata is `{ protocolVersion, contentHash }` as strings. Character state is loaded in `matchJoin` / `matchJoinAttempt` only; the tick loop does not read storage. `INPUT` is validated and ignored. There is no movement or combat simulation.

`find_or_create_starter_zone` is an authenticated RPC. It prefers a live system-owned storage singleton (`collection` `match`, key `starter_zone`, `permissionRead: 0`, `permissionWrite: 0`), then `matchList` by label, then `matchCreate`. Concurrent creates reconverge on the stored or lexicographically canonical running match id. Extra raced matches remain empty and time out.

The client enters `world` only after parsing a valid `FULL_STATE`. Protocol or content mismatch is a fatal compatibility error. `RESYNC_REQUEST` asks for a fresh `FULL_STATE`. `SNAPSHOT` updates the remote player list on join/leave.

## 2026-08-15 — Content-driven starter-zone rendering

Kenney RPG Base 1.0 was vendored from the official zip on kenney.nl (CC0). Gameplay never stores `res://assets/third_party/...` paths; `ContentRegistry.resolve_visual` reads `client/content/visual_map.json` keyed by `visual.*` IDs from the hashed catalog. That map is client-only and is not part of the content hash.

The pack is tiles and props, not a character sheet. `visual.player` therefore uses a colored primitive. Elder uses a doorway tile (`rpgTile165`), slime `rpgTile160`, floor `rpgTile019`, collisions `rpgTile080`. If a mapped texture is missing, avatars keep a polygon body and show `MISSING`.

World root is `Node2D` with `ZoneView`, `EntityRegistry`, `Camera2D` following the local avatar, and `WorldHud` as a `CanvasLayer`. No movement input is sent.

## 2026-08-15 — Server-authoritative movement

`INPUT` JSON is camelCase `{ protocolVersion, seq, axisX, axisY }`. The conceptual snake_case example is the same fields. The client never sends position, speed, or elapsed time.

The match applies the last accepted intent once per 10 Hz tick using `player.base.moveSpeed` (120) and `dt = 0.1`. Axes are clamped to [-1, 1] then shrunk if longer than 1 so diagonals and extreme axes cannot exceed content speed. Player collision is a 24×24 AABB (half-extent 12, matching the avatar primitive) tested against `walkableBounds` and the zone collision rectangles. Sequence numbers must be finite integers; `seq <= lastProcessedSeq` is ignored. Health `<= 0` or a missing presence produces no movement. `SNAPSHOT` is broadcast every occupied tick (10 Hz) and includes `lastProcessedSeq` on each player.

The local avatar snaps to the authoritative pose. Remote players lerp between snapshots. Missing snapshots for 2 seconds show a recoverable `snapshot_timeout`. There is still no input replay, prediction, or combat. Position checkpoints are not written this phase.

## 2026-08-15 — Local prediction and reconciliation

Movement prediction is presentation-only. `MovementSim` copies server constants (`moveSpeed` 120, `dt` 0.1, half-extent 12, zone AABBs). `MovementReconciler` keeps unacked seq/axis commands, replays them from the server pose, and never sends a client position.

Correction policy: error ≤ 0.5 px is agreement (no visual correction); error ≤ 24 px is smoothed with blend 0.35; larger error snaps. Local presentation integrates `axis * moveSpeed * frameDelta` every render frame so walking is not quantized to the 10 Hz send rate. `INPUT` is still sent at 10 Hz and reconciliation still replays unacked 10 Hz steps from the server pose.

Remote interpolation uses one snapshot buffer (max 8 frames) for every moving entity, keyed `kind:id` (`player:…`, `npc:…`, `enemy:…`, `loot:…`). The buffer clocks with frame delta: estimated tick is `latest + timeSinceLatest / 0.1`, and the render tick is that value minus one snapshot (`INTERP_DELAY_TICKS` = 1.0), clamped to the latest received tick so the client never extrapolates. Sampling a fractional tick lerps between the two surrounding 10 Hz poses, so other players and the shared slime do not teleport every 100 ms. After `SNAPSHOT_TIMEOUT_SEC` (2 s) the buffer freezes and the HUD reports a degraded connection. Occupied snapshots include enemy poses.

`NetDebugOverlay` is visible only when `OS.is_debug_build()` is true. It shows `Engine.get_frames_per_second()`, frame time, and an EMA of input-to-ack RTT. That ping is not ICMP; it jumps with the 10 Hz snapshot clock if shown raw. Release exports hide the overlay. Two editor Play sessions use the embedded Game workspace (Input/2D/3D toolbar) and are much slower than `scripts/run-client-dev.ps1`, which runs the main scene without the editor. Combat is server-only; the client does not predict hits.

## 2026-08-15 — Editor login identities

Godot editor Play does not pass `--dev-user`. The login scene wraps copy in a 640 px column and offers **Sign in as Alice** / **Sign in as Bob**, which use the same device IDs as the CLI flags. **Sign in with this machine** remains the `OS.get_unique_id()` path. Local Nakama at `127.0.0.1:7350` is required before any of those buttons work.

Editor Play does not auto-authenticate. Two Play windows both signing in as Alice are the same Nakama user; the match keys presence by `userId` and a second join is rejected with `already_in_match`. Use Alice in one window and Bob in the other, or `powershell -File scripts/run-client-dev.ps1 -DevUser bob`. Alice/Bob buttons continue into the zone after character bootstrap so two-client setup is one click per window. GdUnit keeps `SceneRouter.apply_scene_changes` false so tests do not auto-join.

The 2D client uses the GL Compatibility renderer. Zone floor and collision overlays are a single repeating `Polygon2D` each (UVs in texture pixels), not tiled `TextureRect`s or oversized `Sprite2D` regions.

Nakama does not hot-reload `server/build/index.js`. A container started against an older bundle keeps only the RPCs it loaded at boot (`vibecode_health` in the first local stack). `scripts/backend-up.ps1` recreates the Nakama container after `npm run build` and `scripts/backend-verify.ps1` refuses a health-only runtime.

`nakama-runtime` is a type-only package and is Rollup-external. Runtime values such as `nkruntime.SystemUserId` are not available inside Goja. System-owned storage uses the literal UUID `00000000-0000-0000-0000-000000000000`.

## 2026-08-15 — Starter-zone room chat

Zone chat uses Nakama room channels, not match opcodes. After a valid `FULL_STATE`, the client joins room `zone.starter` (`ChannelType.Room`, persistence false, hidden false) and leaves on logout. Join and send failures are recoverable and visible. Message and presence socket signals are connected once per backend.

Chat content is `{ "message": string }`. A `ChannelMessageSend` realtime before hook rejects empty bodies, bodies longer than 200 characters, non-object JSON, and extra fields. A `ChannelJoin` before hook allows only room `zone.starter`. The TypeScript hook is stateless (no module-level maps). Client length checks are convenience only. `InitModule` registers those hooks directly; wrapping `registerRtBefore` in another function makes Nakama fail to start.

History is a bounded `Label` (50 lines). Sender names come from the channel username or the zone player list. Timestamps use the Nakama `create_time` hour and minute. Enter focuses the input when it is not focused; Escape releases it; focused input does not move the local avatar. User text is never parsed as BBCode. There are no parties, private messages, or moderation tools.

## 2026-08-16 — NPC interaction and quest acceptance

`INTERACT` requires `{ protocolVersion, targetId, requestId }`. The match looks up the NPC in live zone state, measures Euclidean distance from **server** player and NPC positions against `player.base.interactionRange` (48), and rejects `health <= 0`. Codes: `ok`, `out_of_range`, `invalid_target`, `player_dead`. The client may pick the nearest NPC for usability; `DialoguePresenter` opens the elder balloon only after a matching `INTERACTION_RESULT` `ok`.

Elder lines live in `client/content/dialogue/npc.elder.dialogue` mapped by `client/content/dialogue_map.json` (`dialogue.npc.elder`). That map is client-only and is not part of the content hash. Accept/decline choices are local text. Accept runs `QuestService.request_accept("quest.slime_problem")`, which sends `QUEST_ACCEPT` and does not write the journal.

Quest progress is stored at collection `player`, key `quests`, `permissionRead: 1`, `permissionWrite: 0`. The match loads it on join and writes it when acceptance first succeeds or when a new `requestId` is recorded for an already-accepted quest. Duplicate `requestId` replays `accepted` with no extra write. A second `requestId` returns `already_accepted` and the current log. Unknown quest IDs are `invalid_id`. Client `status` / `questComplete` fields are protocol rejections. Turn-in, loot apply, and combat are not in this phase.

The journal is a `WorldHud` panel (title, state, objective, current/required, turn-in NPC) bound to `QuestService`. Dialogue Manager is not a quest authority. QuestSystem is not used.

## 2026-08-16 — Authoritative enemy AI and combat

One shared `enemy.green_slime:0` lives in the starter-zone match. The server owns spawn, pose, health, alive flag, aggro target, chase, leash, attack cooldown, death, and respawn. The AI is a deterministic 10 Hz state machine: `idle`, `chasing`, `attacking`, `returning`, `dead`. Idle selects the nearest living player inside `aggroRadius` (128). A valid target is followed until it dies or disconnects, or the slime's distance from spawn exceeds `leashRadius` (256), which forces `returning` and ignores aggro until the spawn pose. Attack and move values come from `enemy.green_slime`. There is no Godot AI.

`ATTACK` is `{ protocolVersion, targetId, requestId }`. The match uses `player.base.attack` (4), `attackRange` (40), and `attackCooldown` (0.7s). Client `damage` / `health` fields are protocol rejections. Duplicate `requestId` replays the original `ACTION_RESULT` without applying damage again. Hits, deaths, and respawns broadcast `COMBAT_EVENT`; `SNAPSHOT` includes enemy pose, health, `alive`, and `state` so both clients see the same slime.

Player death stops movement and attacks, broadcasts death, waits **3 seconds** (`PLAYER_RESPAWN_DELAY_SEC`), restores `player.base.maxHealth`, and teleports to `zone.starter.playerSpawn`. Slime death waits `respawnDelay` (10 seconds) then restores health at its spawn. Loot is not created.

The client sends Space (`attack`) against the nearest living enemy for usability, draws health bars and floating numbers from server events, and does not predict combat.

## 2026-08-16 — Loot and server-owned inventory

Canonical inventory is Nakama storage collection `player`, key `inventory`, `permissionRead: 1`, `permissionWrite: 0`. The Godot client never writes that object. An existing account with no inventory record is initialized **once** on starter-zone join with capacity **20 stacks** and one server-generated instance of `item.training_sword`. Duplicate initialization returns the stored record unchanged. Each instance has a server `instanceId` (Nakama `uuidv4` in the adapter; tests inject an ID factory), content `itemId`, `quantity`, and `metadata`. Client `instanceId` / `items` fields are `stat_injection`.

Capacity counts **item stacks**, not total quantity. `item.slime_gel` (`maxStack` 20) stacks into an existing gel instance. A new unstackable stack is rejected with `inventory_full` when 20 stacks are already occupied.

Match init copies enemy loot tables through `enemyDefinitionsFromContent`. Combat stats alone are not enough: omitting `loot` leaves `enemyLootById` empty, so slime death never spawns gel and **F** has nothing to pick up.

Slime death creates one transient ground loot entity containing one `item.slime_gel` at the authoritative death pose. Ground loot lives only in match state, expires after **30 seconds** (`expiresAtTick` = death tick + 300 at 10 Hz), and is never written to storage. `SNAPSHOT` includes public loot (`id`, `itemId`, `quantity`, `x`, `y`, `expiresAtTick`) without instance IDs so both clients see spawn and despawn.

`PICKUP` is `{ protocolVersion, lootId, requestId }`. The match checks the player is alive, the loot exists, Euclidean distance against `player.base.pickupRange` (40), inventory capacity, and that the item definition exists. The first valid pickup removes the loot atomically, adds or stacks the item, persists inventory immediately, sends `INVENTORY_STATE` to the picker, and broadcasts the empty loot list on the next snapshot. A replay of a **successful** `requestId` returns `ok` without granting again. Two pickups of the same entity in one tick: message order, first success, second `invalid_target`.

`InventoryService` is the only GLoot inventory wrapper. GLoot 3.0.2 is a client-side mirror rebuilt from canonical server inventory. Prototypes use shared content IDs. Local GLoot add/remove is reverted. `client/addons/` is unmodified. Pickup input is **F**.

## 2026-08-16 — Equipment and authoritative derived stats

Canonical equipment is Nakama storage collection `player`, key `equipment`, `permissionRead: 1`, `permissionWrite: 0`. The Godot client never writes that object. The only slice slot is `main_hand`, stored as an item-instance ID (empty when unequipped). Missing records start empty. If a stored instance is missing from inventory on join or after inventory changes, the slot is cleared and the record is rewritten.

`EQUIP` is `{ protocolVersion, instanceId?, slot, requestId }`. `slot` must be `main_hand`. A present `instanceId` equips that owned instance; omitting it unequips the slot. The match checks the player is alive, owns the instance, the item definition is equippable, the item permits `main_hand`, and the `requestId` has not already succeeded. Codes: `ok`, `invalid_id`, `unowned`, `not_equippable`, `invalid_slot`, `player_dead`. `item.slime_gel` has no `equipSlot` and is `not_equippable`. Duplicate successful `requestId` replays `ok` without mutating. Client `attack` / `attackBonus` / `itemId` are rejected.

Derived attack is `player.base.attack` (4) plus the equipped main-hand `attackBonus` (training sword +2). Combat uses that server value. It is recalculated after character load, equip, unequip, and inventory changes that affect the equipped instance. `FULL_STATE` includes recipient `equipment` and `derived.attack`. Successful equip/unequip persist immediately and send `EQUIPMENT_STATE`.

`EquipmentService` wraps a GLoot `ItemSlot` as a display-only mirror. The HUD shows the main-hand slot, Equip/Unequip, and the server attack. Double-click or Equip sends the selected instance ID. The client does not compute attack.

## 2026-08-16 — Quest progress, turn-in, and atomic rewards

`quest.slime_problem` objective progress is server-owned. After a successful slime-gel pickup (and after accept if gel is already owned), the match recounts `acquire_item` stacks in inventory and sets `current` to `min(owned, required)`. Client objective counts are rejected. Progress persists at `player` / `quests` with `permissionWrite: 0` and is sent on `QUEST_STATE`.

`QUEST_TURN_IN` is `{ protocolVersion, questId, npcId, requestId }`. The match checks the player is alive, the NPC exists and matches `turnInNpcId`, Euclidean distance against `player.base.interactionRange` (48), the quest is accepted and not completed, objectives are satisfied, and the consume list is present. Codes: `ok`, `out_of_range`, `invalid_target`, `invalid_id`, `incomplete_objective`, `missing_item`, `already_completed`, `inventory_full`, `player_dead`, `persist_failed`. Duplicate successful `requestId` replays `ok` without mutating. A later `requestId` after completion is `already_completed`. Client `gold` / `questComplete` are `stat_injection`.

The reward is one `nk.multiUpdate`: consume one `item.slime_gel`, insert one unique `item.iron_sword` instance, mark the quest completed, credit **25** gold with ledger metadata (`source`, `questId`, `requestId`, consumed/granted item IDs), and write inventory plus quests at `permissionWrite: 0`. Persistence runs before live state is mutated. Failure leaves quest, inventory, and gold unchanged. The iron sword uses the existing `main_hand` equipment path (`attackBonus` 5).

`WalletService` mirrors `FULL_STATE.wallet.gold` and `WALLET_STATE`. Elder ready dialogue sends turn-in; the HUD journal, inventory, gold, and a `quest_complete` notice update only after server confirmation.

## 2026-08-16 — Persistence, disconnect, and reconnection

Inventory, equipment, quest, and wallet writes stay on those transactions (`permissionWrite: 0`, `nk.multiUpdate` for turn-in). Position checkpoints write the existing `player` / `character` object every **5 seconds** (50 ticks) only when the pose changed, plus immediately on `matchLeave` and `matchTerminate`. The tick loop does not read storage and does not write idle positions.

Health is intentionally not persistent. A disconnected presence is removed from `SNAPSHOT` / `FULL_STATE` immediately so other clients do not see a ghost. For **5 seconds** the match keeps live pose, health, and in-memory combat request ids for that userId. Same-session resume also keeps `lastProcessedSeq`; a new session restores pose and health but resets sequence. After grace, or after the empty match times out and a new match starts, join uses the checkpointed position and full `player.base.maxHealth`. Slime AI, ground loot, and cooldowns belong to the new match.

Pickup, equip, and quest `requestId` maps are stamped with the apply tick and pruned after **10 minutes**. Same-session Nakama reconnect keeps the live player. A second live session is still `already_in_match`. Rejoin is allowed when the account still has a live player record but no presence (leave still in flight).

The client checks session validity, refreshes, then reauthenticates with the same device id. Socket close starts bounded exponential backoff (0.5s … 8s, 8 attempts), rejoins the starter zone, and waits for `FULL_STATE`. Match, chat, and socket-closed handlers connect once. A `closed` event is ignored while a join is in progress, before the client has zone state, or if the current socket is still connected (stale close from a replaced socket). Nested loading completion must not hide the reconnect overlay. The world overlay shows **Reconnecting…** with **Cancel**, which logs out. Tokens are not written to `user://`.

Nakama JSON-roundtrips match state between handlers. Empty objects such as `disconnected: {}` and empty `requestId` maps can arrive as `null`. Clone and leave/loop paths treat `null` maps as `{}` so `Object.keys` cannot crash the match on tick 0.

Local Nakama `socket.max_message_size_bytes` is **32768** so `FULL_STATE` with inventory, equipment, quests, and wallet cannot drop the websocket.

## 2026-08-16 — Security and abuse test pass

No gameplay was added. Per-player match-action counters live on `StarterZoneState.actionRates` (cloned with match state, never as TypeScript globals). A 10-tick window allows 20 `INPUT`, 8 attack/interact/pickup/equip/quest actions, and 2 resyncs. The match also parses at most 24 messages per player per tick. Excess is `rate_limited`. Honest 10 Hz movement is unchanged.

Rejected match actions are logged as `match_action rejected user_id=… action=… reason=… tick=…` without tokens, device credentials, or raw payloads. `docs/SECURITY_MODEL.md` maps each documented attack to a validation rule, a test, and a safe response. Malformed-message fixtures live in `server/tests/fixtures/malformed_messages.ts`.

## 2026-08-16 — Quick logout rejoin input sequence

Logout creates a new Nakama session. Rejoin during the 5-second grace previously restored `lastProcessedSeq` from the parked player. A new world scene starts `_input_seq` at 0, so `INPUT` seq 1, 2, … was ignored until it passed the parked seq — the avatar looked stuck or rubber-banded for a few seconds (longer after a long session).

Same-session socket resume still keeps `lastProcessedSeq`. A new session (logout then login, or live resume after leave with a different sessionId) resets `lastProcessedSeq` and movement axes to 0. Pose and health still restore from grace. The client also adopts `ack_seq` from `FULL_STATE` / `SNAPSHOT` when the server is ahead, so a recreated world does not send stale seqs after same-session reconnect.

Logout shows **Leaving…** and waits for match leave before returning to login so the avatar is gone before the next sign-in. There is no extra multi-second logout delay; the sequence reset is what makes immediate rejoin movable.

## 2026-08-16 — End-to-end automation and vertical-slice audit

Developer entry points are `scripts/setup`, `dev-up`, `dev-down`, `server-build`, `run-client`, `run-two-clients`, `test-client`, `test-server`, `test-content`, `test-e2e`, and `test-all`, with PowerShell and bash variants. Commands exit nonzero when a step fails.

The headless journey is `res://scenes/e2e/e2e_slice.tscn` with `--e2e-slice` in a debug Godot build. It creates two `NakamaNetworkBackend` sessions (unique device ids so it does not reuse the graphical Alice/Bob accounts), sends ordinary match opcodes, and asserts peer visibility, movement, elder interact, quest accept, slime kill, gel pickup, turn-in (iron sword + 25 gold), reconnect persistence, and `already_completed` on a second turn-in. Release builds refuse the hook. It does not write `user://` canonical state and does not bypass server validation.

Nested PowerShell wrappers invoke child scripts through `Invoke-RepoScript` and fail when the child exit code is nonzero. Bash variants use `set -euo pipefail`.

## 2026-08-16 — Freeze, scope, and audit the Prompt 18 baseline

No gameplay was added and no dependency was upgraded. Foundation v1 scope is locked in `docs/FOUNDATION_SCOPE.md`. Prompt 18 modules, storage, protocol, tests, and hardcoded IDs are catalogued. `tools/foundation-audit/audit.cjs` fails the gate if those catalogs drift. Canonical storage still lacks a gameplay `schemaVersion`; that gap is documented, not migrated in this phase. `AGENTS.md` now points at Foundation scope while keeping Prompt 18 player-visible behavior frozen.

## 2026-08-16 — Versioned content package and save-schema kernel

Content packages are described by `content/package.manifest.json`. Generated client/server catalogs add `packageId`, `packageVersion`, `minimumProtocolVersion`, and `developmentOnly` (excluded ids). The SHA-256 content hash remains the canonical gameplay payload only; `buildTimestamp` is CLI output, not hashed, and is omitted from generated artifacts so they stay byte-identical. Per-kind definition schema versions live in the manifest; source documents may set optional `schemaVersion` and `developmentOnly`. Production generate excludes development-only definitions.

Canonical player storage (`character`, `inventory`, `equipment`, `quests`, `wallet_ref`, `progression`) writes `schemaVersion` 1, `createdAt`, and `updatedAt`. Prompt 18 blobs without a version are v0 and migrate on server load; the result is persisted once. Nakama JSON round-trips can turn omitted optional objects into `null`; `cloneExtras` treats `null` as empty, and a `null` `schemaVersion` is missing v0 rather than corrupt. Future versions and corrupted required fields reject join/bootstrap with a visible reason. The client cannot send save versions (bootstrap `stat_injection`; join metadata is protocol, content hash, and `selectionTicket`). `player`/`wallet_ref` points at wallet gold without storing the balance; migration never grants gold, starter items, or quest rewards. Match `starter_zone` stays an unversioned locator. JSON keys stay camelCase. Commands: [MIGRATIONS.md](MIGRATIONS.md).

## 2026-08-16 — Real authentication, character slots, and class selection

Email-and-password registration and login are the supported account path. The client confirms the password on register, caches session tokens (never passwords) in `user://session_cache.json`, refreshes, and shows `session_expired` when email refresh fails. Debug device identities (Alice, Bob, machine unique id) remain only when `OS.is_debug_build()` is true and `DevIdentity.force_release_config` is false.

An account may have three live characters. Server RPCs `character_list`, `character_create`, `character_select`, `character_soft_delete`, and `character_restore` own the roster. Names go through one validator (`character_name.ts`): trim, length 3–16, ASCII letters/digits plus single spaces/hyphens/apostrophes, no leading/trailing separator, no repeated spaces. Canonical names are reserved on system-owned `names` objects; concurrent creates of the same canonical name leave one winner and `name_taken` for the loser. The UI does not copy that regex.

Class definitions are content (`kind` `class`). Runtime iterates the catalog; it does not hard-code class IDs. Temporary test classes supply starting attributes, growth, resources, equipment, abilities, level curve, point rules, allowed equipment tags, and a visual asset set id. Class id is immutable after create. Prompt 18 characters migrate into slot 1, keep gameplay state, and receive the class flagged `legacyMigrationDefault` without a second starter grant. Gold stays the account wallet.

Selecting a character issues a 300-second ticket. Match join metadata is `{ protocolVersion, contentHash, selectionTicket }`. `characterId` in metadata is `stat_injection`. The match checks ownership, existence, not deleted, ticket not expired, and not previously invalidated, then invalidates the ticket on successful join. Same-session resume may skip a new ticket; a new join after leave must select again. Only one selected active character per account.

`character_bootstrap` remains a compatibility wrapper so Prompt 18 tests and local verify still work. Graphical play and e2e select a character and join with the ticket.

Password-recovery email is out of Foundation v1. Operators assist through the Nakama console. The issued Prompt 21 work supersedes the earlier roadmap row that named “remove architectural ID hard-coding” as Prompt 21; that ID cleanup remains later.

## 2026-08-16 — Generic statistics, experience, levels, and point allocation

The issued Prompt 22 includes XP, the derived-stat pipeline, and attribute allocation. Skill points persist and display; spending them to unlock abilities is Prompt 24 (accepted as issued). Temporary content IDs (`test.attribute.*`, `test.resource.*`, `test.stat.*`, `test.curve.standard`, `test.progression.*`) are examples only. Runtime iterates catalogs and looks up by stable ID or `role`.

A class document points at `progressionId`. Numeric bases, growth, allowed attributes, and create-time points live on `class_progression`. The shared test curve has `maxLevel` 5, XP thresholds `[50, 75, 100, 150]`, and one attribute plus one skill point per level-up. One grant can cross multiple levels. At max level leftover XP increases `lifetimeXp` only; `currentXp` stays 0; no further points or automatic unlocks. Duplicate `eventId` values do not grant XP twice.

XP is granted only from trusted server events: slime kill credit (`xpReward` 10, `kill:<enemyInstanceId>:<deathCount>`), quest reward (`rewards.xp` 20, `quest:<questId>:<requestId>`), and administrator domain `grantXp`. There is no client XP opcode and no debug grant RPC.

The stat pipeline is fixed code order: class base, level growth, allocated attributes, equipment, temporary effects, percent, multipliers, clamps. Content lists structured components, not script strings. The server is canonical. `ProgressionService` may preview an allocate, then replaces local fields from `FULL_STATE.progression` / `PROGRESSION_STATE`.

`ALLOCATE_ATTRIBUTES` is opcode 9 (`attributeId`, numeric `amount`, `requestId`). Validation: attribute exists, class allows it, amount is a positive integer ≤ 100 and ≤ unspent points. Replay of `requestId` is idempotent. Combat reads pipeline finals when `classId`, progression, and the catalog are present; tests without those fields keep the previous `player.base.attack` (+ bonus) fallback so Prompt 18 combat numbers stay 4 unequipped.

Storage is `player`/`progression` (`permissionWrite: 0`). Prompt 18 characters without a blob join at level 1 with previous vanguard combat numbers when using the default class and training sword.

## 2026-08-16 — Generic items, inventory, equipment, currency, and transaction core

The issued Prompt 23 generalizes the Prompt 18 item systems. It supersedes the earlier roadmap row that named “Abilities and hotbar” as Prompt 23. Ability unlock is Prompt 24 as issued. Merchants and player trading are not in this phase.

Wire and storage keep `itemId` (not `definitionId`). Content JSON is camelCase (`displayName`, `maxStack`, `uniquePolicy`, `equipmentSlotTags`). Categories are `weapon`, `armor`, `consumable`, `quest`, `material`, and `miscellaneous`. Non-stackable items use server-generated `instanceId` values. Instance records store `createdAt`, `sourceType`, `sourceId`, `metadata`, `lockReason`, `lockId`, and `slotIndex`. Clients never invent instance ids. Prompt 18 blobs keep existing instance ids and stacks; missing fields default (`sourceType` `migration`, `createdAt` 0, empty locks, sequential `slotIndex`). `SAVE_SCHEMA_VERSION` stays 1.

Equipment slots are content `equipment_slot` documents. Temporary tags sufficient to prove weapons and armor are `main_hand`, `off_hand`, `head`, `chest`, `legs`, and `feet`. Classes list `allowedEquipmentTags`; arcanist omits `off_hand`. Equipped items remain in inventory. Destroy of an equipped instance is `item_equipped`. Unique `character` blocks a second grant that cannot fully stack; unique `equipped` blocks a second equipped instance of the same definition. Slime gel is `quest`, not destroyable, not tradeable.

Gold stays the account Nakama wallet. Every gold mutation goes through `applyGoldMutation` / `simulateCommit` with character id, delta, reason type, reason id, request id, resulting balance, and audit metadata. The client cannot send `resultingGold` or `resultingBalance`. Loot, quest rewards, equipment, and item destruction persist through `commitTransaction` (`nk.multiUpdate` when storage and wallet change together). Tests use `memoryCommitter` without Nakama adapters.

GLoot remains a presentation mirror. UI operations send intentions. Canonical server responses rebuild GLoot. Rejected operations restore canonical state. Local drag/drop is not authoritative.

New ordinary items are introduced through `content/source` without protocol changes. Test items (`item.test_*`) are catalog examples, not hardcoded runtime ids.

## 2026-08-16 — Generic ability, casting, cooldown, resource, and effect engine

The issued Prompt 24 generalizes the Prompt 18 basic attack into a data-defined ability and effect engine. It supersedes the earlier roadmap row that named “public village-and-fields world” as Prompt 24. Public-world remains later. Complex enemy behavior is not in this phase. PvP remains disabled.

`ATTACK` (opcode 3) stays for Prompt 18 e2e. When the match catalog includes `player.base.basicAbilityId` and the caster has unlocked it, ATTACK uses that ability. Combat unit tests without `abilitiesById` keep `applyPlayerAttack`. `USE_ABILITY` (13), `CANCEL_CAST` (14), `ASSIGN_HOTBAR` (15), and `UNLOCK_ABILITY` (16) share one intention path. The client may send ability ID, target entity or point, and `requestId` only. Damage, healing, range, cooldown, cast time, resource cost, and effect duration are `stat_injection`.

Ability documents use camelCase content JSON. Target modes are `self`, `entity`, and `ground_point`. Relation filters are `self`, `friendly`, `hostile`, and `any`. Other living players are `friendly`; a hostile filter against a player is `pvp_disabled`. Damaging effects still no-op on other players. Magnitude formulas are structured (`constant`, `stat_role`, `stat_id`) with no eval. Effect handlers are project-owned: `direct_damage`, `direct_heal`, `resource_change`, `timed_stat_modifier`, `periodic_damage`, `periodic_heal`, `stun`, and `root`. Stack policies are `replace`, `refresh`, `stack`, and `ignore`.

Unlocked abilities, hotbar (8 slots, `""` empty), and optional ranks persist on `player`/`progression`. `SAVE_SCHEMA_VERSION` stays 1. Client hotbar is not proof of ownership. Cooldowns, resources in the live match, active casts, and status effects are match-lived. Reconnect grace keeps resources/effects/cooldowns and clears `activeCast`. Skill-point unlock is idempotent on `requestId`. Adding another ordinary ability that uses existing handlers is content-only.

Certification abilities (`test.ability.basic_melee`, `ranged_bolt`, `small_heal`, `power_buff`, `damage_over_time`) are examples. Vanguard starts with basic melee; arcanist starts with melee and ranged bolt. Runtime looks up `basicAbilityId` and class `startingAbilities` from the catalog. Nakama JSON-roundtrips match state between ticks, so the adapter rebinds ability, item, quest, and progression catalogs from the generated module each tick instead of trusting the serialized copies. Goja can materialize omitted numeric fields as `null`; `isFinite(null)` is true, so magnitude scale/bonus must require `typeof value === "number"` or melee damage becomes 0.

The client `AbilityService` mirrors server state. Hotbar keys 1–8, Escape cancels targeting or the active cast, and ground-target abilities show a preview circle. Space still sends `ATTACK` for the Prompt 18 control.

## 2026-08-17 — Generic combat pipeline, targeting, death, respawn, and XP hooks

The issued Prompt 25 generalizes Prompt 18 combat into one server pipeline used by player attacks, enemy attacks, abilities, and status ticks. It supersedes the earlier roadmap row that named “temporary parties” as Prompt 25. Parties remain later. Inn persistence remains Prompt 29; a live match bind is used when present, otherwise `zone.starter.playerSpawn`.

Damage and healing share ordered steps: action accepted, actor validated, target validated, hit eligibility, base magnitude, source modifiers, target modifiers, mitigation, shields/absorption, final amount, health mutation, combat event, threat/credit, death handling, reward hooks. Formulas are structured fields (base, coefficients, flats, percents, defense, absorb, optional crit, min clamp). There is no eval. Temporary mitigation is `floor(raw * 100 / (100 + defense))`; defense 0 preserves Prompt 18 values (player hit 4, slime hit 2). Crit is off unless `critEnabled` and `critForced`. Duplicate `eventId` values replay without a second mutation.

`SET_TARGET` (17) stores current hostile or friendly ids after validating the entity against match state. Hostile intent against another player is `pvp_disabled`. `RELEASE_RESPAWN` (18) respawns immediately while dead; the Prompt 18 3-second auto-respawn still runs. Dead characters cannot move, cast, interact, loot, equip, or transfer. Death interrupts casts and strips temporary combat effects. No XP loss, item loss, or durability. Ordinary combat flags (in-combat, last hostile/damage ticks, targets, death timer) are match-lived and are not written to storage; reconnect grace keeps them.

XP grants still come only from trusted server events. Enemy kill and quest turn-in call `xp_hooks` into `grantXp`. This phase does not invent a new enemy XP formula; `enemy.xpReward` and `kill:<instanceId>:<deathCount>` stay. Clients cannot send XP amounts.

The HUD target frame, combat-state label, death overlay, release button, and floating numbers are presentation of server snapshots and `COMBAT_EVENT` only.

## 2026-08-17 — Generic enemies, spawn controllers, AI profiles, loot tables, and bosses

The issued Prompt 26 generalizes the Prompt 18 slime into data-defined enemies, spawn controllers, server AI profiles, loot tables, and simple boss phases. It supersedes the earlier roadmap row that named “cave instances” as Prompt 26. Caves remain later. Parties remain later; this phase only adds a party-credit hook from threat. Final party loot is Prompt 28. PvP remains disabled. There is no client-side AI framework (no LimboAI).

Enemy documents carry `enemy_id`, `display_name_key`, `level`, base combat stats (`maxHealth`, `damage`, `defense`), optional resource pools, movement/aggro/leash/attack range, `ability_loadout`, `ai_profile_id`, `xp_reward`, `loot_table_id`, `visual_asset_id`, `collision_profile_id`, and `tags`. The green slime is a normal enemy (`enemy.green_slime`) using `test.ai.melee`, `loot.green_slime`, instance id `enemy.green_slime:0`, 20 HP, damage 2, and a guaranteed gel. Test melee/ranged/caster/boss spawns in `zone.starter` use `activationPolicy: "manual"` so they do not aggro the Prompt 18 e2e path.

Spawn documents carry `spawn_id`, `zone_id`, `enemy_id`, position (`x`/`y`), `spawn_count`, `respawn_delay`, `activation_policy` (`always` | `manual`), and `group_id`. The spawn controller creates entities, tracks living/dead slots, schedules in-place respawn via `deadUntilTick`, ignores duplicate slot respawns, and `resetSpawnGroup` exists for later cave resets. Match restart is a fresh `createStarterZoneState`.

AI profiles (`melee`, `ranged`, `caster`, `boss`) are a deterministic server state machine: `idle`, `acquiring` (not persisted; nearest acquisition goes to `chasing`/`attacking` so Prompt 18 aggro tests stay valid), `chasing`, `positioning`, `casting`, `attacking`, `returning`, `stunned`, `dead`. The client only presents `state` from snapshots.

Threat is simple and documented: `threat += floor(amount * weight)` for damage, and for healing only when `generateHealThreat` is true and the healed player is the current target or already on the table. Target switches when another valid player’s threat exceeds current × `threatSwitchRatio` (1.1 for ordinary profiles, 1.05 for the test boss). Otherwise nearest living player in aggro. Leash returns to spawn; ordinary melee does not restore HP (Prompt 18); boss/`resetHealthOnReturn` restores HP, loadout, phase, flags, and despawns phase adds.

Loot tables support guaranteed entries, independent chance entries, weighted choice groups, and empty tables. Rolls use a match-local LCG seeded from `kill:<instanceId>:<deathCount>` (no Node `crypto`). Ground loot is still `ownershipPolicy: ground_free`; killer/party_split are catalog values for Prompt 28. Death processing is idempotent on that event id for loot, XP, and the party-credit hook.

Boss phases are a fixed table: health percent, combat time, add deaths, and one-time flags. A phase may add/remove abilities, change move/aggro/attack range, apply one structured effect, trigger a spawn, and send a `COMBAT_EVENT` `message`. There is no boss scripting language. The test cave boss starts with smash, enrages at ≤50% HP (adds nova, speed 55, `spawn.starter.boss_add`, message `"The cave boss enrages."`), and resets on wipe or leash.

A new ordinary enemy that reuses an existing AI profile is content-only.

Nakama JSON-roundtrips match state between ticks. Optional arrays (`phases`, loot `entries`) may be omitted or null; domain code uses `Array.isArray` (or equivalent) before reading `.length`. In-place slime respawn restores `idle` on the ready tick and does not re-aggro until the following tick.
