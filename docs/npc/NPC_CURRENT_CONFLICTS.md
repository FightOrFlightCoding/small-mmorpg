# Current NPC conflicts (NPC-06)

All NPC-01 through NPC-06 conflict rows remain **RESOLVED**. NPC-06 reuses canonical vendor/transaction services without a second shop or currency engine.

| ID | Status | Evidence | Resolution |
| --- | --- | --- | --- |
| NPC-C01 | RESOLVED | `movement.ts` has no `npcAabbs`; `collisionsWithPlayers` takes players only; cosmetic NPC travel does not call `resolveMove`. | NPCs are interaction-area affordances, not gameplay collision bodies. |
| NPC-C02 | RESOLVED | `interact_pointer` defaults to right mouse; keyboard `interact` remains the same `INTERACT` intention. | Unchanged protocol field `targetId`. |
| NPC-C03 | RESOLVED | Authored `respec` on `npc.test_innkeeper` / `npc.lab_trainer`. | Unchanged. |
| NPC-C04 | RESOLVED | Elder quest bindings stay on generic NPC services; herald uses `offer_and_turn_in`; spoken Prompt 18 text is unchanged. | Accept/turn-in remain service buttons through canonical QuestService. |
| NPC-C05 | RESOLVED | Match-owned `interactionSession`; first live session pauses movement; last close/expiry resumes. | Multiple players may interact at once. |
| NPC-C06 | RESOLVED | Existing service owners still use `resolveInteraction` `requiredService`. Vendor buy also requires a live interaction session. | Unchanged owner modules. |
| NPC-C07 | RESOLVED | `interactByRequestId` / `dialogueChoiceByRequestId` / `interactionCloseByRequestId` replay presentation results. Inventory `mutationByRequestId` replays vendor buys. | Talk objectives and purchases are not re-applied. |

## Hard-coded behavior summary

The NPC catalog is one generic definition plus optional `npc_route` and hashed `dialogue` graphs. Remaining ID literals belong to tests, cert fixtures, and `ContentCatalog.REQUIRED_IDS`. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged. Vendor currency is authored `gold` to match the existing wallet. `VENDOR_SELL` is preserved.
