# Security model

The client is an untrusted renderer. Mitigations are server-side. Related: [ARCHITECTURE.md](ARCHITECTURE.md), [NETWORK_PROTOCOL.md](NETWORK_PROTOCOL.md), [VERTICAL_SLICE.md](VERTICAL_SLICE.md).

## Expected attacks and required defenses

### Position spoofing

**Attack:** Client sends a world position or snaps itself across the map.

**Defense:** Movement messages are intentions. The match integrates movement, clamps to max speed, and resolves collision. Broadcast state uses server position only. Local prediction is display-only and is never accepted as an authoritative transform.

### Speed hacking

**Attack:** Client reports larger deltas than legal dt × speed.

**Defense:** Server applies its own dt and move speed from content. Excess intent is truncated or rejected. Time is server time.

### Damage spoofing

**Attack:** Client sends damage dealt or victim health.

**Defense:** Attack intent carries target ID and `requestId` only. Ability use carries ability ID, optional target entity or point, and `requestId` only. Damage, healing, range, cooldown, cast duration, resource cost, and effect duration exist only in match simulation. Duplicate `requestId` does not apply a second hit. Client `attack` / `attackBonus` / `xp` / `healing` / `castTime` / `cooldown` / `duration` fields are rejected.

### Cooldown bypassing

**Attack:** Client fires attack or ability intents faster than the weapon/skill cooldown.

**Defense:** Individual and global cooldown clocks live on the server. Early intents are rejected. Client cooldown UI is cosmetic.

### Item injection

**Attack:** Client writes storage objects or sends a grant list.

**Defense:** Canonical inventory storage uses `permissionWrite: 0`. Grant opcodes from the client are rejected. Only server loot/quest pipelines create items. Equipment stores instance IDs, not client-computed stats.

### Equipment spoofing

**Attack:** Client equips an unowned or unequippable instance, or sends a calculated attack value.

**Defense:** `EQUIP` is `{ instanceId?, slot, requestId }`. The match checks the player is alive, owns the instance, the item is not locked, the category and slot tags match a content-defined slot, class and level requirements pass, unique-equipped policy is respected, and the `requestId` has not already succeeded. Derived stats are recalculated on the server after load, equip, unequip, inventory repair, XP/level changes, and attribute allocation. Client `attack` / `attackBonus` are `stat_injection`. Clients never generate item-instance IDs. `DESTROY_ITEM`, `SPLIT_STACK`, and `MOVE_ITEM` are intentions; rejected operations restore the GLoot mirror from canonical state.

### Duplicate pickup

**Attack:** Two pickup intents for the same ground item.

**Defense:** Ground items are match entities. First successful pickup despawns them. Second intent is `invalid_target` or equivalent.

### Duplicate reward

**Attack:** Replay loot or quest-complete with the same or mutated payload.

**Defense:** Rewarded actions require `requestId` and are idempotent. Quest stage advances only forward through legal transitions. Enemy-death loot and XP use `kill:<instanceId>:<deathCount>` so a duplicate death event cannot grant twice.

### Quest skipping

**Attack:** Client sends `questComplete` or a later stage ID.

**Defense:** Client may send an interact, `QUEST_ACCEPT`, or `QUEST_TURN_IN` intention. The server checks current stage, objectives, required items, and target NPC ID using server positions. Objective counts and `status` / `questComplete` / reward fields on the client payload are rejected. Dialogue Manager does not own quest state. Turn-in uses `nk.multiUpdate` so inventory, quest completion, and gold cannot apply separately.

### Fabricated NPC interaction

**Attack:** Client opens dialogue locally, or sends `INTERACT` / `QUEST_ACCEPT` from across the map.

**Defense:** The client may pick a nearby NPC for usability, but dialogue opens only after `INTERACTION_RESULT` `ok`. The match validates NPC existence, Euclidean distance from server poses against `player.base.interactionRange` (48), and rejects `health <= 0`. Out-of-range and unknown NPC IDs return `out_of_range` / `invalid_target` and do not open dialogue.

### Invalid target IDs

**Attack:** Attack, loot, or talk using unknown or out-of-range IDs.

**Defense:** IDs validated against match entities and content indexes. Unknown IDs are rejected; they do not crash the match.

