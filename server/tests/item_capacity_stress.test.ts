import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import { planCapacity, planTwoWayTrade } from "../src/domain/item_capacity";
import {
  INVENTORY_CAPACITY,
  emptyInventory,
  itemDefinitionsFromContent,
  makeInstance,
  type PlayerInventory,
} from "../src/domain/inventory";
import { GRANT_SOURCE_QUEST_REWARD, grantItemFromSource } from "../src/domain/item_grant";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { applyVendorBuy, stockEntryIdFor, vendorDefinitionsFromContent } from "../src/domain/vendor";

function defs() {
  return itemDefinitionsFromContent(content.items);
}

function fillUnique(count: number): PlayerInventory {
  const inventory = emptyInventory();
  for (let i = 0; i < count; i++) {
    inventory.items.push(makeInstance("u-" + String(i), "item.training_sword", 1, i));
  }
  return inventory;
}

test("thirty occupied slots with merge capacity still grant", () => {
  const inventory = emptyInventory();
  for (let i = 0; i < INVENTORY_CAPACITY; i++) {
    inventory.items.push(makeInstance("peb-" + String(i), "item.test_pebble", 1, i));
  }
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: "item.test_pebble", quantity: 4 }],
    definitions: defs(),
    operationMode: "grant",
  });
  assert.equal(plan.fits, true);
});

test("thirty occupied slots without merge capacity reject", () => {
  const plan = planCapacity({
    inventory: fillUnique(INVENTORY_CAPACITY),
    incoming: [{ itemId: "item.test_pebble", quantity: 1 }],
    definitions: defs(),
    operationMode: "grant",
  });
  assert.equal(plan.fits, false);
  assert.equal(plan.failureCode, "inventory_full");
});

test("merchant purchase across several stacks is atomic", () => {
  const items = defs();
  const vendors = vendorDefinitionsFromContent(content.vendors);
  const npcs = npcDefinitionsFromContent(content.npcs);
  let n = 0;
  const bought = applyVendorBuy({
    playerHealth: 100,
    playerX: 1360,
    playerY: 1664,
    gold: 400,
    inventory: emptyInventory(),
    npcId: "npc.test_vendor",
    requestId: "req-multi-stack",
    npcs: [{ id: "npc.test_vendor", npcId: "npc.test_vendor", x: 1360, y: 1664 }],
    interactionRange: 48,
    npcById: npcs,
    vendorsById: vendors,
    itemsById: items,
    equippedInstanceIds: [],
    vendorId: "vendor.test_general",
    stockEntryId: stockEntryIdFor("vendor.test_general", "item.test_potion"),
    quantity: 25,
    newId: function () {
      n += 1;
      return "potion-m-" + String(n);
    },
  });
  assert.equal(bought.ok, true);
  assert.equal(bought.gold, 150);
  assert.equal(
    bought.inventory.items.filter(function (row) {
      return row.itemId === "item.test_potion";
    }).length,
    3,
  );
  const blocked = applyVendorBuy({
    playerHealth: 100,
    playerX: 1360,
    playerY: 1664,
    gold: 400,
    inventory: fillUnique(INVENTORY_CAPACITY),
    npcId: "npc.test_vendor",
    requestId: "req-multi-full",
    npcs: [{ id: "npc.test_vendor", npcId: "npc.test_vendor", x: 1360, y: 1664 }],
    interactionRange: 48,
    npcById: npcs,
    vendorsById: vendors,
    itemsById: items,
    equippedInstanceIds: [],
    vendorId: "vendor.test_general",
    stockEntryId: stockEntryIdFor("vendor.test_general", "item.test_potion"),
    quantity: 25,
    newId: function () {
      return "potion-full";
    },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.gold, 400);
  assert.equal(blocked.inventory.items.length, INVENTORY_CAPACITY);
});

test("trade outgoing stacks create room for several incoming types", () => {
  const items = defs();
  const alice = emptyInventory();
  for (let i = 0; i < INVENTORY_CAPACITY; i++) {
    alice.items.push(makeInstance("a-" + String(i), "item.test_pebble", 1, i));
  }
  const bob = emptyInventory();
  bob.items.push(makeInstance("potion-in", "item.test_potion", 2, 0));
  bob.items.push(makeInstance("cloth-in", "item.test_cloth", 1, 1));
  bob.items.push(makeInstance("sword-in", "item.training_sword", 1, 2));
  const plan = planTwoWayTrade({
    left: alice,
    right: bob,
    leftOffers: [
      { instanceId: "a-0", quantity: 1 },
      { instanceId: "a-1", quantity: 1 },
      { instanceId: "a-2", quantity: 1 },
    ],
    rightOffers: [
      { instanceId: "potion-in", quantity: 2 },
      { instanceId: "cloth-in", quantity: 1 },
      { instanceId: "sword-in", quantity: 1 },
    ],
    definitions: items,
  });
  assert.equal(plan.fits, true);
});

test("quest reward at full capacity grants nothing", () => {
  const result = grantItemFromSource({
    characterId: "char-ada",
    sourceType: GRANT_SOURCE_QUEST_REWARD,
    sourceId: "quest.slime_problem",
    itemDefinitionId: "item.training_sword",
    quantity: 1,
    eventId: "evt-stress-reward",
    inventory: fillUnique(INVENTORY_CAPACITY),
    definitions: defs(),
    newIds: function () {
      return "reward-1";
    },
    nowMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "inventory_full");
  assert.equal(result.consumedSource, false);
  assert.equal(result.inventory.items.length, INVENTORY_CAPACITY);
});
