import {
  INVENTORY_CAPACITY,
  cloneInventory,
  emptyInventory,
  type PlayerInventory,
  type ItemInstance,
  type PickupRecord,
} from "./inventory";

export const INVENTORY_COLLECTION = "player";
export const INVENTORY_KEY = "inventory";
export const INVENTORY_PERMISSION_READ: 1 = 1;
export const INVENTORY_PERMISSION_WRITE: 0 = 0;

export function storedInventoryWriteValue(inventory: PlayerInventory): { [key: string]: unknown } {
  return publicStoredInventory(inventory);
}

export function storedInventoryFromValue(value: unknown): PlayerInventory | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (!Array.isArray(data.items) || typeof data.capacity !== "number") {
    return null;
  }
  const inventory = emptyInventory(data.capacity > 0 ? data.capacity : INVENTORY_CAPACITY);
  for (let i = 0; i < data.items.length; i++) {
    const parsed = parseItem(data.items[i]);
    if (parsed !== null) {
      inventory.items.push(parsed);
    }
  }
  if (data.pickupByRequestId !== null && typeof data.pickupByRequestId === "object" && !Array.isArray(data.pickupByRequestId)) {
    const map = data.pickupByRequestId as { [key: string]: unknown };
    const keys = Object.keys(map);
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      const parsed = parsePickupRecord(map[key]);
      if (parsed !== null) {
        inventory.pickupByRequestId[key] = parsed;
      }
    }
  }
  return cloneInventory(inventory);
}

function publicStoredInventory(inventory: PlayerInventory): { [key: string]: unknown } {
  const items: { [key: string]: unknown }[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    items.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      quantity: item.quantity,
      metadata: item.metadata,
    });
  }
  const pickupByRequestId: { [requestId: string]: { [key: string]: unknown } } = {};
  const keys = Object.keys(inventory.pickupByRequestId);
  for (let k = 0; k < keys.length; k++) {
    const key = keys[k];
    const record = inventory.pickupByRequestId[key];
    pickupByRequestId[key] = {
      ok: record.ok,
      code: record.code,
      lootId: record.lootId,
    };
  }
  return {
    capacity: inventory.capacity,
    items: items,
    pickupByRequestId: pickupByRequestId,
  };
}

function parseItem(value: unknown): ItemInstance | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.instanceId !== "string" || data.instanceId.length === 0) {
    return null;
  }
  if (typeof data.itemId !== "string" || data.itemId.length === 0) {
    return null;
  }
  if (typeof data.quantity !== "number" || data.quantity < 1) {
    return null;
  }
  const metadata: { [key: string]: unknown } = {};
  if (data.metadata !== null && typeof data.metadata === "object" && !Array.isArray(data.metadata)) {
    const source = data.metadata as { [key: string]: unknown };
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
      metadata[keys[i]] = source[keys[i]];
    }
  }
  return {
    instanceId: data.instanceId,
    itemId: data.itemId,
    quantity: data.quantity,
    metadata: metadata,
  };
}

function parsePickupRecord(value: unknown): PickupRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.code !== "string" || typeof data.lootId !== "string") {
    return null;
  }
  return {
    ok: data.ok === true,
    code: data.code,
    lootId: data.lootId,
  };
}
