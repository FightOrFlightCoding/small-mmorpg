# NPC content model (NPC-03)

NPC definitions use `content/schemas/npc.json` (title `npc_definition`) and are authored under `content/source/`. Shared companion schemas are `npc_route.json`, `npc_service_binding.json`, `npc_quest_binding.json`, `dialogue_definition.json`, and `vendor.json` (title `vendor_definition`). The NPC schema is strict (`additionalProperties: false`) and requires `id`, `kind: "npc"`, `displayName`, `displayNameKey`, `visualId`, `zoneId`, `position`, `homePosition`, `routeId`, `interactionRange`, `dialogueId`, and one or more services. Content generation validates stable IDs, correct zone, route references, waypoint graphs, bounded distance from home, positive speed, dwell ranges, visual/dialogue assets, zone placement/pose agreement, service/dialogue/quest/vendor references, and duplicate placement IDs.

Prompt snake_case names map to existing camelCase content JSON: `npc_id` → `id`, `display_name_key` → `displayNameKey`, `zone_id` → `zoneId`, `home_position` → `homePosition`, `route_id` → `routeId`, `interaction_range` → `interactionRange`, `visual_asset_id` → `visualId`.

## Routes

`npc_route` documents use prefix `route.`. Types:

| `routeType` | Graph | NPC-03 runtime |
| --- | --- | --- |
| `stationary` | No waypoints or edges | Pose stays at `homePosition` |
| `loop` | Ordered waypoints (≥2); last returns to first | Straight-line segments in order |
| `ping_pong` | Ordered waypoints (≥2); reverse at ends | Straight-line segments, reverse at ends |
| `weighted_route_graph` | Named waypoints plus positive-weight directed edges; connected with out-degree ≥ 1 | Next node chosen from authored outgoing edges |

Waypoint `x`/`y` are offsets from the NPC `homePosition`. Every waypoint must satisfy `hypot(x, y) ≤ maxDistanceFromHome`. `speed` is a positive number. `dwellMin` ≤ `dwellMax`, both ≥ 0. Optional in-memory `speedMin` (not authored on production routes) rolls speed within `[speedMin, speed]`. Cosmetic patrols tick in the match; they are not persisted.

Production NPCs, including the elder and respec trainers, reference `route.stationary`.

## Service catalog

| Service | Existing owner | Content references |
| --- | --- | --- |
| `dialogue` | `DialoguePresenter` | `dialogueId` (client-local `.dialogue` mapping; `dialogue_definition` is the shared ID schema, not a hashed kind) |
| `quest_offer` / `quest_turn_in` | `quest.ts` | `questIds` (`npc_quest_binding`) |
| `vendor` | `vendor.ts` | required `vendorId` |
| `inn` / `healer` | `inn.ts` | optional cost, heal/resource/bind flags |
| `cave_entrance` / `cave_exit` | `cave.ts`, `inn.ts` gate | optional party/prerequisite fields |
| `respec` | `canonical_respec.ts` | authored service gate; no ID overlay |

Service `minLevel`, `classRequirements`, `requireParty`, and required quest status are server-authorized gates via `resolveInteraction`. Prices belong to vendor item stock and sell multipliers, not NPC dialogue or client requests. Dialogue file paths remain client-local mappings keyed by `dialogueId`; no asset path crosses protocol or storage.

## Current NPC catalog

| IDs | Classification | Notes |
| --- | --- | --- |
| `npc.elder`, `npc.proof_giver`, `npc.cert_quartermaster` | Correct content references | Production starter-zone definitions on `route.stationary`. Elder carries the accepted slice quest bindings. Dialogue actions resolve those bindings from services. |
| `npc.test_vendor`, `npc.test_innkeeper`, `npc.test_herald`, `npc.test_cave_portal`, `npc.test_cave_exit` | Test/cert fixture content | Generic service coverage and cert journey fixtures. `npc.test_innkeeper` authors `respec` and is migrated onto the generic NPC definition in NPC-02 (not deferred). |
| `npc.lab_keeper`, `npc.lab_vendor`, `npc.lab_inn`, `npc.lab_trainer`, `npc.lab_exit` | Development-only test fixtures | Excluded from the production generated bundle with `test.zone.systems_lab`. `npc.lab_trainer` authors `respec` and is also on the generic definition in this phase. |

## Respec trainer compatibility

Respec trainers already exist as generic NPCs with an authored `respec` service (NPC-01 closed the ID overlay). NPC-02 migrates them now: they gain `homePosition` and `routeId` like every other NPC, keep `respec`, and do not wait for a later compatibility phase.

## Hard-coded NPC ID audit

| ID/use | Classification | Required future migration |
| --- | --- | --- |
| NPC IDs in `content/source`, generated content, zone placement, visual map, and dialogue map | Correct content reference | Keep stable ID references; generated artifacts are never hand-edited. |
| `npc.elder` in `ContentCatalog.REQUIRED_IDS` and slice/cert driver | Temporary vertical-slice assumption / test fixture | Replace fixed required-ID assumptions through a later content/presentation migration if the slice ID set expands. |
| `npc.test_*` and `npc.lab_*` literals in tests and debug/cert journeys | Test fixture | Keep only in test/development paths; do not treat them as a production NPC class hierarchy. |

No NPC identifier may be treated as an authority grant. Unknown IDs, missing service references, and unknown service types are rejected by content/protocol validation.
