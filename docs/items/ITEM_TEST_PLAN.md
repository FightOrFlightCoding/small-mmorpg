# Item test plan (ITEM-04)

ITEM-04 extends the live inventory UI. Acceptance is the gates below plus the ITEM-04 cases. Do not weaken tests.

## Baseline (run on ITEM-04; 2026-09-19)

Directory-form `node --test dist/tests` can fail on Node 22.14 before discovery. Glob invocation is authoritative.

| Gate | Result |
| --- | --- |
| Foundation audit | pending |
| Content validation/tests | pending |
| Server hermetic tests | pending |
| Server typecheck/build | pending |
| Auth gateway hermetic tests | unchanged; 52/52 previously |
| Godot 4.7.1 client GdUnit | pending |

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
| `server/tests/npc_vendor.test.ts` / `npc_security.test.ts` | Session-gated buy, price spoof, qty, replay |
| `server/tests/trade.test.ts` | Invite through recovery, locks, gold, revision, disconnect, transfer |
| `server/tests/quest_reward.test.ts` / `quest.test.ts` | Consume, grant, possession |
| `server/tests/transaction.test.ts` / `wallet` tests | Gold ledger, version conflict |
| `server/tests/security.test.ts` / `protocol.test.ts` | Injection, unknown fields, opcode 41, optional `expectedRevision` |
| `client/tests/app/inventory_service_test.gd` | GLoot mirror, intents, overflow recover, Inventory Recovery panel, expected revision, INVENTORY_STATE revision |
| `client/tests/app/bag_ui_test.gd` | 6×5 / 30 slots, fixed positions, move/swap/merge/excess, split/invalid split, locked, equip/unequip, full bag, tooltip, rarity text, fallback icon, stale/timeout resync, duplicate signals, character switch, logout/reconnect |
| `client/tests/app/equipment_service_test.gd` | Equip mirror |
| `client/tests/app/vendor_inn_service_test.gd` / `merchant_window_test.gd` | Buy UI, no price send |
| `client/tests/app/trade_service_test.gd` | Trade mirror |
| `client/tests/app/wallet_service_test.gd` | Gold label |

Vertical-slice item journey: slime gel pickup + elder turn-in (VS-T* in [VERTICAL_SLICE.md](../VERTICAL_SLICE.md), e2e `slice_journey.gd` / cert journey). Trade journey: `trade.test.ts` + client trade service tests.

## ITEM-04 acceptance

1. The 30-slot bag is fully usable as a 6×5 grid. Slot indices persist. Empty squares stay visible.
2. Tooltips show canonical item data, including written rarity. Missing icons use the visual-map fallback.
3. Drag/drop and right-click send `MOVE_ITEM` / `SPLIT_STACK` / `EQUIP` and wait for server confirmation. The UI is not authoritative.
4. Compatible partial stacks merge with leftover in the source. Same full stacks reject with `stack_full` and no mutation. Split quantity is 1 .. source-1; the server mints the new instance.
5. Equipment stays outside the bag. Full-bag unequip is rejected. Later trade/corpse/merchant windows override right-click through `ItemContextRouter`, not the slot component.
6. `client/addons/` untouched; content hash unchanged from ITEM-03 (`7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`).

## Later-phase tests (do not implement now)

60 s / 5 min corpse; first-attacker tag snapshot; Need/Greed; Loot All partial; corpse gold remainder order; `AWARDED_PENDING_PICKUP`; all-pass public; player drop 5 min opcode; 20 trade slots; forage grant from a world node.

If any **current** trade test fails before a later ITEM phase: repair in a focused pre-ITEM commit; do not retarget expectations without root cause.
