import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addOrStackItem,
  initializeInventory,
  itemDefinitionsFromContent,
  type PlayerInventory,
} from "../src/domain/inventory";
import {
  derivedAttack,
  emptyEquipment,
  loadEquipment,
  MAIN_HAND_SLOT,
} from "../src/domain/equipment";
import {
  EQUIPMENT_COLLECTION,
  EQUIPMENT_KEY,
  EQUIPMENT_PERMISSION_READ,
  EQUIPMENT_PERMISSION_WRITE,
  storedEquipmentFromValue,
  storedEquipmentWriteValue,
} from "../src/domain/equipment_store";
import { buildEquipmentWrite } from "../src/nakama/equipment_store";
import {
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";

function ids(prefix = "id"): () => string {
  let n = 0;
  return function () {
    n += 1;
    return prefix + "-" + String(n);
  };
}

function itemsById() {
  return itemDefinitionsFromContent(content.items);
}

function emptyZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemsById(),
  );
}

function swordBag(prefix = "sword"): PlayerInventory {
  return initializeInventory(null, ids(prefix)).inventory;
}

function bagWithGel(inventory: PlayerInventory): PlayerInventory {
  return addOrStackItem(inventory, "item.slime_gel", 1, "gel-1", itemsById()["item.slime_gel"]);
}

function playerAt(userId: string, name: string, inventory?: PlayerInventory): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: content.zones["zone.starter"].playerSpawn.x,
    y: content.zones["zone.starter"].playerSpawn.y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: inventory !== undefined ? inventory : swordBag(userId + "-sword"),
    equipment: emptyEquipment(),
    derivedAttack: content.player.attack,
  };
}

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function equip(userId: string, extra: { [key: string]: unknown }): Incoming {
  return {
    opcode: ClientOpcode.EQUIP,
    raw: envelope(extra),
    userId: userId,
  };
}

interface Incoming {
  opcode: number;
  raw: string;
  userId: string;
}

function actionCodes(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body));
}

function equipmentMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.EQUIPMENT_STATE)
    .map((item) => JSON.parse(item.body));
}

function swordId(state: StarterZoneState, userId: string): string {
  const inventory = state.players[userId].inventory;
  if (inventory === undefined) {
    return "";
  }
  return inventory.items[0].instanceId;
}

function gelId(state: StarterZoneState, userId: string): string {
  const inventory = state.players[userId].inventory;
  if (inventory === undefined) {
    return "";
  }
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId === "item.slime_gel") {
      return inventory.items[i].instanceId;
    }
  }
  return "";
}

function mainHand(state: StarterZoneState, userId: string): string {
  const equipment = state.players[userId].equipment;
  if (equipment === undefined) {
    return "";
  }
  return equipment.slots.main_hand;
}

test("equipment storage writes are server-only", () => {
  const equipment = emptyEquipment();
  equipment.slots.main_hand = "inst-sword";
  const write = buildEquipmentWrite("user-alice", equipment);
  assert.equal(write.collection, EQUIPMENT_COLLECTION);
  assert.equal(write.key, EQUIPMENT_KEY);
  assert.equal(write.userId, "user-alice");
  assert.equal(write.permissionRead, EQUIPMENT_PERMISSION_READ);
  assert.equal(write.permissionWrite, EQUIPMENT_PERMISSION_WRITE);
  assert.equal(write.permissionWrite, 0);
  const roundTrip = storedEquipmentFromValue(storedEquipmentWriteValue(equipment));
  assert.equal(roundTrip !== null, true);
  if (roundTrip !== null) {
    assert.equal(roundTrip.slots.main_hand, "inst-sword");
  }
});

test("equip owned training sword into main_hand", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice"));
  const instanceId = swordId(state, "user-alice");
  const result = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: instanceId, slot: MAIN_HAND_SLOT, requestId: "req-equip-sword1" }),
  ]);
  const actions = actionCodes(result);
  assert.equal(actions[0].ok, true);
  assert.equal(actions[0].code, "ok");
  assert.equal(mainHand(result.state, "user-alice"), instanceId);
  assert.equal(result.state.players["user-alice"].derivedAttack, content.player.attack + 2);
  assert.equal(result.persistEquipment.length, 1);
  const messages = equipmentMessages(result);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].slots.main_hand, instanceId);
  assert.equal(messages[0].derived.attack, content.player.attack + 2);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(result.outbound[0].body), "attack"), false);
});

test("equip unknown instance is invalid_id", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice"));
  const result = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: "does-not-exist", slot: MAIN_HAND_SLOT, requestId: "req-equip-unknown1" }),
  ]);
  const actions = actionCodes(result);
  assert.equal(actions[0].ok, false);
  assert.equal(actions[0].code, "invalid_id");
  assert.equal(mainHand(result.state, "user-alice"), "");
  assert.equal(result.persistEquipment.length, 0);
});

test("equip unowned instance is unowned", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice"));
  state = addPlayer(state, playerAt("user-bob", "Bob"));
  const bobSword = swordId(state, "user-bob");
  const result = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: bobSword, slot: MAIN_HAND_SLOT, requestId: "req-equip-unowned1" }),
  ]);
  const actions = actionCodes(result);
  assert.equal(actions[0].ok, false);
  assert.equal(actions[0].code, "unowned");
  assert.equal(mainHand(result.state, "user-alice"), "");
});

