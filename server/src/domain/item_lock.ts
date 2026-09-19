import {
  cloneInventory,
  findItem,
  isItemLocked,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import {
  ITEM_ERROR_INVALID_QUANTITY,
  ITEM_ERROR_ITEM_LOCKED,
  ITEM_ERROR_ITEM_NOT_FOUND,
  ITEM_ERROR_ITEM_NOT_OWNED,
} from "./item_errors";

export const ITEM_LOCK_SCHEMA_VERSION = 1;
export const ITEM_LOCK_TTL_MS = 120000;

export const LOCK_TYPE_TRANSACTION = "TRANSACTION";
export const LOCK_TYPE_TRADE = "TRADE";
export const LOCK_TYPE_LOOT_CLAIM = "LOOT_CLAIM";
export const LOCK_TYPE_ROLL_AWARD = "ROLL_AWARD";
export const LOCK_TYPE_DROP_INTENT = "DROP_INTENT";
export const LOCK_TYPE_EQUIPMENT_TRANSITION = "EQUIPMENT_TRANSITION";
export const LOCK_TYPE_QUEST_TURN_IN = "QUEST_TURN_IN";
export const LOCK_TYPE_ADMIN_REPAIR = "ADMIN_REPAIR";

export const TRADE_LOCK_REASON = "trade";

export interface ItemLock {
  lockId: string;
  lockType: string;
  instanceId: string;
  quantity: number;
  ownerOperation: string;
  createdAt: number;
  expiresAt: number;
  schemaVersion: number;
}

export interface AcquireLockInput {
  inventory: PlayerInventory;
  instanceId: string;
  lockId: string;
  lockType: string;
  quantity: number;
  ownerOperation: string;
  nowMs: number;
  ttlMs?: number;
  ownerCharacterId?: string;
}

export interface AcquireLockResult {
  ok: boolean;
  code: string;
  inventory: PlayerInventory;
  lock: ItemLock | null;
}

export function lockReasonForType(lockType: string): string {
  if (lockType === LOCK_TYPE_TRADE) {
    return TRADE_LOCK_REASON;
  }
  return lockType.toLowerCase();
}

export function itemLockFromInstance(item: ItemInstance): ItemLock | null {
  if (!isItemLocked(item)) {
    return null;
  }
  const lockType = item.lockType.length > 0 ? item.lockType : item.lockReason === TRADE_LOCK_REASON ? LOCK_TYPE_TRADE : item.lockReason;
  return {
    lockId: item.lockId,
    lockType: lockType,
    instanceId: item.instanceId,
    quantity: item.lockQuantity > 0 ? item.lockQuantity : item.quantity,
    ownerOperation: item.lockOwnerOperation,
    createdAt: item.lockCreatedAt,
    expiresAt: item.lockExpiresAt,
    schemaVersion: ITEM_LOCK_SCHEMA_VERSION,
  };
}

export function lockIsExpired(item: ItemInstance, nowMs: number): boolean {
  if (!isItemLocked(item)) {
    return false;
  }
  if (item.lockExpiresAt > 0 && nowMs >= item.lockExpiresAt) {
    return true;
  }
  return false;
}

export function clearInstanceLockFields(item: ItemInstance): void {
  item.lockReason = "";
  item.lockType = "";
  item.lockId = "";
  item.lockQuantity = 0;
  item.lockOwnerOperation = "";
  item.lockCreatedAt = 0;
  item.lockExpiresAt = 0;
}

export function expireInventoryLocks(inventory: PlayerInventory, nowMs: number): { inventory: PlayerInventory; changed: boolean } {
  const next = cloneInventory(inventory);
  let changed = false;
  for (let i = 0; i < next.items.length; i++) {
    const item = next.items[i];
    if (lockIsExpired(item, nowMs)) {
      clearInstanceLockFields(item);
      item.version += 1;
      changed = true;
    }
  }
  if (changed) {
    next.revision += 1;
  }
  return { inventory: next, changed: changed };
}

export function expireOrphanLocks(inventory: PlayerInventory, liveLockIds: ReadonlyArray<string>): { inventory: PlayerInventory; changed: boolean } {
  const next = cloneInventory(inventory);
  const live: { [id: string]: boolean } = {};
  for (let i = 0; i < liveLockIds.length; i++) {
    live[liveLockIds[i]] = true;
  }
  let changed = false;
  for (let i = 0; i < next.items.length; i++) {
    const item = next.items[i];
    if (!isItemLocked(item)) {
      continue;
    }
    if (item.lockId.length > 0 && live[item.lockId] === true) {
      continue;
    }
    clearInstanceLockFields(item);
    item.version += 1;
    changed = true;
  }
  if (changed) {
    next.revision += 1;
  }
  return { inventory: next, changed: changed };
}

export function acquireItemLock(input: AcquireLockInput): AcquireLockResult {
  const next = cloneInventory(input.inventory);
  const item = findItem(next, input.instanceId);
  if (item === null) {
    return { ok: false, code: ITEM_ERROR_ITEM_NOT_FOUND, inventory: next, lock: null };
  }
  if (input.quantity < 1 || input.quantity !== Math.floor(input.quantity) || input.quantity > item.quantity) {
    return { ok: false, code: ITEM_ERROR_INVALID_QUANTITY, inventory: next, lock: null };
  }
  if (isItemLocked(item) && !lockIsExpired(item, input.nowMs)) {
    if (item.lockId !== input.lockId) {
      return { ok: false, code: ITEM_ERROR_ITEM_LOCKED, inventory: next, lock: null };
    }
  }
  const ttl = input.ttlMs !== undefined ? input.ttlMs : ITEM_LOCK_TTL_MS;
  const expiresAt = ttl > 0 ? input.nowMs + ttl : 0;
  item.lockType = input.lockType;
  item.lockReason = lockReasonForType(input.lockType);
  item.lockId = input.lockId;
  item.lockQuantity = input.quantity;
  item.lockOwnerOperation = input.ownerOperation;
  item.lockCreatedAt = input.nowMs;
  item.lockExpiresAt = expiresAt;
  item.version += 1;
  next.revision += 1;
  return {
    ok: true,
    code: "ok",
    inventory: next,
    lock: itemLockFromInstance(item),
  };
}

export function validateItemLock(
  inventory: PlayerInventory,
  instanceId: string,
  lockId: string,
  nowMs: number,
): { ok: boolean; code: string } {
  const item = findItem(inventory, instanceId);
  if (item === null) {
    return { ok: false, code: ITEM_ERROR_ITEM_NOT_OWNED };
  }
  if (!isItemLocked(item)) {
    return { ok: false, code: ITEM_ERROR_ITEM_NOT_FOUND };
  }
  if (lockIsExpired(item, nowMs)) {
    return { ok: false, code: ITEM_ERROR_ITEM_LOCKED };
  }
  if (item.lockId !== lockId) {
    return { ok: false, code: ITEM_ERROR_ITEM_LOCKED };
  }
  return { ok: true, code: "ok" };
}

export function releaseItemLock(inventory: PlayerInventory, lockId: string): PlayerInventory {
  const next = cloneInventory(inventory);
  if (lockId.length === 0) {
    return next;
  }
  let changed = false;
  for (let i = 0; i < next.items.length; i++) {
    if (next.items[i].lockId === lockId) {
      clearInstanceLockFields(next.items[i]);
      next.items[i].version += 1;
      changed = true;
    }
  }
  if (changed) {
    next.revision += 1;
  }
  return next;
}

export function stackIsImmovable(item: ItemInstance, nowMs?: number): boolean {
  if (!isItemLocked(item)) {
    return false;
  }
  if (nowMs !== undefined && lockIsExpired(item, nowMs)) {
    return false;
  }
  return true;
}
