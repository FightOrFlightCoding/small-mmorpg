# NPC architecture contract (NPC-05)

**Last accepted gameplay/progression phase:** PROG-15 — Deterministic Balance Simulator and Final Progression Certification.  
**Last accepted NPC phase:** NPC-05 — Quest integration.  
**Current requested phase:** NPC-05 (accepted). Do not start NPC-06.

NPC-05 extends the NPC-04 contract. It does not add NPC types, public-world sharding, PvP, guilds, or a second quest/inventory/dialogue/combat system. It reuses canonical `QuestService` / `quest.ts` / `quest_reward.ts`. It keeps the accepted elder/quest journey and progression formulas.

## Ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| NPC content | `content/schemas/npc.json` (title `npc_definition`), `npc_route.json`, `npc_service_binding.json`, `npc_quest_binding.json`, `dialogue_definition.json`, `vendor.json` (title `vendor_definition`), `content/source/` | Stable IDs, `displayNameKey`, zone, `homePosition`, `routeId`, interaction range, `visualId`, typed services. Generated bundle/catalog are derived artifacts. Dialogue graphs are hashed `dialogue` documents. |
| Runtime instances | `npc.ts` `NpcRuntimeInstance`, `match_state.ts` `MatchNpc` alias | One generic noncombat actor per placement. Pose, home, route id, interaction range, dialogue id, visual id. No HP, threat, AI, or collision fields. |
| Movement | `npc_movement.ts`, `match_loop.ts` | Server owns the cosmetic plan. The first live interaction session on an NPC pauses movement and broadcasts the paused plan; the last close/expiry resumes the authored route. Multiple players may hold sessions at once. |
| Interaction sessions | `interaction.ts`, `match_loop.ts` | `INTERACT` creates a short-lived match-owned session. Dialogue choice, close, quest accept, and quest turn-in require `interactionSessionId`. `INTERACTION_RESULT` is presentation, not a reward transaction. |
| Dialogue state | `dialogue.ts`, `DialoguePresenter`, `NpcInteractionWindow` | Server evaluates content graphs (lines, options, conditions, next-node refs, no scripts) and returns node/option/service ids. Quest dialogue states are `available`, `accepted`, `in_progress`, `ready`, `completed`, and `prerequisite_missing`. The client renders localized text. Quest/vendor/inn/cave/respec remain existing service owners. |
| Quest bindings | `quest.ts`, `quest_objectives.ts`, `quest_reward.ts`, `npc_quest_binding` | Canonical quest engine validates accept/turn-in. Bind types `quest_offer` / `offer`, `quest_turn_in` / `turn_in`, and `offer_and_turn_in`. Elder `quest.slime_problem` stays on the generic NPC definition. |
| Merchant stock | `vendor.ts`, `transaction.ts`, `vendor_definition` | Static content stock and server-computed price/sell value; transactions use the existing atomic boundary. |
| Client rendering | `EntityRegistry`, `NpcAvatar`, `ContentRegistry`, asset manifest | One generic `NpcAvatar`: `Node2D`, placeholder square, name label, marker anchor, interaction-only `Area2D`, no physics body. |
| Quest markers | `NpcAvatar` `MarkerLabel`, `QuestService`, `FULL_STATE` / `QUEST_STATE` `npcQuestMarkers` | Character-specific glyphs `!` available, `?` ready, `·` active incomplete. Priority ready > available > active incomplete > none. Never a client quest-state authority. Never on `SNAPSHOT`. |
| Transactions | `quest_reward.ts`, `vendor.ts`, `inn.ts`, `transaction.ts`, Nakama stores | Rewarding operations remain idempotent and server-persisted; the NPC is only a validated service gate. |

## Authority boundary

The Godot client may choose a nearby NPC for usability (configurable `interact_pointer`, right-mouse default, keyboard `interact`) and send `INTERACT { targetId, requestId }`; it may render the reusable NPC window after server approval. The Nakama match remains authoritative for NPC existence, server pose, interaction range, dialogue node/options, session lifetime, quest eligibility/progress/rewards, stock, prices, inventory, wallet gold, healing, binding, cave tickets, and trainer respec cost/results.

NPCs are a distinct noncombat entity family. They have no HP, threat, combat effects, hostile/friendly target slot, AoE membership, or gameplay collision. Targeting, threat, damage, healing, death, and loot pipelines reject NPC ids. Interaction is an `Area2D`-style presentation affordance/range hint, with server distance validation as the authority. Clients never submit NPC transforms.

## Existing modules to extend

Extend `npc.ts`, `npc_movement.ts`, `interaction.ts`, `match_state.ts`, `match_loop.ts`, `targeting.ts`, `threat.ts`, `combat_pipeline.ts`, `EntityRegistry`, `NpcAvatar`, `InteractIntent`, `DialoguePresenter`, the generic quest/vendor/inn/cave/respec owners, and the existing content build/audit tools. Do not add elder, merchant, innkeeper, trainer, quest, inventory, currency, dialogue, combat, or account subsystems.

NPCs stay out of hostile/friendly combat targeting, AoE combat queries, enemy AI, threat, damage, healing, death, and loot. They are exposed from `FULL_STATE.npcs` with public movement plans. Ordinary `SNAPSHOT` traffic includes NPC plans only when a movement revision changes.

## NPC-05 change inventory

`QUEST_ACCEPT` (6) and `QUEST_TURN_IN` (7) require `{ interactionSessionId, npcInstanceId, questId, requestId }`. The match reuses canonical `applyQuestAccept` / `applyQuestTurnIn`: session gate, NPC offer/turn-in bind, prerequisites, server-side objectives, idempotent accept, rewards once. Success returns canonical quest state plus accepted or completion dialogue on `INTERACTION_RESULT`. Character-specific markers refresh after accept, objective progress, completion, login, zone join, `FULL_STATE` resync, and character switch. `npc.test_herald` authors one `offer_and_turn_in` binding. A new quest NPC is content-only. No new RPCs, storage collections, migrations, dependencies, progression formulas, or `client/addons/`. Do not start NPC-06.
