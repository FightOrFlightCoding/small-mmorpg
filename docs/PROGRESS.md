# Progress

Last accepted phase: **ITEM-08 — Public ground drops and ground pickup**.

Current phase: ITEM-08 (accepted). Do not start later ITEM phases. The last accepted gameplay/NPC phase remains **NPC-07**. The last accepted progression phase remains **PROG-15**.

Canonical git line: **`origin/main`**. Playable work is committed there. The Windows clone stays on `main` and runs `scripts/local-play.ps1 -Branch main`.

The Prompt 18 vertical slice remains accepted. Foundation v1 (Prompt 35) remains accepted. Account lifecycle (ACCT-09) remains accepted. PROG-01 through PROG-15 remain accepted. ITEM-01 through ITEM-08 remain accepted. Foundation v1 scope is locked in [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md). Do not implement later PROG gameplay until a later PROG phase names it. Do not implement later account-lifecycle features until a later ACCT phase names them. Do not implement later ITEM features until a later ITEM phase names them. Stay Signed In remains later.

Local Compose delivers verification, recovery, email-change, and deletion mail through SendGrid (`infra/.env.local`). Mailpit remains on automated-test Compose only.

## ITEM-08 public ground drops and ground pickup (2026-09-19)

ITEM-08 is accepted. It is player-created public ground items and authoritative pickup on the 30-slot bag. It does not implement 20 trade slots, forage, or player-to-merchant selling. Do not start later ITEM phases.

Dragging a bag stack into the world begins `DROP_ITEM`. Default quantity is the whole stack; quantity must be 1..stack. Uncommon or higher shows “This item will be public and can be picked up by anyone.” and requires confirmation. Equipped items must be unequipped into the bag first. All production items, including quest items, may be dropped.

The server validates ownership, bag location, alive / not link-dead / not transferring, unlocked, quantity, the 20-drop anti-spam limit (`PLAYER_GROUND_DROP_LIMIT`, noncanonical), and conflicting locks. At the limit it rejects the new drop and does not delete an older item. Placement uses authoritative character pose, optional `hintDx`/`hintDy`, drop radius, walkable bounds, and wall checks. Client `x`/`y` are `stat_injection`.

`executeDropIntent` is the durable drop path: no loss before entity creation, no duplicate ground entity, no duplicate bag item, compensate on creation failure. Interrupted `COMMITTING` restores the bag or overflow.

Ground entities live on match `state.groundItems` (not a 36th storage collection): `groundEntityId`, instance, quantity, position, creator, created/expires ticks, state, revision. They are public immediately, have no physics collision, expire at five minutes, and are not reconstructed after match/server restart (ITEM-C25).

`PICKUP_GROUND_ITEM` is all-or-nothing. Exactly one claimant succeeds; others `ground_item_no_longer_available`. Duplicate `requestId` replays. Quest-item drop reduces possession progress without failing the quest; pickup may advance the picker’s matching quest. Gel remains reacquirable from slimes.

Opcodes 48 / 49 / 119. Storage record count remains **35**. Content hash unchanged: `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

Conflicts ITEM-C10 and ITEM-C25 are CLOSED.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 49 client opcodes, 19 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 1000 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed |
| Godot 4.7.1 client GdUnit | 369/369 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-07 merchant purchasing and bag integration (2026-09-19)

ITEM-07 is accepted. It is merchant-to-player purchasing on the accepted NPC interaction session and the 30-slot bag. It does not implement player-to-merchant selling, player ground drop, 20 trade slots, or forage. Do not start later ITEM phases.

`VENDOR_BUY` reuses the live interaction session. The client sends `interactionSessionId`, `vendorId`, `stockEntryId`, quantity, optional `preferredSlot`, `requestId`, and optional `expectedRevision`. NPC identity comes from that session. Client `price` / `gold` / leftover `itemId` / `npcInstanceId` are protocol rejections.

Canonical vendor content owns `vendorId`, `currencyId`, `stockEntryId`, `buyPrice`, quantity constraints, optional class/level requirements, and `displayOrder`. Unauthored `stockEntryId` is `${vendorId}:${itemId}`. Stock is unlimited; simultaneous buyers do not compete. A new stock list is content-only.

Purchases are all-or-nothing: validate session, range, character, vendor bind, stock entry, bounded quantity, requirements, gold, bag capacity, inventory revision, and idempotency; then debit gold, create or stack every purchased item, persist bag and wallet, audit, and return canonical state. `planCapacity` with `preferredStrict` when a slot is supplied plans every stack before commit. A quantity that does not fit grants nothing and deducts no gold.

The merchant window shows name, stock icons and tooltips, canonical prices, player bag, gold, quantity selector, and buy result. Right-click buys one; Shift-right-click or the selector chooses quantity; drag onto an empty or compatible bag slot sets `preferredSlot`; incompatible occupied slots reject. Bag→merchant drag is rejected. `VENDOR_SELL` remains live and tested but is hidden from this window (ITEM-C12 KEEP).

Opcodes stay 47 / 18. Storage record count remains **35**. Content hash unchanged: `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 47 client opcodes, 18 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 972 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed |
| Godot 4.7.1 client GdUnit | 361/361 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-06 party Need/Greed rolls and pending winner awards (2026-09-19)

ITEM-06 is accepted. It is server-authoritative Need/Greed for Uncommon-or-higher party-tagged corpse drops, plus winner-only pending pickup when the whole stack does not fit. It does not add player ground drop, 20 trade slots, or forage. Do not start later ITEM phases.

At enemy death, each qualifying corpse entry opens a match-lifetime roll when the kill is party-tagged, the item is Uncommon or higher, it is not a quest item, and at least two characters are death-eligible. One death-eligible character auto-awards with no roll UI. Solo-tagged drops never roll.

The client submits `rollId`, `choice` (`NEED` / `GREED` / `PASS`), and `requestId`. Eligible characters may Need. One accepted final choice cannot be changed. Duplicate `requestId` replays. Client roll numbers are `stat_injection:roll`. Dead and reconnected eligible members may respond before the 60 s deadline. Submitted choices survive disconnect. Missing responses become Pass.

At the 60 s boundary the match resolves rolls, then awards, then all-pass public, then remaining unreserved public. Same-tick claims still see `ROLL_PENDING`. Need outranks Greed. Server integers 1–100 use injectable `CombatRandom`. Ties reroll among tied characters. Whole-stack grants go through `planCapacity` and acquisition intent; a full bag becomes `AWARDED_PENDING_PICKUP` (winner-only, not public, not rerolled) until corpse expiry. Rolling and pending entries do not spawn public sparkles.

Opcodes 47 / 118. Storage record count remains **35**. Content hash unchanged: `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

Conflicts ITEM-C03 and ITEM-C19 are CLOSED.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 47 client opcodes, 18 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 963 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed |
| Godot 4.7.1 client GdUnit | 360/360 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-05 first-attacker tagging, corpse loot, gold, and Loot All (2026-09-19)

ITEM-05 is accepted. It is authoritative first-hit tagging and match-lifetime corpse loot. It does not resolve Need/Greed beyond reserving Uncommon-or-higher party drops as `ROLL_PENDING`. Do not start later ITEM phases.

First damaging hit sets `tag_owner_character_id`, `tag_party_id`, immutable `encounter_roster`, `tagged_at`, and `tag_revision`. Controlled attackers resolve to the owning character. Leash/full reset clears the tag. Late joins are excluded; kicked members stay in the snapshot. The death-eligible roster is created once (same-match presence, credit range, death during encounter, departure, identity). The client never nominates recipients.

Loot tables support item and gold entries, guaranteed/chance/weighted groups, and quantity ranges. Generation runs once at death; stacks split at max stack. The corpse is a match-lifetime container: 60 s private, public after the ITEM-06 roll stub, 5 min expire, empty may vanish immediately, no combat collision. Ordinary party loot is first successful claimant. Quest items never roll.

Private gold splits `floor(gold / n)` plus remainder (tag owner, then ascending character id) with durable per-share records. Public remainder is first claimant. Duplicate `requestId` replays. Loot All takes gold then fitting items, skips active rolls and foreign awards, and returns per-entry results.

Prompt 18 dual-path: corpse plus 30 s sparkles linked by `corpseId`/`corpseEntryId`. Corpses are not reconstructed after match/server restart. Opcodes 42–46 / 116–117. Storage record count remains **35**. Content hash unchanged: `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

Conflicts ITEM-C04, ITEM-C05, ITEM-C06, ITEM-C07, ITEM-C08, ITEM-C18, and ITEM-C26 are CLOSED. ITEM-C03 and PendingRollAward stay ITEM-06.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 46 client opcodes, 17 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 937 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | unchanged; 52/52 previously |
| Godot 4.7.1 client GdUnit | 357/357 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-04 complete thirty-slot bag UI and bag interactions (2026-09-19)

ITEM-04 is accepted. It is the player-facing 6×5 bag. It does not add corpse, merchant, ground, or trade windows. Do not start later ITEM phases.

The inventory panel is thirty fixed squares, indices **0–29**, plus used-slot count and gold. Empty squares stay visible. Occupied squares show the item icon or the visual-map fallback, quantity when above one, written rarity plus a rarity frame, a lock overlay, and a pending-operation overlay. Slot order is not compacted.

Tooltips use canonical instance and definition data: name, written rarity, quantity, category, description, equipment slot, level and class requirements, stat modifiers, quest-item indicator, tradeable, droppable, and vendor/lock contextual value. Development builds may append ids and revisions in a separate debug block.

Drag/drop and right-click send `MOVE_ITEM` / `SPLIT_STACK` / `EQUIP` with `expectedRevision` and wait for server confirmation. Empty destination moves; compatible partials merge and leave excess in the source; different occupied items swap; same full stacks reject `stack_full` with no mutation; locked items reject and show the lock reason. Split quantity is 1 .. source−1; the server mints the new instance. Right-click goes through `ItemContextRouter` (Equip / Split Stack / lock reason). Trade, corpse, and merchant contexts stay empty for later phases. Slot views do not hard-code those windows.

Equipment stays outside the bag. Drag bag→valid equipment slot or right-click Equip; drag equipped→bag; full-bag unequip is rejected; derived stats stay server-owned. GLoot remains behind `InventoryService`. Local GLoot edits revert. Pending ghosts never finalize ownership. Timeout or `inventory_stale` requests canonical `FULL_STATE` and keeps the original `requestId`.

Conflicts ITEM-C15 and ITEM-C23 are CLOSED. Content hash unchanged: `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 41 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 908 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | unchanged; 52/52 previously |
| Godot 4.7.1 client GdUnit | 351/351 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-03 authoritative container, capacity, lock, and transaction core (2026-09-19)

ITEM-03 is accepted. It extends the existing inventory, equipment, wallet, and transaction core. It does not add corpse, merchant, ground-drop, or trade UI changes. It does not expose a generic arbitrary-container command. Do not start later ITEM phases.

One pure planner (`planCapacity` / `planTwoWayTrade`) places compatible partial stacks by lowest slot index, then empty slots by lowest slot index. A preferred slot may override when valid. Outgoing quantities free slots in the same plan. Equipment-to-bag preserves instance ids. `acceptItemFailureCode` delegates to the planner. Trade commit is gated by `planTwoWayTrade`.

Optional `expectedRevision` on item opcodes: omitted keeps older clients; stale makes no mutation, returns `inventory_stale`, and pushes `FULL_STATE`. Successful `requestId` replays without a second grant. Terminal failed ids may replay. Per-character serial plus lexicographic multi-character lock order. Typed locks with 120 s TTL, tick expiry, and orphan release. Partial-quantity locks still immobilize the source stack.

Journal, acquisition/drop intents, and item audits persist inside the inventory record. `SAVE_SCHEMA_VERSION` remains **1**. Storage record count remains **35**. No new opcode. Match persistEconomy stamps `item_destroy` / `item_split` / `item_move` / `loot` / `equipment`. Drop compensation restores the bag or overflow; never silent loss. Completed ground drops may vanish after match restart by design.

Conflicts ITEM-C13, ITEM-C17, ITEM-C21, and ITEM-C22 are CLOSED. Content hash unchanged: `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 41 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 906 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | unchanged; 52/52 previously |
| Godot 4.7.1 client GdUnit | 342/342 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-02 canonical item model, thirty-slot bag, equipment, and migration (2026-09-19)

ITEM-02 is accepted. It extends the existing inventory, equipment, wallet, and transaction core. It does not add corpse, merchant, ground-drop, or trade UI changes. Do not start later ITEM phases.

Every character bag is **30** slots (`0`–`29`). Equipped instances live in `PlayerEquipment.items` and do not occupy bag slots. Unequip requires a free bag slot and is rejected without mutation when the bag is full. Canonical stack merge uses `stacksAreCompatible` (definition, stack key, canonical metadata, incompatible locks, definition maximum). Equippable maximum stack is **1**. Non-equippable stacks are **1–99**. Production items are tradeable and droppable; no binding mode is active. Quest gel/proof stay non-destroyable.

Migration preserves instance ids, definition ids, quantities, equipment, metadata, source history, and slot order. Compatible legacy stacks merge where safe. More than 30 stacks after migration enter server-owned `player` / `overflow` (`permissionWrite: 0`). The Inventory Recovery panel moves overflow into free bag slots only. Overflow is not extra storage for loot, purchases, or rewards. Empty overflow records are deleted. Character create/select/export/soft-delete/restore/purge, account export/deletion, GM inspect, and the migrate CLI include overflow.

`SAVE_SCHEMA_VERSION` remains **1**. New opcode: `RECOVER_OVERFLOW_ITEM` **41**. Content hash `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 41 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 876 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | unchanged; 52/52 previously |
| Godot 4.7.1 client GdUnit | 341/341 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Recreate Nakama so `contentHash` matches.

## ITEM-01 repository audit and item-system contract (2026-09-19)

ITEM-01 is accepted. No player-visible behavior, opcodes, RPCs, storage collections, migrations, dependencies, vendor addons, or `client/addons/` changed. Do not start later ITEM phases. Do not create parallel inventory, equipment, wallet, loot, transaction, merchant, trade, or quest-item systems.

The contract set is [ITEM_SYSTEM_ARCHITECTURE.md](items/ITEM_SYSTEM_ARCHITECTURE.md), [ITEM_CONTENT_MODEL.md](items/ITEM_CONTENT_MODEL.md), [ITEM_CONTAINER_CATALOG.md](items/ITEM_CONTAINER_CATALOG.md), [ITEM_STORAGE_CATALOG.md](items/ITEM_STORAGE_CATALOG.md), [ITEM_PROTOCOL_CATALOG.md](items/ITEM_PROTOCOL_CATALOG.md), [ITEM_TRANSACTION_MODEL.md](items/ITEM_TRANSACTION_MODEL.md), [ITEM_LOCK_MODEL.md](items/ITEM_LOCK_MODEL.md), [ITEM_MIGRATION_PLAN.md](items/ITEM_MIGRATION_PLAN.md), [ITEM_SECURITY_MODEL.md](items/ITEM_SECURITY_MODEL.md), [ITEM_TEST_PLAN.md](items/ITEM_TEST_PLAN.md), and [ITEM_CURRENT_CONFLICTS.md](items/ITEM_CURRENT_CONFLICTS.md).

Inventory save envelope remains gameplay `schemaVersion` **1**. Live bag capacity is **20**. Ground loot TTL is **30 s** public. Equipped items remain in the bag. `VENDOR_SELL` is preserved. Trade tests passed; no pre-ITEM trade repair commit was required.

Content hash unchanged: `bf283255559cf5145b9b4e90ad0ebfca4e09c27f7ffaa9c241347729d0cc5fcb`.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 40 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 856 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 339/339 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: directory-form `node --test` wrappers can fail before discovery. Direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Playable behavior is unchanged.

## NPC-07 lifecycle, security, and final certification (2026-09-18)

NPC-07 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. Do not start later NPC phases. No new NPC types, opcodes, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. `vendor.ts` and existing vendor JSON are unchanged. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

NPC-01 through NPC-06 are certified as one generic noncombat NPC platform. Ordinary dialogue, quest-giver, and merchant NPCs are content work: definition → home → route → dialogue → quests → stock → validate → build. That path does not require a new opcode, storage collection, UI scene, NPC script, transaction mechanism, quest handler, or movement implementation.

Security coverage is in `npc_security.test.ts` (forged NPC/session IDs, foreign/expired/wrong-match sessions, range, death, link-dead, transfer, option injection, unknown service, quest-state injection, reward replay, price spoof, item injection, quantity abuse, duplicate transaction, spam, oversized payload, unknown fields, protocol/content mismatch). Lifecycle coverage is in `npc_lifecycle.test.ts` (login, character switch, public-world join, `FULL_STATE` resync, unexpected disconnect, ten-second link-dead, Safe Return to Character Select, logout, server/match restart, zone transfer, soft deletion/restoration, account export/deletion). NPC movement is transient. Quest and merchant results persist. Leave, disconnect, transfer, and link-dead despawn call `refreshNpcPauses` immediately.

Content-only proof (no runtime or protocol change): `npc.platform_greeter`, `npc.platform_guide`, `npc.platform_quest`, `npc.platform_merchant`, `npc.platform_combined`, `route.platform_short_loop`, `route.platform_weighted`, `quest.platform_talk`, `quest.platform_combined`, `vendor.platform_kiosk`. Guides: [NPC_PLATFORM_READY.md](npc/NPC_PLATFORM_READY.md), [NPC_CONTENT_GUIDE.md](npc/NPC_CONTENT_GUIDE.md), [NPC_DIALOGUE_GUIDE.md](npc/NPC_DIALOGUE_GUIDE.md), [NPC_QUEST_BINDING_GUIDE.md](npc/NPC_QUEST_BINDING_GUIDE.md), [NPC_VENDOR_GUIDE.md](npc/NPC_VENDOR_GUIDE.md), [NPC_RECOVERY_RUNBOOK.md](npc/NPC_RECOVERY_RUNBOOK.md).

Suggested release tag `npc-platform-v1` is **not** created. It needs user approval.

Content hash `bf283255559cf5145b9b4e90ad0ebfca4e09c27f7ffaa9c241347729d0cc5fcb` (platform proof NPCs, routes, quests, and `vendor.platform_kiosk`).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 40 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 852 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 328/328 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`. Run the two-client journey in [NPC_PLATFORM_READY.md](npc/NPC_PLATFORM_READY.md) and confirm the Prompt 18 elder/slime path still completes.