### Oversized payloads

**Attack:** Huge JSON to stall the runtime.

**Defense:** Nakama socket limits plus application max payload size (**2048** bytes for client→server match bodies). Oversize is rejected before domain apply. Each player is also limited to **24** parsed match messages per tick and the documented per-action windows. Zone chat messages longer than 200 characters are rejected by a realtime before hook.

### Chat injection and markup

**Attack:** Empty, malformed, or oversized chat; extra JSON fields; BBCode or other markup meant to restyle or execute in the client.

**Defense:** `ChannelMessageSend` is validated in a Nakama realtime before hook. Zone chat stays stateless: content must be JSON `{ "message": string }` only. Party chat may include `partyId` and requires current membership (`not_party_member`). Empty and >200 character bodies are rejected. Chat sends are limited to 4 per 2 s by the lexical session-rate engine in `rate_limit.ts` (not a mutated process-global object). The client renders chat in a `Label` and never enables BBCode on untrusted text. Direct-message and group channel joins are rejected; only room `zone.starter` and `party.<partyId>` for members are allowed. Party chat never drives gameplay state.

### Protocol-version mismatch

**Attack or accident:** Client speaks a different envelope version.

**Defense:** Version field checked first. Mismatch is rejected; no state apply.

### Forged save schema version

**Attack:** Client sends `schemaVersion`, `createdAt`, or a migration id in bootstrap or join metadata.

**Defense:** Bootstrap treats those keys as `stat_injection`. Join metadata is only `protocolVersion`, `contentHash`, and `selectionTicket` or `transferTicket`. `characterId` in join metadata is `stat_injection`. Migrations run only on server-read storage. Future save versions reject join with a visible `save_incompatible` error; data is not reset.

### XP injection

**Attack:** Client sends an XP amount, level, or `currentXp` on a match opcode, or calls an XP RPC.

**Defense:** There is no client XP opcode and no debug grant RPC. XP is granted only from trusted server events (kill credit, quest reward, administrator domain `grantXp`) with `reasonType`, `reasonId`, `eventId`, `characterId`, and `amount`. Duplicate `eventId` values do not grant twice. Outcome keys `xp`, `currentXp`, `lifetimeXp`, and `level` are `stat_injection`. Group kill/quest credit uses the match party cache (same match, alive or dead within 15 s, within 512 px). Clients cannot nominate recipients (`creditUserIds` / `xpRecipients` / `members` are `stat_injection`).

### Forged party membership and group loot

**Attack:** Client sends a member list, claims to be in a party, or nominates loot/credit recipients.

**Defense:** Party RPCs and match opcodes reject `members`, `memberIds`, `partyMembers`, `creditUserIds`, `lootRecipients`, and `xpRecipients`. Membership is the server party record plus match cache keyed by `revision`. Personal loot grants each eligible member independently once per death `eventId`; `inventory_full` skips that member. Server-assigned loot picks one eligible member from a match-local LCG seeded by the death event and announces the assignment. Duplicate death events do not roll again. `party_split` maps to `personal`. Green slime stays `ground_free`.

### Vendor price spoof, inn bind, cave transfer

**Attack:** Client sends a buy/sell price or gold delta; forges inn health/bind; or invents a cave destination / transfer ticket.

**Defense:** `VENDOR_BUY`/`VENDOR_SELL` accept `npcId`, item or instance id, optional quantity, and `requestId` only. `price` is `unknown_field`; `gold` is `stat_injection`. Server catalog prices and the transaction service own gold. `INN_REST` heals and optionally binds from content; bind persists on the character record (`permissionWrite: 0`). `CAVE_ENTER` / `CAVE_EXIT` are intentions. The match loop allocates the destination and issues a one-time ticket. Join metadata `transferTicket` is validated and consumed; reuse, expiry, wrong character, wrong destination, and origin still present are rejected. Canonical location forbids two live matches. Destination match ids from the client are not trusted.

### Trade duplication, unowned items, and gold spoof

**Attack:** Client completes a trade, offers an unowned or non-tradeable item, sends a gold amount as an outcome, or retries commit to duplicate items.

