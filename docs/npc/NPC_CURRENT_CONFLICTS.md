# Current NPC conflicts (NPC-04)

All NPC-01, NPC-02, and NPC-03 conflict rows remain **RESOLVED**. NPC-04 wires interaction sessions and dialogue graphs without reopening combat, quest, or merchant ownership.

| ID | Status | Evidence | Resolution |
| --- | --- | --- | --- |
| NPC-C01 | RESOLVED | `movement.ts` has no `npcAabbs`; `collisionsWithPlayers` takes players only; cosmetic NPC travel does not call `resolveMove`. | NPCs are interaction-area affordances, not gameplay collision bodies. |
| NPC-C02 | RESOLVED | `interact_pointer` defaults to right mouse; keyboard `interact` remains the same `INTERACT` intention. | Unchanged protocol field `targetId`. |
| NPC-C03 | RESOLVED | Authored `respec` on `npc.test_innkeeper` / `npc.lab_trainer`. | Unchanged. |
| NPC-C04 | RESOLVED | Elder quest bindings stay on generic NPC services; spoken Prompt 18 text is unchanged. | Accept/turn-in remain service buttons, not scripts. |
| NPC-C05 | RESOLVED | Match-owned `interactionSession`; first live session pauses movement; last close/expiry resumes. | Multiple players may interact at once. |
| NPC-C06 | RESOLVED | Existing service owners still use `resolveInteraction` `requiredService`. | Unchanged. |
| NPC-C07 | RESOLVED | `interactByRequestId` / `dialogueChoiceByRequestId` / `interactionCloseByRequestId` replay presentation results. | Talk objectives are not re-applied. |

## Hard-coded behavior summary

The NPC catalog is one generic definition plus optional `npc_route` and hashed `dialogue` graphs. Remaining ID literals belong to tests, cert fixtures, and `ContentCatalog.REQUIRED_IDS`. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.
