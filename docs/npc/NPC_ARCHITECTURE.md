# NPC architecture contract (NPC-03)

**Last accepted gameplay/progression phase:** PROG-15 — Deterministic Balance Simulator and Final Progression Certification.  
**Current requested phase:** NPC-03 — cosmetic route movement and synchronization (accepted). Do not start NPC-04.

NPC-03 extends the NPC-02 contract. It does not add NPC types, public-world sharding, PvP, guilds, or a second quest/inventory/dialogue/combat system. It keeps the accepted elder/quest journey and progression formulas.

## Ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| NPC content | `content/schemas/npc.json` (title `npc_definition`), `npc_route.json`, `npc_service_binding.json`, `npc_quest_binding.json`, `dialogue_definition.json`, `vendor.json` (title `vendor_definition`), `content/source/` | Stable IDs, `displayNameKey`, zone, `homePosition`, `routeId`, interaction range, `visualId`, typed services. Generated bundle/catalog are derived artifacts. |
| Runtime instances | `npc.ts` `NpcRuntimeInstance`, `match_state.ts` `MatchNpc` alias | One generic noncombat actor per placement. Pose, home, route id, interaction range, dialogue id, visual id. No HP, threat, AI, or collision fields. |
| Movement | `npc_movement.ts`, `match_loop.ts` | Server owns the cosmetic plan (current/next node, revision, segment endpoints and times, idle-until, deterministic RNG). Clients interpolate from match ticks. No collision resolution or pathfinding. Pause/resume exist for later interaction and are not wired to `INTERACT`. |
| Interaction sessions | `interaction.ts`, `match_loop.ts` | Server validates live NPC, zone, server poses, range, and `requiredService` gates, then records match-owned `interactionSession` / `interactByRequestId`. `INTERACTION_RESULT` is presentation, not a reward transaction. |
| Dialogue state | `DialoguePresenter` / `DialogueCatalog` / `QuestService` offered helpers | Client presentation only, opened after matching successful `INTERACTION_RESULT`. Dialogue scripts remain client-local mappings keyed by `dialogueId`; `dialogue_definition` is the shared schema for that ID contract. |
| Quest bindings | `quest.ts`, `quest_objectives.ts`, `quest_reward.ts`, `npc_quest_binding` | Existing generic quest engine validates accept/turn-in NPC and service; elder `quest.slime_problem` stays on the generic NPC definition. |
| Merchant stock | `vendor.ts`, `transaction.ts`, `vendor_definition` | Static content stock and server-computed price/sell value; transactions use the existing atomic boundary. |
| Client rendering | `EntityRegistry`, `NpcAvatar`, `ContentRegistry`, asset manifest | One generic `NpcAvatar`: `Node2D`, placeholder square, name label, marker anchor, interaction-only `Area2D`, no physics body. |
| Quest markers | `NpcAvatar` `MarkerAnchor` plus future HUD | Derived only from server quest views plus content; never a client quest-state authority. |
| Transactions | `quest_reward.ts`, `vendor.ts`, `inn.ts`, `transaction.ts`, Nakama stores | Rewarding operations remain idempotent and server-persisted; the NPC is only a validated service gate. |

## Authority boundary

The Godot client may choose a nearby NPC for usability (right-click default, keyboard accessibility) and send `INTERACT { targetId, requestId }`; it may render dialogue and panels after server approval. The Nakama match remains authoritative for NPC existence, server pose, interaction range, quest eligibility/progress/rewards, stock, prices, inventory, wallet gold, healing, binding, cave tickets, and trainer respec cost/results.

NPCs are a distinct noncombat entity family. They have no HP, threat, combat effects, hostile/friendly target slot, AoE membership, or gameplay collision. Targeting, threat, damage, healing, death, and loot pipelines reject NPC ids. Interaction is an `Area2D`-style presentation affordance/range hint, with server distance validation as the authority. Clients never submit NPC transforms.

## Existing modules to extend

Extend `npc.ts`, `npc_movement.ts`, `interaction.ts`, `match_state.ts`, `match_loop.ts`, `targeting.ts`, `threat.ts`, `combat_pipeline.ts`, `EntityRegistry`, `NpcAvatar`, `InteractIntent`, `DialoguePresenter`, the generic quest/vendor/inn/cave/respec owners, and the existing content build/audit tools. Do not add elder, merchant, innkeeper, trainer, quest, inventory, currency, dialogue, combat, or account subsystems.

NPCs stay out of hostile/friendly combat targeting, AoE combat queries, enemy AI, threat, damage, healing, death, and loot. They are exposed from `FULL_STATE.npcs` with public movement plans. Ordinary `SNAPSHOT` traffic includes NPC plans only when a movement revision changes.

## NPC-03 change inventory

Server-coordinated cosmetic route movement for `stationary`, `loop`, `ping_pong`, and `weighted_route_graph`. Randomization may affect only the next authored route choice, speed within content bounds, dwell within content bounds, and initial start delay. NPCs never select arbitrary world positions. Late joiners reconstruct the current interpolated pose from `FULL_STATE`. Movement is match-lifetime only and is not persisted. Production NPCs, including the elder, remain on `route.stationary`. No new opcodes/RPCs, storage collections, migrations, dependencies, progression formulas, or `client/addons/`.