**Defense:** Trade opcodes are intentions (`targetId` / `tradeId` / `instanceId` / `amount` / `revision` / `requestId`). `gold` is `stat_injection`. The match owns eligibility, locks, reserved gold, revision, and mutual acceptance of the current revision. Commit uses `nk.multiUpdate` for both inventories and both wallets, or retries a `committing` snapshot. Duplicate `requestId` and completed trades replay. Offered stacks are locked against equip, destroy, vendor sale, consume, and other trades. Failure unlocks and leaves both players valid.

### Rate-limit abuse

**Attack:** Flood `INPUT`, `ATTACK`, `USE_ABILITY`, `CANCEL_CAST`, `SET_TARGET`, `INTERACT`, `PICKUP`, `EQUIP`, `DESTROY_ITEM`, `SPLIT_STACK`, `MOVE_ITEM`, quest opcodes, `VENDOR_BUY`, `VENDOR_SELL`, `INN_REST`, `CAVE_ENTER`, `CAVE_EXIT`, trade opcodes, `ALLOCATE_ATTRIBUTES`, `ASSIGN_HOTBAR`, `UNLOCK_ABILITY`, `RELEASE_RESPAWN`, or `RESYNC_REQUEST` faster than an honest client.

**Defense:** Match state stores per-user `actionRates` for a 10-tick window. Excess is `rate_limited`, logged, and not applied. Honest 10 Hz movement stays under the `INPUT` cap of 20/s.

Session rates (lexical map replacement, Nakama-safe) live in `rate_limit.ts`:

| Kind | Limit | Window |
| --- | --- | --- |
| Authentication (email/device identity) | 5 | 10 s |
| Chat send | 4 | 2 s |
| Mutating party RPCs (`party_get_state` exempt) | 8 | 2 s |

Match buckets (per player, 10-tick window): `input` 20; `attack` / `interact` / `pickup` / `inventory` / `equip` / `quest` / `vendor` / `cave` / `trade` / `allocate` 8; `resync` 2; plus 24 messages/tick and 2048-byte bodies.

## Attack mapping

Machine-readable copy: `server/src/domain/security_catalog.ts`. Every expected attack has threat, validation, rate limit, payload-size limit, idempotency, expected rejection, and automated test:

