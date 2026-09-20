import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyEquipment } from "../src/domain/equipment";
import {
  addOrStackItem,
  countItem,
  emptyInventory,
  itemDefinitionsFromContent,
  occupiedSlots,
} from "../src/domain/inventory";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { vendorDefinitionsFromContent } from "../src/domain/vendor";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import {
  MANUAL_QA_ACCOUNT_EMAIL,
  MANUAL_QA_CHARACTER_NAME,
  MANUAL_QA_GOLD_BALANCE,
  MANUAL_QA_GROUND_ITEM_ID,
  MANUAL_QA_GROUND_X,
  manualQaGoldDelta,
  seedManualQaGroundItems,
} from "../src/domain/qa_manual_seed";

const defs = itemDefinitionsFromContent(content.items);

function envelope(extra: { [key: string]: unknown } = {}): string {
  const body: { [key: string]: unknown } = { protocolVersion: PROTOCOL_VERSION };
  const keys = Object.keys(extra);
  for (let i = 0; i < keys.length; i++) {
    body[keys[i]] = extra[keys[i]];
  }
  return JSON.stringify(body);
}

function qaZone(): StarterZoneState {
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
    defs,
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

function playerAt(userId: string, x: number, y: number, inventory = emptyInventory()): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: "Tester",
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    gold: 0,
    inventory: inventory,
    equipment: emptyEquipment(),
  };
}

test("manual QA gold tops up Ada and the registered email only", () => {
  assert.equal(manualQaGoldDelta(MANUAL_QA_ACCOUNT_EMAIL, "Ada", 0), MANUAL_QA_GOLD_BALANCE);
  assert.equal(manualQaGoldDelta("PedroBH91@gmail.com", "Ada", 100), MANUAL_QA_GOLD_BALANCE - 100);
  assert.equal(manualQaGoldDelta(MANUAL_QA_ACCOUNT_EMAIL, "Ada", MANUAL_QA_GOLD_BALANCE), 0);
  assert.equal(manualQaGoldDelta("", MANUAL_QA_CHARACTER_NAME, 10), MANUAL_QA_GOLD_BALANCE - 10);
  assert.equal(manualQaGoldDelta("other@example.com", "Ada", 0), 0);
  assert.equal(manualQaGoldDelta("", "Bob", 0), 0);
});

test("manual QA ground seed places one public potion near spawn", () => {
  const seeded = seedManualQaGroundItems({ itemsById: defs, tickRate: MATCH_TICK_RATE });
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].itemId, MANUAL_QA_GROUND_ITEM_ID);
  assert.equal(seeded[0].x, MANUAL_QA_GROUND_X);
  assert.equal(seeded[0].state, "PUBLIC_AVAILABLE");
  assert.equal(seeded[0].quantity, 1);
});

test("starter zone places the QA merchant, herb bush, and loot mobs", () => {
  const zone = content.zones["zone.starter"];
  assert.ok(zone.npcs.some(function (npc) { return npc.npcId === "npc.qa_merchant"; }));
  assert.ok(zone.npcs.some(function (npc) { return npc.npcId === "npc.qa_herb_bush"; }));
  assert.ok(zone.enemies.some(function (enemy) { return enemy.enemyId === "enemy.qa_rare"; }));
  assert.ok(zone.enemies.some(function (enemy) { return enemy.enemyId === "enemy.qa_general"; }));
  assert.equal(content.items["item.qa_green_relic"].rarity, "rarity.uncommon");
  assert.equal(content.items["item.wild_herb"].maxStack, 99);
  assert.equal(content.lootTables["loot.qa_rare"].entries.length, 1);
  assert.ok(content.lootTables["loot.qa_general"].entries.length >= 3);
  assert.equal(content.vendors["vendor.qa_general"].stock[0].buyPrice, 10);
});

test("interacting with the herb bush grants a wild herb", () => {
  const bush = content.zones["zone.starter"].npcs.find(function (npc) {
    return npc.npcId === "npc.qa_herb_bush";
  }) as { x: number; y: number };
  const state = addPlayer(qaZone(), playerAt("user-qa", bush.x, bush.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.qa_herb_bush", requestId: "req-herb-pick01" }),
      userId: "user-qa",
    },
  ]);
  const live = result.state.players["user-qa"];
  assert.ok(live !== undefined && live.inventory !== undefined);
  assert.equal(countItem(live.inventory, "item.wild_herb"), 1);
  const interaction = result.outbound.filter(function (row) {
    return row.opcode === ServerOpcode.INTERACTION_RESULT;
  });
  assert.equal(interaction.length, 1);
  const body = JSON.parse(interaction[0].body) as { grantCode?: string; grantItemId?: string };
  assert.equal(body.grantCode, "ok");
  assert.equal(body.grantItemId, "item.wild_herb");
});

test("herb bush grant is idempotent on duplicate requestId and refuses a full bag", () => {
  const bush = content.zones["zone.starter"].npcs.find(function (npc) {
    return npc.npcId === "npc.qa_herb_bush";
  }) as { x: number; y: number };
  const first = applyMatchLoop(addPlayer(qaZone(), playerAt("user-qa", bush.x, bush.y)), 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.qa_herb_bush", requestId: "req-herb-dup001" }),
      userId: "user-qa",
    },
  ]);
  const replay = applyMatchLoop(first.state, 2, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.qa_herb_bush", requestId: "req-herb-dup001" }),
      userId: "user-qa",
    },
  ]);
  const live = replay.state.players["user-qa"];
  assert.ok(live !== undefined && live.inventory !== undefined);
  assert.equal(countItem(live.inventory, "item.wild_herb"), 1);

  let full = emptyInventory();
  for (let i = 0; i < 30; i++) {
    full = addOrStackItem(full, "item.training_sword", 1, "fill-" + String(i), defs["item.training_sword"]);
  }
  assert.equal(occupiedSlots(full), 30);
  const blocked = applyMatchLoop(addPlayer(qaZone(), playerAt("user-full", bush.x, bush.y, full)), 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.qa_herb_bush", requestId: "req-herb-full01" }),
      userId: "user-full",
    },
  ]);
  const fullLive = blocked.state.players["user-full"];
  assert.ok(fullLive !== undefined && fullLive.inventory !== undefined);
  assert.equal(countItem(fullLive.inventory, "item.wild_herb"), 0);
  assert.equal(occupiedSlots(fullLive.inventory), 30);
});
