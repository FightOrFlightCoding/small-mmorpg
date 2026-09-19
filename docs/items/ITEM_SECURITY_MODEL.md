# Item security model (ITEM-01)

The client is an untrusted renderer. Defenses stay server-side. Parent: [SECURITY_MODEL.md](../SECURITY_MODEL.md).

## Live defenses (keep)

| Attack | Defense |
| --- | --- |
| Item injection | No grant opcode; `permissionWrite: 0`; server `uuidv4` instance ids |
| Stack overflow | Split at `maxStack`; never overstack |
| Duplicate loot | First pickup despawns; `requestId` replay |
| Price spoof | `unknown_field:price`; `stat_injection:gold` |
| Quantity abuse | Vendor 1–99; finite integers |
| Locked mutation | `item_locked` |
| Unowned trade | `unowned_item` / `not_tradeable` |
| Revision race | Trade `revision_mismatch`; commit only dual accept of current revision |
| Duplicate commit | Completed trade + `requestId` |
| Disconnect mid-commit | `committing` snapshot retry |
| Group loot spoof | Reject `lootRecipients` / `creditUserIds` |
| Duplicate death | `kill:<instanceId>:<deathCount>` |
| Quest count spoof | Server possession recount |
| Rate flood | 8 inventory/vendor/trade per 10 ticks; 2048-byte bodies |

## Target threats not yet implemented

| Attack | Required defense when that feature lands |
| --- | --- |
| Need/Greed client roll | Server integer 1–100; ignore client numbers |
| Claim private corpse | Tag + roster + time; others `not_eligible` |
| Pickup pending award | Winner only; others fail |
| Loot All while rolls open | Skip `ROLL_PENDING` and foreign `AWARDED_PENDING_PICKUP` |
| Client drop coordinates | Server chooses nearby valid pose |
| Partial ground pickup | Reject; full stack only |
| Stale bag revision | `expected_revision` reject + canonical bag |
| Equip with full bag (after equipment leaves bag) | `inventory_full`; stay equipped |
| Forged forage grant | No client grant; node + range + idempotent `requestId` |

## Character / session

Reject mutations when link-dead, transferring, deleted, not selected, or not owned by the session. Dead: no bag rearrange, merchant, drop, or trade; looting follows the phase that owns corpses; Need/Greed remains available to eligible dead members.

## Logging

Structured logs only. No tokens, emails, or wallet secrets. Audit metadata may include character id, item id, instance id, quantity, reason, request id.

## Addons

Do not modify `client/addons/`. GLoot cannot become authoritative. `DragDropService` must keep rejecting payloads that contain `gold` / `damage` / `health`.
