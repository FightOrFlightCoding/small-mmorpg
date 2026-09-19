import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  GRANT_SOURCE_ADMIN,
  GRANT_SOURCE_WORLD_INTERACTION,
  grantItemFromSource,
} from "../src/domain/item_grant";
import { ITEM_ERROR_INVENTORY_FULL } from "../src/domain/item_errors";
import {
  addOrStackItem,
  countItem,
  emptyInventory,
  itemDefinitionsFromContent,
  occupiedSlots,
} from "../src/domain/inventory";

const defs = itemDefinitionsFromContent(content.items);

function ids(prefix: string): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function fillBag(itemId: string, count: number) {
  let inventory = emptyInventory(30);
  for (let i = 0; i < count; i++) {
    inventory = addOrStackItem(inventory, itemId, 1, "fill-" + String(i), defs[itemId]);
  }
  return inventory;
}

test("GrantItemFromSource grants into the bag and audits", () => {
  const inventory = emptyInventory(30);
  const result = grantItemFromSource({
    characterId: "char-a",
    sourceType: GRANT_SOURCE_WORLD_INTERACTION,
    sourceId: "node.herb.1",
    itemDefinitionId: "item.test_pebble",
    quantity: 2,
    eventId: "evt-grant-1",
    inventory: inventory,
    definitions: defs,
    newIds: ids("g"),
    nowMs: 1000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.code, "ok");
  assert.equal(result.consumedSource, true);
  assert.equal(result.persist, true);
  assert.equal(countItem(result.inventory, "item.test_pebble"), 2);
  assert.equal(result.inventory.itemAudits !== undefined && result.inventory.itemAudits.length > 0, true);
});

test("duplicate grant eventId replays without a second grant", () => {
  const first = grantItemFromSource({
    characterId: "char-a",
    sourceType: GRANT_SOURCE_ADMIN,
    sourceId: "gm-1",
    itemDefinitionId: "item.test_pebble",
    quantity: 1,
    eventId: "evt-dup-1",
    inventory: emptyInventory(30),
    definitions: defs,
    newIds: ids("d1"),
    nowMs: 1000,
  });
  assert.equal(first.ok, true);
  const second = grantItemFromSource({
    characterId: "char-a",
    sourceType: GRANT_SOURCE_ADMIN,
    sourceId: "gm-1",
    itemDefinitionId: "item.test_pebble",
    quantity: 1,
    eventId: "evt-dup-1",
    inventory: first.inventory,
    definitions: defs,
    newIds: ids("d2"),
    nowMs: 2000,
  });
  assert.equal(second.ok, true);
  assert.equal(second.replay, true);
  assert.equal(second.persist, false);
  assert.equal(second.consumedSource, true);
  assert.equal(countItem(second.inventory, "item.test_pebble"), 1);
});

test("future grant that does not fit grants nothing and does not consume the source", () => {
  const inventory = fillBag("item.training_sword", 30);
  assert.equal(occupiedSlots(inventory), 30);
  const result = grantItemFromSource({
    characterId: "char-a",
    sourceType: GRANT_SOURCE_WORLD_INTERACTION,
    sourceId: "forage.1",
    itemDefinitionId: "item.test_pebble",
    quantity: 1,
    eventId: "evt-full-1",
    inventory: inventory,
    definitions: defs,
    newIds: ids("f"),
    nowMs: 1000,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, ITEM_ERROR_INVENTORY_FULL);
  assert.equal(result.consumedSource, false);
  assert.equal(result.persist, false);
  assert.equal(countItem(result.inventory, "item.test_pebble"), 0);
  assert.equal(occupiedSlots(result.inventory), 30);
  assert.match(result.message, /Need 1 free bag slot/);
});

test("unsupported grant sourceType is rejected", () => {
  const result = grantItemFromSource({
    characterId: "char-a",
    sourceType: "client_cheat",
    sourceId: "x",
    itemDefinitionId: "item.test_pebble",
    quantity: 1,
    eventId: "evt-bad-src",
    inventory: emptyInventory(30),
    definitions: defs,
    newIds: ids("b"),
    nowMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.consumedSource, false);
  assert.equal(result.code, "invalid_id");
});
