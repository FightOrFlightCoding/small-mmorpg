# NPC architecture contract (NPC-07)

**Last accepted gameplay/progression phase:** PROG-15 — Deterministic Balance Simulator and Final Progression Certification.  
**Last accepted NPC phase:** NPC-07 — Lifecycle, security, and final certification.  
**Current requested phase:** NPC-07 (accepted).

NPC-07 hardens and certifies NPC-01 through NPC-06. It does not add NPC types, opcodes, storage collections, RPCs, vendor addons, or a second dialogue/quest/merchant engine. Ordinary NPCs are content work. Prompt 18 elder spoken lines, slime rewards, and merchant prices are unchanged.

## Ownership

| Concern | Owner | Contract |
| --- | --- | --- |
| NPC content | `content/schemas/npc.json` (title `npc_definition`), `npc_route.json`, `npc_service_binding.json`, `npc_quest_binding.json`, `dialogue_definition.json`, `vendor.json` (title `vendor_definition`), `content/source/` | Stable IDs, `displayNameKey`, zone, `homePosition`, `routeId`, interaction range, `visualId`, typed services. Generated bundle/catalog are derived artifacts. Dialogue graphs are hashed `dialogue` documents. Vendor documents require `currencyId` `gold`. |
| Runtime instances | `npc.ts` `NpcRuntimeInstance`, `match_state.ts` `MatchNpc` alias | One generic noncombat actor per placement. Pose, home, route id, interaction range, dialogue id, visual id. No HP, threat, AI, or collision fields. |
| Movement | `npc_movement.ts`, `match_loop.ts`, `persistence.ts` | Server owns the cosmetic plan. The first live interaction session on an NPC pauses movement and broadcasts the paused plan; the last close, expiry, invalidation, disconnect, transfer, or leave resumes the authored route. Plans are match-lifetime only. |
| Interaction sessions | `interaction.ts`, `match_loop.ts` | `INTERACT` creates a short-lived match-owned session. Dialogue choice, close, quest accept, quest turn-in, and vendor buy require `interactionSessionId`. `INTERACTION_RESULT` is presentation, not a reward transaction. |
| Dialogue state | `dialogue.ts`, `DialoguePresenter`, `NpcInteractionWindow` | Server evaluates content graphs and returns node/option/service ids. The client renders localized text. Opening the merchant UI suspends dialogue without closing the session; Back restores it. |
| Quest bindings | `quest.ts`, `quest_objectives.ts`, `quest_reward.ts`, `npc_quest_binding` | Canonical quest engine. Quest results persist. |
| Merchant stock | `vendor.ts`, `transaction.ts`, `vendor_definition`, `MerchantWindow` | Static unlimited content stock, canonical server price, optional class/level locks. Buy is session-gated and atomic through the existing transaction boundary. Purchase results persist. Sell remains the accepted `VENDOR_SELL` path. |
| Client rendering | `EntityRegistry`, `NpcAvatar`, `ContentRegistry`, asset manifest | One generic `NpcAvatar`. Reusable `MerchantWindow` presents catalog, quantity, gold, Buy, result/error, and Back. |
| Quest markers | `NpcAvatar` `MarkerLabel`, `QuestService`, `FULL_STATE` / `QUEST_STATE` `npcQuestMarkers` | Unchanged. |
| Transactions | `quest_reward.ts`, `vendor.ts`, `inn.ts`, `transaction.ts`, Nakama stores | Rewarding operations remain idempotent and server-persisted; the NPC is only a validated service gate. |
| Lifecycle | `persistence.ts`, character/account stores | Disconnect, link-dead, safe leave, transfer, restart, soft-delete/restore, export, and deletion keep quest/inventory/gold and drop NPC pose/session. |

## Authority boundary

The Godot client may choose a nearby NPC and send `INTERACT { targetId, requestId }`. `VENDOR_BUY` sends `{ interactionSessionId, vendorId, stockEntryId, quantity, preferredSlot?, requestId, expectedRevision? }` only. The client never submits price, gold, resulting balance, quest status, NPC pose, or a fabricated session. The Nakama match remains authoritative for stock, canonical price, currency deduction, inventory grant, quest state, and audit.

NPCs are a distinct noncombat entity family. They have no HP, threat, combat effects, hostile/friendly target slot, AoE membership, or gameplay collision.

## Certified owners

Reuse `npc.ts`, `npc_movement.ts`, `interaction.ts`, `dialogue.ts`, `quest.ts`, `vendor.ts`, `match_state.ts`, `match_loop.ts`, `persistence.ts`, `VendorService`, `DialoguePresenter`, `MerchantWindow`, and the existing content build/audit tools. Do not add a second NPC class, protocol opcode, storage collection, UI scene, NPC script, transaction mechanism, quest handler, or movement implementation for an ordinary dialogue, quest-giver, or merchant NPC.

## NPC-07 change inventory

No new opcodes, RPCs, storage collections, migrations, dependencies, progression formulas, or `client/addons/`. Leave `vendor.ts` and existing vendor JSON unchanged; `vendor.platform_kiosk` is a new content document. Leave path, disconnect, transfer, and link-dead despawn call `refreshNpcPauses` immediately so the last usable session resumes cosmetic movement without waiting for the next tick.

Content-only proof (no runtime/protocol change required): `npc.platform_greeter`, `npc.platform_guide`, `npc.platform_quest`, `npc.platform_merchant`, `npc.platform_combined`, `route.platform_short_loop`, `route.platform_weighted`, `quest.platform_talk`, `quest.platform_combined`, `vendor.platform_kiosk`.
