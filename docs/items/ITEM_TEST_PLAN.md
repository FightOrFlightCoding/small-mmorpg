# Item test plan (ITEM-02)

ITEM-02 extends the live inventory/equipment core. Acceptance is the gates below plus the ITEM-02 cases. Do not weaken tests.

## Baseline (run on ITEM-02; 2026-09-19)

Directory-form `node --test dist/tests` can fail on Node 22.14 before discovery. Glob invocation is authoritative.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (35 storage records, 41 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 876 passed, 13 expected live-test skips, 0 fail |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | unchanged; 52/52 previously |
| Godot 4.7.1 client GdUnit | 341/341 passed, 0 failures, 0 orphans |

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
| `server/tests/item_model.test.ts` | Empty 30-slot bag, slots 0–29, stack 99, equipment max 1, compatibility/metadata, merge/split, equipment outside bag, unequip into bag / full bag, migration under/over 30, overflow recovery, overflow not extra storage, repeated migration, restore/purge, equipment stat recalc |
| `server/tests/inventory.test.ts` | Pickup, stack merge/split/move, destroy, locks, capacity, Prompt 18 ids |
| `server/tests/equipment.test.ts` | Equip/unequip, tags, unique, class/level, locked |
| `server/tests/existing_save_cert.test.ts` | Equipped iron leaves the bag; remaining stacks keep instance ids; capacity 30 |
| `server/tests/loot_table.test.ts` | Rolls, duplicate death, policies |
| `server/tests/party_credit_loot.test.ts` | Credit range, personal/server_assigned, no client recipients |
| `server/tests/vendor.test.ts` | Buy/sell, gold, full bag, equipped, unsellable, idempotent |
| `server/tests/npc_vendor.test.ts` / `npc_security.test.ts` | Session-gated buy, price spoof, qty, replay |
| `server/tests/trade.test.ts` | Invite through recovery, locks, gold, revision, disconnect, transfer |
| `server/tests/quest_reward.test.ts` / `quest.test.ts` | Consume, grant, possession |
| `server/tests/transaction.test.ts` / `wallet` tests | Gold ledger, version conflict |
| `server/tests/security.test.ts` / `protocol.test.ts` | Injection, unknown fields, opcode 41 |
| `client/tests/app/inventory_service_test.gd` | GLoot mirror, intents, overflow recover, Inventory Recovery panel |
| `client/tests/app/equipment_service_test.gd` | Equip mirror |
| `client/tests/app/vendor_inn_service_test.gd` / `merchant_window_test.gd` | Buy UI, no price send |
| `client/tests/app/trade_service_test.gd` | Trade mirror |
| `client/tests/app/wallet_service_test.gd` | Gold label |

Vertical-slice item journey: slime gel pickup + elder turn-in (VS-T* in [VERTICAL_SLICE.md](../VERTICAL_SLICE.md), e2e `slice_journey.gd` / cert journey). Trade journey: `trade.test.ts` + client trade service tests.

## ITEM-02 acceptance

1. Every character bag is 30 slots (`0`–`29`). Equipped instances do not occupy bag slots.
2. Stack rules are server-enforced (`stacksAreCompatible`, max 99 / equippable 1).
3. Existing items migrate without loss or duplication. Excess stacks enter MigrationOverflow. Recover only into free bag slots. Overflow is not extra storage.
4. Production items are tradeable and droppable; no binding mode; gel/proof stay non-destroyable.
5. `client/addons/` untouched; content hash `7877dd576b022d59f0350be4430aca0b9d402db38b5e16e816ef361003c9cffd`.

## Later-phase tests (do not implement now)

6×5 bag UI; drag-drop move; item tooltips; 60 s / 5 min corpse; first-attacker tag snapshot; Need/Greed; Loot All partial; corpse gold remainder order; `AWARDED_PENDING_PICKUP`; all-pass public; player drop 5 min; 20 trade slots; capacity planner `expected_revision`; typed locks; forage grant idempotency.

If any **current** trade test fails before a later ITEM phase: repair in a focused pre-ITEM commit; do not retarget expectations without root cause.
