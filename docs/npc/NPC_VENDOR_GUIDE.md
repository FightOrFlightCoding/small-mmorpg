# NPC vendor guide

Merchant buy reuses canonical `vendor.ts`, inventory, wallet, and `transaction.ts`. Do not add a second shop or currency.

## Authoring

```powershell
powershell -File scripts/content.ps1 new vendor --id vendor.example_baker
```

Required: `id`, `kind: "vendor"`, `displayName`, `currencyId` (`gold`), `stock` (one or more), `sellMultiplier`. Each stock row: `itemId`, canonical `buyPrice`, optional `stockEntryId`, `displayOrder`, `quantityConstraints`, `classRequirements`, `levelRequirement`. Unauthored `stockEntryId` is `${vendorId}:${itemId}` at runtime.

Bind the vendor on an NPC:

```json
{ "type": "vendor", "vendorId": "vendor.example_baker" }
```

Stock is static and unlimited. There is no scarcity, restock, auction, or price fluctuation. Prompt 18 potion **10**, training sword **15**, cert mail **5**, and sell multiplier **0.5** stay unchanged.

## Buy protocol

`VENDOR_BUY` is `{ interactionSessionId, vendorId, stockEntryId, quantity?, preferredSlot?, requestId, expectedRevision? }`. Quantity omitted means 1. Zero, negative, non-integer, and values above 99 are `invalid_amount`. The client must not send `price`, `gold`, or `resultingBalance`. NPC identity comes from the live interaction session.

The match requires a live session, range, character state, NPC vendor bind matching `vendorId`, stock entry, server price, enough gold, bag capacity for the entire quantity, and inventory revision. Purchase deducts gold, plans every stack, grants into the bag, persists inventory and wallet, writes `TX_REASON_VENDOR`, and returns canonical `INVENTORY_STATE` + `WALLET_STATE`. If the whole quantity does not fit, grant nothing and deduct no gold. Same `requestId` replays without a second grant.

`VENDOR_SELL` remains the accepted sell path (`npcId`, `instanceId`, `quantity?`) and is not presented in the ITEM-07 merchant window. Equipped items stay locked.

## UI

`MerchantWindow` is reusable: NPC name, stock icons and tooltips, canonical prices, quantity selector, player gold, player bag, Buy, result/error, Back to dialogue. Right-click buys one; Shift-right-click or the quantity control chooses quantity; drag onto an empty bag slot or compatible partial stack sets `preferredSlot`. Dragging a bag item onto merchant stock is rejected. Back does not close the interaction session.

## Proof

`vendor.platform_kiosk` sells `item.test_potion` at 10 gold. `npc.platform_merchant` and `npc.platform_combined` bind it. Copy that pair for a new merchant.
