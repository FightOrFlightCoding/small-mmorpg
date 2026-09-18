# NPC architecture contract (NPC-01)

**Last accepted phase:** PROG-15 — Deterministic Balance Simulator and Final Progression Certification.  
**Current requested phase:** NPC-01 — audit and architecture contract only.

NPC-01 adds no gameplay behavior, protocol fields, persistence records, dependencies, or migrations. It records the extension boundary for a later, named NPC implementation phase while preserving the accepted elder/quest journey and all progression behavior.

## Ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| NPC content | `content/schemas/npc.json`, `content/source/npc.*.json`, `tools/content-build` | Stable IDs, presentation ID, zone pose, interaction range, dialogue ID, and typed services. Generated bundle/catalog are derived artifacts. |
| Runtime instances | `server/src/domain/match_state.ts` | `MatchNpc` carries ID, pose, zone, interaction range, and dialogue ID only. One placement per NPC ID in a zone. |
| Movement | Future NPC runtime owner; current match loop | Target state is server-coordinated cosmetic movement. NPCs are noncombat and must not acquire threat or become a combat target. Current movement-blocker debt is recorded in [NPC_CURRENT_CONFLICTS.md](NPC_CURRENT_CONFLICTS.md). |
| Interaction sessions | `interaction.ts` and `match_loop.ts` | Server validates live NPC, zone, server poses, range, service gates, and player state before returning `INTERACTION_RESULT`. A later owner adds explicit session state without creating a second quest or dialogue system. |
| Dialogue state | `DialoguePresenter` / `DialogueCatalog` | Client presentation only, opened after matching successful `INTERACTION_RESULT`. Dialogue scripts request existing services; they do not own canonical quests, inventory, currency, or progression. |
| Quest bindings | `quest.ts`, `quest_objectives.ts`, `quest_reward.ts` | Existing generic quest engine validates accept/turn-in NPC and service; no NPC-specific quest engine. |
| Merchant stock | `vendor.ts`, `transaction.ts`, `vendor` content | Static content stock and server-computed price/sell value; transactions use the existing atomic boundary. |
| Client rendering | `EntityRegistry`, `NpcAvatar`, `ContentRegistry`, asset manifest | Render authoritative NPC snapshots/full state by stable ID. Missing visuals fall back visibly. |
| Quest markers | Future `WorldHud`/presentation extension | Derived only from server quest views plus content; never a client quest-state authority. |
| Transactions | `quest_reward.ts`, `vendor.ts`, `inn.ts`, `transaction.ts`, Nakama stores | Rewarding operations remain idempotent and server-persisted; the NPC is only a validated service gate. |

## Authority boundary

The Godot client may choose a nearby NPC for usability and send `INTERACT { targetId, requestId }`; it may render dialogue and panels after server approval. The Nakama match remains authoritative for NPC existence, server pose, interaction range, quest eligibility/progress/rewards, stock, prices, inventory, wallet gold, healing, binding, cave tickets, and trainer respec cost/results.

NPCs are a distinct noncombat entity family. The target architecture gives them no HP, threat, combat effects, hostile/friendly target slot, AoE membership, or gameplay collision. Interaction is an `Area2D`-style presentation affordance/range hint, with server distance validation as the authority. Cosmetic movement is server-coordinated and clients interpolate it; clients never submit NPC transforms. Right click is the default interaction affordance in the future UI contract; keyboard interaction remains an accessibility shortcut.

## Existing modules to extend

Extend `npc.ts`, `interaction.ts`, `match_state.ts`, `match_loop.ts`, `EntityRegistry`, `InteractIntent`, `DialoguePresenter`, the generic quest/vendor/inn/cave/respec owners, and the existing content build/audit tools. Do not add elder, merchant, innkeeper, trainer, quest, inventory, currency, dialogue, combat, or account subsystems.

The current implementation already keeps NPCs out of `targeting.ts`, enemy AI, combat events, and snapshots. It exposes them from `FULL_STATE.npcs`; ordinary `SNAPSHOT` traffic currently does not include them because their poses are static. Later cosmetic motion must add server-authoritative NPC pose updates without turning NPCs into combatants.

## NPC-01 change inventory

NPC-01 changes only `docs/npc/NPC_*.md`, `tools/content-build/src/validate.ts`, `tools/content-build/tests/content-build.test.ts`, `tools/foundation-audit/audit.cjs`, and `docs/PROGRESS.md`. It does not change content source, generated bundle/catalog, server runtime behavior, client behavior, opcodes/RPCs, storage schemas, migrations, dependencies, or `client/addons/`.
