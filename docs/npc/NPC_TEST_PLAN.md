# NPC test plan (NPC-06)

NPC-06 records session-gated vendor buy through canonical `vendor.ts` / `transaction.ts`, static unlimited stock, and reusable `MerchantWindow`. NPC-05 coverage remains.

## Automated coverage

| Check | Owner | Expected proof |
| --- | --- | --- |
| Open shop | `npc_vendor.test.ts` | `INTERACT` returns vendor service, `vendorId`, `currencyId` `gold`, and catalog stock. |
| Unknown vendor | `npc_vendor.test.ts` | Missing vendor catalog id is `invalid_id`. |
| Unknown stock item | `npc_vendor.test.ts` | Item not on stock is `invalid_id`. |
| Price spoof | `npc_vendor.test.ts`, `protocol.test.ts` | Client `price` is `unknown_field:price`; `gold` / `resultingBalance` are `stat_injection`. |
| Quantity zero | `npc_vendor.test.ts` | `invalid_amount`; gold unchanged. |
| Negative quantity | `npc_vendor.test.ts` | `invalid_amount`. |
| Excessive quantity | `npc_vendor.test.ts` | Quantity above 99 is `invalid_amount`. |
| Insufficient currency | `npc_vendor.test.ts`, `vendor.test.ts` | `insufficient_gold`. |
| Full inventory | `npc_vendor.test.ts`, `vendor.test.ts` | `inventory_full`. |
| Class/level restriction | `npc_vendor.test.ts` | `class_restricted` / `level_too_low`. |
| Valid purchase | `npc_vendor.test.ts`, `vendor.test.ts` | Gold deducted once; item granted; `INVENTORY_STATE` + `WALLET_STATE`. |
| Duplicate request | `npc_vendor.test.ts`, `vendor.test.ts` | Same `requestId` replays without a second grant. |
| Interrupted transaction | `npc_vendor.test.ts` | Failed commit is `persist_failed`; gold and inventory unchanged. |
| Reconnect | `npc_vendor.test.ts` | `FULL_STATE` restores gold and purchased items. |
| Two simultaneous buyers | `npc_vendor.test.ts` | Unlimited stock; both purchases succeed. |
| Audit event | `npc_vendor.test.ts` | `TX_REASON_VENDOR` audit with gold delta. |
| Session invalidation | `npc_vendor.test.ts` | Buy after close is `invalid_session`. |
| Merchant UI | `merchant_window_test.gd`, `vendor_inn_service_test.gd` | Window shows name, list, price, quantity, gold, Buy, Back; buy payload has no price/gold/`npcId`. |

NPC-04/NPC-05 interaction, dialogue, quest, and marker coverage remains in `interaction.test.ts`, `npc_quest.test.ts`, and `interaction_client_test.gd`.

## Baseline results and reproducible commands

Recorded after NPC-06 hermetic gates pass. Directory-form `node --test dist/tests` wrappers can fail before discovery. Direct compiled-file glob invocation is the authoritative path:

```bash
bash scripts/test-audit.sh
(cd tools/content-build && npx tsc -p tsconfig.json && node --test dist/tests/*.test.js)
(cd server && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js && npm run typecheck && npm run build)
(cd auth-gateway && npx tsc -p tsconfig.test.json && node --test dist-test/tests/*.test.js)
GODOT_BIN=godot bash scripts/test-client.sh
```

## Manual regression

After this lands on `origin/main`, close Godot and run `powershell -File scripts/local-play.ps1 -Branch main`, then verify: talking to the test vendor opens dialogue, Browse goods opens the merchant window, buying a potion deducts 10 gold once, Back returns to dialogue, and a second client can buy the same stock.
