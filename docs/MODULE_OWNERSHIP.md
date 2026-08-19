# Module ownership

Project-owned modules only. Do not call addon APIs from feature scenes except through these owners. Do not edit `client/addons/`.

Ambiguous or duplicated names are listed at the end. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [THIRD_PARTY.md](THIRD_PARTY.md).

Legend: **C** client, **S** server domain, **A** Nakama adapter, **T** tooling, **I** infrastructure.

| Module | Runs | Responsibility | State it owns | Wraps | May call | Persistence | Protocol | Inventory/wallet |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AppState` | C | Session flags and shell signals | Loading, errors, scene id, zone view mirror, reconnect flag | none | none | no | no | no |
| `ContentRegistry` / `ContentCatalog` / `VisualCatalog` / `AssetManifest` | C | Load bundle, ID lookup, visual ID → texture, client asset sets | Parsed catalog + manifest in memory | `bundle.json`, `visual_map.json`, `asset_manifest.json` | none | no | no | no |
| `NetworkService` | C | Auth, socket, RPCs, match send/recv, chat join/send, reconnect, transfer join | In-memory Nakama session | `NakamaNetworkBackend` | `AppState`, `MatchProtocol`, `ContentRegistry` | no | yes (send/recv) | no |
| `NakamaNetworkBackend` | C | Thin Nakama SDK | Client, session, socket, match id | Nakama Godot SDK 3.4.0 | none | no | transport only | no |
| `SessionCache` / `DevIdentity` | C | Token cache (never passwords); debug identity gate | `user://session_cache.json` tokens only | none | none | tokens only | no | no |
| `ReconnectPolicy` | C | Backoff timings | none | none | none | no | no | no |
| `MatchProtocol` | C | Opcodes, envelopes, FULL_STATE parse | none | none | none | no | schema only | no |
| `GameService` | C | Boot, login, bootstrap, zone join orchestration | none | autoloads | `NetworkService`, `SceneRouter`, `AppState` | no | via NetworkService | no |
| `SceneRouter` | C | Boot/login/character/world | current scene id | Godot tree | `AppState` | no | no | no |
| `QuestService` | C | Journal mirror; accept/turn-in intents | In-memory quest view | none | `NetworkService` | no | QUEST_ACCEPT / QUEST_TURN_IN | no |
| `InventoryService` | C | Inventory mirror; pickup/destroy/split/move intents | GLoot inventory clone | GLoot 3.0.2 | `NetworkService` | no | PICKUP / DESTROY_ITEM / SPLIT_STACK / MOVE_ITEM | no grants |
| `EquipmentService` | C | Equipment mirror; equip intents | GLoot ItemSlot clone | GLoot 3.0.2 | `NetworkService`, `InventoryService` | no | EQUIP | no |
| `WalletService` | C | Gold label mirror | In-memory gold | none | none | no | no | no |
| `ProgressionService` | C | Progression mirror; allocate intent; preview replaced by server | In-memory level/XP/attributes | none | `NetworkService` | no | ALLOCATE_ATTRIBUTES | no |
| `AbilityService` | C | Ability/hotbar/cast/cooldown mirror; use/cancel/unlock/hotbar intents | In-memory unlocked ids, hotbar, resources, cooldowns, active cast, effects | none | `NetworkService`, `ContentRegistry`, `AttackIntent` | no | USE_ABILITY / CANCEL_CAST / ASSIGN_HOTBAR / UNLOCK_ABILITY | no |
| `DialogueCatalog` / `DialoguePresenter` | C | Map server `dialogueId` (fallback NPC id) → `.dialogue`; open after INTERACTION_RESULT | pending request ids | Dialogue Manager 3.10.5 | `QuestService` / `VendorService` / `InnService` / `CaveService` from dialogue `do` lines | no | no | no |
| `VendorService` | C | Vendor panel mirror; buy/sell intents | Last approved vendor NPC; selected stock/instance | none | `NetworkService` | no | VENDOR_BUY / VENDOR_SELL | no prices |
| `InnService` | C | Inn/healer rest intent | Last approved inn/healer NPC | none | `NetworkService` | no | INN_REST | no gold/health |
| `CaveService` | C | Cave-enter/exit intents; transfer overlay after ticket extras | Last approved cave NPC | none | `NetworkService` | no | CAVE_ENTER / CAVE_EXIT | no |
| `PartyService` | C | Party mirror; create/invite/accept/leave/kick/promote/disband; party chat | In-memory party view, pending invite, chat lines | none | `NetworkService`, `AppState` | no | party RPCs, PARTY_STATE / PARTY_EVENT, `party.<id>` channel | no |
| `TradeService` | C | Trade mirror; invite/offer/gold/accept/cancel | In-memory trade view | none | `NetworkService`, `AppState` | no | TRADE_* / TRADE_STATE | no grants |
| `GmService` | C | Debug GM panel; `gm_command` RPC intention + reason | Last result copy | none | `NetworkService` | no | `gm_command` RPC | no grants |
| `WindowManager` / `HudController` / `UiStateService` | C | Open/close/focus/exclusivity of shell and HUD windows; character/zone restore | Open window ids, UI scale | none | `AppState` | no | no | no |
| `TooltipService` / `DragDropService` / `NotificationService` | C | Tooltip clamp, drag preview, toast copy | Ephemeral presentation | none | none | no | no | no |
| `InputSettingsService` / `AudioSettingsService` / `LocalSettingsStore` | C | Rebindable InputMap, volume/window/scale | `user://client_settings.json` | none | `UiStateService` | local settings only | no | no |
| `VisualSetMath` | C | 4/8-dir frame math from authored sets | none | none | none | no | no | no |
| `ZoneChat` / `ChatPanel` | C | Room join/leave, history Label | chat lines | none | `NetworkService` | no | chat channel, not match opcode | no |
| `World` / `ZoneView` / `EntityRegistry` / avatars / `WorldHud` | C | Render zone and HUD (hotbar, cast bar, ground-target preview, status icons, target frame, death overlay, combat indicator, vendor/inn/cave/settings panels, party panel, trade panel, cave objective) | display poses | none | services above, `HudController` | no | INPUT via World | no |
| `MoveIntent` / `MovementSim` / `MovementReconciler` / `SnapshotBuffer` | C | Prediction and interpolation | unacked cmds, buffer | none | `MatchProtocol` | no | INPUT | no |
| `AttackIntent` / `CombatFeedback` / `InteractIntent` / `PickupIntent` | C | Usability targeting and floating numbers | none | none | `NetworkService` | no | ATTACK / SET_TARGET / INTERACT / PICKUP | no |
| `NetDebugOverlay` | C | Debug FPS / ping EMA | none | none | none | no | no | no |
| `ErrorDialog` / `LoadingOverlay` / `ShellPage` | C | Visible errors and overlays | none | none | `AppState`, `WindowManager` | no | no | no |
| `Boot` / `Login` / `Character` scenes | C | Shell UI | none | none | `GameService` | no | no | no |
| `SliceJourney` / `SliceSession` / `e2e_slice` | C debug | Headless two-identity journey | test sessions | `NakamaNetworkBackend` | `MatchProtocol` | no | same opcodes as players | no |
| `protocol.ts` | S | Opcode parse, injection rejection | none | none | none | no | yes (parse) | no |
| `match_state.ts` / `match_loop.ts` | S | Zone simulation tick | live match state | none | domain combat, inventory, quests | no (tick) | emit snapshots | no (tick) |
| `movement.ts` | S | Axes, collision, speed | none | none | none | no | no | no |
| `combat.ts` / `combat_pipeline.ts` / `targeting.ts` / `enemy_ai.ts` / `enemy_ability.ts` / `threat.ts` / `boss.ts` | S | Shared combat resolver, targeting, AI profiles, threat, boss phases, death, respawn | enemy/player combat fields in match | none | `loot.ts`, `loot_table.ts`, `xp_hooks.ts`, `spawn_controller.ts` | no | COMBAT_EVENT / SET_TARGET / RELEASE_RESPAWN | no |
| `spawn_controller.ts` | S | Create/track/respawn/despawn/reset spawn groups | match `spawns` + enemy slots | none | match_state types | no | COMBAT_EVENT respawn | no |
| `loot_table.ts` / `party_credit.ts` / `party_loot.ts` | S | Deterministic loot rolls; group credit; personal/server-assigned party loot | `processedDeathEventIds` | none | `loot.ts`, `inventory.ts` | no | via loop | grant in memory |
| `ability.ts` | S | Ability use, casts, cooldowns, unlock, hotbar, ATTACK wrapper | match casts/cooldowns; progression unlocks/hotbar | none | effects, combat_pipeline, stats | serialize via progression | USE_ABILITY / CANCEL_CAST / ASSIGN_HOTBAR / UNLOCK_ABILITY | no |
| `effects.ts` | S | Structured effect handlers (damage, heal, resource, modifier, periodic, stun, root) | match effect lists | none | combat_pipeline, stats | no | COMBAT_EVENT | no |
| `stats.ts` | S | Deterministic derived-stat pipeline | none | none | equipment modifiers | no | no | no |
| `progression.ts` / `progression_store.ts` (domain) | S | XP, levels, allocation, serialize progression | none | none | stats.ts | serialize only | no | no |
| `xp_hooks.ts` | S | Trusted XP grant interface from kill/quest events | none | none | progression.ts via match loop | no | no | no |
| `interaction.ts` | S | NPC existence, zone, per-NPC range, optional service gate | none | none | none | no | INTERACTION_RESULT | no |
| `npc.ts` | S | NPC definition lookup and service list | none | none | none | no | no | no |
| `vendor.ts` | S | Buy/sell apply; server prices; unsellable/locked | none | none | inventory, wallet, transaction | no | VENDOR_BUY / VENDOR_SELL | yes (pure) |
| `inn.ts` | S | Inn/healer rest, gold, heal, resource restore, bind | none | none | wallet, transaction | bind on character | INN_REST | yes (pure) |
| `quest_objectives.ts` | S | Talk/kill/collect/enter/boss/return progress | none | none | quest.ts | no | via loop | no |
| `loot.ts` | S | Ground loot TTL and pickup apply | match loot list | none | `inventory.ts` | no | via loop | grant in memory |
| `inventory.ts` / `inventory_store.ts` (domain) | S | Stack rules, instance fields, locks, serialize inventory | none | none | none | serialize only | no | yes (pure) |
| `equipment.ts` / `equipment_store.ts` (domain) | S | Content-defined slots + derived attack serialize | none | none | inventory locks | serialize only | no | no |
| `transaction.ts` | S | Idempotent gold + version check, audit events, in-memory committer | none | none | `wallet.ts` | no | no | yes (pure) |
| `wallet.ts` | S | Canonical gold mutations (character, delta, reason, request, resulting balance) | none | none | none | no | no | yes (pure) |
| `quest.ts` / `quest_store.ts` (domain) | S | Quest log serialize/progress including optional stages | none | none | none | serialize only | no | no |
| `quest_reward.ts` | S | Turn-in apply + gold via currency helper | none | none | inventory, quest, wallet | no | no | yes (pure) |
| `character.ts` / `character_name.ts` / `character_roster.ts` / `character_ticket.ts` / `character_lifecycle.ts` / `class_catalog.ts` | S | Name policy, roster, tickets, class lookup | none | none | content classes | serialize character | RPC bodies | starter stacks via class |
| `join_validation.ts` | S | Match join rules including selection ticket or transfer ticket | none | none | none | no | join reject | no |
| `persistence.ts` | S | Grace, seq reset, checkpoints, transfer leave | disconnected map | none | match_state | no (decides when) | no | no |
| `rate_limit.ts` / `security_log.ts` / `security_catalog.ts` / `auth_privacy.ts` | S | Action windows, session rates, attack matrix, login sanitization | match `actionRates`; lexical session maps | none | none | no | SYSTEM_MESSAGE / auth errors | no |
| `chat.ts` | S | Channel join/send filters including party rooms | none | none | `party.ts` | no | RT hooks | no |
| `party.ts` | S | Temporary party lifecycle, invites, OCC revision, connection grace | none | none | `cave_ownership.ts` | serialize only | RPC bodies | no |
| `cave.ts` / `instance.ts` / `location.ts` / `transfer.ts` | S | Cave eligibility/allocation, instance types, canonical location, one-time tickets | none | none | party.ts | serialize only | CAVE_ENTER / CAVE_EXIT extras | no |
| `cave_ownership.ts` | S | Expire party-owned caves on disband | none | none | `cave.ts` | via cave store | no | no |
| `trade.ts` / `match_trade.ts` | S | Nearby trade state machine, locks, gold reservation, commit/recovery | match `trades` | none | inventory, wallet, transaction | serialize only | TRADE_* / TRADE_STATE | yes (pure) |
| `starter_zone_registry.ts` (domain) | S | Canonical public-world match-id selection | none | none | none | no | no | no |
| `character_store.ts` / `roster_store.ts` / `selection_store.ts` / `name_reservation_store.ts` | A | Character, roster, ticket, name reservation | none | Nakama storage | domain character/roster | yes | no | no |
| `inventory_store.ts` (nakama) | A | Read/write inventory | none | Nakama storage | domain inventory_store | yes | no | yes |
| `quest_store.ts` (nakama) | A | Read/write quests | none | Nakama storage | domain quest_store | yes | no | no |
| `equipment_store.ts` (nakama) | A | Read/write equipment | none | Nakama storage | domain equipment_store | yes | no | no |
| `progression_store.ts` (nakama) | A | Read/write progression | none | Nakama storage | domain progression_store | yes | no | no |
| `party_store.ts` (nakama) | A | Read/write party records and character indexes | none | Nakama storage | domain party | yes | no | no |
| `cave_store.ts` / `location_store.ts` / `transfer_store.ts` | A | Cave records/indexes, active location, transfer tickets | none | Nakama storage | domain cave/location/transfer | yes | no | no |
| `trade_store.ts` | A | Trade record, character index, audit, `nk.multiUpdate` commit | none | Nakama storage + wallet | domain trade | yes | no | yes |
| `quest_reward_store.ts` / `transaction_store.ts` | A | `nk.multiUpdate` transaction boundary (loot/equipment/destroy/turn-in) | none | Nakama storage + wallet | domain transaction | yes | no | yes |
| `starter_zone_registry.ts` (nakama) | A | Find/create match + singleton | none | Nakama match + storage | domain registry | yes (match id) | no | no |
| `starter_zone_match.ts` | A | Match handler lifecycle for public world and party caves | live zone + presences | Nakama match | all domain + stores | yes (join/txn/checkpoint/ticket) | yes | yes (via stores) |
| `chat_hooks.ts` | A | `registerRtBefore` | none (session rates in `rate_limit.ts`) | Nakama RT | domain chat, party_store, rate_limit | no | RT | no |
| `rpcs/health.ts` | A | `vibecode_health` | none | none | generated hash | no | RPC | no |
| `rpcs/character_lifecycle.ts` | A | `character_bootstrap` wrapper plus list/create/select/soft-delete/restore | none | character/roster/selection/name stores | domain lifecycle | yes | RPC | new characters only |
| `rpcs/character_bootstrap.ts` | A | Re-exports bootstrap wrapper | none | character_lifecycle | domain lifecycle | yes | RPC | no |
| `rpcs/find_or_create_starter_zone.ts` | A | Public-world locator; live cave on reconnect | none | registry, location, cave | protocol version | yes (match singleton) | RPC | no |
| `rpcs/cave.ts` | A | request_cave_entry / find_or_create_owned_cave / request_cave_exit | none | cave/location/party stores | domain cave | yes | RPC | no |
| `rpcs/party.ts` | A | Party create/invite/accept/decline/leave/kick/promote/disband/get | none | party_store, character stores | domain party | yes | RPC | no |
| `rpcs/gm.ts` / `gm.ts` / `gm_store.ts` | A/S | Allowlist, audited `gm_command`, live matchSignal apply | none | gm / gm_audit storage | domain gm | yes | RPC | admin grants |
| `rpcs/handshake.ts` / `handshake.ts` / `compatibility.ts` | A/S | Login compatibility gate | none | none | catalog hash + env versions | no | `session_handshake` | no |
| `rpcs/ops.ts` / `ops_store.ts` / `maintenance.ts` / `ops_metrics.ts` | A/S | Maintenance flag, counters, redacted ops logs | in-memory counters | ops storage | domain maintenance | yes | `ops_status` / `ops_set_maintenance` | no |
| `nakama/auth_hooks.ts` / `environment.ts` | A/S | Registration and device-auth policy from env presets | none | none | compiled presets + `ctx.env` | no | Authenticate* before hooks | no |
| `cert_load.ts` / `cli/cert.ts` | S/T | Capacity/soak measurement (default public cap stays 8; capacity uses `maxPlayers: 20` extras) | none | none | match_loop | no | no | no |
| `recovery.ts` | S | Documented recovery procedures and overwrite tokens | none | none | none | no | no | no |
| `main.ts` | A | `InitModule` registrations | none | Nakama initializer | RPCs, match, hooks | no | register | no |
| `generated/content.ts` | S generated | Catalog | immutable content | content-build | none | no | no | no |
| `tools/content-build` | T | Validate, generate, diff, trace, unused, new/copy templates, migrate, package, CSV | none | Ajv | `content/source`, `content/package.manifest.json`, client visual/dialogue maps | no | no | no |
| `tools/foundation-audit` | T | Freeze checks | none | none | catalogs + git | no | no | no |
| `server/src/domain/save_schema.ts` / `migration.ts` / `save_load.ts` | S | Save envelope, v0→v1 registry, load | none | none | storage parsers | serialize + migrate | no | no |
| `wallet_ref.ts` / `wallet_ref_store.ts` | S/A | Versioned gold pointer, not the balance | none | Nakama storage | save_schema | yes | no | pointer only |
| `server/src/cli/migrate.ts` | T | status / dry-run / apply / verify | none | Node http/fs | domain migration | fixture or console | no | no |
| `infra/` Compose + env JSON + `local.yml` | I | Postgres + Nakama process; four environment presets | volumes per environment | Docker | none | Nakama’s tables only | no | no |
| GdUnit tests / `scripts/` | T | Run suites | none | GdUnit4, Node, Docker | repo | no | no | no |

