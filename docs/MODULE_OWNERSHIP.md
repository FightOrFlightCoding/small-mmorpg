# Module ownership

Project-owned modules only. Do not call addon APIs from feature scenes except through these owners. Do not edit `client/addons/`.

Ambiguous or duplicated names are listed at the end. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [THIRD_PARTY.md](THIRD_PARTY.md).

Legend: **C** client, **S** server domain, **A** Nakama adapter, **T** tooling, **I** infrastructure.

| Module | Runs | Responsibility | State it owns | Wraps | May call | Persistence | Protocol | Inventory/wallet |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AppState` | C | Session flags and shell signals | Loading, errors, scene id, zone view mirror, reconnect flag | none | none | no | no | no |
| `ContentRegistry` / `ContentCatalog` / `VisualCatalog` | C | Load bundle, ID lookup, visual ID → texture | Parsed catalog in memory | `bundle.json`, `visual_map.json` | none | no | no | no |
| `NetworkService` | C | Auth, socket, RPCs, match send/recv, chat join/send, reconnect | In-memory Nakama session | `NakamaNetworkBackend` | `AppState`, `MatchProtocol`, `ContentRegistry` | no | yes (send/recv) | no |
| `NakamaNetworkBackend` | C | Thin Nakama SDK | Client, session, socket, match id | Nakama Godot SDK 3.4.0 | none | no | transport only | no |
| `SessionCache` / `DevIdentity` | C | Token cache (never passwords); debug identity gate | `user://session_cache.json` tokens only | none | none | tokens only | no | no |
| `ReconnectPolicy` | C | Backoff timings | none | none | none | no | no | no |
| `MatchProtocol` | C | Opcodes, envelopes, FULL_STATE parse | none | none | none | no | schema only | no |
| `GameService` | C | Boot, login, bootstrap, zone join orchestration | none | autoloads | `NetworkService`, `SceneRouter`, `AppState` | no | via NetworkService | no |
| `SceneRouter` | C | Boot/login/character/world | current scene id | Godot tree | `AppState` | no | no | no |
| `QuestService` | C | Journal mirror; accept/turn-in intents | In-memory quest view | none | `NetworkService` | no | QUEST_ACCEPT / QUEST_TURN_IN | no |
| `InventoryService` | C | Inventory mirror; pickup intent | GLoot inventory clone | GLoot 3.0.2 | `NetworkService` | no | PICKUP | no grants |
| `EquipmentService` | C | Equipment mirror; equip intents | GLoot ItemSlot clone | GLoot 3.0.2 | `NetworkService`, `InventoryService` | no | EQUIP | no |
| `WalletService` | C | Gold label mirror | In-memory gold | none | none | no | no | no |
| `DialogueCatalog` / `DialoguePresenter` | C | Map NPC id → `.dialogue`; open after INTERACTION_RESULT | pending request ids | Dialogue Manager 3.10.5 | `QuestService` from dialogue `do` lines | no | no | no |
| `ZoneChat` / `ChatPanel` | C | Room join/leave, history Label | chat lines | none | `NetworkService` | no | chat channel, not match opcode | no |
| `World` / `ZoneView` / `EntityRegistry` / avatars / `WorldHud` | C | Render zone and HUD | display poses | none | services above | no | INPUT via World | no |
| `MoveIntent` / `MovementSim` / `MovementReconciler` / `SnapshotBuffer` | C | Prediction and interpolation | unacked cmds, buffer | none | `MatchProtocol` | no | INPUT | no |
| `AttackIntent` / `CombatFeedback` / `InteractIntent` / `PickupIntent` | C | Usability targeting | none | none | `NetworkService` | no | ATTACK / INTERACT / PICKUP | no |
| `NetDebugOverlay` | C | Debug FPS / ping EMA | none | none | none | no | no | no |
| `ErrorDialog` / `LoadingOverlay` / `ShellPage` | C | Visible errors and overlays | none | none | `AppState` | no | no | no |
| `Boot` / `Login` / `Character` scenes | C | Shell UI | none | none | `GameService` | no | no | no |
| `SliceJourney` / `SliceSession` / `e2e_slice` | C debug | Headless two-identity journey | test sessions | `NakamaNetworkBackend` | `MatchProtocol` | no | same opcodes as players | no |
| `protocol.ts` | S | Opcode parse, injection rejection | none | none | none | no | yes (parse) | no |
| `match_state.ts` / `match_loop.ts` | S | Zone simulation tick | live match state | none | domain combat, inventory, quests | no (tick) | emit snapshots | no (tick) |
| `movement.ts` | S | Axes, collision, speed | none | none | none | no | no | no |
| `combat.ts` / `enemy_ai.ts` | S | Hits, death, AI, respawn | enemy/player combat fields in match | none | `loot.ts` | no | COMBAT_EVENT | no |
| `interaction.ts` | S | NPC range checks | none | none | none | no | INTERACTION_RESULT | no |
| `loot.ts` | S | Ground loot TTL and pickup apply | match loot list | none | `inventory.ts` | no | via loop | grant in memory |
| `inventory.ts` / `inventory_store.ts` (domain) | S | Stack rules, serialize inventory | none | none | none | serialize only | no | yes (pure) |
| `equipment.ts` / `equipment_store.ts` (domain) | S | main_hand + derived attack serialize | none | none | none | serialize only | no | no |
| `quest.ts` / `quest_store.ts` (domain) | S | Quest log serialize/progress | none | none | none | serialize only | no | no |
| `quest_reward.ts` | S | Turn-in apply + wallet metadata | none | none | inventory, quest | no | no | yes (pure) |
| `wallet.ts` | S | Gold helpers | none | none | none | no | no | yes (pure) |
| `character.ts` / `character_name.ts` / `character_roster.ts` / `character_ticket.ts` / `character_lifecycle.ts` / `class_catalog.ts` | S | Name policy, roster, tickets, class lookup | none | none | content classes | serialize character | RPC bodies | starter stacks via class |
| `join_validation.ts` | S | Match join rules including selection ticket | none | none | none | no | join reject | no |
| `persistence.ts` | S | Grace, seq reset, checkpoints | disconnected map | none | match_state | no (decides when) | no | no |
| `rate_limit.ts` / `security_log.ts` | S | Action windows, reject logs | actionRates in match | none | none | no | SYSTEM_MESSAGE | no |
| `chat.ts` | S | Channel join/send filters | none | none | none | no | RT hooks | no |
| `starter_zone_registry.ts` (domain) | S | Canonical match-id selection | none | none | none | no | no | no |
| `character_store.ts` / `roster_store.ts` / `selection_store.ts` / `name_reservation_store.ts` | A | Character, roster, ticket, name reservation | none | Nakama storage | domain character/roster | yes | no | no |
| `inventory_store.ts` (nakama) | A | Read/write inventory | none | Nakama storage | domain inventory_store | yes | no | yes |
| `quest_store.ts` (nakama) | A | Read/write quests | none | Nakama storage | domain quest_store | yes | no | no |
| `equipment_store.ts` (nakama) | A | Read/write equipment | none | Nakama storage | domain equipment_store | yes | no | no |
| `quest_reward_store.ts` | A | `nk.multiUpdate` turn-in | none | Nakama storage + wallet | domain quest_reward | yes | no | yes |
| `starter_zone_registry.ts` (nakama) | A | Find/create match + singleton | none | Nakama match + storage | domain registry | yes (match id) | no | no |
| `starter_zone_match.ts` | A | Match handler lifecycle | live zone + presences | Nakama match | all domain + stores | yes (join/txn/checkpoint) | yes | yes (via stores) |
| `chat_hooks.ts` | A | `registerRtBefore` | none | Nakama RT | domain chat | no | RT | no |
| `rpcs/health.ts` | A | `vibecode_health` | none | none | generated hash | no | RPC | no |
| `rpcs/character_lifecycle.ts` | A | `character_bootstrap` wrapper plus list/create/select/soft-delete/restore | none | character/roster/selection/name stores | domain lifecycle | yes | RPC | new characters only |
| `rpcs/character_bootstrap.ts` | A | Re-exports bootstrap wrapper | none | character_lifecycle | domain lifecycle | yes | RPC | no |
| `rpcs/find_or_create_starter_zone.ts` | A | Join ticket for starter match | none | registry | protocol version | yes (match singleton) | RPC | no |
| `main.ts` | A | `InitModule` registrations | none | Nakama initializer | RPCs, match, hooks | no | register | no |
| `generated/content.ts` | S generated | Catalog | immutable content | content-build | none | no | no | no |
| `tools/content-build` | T | Validate + generate catalogs, diff, trace, package manifest | none | Ajv | `content/source`, `content/package.manifest.json` | no | no | no |
| `tools/foundation-audit` | T | Freeze checks | none | none | catalogs + git | no | no | no |
| `server/src/domain/save_schema.ts` / `migration.ts` / `save_load.ts` | S | Save envelope, v0→v1 registry, load | none | none | storage parsers | serialize + migrate | no | no |
| `wallet_ref.ts` / `wallet_ref_store.ts` | S/A | Versioned gold pointer, not the balance | none | Nakama storage | save_schema | yes | no | pointer only |
| `server/src/cli/migrate.ts` | T | status / dry-run / apply / verify | none | Node http/fs | domain migration | fixture or console | no | no |
| `infra/` Compose + `local.yml` | I | Postgres + Nakama process | volume `vibecode_postgres_data` | Docker | none | Nakama’s tables only | no | no |
| GdUnit tests / `scripts/` | T | Run suites | none | GdUnit4, Node, Docker | repo | no | no | no |