| Attack | Threat | Validation | Rate limit | Payload | Idempotency | Rejection | Test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| registration_spam | Flood email/device create | Authenticate before-hook; production registration closed | auth 5/10s | Nakama account payload | Extra creates rejected | `rate_limited` / `registration_disabled` | `auth_hooks.test.ts`, `auth_privacy.test.ts` |
| login_error_leakage | Distinguish unknown email vs bad password | `sanitizeAuthFailure` when `create=false` | auth 5/10s | n/a | n/a | `invalid_credentials` | `auth_privacy.test.ts`, `auth_privacy_test.gd` |
| foreign_character_selection | Select another account's character | Roster ownership + ticket match | select RPC | RPC | Tickets one-use | `selection_foreign` / `character_missing` | `character_lifecycle.test.ts`, `match.test.ts` |
| forged_character_ticket | Fabricate `selectionTicket` | Server-issued ticket, TTL 300s, consumed on join | join | join metadata | Reuse invalidated | `selection_invalidated` / `selection_expired` | `character_lifecycle.test.ts` |
| duplicate_name_reservation | Two accounts claim Alice | Canonical name reservation OCC | create RPC | RPC | Loser `name_taken` | `name_taken` | `character_lifecycle.test.ts` |
| deleted_character_use | Select or join a soft-deleted slot | Soft-delete flags roster | select RPC | RPC | n/a | `character_deleted` | `character_lifecycle.test.ts` |
| xp_injection | Client sends xp/level/currentXp | Outcome keys rejected; grants only trusted events | allocate 8/10 ticks | 2048 | XP `eventId` unique | `stat_injection:xp` | `progression.test.ts`, `protocol.test.ts`, `xp_hooks.test.ts`, `security.test.ts` |
| level_injection | Client sets level | No client level field | allocate 8/10 ticks | 2048 | n/a | `stat_injection:level` | `progression.test.ts`, `protocol.test.ts` |
| attribute_overspending | Spend more points than unspent | Server pool check | allocate 8/10 ticks | 2048 | `requestId` replay | `insufficient_points` / `invalid_amount` | `progression.test.ts` |
| skill_point_overspending | Unlock with too few skill points | `unlockAbility` cost check | allocate 8/10 ticks | 2048 | `requestId` replay | `insufficient_points` | `ability.test.ts`, `security.test.ts` |
| ability_unlock_bypass | Use or hotbar a locked ability | Server unlock list | attack/allocate 8/10 ticks | 2048 | n/a | `ability_locked` | `ability.test.ts`, `protocol.test.ts` |
| position_spoofing | Send x/y as movement | `INPUT` is axes+seq only | input 20/10 ticks | 2048 | stale seq ignored | `stat_injection:x` | `security.test.ts`, `protocol.test.ts`, `movement.test.ts` |
| speed_hacking | Oversized axis or implied teleport | Server dt and `moveSpeed` | input 20/10 ticks | 2048 | n/a | Applied speed matches content | `movement.test.ts`, `security.test.ts` |
| target_spoofing | Attack unknown or foreign IDs | Match entity indexes | attack 8/10 ticks | 2048 | n/a | `invalid_target` | `combat.test.ts`, `targeting.test.ts`, `security.test.ts` |
| range_bypass | Hit from across the map | Server Euclidean range | attack 8/10 ticks | 2048 | n/a | `out_of_range` | `combat.test.ts`, `ability.test.ts`, `security.test.ts` |
| cooldown_bypass | Fire faster than ICD/GCD | Server cooldown clocks | attack 8/10 ticks | 2048 | duplicate `requestId` | `on_cooldown` / `on_global_cooldown` | `combat.test.ts`, `ability.test.ts`, `security.test.ts` |
| resource_bypass | Cast without resource | Server resource pools | attack 8/10 ticks | 2048 | n/a | `resource_missing` | `ability.test.ts` |
| damage_spoofing | Send damage/health | Intention only | attack 8/10 ticks | 2048 | `eventId` + `requestId` | `stat_injection:damage` | `combat.test.ts`, `ability.test.ts`, `protocol.test.ts`, `security.test.ts` |
| healing_spoofing | Send heal/healing | Outcome keys rejected | attack 8/10 ticks | 2048 | `eventId` | `stat_injection:heal` | `protocol.test.ts`, `combat_pipeline.test.ts`, `security.test.ts` |
| dead_character_actions | Act while dead | Health check except `RELEASE_RESPAWN` | per opcode | 2048 | n/a | `player_dead` | `combat.test.ts`, `combat_pipeline.test.ts`, `security.test.ts` |
| pvp_attempts | Damage another player | Living players friendly; PvP off | attack 8/10 ticks | 2048 | n/a | `pvp_disabled` | `ability.test.ts`, `combat_pipeline.test.ts` |
| item_injection | Grant opcode or storage write | No grant opcode; `permissionWrite` 0 | inventory 8/10 ticks | 2048 | n/a | `unknown_opcode` | `protocol.test.ts`, `inventory.test.ts`, `security.test.ts` |
| item_instance_injection | Client `instanceId` on pickup | `instanceId` on `PICKUP` rejected | pickup 8/10 ticks | 2048 | Server generates IDs | `stat_injection:instanceId` | `security.test.ts`, `protocol.test.ts` |
| stack_overflow | Quantity above `maxStack` | Split at `maxStack`; `acceptItemFailureCode` | inventory 8/10 ticks | 2048 | n/a | `inventory_full` (no overstack) | `inventory.test.ts`, `security.test.ts` |
| duplicate_loot | Two pickups of one ground item | First despawns; `requestId` replay | pickup 8/10 ticks | 2048 | `requestId` | `invalid_target` / replay ok | `inventory.test.ts`, `security.test.ts` |
| duplicate_quest_reward | Replay turn-in | `requestId` + already completed | quest 8/10 ticks | 2048 | `requestId` / quest status | `already_completed` | `quest_reward.test.ts`, `security.test.ts` |
| negative_gold | Negative gold offer or wallet | Finite amount >= 0; wallet clamps | trade/vendor 8/10 ticks | 2048 | txn `requestId` | `invalid_amount` / `insufficient_gold` | `transaction.test.ts`, `trade.test.ts`, `security.test.ts` |
| vendor_price_spoofing | Client price/gold on buy/sell | `price` unknown; `gold` injection | vendor 8/10 ticks | 2048 | `requestId` | `unknown_field:price` / `stat_injection:gold` | `vendor.test.ts`, `protocol.test.ts` |
| locked_item_mutation | Equip/destroy/sell a locked stack | `lockReason` checked | equip/inventory/vendor | 2048 | n/a | `item_locked` | `equipment.test.ts`, `trade.test.ts`, `vendor.test.ts` |
| transaction_replay | Replay `requestId` on gold/item txn | Transaction `requestId` map | vendor/quest 8/10 ticks | 2048 | `requestId` | replay ok; no second mutate | `transaction.test.ts`, `vendor.test.ts` |
| forged_membership | Send members/creditUserIds | `stat_injection`; server party record | party RPC 8/2s | RPC | n/a | `stat_injection:members` | `party.test.ts`, `protocol.test.ts` |
| party_over_capacity | Sixth member | `MAX_PARTY_SIZE` 5 | party RPC 8/2s | RPC | n/a | `party_full` | `party.test.ts` |
| unauthorized_kick | Non-leader kick | Leader-only kick/promote/disband | party RPC 8/2s | RPC | n/a | `not_leader` | `party.test.ts` |
| group_credit_spoofing | Nominate XP/loot recipients | Server eligibility only | attack 8/10 ticks | 2048 | death `eventId` | `stat_injection:creditUserIds` | `party_credit_loot.test.ts`, `protocol.test.ts` |
| foreign_cave_entry | Enter another party's cave | Ownership + membership + ticket | cave 8/10 ticks | 2048 | one-time ticket | `not_cave_member` / `ticket_wrong_character` | `cave.test.ts` |
| transfer_ticket_replay | Reuse consumed ticket | Tickets consumed on join | cave 8/10 ticks | 2048 | one-time | `ticket_reused` | `cave.test.ts` |
| dual_match_presence | Join two matches at once | Canonical location | join | join metadata | n/a | `already_in_match` / `already_elsewhere` | `cave.test.ts`, `match.test.ts` |
| rejoin_expired_cave | Reconnect after cave gone | 60s grace then public-world fallback | join | join metadata | n/a | public fallback; no ghost cave | `cave.test.ts` |
| offer_revision_race | Accept stale revision | Accept must match current revision | trade 8/10 ticks | 2048 | revision | `revision_mismatch` | `trade.test.ts` |
| acceptance_race | Two accepts of different revisions | Commit only both accepted current revision | trade 8/10 ticks | 2048 | `requestId` | `revision_mismatch` | `trade.test.ts` |
| item_removal_during_trade | Destroy offered stack | Trade lock | inventory/trade | 2048 | n/a | `item_locked` | `trade.test.ts` |
| gold_change_during_trade | Spend reserved gold | Reserved gold reduces spendable | vendor/trade | 2048 | n/a | `insufficient_gold` | `trade.test.ts` |
| duplicate_commit | Replay accept after commit | Completed trade + `requestId` | trade 8/10 ticks | 2048 | `requestId` | replay; no second grant | `trade.test.ts` |
| disconnect_during_commit | Crash mid `multiUpdate` | `committing` snapshot recovered | trade 8/10 ticks | 2048 | committing retry | no duplicate items/gold | `trade.test.ts` |
| zone_transfer_during_trade | `CAVE_ENTER` while open trade | Transfer cancels open trade | cave/trade | 2048 | n/a | trade cancelled; inventories valid | `trade.test.ts` |
| malformed_json | Broken JSON body | `parseClientMessage` | unknown 8/10 ticks | 2048 | n/a | `malformed_json` | `protocol.test.ts`, `security.test.ts`, `fuzz.test.ts` |
| unknown_fields | Extra JSON keys | Strict allowlists | per opcode | 2048 | n/a | `unknown_field:*` | `protocol.test.ts`, `security.test.ts`, `fuzz.test.ts` |
| unknown_opcode | Opcode 99/grant 50 | `isClientOpcode` | unknown 8/10 ticks | 2048 | n/a | `unknown_opcode` | `protocol.test.ts`, `security.test.ts`, `fuzz.test.ts` |
| oversized_payload | Huge JSON | 2048-byte cap | 24 msgs/tick | 2048 | n/a | `payload_too_large` | `protocol.test.ts`, `security.test.ts`, `fuzz.test.ts` |
| nan | NaN axes/amounts | `typeof number && isFinite` | input/trade | 2048 | n/a | `invalid_input` / `invalid_amount` | `protocol.test.ts`, `security.test.ts`, `fuzz.test.ts` |
| infinity | `1e999` / Infinity | `isFinite` | input/trade | 2048 | n/a | `invalid_input` / `invalid_amount` | `protocol.test.ts`, `security.test.ts`, `fuzz.test.ts` |
| wrong_protocol_version | `protocolVersion != 1` | Checked first | resync/any | 2048 | n/a | `protocol_mismatch` | `protocol.test.ts`, `match.test.ts`, `compatibility.test.ts`, `fuzz.test.ts` |
| wrong_content_hash | Mismatched catalog hash | Optional hash must match | resync/join | 2048 | n/a | `content_mismatch` | `protocol.test.ts`, `compatibility.test.ts`, `fuzz.test.ts` |
| resync_abuse | Flood `RESYNC_REQUEST` | resync 2/10 ticks | resync 2/10 ticks | 2048 | n/a | `rate_limited` | `security.test.ts` |
| chat_abuse | Flood/markup/oversize chat | JSON `{message}`; Label no BBCode; 200 chars | chat 4/2s | 200 chars | n/a | `rate_limited` / `message_too_long` / `invalid_payload` | `chat.test.ts`, `security.test.ts` |

