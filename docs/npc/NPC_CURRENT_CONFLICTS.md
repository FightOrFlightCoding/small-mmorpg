# Current NPC conflicts (NPC-01)

These are observed implementation/target-contract differences. They are recorded, not fixed, by NPC-01 so the accepted player journey remains unchanged.

| ID | Status | Evidence | Required resolution |
| --- | --- | --- | --- |
| NPC-C01 | Open migration debt | `movement.ts` exports `npcAabbs`; `collisionsWithPlayers` appends them; `match_loop.ts` passes `state.npcs`. | A named NPC movement/collision phase must remove NPCs from gameplay collision and use interaction-area affordances. |
| NPC-C02 | Open migration debt | `World.try_interact()` responds to the keyboard interaction action; mouse handling currently reserves left click for friendly-player selection and has no right-click interaction. | A named NPC UI/input phase must make right click the default interact affordance while retaining accessibility input and the same server intent. |
| NPC-C03 | Open migration debt | `canonical_respec.ts` and `npc.ts` contain `RESPEC_TRAINER_NPC_IDS` for `npc.test_innkeeper`/`npc.lab_trainer`; `npc.lab_trainer` itself has only `dialogue` in source. | Move respec eligibility fully into validated NPC content and delete the ID overlay without creating a trainer class. |
| NPC-C04 | Open migration debt | `npc.elder.dialogue`, proof-giver, and cert-quartermaster scripts contain literal quest/NPC IDs and call client service methods. | Replace literal dialogue action bindings with validated content/action metadata in a named dialogue-content migration; preserve server quest validation. |
| NPC-C05 | Target model not yet implemented | No explicit server interaction-session record; static NPC pose is sent in `FULL_STATE`, not ordinary snapshots. | Add the documented session/movement state models only in a named implementation phase, with no client-owned pose or reward authority. |
| NPC-C06 | Dormant authorization path | `interaction.ts` implements `requiredService` plus level/class/party/prerequisite gates, but no current caller supplies `requiredService`; individual service opcodes perform their own checks. | Either route future session/service authorization through this generic gate or remove/consolidate it in a named refactor; do not create parallel authorization rules. |
| NPC-C07 | Correlation is not interaction idempotency | Repeated successful `INTERACT` request IDs may rerun `talk_to_npc` objective evaluation; it is normally a no-op once an objective is complete. | A future session state machine must define replay semantics explicitly and preserve quest reward idempotency without treating dialogue presentation as a reward transaction. |

## Hard-coded behavior summary

The existing NPC catalog is already data-defined. The remaining hard-coded uses are localized to Prompt 18 presentation, test/cert fixtures, and the respec overlay above. `npc.elder` dialogue and test journey behavior are frozen. NPC-01 does not change NPC ID lists, content hash, progression formulas, class behavior, merchant pricing, quest rewards, or any dialogue text.

The audit check intentionally locks the current NPC movement-blocker debt to its two existing domain locations. That is a containment guard, not approval of the behavior: the resolving phase must update both the runtime and the audit/this register together.
