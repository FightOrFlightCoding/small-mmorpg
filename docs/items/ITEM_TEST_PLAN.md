# Item test plan (ITEM-01)

ITEM-01 is documentation. Acceptance is **existing** gates plus this catalog. Do not weaken tests.

## Baseline (run on ITEM-01; 2026-09-19)

Directory-form `node --test dist/tests` can fail on Node 22.14 before discovery. Glob invocation is authoritative.

| Gate | Result |
| --- | --- |
| Foundation audit | `FOUNDATION_AUDIT_OK` (34 storage records, 40 client opcodes, 15 server opcodes, 29 RPCs) |
| Content validation/tests | 28/28 passed |
| Server hermetic tests | 856 passed, 13 expected live-test skips, 0 fail |
| Server typecheck/build | passed |
| Auth gateway hermetic tests | 52/52 passed |
| Godot 4.7.1 client GdUnit | 339/339 passed, 0 failures, 0 orphans |

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
| `server/tests/inventory.test.ts` | Pickup, stack merge/split/move, destroy, locks, capacity, Prompt 18 ids |
| `server/tests/equipment.test.ts` | Equip/unequip, tags, unique, class/level, locked |
| `server/tests/loot_table.test.ts` | Rolls, duplicate death, policies |
| `server/tests/party_credit_loot.test.ts` | Credit range, personal/server_assigned, no client recipients |
| `server/tests/vendor.test.ts` | Buy/sell, gold, full bag, equipped, unsellable, idempotent |
| `server/tests/npc_vendor.test.ts` / `npc_security.test.ts` | Session-gated buy, price spoof, qty, replay |
| `server/tests/trade.test.ts` | Invite through recovery, locks, gold, revision, disconnect, transfer |
| `server/tests/quest_reward.test.ts` / `quest.test.ts` | Consume, grant, possession |
| `server/tests/transaction.test.ts` / `wallet` tests | Gold ledger, version conflict |
| `server/tests/security.test.ts` / `protocol.test.ts` | Injection, unknown fields |
| `client/tests/app/inventory_service_test.gd` | GLoot mirror, intents |
| `client/tests/app/equipment_service_test.gd` | Equip mirror |
| `client/tests/app/vendor_inn_service_test.gd` / `merchant_window_test.gd` | Buy UI, no price send |
| `client/tests/app/trade_service_test.gd` | Trade mirror |
| `client/tests/app/wallet_service_test.gd` | Gold label |

Vertical-slice item journey: slime gel pickup + elder turn-in (VS-T* in [VERTICAL_SLICE.md](../VERTICAL_SLICE.md), e2e `slice_journey.gd` / cert journey). Trade journey: `trade.test.ts` + client trade service tests.

## ITEM-01 manual acceptance

1. No gameplay change: starter sword, 20-stack bag, slime gel on the ground for 30 s, F pickup, elder turn-in, merchant buy **and** sell still present, nearby trade still works.
2. Docs exist under `docs/items/` and conflicts are OPEN, not silently closed.
3. `client/addons/` untouched; content hash unchanged (`bf283255559cf5145b9b4e90ad0ebfca4e09c27f7ffaa9c241347729d0cc5fcb`).

## Later-phase tests (do not implement now)

Bag 30 and 6×5 UI; equipment not occupying bag; drag-drop move; item tooltips; 60 s / 5 min corpse; first-attacker tag snapshot; Need/Greed; Loot All partial; corpse gold remainder order; `AWARDED_PENDING_PICKUP`; all-pass public; player drop 5 min; quest item trade/drop recount; 20 trade slots; capacity planner; `expected_revision`; typed locks; forage grant idempotency.

If any **current** trade test fails before a later ITEM phase: repair in a focused pre-ITEM commit; do not retarget expectations without root cause.
