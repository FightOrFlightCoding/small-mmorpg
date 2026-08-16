export const INVENTORY_CAPACITY = 20;
export const STARTER_ITEM_ID = "item.training_sword";

export interface ItemDefinition {
  id: string;
  maxStack: number;
  equipSlot?: string;
  attackBonus?: number;
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  quantity: number;
  metadata: { [key: string]: unknown };
}

export interface PickupRecord {
  ok: boolean;
  code: string;
  lootId: string;
}

export interface PlayerInventory {
  capacity: number;
  items: ItemInstance[];
  pickupByRequestId: { [requestId: string]: PickupRecord };
}

export interface InitializeInventoryResult {
  inventory: PlayerInventory;
  created: boolean;
}

export function emptyInventory(capacity: number = INVENTORY_CAPACITY): PlayerInventory {
  return {
    capacity: capacity,
    items: [],
    pickupByRequestId: {},
  };
}

export function cloneInventory(inventory: PlayerInventory): PlayerInventory {
  const items: ItemInstance[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    items.push(cloneItem(inventory.items[i]));
  }
  const pickupByRequestId: { [requestId: string]: PickupRecord } = {};
  const keys = Object.keys(inventory.pickupByRequestId);
  for (let j = 0; j < keys.length; j++) {
    const key = keys[j];
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

export function initializeInventory(
  existing: PlayerInventory | null,
  newId: () => string,
  starterItemId: string = STARTER_ITEM_ID,
  capacity: number = INVENTORY_CAPACITY,
): InitializeInventoryResult {
  if (existing !== null) {
    return { inventory: cloneInventory(existing), created: false };
  }
  return {
    inventory: {
      capacity: capacity,
      items: [
        {
          instanceId: newId(),
          itemId: starterItemId,
          quantity: 1,
          metadata: {},
        },
      ],
      pickupByRequestId: {},
    },
    created: true,
  };
}

export function itemDefinitionsFromContent(items: {
  [id: string]: { id: string; maxStack: number; equipSlot?: string; attackBonus?: number };
}): { [id: string]: ItemDefinition } {
  const map: { [id: string]: ItemDefinition } = {};
  const ids = Object.keys(items);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const item = items[id];
    const definition: ItemDefinition = { id: item.id, maxStack: item.maxStack };
    if (item.equipSlot !== undefined) {
      definition.equipSlot = item.equipSlot;
    }
    if (item.attackBonus !== undefined) {
      definition.attackBonus = item.attackBonus;
    }
    map[id] = definition;
  }
  return map;
}

export function countItem(inventory: PlayerInventory | undefined, itemId: string): number {
  if (inventory === undefined || itemId.length === 0) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId === itemId) {
      total += inventory.items[i].quantity;
    }
  }
  return total;
}

export function consumeItem(inventory: PlayerInventory, itemId: string, quantity: number): PlayerInventory | null {
  if (quantity <= 0) {
    return cloneInventory(inventory);
  }
  if (countItem(inventory, itemId) < quantity) {
    return null;
  }
  const next = cloneInventory(inventory);
  let remaining = quantity;
  const kept: ItemInstance[] = [];
  for (let i = 0; i < next.items.length; i++) {
    const stack = next.items[i];
    if (stack.itemId !== itemId || remaining <= 0) {
      kept.push(stack);
      continue;
    }
    if (stack.quantity > remaining) {
      stack.quantity -= remaining;
      remaining = 0;
      kept.push(stack);
      continue;
    }
    remaining -= stack.quantity;
  }
  next.items = kept;
  return next;
}

export function findItem(inventory: PlayerInventory | undefined, instanceId: string): ItemInstance | null {
  if (inventory === undefined || instanceId.length === 0) {
    return null;
  }
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].instanceId === instanceId) {
      return inventory.items[i];
    }
  }
  return null;
}

export function occupiedSlots(inventory: PlayerInventory): number {
  return inventory.items.length;
}

export function canAcceptItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
): boolean {
  if (quantity <= 0) {
    return false;
  }
  const maxStack = definition.maxStack < 1 ? 1 : definition.maxStack;
  let remaining = quantity;
  for (let i = 0; i < inventory.items.length; i++) {
    const stack = inventory.items[i];
    if (stack.itemId !== itemId) {
      continue;
    }
    const free = maxStack - stack.quantity;
    if (free > 0) {
      remaining -= Math.min(free, remaining);
      if (remaining <= 0) {
        return true;
      }
    }
  }
  const extraSlots = Math.ceil(remaining / maxStack);
  return occupiedSlots(inventory) + extraSlots <= inventory.capacity;
}

export function addOrStackItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  instanceId: string,
  definition: ItemDefinition,
): PlayerInventory {
  const next = cloneInventory(inventory);
  const maxStack = definition.maxStack < 1 ? 1 : definition.maxStack;
  let remaining = quantity;
  for (let i = 0; i < next.items.length; i++) {
    const stack = next.items[i];
    if (stack.itemId !== itemId) {
      continue;
    }
    const free = maxStack - stack.quantity;
    if (free <= 0) {
      continue;
    }
    const added = Math.min(free, remaining);
    stack.quantity += added;
    remaining -= added;
    if (remaining <= 0) {
      return next;
    }
  }
  let usedStarterId = false;
  while (remaining > 0) {
    const take = Math.min(maxStack, remaining);
    next.items.push({
      instanceId: usedStarterId ? instanceId + "-" + String(next.items.length) : instanceId,
      itemId: itemId,
      quantity: take,
      metadata: {},
    });
    usedStarterId = true;
    remaining -= take;
  }
  return next;
}

export function rememberPickup(
  inventory: PlayerInventory,
  requestId: string,
  record: PickupRecord,
): PlayerInventory {
  const next = cloneInventory(inventory);
  next.pickupByRequestId[requestId] = {
    ok: record.ok,
    code: record.code,
    lootId: record.lootId,
  };
  return next;
}

export function publicInventory(inventory: PlayerInventory): { [key: string]: unknown } {
  const items: { [key: string]: unknown }[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    items.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      quantity: item.quantity,
      metadata: cloneMetadata(item.metadata),
    });
  }
  return {
    capacity: inventory.capacity,
    items: items,
  };
}

function cloneItem(item: ItemInstance): ItemInstance {
  return {
    instanceId: item.instanceId,
    itemId: item.itemId,
    quantity: item.quantity,
    metadata: cloneMetadata(item.metadata),
  };
}

function cloneMetadata(metadata: { [key: string]: unknown }): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  const keys = Object.keys(metadata);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = metadata[keys[i]];
  }
  return copy;
}