## Ambiguous or duplicated ownership

| Topic | Resolution |
| --- | --- |
| `quest_store.ts` / `inventory_store.ts` / `equipment_store.ts` exist under both `domain/` and `nakama/` | Domain files serialize values. Nakama files read/write storage. Callers in the match adapter must use the Nakama files. |
| `starter_zone_registry.ts` in domain and nakama | Domain picks the canonical match id. Nakama file talks to `matchList` / `matchCreate` / storage. |
| `STARTER_ZONE_ID` vs content `zones` map | Runtime still keys `content.zones["zone.starter"]` instead of iterating the catalog. Catalogued as architectural hard-coding. |
| Dialogue `do QuestService.request_accept("quest.slime_problem")` | Presentation script owns the ID string; server still validates. Must move to content-driven choices later. |
| `DialoguePresenter` balloon path `res://addons/dialogue_manager/example_balloon/example_balloon.tscn` | Presentation-only; still a vendor example scene. Do not treat as a second dialogue system. |
| `ContentCatalog.REQUIRED_IDS` | Client boot refuses catalogs missing Prompt 18 IDs. Duplicates content-build’s source set. Later generalization must drop the fixed list. |
| Wallet vs storage | Gold is Nakama wallet, not a storage object. Inventory/quest/equipment are storage. Turn-in uses both in one `multiUpdate`. |
| E2E vs `NetworkService` | E2E uses `NakamaNetworkBackend` directly so it can open two identities. Graphical play uses `NetworkService`. Both send the same opcodes. |

No module other than Nakama adapters may access persistence. No client module may write canonical storage or wallet.
