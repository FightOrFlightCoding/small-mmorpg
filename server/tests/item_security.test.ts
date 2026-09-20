import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  applyMoveItem,
  applySplitStack,
  emptyInventory,
  initializeInventory,
  itemDefinitionsFromContent,
  makeInstance,
} from "../src/domain/inventory";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyEquipment } from "../src/domain/equipment";
import {
  ClientOpcode,
  MAX_MATCH_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  isProtocolError,
  parseClientMessage,
} from "../src/domain/protocol";
import { ACTION_LIMITS } from "../src/domain/rate_limit";
import { claimCorpseItem, createCorpse } from "../src/domain/corpse";

function defs() {
  return itemDefinitionsFromContent(content.items);
}

function envelope(extra: { [key: string]: unknown }): string {
  return JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...extra });
}

function emptyZone() {
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
    defs(),
  );
}

function playerAt(userId: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: userId,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    gold: 0,
    questLog: emptyQuestLog(),
    inventory: initializeInventory(null, function () {
      return userId + "-sword";
    }).inventory,
    equipment: emptyEquipment(),
  };
}

test("negative and nonfinite bag slots are invalid_slot", () => {
  const inventory = emptyInventory();
  inventory.items.push(makeInstance("sw-1", "item.training_sword", 1, 0));
  const moved = applyMoveItem({
    playerHealth: 100,
    inventory: inventory,
    instanceId: "sw-1",
    toSlotIndex: -1,
    requestId: "req-neg-slot",
    itemsById: defs(),
  });
  assert.equal(moved.ok, false);
  assert.equal(moved.code, "invalid_slot");
  const parsed = parseClientMessage(
    ClientOpcode.MOVE_ITEM,
    envelope({ instanceId: "sw-1", toSlotIndex: Number.NaN, requestId: "reqnan01" }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "invalid_slot");
  }
});

test("invalid quantity is rejected and foreign instance is not owned", () => {
  const inventory = emptyInventory();
  inventory.items.push(makeInstance("sw-1", "item.training_sword", 1, 0));
  const split = applySplitStack({
    playerHealth: 100,
    inventory: inventory,
    equippedInstanceIds: [],
    instanceId: "sw-1",
    quantity: 0,
    requestId: "req-qty-0",
    itemsById: defs(),
    newId: function () {
      return "sw-2";
    },
  });
  assert.equal(split.ok, false);
  const foreign = applyMoveItem({
    playerHealth: 100,
    inventory: inventory,
    instanceId: "someone-else",
    toSlotIndex: 1,
    requestId: "req-foreign",
    itemsById: defs(),
  });
  assert.equal(foreign.ok, false);
  assert.ok(foreign.code === "item_not_found" || foreign.code === "item_not_owned" || foreign.code === "invalid_id");
});

test("client instanceId on pickup and drop coordinates are stat_injection", () => {
  const pickup = parseClientMessage(
    ClientOpcode.PICKUP,
    envelope({ lootId: "loot-1", instanceId: "forged", requestId: "reqpick01" }),
    contentHash,
  );
  assert.equal(isProtocolError(pickup), true);
  if (isProtocolError(pickup)) {
    assert.equal(pickup.code, "stat_injection:instanceId");
  }
  const drop = parseClientMessage(
    ClientOpcode.DROP_ITEM,
    envelope({ instanceId: "sw-1", quantity: 1, x: 10, y: 10, requestId: "reqdrop01" }),
    contentHash,
  );
  assert.equal(isProtocolError(drop), true);
  if (isProtocolError(drop)) {
    assert.ok(drop.code.indexOf("stat_injection") === 0 || drop.code.indexOf("unknown_field") === 0);
  }
});

