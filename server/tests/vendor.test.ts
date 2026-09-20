import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { vendorDefinitionsFromContent, vendorShopPresentation } from "../src/domain/vendor";
import {
  addOrStackItem,
  emptyInventory,
  itemDefinitionsFromContent,
  type PlayerInventory,
} from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { ClientOpcode, ServerOpcode } from "../src/domain/protocol";
import { buyMessage, envelope, openNpcSession } from "./npc_session";

function serviceZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    { "enemy.green_slime": { id: "enemy.green_slime", maxHealth: 20 } },
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

function playerAt(x: number, y: number, gold = 0, inventory?: PlayerInventory): MatchPlayer {
  return {
    userId: "user-alice",
    sessionId: "session-alice",
    username: "alice",
    characterId: "char-alice",
    name: "Alice",
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    gold: gold,
    inventory: inventory !== undefined ? inventory : emptyInventory(),
    equipment: emptyEquipment(),
  };
}

function vendorPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_vendor") as { x: number; y: number };
}

function actions(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string });
}

test("vendor buy grants the item at the server price", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-buy-open0001");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-buy-potion01")],
  );
  assert.equal(actions(result)[0].ok, true);
  assert.equal(result.state.players["user-alice"].gold, 10);
  const items = result.state.players["user-alice"].inventory !== undefined ? result.state.players["user-alice"].inventory.items : [];
  assert.equal(items.some((item) => item.itemId === "item.test_potion"), true);
});

test("vendor sell pays the server multiplier and rejects unsellable items", () => {
  const vendor = vendorPos();
  const items = itemDefinitionsFromContent(content.items);
  let inventory = addOrStackItem(emptyInventory(), "item.test_potion", 1, "potion-1", items["item.test_potion"]);
  inventory = addOrStackItem(inventory, "item.slime_gel", 1, "gel-1", items["item.slime_gel"]);
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 0, inventory));
  const sold = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_SELL,
      raw: envelope({ npcId: "npc.test_vendor", instanceId: "potion-1", requestId: "req-sell-potion1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(sold)[0].ok, true);
  assert.equal(sold.state.players["user-alice"].gold, 1);
  const blocked = applyMatchLoop(sold.state, 3, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_SELL,
      raw: envelope({ npcId: "npc.test_vendor", instanceId: "gel-1", requestId: "req-sell-gel0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(blocked)[0].ok, false);
  assert.equal(actions(blocked)[0].code, "unsellable");
});

test("vendor buy with insufficient gold is rejected", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 0));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-buy-pooropen");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-buy-poor0001")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "insufficient_gold");
});

test("vendor buy into a full inventory is rejected", () => {
  const vendor = vendorPos();
  const items = itemDefinitionsFromContent(content.items);
  const inventory = addOrStackItem(emptyInventory(1), "item.test_pebble", 1, "pebble-full", items["item.test_pebble"]);
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 50, inventory));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-buy-fullopen");
  const result = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.training_sword", opened.sessionId, opened.npcInstanceId, "req-buy-full0001")],
  );
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "inventory_full");
});

test("equipped items cannot be sold", () => {
  const vendor = vendorPos();
  const items = itemDefinitionsFromContent(content.items);
  const inventory = addOrStackItem(emptyInventory(), "item.training_sword", 1, "sword-eq", items["item.training_sword"]);
  const actor = playerAt(vendor.x, vendor.y, 0, inventory);
  actor.equipment = emptyEquipment();
  actor.equipment.slots.main_hand = "sword-eq";
  const state = addPlayer(serviceZone(), actor);
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_SELL,
      raw: envelope({ npcId: "npc.test_vendor", instanceId: "sword-eq", requestId: "req-sell-locked01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "item_locked");
});

test("vendor shop presentation survives missing quantity constraints", () => {
  const vendors = vendorDefinitionsFromContent(content.vendors);
  const npcs = npcDefinitionsFromContent(content.npcs);
  const shop = vendorShopPresentation(npcs["npc.qa_merchant"], vendors);
  assert.ok(shop !== undefined);
  assert.equal(shop.vendorId, "vendor.qa_general");
  assert.ok(shop.stock.length > 0);
  for (let i = 0; i < shop.stock.length; i++) {
    assert.equal(typeof shop.stock[i].quantityConstraints.min, "number");
    assert.equal(typeof shop.stock[i].quantityConstraints.max, "number");
    assert.ok(shop.stock[i].quantityConstraints.min >= 1);
  }
});

test("vendor buy is idempotent for the same request id", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-buy-idemopen");
  const first = applyMatchLoop(
    opened.state,
    2,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-buy-idem0001")],
  );
  const replay = applyMatchLoop(
    first.state,
    3,
    contentHash,
    [buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-buy-idem0001")],
  );
  assert.equal(actions(replay)[0].ok, true);
  assert.equal(replay.state.players["user-alice"].gold, 10);
});