Additional Prompt 18–33 rows (equipment spoof, quest skip, fabricated NPC, GM, maintenance, save version) remain covered by the tests listed in prior phases and in [TEST_CATALOG.md](TEST_CATALOG.md).

## Client local storage

The Godot client must not write canonical inventory, equipment, quest, currency, progression, party, cave, location, trade, health, or position records to `user://` or other local files. `AppState` is in-memory presentation/session flags only. Persistence is Nakama storage and wallet, written by the server. Device-debug session tokens (never passwords) may be cached in `user://session_cache.json`. Email product sessions keep access and refresh tokens in memory and refresh through `POST /v1/auth/refresh`; a dead refresh token returns to Login. Remember Email may store the address only.

Debug Alice/Bob/machine device identities are gated by `OS.is_debug_build()` (tests may set `DevIdentity.force_release_config`). Release builds expose email registration and login only.

Password-recovery and email-change mail is served by the auth gateway (Mailpit locally, SendGrid in staging/production). Forgot Password calls `POST /v1/auth/password/reset/request` (alias `/v1/auth/password-reset/request`). The response never reveals whether the address exists. Logged-in password change is `POST /v1/account/password/change`. Email change is `POST /v1/account/email/change/request` plus confirm. Forgotten-email help never reveals an address. Internal support lookup is secret-gated and logged. Operators can still use the Nakama console. Do not store raw passwords in project storage or logs.

Debug-only `--e2e-slice` opens two real sessions and `--cert-five` opens five. Both send ordinary intentions. They are compiled out of usefulness in release builds (`OS.is_debug_build()` plus an explicit flag). GdUnit `client/tests/app/e2e_hooks_test.gd` requires the flags. `scripts/test-e2e` and `scripts/test-cert-journey` drive the live journeys. They must not call storage, wallet, or match APIs that a player client cannot call, and they must not skip match validation.

## Logging

Structured logs may include opcode, rejection reason, user ID, match ID, and `requestId`. Match rejections use `match_action rejected user_id=… action=… reason=… tick=…`. Ops lines use `ops event=…`. They must not include session tokens, passwords, device identifiers beyond Nakama’s own account ID, raw full untrusted payloads when oversized, or full private chat bodies.

### Client-only GM / debug flags

**Attack:** A debug Godot build, HUD checkbox, or `--dev-user` flag grants items, gold, teleport, or cave entry.

**Defense:** `gm_command` requires a server allowlist object with `enabled: true` and a matching user id, custom id, or email. Default allowlist is disabled. The debug GM panel only sends the RPC. Failed authorization is `gm_disabled` / `unauthorized` and is audited.

