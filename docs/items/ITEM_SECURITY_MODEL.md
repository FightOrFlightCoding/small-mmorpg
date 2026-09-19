# Item security model (ITEM-06)

The client is an untrusted renderer. Defenses stay server-side. Parent: [SECURITY_MODEL.md](../SECURITY_MODEL.md).

## Live defenses (keep)

| Attack | Defense |
| --- | --- |
| Item injection | No grant opcode; `permissionWrite: 0`; server `uuidv4` instance ids |
| Stack overflow | Split at `maxStack`; never overstack; production max 99 |
| Duplicate loot | First pickup despawns; `requestId` replay; acquisition intent |
| Price spoof | `unknown_field:price`; `stat_injection:gold` |
| Quantity abuse | Vendor 1–99; finite integers; planner `invalid_quantity` |
| Locked mutation | `item_locked`; typed locks; whole stack immovable |
| Unowned trade | `unowned_item` / `not_tradeable` / `item_not_owned` |
| Revision race | Trade `revision_mismatch`; bag `expectedRevision` → `inventory_stale` + `FULL_STATE` |
| Duplicate commit | Completed trade + `requestId`; journal terminal replay |
| Generic container command | Not on the wire; unknown opcode / unknown field |
| Disconnect mid-commit | `committing` snapshot retry |
| Group loot spoof | Reject `lootRecipients` / `creditUserIds` |
| Duplicate death | `kill:<instanceId>:<deathCount>` |
| Quest count spoof | Server possession recount |
| Equip with full bag | Unequip simulates capacity; `inventory_full`; stay equipped |
| Overflow as extra bag | Grants never write overflow; recover requires a free bag slot; occupied dest is `invalid_slot` |
| Forged overflow instance | `invalid_id` unless the stack is in that character's overflow |
| Rate flood | 8 inventory/vendor/trade/recover/corpse per 10 ticks; 2048-byte bodies |
| Stale bag revision | Optional `expectedRevision`; reject + canonical `FULL_STATE` |
| Indefinite item lock | TTL 120 s, tick expiry, orphan release |
| Claim private corpse | Tag + roster + time; others `not_eligible` |
| Concurrent corpse claim | One reservation; others `loot_item_no_longer_available`; same `requestId` replays |
| Loot All while rolls open | Skip `ROLL_PENDING` and foreign `AWARDED_PENDING_PICKUP` |
| Corpse gold spoof | Client sends `corpseId` only; split is server-side and idempotent |
| Corpse recipient injection | Reject `lootRecipients` |
| Need/Greed client roll | `stat_injection:roll`; server integer 1–100; ignore client numbers |
| Pickup pending award | Winner only; others `not_eligible`. `ROLL_PENDING` rejects `roll_pending` until resolution |

## Target threats not yet implemented

| Attack | Required defense when that feature lands |
| --- | --- |
| Client drop coordinates | Server chooses nearby valid pose |
| Partial ground pickup | Reject; full stack only |
| Forged forage grant | No client grant; node + range + idempotent `requestId`; reuse acquisition intent |

## Character / session

Reject mutations when link-dead, transferring, deleted, not selected, or not owned by the session. Dead: no bag rearrange, merchant, drop, or trade; looting follows the phase that owns corpses; Need/Greed remains available to eligible dead members.

## Logging

Structured logs only. No tokens, emails, or wallet secrets. Audit metadata may include character id, item id, instance id, quantity, reason, request id.

## Addons

Do not modify `client/addons/`. GLoot cannot become authoritative. `DragDropService` must keep rejecting payloads that contain `gold` / `damage` / `health`.
