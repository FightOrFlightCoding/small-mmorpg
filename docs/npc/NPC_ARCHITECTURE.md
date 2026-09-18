# NPC architecture contract (NPC-06)

**Last accepted gameplay/progression phase:** PROG-15 — Deterministic Balance Simulator and Final Progression Certification.  
**Last accepted NPC phase:** NPC-05 — Quest integration.  
**Current requested phase:** NPC-06 — Merchant integration.

NPC-06 extends the NPC-05 contract. It does not add NPC types, public-world sharding, PvP, guilds, or a second shop/inventory/currency/transaction system. It reuses canonical `vendor.ts` / `transaction.ts` / wallet / inventory. It keeps the accepted elder/quest journey, Prompt 18 merchant prices, and `VENDOR_SELL`.

## Ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| NPC content | `content/schemas/npc.json` (title `npc_definition`), `npc_route.json`, `npc_service_binding.json`, `npc_quest_binding.json`, `dialogue_definition.json`, `vendor.json` (title `vendor_definition`), `content/source/` | Stable IDs, `displayNameKey`, zone, `homePosition`, `routeId`, interaction range, `visualId`, typed services. Generated bundle/catalog are derived artifacts. Dialogue graphs are hashed `dialogue` documents. Vendor documents require `currencyId` `gold`. |
| Runtime instances | `npc.ts` `NpcRuntimeInstance`, `match_state.ts` `MatchNpc` alias | One generic noncombat actor per placement. Pose, home, route id, interaction range, dialogue id, visual id. No HP, threat, AI, or collision fields. |
| Movement | `npc_movement.ts`, `match_loop.ts` | Server owns the cosmetic plan. The first live interaction session on an NPC pauses movement and broadcasts the paused plan; the last close/expiry resumes the authored route. Multiple players may hold sessions at once. |
| Interaction sessions | `interaction.ts`, `match_loop.ts` | `INTERACT` creates a short-lived match-owned session. Dialogue choice, close, quest accept, quest turn-in, and vendor buy require `interactionSessionId`. `INTERACTION_RESULT` is presentation, not a reward transaction. |
| Dialogue state | `dialogue.ts`, `DialoguePresenter`, `NpcInteractionWindow` | Server evaluates content graphs and returns node/option/service ids. The client renders localized text. Opening the merchant UI suspends dialogue without closing the session; Back restores it. |
| Quest bindings | `quest.ts`, `quest_objectives.ts`, `quest_reward.ts`, `npc_quest_binding` | Canonical quest engine. Unchanged in NPC-06. |
| Merchant stock | `vendor.ts`, `transaction.ts`, `vendor_definition`, `MerchantWindow` | Static unlimited content stock, canonical server price, optional class/level locks. Buy is session-gated and atomic through the existing transaction boundary. Sell remains the accepted `VENDOR_SELL` path. |
| Client rendering | `EntityRegistry`, `NpcAvatar`, `ContentRegistry`, asset manifest | One generic `NpcAvatar`. Reusable `MerchantWindow` presents catalog, quantity, gold, Buy, result/error, and Back. |
| Quest markers | `NpcAvatar` `MarkerLabel`, `QuestService`, `FULL_STATE` / `QUEST_STATE` `npcQuestMarkers` | Unchanged. |
| Transactions | `quest_reward.ts`, `vendor.ts`, `inn.ts`, `transaction.ts`, Nakama stores | Rewarding operations remain idempotent and server-persisted; the NPC is only a validated service gate. |

## Authority boundary

The Godot client may choose a nearby NPC and send `INTERACT { targetId, requestId }`. `VENDOR_BUY` sends `{ interactionSessionId, npcInstanceId, itemId, quantity, requestId }` only. The client never submits price, gold, or resulting balance. The Nakama match remains authoritative for stock, canonical price, currency deduction, inventory grant, and audit.

NPCs are a distinct noncombat entity family. They have no HP, threat, combat effects, hostile/friendly target slot, AoE membership, or gameplay collision.

## Existing modules to extend

Extend `npc.ts`, `interaction.ts`, `match_state.ts`, `match_loop.ts`, `vendor.ts`, `VendorService`, `DialoguePresenter`, `MerchantWindow`, and the existing content build/audit tools. Do not add a second merchant, inventory, or currency subsystem.

## NPC-06 change inventory

`VENDOR_BUY` (19) requires `{ interactionSessionId, npcInstanceId, itemId, quantity?, requestId }`. The match validates a live session (same `requestId` may replay without one), NPC vendor bind, stock entry, positive bounded quantity (1–99), canonical server price, currency, inventory capacity, and item definition. Purchase deducts gold, grants the item, persists inventory and balance, writes `TX_REASON_VENDOR` audit, and returns canonical `INVENTORY_STATE` plus `WALLET_STATE`. Stock is static and unlimited. `VENDOR_SELL` is preserved. A new merchant is content-only (`vendor.*` plus an NPC `vendor` service). No new RPCs, storage collections, migrations, dependencies, progression formulas, or `client/addons/`. Do not start NPC-07.
