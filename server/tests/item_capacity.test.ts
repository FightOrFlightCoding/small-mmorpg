import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCapacityPlan,
  planCapacity,
  planTwoWayTrade,
  type IncomingStack,
} from "../src/domain/item_capacity";
import {
  emptyInventory,
  makeInstance,
  type ItemDefinition,
  type PlayerInventory,
} from "../src/domain/inventory";
import { ITEM_ERROR_INVENTORY_FULL, ITEM_ERROR_INVALID_SLOT, ITEM_ERROR_STACK_FULL } from "../src/domain/item_errors";
import { acquireItemLock, ITEM_LOCK_TTL_MS } from "../src/domain/item_lock";

function mat(id: string, maxStack = 99): ItemDefinition {
  return { id: id, maxStack: maxStack, equippable: false };
}

function gear(id: string): ItemDefinition {
  return { id: id, maxStack: 1, equippable: true, equipmentSlotTags: ["main_hand"] };
}

function bag(items: Array<{ id: string; itemId: string; qty: number; slot: number; extra?: Partial<ReturnType<typeof makeInstance>> }>): PlayerInventory {
  const inventory = emptyInventory(30);
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const inst = makeInstance(row.id, row.itemId, row.qty, row.slot);
    inventory.items.push(inst);
  }
  return inventory;
}

function defs(...list: ItemDefinition[]): { [id: string]: ItemDefinition } {
  const map: { [id: string]: ItemDefinition } = {};
  for (let i = 0; i < list.length; i++) {
    map[list[i].id] = list[i];
  }
  return map;
}

test("compatible partial-stack fill uses the lowest slot index", () => {
  const inventory = bag([
    { id: "a", itemId: "item.ore", qty: 10, slot: 5 },
    { id: "b", itemId: "item.ore", qty: 10, slot: 1 },
  ]);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 4 }],
    definitions: defs(mat("item.ore")),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedMerges.length, 1);
  assert.equal(plan.plannedMerges[0].instanceId, "b");
  assert.equal(plan.plannedMerges[0].slotIndex, 1);
  assert.equal(plan.plannedMerges[0].quantityAfter, 14);
  assert.equal(plan.requiredNewInstanceIds, 0);
});

test("multiple partial stacks fill in slot order before opening a new stack", () => {
  const inventory = bag([
    { id: "a", itemId: "item.ore", qty: 90, slot: 0 },
    { id: "b", itemId: "item.ore", qty: 95, slot: 2 },
  ]);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 20 }],
    definitions: defs(mat("item.ore")),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedMerges.length, 2);
  assert.equal(plan.plannedMerges[0].instanceId, "a");
  assert.equal(plan.plannedMerges[0].quantityAdded, 9);
  assert.equal(plan.plannedMerges[1].instanceId, "b");
  assert.equal(plan.plannedMerges[1].quantityAdded, 4);
  assert.equal(plan.plannedNewStacks.length, 1);
  assert.equal(plan.plannedNewStacks[0].quantity, 7);
  assert.equal(plan.requiredNewInstanceIds, 1);
});

test("stack splitting places leftover in the first empty slot", () => {
  const inventory = emptyInventory(30);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 120 }],
    definitions: defs(mat("item.ore", 50)),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedNewStacks.length, 3);
  assert.equal(plan.plannedNewStacks[0].slotIndex, 0);
  assert.equal(plan.plannedNewStacks[0].quantity, 50);
  assert.equal(plan.plannedNewStacks[1].slotIndex, 1);
  assert.equal(plan.plannedNewStacks[2].slotIndex, 2);
  assert.equal(plan.plannedNewStacks[2].quantity, 20);
});

test("preferred slot overrides default empty-slot order when valid", () => {
  const inventory = bag([{ id: "sword", itemId: "item.training_sword", qty: 1, slot: 0 }]);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 3, preferredSlot: 7 }],
    definitions: defs(mat("item.ore"), gear("item.training_sword")),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedNewStacks[0].slotIndex, 7);
});

test("invalid preferred slot falls back unless strict", () => {
  const inventory = emptyInventory(30);
  const fallback = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 1, preferredSlot: 7 }],
    definitions: defs(mat("item.ore")),
    operationMode: "grant",
    preferredStrict: false,
  });
  assert.equal(fallback.fits, true);
  const strict = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 1, preferredSlot: 99 }],
    definitions: defs(mat("item.ore")),
    operationMode: "recover",
  });
  assert.equal(strict.fits, false);
  assert.equal(strict.failureCode, ITEM_ERROR_INVALID_SLOT);
});

test("first-empty fallback after partials are full", () => {
  const inventory = bag([{ id: "a", itemId: "item.ore", qty: 99, slot: 0 }]);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 2 }],
    definitions: defs(mat("item.ore")),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedMerges.length, 0);
  assert.equal(plan.plannedNewStacks[0].slotIndex, 1);
});