## NPC-06 merchant integration (2026-09-18)

NPC-06 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. NPC-07 is not started. No new NPC types, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

Merchant buy reuses canonical `vendor.ts` / inventory / wallet / `transaction.ts`. Vendor documents require `currencyId` `gold` and static unlimited `stock` (`itemId`, canonical `buyPrice`, optional class/level locks). `VENDOR_BUY` (19) requires `{ interactionSessionId, npcInstanceId, itemId, quantity?, requestId }`. The match validates the live session, NPC vendor bind, stock, positive bounded quantity (1–99), server price, currency, inventory capacity, and item definition. Purchase deducts gold, grants the item, persists inventory and balance, writes `TX_REASON_VENDOR`, and returns canonical inventory and wallet. Same `requestId` replays without a second grant. The client never submits price, gold, or resulting balance. `MerchantWindow` presents NPC name, item list, icon placeholder, description, price, quantity, player gold, Buy, result/error, and Back to dialogue. `VENDOR_SELL` is preserved. A new merchant is content-only.

Content hash `3b1fe2f9b196850d6434503f6c2262867bcd81e6c811c6291cd0510649186084` (vendor `currencyId` `gold`).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 40 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed, including vendor `currencyId` |
| Server hermetic tests | 830 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 327/327 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`.


## NPC-05 quest integration (2026-09-18)

NPC-05 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. NPC-06 is not started. No new NPC types, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

Quest accept and turn-in reuse canonical `QuestService` / `applyQuestAccept` / `applyQuestTurnIn`. Bindings are `quest_offer` / `offer`, `quest_turn_in` / `turn_in`, and `offer_and_turn_in`. `QUEST_ACCEPT` (6) and `QUEST_TURN_IN` (7) require `{ interactionSessionId, npcInstanceId, questId, requestId }`. The match validates the live session, NPC bind, prerequisites, and server-side objectives. Accept is idempotent. Rewards apply once. Success returns canonical quest state plus accepted or completion dialogue on `INTERACTION_RESULT`. Dialogue states are `available`, `accepted`, `in_progress`, `ready`, `completed`, and `prerequisite_missing`. Character-specific markers `!` / `?` / `·` travel on `FULL_STATE` and `QUEST_STATE` only (never `SNAPSHOT`); priority is ready, available, active incomplete, none. Markers refresh after accept, objective progress, completion, login, zone join, `FULL_STATE` resync, and character switch. `npc.test_herald` authors one `offer_and_turn_in` binding. A new quest NPC is content-only.

Content hash `5816b1a22b56865984192fd405c81490b0edcbcbb194790a34f63c9216409c25` (hashed `dialogue` documents plus herald `offer_and_turn_in`).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 40 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed, including quest bind aliases |
| Server hermetic tests | 814 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 325/325 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`.


## NPC-04 right-click interaction and dialogue (2026-09-18)

NPC-04 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. NPC-05 is not started. No new NPC types, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

Right-click (`interact_pointer`, right mouse default) and keyboard interact send the same `INTERACT { targetId, requestId }` intention. The match validates character ownership, account/match presence, alive, not link-dead, not transferring, NPC existence, current range, and the interact rate limit, then opens a short-lived interaction session. `DIALOGUE_CHOOSE` (39) and `INTERACTION_CLOSE` (40) require `interactionSessionId`. The first live session on an NPC pauses cosmetic movement and broadcasts the paused plan; the last close or expiry resumes the authored route. Multiple players may hold sessions at once.

Content dialogue graphs have one or more lines, zero or more options, conditions, and next-node references, with no arbitrary scripts. The server returns the current node id, allowed option ids, available service ids, and session expiry. The client localizes text in `NpcInteractionWindow`. Accept/turn-in remain service buttons bound through offered quest helpers. Prompt 18 `.dialogue` files remain for freeze compile tests.

Content hash `67ca46f20bd51fbe6981c38164c9844701183d27bfbc7ad378e8fc810404f9b4` (hashed `dialogue` documents).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 40 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed, including dialogue graph compile/script rejection |
| Server hermetic tests | 797 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 323/323 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`.


## NPC-03 cosmetic route movement and synchronization (2026-09-18)

NPC-03 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. NPC-04 is not started. No new NPC types, opcodes, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

The match owns cosmetic NPC movement plans (current/next node, revision, segment endpoints and times, idle-until, deterministic LCG). Clients interpolate from the match tick clock. `FULL_STATE` always publishes public plans (`rngState` stripped). `SNAPSHOT` includes NPC plans only when a revision changes. Randomization may affect only the next authored hop, speed/dwell within content bounds, and initial start delay. NPCs never pick arbitrary world positions. Movement is match-lifetime only and is not persisted. `pauseNpcMovement` / `resumeNpcMovement` exist for later interaction and are not wired to `INTERACT`. Production NPCs, including the elder, remain on `route.stationary`.

Content hash `0f93d3f90765f7f778c2687992b409472e964eabc9f09601866c77d57ba8915a` (unchanged; production routes stay stationary).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 38 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 27/27 passed |
| Server hermetic tests | 783 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 320/320 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`.


## NPC-02 generic definitions, actor, and placeholder rendering (2026-09-18)

NPC-02 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. NPC-03 is not started. No new NPC types, opcodes, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

Shared schemas cover `npc_definition`, `npc_route`, `npc_service_binding`, `dialogue_definition`, `npc_quest_binding`, and `vendor_definition`. Production NPCs, including the elder, spawn as one generic `NpcRuntimeInstance` from content with `homePosition` and `route.stationary`. `NpcAvatar` is a `Node2D` placeholder square with a name label, `MarkerAnchor`, and interaction-only `Area2D` (no physics body). Targeting, AoE, threat, aggro, damage, healing, death, and loot reject NPC ids. Existing respec trainers `npc.test_innkeeper` and `npc.lab_trainer` were migrated now onto that same generic definition.

Content hash `0f93d3f90765f7f778c2687992b409472e964eabc9f09601866c77d57ba8915a` (`homePosition` / `routeId` on NPC documents plus `route.stationary`).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 38 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 27/27 passed, including route/home/graph/vendor/quest checks |
| Server hermetic tests | 764 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 319/319 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`.


## NPC-01 architecture contract and conflict closure (2026-09-18)

NPC-01 is accepted. The last accepted gameplay/progression phase remains **PROG-15**. NPC-02 is not started. No new NPC types, opcodes, RPCs, storage collections, migrations, dependencies, vendor addons, or progression formulas were added. Prompt 18 elder spoken lines, quest rewards, and merchant prices are unchanged.

The contract set is [NPC_ARCHITECTURE.md](npc/NPC_ARCHITECTURE.md), [NPC_CONTENT_MODEL.md](npc/NPC_CONTENT_MODEL.md), [NPC_PROTOCOL_CATALOG.md](npc/NPC_PROTOCOL_CATALOG.md), [NPC_STATE_MACHINE.md](npc/NPC_STATE_MACHINE.md), [NPC_SECURITY_MODEL.md](npc/NPC_SECURITY_MODEL.md), [NPC_TEST_PLAN.md](npc/NPC_TEST_PLAN.md), and [NPC_CURRENT_CONFLICTS.md](npc/NPC_CURRENT_CONFLICTS.md). Every previously recorded conflict row is **RESOLVED**:

| ID | Closure |
| --- | --- |
| NPC-C01 | NPCs removed from gameplay AABB collision; `NpcAvatar` has a non-monitoring `InteractionArea`. |
| NPC-C02 | Right-click is the default interact pick; keyboard `interact` remains the same `INTERACT` intention. |
| NPC-C03 | Authored `respec` on `npc.test_innkeeper` / `npc.lab_trainer`; `RESPEC_TRAINER_NPC_IDS` overlay deleted. |
| NPC-C04 | Elder/proof/cert dialogue uses `QuestService` offered helpers bound to NPC content services. |
| NPC-C05 | Match-owned `interactionSession`; NPC poses stay static on `FULL_STATE`. |
| NPC-C06 | Interact, vendor, inn, cave, quest, and trainer authorization use `resolveInteraction` `requiredService`. |
| NPC-C07 | Repeated `INTERACT` request IDs replay the stored result and do not re-run `talk_to_npc`. |

Content hash `b103bcc75e9845f4d4facc967bfab56b1dcd041bcb913e189132109a18d7eb94` (respec now in NPC source).

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 38 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 26/26 passed, including NPC placement/service checks and innkeeper `respec` |
| Server hermetic tests | 760 passed, 13 expected live-test skips |
| Server typecheck/build | passed; existing circular-dependency warning only |
| Auth gateway hermetic tests | 52/52 passed via compiled test-file glob |
| Godot 4.7.1 client GdUnit | 317/317 passed, 0 failures, 0 orphans |

Pre-existing Node 22.14 runner compatibility remains documented: `scripts/test-content.sh` and `scripts/test-auth-gateway.sh` call `node --test` with a directory and fail before test discovery. Their direct compiled-file glob equivalents pass.

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main` from `C:\Users\Eszter\small-mmorpg`, then reopen `client/`.


## Phase 0 acceptance (2026-08-15)

All required directories and documents exist. Internal links among `docs/` and `AGENTS.md` are consistent. The server is documented as the only authority for simulation and rewards. Dependency versions are pinned in [DEPENDENCIES.md](DEPENDENCIES.md). Slice completion is testable via VS-T* and VS-M* in [VERTICAL_SLICE.md](VERTICAL_SLICE.md). No gameplay or networking implementation is present.

## Godot package compatibility spike acceptance (2026-08-15)

Godot 4.7.1 (`4.7.1.stable.official.a13da4feb`) imported `client/` without parser errors. Nakama 3.4.0, GLoot 3.0.2, Dialogue Manager 3.10.5, and GdUnit4 6.2.0 load from unmodified `client/addons/` trees. The compatibility scene printed `COMPATIBILITY_OK` and exited 0 in headless mode. GdUnit4 ran `res://tests/compatibility/compatibility_test.gd` with 4/4 passed. Ledger fields are in [DEPENDENCIES.md](DEPENDENCIES.md) and [THIRD_PARTY.md](THIRD_PARTY.md). No gameplay scenes were added.

Reproduction: `powershell -File scripts/run-client-compatibility.ps1`

## Local Nakama and PostgreSQL infrastructure acceptance (2026-08-15)

`npm ci`, `npm run typecheck`, `npm test` (7/7), and `npm run build` succeeded in `server/`. Docker Compose started PostgreSQL `16.15-alpine` and Nakama `3.40.0`. Nakama reported healthy. The JS runtime loaded `build/index.js` and registered `vibecode_health`. The RPC returned `{"ok":true,"service":"vibecode-server","protocol_version":1,"content_version":"uninitialized"}`. `docker compose down` kept named volume `vibecode_postgres_data`; a subsequent up applied 0 migrations and still had 20 public tables. Destroying that volume is `scripts/backend-volume-destroy.ps1` only. No authentication or match code was added.

Reproduction:

```powershell
Set-Location server
npm ci
npm run typecheck
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
```

## Shared content database and build pipeline acceptance (2026-08-15)

`tools/content-build` `npm ci`, typecheck, and tests succeeded (9/9): valid source, duplicate IDs, broken references, invalid ranges, unknown equipment slots, duplicate quest rewards, deterministic generation, matching client/server hashes, and no absolute paths in generated files. Regenerating twice produced byte-identical `server/src/generated/content.ts` and `client/content/bundle.json` with hash `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. Server `npm run typecheck`, `npm test` (8/8), and `npm run build` succeeded. The Rollup bundle embeds the catalog (not source JSON). `vibecode_health` now returns that hash as `content_version`. No gameplay logic was added.

Reproduction:

```powershell
powershell -File scripts/content-test.ps1
powershell -File scripts/content-build.ps1
Set-Location server
npm test
npm run build
```

## Godot application shell acceptance (2026-08-15)

Godot 4.7.1 imported `client/` and ran `res://scenes/boot/boot.tscn` headless. Boot loaded `res://content/bundle.json`, validated `schemaVersion` 1, and reached the login scene (`SHELL_LOGIN`, exit 0). All required scenes instantiated without parser errors: boot, login, character, world, error dialog, loading overlay. Autoloads `AppState`, `ContentRegistry`, `NetworkService`, `GameService`, and `SceneRouter` are registered. `NetworkService` does not create a Nakama client or open a socket. Missing, malformed, and incompatible bundles are fatal and stay on boot. GdUnit4 ran `res://tests` with 16/16 passed (content lookup, missing ID, content hash, scene routing, error-state transitions, scene instantiate, plus the prior compatibility suite). No canonical game state is written to `user://`.

Reproduction: `powershell -File scripts/run-client-shell.ps1`

## Authentication and one-character bootstrap acceptance (2026-08-15)

Server `npm run typecheck`, `npm test` (18/18), and `npm run build` succeeded. Domain tests cover unauthenticated `character_bootstrap`, valid creation, repeated creation, invalid names, stat injection, existing-character retrieval, distinct Alice/Bob records, and `permissionWrite: 0` storage writes. The RPC is registered as `character_bootstrap`. No match module was added.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 29/29 passed: authentication state transitions, session-expired reauth and visible failure, character-created and character-existing paths, visible network errors, logout, development device IDs, plus prior shell and compatibility suites. `NetworkService` creates a Nakama client, authenticates by device, caches the session in memory, refreshes, reauthenticates, opens a realtime socket, and logs out. Tokens are not logged and are not written to `user://`. Continue on the character scene enters the temporary world screen and does not join a match.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack with `scripts/backend-up.ps1`, then launch the Godot client with `-- --dev-user=alice` or `-- --dev-user=bob`.

## Network protocol and authoritative zone skeleton acceptance (2026-08-15)

Server `npm run typecheck`, `npm test` (44/44), and `npm run build` succeeded. Domain tests cover opcode allocation, malformed JSON, unknown opcodes, unknown fields, protocol and content mismatch, required `requestId` on reward opcodes, stat injection, oversized payloads, Alice/Bob in one `FULL_STATE`, join rejection, resync, ignored `INPUT` (no movement), malformed payloads that do not crash the match, empty-match shutdown after 30s at 10 Hz, and canonical match-id selection for concurrent `find_or_create_starter_zone`.

The runtime registers match module `starter_zone` (label `zone.starter`, tick 10 Hz, max 8 players) and authenticated RPC `find_or_create_starter_zone`. Character storage is loaded on join only. The tick loop does not read storage.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 39/39 passed: matching client opcodes, `FULL_STATE` parse/reject, world entry only after valid full state, fatal protocol/content mismatch, resync, plus prior auth, shell, and compatibility suites. Continue calls `find_or_create_starter_zone`, joins the returned match, and enters the world only after a valid `FULL_STATE`. There is no gameplay movement.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack with `scripts/backend-up.ps1`, then launch two Godot clients with `-- --dev-user=alice` and `-- --dev-user=bob`. Both should join the same starter-zone match and see each other in the presence list.