test("equip non-equippable slime gel is not_equippable", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", bagWithGel(swordBag("alice-sword"))));
  const result = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: gelId(state, "user-alice"), slot: MAIN_HAND_SLOT, requestId: "req-equip-gel1" }),
  ]);
  const actions = actionCodes(result);
  assert.equal(actions[0].ok, false);
  assert.equal(actions[0].code, "not_equippable");
});

test("equip into the wrong slot is invalid_slot", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice"));
  const result = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", {
      instanceId: swordId(state, "user-alice"),
      slot: "off_hand",
      requestId: "req-equip-wrong1",
    }),
  ]);
  const actions = actionCodes(result);
  assert.equal(actions[0].ok, false);
  assert.equal(actions[0].code, "invalid_slot");
});

test("duplicate equip requestId does not mutate again", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice"));
  const instanceId = swordId(state, "user-alice");
  const first = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: instanceId, slot: MAIN_HAND_SLOT, requestId: "req-equip-dup1" }),
  ]);
  const second = applyMatchLoop(first.state, 5, contentHash, [
    equip("user-alice", { instanceId: instanceId, slot: MAIN_HAND_SLOT, requestId: "req-equip-dup1" }),
  ]);
  assert.equal(actionCodes(second)[0].ok, true);
  assert.equal(actionCodes(second)[0].code, "ok");
  assert.equal(second.persistEquipment.length, 0);
  assert.equal(mainHand(second.state, "user-alice"), instanceId);
});

test("unequip clears the main-hand slot and restores base attack", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice"));
  const instanceId = swordId(state, "user-alice");
  const equipped = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: instanceId, slot: MAIN_HAND_SLOT, requestId: "req-equip-then-off1" }),
  ]);
  const result = applyMatchLoop(equipped.state, 5, contentHash, [
    equip("user-alice", { slot: MAIN_HAND_SLOT, requestId: "req-unequip-ok1" }),
  ]);
  assert.equal(actionCodes(result)[0].ok, true);
  assert.equal(mainHand(result.state, "user-alice"), "");
  assert.equal(result.state.players["user-alice"].derivedAttack, content.player.attack);
  assert.equal(result.persistEquipment.length, 1);
  assert.equal(equipmentMessages(result)[0].slots.main_hand, null);
  assert.equal(equipmentMessages(result)[0].derived.attack, content.player.attack);
});

test("derived attack is base plus main-hand bonus", () => {
  const inventory = swordBag();
  const equipment = emptyEquipment();
  equipment.slots.main_hand = inventory.items[0].instanceId;
  assert.equal(derivedAttack(content.player.attack, emptyEquipment(), inventory, itemsById()), content.player.attack);
  assert.equal(derivedAttack(content.player.attack, equipment, inventory, itemsById()), content.player.attack + 2);
});

test("combat uses recalculated derived attack after equip", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let alice = playerAt("user-alice", "Alice");
  alice.x = spawn.x;
  alice.y = spawn.y;
  let state = addPlayer(emptyZone(), alice);
  const instanceId = swordId(state, "user-alice");
  const equipped = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", { instanceId: instanceId, slot: MAIN_HAND_SLOT, requestId: "req-equip-hit1" }),
  ]);
  const before = equipped.state.enemies[0].health;
  const hit = applyMatchLoop(equipped.state, 20, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: equipped.state.enemies[0].id, requestId: "req-atk-derived1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(hit.state.enemies[0].health, before - (content.player.attack + 2));
});

test("reload with equipped item restores derived attack", () => {
  const inventory = swordBag();
  const instanceId = inventory.items[0].instanceId;
  const stored = emptyEquipment();
  stored.slots.main_hand = instanceId;
  stored.equipByRequestId["req-equip-reload1"] = {
    ok: true,
    code: "ok",
    slot: MAIN_HAND_SLOT,
    instanceId: instanceId,
  };
  const loaded = loadEquipment(stored, inventory);
  assert.equal(loaded.persist, false);
  const player = playerAt("user-alice", "Alice", inventory);
  player.equipment = loaded.equipment;
  player.derivedAttack = derivedAttack(content.player.attack, loaded.equipment, inventory, itemsById());
  const state = addPlayer(emptyZone(), player);
  const full = JSON.parse(buildFullState(state, 9, "user-alice"));
  assert.equal(full.equipment.slots.main_hand, instanceId);
  assert.equal(full.derived.attack, content.player.attack + 2);
});

test("equipped instance missing from inventory is cleared", () => {
  const inventory = swordBag();
  const stored = emptyEquipment();
  stored.slots.main_hand = "missing-instance";
  const loaded = loadEquipment(stored, inventory);
  assert.equal(loaded.persist, true);
  assert.equal(loaded.equipment.slots.main_hand, "");
  const player = playerAt("user-alice", "Alice", inventory);
  player.equipment = stored;
  player.derivedAttack = 99;
  const state = addPlayer(emptyZone(), player);
  const result = applyMatchLoop(state, 4, contentHash, []);
  assert.equal(mainHand(result.state, "user-alice"), "");
  assert.equal(result.state.players["user-alice"].derivedAttack, content.player.attack);
});

test("dead player cannot equip", () => {
  const player = playerAt("user-alice", "Alice");
  player.health = 0;
  let state = addPlayer(emptyZone(), player);
  const result = applyMatchLoop(state, 4, contentHash, [
    equip("user-alice", {
      instanceId: swordId(state, "user-alice"),
      slot: MAIN_HAND_SLOT,
      requestId: "req-equip-dead1",
    }),
  ]);
  assert.equal(actionCodes(result)[0].ok, false);
  assert.equal(actionCodes(result)[0].code, "player_dead");
});
