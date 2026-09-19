import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  emptyPurgeJob,
  nextPurgeStep,
  PURGE_STEPS,
  withCompletedPurgeStep,
} from "../src/domain/character_purge";
import {
  applyEquip,
  derivedAttack,
  emptyEquipment,
  findEquippedItem,
  MAIN_HAND_SLOT,
  type PlayerEquipment,
} from "../src/domain/equipment";
import {
  INVENTORY_CAPACITY,
  ITEM_MAX_STACK,
  acceptItemFailureCode,
  addOrStackItem,
  applyDestroyItem,
  applyMoveItem,
  applySplitStack,
  cloneInventory,
  effectiveMaxStack,
  emptyInventory,
  findItem,
  firstEmptySlotIndex,
  itemDefinitionsFromContent,
  makeInstance,
  occupiedSlots,
  stacksAreCompatible,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "../src/domain/inventory";
import { migrateItemContainers } from "../src/domain/item_migration";
import { applyRecoverOverflow, emptyOverflow, isOverflowEmpty } from "../src/domain/overflow";

function itemsById() {
  return itemDefinitionsFromContent(content.items);
}

function bagOf(items: ItemInstance[], capacity = INVENTORY_CAPACITY): PlayerInventory {
  const inventory = emptyInventory(capacity);
  inventory.items = items;
  return inventory;
}

function swordDef(): ItemDefinition {
  return itemsById()["item.training_sword"];
}

function gelDef(): ItemDefinition {
  return itemsById()["item.slime_gel"];
}

function fillSwords(count: number, capacity = INVENTORY_CAPACITY): PlayerInventory {
  let inventory = emptyInventory(capacity);
  for (let i = 0; i < count; i++) {
    inventory = addOrStackItem(inventory, "item.training_sword", 1, "sword-" + String(i), swordDef());
  }
  return inventory;
}

function equipInput(
  inventory: PlayerInventory,
  equipment: PlayerEquipment,
  extras: {
    instanceId?: string;
    unequip?: boolean;
    requestId?: string;
    slot?: string;
  } = {},
) {
  return {
    playerHealth: 100,
    userId: "user-alice",
    instanceId: extras.instanceId !== undefined ? extras.instanceId : "",
    slot: extras.slot !== undefined ? extras.slot : MAIN_HAND_SLOT,
    requestId: extras.requestId !== undefined ? extras.requestId : "req-equip-1",
    equipment: equipment,
    inventory: inventory,
    itemsById: itemsById(),
    baseAttack: content.player.attack,
    owners: [{ userId: "user-alice", inventory: inventory, equipment: equipment }],
    unequip: extras.unequip === true,
  };
}

test("empty bag has exactly 30 slots and no stacks", () => {
  const inventory = emptyInventory();
  assert.equal(inventory.capacity, 30);
  assert.equal(INVENTORY_CAPACITY, 30);
  assert.equal(inventory.items.length, 0);
  assert.equal(occupiedSlots(inventory), 0);
  assert.equal(firstEmptySlotIndex(inventory), 0);
  assert.equal(inventory.revision, 0);
});

test("valid bag slot indices are 0 through 29", () => {
  const inventory = fillSwords(30);
  assert.equal(inventory.items.length, 30);
  const used: { [slot: number]: boolean } = {};
  for (let i = 0; i < inventory.items.length; i++) {
    const slot = inventory.items[i].slotIndex;
    assert.equal(slot >= 0 && slot <= 29, true);
    assert.equal(used[slot], undefined);
    used[slot] = true;
  }
  assert.equal(firstEmptySlotIndex(inventory), -1);
  const overflow = addOrStackItem(inventory, "item.training_sword", 1, "sword-31", swordDef());
  assert.equal(overflow.items.length, 30);
  assert.equal(acceptItemFailureCode(inventory, "item.training_sword", 1, swordDef()), "inventory_full");
});

test("non-equippable stacks cap at 99", () => {
  const bulk: ItemDefinition = { id: "item.bulk_test", maxStack: 200 };
  assert.equal(effectiveMaxStack(bulk), ITEM_MAX_STACK);
  assert.equal(ITEM_MAX_STACK, 99);
  let inventory = addOrStackItem(emptyInventory(), "item.bulk_test", 99, "bulk-1", bulk);
  assert.equal(inventory.items.length, 1);
  assert.equal(inventory.items[0].quantity, 99);
  inventory = addOrStackItem(inventory, "item.bulk_test", 1, "bulk-2", bulk);
  assert.equal(inventory.items.length, 2);
  assert.equal(inventory.items[0].quantity, 99);
  assert.equal(inventory.items[1].quantity, 1);
});

test("equippable items have maximum stack 1", () => {
  assert.equal(effectiveMaxStack(swordDef()), 1);
  const inventory = addOrStackItem(emptyInventory(), "item.training_sword", 2, "sword-a", swordDef());
  assert.equal(inventory.items.length, 2);
  assert.equal(inventory.items[0].quantity, 1);
  assert.equal(inventory.items[1].quantity, 1);
});

test("canonical stack compatibility requires matching definition, stack key, metadata, and unlocked stacks", () => {
  const gel = gelDef();
  const left = makeInstance("gel-a", "item.slime_gel", 2, 0);
  const right = makeInstance("gel-b", "item.slime_gel", 3, 1);
  assert.equal(stacksAreCompatible(left, right, gel), true);
  const otherDef = makeInstance("sword-a", "item.training_sword", 1, 2);
  assert.equal(stacksAreCompatible(left, otherDef, gel), false);
  const keyed = makeInstance("gel-c", "item.slime_gel", 2, 3, { stackKey: "seal" });
  assert.equal(stacksAreCompatible(left, keyed, gel), false);
  const locked = makeInstance("gel-d", "item.slime_gel", 2, 4);
  locked.lockType = "trade";
  locked.lockReason = "trade";
  locked.lockId = "trade-1";
  assert.equal(stacksAreCompatible(left, locked, gel), false);
  const over = makeInstance("gel-e", "item.slime_gel", 19, 5);
  assert.equal(stacksAreCompatible(left, over, gel), false);
});

test("metadata-incompatible stacks do not merge", () => {
  const gel = gelDef();
  let inventory = addOrStackItem(emptyInventory(), "item.slime_gel", 2, "gel-meta-a", gel, {
    metadata: { mark: "a" },
  });
  inventory = addOrStackItem(inventory, "item.slime_gel", 3, "gel-meta-b", gel, {
    metadata: { mark: "b" },
  });
  assert.equal(inventory.items.length, 2);
  assert.equal(inventory.items[0].quantity, 2);
  assert.equal(inventory.items[1].quantity, 3);
  const moved = applyMoveItem({
    playerHealth: 100,
    inventory: inventory,
    instanceId: "gel-meta-b",
    toSlotIndex: inventory.items[0].slotIndex,
    requestId: "req-move-meta1",
    itemsById: itemsById(),
  });
  assert.equal(moved.ok, true);
  const after = moved.inventory.items.filter((item) => item.itemId === "item.slime_gel");
  assert.equal(after.length, 2);
});

test("compatible stacks merge and split without inventing client instance ids", () => {
  const gel = gelDef();
  let inventory = addOrStackItem(emptyInventory(), "item.slime_gel", 4, "gel-merge", gel);
  inventory = addOrStackItem(inventory, "item.slime_gel", 3, "gel-other", gel);
  assert.equal(inventory.items.length, 1);
  assert.equal(inventory.items[0].instanceId, "gel-merge");
  assert.equal(inventory.items[0].quantity, 7);
  const split = applySplitStack({
    playerHealth: 100,
    inventory: inventory,
    equippedInstanceIds: [],
    instanceId: "gel-merge",
    quantity: 2,
    requestId: "req-split-model1",
    itemsById: itemsById(),
    newId: function () {
      return "gel-split-server";
    },
  });
  assert.equal(split.ok, true);
  assert.equal(split.newInstanceId, "gel-split-server");
  const parts = split.inventory.items.filter((item) => item.itemId === "item.slime_gel");
  assert.equal(parts.length, 2);
  const original = parts.find((item) => item.instanceId === "gel-merge");
  const minted = parts.find((item) => item.instanceId === "gel-split-server");
  assert.equal(original !== undefined, true);
  assert.equal(minted !== undefined, true);
  if (original !== undefined && minted !== undefined) {
    assert.equal(original.quantity, 5);
    assert.equal(minted.quantity, 2);
    assert.equal(minted.sourceType, "split");
  }
});

test("equipped items leave the bag and keep affecting canonical attack", () => {
  const inventory = addOrStackItem(emptyInventory(), "item.training_sword", 1, "sword-eq", swordDef());
  const equipment = emptyEquipment();
  const equipped = applyEquip(equipInput(inventory, equipment, { instanceId: "sword-eq" }));
  assert.equal(equipped.ok, true);
  assert.equal(findItem(equipped.inventory, "sword-eq"), null);
  assert.equal(equipped.inventory.items.length, 0);
  assert.equal(findEquippedItem(equipped.equipment, "sword-eq")?.instanceId, "sword-eq");
  assert.equal(equipped.equipment.slots[MAIN_HAND_SLOT], "sword-eq");
  assert.equal(equipped.derivedAttack, content.player.attack + 2);
  assert.equal(
    derivedAttack(content.player.attack, equipped.equipment, equipped.inventory, itemsById()),
    content.player.attack + 2,
  );
});

test("unequip returns the item to a free bag slot", () => {
  const inventory = addOrStackItem(emptyInventory(), "item.training_sword", 1, "sword-back", swordDef());
  const equipped = applyEquip(equipInput(inventory, emptyEquipment(), { instanceId: "sword-back" }));
  const result = applyEquip(
    equipInput(equipped.inventory, equipped.equipment, { unequip: true, requestId: "req-unequip-1" }),
  );
  assert.equal(result.ok, true);
  assert.equal(findItem(result.inventory, "sword-back")?.instanceId, "sword-back");
  assert.equal(result.equipment.slots[MAIN_HAND_SLOT], "");
  assert.equal(result.equipment.items.length, 0);
  assert.equal(result.derivedAttack, content.player.attack);
  assert.equal(result.inventory.items[0].slotIndex >= 0, true);
});

test("unequip into a full bag is rejected without mutation", () => {
  let inventory = fillSwords(30);
  const instanceId = inventory.items[0].instanceId;
  const equipped = applyEquip(equipInput(inventory, emptyEquipment(), { instanceId: instanceId }));
  assert.equal(equipped.ok, true);
  const filled = addOrStackItem(equipped.inventory, "item.training_sword", 1, "sword-fill", swordDef());
  assert.equal(filled.items.length, 30);
  const bagBefore = cloneInventory(filled);
  const gearBefore = JSON.stringify(equipped.equipment.slots);
  const result = applyEquip(
    equipInput(filled, equipped.equipment, { unequip: true, requestId: "req-unequip-full" }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "inventory_full");
  assert.equal(result.persist, false);
  assert.equal(result.equipment.slots[MAIN_HAND_SLOT], instanceId);
  assert.equal(findEquippedItem(result.equipment, instanceId)?.instanceId, instanceId);
  assert.equal(findItem(result.inventory, instanceId), null);
  assert.equal(result.inventory.items.length, bagBefore.items.length);
  assert.equal(JSON.stringify(result.equipment.slots), gearBefore);
});

test("migration under 30 stacks expands capacity to 30 without compacting holes", () => {
  const gel = gelDef();
  const inventory = bagOf(
    [
      makeInstance("keep-0", "item.slime_gel", 2, 0, { sourceType: "quest", sourceId: "quest.slime_problem" }),
      makeInstance("keep-7", "item.slime_gel", 1, 7, { metadata: { note: "keep" } }),
      makeInstance("keep-19", "item.training_sword", 1, 19),
    ],
    20,
  );
  const result = migrateItemContainers(inventory, emptyEquipment(), emptyOverflow(), itemsById());
  assert.equal(result.changed, true);
  assert.equal(result.inventory.capacity, 30);
  assert.equal(result.inventory.items.length, 3);
  assert.equal(result.deleteOverflow, true);
  assert.equal(isOverflowEmpty(result.overflow), true);
  assert.equal(findItem(result.inventory, "keep-0")?.slotIndex, 0);
  assert.equal(findItem(result.inventory, "keep-7")?.slotIndex, 7);
  assert.equal(findItem(result.inventory, "keep-19")?.slotIndex, 19);
  assert.equal(findItem(result.inventory, "keep-0")?.sourceType, "quest");
  assert.equal(findItem(result.inventory, "keep-7")?.metadata.note, "keep");
  assert.equal(gel.maxStack, 20);
});

test("migration over 30 stacks preserves excess in MigrationOverflow", () => {
  const inventory = fillSwords(31, 40);
  const ids = inventory.items.map((item) => item.instanceId).sort();
  const result = migrateItemContainers(inventory, emptyEquipment(), emptyOverflow(), itemsById());
  assert.equal(result.inventory.capacity, 30);
  assert.equal(result.inventory.items.length, 30);
  assert.equal(result.overflow.items.length, 1);
  assert.equal(result.deleteOverflow, false);
  const migratedIds = result.inventory.items
    .map((item) => item.instanceId)
    .concat(result.overflow.items.map((item) => item.instanceId))
    .sort();
  assert.deepEqual(migratedIds, ids);
  assert.equal(result.inventory.items.some((item) => item.instanceId === result.overflow.items[0].instanceId), false);
});

test("overflow recovery moves a stack into free bag capacity and deletes empty overflow", () => {
  const migrated = migrateItemContainers(fillSwords(31, 40), emptyEquipment(), emptyOverflow(), itemsById());
  const extraId = migrated.overflow.items[0].instanceId;
  const destroyed = applyDestroyItem({
    playerHealth: 100,
    inventory: migrated.inventory,
    equippedInstanceIds: [],
    instanceId: migrated.inventory.items[0].instanceId,
    requestId: "req-destroy-space",
    itemsById: itemsById(),
  });
  assert.equal(destroyed.ok, true);
  const recovered = applyRecoverOverflow({
    playerHealth: 100,
    inventory: destroyed.inventory,
    overflow: migrated.overflow,
    instanceId: extraId,
    requestId: "req-recover-1",
    itemsById: itemsById(),
  });
  assert.equal(recovered.ok, true);
  assert.equal(findItem(recovered.inventory, extraId)?.instanceId, extraId);
  assert.equal(isOverflowEmpty(recovered.overflow), true);
  assert.equal(recovered.deleteOverflow, true);
  const replay = applyRecoverOverflow({
    playerHealth: 100,
    inventory: recovered.inventory,
    overflow: recovered.overflow,
    instanceId: extraId,
    requestId: "req-recover-1",
    itemsById: itemsById(),
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.replay, true);
  assert.equal(replay.persist, false);
});

test("overflow is not extra storage for rewards or a second full-bag recover", () => {
  const migrated = migrateItemContainers(fillSwords(31, 40), emptyEquipment(), emptyOverflow(), itemsById());
  assert.equal(acceptItemFailureCode(migrated.inventory, "item.slime_gel", 1, gelDef()), "inventory_full");
  const blocked = applyRecoverOverflow({
    playerHealth: 100,
    inventory: migrated.inventory,
    overflow: migrated.overflow,
    instanceId: migrated.overflow.items[0].instanceId,
    requestId: "req-recover-full",
    itemsById: itemsById(),
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code === "inventory_full" || blocked.code === "invalid_slot", true);
  assert.equal(blocked.persist, false);
  assert.equal(migrated.overflow.items.length, 1);
  assert.equal(migrated.inventory.items.length, 30);
});

test("repeated migration is idempotent and does not duplicate stacks", () => {
  const inventory = fillSwords(31, 40);
  const first = migrateItemContainers(inventory, emptyEquipment(), emptyOverflow(), itemsById());
  const second = migrateItemContainers(first.inventory, first.equipment, first.overflow, itemsById());
  assert.equal(second.changed, false);
  assert.equal(second.inventory.items.length, first.inventory.items.length);
  assert.equal(second.overflow.items.length, first.overflow.items.length);
  assert.deepEqual(
    second.inventory.items.map((item) => item.instanceId + "@" + String(item.slotIndex)).sort(),
    first.inventory.items.map((item) => item.instanceId + "@" + String(item.slotIndex)).sort(),
  );
  assert.deepEqual(
    second.overflow.items.map((item) => item.instanceId).sort(),
    first.overflow.items.map((item) => item.instanceId).sort(),
  );
});

test("compatible legacy stacks merge on migration; equipment and metadata do not", () => {
  const gel = gelDef();
  const bag = bagOf(
    [
      makeInstance("gel-left", "item.slime_gel", 8, 0),
      makeInstance("gel-right", "item.slime_gel", 5, 3),
      makeInstance("gel-meta", "item.slime_gel", 2, 4, { metadata: { seal: "x" } }),
      makeInstance("sword-worn", "item.training_sword", 1, 1),
    ],
    20,
  );
  const equipment = emptyEquipment();
  equipment.slots[MAIN_HAND_SLOT] = "sword-worn";
  const result = migrateItemContainers(bag, equipment, emptyOverflow(), itemsById());
  const gels = result.inventory.items.filter((item) => item.itemId === "item.slime_gel");
  assert.equal(gels.length, 2);
  const merged = gels.find((item) => item.instanceId === "gel-left");
  const sealed = gels.find((item) => item.instanceId === "gel-meta");
  assert.equal(merged !== undefined, true);
  assert.equal(sealed !== undefined, true);
  if (merged !== undefined) {
    assert.equal(merged.quantity, 13);
    assert.equal(merged.slotIndex, 0);
  }
  assert.equal(findItem(result.inventory, "sword-worn"), null);
  assert.equal(findEquippedItem(result.equipment, "sword-worn")?.instanceId, "sword-worn");
  assert.equal(result.equipment.slots[MAIN_HAND_SLOT], "sword-worn");
  assert.equal(effectiveMaxStack(gel), 20);
});

test("character restore keeps overflow; account deletion purges it", () => {
  const overflow = migrateItemContainers(fillSwords(31, 40), emptyEquipment(), emptyOverflow(), itemsById()).overflow;
  assert.equal(overflow.items.length, 1);
  const restored = migrateItemContainers(fillSwords(30), emptyEquipment(), overflow, itemsById());
  assert.equal(restored.overflow.items.length, 1);
  assert.equal(restored.overflow.items[0].instanceId, overflow.items[0].instanceId);
  assert.equal(PURGE_STEPS.indexOf("overflow") !== -1, true);
  let job = emptyPurgeJob("char-alice", "user-alice", 1);
  assert.equal(nextPurgeStep(job), "inventory");
  job = withCompletedPurgeStep(job, "inventory", 2);
  job = withCompletedPurgeStep(job, "equipment", 3);
  assert.equal(nextPurgeStep(job), "overflow");
  job = withCompletedPurgeStep(job, "overflow", 4);
  assert.equal(nextPurgeStep(job), "progression");
});

test("equipment stat recalculation follows equip and unequip", () => {
  const inventory = addOrStackItem(emptyInventory(), "item.training_sword", 1, "sword-stat", swordDef());
  const equipped = applyEquip(equipInput(inventory, emptyEquipment(), { instanceId: "sword-stat", requestId: "req-stat-on" }));
  assert.equal(equipped.derivedAttack, content.player.attack + 2);
  const unequipped = applyEquip(
    equipInput(equipped.inventory, equipped.equipment, { unequip: true, requestId: "req-stat-off" }),
  );
  assert.equal(unequipped.derivedAttack, content.player.attack);
});