## Content-driven starter-zone rendering acceptance (2026-08-15)

Kenney RPG Base (CC0) was installed from https://kenney.nl/assets/rpg-base into `client/assets/third_party/kenney_rpg_base/` (zip SHA-256 `49759ab087fdc28d8357010e0f2a17d1c9db61c8fe9b320da965acdfbc298ef5`). License is `license.txt`. Client visual IDs in `client/content/visual_map.json` map to those textures; gameplay scripts do not hard-code Kenney paths. The pack has no adventurer sprite, so `visual.player` uses a labeled primitive fallback.

The world scene renders zone bounds, a tiled floor, collision AABBs, the player spawn, Elder, green slime, local and remote players, and a camera that follows the local avatar. `EntityRegistry` creates/updates/removes by server ID, distinguishes the local player, rejects unknown kinds, and does not duplicate on repeated `FULL_STATE`. Missing visual IDs show a magenta `MISSING` marker instead of crashing.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 48/48 passed, including entity-registry and world-render suites. There is still no movement or combat.

Reproduction: `powershell -File scripts/run-client-shell.ps1`

## Server-authoritative movement acceptance (2026-08-15)

`INPUT` now carries `{ protocolVersion, seq, axisX, axisY }` only. The match validates finite numbers, clamps axes, normalizes diagonals, applies `player.base` move speed at 10 Hz, resolves `zone.starter` walkable bounds and collision AABBs, ignores stale sequence numbers, and broadcasts `SNAPSHOT` at 10 Hz with entity positions and `lastProcessedSeq`. Client-supplied position, speed, or dt is rejected. Dead and disconnected players do not move.

The client sends normalized WASD/arrow intent at 10 Hz, snaps the local avatar to server poses, interpolates remote players between snapshots, and shows a visible `snapshot_timeout` after 2 seconds without a snapshot. There is no local prediction, input replay, or combat.

Server `npm test` 55/55, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 53/53 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

## Local prediction and reconciliation acceptance (2026-08-15)

The client predicts local movement with the same speed, dt, bounds, and AABB collision as the server. Unacked `INPUT` commands are stored, dropped when `lastProcessedSeq` advances, and replayed from the authoritative pose. Display error at or below 0.5 px is left alone; error up to 24 px is blended; larger error snaps. Remote players render one snapshot tick behind from a short buffer, without extrapolation. After 2 seconds without a snapshot the remotes freeze and the HUD shows a degraded connection. A net debug overlay (ping, tick, sent/ack seq, prediction error, buffer depth, protocol version, content-hash prefix) is shown only in debug builds.

Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 61/61 passed. No combat or interaction prediction was added. Server tests were not required this phase (authority unchanged).

## Starter-zone room chat acceptance (2026-08-15)

After a valid `FULL_STATE`, the client joins Nakama room `zone.starter` (persistence false) and leaves on logout. Join failure is recoverable and visible; the world still opens. Channel message and presence signals are connected once. Chat history is a `Label` (50 lines) with sender name and timestamp. Enter focuses the input; Escape unfocuses; focused input does not move the avatar. User markup is shown as text. Empty and >200 character bodies are rejected by a stateless `ChannelMessageSend` before hook; only `{ "message": string }` is allowed. Direct-message and group joins are rejected. There are no parties, private messages, or moderation tools.

Server `npm test` 62/62, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 76/76 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: two clients with `-- --dev-user=alice` and `-- --dev-user=bob`. Each can send a zone chat line the other receives. Restart Nakama after this build so the chat before hooks load.

## NPC interaction, dialogue, and quest acceptance (2026-08-16)

Press **E** near `npc.elder`. The client picks the nearest NPC for usability, then sends `INTERACT` with `targetId` and `requestId`. The match validates NPC existence, Euclidean distance from **server** poses against `player.base.interactionRange` (48), and rejects dead players. Spawn is out of range of the elder; walking away and sending a fabricated interact is `out_of_range`. `DialoguePresenter` opens the elder balloon only after a matching `INTERACTION_RESULT` `ok`.

Elder dialogue (greeting, explanation, accept/decline, in-progress, ready-to-turn-in, completed) is local `client/content/dialogue/npc.elder.dialogue`. Accept sends `QUEST_ACCEPT` through `QuestService.request_accept` and does not mutate the journal. QuestSystem is not used. The HUD journal shows title, state, objective, current/required counts, and turn-in NPC from server `QUEST_STATE` / `FULL_STATE`.

The server validates `quest.slime_problem`, elder range, and creates accepted progress once (`current` 0 / `required` 1). Duplicate `requestId` is idempotent; a later accept returns `already_accepted`. Unknown quest IDs are `invalid_id`. Client `status` / `questComplete` fields are rejected. Progress persists at collection `player`, key `quests`, `permissionWrite: 0`, loaded on join so relog restores the accepted quest. Turn-in, loot, and combat are not in this phase.

Server `npm test` 74/74, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 85/85 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk to the elder (spawn is too far), press E, accept **Slime Problem**. The journal should show the accepted quest. Relog should restore it. Restart Nakama after this build so the match module loads.

## Authoritative enemy AI and combat (2026-08-16)

One shared green slime is simulated in the starter-zone match. The AI is a 10 Hz state machine (`idle`, `chasing`, `attacking`, `returning`, `dead`) using `enemy.green_slime` aggro, leash, speed, damage, cooldown, and respawn. The Godot client does not run enemy AI. `ATTACK` sends `targetId` and `requestId` only; the server applies `player.base.attack` after alive/target/range/cooldown checks. Duplicate `requestId` does not double-hit. Client `damage` is rejected. `SNAPSHOT` includes slime pose, health, `alive`, and `state`. `COMBAT_EVENT` carries hits, death, and respawn for floating numbers. Player death stops movement and attacks, then respawns at `zone.starter.playerSpawn` after 3 seconds with full health. The slime respawns at its spawn after 10 seconds. No loot is created.

Server `npm test` 87/87, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 89/89 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk east to the slime, press **Space** to attack. Both Alice and Bob should see the same slime health. Dying shows **Defeated. Respawning...** then return to spawn. Restart Nakama after this build so the combat runtime loads.

## Loot and server-owned inventory (2026-08-16)

Match init copies `content.enemies` through `enemyDefinitionsFromContent`, including `loot`. Slime death creates one unique ground loot entity with one `item.slime_gel` at the death pose. It is broadcast on `SNAPSHOT`, expires after 30 seconds, and is never persisted. Press **F** to send `PICKUP` `{ lootId, requestId }`. The match validates alive, existence, `pickupRange` 40, capacity, item definition, and that the `requestId` has not already succeeded. The first valid pickup wins, persists inventory (`player`/`inventory`, `permissionWrite: 0`), sends `INVENTORY_STATE`, and removes the loot. Duplicate successful `requestId`s do not grant again. Existing accounts without an inventory record receive one `item.training_sword` and capacity 20 once. `InventoryService` rebuilds GLoot from canonical server items; local GLoot mutations are reverted. `client/addons/` is unmodified.

Server `npm test` 104/104, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 96/96 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, kill the slime, press **F** on the gel. The HUD inventory list should show the training sword plus slime gel. Relog should restore inventory. A second client cannot pick up the same drop. Restart Nakama after this build so the inventory runtime loads.

## Equipment and authoritative derived stats (2026-08-16)

The starter-zone match owns one `main_hand` slot stored as an item-instance ID (`player`/`equipment`, `permissionWrite: 0`). `EQUIP` is `{ instanceId?, slot, requestId }` with `slot` `main_hand`. The match checks the player is alive, owns the instance, the item is equippable into that slot, and the `requestId` has not already succeeded. Omit `instanceId` to unequip. Duplicate successful `requestId` replays `ok` without mutating. `item.slime_gel` is `not_equippable`. Client `attack` / `attackBonus` are `stat_injection`. Derived attack is `player.base.attack` (4) plus the equipped main-hand `attackBonus` (training sword +2). Combat uses that server value. Recalculation runs after character load, equip, unequip, and inventory repair that clears a missing equipped instance. `FULL_STATE` includes recipient `equipment` and `derived`; successful equip/unequip persist immediately and send `EQUIPMENT_STATE`.

`EquipmentService` wraps a GLoot `ItemSlot` as a display-only mirror. The HUD shows the main-hand slot, Equip/Unequip, and the server attack. Select the training sword and Equip (or double-click). The client does not compute attack. Quest turn-in and wallet grants are not in this phase.

Server `npm test` 118/118, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 101/101 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, select **Training Sword**, click **Equip** (or double-click). Attack should become **6**. **Unequip** restores **4**. Slime gel cannot be equipped. Relog should keep the sword in main hand. Combat uses the server derived attack. Restart Nakama after this build so the equipment runtime loads.

## Quest progress, turn-in, and atomic rewards (2026-08-16)

Picking up slime gel while `quest.slime_problem` is accepted recounts the `acquire_item` objective from inventory (`current` capped at required) and persists `player` / `quests`. The client cannot send objective counts. Elder ready dialogue sends `QUEST_TURN_IN` `{ questId, npcId, requestId }`. The match checks alive, NPC, range, accepted-not-completed, satisfied objective, and required gel. Success runs `nk.multiUpdate` before live apply: consume one gel, grant one unique iron sword, mark the quest completed, credit 25 gold with ledger metadata, and write inventory plus quests at `permissionWrite: 0`. Duplicate `requestId` replays without another grant. A later `requestId` is `already_completed`. Persistence failure leaves state unchanged. `FULL_STATE` includes `wallet.gold`. `WalletService` and the HUD gold label / quest-complete notice update only after server confirmation. The iron sword equips through the existing main-hand path.

Server `npm test` 134/134, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 107/107 passed.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk to the elder, accept **Slime Problem**, kill the slime, press **F** on the gel. The journal should show **1 / 1**. Talk to the elder and choose **Turn in the slime gel**. Inventory should lose the gel, gain **Iron Sword**, gold should be **25**, and the journal should show **Completed**. Relog should keep the completed quest, gold, and iron sword. Equip the iron sword; attack should become **9**. Duplicate turn-in should not grant again. Restart Nakama after this build so the reward runtime loads.

## Persistence, disconnect, and reconnection (2026-08-16)

Inventory, equipment, quest, and reward writes stay on those transactions (`permissionWrite: 0`, `nk.multiUpdate` for turn-in). Position checkpoints write `player` / `character` every **5 seconds** (50 ticks) only when the pose changed, plus immediately on `matchLeave` and `matchTerminate`. Occupied ticks do not persist. Health is not persisted: after grace expiry or a new match, join uses full `player.base.maxHealth`.

A disconnected presence is removed from `SNAPSHOT` / `FULL_STATE` immediately (no ghost). For **5 seconds** the match keeps live pose, health, and in-memory request ids. Same-session resume keeps `lastProcessedSeq`. A new session during grace restores pose and health but resets `lastProcessedSeq` so a fresh client is not stuck until it catches up. After grace, or after the empty match times out and a new match starts, join uses the checkpointed position and full health. Ground loot, slime AI, and cooldowns reset with the match. Abandoned `requestId` maps are pruned after **10 minutes**.

The client checks session validity, refreshes, then reauthenticates with the same device id. Socket close starts bounded exponential backoff (0.5s doubling to 8s, 8 attempts), rejoins `find_or_create_starter_zone`, and waits for a fresh `FULL_STATE`. Match, chat, and socket-closed handlers connect once. A `closed` event is ignored until the client has zone state, while a join is in progress, or if the current socket is still connected. Nested loading completion does not hide the reconnect overlay. The overlay shows **Reconnecting…** with **Cancel**, which logs out. Tokens stay in memory.

Server `npm test` 145/145, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 115/115 passed (0 orphans), including graceful/abrupt leave, grace rejoin, post-restart persistent character state, session refresh/reauth, socket reconnect, duplicate callback prevention, full-state resync, and reconnect UI cancel.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\backend-up.ps1
powershell -File ..\scripts\run-client-shell.ps1
```

Local play: start the stack, walk away from spawn, pick up loot, equip, accept or complete the quest. Close the client and reopen with the same `-- --dev-user=`. Position, inventory, equipment, quest, and gold should restore. A second client should stop seeing the disconnected avatar immediately. Kill the Godot process mid-session: the ghost should disappear and reconnect should not duplicate entities. Restart Nakama after this build so the persistence runtime loads; after restart, character data should survive while slime, loot, and cooldowns reset.

## Security and abuse test pass (2026-08-16)

No gameplay was added. Strict `parseClientMessage` still rejects malformed JSON, missing required fields, unknown fields, unknown opcodes, wrong protocol version, wrong content hash, NaN/Infinity, oversized bodies, fabricated position, client damage/stats, item-instance injection, and quest-progress injection. Match apply still ignores stale `seq`, clamps speed, enforces cooldown and range, blocks dead-player actions, unknown IDs, unowned equip, quest skip, duplicate pickup/reward, and oversized chat.

Per-player `actionRates` live on match state (not TypeScript globals) with a 10-tick window: `INPUT` 20, attack/interact/pickup/equip/quest 8, `RESYNC_REQUEST` 2, plus 24 parsed messages per player per tick. Excess is `rate_limited` and is not applied. Honest 10 Hz movement stays under the cap. Rejected match actions log `match_action rejected user_id=… action=… reason=… tick=…` without tokens or payloads. `docs/SECURITY_MODEL.md` maps each documented attack to a rule, a test, and a safe response. Fixtures: `server/tests/fixtures/malformed_messages.ts`.

Server `npm test` 161/161, `npm run typecheck`, and `npm run build` succeeded. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 119/119 passed (0 orphans). Existing movement, combat, loot, equip, quest, and persistence tests still pass.

Reproduction:

```powershell
Set-Location server
npm test
npm run build
powershell -File ..\scripts\run-client-shell.ps1
```

## Quick logout rejoin (2026-08-16)

Logout then login during reconnect grace no longer ignores early `INPUT` seqs. A new session resets `lastProcessedSeq`; the client adopts `ack_seq` from `FULL_STATE` / `SNAPSHOT` when the server is ahead. Logout shows **Leaving…** and waits for match leave. Same-session socket resume still keeps sequence.

This is a bugfix on the persistence/reconnect path, not a new gameplay phase.

Server `npm test` 165/165. Godot 4.7.1 imported `client/`, printed `SHELL_LOGIN`, and GdUnit4 ran `res://tests` with 120/120 passed (0 orphans).

## End-to-end automation and final vertical-slice audit acceptance (2026-08-16)

The slice is accepted. `docs/VERTICAL_SLICE.md` VS-T1–VS-T10 and VS-M1–VS-M5 are complete. No post-slice systems were added.

Developer scripts exist as PowerShell and bash pairs: `setup`, `dev-up`, `dev-down`, `server-build`, `run-client`, `run-two-clients`, `test-client`, `test-server`, `test-content`, `test-e2e`, `test-all`. Nested PowerShell steps fail the parent when the child exit code is nonzero.

The debug-only headless driver `res://scenes/e2e/e2e_slice.tscn` (`--e2e-slice`) authenticated Alice and Bob, joined `zone.starter`, proved mutual `FULL_STATE` visibility, moved Alice so Bob saw the new pose, interacted with `npc.elder`, accepted `quest.slime_problem`, killed `enemy.green_slime:0`, picked up `item.slime_gel`, turned in for one `item.iron_sword` and 25 gold, reconnected with that quest/sword/gold intact, and received `already_completed` with no extra reward on a duplicate turn-in. Release builds refuse the hook. The driver sends documented match opcodes only.

### Gate results

`powershell -File scripts/test-all.ps1` exited 0:

| Suite | Result |
| --- | --- |
| Content | 9/9, client/server `contentHash` `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85` |
| Server | 165/165 |
| Client GdUnit | 122/122, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 |

### Definition of done

| ID | Evidence |
| --- | --- |
| VS-T1–VS-T9 | Existing protocol, movement, combat, inventory, quest, security, and client catalog tests still pass. |
| VS-T10 | `scripts/test-e2e` printed every journey step and `E2E_SLICE_OK`. |
| VS-M1 | E2E: both identities appear in `FULL_STATE`; Bob observes Alice’s +x move. Graphical entry is `scripts/run-two-clients.ps1` (Sign in as Alice / Bob). |
| VS-M2 | E2E: one slime kill and one gel pickup. Duplicate `requestId` remains a no-op in server inventory tests. |
| VS-M3 | E2E reconnect still has 25 gold; duplicate turn-in does not credit again. |
| VS-M4 | `auth_flow_test` / `error_state_test` show `network_unreachable` in the dialog. Boot, login, reconnect, and logout overlays complete or fail. |
| VS-M5 | E2E reconnect restores completed quest, iron sword, and gold from Nakama storage/wallet. Position checkpoints remain covered by persistence tests. |

