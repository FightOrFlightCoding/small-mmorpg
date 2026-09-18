# Current NPC conflicts (NPC-01)

All previously recorded implementation/target-contract differences are closed in NPC-01. No BLOCKING or unexplained DEFERRED rows remain. NPC-02 is not started.

| ID | Status | Evidence | Resolution |
| --- | --- | --- | --- |
| NPC-C01 | RESOLVED | `movement.ts` has no `npcAabbs`; `collisionsWithPlayers` takes players only; `match_loop.ts` no longer passes `state.npcs`. `npc_avatar.tscn` has a non-monitoring `InteractionArea`. `server/tests/movement.test.ts` `npcs do not block movement`. | NPCs are interaction-area affordances, not gameplay collision bodies. |
| NPC-C02 | RESOLVED | `World._unhandled_input` right-click calls `try_interact_at`; keyboard `interact` still calls `try_interact`. Both send `INTERACT { targetId, requestId }`. `client/tests/app/interaction_client_test.gd`. | Right click is the default interact pick; keyboard remains the accessibility path. |
| NPC-C03 | RESOLVED | `content/source/npc.test_innkeeper.json` and `npc.lab_trainer.json` author `respec`. `RESPEC_TRAINER_NPC_IDS` / `overlayRespecService` deleted. `evaluateTrainerNpc` uses `resolveInteraction` + `NPC_SERVICE_RESPEC`. | Respec eligibility is validated NPC content, not an ID overlay. No trainer class. |
| NPC-C04 | RESOLVED | Elder/proof/cert `.dialogue` files call `QuestService.request_accept_offered()` / `request_turn_in_offered()` with no quest/NPC literals. Helpers read `quest_offer` / `quest_turn_in` from content. Server `applyQuestAccept` / `applyQuestTurnIn` still validate. | Dialogue action bindings are content metadata; spoken text is unchanged. |
| NPC-C05 | RESOLVED | Match-owned `MatchPlayer.interactionSession` (`active`/`closed`) plus static NPC poses on `FULL_STATE`. No client pose authority. No new opcode. Cosmetic `MOVING` remains unused because poses are still static. | Session record exists in the match. Movement stays idle/static without a second entity system. |
| NPC-C06 | RESOLVED | `handleInteract`, `evaluateTrainerNpc`, `authorizeVendor`, inn/healer, cave enter/exit, and quest accept/turn-in pass `requiredService` into `resolveInteraction`. | One generic service gate; existing owners keep reward/idempotency rules. |
| NPC-C07 | RESOLVED | `interactByRequestId` replays the prior `INTERACTION_RESULT` and skips `applyTalkObjectives`. `server/tests/interaction.test.ts` `repeated interact request id replays without reapplying talk objectives`. Quest rewards stay on `QUEST_TURN_IN`. | INTERACT replay is presentation-idempotent; talk evaluation is not re-run. |

## Hard-coded behavior summary

The NPC catalog is data-defined, including the generic `respec` service. Remaining ID literals belong to tests, cert fixtures, and `ContentCatalog.REQUIRED_IDS`. Prompt 18 elder spoken lines are unchanged. Progression formulas, merchant prices, quest rewards, opcodes, and vendor addons are unchanged.
