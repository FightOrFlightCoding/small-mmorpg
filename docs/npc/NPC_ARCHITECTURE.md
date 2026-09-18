# NPC architecture contract (NPC-01)

**Last accepted gameplay/progression phase:** PROG-15 — Deterministic Balance Simulator and Final Progression Certification.  
**Current requested phase:** NPC-01 — architecture contract plus minimum closures so the recorded conflicts are true of the runtime. Do not start NPC-02.

NPC-01 does not add NPC types, cosmetic patrol routes, public-world sharding, PvP, guilds, or a second quest/inventory/dialogue/combat system. It keeps the accepted elder/quest journey and progression formulas.

## Ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| NPC content | `content/schemas/npc.json`, `content/source/npc.*.json`, `tools/content-build` | Stable IDs, presentation ID, zone pose, interaction range, dialogue ID, and typed services. Generated bundle/catalog are derived artifacts. |
| Runtime instances | `server/src/domain/match_state.ts` | `MatchNpc` carries ID, pose, zone, interaction range, and dialogue ID only. One placement per NPC ID in a zone. |
| Movement | `movement.ts`, `match_loop.ts` | NPCs are noncombat and have no gameplay collision. Cosmetic movement, if added later, is server-coordinated. Interaction is an `Area2D` presentation affordance; server distance remains authoritative. |
| Interaction sessions | `interaction.ts`, `match_loop.ts` | Server validates live NPC, zone, server poses, range, and `requiredService` gates, then records match-owned `interactionSession` / `interactByRequestId`. `INTERACTION_RESULT` is presentation, not a reward transaction. |
| Dialogue state | `DialoguePresenter` / `DialogueCatalog` / `QuestService` offered helpers | Client presentation only, opened after matching successful `INTERACTION_RESULT`. Dialogue scripts request existing services; they do not own canonical quests, inventory, currency, or progression. |
| Quest bindings | `quest.ts`, `quest_objectives.ts`, `quest_reward.ts` | Existing generic quest engine validates accept/turn-in NPC and service; no NPC-specific quest engine. |
| Merchant stock | `vendor.ts`, `transaction.ts`, `vendor` content | Static content stock and server-computed price/sell value; transactions use the existing atomic boundary. |
| Client rendering | `EntityRegistry`, `NpcAvatar`, `ContentRegistry`, asset manifest | Render authoritative NPC snapshots/full state by stable ID. Missing visuals fall back visibly. |
| Quest markers | Future `WorldHud`/presentation extension | Derived only from server quest views plus content; never a client quest-state authority. |
| Transactions | `quest_reward.ts`, `vendor.ts`, `inn.ts`, `transaction.ts`, Nakama stores | Rewarding operations remain idempotent and server-persisted; the NPC is only a validated service gate. |

## Authority boundary

The Godot client may choose a nearby NPC for usability (right-click default, keyboard accessibility) and send `INTERACT { targetId, requestId }`; it may render dialogue and panels after server approval. The Nakama match remains authoritative for NPC existence, server pose, interaction range, quest eligibility/progress/rewards, stock, prices, inventory, wallet gold, healing, binding, cave tickets, and trainer respec cost/results.

NPCs are a distinct noncombat entity family. They have no HP, threat, combat effects, hostile/friendly target slot, AoE membership, or gameplay collision. Interaction is an `Area2D`-style presentation affordance/range hint, with server distance validation as the authority. Clients never submit NPC transforms.

## Existing modules to extend

Extend `npc.ts`, `interaction.ts`, `match_state.ts`, `match_loop.ts`, `EntityRegistry`, `InteractIntent`, `DialoguePresenter`, the generic quest/vendor/inn/cave/respec owners, and the existing content build/audit tools. Do not add elder, merchant, innkeeper, trainer, quest, inventory, currency, dialogue, combat, or account subsystems.

NPCs stay out of `targeting.ts`, enemy AI, and combat events. They are exposed from `FULL_STATE.npcs`. Ordinary `SNAPSHOT` traffic does not include them while poses remain static.

## NPC-01 change inventory

NPC-01 originally recorded the contract. Conflict closure additionally updates NPC source `respec` services, generated catalogs (content hash), server interaction/collision/session/replay, client interact/dialogue helpers, foundation audit, tests, and `docs/npc/*` plus `docs/PROGRESS.md`. It does not change opcodes/RPCs, storage collections, migrations, dependencies, progression formulas, or `client/addons/`.