### Audit

- No TODOs in `client/scripts` or `server/src` (addon TODOs only; `client/addons/` was not edited).
- Project client scripts do not write canonical state to `user://`.
- No new packages. Licenses remain in [THIRD_PARTY.md](THIRD_PARTY.md). Kenney RPG Base is CC0.
- No production secrets committed. Local Compose still uses Nakama’s documented insecure defaults.
- Generated content is deterministic; client and server hashes match.
- README covers prerequisites, versions, setup, backend, opening `client/`, Alice/Bob, tests, volume reset, troubleshooting, licenses, and slice limits.

Reproduction:

```powershell
powershell -File scripts/test-all.ps1
```

## Freeze, scope, and audit the Prompt 18 baseline acceptance (2026-08-16)

No gameplay, protocol, storage schema, or dependency change. Catalogs: [FOUNDATION_SCOPE.md](FOUNDATION_SCOPE.md), [FOUNDATION_BASELINE.md](FOUNDATION_BASELINE.md), [MODULE_OWNERSHIP.md](MODULE_OWNERSHIP.md), [STORAGE_CATALOG.md](STORAGE_CATALOG.md), [PROTOCOL_CATALOG.md](PROTOCOL_CATALOG.md), [HARDCODED_ASSUMPTIONS.md](HARDCODED_ASSUMPTIONS.md), [FOUNDATION_ROADMAP.md](FOUNDATION_ROADMAP.md), [TEST_CATALOG.md](TEST_CATALOG.md). `tools/foundation-audit/audit.cjs` plus `scripts/test-audit` fail if those catalogs drift.

Prompt 18 gate unchanged: content 9/9, server 165/165, client 122/122 0 orphans, `E2E_SLICE_OK`, hash `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. `FOUNDATION_AUDIT_OK`. Canonical records remain `permissionWrite: 0` and still lack a gameplay `schemaVersion` (documented, not migrated).

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Versioned content, save schemas, and migration kernel acceptance (2026-08-16)

No new player-facing gameplay. Content packages use `content/package.manifest.json`; production generate excludes `developmentOnly`; client and server hashes remain `3db1de356fc85fb6eb96489ddc04f47049b906ef915d2baa241cae38159a6e85`. Canonical player records (`character`, `inventory`, `equipment`, `quests`, `wallet_ref`) store `schemaVersion` 1, `createdAt`, and `updatedAt`. Prompt 18 blobs migrate on load without duplicating starter items, quest rewards, or gold. The client cannot send a save version. Commands are in [MIGRATIONS.md](MIGRATIONS.md). Future or corrupted required saves reject with a visible `save_incompatible` error.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash |
| Audit | `FOUNDATION_AUDIT_OK` |
| Server | 181/181 |
| Client GdUnit | 122/122, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |
| Migrate CLI | fixture status/dry-run/apply then verify `already_current` |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
powershell -File scripts/migrate-status.ps1 --fixture server/tests/fixtures/saves/p18-alice.json
```

## Real authentication, character slots, and class selection acceptance (2026-08-16)

Email-and-password registration and login replace the one-character development bootstrap as the supported account path. The client confirms the password on register, caches session tokens (never passwords) in `user://session_cache.json`, refreshes, and shows `session_expired` when email refresh fails. Debug device identities (Alice, Bob, machine unique id) remain only when `OS.is_debug_build()` is true and `DevIdentity.force_release_config` is false. Password-recovery email is out of Foundation v1; operators reset accounts from the Nakama console.

An account may have three live characters. Server RPCs `character_list`, `character_create`, `character_select`, `character_soft_delete`, and `character_restore` own the roster. Names go through one validator; canonical names are reserved on system-owned `names` objects. Concurrent creates of the same canonical name leave one winner. Class definitions are content (`test.class.vanguard`, `test.class.arcanist`); runtime does not hard-code class IDs. Class id is immutable after create. Prompt 18 characters migrate into slot 1, keep gameplay state, receive the `legacyMigrationDefault` class, and do not get a second starter grant. Gold stays the account wallet.

Selecting a character issues a 300-second ticket. Match join metadata is `{ protocolVersion, contentHash, selectionTicket }`. The match checks ownership, existence, not deleted, and that the ticket is unexpired and not previously invalidated, then invalidates it on successful join. A new join after leave must select again. `character_bootstrap` remains a compatibility wrapper.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `e7e2625ff9e92d4905422efeba0c36554d45136578c27f8a6989f06e0ce94721` |
| Audit | `FOUNDATION_AUDIT_OK` (9 storage records, 8 RPCs) |
| Server | 191/191 |
| Client GdUnit | 131/131, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect with a fresh selection ticket) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic statistics, experience, levels, and point allocation acceptance (2026-08-16)

Content defines attributes, resources, derived stats, a shared level curve, and per-class progression documents. Classes reference `progressionId`; runtime looks up stable IDs and roles rather than a fixed enum of the temporary `test.*` examples. The server grants XP only from trusted events (slime kill 10, quest 20, domain admin grant) with `reasonType`, `reasonId`, `eventId`, `characterId`, and `amount`. Duplicate event IDs do not grant twice. One grant can cross multiple levels. At max level leftover XP raises `lifetimeXp` only; no extra points are generated.

`ALLOCATE_ATTRIBUTES` (opcode 9) spends unspent attribute points. Skill points persist and display; ability unlock remains later. The derived-stat pipeline is fixed-order structured components (no script strings). Combat uses those canonical finals when class and progression are present. The client never submits an XP amount; `ProgressionService` may preview an allocate and then replaces it from `FULL_STATE` / `PROGRESSION_STATE`. Prompt 18 characters without a progression blob join at level 1; default-class vanguard with the training sword still deals previous combat numbers.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `92acd85d31c8e291790ef67e27cea10ada40932529885d744b15dc1af6f6c0cf` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 9 client opcodes, 11 server opcodes) |
| Server | 208/208 |
| Client GdUnit | 134/134, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic items, inventory, equipment, currency, and transaction core acceptance (2026-08-16)

Prompt 18 inventory and equipment behavior is unchanged for the slice path. Item definitions are content-driven with categories `weapon`, `armor`, `consumable`, `quest`, `material`, and `miscellaneous`. Non-stackable items use server-generated instance IDs. Inventory supports capacity, stack merge/split/move, destroy, locks, full-inventory errors, and idempotent mutations. Equipment slots are content-defined (temporary tags `main_hand`, `off_hand`, `head`, `chest`, `legs`, `feet`); class and level requirements are server-enforced. Gold mutations go through `applyGoldMutation` with character id, delta, reason, request id, and resulting balance. Loot, quest rewards, equipment, and item destruction persist through one transaction boundary (`commitTransaction` / `nk.multiUpdate`, `memoryCommitter` in tests). Existing instance IDs, stacks, equipment, and gold migrate without duplication. GLoot remains a presentation mirror. A new ordinary item is added through content without protocol changes. Merchants and trading were not added. Ability unlock remains later.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `5f2d9340dc76b62b169af5f0ec85372394adc0e4be2d8a77b9ae608b42780ceb` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 12 client opcodes, 11 server opcodes) |
| Server | 227/227 |
| Client GdUnit | 138/138, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic ability, casting, cooldown, resource, and effect engine acceptance (2026-08-16)

The Prompt 18 basic attack is `test.ability.basic_melee` (`player.base.basicAbilityId`). Opcode 3 `ATTACK` and opcode 13 `USE_ABILITY` share one server path. The client may send ability id, target entity or point, and `requestId` only. The match owns cast timing, cooldowns, resource spend, and effect results. Hostile player targeting returns `pvp_disabled`. Unlocked abilities, hotbar, and optional ranks persist on the progression record (`permissionWrite: 0`); reconnect clears transient casts. Certification abilities (`basic_melee`, `ranged_bolt`, `small_heal`, `power_buff`, `damage_over_time`) exercise direct, periodic, and status handlers. Adding another ordinary ability that uses those handlers is content-only. Merchants, trading, parties, public world, and extra enemy AI were not added.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `7a3006806260ec57ddf338c72dbf5d932786909143acab0abc7b5d9e2e6b024a` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 16 client opcodes, 12 server opcodes) |
| Server | 254/254 |
| Client GdUnit | 142/142, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic combat pipeline, targeting, death, respawn, and XP hooks acceptance (2026-08-17)

Player attacks, enemy attacks, abilities, and periodic effects share one server combat pipeline with structured formulas (no eval). Targeting validates match entity IDs. Death and respawn are server-authoritative (3s auto-respawn or `RELEASE_RESPAWN`; bind if set, else `zone.starter.playerSpawn`). PvP remains impossible. XP grants go through trusted server hooks; clients cannot forge amounts. Prompt 18 combat numbers and the slime-kill e2e path remain. Parties, inns as a full system, extra enemy AI, merchants, and PvP were not added.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `7a3006806260ec57ddf338c72dbf5d932786909143acab0abc7b5d9e2e6b024a` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 18 client opcodes, 12 server opcodes) |
| Server | 276/276 |
| Client GdUnit | 145/145, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic enemies, spawn controllers, AI profiles, loot tables, and bosses acceptance (2026-08-17)

The Prompt 18 slime is a normal enemy definition (`enemy.green_slime`, `test.ai.melee`, `loot.green_slime`, instance `enemy.green_slime:0`). Spawn controllers create, track, respawn in place, ignore duplicate slot respawns, and reset spawn groups. Melee, ranged, and caster AI profiles run as a server state machine; the client only presents `state`. Threat is nearest-plus-damage (heal when configured), with leash/return. Loot tables and XP process each enemy death event once. The two-phase test cave boss enrages, resets on wipe or leash, and is not auto-spawned in the live starter zone. A new ordinary enemy that reuses an existing AI profile is content-only. Caves, parties, merchants, and PvP were not added.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `e25c7589697354405e85712f6b166bdfd202eeb38e08b26d10e26451957dc682` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 18 client opcodes, 12 server opcodes) |
| Server | 301/301 |
| Client GdUnit | 146/146, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Generic NPC services, dialogue, quests, merchants, and inn acceptance (2026-08-17)

The Prompt 18 elder is a normal NPC with content services (`dialogue`, `quest_offer`, `quest_turn_in`). There are no elder, merchant, or innkeeper classes. `quest.slime_problem` runs on the generic quest engine (stages, reusable objectives, prerequisites). Vendors buy and sell at server prices through the transaction service. Inn/healer rest heals, restores class resources, optionally charges gold, and persists bind on the character record. `CAVE_ENTER` returns `cave_unavailable` and does not transfer the player. Dialogue opens only after server-approved `INTERACTION_RESULT` extras. Adding another ordinary quest that uses existing objective types is content-only. Cave instances, parties, and player trading were not added. Prompt 18 elder/slime positions and the slime-quest complete notice remain.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `5b41c0cdfdf7e6130c4198b098cc88c1e7be512074589b577991f37f34ee3a0d` |
| Audit | `FOUNDATION_AUDIT_OK` (10 storage records, 22 client opcodes, 12 server opcodes) |
| Server | 325/325 |
| Client GdUnit | 149/149, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Temporary parties, party chat, group credit, and group loot acceptance (2026-08-17)

Up to five characters can form a server-owned temporary party. Canonical records live in Nakama storage (`party` / `p`, `player` / `party`) with `permissionWrite: 0` and are not a player-save kind. Parties survive a 60 s disconnect grace, then disband when all members stay absent. Party chat is room `party.<partyId>` with membership checks, 200-character Label text, and a 4/2 s send limit. Group kill and quest credit use the match party cache (same match, alive or recently dead, 512 px). XP defaults to `full` per eligible member; solo remains killer-only. Loot policies `personal` and `server_assigned` cannot duplicate a death `eventId`. Clients cannot nominate members or recipients. Cave entry remains `cave_unavailable`. Prompt 18 elder/slime/gel/solo XP behavior is unchanged when not in a party. The e2e elder approach standoff is 24 px so walk arrival stays inside interaction range.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `231a99ccee7209e8e1faf4392e97863f57f73a68d3b3f194343a532d80bb380f` |
| Audit | `FOUNDATION_AUDIT_OK` (12 storage records, 22 client opcodes, 14 server opcodes, 17 rpcs) |
| Server | 343/343 |
| Client GdUnit | 163/163, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Public world, party cave instances, transfers, and reconnection acceptance (2026-08-18)

Players share one discoverable `public_world` match (`zone.starter`). A solo character or a party of up to five can enter one private `party_cave` (`zone.cave`) through the valley portal. Party members receive the same instance and match ids; non-members are denied. `CAVE_ENTER` / `CAVE_EXIT` issue one-time server tickets (25 s TTL). The destination consumes the ticket and sends `FULL_STATE`. Canonical location forbids two live matches. Disconnecting cave players rejoin during a 60 s grace, then fall back to the public world. Cave matches empty-timeout, expire, and terminate without persisting transient enemies. There is no public-world sharding or extra world-directory system. `find_or_create_starter_zone` remains the locator. Prompt 18 elder/slime/gel/solo XP and the e2e slice stay on the public world.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `58134490916197c49e40642465d949fe17350fe7f798edc5857bed947a1ade86` |
| Audit | `FOUNDATION_AUDIT_OK` (17 storage records, 23 client opcodes, 14 server opcodes, 20 rpcs) |
| Server | 370/370 |
| Client GdUnit | 174/174, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Secure direct player trading acceptance (2026-08-18)

Two nearby living players in the same match can invite, offer items and gold, accept a revision, and exchange once. Offers bump `revision` and clear both acceptances. Offered stacks are locked against equip, destroy, vendor sale, consume, stack moves that invalidate quantity, and other trades. Gold is validated at offer and commit and reserved against vendor buy and inn spend. Commit uses `nk.multiUpdate` for both inventories and both wallets, or retries a `committing` snapshot so a crash cannot duplicate items or gold. Duplicate `requestId` replays. Cancel, invite/session timeout, disconnect beyond 5 s, zone transfer, death, and out-of-range leave both players valid. The HUD mirrors invite, two offer panels, gold, revision, acceptances, an offer-changed warning, cancel, and completion/error without predicting ownership. Mail, auction houses, and offline trade were not added. Content hash is unchanged.

| Gate | Result |
| --- | --- |
| Content | 14/14, matching hash `58134490916197c49e40642465d949fe17350fe7f798edc5857bed947a1ade86` |
| Audit | `FOUNDATION_AUDIT_OK` (20 storage records, 31 client opcodes, 15 server opcodes, 20 rpcs) |
| Server | 399/399 |
| Client GdUnit | 178/178, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Complete functional UI, settings, and asset contracts acceptance (2026-08-18)

The client shell covers registration, login, character list/create/class select, loading/reconnect, the main HUD (health/resources, target, hotbar, cast bar, status effects, stats, attributes, skills, inventory, equipment, journal, dialogue, merchant, inn, party, zone/party chat, trade, cave, death/respawn, settings, logout, errors). `WindowManager`, `HudController`, `TooltipService`, `DragDropService`, `InputSettingsService`, `AudioSettingsService`, `UiStateService`, and `NotificationService` own presentation only. Local settings persist without credentials. Visual/audio sets use stable IDs in `client/content/asset_manifest.json` (4-dir vs 8-dir is `directionCount`). Missing IDs warn, fall back, and do not crash. No final art. Content hash is unchanged.

