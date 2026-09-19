import {
  cloneInventory,
  cloneItem,
  findItemBySlot,
  firstEmptySlotIndex,
  isItemLocked,
  occupiedSlots,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { staleRevisionCode } from "./item_errors";

export const OVERFLOW_COLLECTION = "player";
export const OVERFLOW_KEY = "overflow";
export const OVERFLOW_PERMISSION_READ: 1 = 1;
export const OVERFLOW_PERMISSION_WRITE: 0 = 0;
export const OVERFLOW_SCHEMA_VERSION = 1;

export interface OverflowMutationRecord {
  ok: boolean;
  code: string;
  instanceId: string;
  toSlotIndex?: number;
}

export interface MigrationOverflow {
  items: ItemInstance[];
  revision: number;
  schemaVersion: number;
  createdAt?: number;
  updatedAt?: number;
  mutationByRequestId?: { [requestId: string]: OverflowMutationRecord };
}

export interface OverflowRecoverDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  deleteOverflow: boolean;
  inventory: PlayerInventory;
  overflow: MigrationOverflow;
}

export function emptyOverflow(): MigrationOverflow {
  return {
    items: [],
    revision: 0,
    schemaVersion: OVERFLOW_SCHEMA_VERSION,
    mutationByRequestId: {},
  };
}

export function cloneOverflow(overflow: MigrationOverflow | null | undefined): MigrationOverflow {
  if (overflow == null) {
    return emptyOverflow();
  }
  const items: ItemInstance[] = [];
  const source = Array.isArray(overflow.items) ? overflow.items : [];
  for (let i = 0; i < source.length; i++) {
    items.push(cloneItem(source[i]));
  }
  const mutationByRequestId: { [requestId: string]: OverflowMutationRecord } = {};
  if (overflow.mutationByRequestId !== undefined) {
    const keys = Object.keys(overflow.mutationByRequestId);
    for (let k = 0; k < keys.length; k++) {
      const record = overflow.mutationByRequestId[keys[k]];
      if (record == null) {
        continue;
      }
      const copied: OverflowMutationRecord = {
        ok: record.ok,
        code: record.code,
        instanceId: record.instanceId,
      };
      if (record.toSlotIndex !== undefined) {
        copied.toSlotIndex = record.toSlotIndex;
      }
      mutationByRequestId[keys[k]] = copied;
    }
  }
  return {
    items: items,
    revision: typeof overflow.revision === "number" && isFinite(overflow.revision) ? overflow.revision : 0,
    schemaVersion:
      typeof overflow.schemaVersion === "number" && overflow.schemaVersion >= 1
        ? overflow.schemaVersion
        : OVERFLOW_SCHEMA_VERSION,
    createdAt: overflow.createdAt,
    updatedAt: overflow.updatedAt,
    mutationByRequestId: mutationByRequestId,
  };
}

export function isOverflowEmpty(overflow: MigrationOverflow | null | undefined): boolean {
  return overflow == null || !Array.isArray(overflow.items) || overflow.items.length === 0;
}

export function findOverflowItem(overflow: MigrationOverflow, instanceId: string): ItemInstance | null {
  for (let i = 0; i < overflow.items.length; i++) {
    if (overflow.items[i].instanceId === instanceId) {
      return overflow.items[i];
    }
  }
  return null;
}

export function applyRecoverOverflow(input: {
  playerHealth: number;
  inventory: PlayerInventory;
  overflow: MigrationOverflow;
  instanceId: string;
  toSlotIndex?: number;
  requestId: string;
  itemsById: { [id: string]: ItemDefinition };
  expectedRevision?: number;
}): OverflowRecoverDecision {
  const inventory = cloneInventory(input.inventory);
  const overflow = cloneOverflow(input.overflow);
  const previous = overflow.mutationByRequestId !== undefined ? overflow.mutationByRequestId[input.requestId] : undefined;
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      deleteOverflow: isOverflowEmpty(overflow),
      inventory: inventory,
      overflow: overflow,
    };
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failRecover(stale, inventory, overflow);
  }
  if (input.playerHealth <= 0) {
    return failRecover("player_dead", inventory, overflow);
  }
  const item = findOverflowItem(overflow, input.instanceId);
  if (item === null) {
    return failRecover("invalid_id", inventory, overflow);
  }
  if (isItemLocked(item)) {
    return failRecover("item_locked", inventory, overflow);
  }
  let dest = input.toSlotIndex;
  if (dest === undefined) {
    dest = firstEmptySlotIndex(inventory);
  }
  if (dest === undefined || dest < 0 || dest !== Math.floor(dest) || dest >= inventory.capacity) {
    return failRecover("invalid_slot", inventory, overflow);
  }
  const occupant = findItemBySlot(inventory, dest);
  if (occupant !== null) {
    return failRecover("invalid_slot", inventory, overflow);
  }
  if (occupiedSlots(inventory) >= inventory.capacity) {
    return failRecover("inventory_full", inventory, overflow);
  }
  const moved = cloneItem(item);
  moved.slotIndex = dest;
  moved.version += 1;
  inventory.items.push(moved);
  inventory.revision += 1;
  const kept: ItemInstance[] = [];
  for (let i = 0; i < overflow.items.length; i++) {
    if (overflow.items[i].instanceId !== input.instanceId) {
      kept.push(overflow.items[i]);
    }
  }
  overflow.items = kept;
  overflow.revision += 1;
  if (overflow.mutationByRequestId === undefined) {
    overflow.mutationByRequestId = {};
  }
  overflow.mutationByRequestId[input.requestId] = {
    ok: true,
    code: "ok",
    instanceId: input.instanceId,
    toSlotIndex: dest,
  };
  return {
    ok: true,
    code: "ok",
    replay: false,
    persist: true,
    deleteOverflow: isOverflowEmpty(overflow),
    inventory: inventory,
    overflow: overflow,
  };
}

function failRecover(code: string, inventory: PlayerInventory, overflow: MigrationOverflow): OverflowRecoverDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    deleteOverflow: false,
    inventory: inventory,
    overflow: overflow,
  };
}

export function publicOverflow(overflow: MigrationOverflow): { [key: string]: unknown } {
  const items: { [key: string]: unknown }[] = [];
  for (let i = 0; i < overflow.items.length; i++) {
    const item = overflow.items[i];
    items.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      definitionId: item.itemId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      metadata: item.metadata,
      stackKey: item.stackKey,
      lockReason: item.lockReason.length > 0 ? item.lockReason : null,
      lockId: item.lockId.length > 0 ? item.lockId : null,
      lockType: item.lockType.length > 0 ? item.lockType : null,
      version: item.version,
      schemaVersion: item.schemaVersion,
      slotIndex: item.slotIndex,
    });
  }
  return {
    items: items,
    revision: overflow.revision,
    schemaVersion: overflow.schemaVersion,
  };
}
