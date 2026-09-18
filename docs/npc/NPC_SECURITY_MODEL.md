# NPC security model (NPC-06)

The client is an untrusted presenter. Conflict closure does not change the server-authoritative model.

| Threat | Server control |
| --- | --- |
| Fabricated or remote interaction | `interaction.ts` resolves only a current match NPC and checks same zone, player health, server-pose Euclidean range, character ownership, not link-dead, not transferring, and optional `requiredService`. |
| Local dialogue opened without approval | `DialoguePresenter` opens only after a matching `INTERACTION_RESULT`; missing resources and rejected codes show a visible error. |
| Forged dialogue choice | `DIALOGUE_CHOOSE` requires a live `interactionSessionId`. The server evaluates allowed option ids from content conditions and rejects unknown, gated, or expired options. |
| Quest completion/reward injection | Canonical quest engine owns state/objectives. Accept and turn-in require a live `interactionSessionId` (same `requestId` may replay). |
| Merchant price or gold spoof | `VENDOR_BUY` fields are `interactionSessionId`, `npcInstanceId`, `itemId`, optional `quantity`, and `requestId` only. Client `price` is `unknown_field`; `gold` / `resultingBalance` are `stat_injection`. Server content stock, wallet, inventory capacity, and `nk.multiUpdate` transaction path decide price and result. Same `requestId` replays without a second grant. |
| Inn, cave, or respec result spoof | Existing service owners validate NPC service through `resolveInteraction`; server computes health/resources/bind, tickets, cost, and progression result. |
| Unknown service/action | Strict NPC schema and content-build validation reject unknown service types and dialogue scripts. Live graphs have no arbitrary scripts. |
| INTERACT / choose / close replay | Per-opcode `requestId` maps replay presentation results and do not re-apply talk objectives or grant rewards. |
| Interact flood | `INTERACT`, `DIALOGUE_CHOOSE`, and `INTERACTION_CLOSE` share the interact rate bucket (8 / 10 ticks). Vendor buy/sell share the vendor bucket. |
| NPC combat abuse | `targeting.ts`, `threat.ts`, and `combat_pipeline.ts` admit only players/enemies. `isNpcRuntimeId` rejects NPC ids for hostile/friendly slots, AoE queries, threat, damage, and healing. |
| Client NPC movement | No client protocol accepts NPC pose, route, velocity, or movement completion. The server sends plans; clients interpolate. `rngState` is never published. |
| NPC as a movement wall | NPCs are not gameplay AABBs. Interaction areas are presentation-only. Cosmetic travel does not use `resolveMove` or pathfinding. |

## Required invariants

- Canonical quest, inventory, equipment, currency, progression, and transaction state remain server-owned (`permissionWrite: 0` where storage applies).
- Dialogue presentation is client-local and cannot become a canonical state store. The server returns node/option/service ids; the client localizes text.
- Merchant prices are content/server values only; the client may render catalog stock but never submit price/gold/resulting balance.
- Vendor stock is static and unlimited. There is no client-trusted scarcity or fluctuating price.
- NPCs are noncombat: no HP, threat, AoE/line/cone targeting membership, hostile/friendly target slot, combat collision, damage, healing, death, or loot.
- NPC interaction is an interaction-area affordance plus server range validation, not a physical gameplay blocker.
- Right-click default interaction is the configurable `interact_pointer` action and must invoke the same `INTERACT` intention/validation as keyboard accessibility interaction.
- Cosmetic NPC movement is match-lifetime only and must not be written to persistent storage.
- Later NPC service actions require `interactionSessionId`, `npcInstanceId`, and `requestId` in addition to that service's existing validation.
- Quest markers are presentation of server `npcQuestMarkers` only. The client never submits a marker, quest status, or reward.