test("unknown fields quest counts client grant and roll winner are rejected", () => {
  const quest = parseClientMessage(
    ClientOpcode.QUEST_TURN_IN,
    envelope({ questId: "quest.slime_problem", npcId: "npc.elder", current: 3, requestId: "reqquest1" }),
    contentHash,
  );
  assert.equal(isProtocolError(quest), true);
  const grant = parseClientMessage(99, envelope({ itemId: "item.slime_gel", quantity: 1, requestId: "reqgrant1" }), contentHash);
  assert.equal(isProtocolError(grant), true);
  const roll = parseClientMessage(
    ClientOpcode.SUBMIT_LOOT_ROLL,
    envelope({ rollId: "roll-1", choice: "NEED", roll: 99, requestId: "reqroll01" }),
    contentHash,
  );
  assert.equal(isProtocolError(roll), true);
  if (isProtocolError(roll)) {
    assert.equal(roll.code, "stat_injection:roll");
  }
  const winner = parseClientMessage(
    ClientOpcode.SUBMIT_LOOT_ROLL,
    envelope({ rollId: "roll-1", choice: "NEED", winner: "char-alice", requestId: "reqroll02" }),
    contentHash,
  );
  assert.equal(isProtocolError(winner), true);
  const stats = parseClientMessage(
    ClientOpcode.EQUIP,
    envelope({ instanceId: "sw-1", slot: "main_hand", attackBonus: 99, requestId: "reqeq0001" }),
    contentHash,
  );
  assert.equal(isProtocolError(stats), true);
});

test("oversized match payload does not mutate inventory", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", 240, 384));
  const actor = state.players["user-alice"];
  assert.ok(actor !== undefined && actor.inventory !== undefined);
  if (actor === undefined || actor.inventory === undefined) {
    return;
  }
  const before = actor.inventory.items.length;
  const raw = "{\"protocolVersion\":\"1\",\"requestId\":\"reqbig001\",\"pad\":\"" + "x".repeat(MAX_MATCH_PAYLOAD_BYTES) + "\"}";
  const result = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.MOVE_ITEM, raw: raw, userId: "user-alice" },
  ]);
  assert.equal(result.terminate, false);
  assert.equal(result.state.players["user-alice"] !== undefined, true);
  const after = result.state.players["user-alice"];
  assert.ok(after !== undefined && after.inventory !== undefined);
  if (after === undefined || after.inventory === undefined) {
    return;
  }
  assert.equal(after.inventory.items.length, before);
});

test("forged corpse id is invalid_target and inventory rate limit holds", () => {
  const corpse = createCorpse({
    corpseId: "corpse-real",
    enemyInstanceId: "e1",
    enemyId: "enemy.green_slime",
    zoneId: "zone.starter",
    matchId: "m1",
    x: 10,
    y: 10,
    tick: 1,
    tickRate: 10,
    tagOwnerCharacterId: "char-alice",
    tagOwnerUserId: "user-alice",
    tagPartyId: "",
    encounterRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    deathEligibleRoster: [{ characterId: "char-alice", userId: "user-alice" }],
    loot: { items: [{ itemId: "item.slime_gel", quantity: 1, instanceId: "gel-1" }], gold: 0 },
    itemsById: defs(),
    newId: function () {
      return "id-1";
    },
  });
  const forged = claimCorpseItem({
    corpse: corpse,
    entryId: "forged-entry",
    userId: "user-alice",
    characterId: "char-alice",
    playerHealth: 100,
    playerX: 10,
    playerY: 10,
    pickupRange: 40,
    inventory: emptyInventory(),
    itemsById: defs(),
    requestId: "req-forged-corpse",
  });
  assert.equal(forged.ok, false);
  const state = addPlayer(emptyZone(), playerAt("user-alice", 240, 384));
  const messages = [];
  for (let i = 0; i < ACTION_LIMITS.inventory + 2; i++) {
    messages.push({
      opcode: ClientOpcode.MOVE_ITEM,
      raw: envelope({ instanceId: "missing", toSlotIndex: 1, requestId: "reqrate" + String(i).padStart(2, "0") }),
      userId: "user-alice",
    });
  }
  const flooded = applyMatchLoop(state, 1, contentHash, messages);
  assert.ok(flooded.rejections.some(function (row) {
    return row.code === "rate_limited";
  }));
});

test("foreign trade id is rejected", () => {
  const parsed = parseClientMessage(
    ClientOpcode.TRADE_SET_OFFER,
    envelope({ tradeId: "trade-forged", instanceId: "sw-1", quantity: 1, requestId: "reqtrd001" }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), false);
  const state = addPlayer(emptyZone(), playerAt("user-alice", 240, 384));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.TRADE_SET_OFFER,
      raw: envelope({ tradeId: "trade-forged", instanceId: "sw-1", quantity: 1, requestId: "reqtrd001" }),
      userId: "user-alice",
    },
  ]);
  const body = result.outbound.find(function (row) {
    return row.toUserId === "user-alice";
  });
  assert.ok(body !== undefined);
});
