# Item test plan (ITEM-09)

ITEM-09 extends ITEM-08 with twenty-slot secure player trade. Acceptance is the gates below plus the ITEM-09 cases. Do not weaken tests.

## Baseline (run on ITEM-09; 2026-09-19)

Directory-form `node --test dist/tests` can fail on Node 22.14 before discovery. Glob invocation is authoritative.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 49 client opcodes, 19 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 1013 passed, 13 expected live-test skips |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed |
| Godot 4.7.1 client GdUnit | 371/371 passed, 0 failures, 0 orphans |

```bash
bash scripts/test-audit.sh
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
GODOT_BIN=godot bash scripts/test-client.sh
```

## Live item-related automated tests

| File | Covers |
| --- | --- |
| `server/tests/item_capacity.test.ts` | Placement: partial fill, multiple partials, split, preferred slot, first-empty, outgoing free slots, equipment-to-bag, two-way trade, several incoming types, full bag with partial, full bag without capacity, locked merge skip, strict stack_full |
| `server/tests/item_txn.test.ts` | Error catalogue, stale revision, duplicate success/fail, concurrent serial, lock acquire/conflict/expiry/orphan, interrupted commit retry, compensation, multi-character order, drop compensate/replay, audit, two-character gold/item no-dupe |
| `server/tests/item_model.test.ts` | Empty 30-slot bag, slots 0–29, stack 99, equipment max 1, compatibility/metadata, merge/split, full compatible `stack_full`, merge leftover, equipment outside bag, unequip into bag / full bag, migration under/over 30, overflow recovery, overflow not extra storage, repeated migration, restore/purge, equipment stat recalc |
| `server/tests/inventory.test.ts` | Pickup, stack merge/split/move, destroy, locks, capacity, Prompt 18 ids, stale `expectedRevision`, failed `requestId` replay |
| `server/tests/equipment.test.ts` | Equip/unequip, tags, unique, class/level, locked |
| `server/tests/existing_save_cert.test.ts` | Equipped iron leaves the bag; remaining stacks keep instance ids; capacity 30 |
| `server/tests/loot_table.test.ts` | Rolls, duplicate death, policies |
| `server/tests/party_credit_loot.test.ts` | Credit range, personal/server_assigned, no client recipients |
| `server/tests/vendor.test.ts` | Buy/sell, gold, full bag, equipped, unsellable, idempotent |
| `server/tests/npc_vendor.test.ts` / `npc_security.test.ts` | Session-gated buy, price spoof, qty, preferred slot, multi-stack, stale revision, replay |
| `server/tests/trade.test.ts` | Invite through recovery, 20 offer slots, locks, gold, revision, disconnect, transfer, capacity simulation |
| `server/tests/quest_reward.test.ts` / `quest.test.ts` | Consume, grant, possession |
| `server/tests/transaction.test.ts` / `wallet` tests | Gold ledger, version conflict |
| `server/tests/security.test.ts` / `protocol.test.ts` | Injection, unknown fields, opcode 41, optional `expectedRevision` |
| `client/tests/app/inventory_service_test.gd` | GLoot mirror, intents, overflow recover, Inventory Recovery panel, expected revision, INVENTORY_STATE revision |
| `server/tests/corpse.test.ts` | Tag/roster/leash, generation once, stack split, private/public/expire, claims, Loot All partial, gold split/remainder/public/duplicate, restart, empty removal |
| `server/tests/enemy_tag.test.ts` | First attacker, party snapshot, late join excluded, kicked preserved, leash reset |
| `client/tests/app/corpse_service_test.gd` | Open/claim/Loot All intentions; no recipients; window + bag; loot-all summary |
| `server/tests/loot_roll.test.ts` | Rarity/quest/solo exclusions; one-eligible auto-award; Need/Greed/Pass; no response; Need outranks Greed; tie reroll; final choice; duplicate requestId; dead/reconnect; submitted choice survives disconnect; winner room/no room; pending claim/wrong claimant/expire; all-pass public; public-transition race; whole-stack fail-closed; deterministic 1–100 RNG; client roll injection |
| `server/tests/ground_item.test.ts` | Full/partial drop; equipped/locked; quest drop/pickup; rare confirm helper; placement bounds/wall; drop limit; public/concurrent pickup; full bag; partial stack all-or-nothing; duplicate request; interrupt/compensate; replay no second spawn; 5 min expiry; restart; FULL_STATE omits instance ids |
| `client/tests/app/loot_roll_service_test.gd` | Submit omits roll number; simultaneous cards; result feed |
| `client/tests/app/bag_ui_test.gd` | 6×5 / 30 slots plus corpse origin loot, bag stays usable, bag→corpse reject, occupied dest reject |
| `client/tests/app/ground_drop_dialog_test.gd` | Quantity defaults to the stack; Uncommon+ warning and checkbox |
| `client/tests/app/equipment_service_test.gd` | Equip mirror |
| `client/tests/app/vendor_inn_service_test.gd` / `merchant_window_test.gd` | Buy UI, bag, no price send |
| `client/tests/app/trade_service_test.gd` | Trade mirror; slotIndex offer; offer-changed copy |
| `client/tests/app/trade_window_test.gd` | 20 local/remote slots, gold, revision, local bag, no ownership prediction |
| `client/tests/app/wallet_service_test.gd` | Gold label |

Vertical-slice item journey: slime gel pickup + elder turn-in (VS-T* in [VERTICAL_SLICE.md](../VERTICAL_SLICE.md), e2e `slice_journey.gd` / cert journey). Trade journey: `trade.test.ts` + client trade service/window tests.

## ITEM-04 acceptance