| Gate | Result |
| --- | --- |
| Content | unchanged hash `58134490916197c49e40642465d949fe17350fe7f798edc5857bed947a1ade86` |
| Audit | `FOUNDATION_AUDIT_OK` (20 storage records, 31 client opcodes, 15 server opcodes, 20 rpcs) |
| Client GdUnit | 190/190, 0 orphans, `SHELL_LOGIN` |

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-client.ps1
```

## PROG-09 Warrior, Bulwark, and Berserker implementation (2026-09-16)

Warrior is the first canonical class active in the existing authoritative combat path. `ATTACK` resolves `ability.warrior.auto_attack` (12 base melee damage, 2.0s base interval, STR scaling, server-side crit, and Haste timing), while Heavy Strike is separately granted at level 2 and remains a hotbar active. The production four-slot hotbar continues to exclude auto-attacks and passive Frenzy.

All Warrior class-tree, Bulwark, and Berserker nodes are resolved from purchased talent content. This includes Heavy Strike rank replacement, Conditioning, Weapon Mastery, Challenge ranks and scoped taunt reduction, Iron Thorns non-recursive melee reflection, Fortitude rank replacement, Shield Bash and its stun rank, Punishment, Last Stand once-per-combat threshold healing, Unbreakable, Frenzy stack/rank/expiry behavior, Slaughter, Relentless cooldown recovery, Bloodlust, Whirlwind, Bloodthirst, Reckless, and Berserk. No second combat, effect, threat, cooldown, stat, ability, or progression system was added. No client outcome authority, production GCD, or PvP path was added.

The intentional Warrior content update changes the shared generated hash to `913d28c51ea050509cf4eb57acbfd149012d56a6b3b354ff806d48bc8f1a47c6`. Challenge and Whirlwind radii, Shield Bash range, and Frenzy/Bloodthirst tags are recorded as noncanonical implementation values in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). No storage schema migration is required; current progression purchases and match-lived effect state are reused.

| Gate | Result |
| --- | --- |
| Content-build | 25/25 |
| Foundation audit | `FOUNDATION_AUDIT_OK` |
| Server hermetic | 673 passed, 13 skipped; bundle built |
| Warrior mechanics and balance regressions | 4/4 (`warrior_progression`, `warrior_balance`) |
| Auth gateway | 52/52 |
| Migration fixture dry-run / apply / verify | passed |
| Client GdUnit | 283/283, 0 failures, 0 orphans |
| GitHub `verify` | passed (`0867ac9`, run 35112093346) |

Remaining work is limited to later named PROG phases. PROG-13 is recorded below.

## PROG-13 character progression and skill-tree UI (2026-09-16)

The player-facing progression UI is complete on the existing PROG-06/07 opcodes. The client still sends intentions only (`ALLOCATE_ATTRIBUTES`, `ALLOCATE_ATTRIBUTES_BATCH`, `SET_AUTO_ASSIGN`, `AUTO_ASSIGN_UNSPENT_POINTS`, `SELECT_BRANCH`, `PURCHASE_TALENT`, `ASSIGN_HOTBAR`, `TRAINER_RESPEC`). It never submits XP, level, derived totals, gold cost, ranks, or respec results as facts. Canonical values come from `publicProgression` and ability state.

Character creation shows four class cards (Warrior, Mage, Marksman, Mystic) with name, role, resource type, generic glyph/shape/theme, identity copy, and confirmation that class cannot currently be changed. No final class art and no balance promises.

The character sheet shows class, branch, level, XP bar, current XP, XP to next, lifetime XP in development details, eight base stats with automatic growth / free allocations / equipment contribution / temporary effects / final total, derived HP, caster-only mana and regeneration, crit chance, crit multiplier, haste, damage reduction, and unspent free/class/branch points. Physical classes omit mana. Allocation uses plus controls, a pending batch, remaining-point preview, confirm/cancel, auto-assign toggle, assign-current-unspent, and server error recovery. Committed points cannot be decremented except by trainer respec.

Level-up presentation is a skippable toast covering level gained, automatic stats, free/class/branch points, milestone unlocks, branch choice, and level cap. The level-5 branch chooser shows exactly two branches, requires confirmation, selects no default, and leaves the character branchless with persistent guidance if closed. Class trees show three nodes and two earned points. Branch trees show eight nodes, nine point-slots, tiers, ranks, active markers, textual prerequisites, spend/available, lock reasons, and level-9 Tier-3 guidance. Visual adjacency is not treated as a prerequisite.

The ability book lists auto-attack separately from owned actives, passives, locked milestones, and purchased talent actives, including cooldown, cast time, mana cost, rank notes, and source. The production hotbar has four slots; passives and auto-attack cannot occupy them; assignment is reconciled by the server. Reference builds from design §11 are optional nonbinding copy and do not auto-spend. Trainer respec confirmation shows gold cost, what resets, what remains, resulting unspent points, insufficient gold, and branch reselection when level ≥ 5.

Keyboard focus, UI scale, color-independent lock labels, tooltips, long wrapping copy, no double confirm, request timeout restore, reconnect window restore, character-switch clearing, and link-dead blocking are covered. Foundation left-column +1 allocate/unlock remains for `class.one` tests. Content was not rebuilt; hash is unchanged.

| Gate | Result |
| --- | --- |
| Content hash | unchanged `b76111cf9fb663dd04de943d3de5af004249b29c1321fe563bc9eac9d731f2de` |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 714 passed, 13 skipped |
| Client GdUnit | 297/297, 0 failures, 0 orphans, `SHELL_LOGIN` |
| PROG-13 UI suite | 14/14 (`client/tests/app/progression_ui_test.gd`) |
| GitHub `verify` | passed (`3780a75`, run 35146268952) |

Limitations: Production leftover-field migration is PROG-14. Production legacy-path removal and balance certification remain PROG-15. Final class art is not required. Equipment vs temporary effects uses the remainder of derived minus automatic minus free until `publicProgression` splits those channels. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-14 persistence, leftover migration, and developer tools (2026-09-16)

Progression survives the accepted lifecycle: return to Character Select, logout/leave, link-dead, ten-second despawn, reconnect, cave transfer, public-world transfer, server restart (`matchTerminate`), content-reload migrate, soft deletion, restoration, account export, and account deletion. Character Select summaries reread class, level, and branch from the persisted blob after level gain, branch choice, respec, reconnect, and restart.

`progressionSchemaVersion` is **3**. `SAVE_SCHEMA_VERSION` stays **1**. `test.*` characters keep Foundation authorities. Production leftover `allocatedAttributes`, live 8-slot `hotbar`, Foundation unspent counters, and `test.ability.*` unlocks are reset with notice `leftover_foundation_reset`. Canonical unspent free points stay `3 * (level - 1)`. Future versions are `unsupported_future_version` and are not rewritten. Interrupted leftover cleanup retries without duplicating spend.

XP grants, level rewards, automatic growth, free/class/branch points, basic/signature/capstone unlocks, talent purchase, respec, enemy kill credit, quest XP, party XP, and boss kill XP remain `eventId` / `requestId` idempotent. Party credit uses existing eligibility: forged membership is ignored, dead/out-of-range members are skipped, enemy level is authoritative, elite ×3 is server-owned. Eligible party members receive XP once. Mystic friendly abilities and Warrior taunt stay on the existing relation/threat paths. PvP remains disabled.

Soft-delete restore preserves level, XP, branch, talents, hotbar, auto-assign, and grant maps and does not regrant starters or refill gold. Account export includes a `progressionExport` snapshot (class, branch, level, XP, allocations, purchased nodes, auto-assign, hotbar). Permanent deletion and character purge remove every progression record. Recreating after purge does not inherit progression.

Authorized GM tools (`gm_command`, server allowlist, audited): inspect progression, grant XP event, grant exact test XP, reset progression fixture, set auto-assign, grant test gold, open branch selection, reset full build through canonical respec (no gold), simulate level-up, inspect active effects, inspect cooldown recovery, and run progression validation. There is no `set_level` command. Debug HUD is presentation only. Content was not rebuilt; hash is unchanged. `C-legacy-migration` is RESOLVED.

| Gate | Result |
| --- | --- |
| Content hash | unchanged `b76111cf9fb663dd04de943d3de5af004249b29c1321fe563bc9eac9d731f2de` |
| Design audit | 10/10 (`server/tests/progression_design_audit.test.ts`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 739 passed, 13 skipped (Node 22 glob `dist-test/tests/*.test.js`; directory `npm test` still fails on Node 22) |
| Client GdUnit | 297/297, 0 failures, 0 orphans, `SHELL_LOGIN` |
| GitHub `verify` | passed (`8a6ed58`, run 35150769811) |

Limitations: Production legacy-path removal and balance certification remain PROG-15. The eight-slot Foundation hotbar remains test-only. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-progression-design.ps1
npx tsc -p tsconfig.test.json
node --test dist-test/tests/*.test.js
powershell -File scripts/test-client.ps1
```

## PROG-15 deterministic balance simulator and certification (2026-09-16)

The progression system matches the canonical design. No new class features were added. The project-owned simulator (`server/src/domain/progression_simulator.ts`) reuses live content parsers, §4 formulas, ability timings, mana spend/regen, cooldown recovery, crit expected value `1 + CritChance * (CritMult - 1)`, DoT snapshot and replace stacking, and talent modifiers. It is not a second formula table. Analytic EV and seeded event-simulation share that path. `npm run simulate` in `server/` emits traces, JSON, and a human report.

Level-10 auto-growth sheets match §6.3 for Warrior, Mage, Marksman, and Mystic. §12 DPS/HPS at level 10, auto-growth only, signature included, no tree nodes, 60s fight, stay within ±5%: Sniper 19.033, Skirmisher 18.939, Fire 18.759, Frost 17.590, Curses 17.368, Berserker 16.097, Bulwark 14.830, Charms solo 14.302, Charms party HPS 22.162. Seeded mode (seed 34) stays near analytic EV. Curses maintains one Wither (`replace`) and fills with Fateweave harm; overlapping DoT stacks are rejected.

Cross-checks hold: Warrior EHP tank margin 1.69–1.79×, healer vs one/two mean DPS branches, 120-HP TTK, greed orderings, Mage metronome hold, Mystic Fateweave authored miss `6.867 > 6.2` (not rebalanced), Tier-3 lockout before level 9, max actives, DoT no-crit, haste does not change stored cooldowns, total XP 11,100, base arrays 34, level-10 total 115, class points 2, branch points 6. Enemy baselines are `40 + 8 * level` HP and `2 + 0.5 * level` damage, elite 3× HP / 2× damage / 3× KillXP, levels 1–10. Live `enemy.green_slime` stays 20 HP / level 1. Sixteen §11 reference-build fixtures allocate 27 free points without violating totals and are not enforced on players.

The GM-accelerated journey covers all four classes: exact level-1 arrays, auto-attack, level 2 basic skill, class-tree 2-of-3, both branches via trainer respec, signatures, branch spend, Tier-3 at 9, capstone at 10, ≤1 extra buyable active, 27 free points, sibling auto-assign, trainer respec refund and rebuild, vitality gear recalc, unexpected disconnect / lease restore, terminate persist, soft-delete / restore / purge, account export, permanent delete, and email reuse isolation. Four-class party certification covers Challenge taunt, Arcane Bolt mana at cast start, Marksman ranged ATTACK, Fateweave heal and Protective Charm, `pvp_disabled`, one party XP grant, source stacking, and link-dead cleanup.

Certification docs: [progression/PROGRESSION_READY.md](progression/PROGRESSION_READY.md), [progression/CLASS_CONTENT_GUIDE.md](progression/CLASS_CONTENT_GUIDE.md), [progression/ABILITY_CONTENT_GUIDE.md](progression/ABILITY_CONTENT_GUIDE.md), [progression/TALENT_CONTENT_GUIDE.md](progression/TALENT_CONTENT_GUIDE.md), [progression/BALANCE_REGRESSION_REPORT.md](progression/BALANCE_REGRESSION_REPORT.md), [progression/PROGRESSION_RECOVERY_RUNBOOK.md](progression/PROGRESSION_RECOVERY_RUNBOOK.md), [progression/KNOWN_PROGRESSION_LIMITATIONS.md](progression/KNOWN_PROGRESSION_LIMITATIONS.md). Suggested tag `character-progression-v1` is **not** created until the working tree is clean and a human approves.

Repository audit: four selectable `class.*` including Mystic, one `progression_service.gd`, no client `write_storage_objects`, no class ids in generic combat modules, `isDot` skips crit, no production GCD coupling, no vendor edits, no progression plugin, no `DEFERRED` production conflict rows, no test-only class in the production roster. Content hash is unchanged.

| Gate | Result |
| --- | --- |
| Content hash | unchanged `b76111cf9fb663dd04de943d3de5af004249b29c1321fe563bc9eac9d731f2de` |
| Design audit | 10/10 (`server/tests/progression_design_audit.test.ts`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 760 passed, 13 skipped (Node 22 glob `dist-test/tests/*.test.js`; directory `npm test` still fails on Node 22) |
| Server typecheck / bundle | `tsc --noEmit` and `npm run build` succeeded |
| Client GdUnit | 297/297, 0 failures, 0 orphans, `SHELL_LOGIN` |
| Simulator | `npm run simulate -- --mode analytic` matches the §12 table within ±5% |

Limitations: Charms solo TTK versus the 120 HP §13 mob is 8.391s (3.6% above the 8.1s design upper bound, inside the cert ±5% band). Charms party HPS follows the design methodology and reports OOM at 39.8s instead of retuning Fateweave. Prompt 18 slime HP stays 20. The eight-slot Foundation hotbar remains test-only. The suggested git tag is not created. Manual Prompt 18 world play was not re-run.

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-progression-design.ps1
Set-Location server
npx tsc -p tsconfig.test.json
node --test dist-test/tests/*.test.js
npm run simulate -- --mode analytic --trace
npm run typecheck
npm run build
powershell -File ..\scripts\test-client.ps1
```

## PROG-12 Mystic, Charms, and Curses implementation (2026-09-16)

Mystic is the fourth canonical class active in the existing authoritative combat path. `ATTACK` resolves `ability.mystic.auto_attack` (6 base spell damage, 2.0s base interval, INT scaling, server-side crit, and Haste timing). Fateweave is granted at level 2. Protective Charm, Blessing, Wither, and Evil Eye unlock with class and branch nodes. Benediction and Malediction unlock at level 10. No generic combat module branches on `class.mystic`. No second combat, effect, cooldown, stat, ability, or progression system was added. No client outcome authority, production GCD, or PvP path was added.

Target relation selects Fateweave polarity: hostile 20 INT spell harm, ally or self 22 SPI heal, 1.8s cast, 12 mana. R2 raises both polarities 25%. Compassion adds a 20%/4s HoT after an eligible mend. Malice adds a 20%/4s DoT after an eligible harm; that DoT never crits. Protective Charm is 40 SPI absorb, 18 mana, 8s cooldown, 6s duration; R2 +30% absorb; R3 heals 15% of absorb once on break or natural expiry (refresh/replace cannot duplicate the terminal heal). Battle Blessing arms after an eligible mend and is consumed once on the next eligible harm (+25%). Devotion is +8%/+16% healing. Blessing is 25 mana / 20s cooldown, nearby allies +10% damage for 10s; R2 also +8 percentage points of damage reduction. Mending Ward regenerates 2% of target maximum HP per second while this Mystic’s shield remains. Overflow heals the Mystic for 20% of healing dealt to others and cannot recurse. Benediction heals nearby allies for 30% maximum HP and shields 10% maximum HP for 4s at zero mana with a 90s cooldown.

Wither deals 36 INT-scaled damage over eight ticks in 8s, 1.5s cast, 14 mana, never crits. R2 +25% total. R3 makes affected enemies deal 10% less damage. Siphon heals 15% of Fateweave harm. Dark Bargain reduces tagged curse costs 10%/20%. Evil Eye is 15 mana / 12s cooldown and makes the target take 15% more damage for 8s. Festering increases this Mystic’s DoT tick rate 20% without changing total damage. Vampiric Curse heals 10% of this Mystic’s DoT damage and cannot recurse. Contagion transfers Wither at full remaining design duration to one valid nearby enemy on death (server-authoritative, idempotent). Malediction applies the current Wither rank to all eligible nearby enemies and they deal 15% less damage while that Wither runs; Wither R3 and Malediction reductions remain separate sources. Malediction is zero mana / 90s cooldown.

The Mystic Metronome Law regression is the documented authored miss `12 / (1.8 / 1.03) ≈ 6.87 > 6.2`. Fateweave is not rebalanced. Charms solo DPS ≈14.3, party HPS ≈22.2, and Curses DPS ≈17.3 stay within ±5%.

The intentional Mystic content update changes the shared generated hash to `b76111cf9fb663dd04de943d3de5af004249b29c1321fe563bc9eac9d731f2de`. Nearby Blessing/Benediction/Malediction/Contagion radius 80 and Battle Blessing arm duration 30s are recorded as noncanonical implementation values in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). No storage schema migration is required.

| Gate | Result |
| --- | --- |
| Content-build | 25/25; hash `b76111cf9fb663dd04de943d3de5af004249b29c1321fe563bc9eac9d731f2de` |
| Design audit | 10/10 |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 714 passed, 13 skipped; bundle built |
| Mystic mechanics and balance regressions | 16/16 (`mystic_progression`, `mystic_balance`, `progression_metronome`) |
| Client GdUnit | 283/283, 0 failures, 0 orphans, `SHELL_LOGIN` |
| GitHub `verify` | passed (`e2e23ed`, run 35139125655) |

Limitations: The eight-slot Foundation hotbar remains test-only. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-11 Mage, Fire, and Frost implementation (2026-09-16)

Mage is the third canonical class active in the existing authoritative combat path. `ATTACK` resolves `ability.mage.auto_attack` (6 base spell damage, 2.0s base interval, INT scaling, server-side crit, and Haste timing). Arcane Bolt is granted at level 2. Fireball and Ice Bolt unlock with their branches. Meteor and Absolute Zero unlock at level 10. Flame Wave and Flash Freeze are the buyable tree actives. No generic combat module branches on `class.mage`. No second combat, effect, cooldown, stat, ability, or progression system was added. No client outcome authority, production GCD, or PvP path was added.

Mana is spent at cast start; movement interrupts do not refund. Kindled Mind reduces spell costs by 10%/20%. Afterburn applies only after a Fireball crit, deals 25% of the actual hit over 4s, and never crits. Flame Wave is a cone; R2 leaves 12 INT-scaled burn over 3s. Detonation adds 0.15 spell crit multiplier. Second Spark refunds 8% of maximum mana on eligible crits and clamps to max. Meteor marks ground, resolves after 1.5s, always crits, costs zero mana, and uses a 90s cooldown. Ice Bolt slows 30% for 3s; Deep Chill extends to 4s/5s; R3 adds 20% damage against slowed targets. Numbing Cold is source-owned outgoing reduction on this Mage’s slows. Flash Freeze is instant zero-damage root; R2 is 3s and +50% radius. Rimeguard and Winter Harvest track living enemies this Mage currently slows, roots, or freezes. Absolute Zero fully incapacitates nearby enemies for 4s. The Metronome Law regression is the documented result `5 / (1.5/1.12) = 3.73 ≤ 3.8`.

The intentional Mage content update changes the shared generated hash to `5cea7b29fd80d47f52919d1af156a2fa775db192a92b21bf2d966b82202417dd`. Nearby radius 40 and Flame Wave cone 60° remain the PROG-02 implementation geometry; cone length uses the authored ability range. No storage schema migration is required.

| Gate | Result |
| --- | --- |
| Content-build | 25/25; hash `5cea7b29fd80d47f52919d1af156a2fa775db192a92b21bf2d966b82202417dd` |
| Design audit | 10/10 |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 698 passed, 13 skipped; bundle built |
| Mage mechanics and balance regressions | 13/13 (`mage_progression`, `mage_balance`, `progression_metronome`) |
| Client GdUnit | 283/283, 0 failures, 0 orphans, `SHELL_LOGIN` |
| GitHub `verify` | passed (`4b3d188`, run 35131467994) |

Limitations: Mystic combat remains PROG-12. The eight-slot Foundation hotbar remains test-only. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-10 Marksman, Sniper, and Skirmisher implementation (2026-09-16)

Marksman is the second canonical class active in the existing authoritative combat path. `ATTACK` resolves `ability.marksman.auto_attack` (10 base ranged damage, 1.8s base interval, AGI scaling, server-side crit, and Haste timing). Aimed Shot is granted at level 2. Sniper Snipe and Skirmisher Barrage unlock with their branches. No generic combat module branches on `class.marksman`. No second combat, effect, cooldown, stat, ability, or progression system was added. No client outcome authority, production GCD, or PvP path was added.

Snipe is a channel that applies on completion: `channelSeconds = 1.5 * (1 + ability_channel_time * rank) / HasteMult`. Auto-attacks pause while aiming; stuns and movement interrupt. Barrage rolls independent crits per arrow. Serrated bleeds are DoTs (never crit) tagged `bleed`; Arrowstorm doubles only those tagged ticks while preserving remaining total. Vault leaps backward along facing and stops at the last valid collision point. Vault R2 caltrops linger at the launch point. Haste does not change stored cooldown duration. Nimble, Sniper's Nest, and Runner's High advance remaining cooldown ticks only while their conditions hold.

The intentional Marksman content update changes the shared generated hash to `e1e03af49b43acdc5242268bd52b2f7ec6e7ec2e794d3dfd93c0b3f8dca6c38f`. Snipe channel order, Killer Instinct melee range, and caltrop radius are recorded as noncanonical implementation values in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). No storage schema migration is required.

| Gate | Result |
| --- | --- |
| Content-build | 25/25; hash `e1e03af49b43acdc5242268bd52b2f7ec6e7ec2e794d3dfd93c0b3f8dca6c38f` |
| Design audit | 10/10 |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 684 passed, 13 skipped; bundle built |
| Marksman mechanics and balance regressions | 11/11 (`marksman_progression`, `marksman_balance`) |
| Client GdUnit | 283/283, 0 failures, 0 orphans, `SHELL_LOGIN` |
| GitHub `verify` | passed (`108e529`, run 35122418089) |

Limitations: Mage and Mystic combat remain PROG-11–12. The eight-slot Foundation hotbar remains test-only. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## Content production workflow, systems lab, and developer/GM tools acceptance (2026-08-19)

One developer can author Foundation content through `scripts/content.ps1` (`validate`, `build`, `diff`, `references`, `unused`, `new <type>`, `copy`, `migrate`, `package`, optional CSV). Templates are schema-valid starters without generated balance or prose. Validation covers duplicate IDs, missing references, cyclic prerequisites, impossible quest stages, missing quest NPCs and enemy abilities, invalid loot/equipment/class/level-curve data, missing assets, development-content leakage, orphans, and unsupported schema versions. `test.zone.systems_lab` is `developmentOnly` and is omitted from the production payload unless `--include-dev`. A content-only proof chain (`item.proof_token`, `enemy.proof_critter`, `loot.proof_critter`, `npc.proof_giver`, `quest.proof_errand`) is in production; elder stays at 160,320 and slime at 960,400. `gm_command` is server-allowlisted (default disabled) and audited; the debug GM panel is not authority. No RPG database plugin. Protocol version and `SAVE_SCHEMA_VERSION` stay 1. Guide: [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md).

| Gate | Result |
| --- | --- |
| Content | 23/23, matching hash `985e5073b1e51f52205f73f85c65982f63454ed87ca4142765fd17a97692b7bc` |
| Audit | `FOUNDATION_AUDIT_OK` (24 storage records, 31 client opcodes, 15 server opcodes, 21 rpcs) |
| Server | 405/405 |
| Client GdUnit | 193/193, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Environments, version compatibility, deployment, backups, and recovery acceptance (2026-08-19)

Local, `automated_test`, staging, and production policies are distinct (`infra/environments/*.json` plus compiled presets). Secrets stay in gitignored env files; committed examples use `REPLACE_ME`. Login RPC `session_handshake` and match join metadata carry `clientVersion`. Incompatible clients get `client_too_old`, `client_too_new`, `protocol_mismatch`, `content_mismatch`, `unsupported_save_version` and do not enter gameplay. Maintenance rejects new joins, keeps GM/ops login, warns before `shutdownAt`, and blocks ordinary transactions with `migration_required`. Ops counters use lexical storage so Nakama’s JS VM can increment them. A local Postgres dump restored into `nakama_restore_drill` matched 20 public tables. Rollback and recovery procedures are in [RECOVERY.md](RECOVERY.md). Protocol version and `SAVE_SCHEMA_VERSION` stay 1. Content hash is unchanged. Prompt 18 village/slime stay frozen.

| Gate | Result |
| --- | --- |
| Content | 23/23, matching hash `985e5073b1e51f52205f73f85c65982f63454ed87ca4142765fd17a97692b7bc` |
| Audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 rpcs) |
| Server | 419/419 |
| Client GdUnit | 200/200, 0 orphans, `SHELL_LOGIN` |
| Backup drill | dump local `nakama` → restore `nakama_restore_drill` → 20 public tables |
| Live backend | `session_handshake` + `find_or_create_starter_zone` (Alice/Bob) |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 (walk, combat, quest, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-backup.ps1
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-e2e.ps1
```

Release export: `powershell -File scripts/export-client-release.ps1` (requires Godot 4.7.1 Windows export templates). Docker image: `powershell -File scripts/docker-build.ps1` or `scripts/backend-up.ps1`. Guides: [ENVIRONMENTS.md](ENVIRONMENTS.md), [DEPLOYMENT.md](DEPLOYMENT.md), [RECOVERY.md](RECOVERY.md).

## Security, abuse, failure, load, and soak certification acceptance (2026-08-19)

No gameplay was added. Protocol version and `SAVE_SCHEMA_VERSION` stay 1. Content hash is unchanged. Public-world cap stays 8; the capacity scenario simulates 20 characters with match extras. Cave cap stays 5. Prompt 18 village/slime poses stay frozen.

Every listed attack has a seven-field control in [SECURITY_MODEL.md](SECURITY_MODEL.md) and `server/src/domain/security_catalog.ts`. Match rate buckets are split (inventory, equip, quest, vendor, cave, trade). Session rates for auth, chat, and mutating party RPCs use a lexical replace-whole-map engine. Deterministic fuzz fixtures do not crash the match or mutate gold/items. Headless `--cert-five` bots use ordinary RPCs and opcodes. Domain failure coverage includes disconnect, delayed/duplicate messages, cave terminate, stale presence, and trade recovery. Live Nakama/Postgres restart is opt-in (`scripts/test-failure.ps1 -Live`).

| Gate | Result |
| --- | --- |
| Content | 23/23, matching hash `985e5073b1e51f52205f73f85c65982f63454ed87ca4142765fd17a97692b7bc` |
| Audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 rpcs) |
| Server | 440/440 |
| Client GdUnit | 203/203, 0 orphans, `SHELL_LOGIN` |
| Capacity | `reports/capacity.cert.json`: 20 public-world characters + 2×5 cave instances, cave cleanup ok, 0 ghosts |
| Soak | `reports/soak.cert.json`: 200 ticks, 4 bots, 0 errors, gold unchanged, no ghosts/locks/live trades/parties. Manual: `powershell -File scripts/test-soak.ps1 -DurationSec 3600` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 |
| Five-client | `CERT_FIVE_OK` (auth, join, combat, loot, quest, vendor, party, chat, cave, boss, trade, reconnect) |

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
powershell -File scripts/test-capacity.ps1
powershell -File scripts/test-soak.ps1
powershell -File scripts/test-cert-journey.ps1
```

## Final content-ready foundation certification acceptance (2026-08-19)

No gameplay systems, opcodes, storage record types, persistence permissions, transaction mechanisms, or world-lifecycle changes were added. Protocol version and `SAVE_SCHEMA_VERSION` stay **1**. Prompt 18 elder **160,320** and slime **960,400** stay frozen. Suggested tag **`foundation-v1`** is not created until the working tree is clean and the user approves.

The content-only mini-pack (`test.class.warden`, `test.ability.cert_strike`, `item.cert_mail`, `enemy.cert_scout`, `loot.cert_scout`, `npc.cert_quartermaster`, `quest.cert_scout`, `vendor.cert_quartermaster`, `spawn.starter.cert_scout`) completes `quest.cert_scout` through existing opcodes. Asset-manifest replacements cover character, enemy, NPC, item icon, ability icon, world tile, and SFX without gameplay-script edits. Existing-save fixtures `p18-alice`, `p20-v1-alice`, `p21-class-alice`, and `current-v1-alice` dry-run to schema 1 with gold **25** and a single completed slime quest.

Headless `--cert-five` (stamp `1787139186964`) used five accounts (three `test.class.vanguard`, two `test.class.arcanist`): shared world, zone and party chat, Slime Problem, combat, loot, vendor buy/sell, inn rest/bind, `item.cert_mail` equip, party of five, one cave, in-cave reconnect, one boss credit (first HP wrap; cave `respawnDelay` is 0), attribute allocate, `test.ability.small_heal` unlock, cave exit, item-and-gold trade, logout, Nakama and Postgres restart, `--cert-five-resume` with persistent quest/gold/item. Prompt 18 `E2E_SLICE_OK` still holds.

| Gate | Result |
| --- | --- |
| Content | 23/23, hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` |
| Audit | `FOUNDATION_AUDIT_OK` (26 storage records, 31 client opcodes, 15 server opcodes, 24 rpcs) |
| Server | 447/447, `tsc --noEmit` clean |
| Client GdUnit | 206/206, 0 orphans, `SHELL_LOGIN` |
| Capacity | `reports/capacity.cert.json`: 20 public-world characters + 2×5 cave instances, cave cleanup ok, 0 ghosts |
| Soak | `reports/soak.cert.json`: 200 ticks, 4 bots, 0 errors, gold unchanged, no ghosts/locks/live trades/parties. Manual: `powershell -File scripts/test-soak.ps1 -DurationSec 3600` |
| E2E | `E2E_SLICE_OK` against live Nakama 3.40.0 |
| Five-client | `CERT_FIVE_OK` then backend restart then `CERT_FIVE_RESUME_OK` |
| Backup | dump `nakama` → `nakama_restore_drill`, 20 public tables |
| Existing saves | all four fixtures dry-run ok, gold 25, no duplicated slime quest or iron sword |
| Release export | `scripts/export-client-release.ps1` produced `client/exports/windows/small-mmorpg.exe` after `scripts/install-export-templates.ps1` |

Clean checkout commands: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). Certificate summary: [FOUNDATION_READY.md](FOUNDATION_READY.md).

Reproduction:

```powershell
powershell -File scripts/setup.ps1
powershell -File scripts/content-validate.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/server-build.ps1
powershell -File scripts/dev-up.ps1
powershell -File scripts/test-all.ps1
```

## Post-certification defect repair (2026-08-19)

Not a new phase. Proof/cert quest turn-in now passes the NPC id (Elder was already correct). Ground loot uses item visuals instead of missing `visual_set.item.*` warnings. Cave death uses cave spawn when the inn bind is in `zone.starter`. Server tests **447/447**. Client GdUnit **206/206**. Godot 4.7.1 Windows templates were installed with `scripts/install-export-templates.ps1`; `scripts/export-client-release.ps1` produced `client/exports/windows/small-mmorpg.exe`. Suggested tag **`foundation-v1`** is still not created until the tree is clean and the user approves.

## Account lifecycle audit and Nakama compatibility acceptance (ACCT-01, 2026-08-19)

Documentation and compatibility proofs only. Player-visible login, character select, world, slots, classes, disconnect grace, and logout UI are unchanged. No second authentication service or character model. No dependency upgrades. No custom SQL on Nakama auth tables.

Catalogs live under [docs/account/](account/ACCOUNT_ARCHITECTURE.md), including [ACCOUNT_STATE_MACHINE.md](account/ACCOUNT_STATE_MACHINE.md). Live proofs against pinned **Nakama 3.40.0** / **nakama-runtime 1.47.0** are in [docs/account/NAKAMA_COMPATIBILITY_RESULTS.md](account/NAKAMA_COMPATIBILITY_RESULTS.md). Later phases must use those sequences.

Development-gated RPC `acct_compat_probe` and storage index `acct_compat_email_hmac` exist for proofs. The Godot client does not call the probe. Production `developmentToolsEnabled` is false.

| Gate | Result |
| --- | --- |
| Content | 23/23, hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` |
| Audit | `FOUNDATION_AUDIT_OK` (27 storage records, 31 client opcodes, 15 server opcodes, 25 rpcs) |
| Server hermetic | 457 passed, 10 skipped (live suite off), `tsc --noEmit` clean |
| Account live | 10/10 with `ACCT_COMPAT_LIVE=1` (`scripts/test-account-compat.ps1`) |
| Client GdUnit | 220/220, 0 orphans, `SHELL_LOGIN` |
| E2E | `E2E_SLICE_OK` (Prompt 18 automated journey) |

Proven: email create / `create=false` / uniqueness; Nakama lowercase vs project canonicalize (plus-tags kept); same-email `linkEmail` password replace; unlink-only-method **403**; email replace via temp device; logout current vs all (empty tokens after the next Unix second); `nk.accountExportId` + console export; recorded `accountDeleteId(id, true)` + email reuse with a new user id; HMAC index lookup with re-read.

Reproduction:

```powershell
powershell -File scripts/test-content.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-account-compat.ps1 -SkipDomain
powershell -File scripts/test-client.ps1
powershell -File scripts/test-e2e.ps1
```

## Public authentication gateway and email infrastructure acceptance (ACCT-02, 2026-08-19)

Trusted public boundary only. Godot login UI is unchanged and still authenticates to Nakama directly. No new gameplay systems. No custom SQL. No ORM.

`auth-gateway/` is Fastify **5.6.1** on Node **20.20.2**. Local Compose adds Mailpit `axllent/mailpit:v1.30.7` (UI http://127.0.0.1:8025) and the gateway on http://127.0.0.1:8787. Staging/production refuse to start without HTTPS public URLs and non-default secrets. Internal RPC `auth_gateway` rejects session JWTs (`gateway_rpc_forbidden`) and requires a signed HMAC assertion. Challenges store hashes only. Email provider failure after register does not delete the Nakama account.

| Gate | Result |
| --- | --- |
| Content | 23/23, hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` (unchanged) |
| Audit | `FOUNDATION_AUDIT_OK` (29 storage records, 31 client opcodes, 15 server opcodes, 26 rpcs) |
| Server hermetic | 467 passed, 12 skipped (live suites off), `tsc --noEmit` clean |
| Auth gateway hermetic | 20/20 (`scripts/test-auth-gateway.ps1 -SkipLive`) |
| Auth gateway live | 2/2 HTTP-key ping + session reject (`ACCT_GATEWAY_LIVE=1`) |
| Compose health | Nakama healthy; gateway `/health` and `/ready` (`nakama=true`, `email=true`); Mailpit captured `Verify your Vibecode email` |
| Client GdUnit | 220/220, 0 orphans, `SHELL_LOGIN` |
| Gameplay smoke | `scripts/backend-verify.ps1` Alice/Bob bootstrap + starter zone |

Limitations: verification is not a character/match gate yet; Godot is not switched onto the gateway; Fastify 5.6.1 reports npm-audit findings (this process sets `trustProxy: false` and does not use `sendWebStream`).

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-auth-gateway.ps1 -SkipLive
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-auth-gateway.ps1
powershell -File scripts/test-client.ps1
```

Inspect local mail at http://127.0.0.1:8025 after `POST http://127.0.0.1:8787/v1/auth/register`.

## Registration, email verification, login, session refresh, and logout acceptance (ACCT-03, 2026-08-19)

Normal account entry lifecycle. No new gameplay systems. No custom SQL. No ORM. Prompt 18 village/slime behavior unchanged. Stay Signed In is **not** enabled. Debug Alice/Bob device auth remains playable without an email profile. Account states are [ACCOUNT_STATE_MACHINE.md](account/ACCOUNT_STATE_MACHINE.md).

Public Godot email register/login/verify/refresh/logout goes through `AccountService` and versioned `/v1/auth/*` routes. `requirePlayableUser` is the single gameplay guard on character RPCs, match discovery/join, chat, party, and GM. Duplicate email is generic `AUTH_REGISTRATION_FAILED`. `EMAIL_VERIFICATION_REQUIRED` is returned only after valid credentials, without tokens.

Nakama 3.40.0 attaches a JavaScript stack to every thrown runtime value. Domain RPC failures therefore **return** `{ ok: false, code }` JSON (HTTP 200) instead of throwing. Live unverified `character_list` and session `auth_gateway` rejects contain no `stackTrace` / `index.js`. Logout current leaves chats/match while tokens are valid, then revokes.

| Gate | Result |
| --- | --- |
| Content | hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` (unchanged) |
| Audit | `FOUNDATION_AUDIT_OK` (29 storage records, 31 client opcodes, 15 server opcodes, 26 rpcs) |
| Server hermetic | 481 passed, 13 skipped (live suites off), `tsc --noEmit` via `scripts/test-server.ps1` |
| Auth gateway hermetic | 28/28 (`scripts/test-auth-gateway.ps1 -SkipLive`) |
| Auth gateway live | 2/2 HTTP-key ping + session reject as HTTP 200 JSON; 1/1 unverified `character_list` HTTP 200 `{ok:false,code:email_verification_required}` with no stack |
| Client GdUnit | 237/237, 0 orphans, `SHELL_LOGIN` |
| Gameplay smoke | `scripts/backend-up.ps1` Alice/Bob bootstrap + starter zone after the rebuilt runtime |
| Live email path | Register 200; duplicate 409 `AUTH_REGISTRATION_FAILED`; unverified login 403 without tokens; `character_list` HTTP 200 `email_verification_required` without `stackTrace`; Mailpit `Verify your Vibecode email`; verify confirm 200; login ACTIVE with tokens; character create; logout-all 200 after the next Unix second; revoked refresh 401; roster preserved (`liveCount=1`); current logout 200; `Your Vibecode email is verified` and `A Vibecode session was signed out` captured |

Limitations: Stay Signed In remains hidden (`CredentialStore` unavailable; no email refresh tokens in `user://`). Unverified cleanup is the seven-day policy plus HMAC-gated `purge_unverified`, invoked opportunistically on duplicate register (no periodic sweep of every stale account). Fastify 5.6.1 still reports npm-audit findings (`trustProxy: false`; this process does not use `sendWebStream`). Nakama session blacklist uses strict `<` on the token `iat` second, so logout-all immediately after login can leave that second's refresh token valid until the next Unix second.

Reproduction:

```powershell
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-auth-gateway.ps1 -SkipLive
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-auth-gateway.ps1
powershell -File scripts/test-client.ps1
```

Inspect local mail at http://127.0.0.1:8025. Product email UI is login / register / verify / server-unavailable / account-disabled.

## Password recovery, password change, email change, and forgotten-email support acceptance (ACCT-04, 2026-08-19)

Credential recovery and maintenance. No new gameplay systems. No custom SQL. No ORM. Prompt 18 village/slime behavior unchanged. Nakama user IDs and character records are preserved across password and email changes. Stay Signed In remains hidden. Product delete UI remains later.

Public Godot recovery uses `AccountService` and canonical `/v1/auth/password/reset/*`, `/v1/account/password/change`, and `/v1/account/email/change/*` routes (ACCT-02 kebab aliases remain). Reset request copy is always *If an account exists for that email, password-reset instructions have been sent.* Challenges are HMAC-only, 15-minute TTL, five attempts, sibling-invalidated, and one-time consume. Confirm and logged-in password change revoke all sessions and never return tokens. Email change keeps the old address until confirm, then uses the ACCT-01 temp-device sequence and updates the HMAC index. Forgotten-email help is copy-only. Internal support lookup is secret-gated, logged, and never returns an email.

| Gate | Result |
| --- | --- |
| Content | hash `4eeb205a3748b3cd71053bcc217cb017ae69f1f1d4753238ca4c03da9cce35c1` (unchanged) |
| Server hermetic | 482 passed, 13 skipped (live suites off), `tsc --noEmit` via `scripts/test-server.ps1` |
| Auth gateway hermetic | 36/36 (`scripts/test-auth-gateway.ps1 -SkipLive`) |
| Client GdUnit | 248/248, 0 orphans, `SHELL_LOGIN` |

Limitations: Stay Signed In remains hidden. Product account-delete UI remains later. Support lookup is a gateway operator tool, not a player API. Live Compose Mailpit walkthrough was not re-run in this acceptance; the HTTP matrix is covered hermetically, and password/email replace remain the ACCT-01 live-proven Nakama sequences.

Reproduction:

```powershell
powershell -File scripts/test-server.ps1
powershell -File scripts/test-auth-gateway.ps1 -SkipLive
powershell -File scripts/test-client.ps1
```

Product recovery UI is Forgot Password Request, Password Reset Code Entry, New Password, Password Changed, Change Password, Change Email, Email Change Verification, and Forgot Which Email Help. Login label is **Forgot which email you used?**.

## Five character slots, Warrior/Marksman/Mage creation, selection, deletion, and restoration acceptance (ACCT-05, 2026-08-19)

Replaces the temporary three-slot / test-class Character Select path with the Foundation five-slot catalog. No new gameplay systems. No custom SQL. Prompt 18 village/slime behavior unchanged. Cert/e2e keep `test.class.vanguard` / `arcanist` / `warden`. Stay Signed In and product account-delete UI remain later.

An account may have five live characters. The sixth create is rejected server-side (`slot_limit`). Production class IDs are `class.warrior`, `class.marksman`, and `class.mage` with presentation keys, placeholder visuals, and provisional loadouts. Character Select iterates content `class.*` IDs and does not hard-code combat behavior. `character_list` returns safe summaries only (no inventory, quests, or private storage). Names are reserved atomically and case-insensitively (`Archer` / `archer` / `ARCHER`). `character_select` issues a 300-second single-use ticket; match join still requires that ticket (or a transfer ticket). Soft-delete keeps the name reserved, preserves gameplay, and frees the live slot. Restore does not regrant starters. Idempotent purge releases the name and recovers from a partial job. Prompt 18 records with an empty `classId` migrate to `class.warrior` without a second starter grant.

| Gate | Result |
| --- | --- |
| Content | hash `42047a6420550c4c815d4affafdefbaaecd446590706ae3e8c95c7e46f773455` |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 33 storage records) |
| Server hermetic | 494 passed, 13 skipped (live suites off), `tsc --noEmit` |
| Client GdUnit | 249/249, 0 orphans, `SHELL_LOGIN` |

Limitations: Stay Signed In remains hidden. Product account-delete UI remains later. Production class numbers are provisional and are not finalized. Cert/e2e still create `test.class.*`. Name availability in the UI is advisory.

Reproduction:

```powershell
powershell -File scripts/content-build.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

Character Select shows five slot cards, three class cards, Recently Deleted, typed-name delete, Account Settings, Logout, server status, and version. Play is disabled with a reason for deleted, account-busy, link-dead, maintenance, content-incompatible, and pending-selection states.

## Active-character lease, safe departure, and ten-second link-dead acceptance (ACCT-06, 2026-08-19)

Authoritative one-character-per-account online lifecycle for every `starter_zone` match (public world and party caves). No new gameplay systems. Prompt 18 village/slime behavior unchanged. Stay Signed In and product account-delete UI remain later.

One server-only lease (`player` / `gameplay_lease`, `permissionWrite: 0`, `schemaVersion` 2) is acquired atomically as `ENTERING` in `matchJoinAttempt`. A second gameplay join while a live lease exists fails (`account_busy` / `link_dead`). Join consumes the selection ticket, creates the entity, sends `FULL_STATE`, then marks `ONLINE`. Interrupted `ENTERING` is cleared immediately or after 15 s. Opcode 32 `RETURN_TO_CHARACTER_SELECT` is the only safe in-world departure; combat, death, casts, trades, transfers, and committing rewards are denied with a visible sentence. Logout to Login waits for that ack before revoking tokens. Unexpected disconnect keeps the entity targetable and vulnerable to PvE for 10 server seconds after detection (`LINK_DEAD`); the new socket is not rebound. Character Select shows `Character still in world` / `Available in N seconds` from `playAvailableAt`. Stale leases for missing matches repair immediately. The 10 s clock is not window-close time: Nakama 3.40.0 defaults ping every 15 s and wait 25 s for a pong.

| Gate | Result |
| --- | --- |
| Content | hash `42047a6420550c4c815d4affafdefbaaecd446590706ae3e8c95c7e46f773455` |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 33 storage records, 32 client opcodes) |
| Server hermetic | 512 passed, 13 skipped (live suites off), `tsc --noEmit` |
| Client GdUnit | 254/254, 0 orphans, `SHELL_LOGIN` |

Limitations: Stay Signed In remains hidden. Product account-delete UI remains later. Frozen clients and cable pulls wait for Nakama presence timeout before the ten-second hold starts. Party membership and cave instance empty/rejoin grace remain 60 s; the avatar itself despawns at 10 s. Health is not persisted; the next join uses `joinHealth`.

Reproduction:

```powershell
powershell -File scripts/content-build.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

World HUD: Character Select, Log out, Quit Game (Quit Safely / Quit Anyway / Cancel). Alt+F4 shows the same dialog when Godot delivers the close request; it is not an authoritative logout.

## Account settings, data export, and permanent deletion acceptance (ACCT-07, 2026-08-25)

Account Settings on Character Select shows verified email, account status, created date, registration mode, and a derived Support Recovery ID. Nakama user ids stay behind developer details. Export is assembled on the server, held in gateway memory for five minutes, and downloaded with the same Bearer user (no permanent public URL). Product deletion is a 7-phase idempotent saga on the system user (`account_deletion` / `d_<userId>`). Confirm requires current password, email code, exact `DELETE ACCOUNT`, and a click-only button. Hosted HTML `/v1/confirm` does not delete. Freeze sets `DELETING` and blocks gameplay and login except deletion-status handling. The old email may register a new blank account with a new user id; stale HMAC index hits are ignored after re-read. Backup replay is by original user id. Gold is the account wallet and is wiped by the saga, not by character purge. Stay Signed In remains later. Prompt 18 village/slime behavior is unchanged.

| Gate | Result |
| --- | --- |
| Content | hash `42047a6420550c4c815d4affafdefbaaecd446590706ae3e8c95c7e46f773455` |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 32 client opcodes) |
| Server hermetic | 523 passed, 13 skipped (live suites off), `tsc --noEmit` |
| Auth gateway | 44 passed, `tsc --noEmit` |
| Client GdUnit | 257/257, 0 orphans, `SHELL_LOGIN` |

Limitations: Stay Signed In remains hidden. Export cache is per gateway process; a restart requires a new export request. Invite-only remains an env allowlist. HTML confirm pages do not complete account deletion.

Reproduction:

```powershell
powershell -File scripts/content-build.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-auth-gateway.ps1
powershell -File scripts/test-client.ps1
```

## Professional account and character UX acceptance (ACCT-08, 2026-08-25)

Client-only presentation around accepted account and character operations. `DesignTokens`, `ShellTheme`, and `Ux*` components cover primary/secondary/destructive buttons, text/email/password/code fields, checkbox, inline validation, form error summary, spinner, modal/confirm, status banner, character/class/empty-slot cards, countdown badge, toast, and server-status. Lifecycle screens call `GameService` / `AccountService` / `NetworkService` only. `AccountErrors` maps the ACCT-08 catalog; unknown errors show `Something went wrong.` plus `Reference: <request ID>`. Navigation is Boot → compatibility → Login → Register/recovery → Verify → Character Select → Create → Gameplay → Character Select → Logout. Back cannot skip verification. Character Select shows five slots, three class cards that are distinguishable without color-only identity, link-dead countdown copy, seven-day delete/restore, and a separated Account Settings danger zone. In-world Game Menu waits for opcode 32 acknowledgement before claiming a safe leave. Stay Signed In remains later. Prompt 18 village/slime behavior is unchanged. No new RPCs or storage records.

| Gate | Result |
| --- | --- |
| Client GdUnit | 270/270, 0 orphans, `SHELL_LOGIN` |
| Authoritative lifecycle | unchanged (client presentation only) |

Limitations: Stay Signed In remains hidden. Final game art is not required; class cards use glyph, shape label, and name. Godot screen-reader support is limited to `accessibility_name` where the engine exposes it.

Reproduction:

```powershell
powershell -File scripts/test-client.ps1
```

## Security, failure, distribution, and lifecycle certification (ACCT-09, 2026-08-25)

No new account features. Named gateway and Nakama rate limits, safe account audits, an 85-row threat matrix, a 15-row failure map, release hiding of development auth/Mailpit/local URLs, and final lifecycle documents. RPC count remains 29; storage records remain 34; client opcodes remain 32. Prompt 18 village/slime behavior is unchanged.

| Gate | Result |
| --- | --- |
| Auth gateway | 49/49 |
| Server domain | 532/532 passed, 13 skipped live |
| Client GdUnit | 273/273, 0 orphans, `SHELL_LOGIN` |
| Five-account hermetic | pass (`lifecycle_cert.test.ts`) |
| Character slots/classes | pass (`character_lifecycle.test.ts`) |
| Link-dead / lease | pass (`gameplay_lease.test.ts`) |
| Email reuse / deletion isolation | pass |
| Backup replay by user id | pass (`account_deletion.test.ts`) |
| Release presentation audit | pass (`account_release_audit_test.gd`) |

Documents: [account/ACCOUNT_LIFECYCLE_READY.md](account/ACCOUNT_LIFECYCLE_READY.md), [account/PLAYER_ACCOUNT_GUIDE.md](account/PLAYER_ACCOUNT_GUIDE.md), [account/SUPPORT_RECOVERY_RUNBOOK.md](account/SUPPORT_RECOVERY_RUNBOOK.md), [account/EMAIL_DELIVERY_RUNBOOK.md](account/EMAIL_DELIVERY_RUNBOOK.md), [account/ACCOUNT_DELETION_RUNBOOK.md](account/ACCOUNT_DELETION_RUNBOOK.md), [account/SESSION_AND_LEASE_RUNBOOK.md](account/SESSION_AND_LEASE_RUNBOOK.md), [account/ACCOUNT_SECURITY_TEST_REPORT.md](account/ACCOUNT_SECURITY_TEST_REPORT.md).

Limitations: Stay Signed In remains hidden. Link-dead starts at disconnect **detection**. Live five-email Mailpit world play and a new release `.exe` were not rebuilt in this run. Release tag `account-character-lifecycle-v1`.

Reproduction:

```powershell
powershell -File scripts/test-account-lifecycle.ps1
```

## PROG-01 canonical design audit and implementation contract (2026-08-25)

No player-visible behavior change. The canonical design is in the repo at [design/rpg-progression-design-v1.0.md](design/rpg-progression-design-v1.0.md). Contract docs under [progression/](progression/) map every canonical value, the live Foundation progression owners, storage/protocol, migration needs, and conflicts (three classes vs four, 5-cap vs 10, 8-slot hotbar vs 4, mana on physical classes, Might/Vitality/Focus vs eight stats). Frenzy is recorded as a passive that does not occupy a hotbar slot. No second progression/ability/hotbar stack. No new dependency. No content JSON or match gameplay change. `SAVE_SCHEMA_VERSION` stays 1. Content hash unchanged.

| Gate | Result |
| --- | --- |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 32 client opcodes) |
| Server hermetic | 543 passed, 13 skipped (live suites off), including 10 new design-audit tests; `tsc --noEmit` |
| Client GdUnit | 276/276, 0 orphans, `SHELL_LOGIN` |

Limitations: Live content still has three production classes and level cap 5. Manual Prompt 18 world play was not re-run; no gameplay code or content changed. Implementation-addendum has no new balance numbers.

Reproduction:

```powershell
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-02 canonical shared content schemas and generated bundles (2026-08-25)

Complete data representation of the Vibecode 1–10 progression design without enabling new combat. The existing `tools/content-build` pipeline gained schemas and kinds for stats, branches, timeline, auto-attacks, effect definitions, talent trees/nodes, reference builds, enemy scaling, XP rewards, and equipment modifier categories. Canonical abilities, auto-attacks, trees, and `class.mystic` are in `content/source/`. Client and server generated catalogs share content hash `8c56593b927213002912b60560dbe149868407ddac501e88019b0c9ba364fa1f`. Optional Godot `.tres` files under `client/content/generated/` are conveniences, not source.

`class.mystic` has `rosterSelectable: false`; Character Select remains three cards; create rejects mystic. Canonical `ability.*` rows have `runtimeEnabled: false` and are omitted from the live ability map. Live classes still join with `test.curve.standard` (cap 5), Might/Vitality/Focus, and physical-class mana on `startingResources`. Prompt 18 village/slime behavior is unchanged. No class-specific ID is hard-coded into protocol code.

| Gate | Result |
| --- | --- |
| Content validate/build | pass; client/server hashes match |
| Content-build tests | 24/24 (`scripts/test-content.ps1`) |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 32 client opcodes) |
| Server hermetic | 543 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 276/276, 0 orphans, `SHELL_LOGIN` |

Limitations: Canonical combat is catalog-only. Mystic is not playable. Geometry omitted by the design is ledgered in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). Manual Prompt 18 world play was not re-run; live village/slime behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-03 four-class character creation and progression-state migration (2026-08-25)

Character create offers Warrior, Mage, Marksman, and Mystic (`class.warrior` / `class.mage` / `class.marksman` / `class.mystic`). The five-slot limit is unchanged. The server rejects unknown classes and client-forged stats, XP, level, abilities, and equipment. New production characters start at canonical level 1: zero XP, empty free/class/branch purchases, no branch, auto-assign off, class auto-attack presentation only, no L2 or branch grants. Mage and Mystic keep a mana pool; Warrior and Marksman have `maxMana` 0.

The existing `player` / `progression_<id>` blob (`permissionWrite: 0`) stores `progressionSchemaVersion` **2** with the canonical fields. `SAVE_SCHEMA_VERSION` stays **1**. Point balances and derived stats are calculated. Existing warrior/marksman/mage characters migrate in place without class conversion, without duplicating starters, and without regranting quests. Character Select summaries include class, level, branch when chosen, and link-dead/online presence. Account export, support snapshot, soft-delete, restore, purge, and account deletion handle the same record.

Client/server generated catalogs share content hash `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320`. Live combat still uses `test.curve.standard` (cap 5), Might/Vitality/Focus, and `test.ability.*`. Canonical `ability.*` rows remain `runtimeEnabled: false`. Prompt 18 village/slime behavior is unchanged. No level gains.

| Gate | Result |
| --- | --- |
| Content validate/build | pass; client/server hashes match |
| Content-build tests | 24/24 (`scripts/test-content.ps1`) |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 32 client opcodes) |
| Server hermetic | 557 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 276/276, 0 orphans, `SHELL_LOGIN` |

Limitations: Level-up, branch choice, talent spend, and canonical combat remain later PROG phases. Geometry omitted by the design is ledgered in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). Manual Prompt 18 world play was not re-run; live village/slime behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-04 canonical statistics, derived values, and resource engine (2026-08-26)

Production `class.*` characters calculate stats as class base + automatic growth + free allocations + identified equipment modifiers + identified temporary effects. Derived values use the design §4 formulas exactly (`HP_max`, `Mana_max`, `ManaRegen`, `CritChance`, `CritMult`, `HasteMult`, `DamageReduction`, `EffectiveHP`, haste-scaled attack/cast/DoT intervals). Point balances and derived totals are calculated, never stored as authority and never taken from the client. The client mirrors `canonicalDerived` floats without recomputing formulas.

Warrior and Marksman expose no mana resource or mana UI. Mage and Mystic use `Mana_max = 20+4*INT` and continuous `mana = min(max, current + regen * delta)`. Haste scales auto-attack interval, cast/channel time, and DoT tick interval (total DoT damage preserved) and does not change stored cooldown ticks. Direct hits may roll one authoritative crit; DoTs never crit; shields do not crit unless content sets `shieldCanCrit`. Different-source percentage modifiers multiply; higher ranks of the same node replace lower ranks. There are no secret caps on attributes, crit chance, or damage reduction. Foundation v1 content is rejected if it contains nonfinite numbers.

On max-health change, the already accepted pipeline policy applies (`project.health.max_change_policy`): living characters keep current health plus any increase in max, then clamp to the new max. Ordinary equipment changes do not refill. Full refill remains create, authorized respawn, inn/healer restore, or an explicit effect. Test classes without canonical `baseStats` keep Foundation `evaluateStats` layers.

Level-10 auto-growth with zero free allocation matches the design §6.3 reference sheet (Warrior/Mage/Marksman/Mystic HP, Effective HP, Mana, regen, crit, haste, DR). Client/server generated catalogs share content hash `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320`. Live ATTACK still uses Foundation `test.stat.attack` (might + gear). Canonical `ability.*` rows remain `runtimeEnabled: false`. Prompt 18 village/slime behavior is unchanged. No level gains.

| Gate | Result |
| --- | --- |
| Content validate/build | pass; client/server hashes match |
| Content-build tests | 25/25 (`scripts/test-content.ps1`) |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 32 client opcodes) |
| Server hermetic | 569 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 277/277, 0 orphans, `SHELL_LOGIN` |

Limitations: Level-up, branch choice, talent spend, and canonical combat remain later PROG phases. Live ATTACK is not retuned onto STR/AGI/INT. Geometry omitted by the design is ledgered in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). Manual Prompt 18 world play was not re-run; live village/slime behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-05 XP curve, automatic growth, level milestones, and auto-assignment (2026-08-26)

Production `class.*` characters use `curve.vibecode.l10`: `XP_to_next(level) = round_to_tens(100 * level^1.5)` with deterministic nearest-ten rounding. Transitions are 100, 280, 520, 800, 1,120, 1,470, 1,850, 2,260, 2,700 (total **11,100** to level 10). Authored `levelCurveId` stays `test.curve.standard` so the content hash is unchanged; runtime overlays `canonicalLevelCurveId`. Test classes keep Foundation cap 5 and content `xpReward`.

One trusted progression service accepts kill, elite kill (`* 3`), quest, and authorized development grants. Kill XP is `8 + 2 * enemy_level`. Duplicate `eventId` values do not grant twice. The client never sends an XP amount. One grant may cross multiple levels; each gained level applies automatic growth (computed from class and level, not stored as allocations), grants three free points, processes milestones, recalculates derived state, emits one `level_gained` event, and persists atomically. Level 10 does not produce level 11 or extra points. Overflow XP uses `project.xp.cap_overflow_policy` = `lifetime_only`. Level-10 rewards do not duplicate.

Earned free points are `3 * (level - 1)`. Auto-assign defaults off. Enabling the flag does not spend existing points; a level gain with the flag on spends only the newly earned three. Opcode 35 spends all currently unspent points on the class template. Branch choice is required at 5; missing branch keeps signature/capstone pending and does not invent a default. Milestone `ability.*` grants add ownership only (`runtimeEnabled: false`).

Client/server generated catalogs share content hash `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320`. Live ATTACK still uses Foundation `test.stat.attack`. Slime KillXP is **10** (level 1), matching authored `xpReward`. Prompt 18 village/slime combat behavior is unchanged.

| Gate | Result |
| --- | --- |
| Content validate/build | pass; client/server hashes match |
| Content-build tests | 25/25 (`scripts/test-content.ps1`) |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 35 client opcodes) |
| Server hermetic | 593 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 278/278, 0 orphans, `SHELL_LOGIN` |

Limitations: Talent spend, one production hotbar, and canonical combat remain later PROG phases. Live ATTACK is not retuned onto STR/AGI/INT. Geometry omitted by the design is ledgered in [design/progression-implementation-addendum.md](design/progression-implementation-addendum.md). Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-06 manual stat allocation and full trainer respec (2026-08-26)

Production `class.*` characters spend unspent free points through opcode 9 (`statId` or `attributeId`, positive integer `amount`, `requestId`) and opcode 36 (confirmed batch, 1–16 entries, validated then applied atomically). All eight `stat.*` ids are legal. There is no per-stat cap and no class restriction. The match rejects allocate while a forbidden transaction is active. Test classes keep Foundation `allowedAttributeIds` and the 100-per-request cap.

Trainer respec is opcode 37 (`npcId`, `requestId`) on a generic NPC with overlay service `respec` (`npc.test_innkeeper`; `npc.lab_trainer` when that development NPC is in the catalog). Authored NPC documents were not rebuilt; content hash is unchanged. Cost is canonical `50 × current_level` gold. Dead, combat, casting, trading, transferring, link-dead, other restricted transactions, out-of-range, missing trainer service, and insufficient gold reject the action. Gold and the progression blob persist together as `TX_REASON_RESPEC`. Repeated `requestId` values do not deduct twice.

A successful respec clears free allocations, class-node purchases, branch ranks, branch choice, signature/capstone/buyable-active/branch-passive ownership, and invalid hotbar slots. Earned free/class/branch points refund by calculation. Class, level, XP, automatic growth, the level-2 basic skill, equipment, and inventory stay. Derived statistics are recalculated. Level 5+ without a branch keeps persistent pending-branch guidance. Talent spend remains PROG-07. Canonical `ability.*` stay `runtimeEnabled: false`. Prompt 18 village/slime combat behavior is unchanged.

| Gate | Result |
| --- | --- |
| Content-build tests | 25/25 (`scripts/test-content.ps1`); hash `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320` |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 37 client opcodes) |
| Server hermetic | 607 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 279/279, 0 orphans, `SHELL_LOGIN` |

Limitations: Talent spend, one production hotbar, and canonical combat remain later PROG phases. Live ATTACK is not retuned onto STR/AGI/INT. `npc.lab_trainer` is development-only and omitted from the production catalog; the starter-zone trainer is the innkeeper overlay. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-07 branch choice, talent trees, ability ownership, and hotbar rules (2026-08-26)

Production `class.*` characters earn two class points (1 at level 3, 2 at level 4+) and six branch points (1 at 5 through 6 at 10). Class points cannot buy branch nodes; branch points cannot buy class nodes. Each class tree has three one-rank nodes; a character may purchase at most two.

Opcode 33 `SELECT_BRANCH` requires level ≥ 5, a branch that belongs to the character class, no existing branch, character ownership, safe-leave, and `requestId` idempotency. Success sets the branch, grants the signature at level 5 or higher, grants the capstone at 10, exposes that branch tree, and preserves unspent branch points. The branch cannot be changed except by trainer respec.

Opcode 38 `PURCHASE_TALENT` (`treeId`, `nodeId`, `requestedRank`, `requestId`) spends one rank. The server enforces tree identity, branch, point availability, tier gates (Tier 2 after 2 spent in that tree; Tier 3 after 4 spent and not before level 9), sequential ranks, content prerequisites, maximum rank, the two-node class cap, one buyable branch active, and a hard maximum of four owned actives. Ability ownership is derived from class, level, branch, and purchased nodes. Production `UNLOCK_ABILITY` is `unsupported_class`.

Auto-attack is owned at level 1 on the ATTACK path and is not a hotbar skill. Basic unlocks at 2. Signature unlocks at 5 plus branch. Capstone unlocks at 10 plus branch. A buyable branch active is granted only by its node. Berserker Frenzy is a passive signature and does not occupy a slot. The production hotbar is four owned active abilities; passives, auto-attack, duplicates, and unowned ids are rejected. Respec removes revoked abilities from the hotbar and publishes canonical hotbar state. Foundation `test.class.*` keep the 8-slot skill-point path. Canonical `ability.*` stay `runtimeEnabled: false`. Authored content was not rebuilt; content hash is unchanged. Prompt 18 village/slime combat behavior is unchanged.

| Gate | Result |
| --- | --- |
| Content-build tests | 25/25 (`scripts/test-content.ps1`); hash `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320` |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 629 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 280/280, 0 orphans, `SHELL_LOGIN` |

Limitations: Canonical combat, class-specific effect behavior, and production GCD removal remain later PROG phases. Live ATTACK is not retuned onto STR/AGI/INT. The eight-slot Foundation hotbar remains test-only. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

## PROG-08 generic combat mechanics required by all four classes (2026-08-26)

The existing project-owned ability and effect engine now has reusable handlers for every canonical mechanic the four classes need: direct melee/ranged/spell damage and healing, shields, periodic damage/healing, taunt and threat override, interrupt, stun, root, slow, movement-speed and damage modifiers, flat DR, crit chance/damage, mana cost and restoration, cooldown recovery, attack-speed, cast-time, auto-attack modifiers, reflect, lifesteal, once-per-combat, health/motion/proximity/control conditions, shield break/expiry, kill events, effect propagation, cooldown reset, vault movement, line/cone/radius/delayed-ground targeting, and independent multi-hit.

Typed combat events (`before_ability` through `movement_stopped`) dispatch through generic handlers. Production random is server-side; tests inject seeded or scripted values. The client cannot submit crit or random rolls (`stat_injection:crit` / `critRoll`). Independent hits each roll crit on one parent cast and cooldown. DoTs store source, snapshot, remaining damage/ticks, interval, and expiry; haste and festering-like tick-rate modifiers compress interval without changing total damage or allowing tick crits. Shields scale with SPI, keep remaining absorb, emit exactly one break or expiry event, and suppress duplicate expiry on replace/refresh. Taunt overrides threat for a duration, then returns to the table, and reduces damage taken from that enemy. Haste changes cast and attack timing; cooldown recovery is a separate remaining-tick rate. Reflected damage and overflow heals cannot recurse.

Production `class.*` ignore GCD remaining even if a leftover field is set. Foundation `test.ability.*` keep GCD. Canonical `ability.*` stay `runtimeEnabled: false`. Live ATTACK is not retuned onto STR/AGI/INT. No class-name checks in core combat modules. No third-party combat framework. Content was not rebuilt; hash is unchanged. Prompt 18 village/slime combat behavior is unchanged.

| Gate | Result |
| --- | --- |
| Content-build tests | 25/25 (`scripts/test-content.ps1`); hash `3b57502b4a197972c970420cd7b2a5a74955311b5840be0b4d184843c24e3320` |
| Design audit | 10/10 (`scripts/test-progression-design.ps1`) |
| Foundation audit | `FOUNDATION_AUDIT_OK` (29 RPCs, 34 storage records, 38 client opcodes) |
| Server hermetic | 669 passed, 13 skipped (live suites off); `tsc` via server test script |
| Client GdUnit | 283 passed (`scripts/test-client.ps1`); includes `ability_service_test.gd` GCD absence check |

Limitations: Class-specific combat definitions, live ATTACK retune, cooldown-recovery talents, and Challenge/Protective Charm as playable abilities remain PROG-09–12. The eight-slot Foundation hotbar remains test-only. Manual Prompt 18 world play was not re-run; live village/slime combat behavior was not changed.

Reproduction:

```powershell
powershell -File scripts/content.ps1 validate
powershell -File scripts/test-content.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/test-progression-design.ps1
powershell -File scripts/test-audit.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-client.ps1
```

