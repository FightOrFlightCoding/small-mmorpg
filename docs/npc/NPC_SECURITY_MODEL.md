# NPC security model (NPC-07)

The client is an untrusted presenter. Certification does not change the server-authoritative model. Coverage lives in `npc_security.test.ts` plus existing protocol, vendor, quest, and join tests.

| Threat | Server control |
| --- | --- |
| Forged NPC ID | `INTERACT` `targetId` must be a live match NPC. Unknown ids are `invalid_target`. |
| Forged session ID | `DIALOGUE_CHOOSE` / close / accept / turn-in / buy require a match-owned `interactionSessionId`. Unknown ids are `invalid_session`. |
| Foreign session | Session owner must be the calling player. Another player's id is `invalid_session`. |
| Expired session | TTL (`INTERACTION_SESSION_TTL_TICKS` = 300) marks `expired`. Later actions are `session_expired`. |
| Wrong match | Sessions are not transferred. A session id from another match is `invalid_session`. |
| Out of range | Server Euclidean distance vs current interpolated pose and authored `interactionRange`. `out_of_range`. |
| Dead character | `player_dead`. Session invalidates. |
| Link-dead character | Unexpected disconnect holds the avatar 10 s (`LINK_DEAD_TICKS` = 100) and marks the session `invalidated`. Interact/choose/close are `link_dead`; vendor buy is `ACTION_RESULT` `link_dead`. |
| Transfer | Issued/pending transfer rejects interact (`already_transferring`). Leave invalidates the session and resumes the NPC. |
| Dialogue option injection | Allowed option ids come from content conditions on the live node. Unknown/gated options are `invalid_option`. |
| Unknown service | Strict schema plus live `requiredService` / vendor bind. Dialogue-only NPCs reject `VENDOR_BUY` as `invalid_service`. |
| Quest-state injection | Client `status` / gold / completion keys are `unknown_field` / `stat_injection`. Canonical quest engine owns state. |
| Quest reward replay | Same successful `requestId` replays without a second gold/XP/item grant. |
| Merchant price spoof | Client `price` is `unknown_field:price`. Server stock `buyPrice` is the only price. |
| Merchant item injection | Item must be on that NPC's vendor stock. Off-stock ids are `invalid_id`. |
| Merchant quantity abuse | Omitted quantity means 1. 0, negative, non-integer, and values above 99 are `invalid_amount`. |
| Duplicate transaction | Inventory `mutationByRequestId` replays a successful vendor `requestId` without a second grant. |
| Interaction spam | `INTERACT` / choose / close share the interact bucket (8 / 10 ticks). Excess is `rate_limited`. |
| Oversized payload | Client match bodies > 2048 bytes are `payload_too_large`. |
| Unknown fields | Strict parse: `unknown_field:<key>`. Outcome keys are `stat_injection:<key>`. |
| Protocol mismatch | Join `protocolVersion` must be `"1"`. Else `protocol_mismatch`. |
| Content mismatch | Join `contentHash` must match the generated catalog. Else `content_mismatch`. |
| Fabricated or remote interaction | `interaction.ts` resolves only a current match NPC and checks same zone, player health, range, ownership, not link-dead, not transferring, and optional `requiredService`. |
| Local dialogue opened without approval | `DialoguePresenter` opens only after a matching `INTERACTION_RESULT`. |
| Inn, cave, or respec result spoof | Existing service owners validate NPC service through `resolveInteraction`; server computes results. |
| NPC combat abuse | `targeting.ts`, `threat.ts`, and `combat_pipeline.ts` admit only players/enemies. `isNpcRuntimeId` rejects NPC ids. |
| Client NPC movement | No client protocol accepts NPC pose, route, velocity, or movement completion. `rngState` is never published. |
| NPC as a movement wall | NPCs are not gameplay AABBs. Interaction areas are presentation-only. |

## Required invariants

- Canonical quest, inventory, equipment, currency, progression, and transaction state remain server-owned (`permissionWrite: 0` where storage applies).
- Dialogue presentation is client-local and cannot become a canonical state store. The server returns node/option/service ids; the client localizes text.
- Merchant prices are content/server values only; the client may render catalog stock but never submit price/gold/resulting balance.
- Vendor stock is static and unlimited. There is no client-trusted scarcity or fluctuating price.
- NPCs are noncombat: no HP, threat, AoE/line/cone targeting membership, hostile/friendly target slot, combat collision, damage, healing, death, or loot.
- NPC interaction is an interaction-area affordance plus server range validation, not a physical gameplay blocker.
- Right-click default interaction is the configurable `interact_pointer` action and must invoke the same `INTERACT` intention/validation as keyboard accessibility interaction.
- Cosmetic NPC movement is match-lifetime only and must not be written to persistent storage.
- Quest and merchant results persist across disconnect, restart, transfer, soft-delete/restore, and export. They do not survive account deletion.
- Later NPC service actions require `interactionSessionId`, `npcInstanceId`, and `requestId` in addition to that service's existing validation.
- Quest markers are presentation of server `npcQuestMarkers` only. The client never submits a marker, quest status, or reward.