1. The 30-slot bag is fully usable as a 6×5 grid. Slot indices persist. Empty squares stay visible.
2. Tooltips show canonical item data, including written rarity. Missing icons use the visual-map fallback.
3. Drag/drop and right-click send `MOVE_ITEM` / `SPLIT_STACK` / `EQUIP` and wait for server confirmation. The UI is not authoritative.
4. Compatible partial stacks merge with leftover in the source. Same full stacks reject with `stack_full` and no mutation. Split quantity is 1 .. source-1; the server mints the new instance.
5. Equipment stays outside the bag. Full-bag unequip is rejected. Later trade/corpse/merchant windows override right-click through `ItemContextRouter`, not the slot component.
6. `client/addons/` untouched; content hash unchanged from ITEM-03 (`7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`).

## ITEM-05 acceptance

1. First-attacker tagging is authoritative. The encounter roster is immutable. Leash/full reset clears the tag.
2. Loot is generated once at death. Stacks split at max stack. The client never nominates recipients.
3. Private 60 s, Need/Greed resolves at that boundary, remaining unreserved entries become public, expire at 5 minutes. Empty corpses may vanish immediately.
4. Ordinary party loot is first come. Uncommon+ party drops enter `ROLL_PENDING` and resolve Need/Greed. Quest items never roll.
5. Gold distribution is exact and idempotent. Public remainder is first claimant.
6. Loot All takes what fits and reports the rest. Sparkle dual-path keeps Prompt 18 slime pickup.
7. Corpse restart behavior is transient. No new storage collection. Content hash unchanged.

## ITEM-06 acceptance

1. Qualifying Uncommon-or-higher party-tagged drops open a roll immediately on death when two or more characters are death-eligible.
2. One death-eligible character auto-awards with no roll UI. Solo-tagged drops never roll. Quest items never roll.
3. Anyone eligible may Need, Greed, or Pass. One accepted final choice. Duplicate `requestId` replays. The client never supplies a roll number.
4. Dead and reconnected eligible characters may respond before the deadline. A submitted choice survives disconnect. Missing responses become Pass.
5. Need outranks Greed. Server integers 1–100 with injectable RNG. Ties reroll among tied characters.
6. Whole-stack awards: grant when the winner bag fits; otherwise `AWARDED_PENDING_PICKUP` winner-only until corpse expiry. No reroll. No public sparkle.
7. All-pass becomes public at 60 s. Ordering: resolve rolls → awards → all-pass → remaining unreserved public. Same-tick public claims cannot interleave before resolution.

## ITEM-07 acceptance

1. Merchants sell canonical stock keyed by `stockEntryId`. Prices, currency, constraints, and requirements come from vendor content. Unauthored ids are `${vendorId}:${itemId}`.
2. `VENDOR_BUY` is session-gated. The client never sends a price or gold amount. Leftover `itemId` / `npcInstanceId` are unknown fields.
3. Purchases are atomic: gold debit and every created or stacked item commit together, or nothing is granted.
4. Multi-stack quantities are planned with `planCapacity` before commit. Preferred empty and compatible partial slots work; incompatible occupied slots reject; a quantity that does not fit grants nothing.
5. Stock is unlimited. Simultaneous buyers do not compete. Their wallet and bag transactions stay independent.
6. The merchant window shows name, stock, icons, tooltips, canonical prices, player bag, gold, quantity selector, and buy result. Player-to-merchant selling stays unimplemented in that window. Live `VENDOR_SELL` is unchanged (ITEM-C12 KEEP).
7. A new merchant stock list is content-only. No new opcode. No new storage collection. Content hash unchanged.

## ITEM-08 acceptance

1. Dragging a bag item into the world begins a drop. Stack default is the whole stack; quantity is 1..stack. Uncommon+ shows “This item will be public and can be picked up by anyone.” and requires confirmation.
2. The server validates ownership, bag location, alive / not link-dead / not transferring, unlocked, quantity, the 20-drop limit, and conflicting locks/transactions. Equipped items must be unequipped first. All production items including quest items may drop.
3. Placement uses authoritative character pose, optional hint, configured radius, world bounds, and collision. The client never sends a trusted coordinate.
4. `executeDropIntent` prevents loss before entity creation, duplicate ground entities, and duplicate bag items. Interrupted COMMITTING compensates.
5. Ground entities are public immediately, have no physics collision, expire at five minutes, and are not reconstructed after match/server restart.
6. Pickup is all-or-nothing. Exactly one claimant succeeds; others `ground_item_no_longer_available`. Duplicate `requestId` replays.
7. Quest-item drop reduces possession progress without failing the quest. Pickup may advance the picker’s matching quest.

## ITEM-09 acceptance

1. Each side has exactly 20 item-offer slots. A twenty-first stack is `offer_full`.
2. Gold offers are nonnegative integers, reserved against spendable balance, and transferred only at commit.
3. Every offer change increments revision, clears both acceptances, broadcasts canonical offers, and shows “The trade has changed.”
4. Commit uses `planTwoWayTrade` final-state simulation. A full bag may receive when outgoing stacks free enough room or incoming stacks merge.
5. Commit is one atomic `multiUpdate` (or the existing committing snapshot / recovery path). Duplicate `requestId` does not mutate again.
6. Disconnect, link-dead, death, range, transfer, timeout, and invalidated sources cancel and release every trade lock.
7. No item or gold changes ownership before final commit. Changing an offer only sets the warning/revision state.

## Later-phase tests (do not implement now)

Forage grant from a world node.

If any **current** trade test fails before a later ITEM phase: repair in a focused pre-ITEM commit; do not retarget expectations without root cause.
