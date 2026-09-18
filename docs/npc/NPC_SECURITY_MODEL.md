# NPC security model (NPC-02)

The client is an untrusted presenter. Conflict closure does not change the server-authoritative model.

| Threat | Server control |
| --- | --- |
| Fabricated or remote interaction | `interaction.ts` resolves only a current match NPC and checks same zone, player health, server-pose Euclidean range, and optional `requiredService`. |
| Local dialogue opened without approval | `DialoguePresenter` opens only after a matching successful `INTERACTION_RESULT`; missing resources show a visible error. |
| Quest completion/reward injection | Existing quest engine owns state/objectives; turn-in revalidates NPC/range/service and uses the transaction boundary. Dialogue offered helpers still send `QUEST_ACCEPT` / `QUEST_TURN_IN`. |
| Merchant price or gold spoof | Vendor request fields contain IDs/quantity/request ID only. Server content stock, sell multiplier, wallet, and `nk.multiUpdate` transaction path decide price and result. |
| Inn, cave, or respec result spoof | Existing service owners validate NPC service through `resolveInteraction`; server computes health/resources/bind, tickets, cost, and progression result. |
| Unknown service/action | Strict NPC schema and content-build validation reject unknown service types; audit restricts dialogue `do` actions to project-owned presentation services. |
| INTERACT replay | `interactByRequestId` replays presentation results and does not re-apply talk objectives or grant rewards. |
| NPC combat abuse | `targeting.ts`, `threat.ts`, and `combat_pipeline.ts` admit only players/enemies. `isNpcRuntimeId` rejects NPC ids for hostile/friendly slots, AoE queries, threat, damage, and healing. `NpcRuntimeInstance` has no HP, threat, AI state, or combat effects. |
| Client NPC movement | No client protocol accepts NPC pose, route, velocity, or movement completion. |
| NPC as a movement wall | NPCs are not gameplay AABBs. Interaction areas are presentation-only (`monitoring`/`monitorable` false). |

## Required invariants

- Canonical quest, inventory, equipment, currency, progression, and transaction state remain server-owned (`permissionWrite: 0` where storage applies).
- Dialogue presentation is client-local and cannot become a canonical state store.
- Merchant prices are content/server values only; the client may render catalog stock but never submit price/gold.
- NPCs are noncombat: no HP, threat, AoE/line/cone targeting membership, hostile/friendly target slot, combat collision, damage, healing, death, or loot.
- NPC interaction is an interaction-area affordance plus server range validation, not a physical gameplay blocker.
- Right-click default interaction is presentation only and must invoke the same `INTERACT` intention/validation as keyboard accessibility interaction.