## Ambiguous or duplicated ownership

| Topic | Resolution |
| --- | --- |
| `quest_store.ts` / `inventory_store.ts` / `equipment_store.ts` / `progression_store.ts` exist under both `domain/` and `nakama/` | Domain files serialize values. Nakama files read/write storage. Callers in the match adapter must use the Nakama files. |
| `starter_zone_registry.ts` in domain and nakama | Domain picks the canonical match id. Nakama file talks to `matchList` / `matchCreate` / storage. |
| `STARTER_ZONE_ID` vs content `zones` map | Runtime still keys `content.zones["zone.starter"]` instead of iterating the catalog. Catalogued as architectural hard-coding. |
| Dialogue `do QuestService.request_accept("quest.slime_problem")` | Presentation script owns the ID string; server still validates. Must move to content-driven choices later. |
| `DialoguePresenter` balloon path `res://addons/dialogue_manager/example_balloon/example_balloon.tscn` | Presentation-only; still a vendor example scene. Do not treat as a second dialogue system. |
| `ContentCatalog.REQUIRED_IDS` | Client boot refuses catalogs missing Prompt 18 IDs. Duplicates content-build’s source set. Later generalization must drop the fixed list. |
| Wallet vs storage | Gold is Nakama wallet, not a storage object. Inventory/quest/equipment are storage. Turn-in uses both in one `multiUpdate`. |
| E2E vs `NetworkService` | E2E uses `NakamaNetworkBackend` directly so it can open two identities. Graphical play uses `NetworkService`. Both send the same opcodes. |

No module other than Nakama adapters may access persistence. No client module may write canonical storage or wallet.
