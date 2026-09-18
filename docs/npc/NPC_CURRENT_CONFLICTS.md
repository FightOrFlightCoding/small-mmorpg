# Current NPC conflicts (NPC-02)

All NPC-01 conflict rows remain **RESOLVED**. NPC-02 adds generic definitions, `NpcRuntimeInstance`, and placeholder rendering without reopening those rows.

| ID | Status | Evidence | Resolution |
| --- | --- | --- | --- |
| NPC-C01 | RESOLVED | `movement.ts` has no `npcAabbs`; `collisionsWithPlayers` takes players only; `NpcAvatar` has a non-monitoring `InteractionArea` and no physics body. | NPCs are interaction-area affordances, not gameplay collision bodies. |
| NPC-C02 | RESOLVED | Right-click interact pick uses the interaction-area radius; keyboard `interact` remains the same `INTERACT` intention. | Unchanged. |
| NPC-C03 | RESOLVED | Authored `respec` on `npc.test_innkeeper` / `npc.lab_trainer`; both are generic NPC definitions with `homePosition` / `routeId` in this phase. | Migrated now, not deferred. |
| NPC-C04 | RESOLVED | Elder quest bindings stay on generic NPC services; spoken Prompt 18 text is unchanged. | Unchanged quest behavior. |
| NPC-C05 | RESOLVED | Match-owned `interactionSession`; NPC poses stay static on `FULL_STATE` even though routes are authored. | Cosmetic ticking remains later. |
| NPC-C06 | RESOLVED | Existing service owners still use `resolveInteraction` `requiredService`. | Unchanged. |
| NPC-C07 | RESOLVED | `interactByRequestId` replay unchanged. | Unchanged. |

## Hard-coded behavior summary

The NPC catalog is one generic definition plus optional `npc_route`. Remaining ID literals belong to tests, cert fixtures, and `ContentCatalog.REQUIRED_IDS`. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

