import {
  INVENTORY_CAPACITY,
  cloneInventory,
  cloneItem,
  effectiveMaxStack,
  stackIdentitiesMatch,
  stacksAreCompatible,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { cloneEquipment, emptyEquipment, type PlayerEquipment } from "./equipment";
import { cloneOverflow, emptyOverflow, isOverflowEmpty, type MigrationOverflow } from "./overflow";

export interface ItemContainerMigrationResult {
  inventory: PlayerInventory;
  equipment: PlayerEquipment;
  overflow: MigrationOverflow;
  changed: boolean;
  deleteOverflow: boolean;
}

export function migrateItemContainers(
  inventory: PlayerInventory | null | undefined,
  equipment: PlayerEquipment | null | undefined,
  overflow: MigrationOverflow | null | undefined,
  itemsById: { [id: string]: ItemDefinition },
): ItemContainerMigrationResult {
  const bag = inventory != null ? cloneInventory(inventory) : cloneInventory({
    capacity: INVENTORY_CAPACITY,
    items: [],
    revision: 0,
    pickupByRequestId: {},
  });
  const gear = equipment != null ? cloneEquipment(equipment) : emptyEquipment();
  const recovered = overflow != null ? cloneOverflow(overflow) : emptyOverflow();
  const before = snapshot(bag, gear, recovered);

  extractEquippedFromBag(bag, gear);
  mergeCompatibleBagStacks(bag, itemsById);
  const leftover = placeBagStacks(bag);
  for (let i = 0; i < leftover.length; i++) {
    recovered.items.push(cloneItem(leftover[i]));
  }
  bag.capacity = INVENTORY_CAPACITY;
  if (gear.items === undefined) {
    gear.items = [];
  }
  if (typeof gear.revision !== "number") {
    gear.revision = 0;
  }
  const after = snapshot(bag, gear, recovered);
  const changed = before !== after;
  if (changed) {
    bag.revision += 1;
    gear.revision += 1;
    if (leftover.length > 0 || recovered.items.length > 0) {
      recovered.revision += 1;
    }
  }
  return {
    inventory: bag,
    equipment: gear,
    overflow: recovered,
    changed: changed,
    deleteOverflow: isOverflowEmpty(recovered),
  };
}

function extractEquippedFromBag(bag: PlayerInventory, gear: PlayerEquipment): void {
  if (gear.items === undefined) {
    gear.items = [];
  }
  const equippedIds: { [id: string]: boolean } = {};
  const tags = Object.keys(gear.slots);
  for (let t = 0; t < tags.length; t++) {
    const id = gear.slots[tags[t]];
    if (id.length > 0) {
      equippedIds[id] = true;
    }
  }
  const already: { [id: string]: boolean } = {};
  for (let e = 0; e < gear.items.length; e++) {
    already[gear.items[e].instanceId] = true;
  }
  const kept: ItemInstance[] = [];
  for (let i = 0; i < bag.items.length; i++) {
    const item = bag.items[i];
    if (equippedIds[item.instanceId] === true) {
      if (already[item.instanceId] !== true) {
        const moved = cloneItem(item);
        moved.slotIndex = -1;
        gear.items.push(moved);
        already[item.instanceId] = true;
      }
      continue;
    }
    kept.push(item);
  }
  bag.items = kept;
  const validItems: ItemInstance[] = [];
  const present: { [id: string]: boolean } = {};
  for (let i = 0; i < gear.items.length; i++) {
    present[gear.items[i].instanceId] = true;
    validItems.push(gear.items[i]);
  }
  gear.items = validItems;
  for (let t = 0; t < tags.length; t++) {
    const id = gear.slots[tags[t]];
    if (id.length > 0 && present[id] !== true) {
      gear.slots[tags[t]] = "";
    }
  }
}

function mergeCompatibleBagStacks(bag: PlayerInventory, itemsById: { [id: string]: ItemDefinition }): void {
  const order: ItemInstance[] = bag.items.slice();
  order.sort(function (a, b) {
    return a.slotIndex - b.slotIndex;
  });
  const kept: ItemInstance[] = [];
  const consumed: { [id: string]: boolean } = {};
  for (let i = 0; i < order.length; i++) {
    const dest = order[i];
    if (consumed[dest.instanceId] === true) {
      continue;
    }
    const definition = itemsById[dest.itemId];
    if (definition === undefined) {
      kept.push(dest);
      continue;
    }
    for (let j = i + 1; j < order.length; j++) {
      const source = order[j];
      if (consumed[source.instanceId] === true) {
        continue;
      }
      if (!stackIdentitiesMatch(dest, source)) {
        continue;
      }
      if (stacksAreCompatible(dest, source, definition)) {
        dest.quantity += source.quantity;
        dest.version += 1;
        consumed[source.instanceId] = true;
        continue;
      }
      const maxStack = effectiveMaxStack(definition);
      const free = maxStack - dest.quantity;
      if (free <= 0) {
        continue;
      }
      const moved = Math.min(free, source.quantity);
      dest.quantity += moved;
      dest.version += 1;
      source.quantity -= moved;
      if (source.quantity <= 0) {
        consumed[source.instanceId] = true;
      }
    }
    kept.push(dest);
  }
  bag.items = kept;
}

function placeBagStacks(bag: PlayerInventory): ItemInstance[] {
  const used: { [index: number]: boolean } = {};
  const placed: ItemInstance[] = [];
  const invalid: ItemInstance[] = [];
  for (let i = 0; i < bag.items.length; i++) {
    const item = bag.items[i];
    const slot = item.slotIndex;
    if (
      typeof slot === "number" &&
      slot === Math.floor(slot) &&
      slot >= 0 &&
      slot < INVENTORY_CAPACITY &&
      used[slot] !== true
    ) {
      used[slot] = true;
      placed.push(item);
      continue;
    }
    invalid.push(item);
  }
  const overflow: ItemInstance[] = [];
  for (let r = 0; r < invalid.length; r++) {
    let nextSlot = -1;
    for (let slot = 0; slot < INVENTORY_CAPACITY; slot++) {
      if (used[slot] !== true) {
        nextSlot = slot;
        break;
      }
    }
    if (nextSlot < 0) {
      const extra = cloneItem(invalid[r]);
      extra.slotIndex = -1;
      overflow.push(extra);
      continue;
    }
    invalid[r].slotIndex = nextSlot;
    used[nextSlot] = true;
    placed.push(invalid[r]);
  }
  bag.items = placed;
  bag.capacity = INVENTORY_CAPACITY;
  return overflow;
}

function snapshot(bag: PlayerInventory, gear: PlayerEquipment, overflow: MigrationOverflow): string {
  const bagIds: string[] = [];
  for (let i = 0; i < bag.items.length; i++) {
    bagIds.push(bag.items[i].instanceId + "@" + String(bag.items[i].slotIndex) + "x" + String(bag.items[i].quantity));
  }
  const gearIds: string[] = [];
  const tags = Object.keys(gear.slots);
  tags.sort();
  for (let t = 0; t < tags.length; t++) {
    gearIds.push(tags[t] + "=" + gear.slots[tags[t]]);
  }
  const overflowIds: string[] = [];
  for (let o = 0; o < overflow.items.length; o++) {
    overflowIds.push(overflow.items[o].instanceId);
  }
  return (
    "c" +
    String(bag.capacity) +
    "|b" +
    bagIds.join(",") +
    "|e" +
    gearIds.join(",") +
    "|n" +
    String(gear.items !== undefined ? gear.items.length : 0) +
    "|o" +
    overflowIds.join(",")
  );
}
