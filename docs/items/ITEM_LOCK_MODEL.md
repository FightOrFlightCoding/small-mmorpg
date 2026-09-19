# Item lock model (ITEM-03)

Locks are temporary. They are not soulbinding. Production items have no bind flags. Item locks cannot remain indefinitely after recovery: every tick expires `lockExpiresAt`, and orphan locks whose `lockId` is not live are cleared.

Do not add a parallel lock table. Locks live on `ItemInstance`.

## Representation

On each `ItemInstance`:

| Field | Role |
| --- | --- |
| `lockId` | Operation id (`tradeId`, `requestId`, …) |
| `lockType` | Typed lock from the table below |
| `lockReason` | Wire/legacy string (`trade` for `TRADE`; otherwise `lockType` lowercased) |
| `lockQuantity` | Locked quantity (partial-stack offers) |
| `lockOwnerOperation` | Owner operation name |
| `lockCreatedAt` | Ms |
| `lockExpiresAt` | Ms; `0` means no TTL (orphan recovery still clears) |
| `schemaVersion` | `ITEM_LOCK_SCHEMA_VERSION` **1** |

Helpers: `isItemLocked`, `setItemLock`, `clearLocksByLockId`, `acquireItemLock`, `validateItemLock`, `releaseItemLock`, `expireInventoryLocks`, `expireOrphanLocks`, `stackIsImmovable`, `itemLockFromInstance`.

Default TTL is `ITEM_LOCK_TTL_MS` **120000**. The match loop expires locks every tick and persists when any lock is cleared.

## Lock types

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

Production trade still writes `lockReason: "trade"` so live `item_locked` checks keep working. `setItemLock` also stamps `lockType: TRADE`.

## Partial-stack offers

A trade (or other) offer may lock a **quantity** smaller than the stack. The source stack itself remains **immovable** for the duration (`stackIsImmovable`): it is not a merge destination, cannot move, split, equip, destroy, or sell until the lock releases or expires.

## Release (required)

Success, cancellation, timeout, disconnect handling, recovery, and server-restart repair where the lock is persisted.

- TTL expiry: `expireInventoryLocks` on each match tick.
- Orphan recovery: `expireOrphanLocks(inventory, liveLockIds)` when the owning trade/operation is gone.
- Explicit: `releaseItemLock` / `clearLocksByLockId`.

Live trade: cancel/complete/expiry/`cancel_trade` / account deletion runner calls `clearLocksByLockId`. Committing trades must not unlock until commit or recovered failure.

Live logout: locks must not survive a **completed** logout; inventory persist should clear orphan trade locks if the trade record is gone ([KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md)).

## Non-locks

`uniquePolicy` is a grant/equip rule, not a lock.  
`tradeable: false` is content, not a lock.  
Equipment slot occupancy is not a bag lock; destroy of an equipped instance is `item_equipped`.
