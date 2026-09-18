# Current NPC conflicts (NPC-07)

All NPC-01 through NPC-07 conflict rows remain **RESOLVED**. NPC-07 adds no new NPC types, opcodes, storage collections, or a second dialogue/quest/merchant engine.

| ID | Status | Evidence | Resolution |
| --- | --- | --- | --- |
| NPC-C01 | RESOLVED | `movement.ts` has no `npcAabbs`; `collisionsWithPlayers` takes players only; cosmetic NPC travel does not call `resolveMove`. | NPCs are interaction-area affordances, not gameplay collision bodies. |
| NPC-C02 | RESOLVED | `interact_pointer` defaults to right mouse; keyboard `interact` remains the same `INTERACT` intention. | Unchanged protocol field `targetId`. |
| NPC-C03 | RESOLVED | Authored `respec` on `npc.test_innkeeper` / `npc.lab_trainer`. | Unchanged. |
| NPC-C04 | RESOLVED | Elder quest bindings stay on generic NPC services; herald uses `offer_and_turn_in`; spoken Prompt 18 text is unchanged. | Accept/turn-in remain service buttons through canonical QuestService. |
| NPC-C05 | RESOLVED | Match-owned `interactionSession`; first live session pauses movement; last close/expiry/invalidation resumes, including persistence leave paths. | Multiple players may interact at once. |
| NPC-C06 | RESOLVED | Existing service owners still use `resolveInteraction` `requiredService`. Vendor buy also requires a live interaction session. | Unchanged owner modules. `vendor.ts` was not modified in NPC-07. |
| NPC-C07 | RESOLVED | `interactByRequestId` / `dialogueChoiceByRequestId` / `interactionCloseByRequestId` replay presentation results. Inventory `mutationByRequestId` replays vendor buys. | Talk objectives and purchases are not re-applied. |

## Hard-coded behavior summary

The NPC catalog is one generic definition plus optional `npc_route` and hashed `dialogue` graphs. Remaining ID literals belong to tests, cert fixtures, `npc.platform_*` proof content, and `ContentCatalog.REQUIRED_IDS`. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged. Vendor currency is authored `gold` to match the existing wallet. `VENDOR_SELL` is preserved. Creating an ordinary NPC is content work: definition → home → route → dialogue → quests → stock → validate → build.
