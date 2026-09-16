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
import { vendorDefinitionsFromContent } from "../src/domain/vendor";
import {
  addOrStackItem,
  emptyInventory,
  itemDefinitionsFromContent,
  type PlayerInventory,
} from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

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
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_BUY,
      raw: envelope({ npcId: "npc.test_vendor", itemId: "item.test_potion", requestId: "req-buy-potion01" }),
      userId: "user-alice",
    },
  ]);
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
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_BUY,
      raw: envelope({ npcId: "npc.test_vendor", itemId: "item.test_potion", requestId: "req-buy-poor0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "insufficient_gold");
});

test("vendor buy into a full inventory is rejected", () => {
  const vendor = vendorPos();
  const items = itemDefinitionsFromContent(content.items);
  const inventory = addOrStackItem(emptyInventory(1), "item.test_pebble", 1, "pebble-full", items["item.test_pebble"]);
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 50, inventory));
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_BUY,
      raw: envelope({ npcId: "npc.test_vendor", itemId: "item.training_sword", requestId: "req-buy-full0001" }),
      userId: "user-alice",
    },
  ]);
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

test("vendor buy is idempotent for the same request id", () => {
  const vendor = vendorPos();
  const state = addPlayer(serviceZone(), playerAt(vendor.x, vendor.y, 20));
  const first = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_BUY,
      raw: envelope({ npcId: "npc.test_vendor", itemId: "item.test_potion", requestId: "req-buy-idem0001" }),
      userId: "user-alice",
    },
  ]);
  const replay = applyMatchLoop(first.state, 3, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_BUY,
      raw: envelope({ npcId: "npc.test_vendor", itemId: "item.test_potion", requestId: "req-buy-idem0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(replay)[0].ok, true);
  assert.equal(replay.state.players["user-alice"].gold, 10);
});
