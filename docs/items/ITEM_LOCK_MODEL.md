# Item lock model (ITEM-01)

Locks are temporary. They are not soulbinding. Production items have no bind flags.

## Live representation

On each `ItemInstance`:

- `lockReason: string` (empty = unlocked)
- `lockId: string` (operation id)

Helpers: `isItemLocked`, `setItemLock`, `clearLocksByLockId`.

Locked stacks reject equip, destroy, vendor sell, and (when locked) consume. Trade set-offer requires unlocked, owned, tradeable, unequipped stacks then sets:

| Field | Value |
| --- | --- |
| `lockReason` | `"trade"` (`TRADE_LOCK_REASON`) |
| `lockId` | `tradeId` |

Partial `takeItemQuantity` clears locks on the remainder.

No other production lock reasons are written. Tests/docs may mention `"quest"`; turn-in consumes by item id and skips locked stacks in `consumeItem`, which can fail a turn-in if the only copies are trade-locked.

## Target lock types

Later ITEM phases may use these **names** (store in `lockReason` or a typed field without a parallel lock table):

| Type | Owner operation | Typical `lockId` |
| --- | --- | --- |
| `TRANSACTION` | Generic multi-container commit | `requestId` |
| `TRADE` | Live `trade` | `tradeId` |
| `LOOT_CLAIM` | Corpse/ground claim in flight | claim `requestId` |
| `ROLL_AWARD` | Need/Greed pending award | roll id |
| `DROP_INTENT` | Player drop not yet spawned | `requestId` |
| `EQUIPMENT_TRANSITION` | Equip/unequip capacity plan | `requestId` |
| `QUEST_TURN_IN` | Consume list during `multiUpdate` | turn-in `requestId` |
| `ADMIN_REPAIR` | GM repair | audit id |

## Release (required)

Success, cancellation, timeout, disconnect handling, recovery, and server-restart repair where the lock is persisted.

Live trade: cancel/complete/expiry/`cancel_trade` / account deletion runner calls `clearLocksByLockId`. Committing trades must not unlock until commit or recovered failure.

Live logout: locks must not survive a **completed** logout; inventory persist should clear orphan trade locks if the trade record is gone ([KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md)).

## Non-locks

`uniquePolicy` is a grant/equip rule, not a lock.  
`tradeable: false` is content, not a lock.  
Equipment slot occupancy is not a bag lock; destroy of an equipped instance is `item_equipped`.