test("outgoing items free slots for incoming stacks", () => {
  const items: Array<{ id: string; itemId: string; qty: number; slot: number }> = [];
  for (let i = 0; i < 30; i++) {
    items.push({ id: "s" + String(i), itemId: "item.pebble", qty: 1, slot: i });
  }
  const inventory = bag(items);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 5 }],
    outgoing: [{ instanceId: "s29", quantity: 1 }],
    definitions: defs(mat("item.ore"), mat("item.pebble", 1)),
    operationMode: "trade",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedInstanceRetirements[0].retired, true);
  assert.equal(plan.plannedNewStacks[0].slotIndex, 29);
});

test("equipment-to-bag preserves instance id in the first empty slot", () => {
  const inventory = bag([{ id: "gel", itemId: "item.ore", qty: 2, slot: 0 }]);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [
      {
        itemId: "item.training_sword",
        quantity: 1,
        instanceId: "sword-1",
        sourceType: "equipment",
      },
    ],
    definitions: defs(gear("item.training_sword"), mat("item.ore")),
    operationMode: "unequip",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedNewStacks[0].instanceId, "sword-1");
  assert.equal(plan.plannedNewStacks[0].needsNewId, false);
  assert.equal(plan.plannedNewStacks[0].slotIndex, 1);
  const applied = applyCapacityPlan(inventory, plan, []);
  assert.equal(applied.items.some(function (item) { return item.instanceId === "sword-1" && item.slotIndex === 1; }), true);
});

test("two-way trade plan accounts for both outgoing and incoming", () => {
  const left = bag([{ id: "left-ore", itemId: "item.ore", qty: 10, slot: 0 }]);
  const right = bag([{ id: "right-gem", itemId: "item.gem", qty: 3, slot: 0 }]);
  const result = planTwoWayTrade({
    left: left,
    right: right,
    leftOffers: [{ instanceId: "left-ore", quantity: 4 }],
    rightOffers: [{ instanceId: "right-gem", quantity: 3 }],
    definitions: defs(mat("item.ore"), mat("item.gem", 20)),
  });
  assert.equal(result.fits, true);
  assert.equal(result.left.plannedInstanceRetirements[0].quantityRemoved, 4);
  assert.equal(result.left.plannedNewStacks[0].itemId, "item.gem");
  assert.equal(result.right.plannedNewStacks[0].itemId, "item.ore");
  assert.equal(result.right.plannedNewStacks[0].quantity, 4);
});

test("several incoming item types place independently", () => {
  const inventory = emptyInventory(30);
  const incoming: IncomingStack[] = [
    { itemId: "item.ore", quantity: 5 },
    { itemId: "item.gem", quantity: 2 },
    { itemId: "item.herb", quantity: 9 },
  ];
  const plan = planCapacity({
    inventory: inventory,
    incoming: incoming,
    definitions: defs(mat("item.ore"), mat("item.gem"), mat("item.herb")),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedNewStacks.length, 3);
  assert.equal(plan.plannedNewStacks[0].itemId, "item.ore");
  assert.equal(plan.plannedNewStacks[1].itemId, "item.gem");
  assert.equal(plan.plannedNewStacks[2].itemId, "item.herb");
});

test("full bag with an available partial stack still fits", () => {
  const items: Array<{ id: string; itemId: string; qty: number; slot: number }> = [];
  items.push({ id: "partial", itemId: "item.ore", qty: 50, slot: 0 });
  for (let i = 1; i < 30; i++) {
    items.push({ id: "full-" + String(i), itemId: "item.pebble", qty: 1, slot: i });
  }
  const inventory = bag(items);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 10 }],
    definitions: defs(mat("item.ore"), mat("item.pebble", 1)),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedMerges[0].instanceId, "partial");
  assert.equal(plan.plannedNewStacks.length, 0);
});

test("full bag without capacity fails inventory_full", () => {
  const items: Array<{ id: string; itemId: string; qty: number; slot: number }> = [];
  for (let i = 0; i < 30; i++) {
    items.push({ id: "s" + String(i), itemId: "item.pebble", qty: 1, slot: i });
  }
  const inventory = bag(items);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 1 }],
    definitions: defs(mat("item.ore"), mat("item.pebble", 1)),
    operationMode: "grant",
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.failureCode, ITEM_ERROR_INVENTORY_FULL);
  assert.equal(plan.remainingQuantities[0].quantity, 1);
});

test("strict preferred slot on a full compatible stack is stack_full", () => {
  const inventory = bag([{ id: "a", itemId: "item.ore", qty: 99, slot: 3 }]);
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 1, preferredSlot: 3 }],
    definitions: defs(mat("item.ore")),
    operationMode: "move",
    preferredStrict: true,
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.failureCode, ITEM_ERROR_STACK_FULL);
});

test("locked stacks are skipped as merge destinations", () => {
  let inventory = bag([
    { id: "locked", itemId: "item.ore", qty: 10, slot: 0 },
    { id: "open", itemId: "item.ore", qty: 10, slot: 1 },
  ]);
  inventory = acquireItemLock({
    inventory: inventory,
    instanceId: "locked",
    lockId: "trade-1",
    lockType: "TRADE",
    quantity: 4,
    ownerOperation: "trade",
    nowMs: 1000,
    ttlMs: ITEM_LOCK_TTL_MS,
  }).inventory;
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.ore", quantity: 5 }],
    definitions: defs(mat("item.ore")),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
  assert.equal(plan.plannedMerges[0].instanceId, "open");
});
