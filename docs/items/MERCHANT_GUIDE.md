# Merchant guide

Merchants sell canonical stock. This pack is **buy-only**. `VENDOR_SELL` remains live for Foundation tests but is hidden from the ITEM merchant window.

## Content

Vendor documents own `vendorId`, `currencyId` (`gold`), `stockEntryId`, `buyPrice`, quantity constraints, optional class/level gates, and `displayOrder`. Unauthored stock ids are `${vendorId}:${itemId}`. Stock is unlimited; buyers do not compete with each other.

## Wire

`VENDOR_BUY` requires a live interaction session. The client sends `interactionSessionId`, `vendorId`, `stockEntryId`, quantity, optional `preferredSlot`, `requestId`, and optional `expectedRevision`. Client `price`, `gold`, leftover `itemId`, and `npcInstanceId` are rejected.

## Purchase

All-or-nothing: session, range, character, vendor bind, stock, quantity 1–99, requirements, gold, bag capacity (`planCapacity`), revision, then debit gold and grant or stack every unit. A quantity that does not fit grants nothing and deducts no gold. Duplicate `requestId` replays.

## UI

Name, stock icons, canonical prices, player bag, gold, quantity selector. Right-click buys one. Shift-right-click or the selector sets quantity. Drag onto an empty or compatible bag slot sets `preferredSlot`. Bag → merchant drag is rejected.
