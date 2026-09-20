import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  buildSnapshot,
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
  MANUAL_QA_GROUND_ENTITY_ID,
  MANUAL_QA_GROUND_ITEM_ID,
  MANUAL_QA_GROUND_TTL_SEC,
  MANUAL_QA_GROUND_X,
  MANUAL_QA_GROUND_Y,
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

test("manual QA ground seed places one public potion on grass east of the south road", () => {
  const seeded = seedManualQaGroundItems({ itemsById: defs, tickRate: MATCH_TICK_RATE });
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].itemId, MANUAL_QA_GROUND_ITEM_ID);
  assert.equal(seeded[0].groundEntityId, MANUAL_QA_GROUND_ENTITY_ID);
  assert.equal(seeded[0].x, MANUAL_QA_GROUND_X);
  assert.equal(seeded[0].y, MANUAL_QA_GROUND_Y);
  assert.equal(seeded[0].state, "PUBLIC_AVAILABLE");
  assert.equal(seeded[0].quantity, 1);
  assert.equal(seeded[0].expiresAtTick, MANUAL_QA_GROUND_TTL_SEC * MATCH_TICK_RATE);
  const tile = 64;
  const cellX = Math.floor(MANUAL_QA_GROUND_X / tile);
  const cellY = Math.floor(MANUAL_QA_GROUND_Y / tile);
  assert.equal(cellX, 31);
  assert.equal(cellY, 44);
  const spawn = content.zones["zone.starter"].playerSpawn;
  assert.equal(MANUAL_QA_GROUND_X, spawn.x);
  assert.ok(spawn.y - MANUAL_QA_GROUND_Y >= 120);
  assert.ok(spawn.y - MANUAL_QA_GROUND_Y <= 220);
  const zone = content.zones["zone.starter"];
  const rare = zone.enemies.find(function (enemy) { return enemy.enemyId === "enemy.qa_rare"; }) as { x: number; y: number };
  const general = zone.enemies.find(function (enemy) { return enemy.enemyId === "enemy.qa_general"; }) as { x: number; y: number };
  const dxRare = rare.x - spawn.x;
  const dyRare = rare.y - spawn.y;
  const dxGen = general.x - spawn.x;
  const dyGen = general.y - spawn.y;
  assert.ok(dxRare * dxRare + dyRare * dyRare > 200 * 200);
  assert.ok(dxGen * dxGen + dyGen * dyGen > 200 * 200);
  const dxPotionRare = rare.x - MANUAL_QA_GROUND_X;
  const dyPotionRare = rare.y - MANUAL_QA_GROUND_Y;
  assert.ok(dxPotionRare * dxPotionRare + dyPotionRare * dyPotionRare > 200 * 200);
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

test("QA merchant and herb bush are in range of player spawn", () => {
  const zone = content.zones["zone.starter"];
  const spawn = zone.playerSpawn;
  const merchant = zone.npcs.find(function (npc) { return npc.npcId === "npc.qa_merchant"; }) as { x: number; y: number };
  const bush = zone.npcs.find(function (npc) { return npc.npcId === "npc.qa_herb_bush"; }) as { x: number; y: number };
  const merchantRange = content.npcs["npc.qa_merchant"].interactionRange;
  const bushRange = content.npcs["npc.qa_herb_bush"].interactionRange;
  const merchantDist = Math.hypot(merchant.x - spawn.x, merchant.y - spawn.y);
  const bushDist = Math.hypot(bush.x - spawn.x, bush.y - spawn.y);
  assert.ok(merchantDist <= merchantRange);
  assert.ok(bushDist <= bushRange);
});

test("standing on the grass potion picks it up into the bag", () => {
  const state = addPlayer(qaZone(), playerAt("user-qa", MANUAL_QA_GROUND_X, MANUAL_QA_GROUND_Y));
  state.groundItems = seedManualQaGroundItems({ itemsById: defs, tickRate: MATCH_TICK_RATE });
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.PICKUP_GROUND_ITEM,
      raw: envelope({ groundEntityId: MANUAL_QA_GROUND_ENTITY_ID, requestId: "req-qa-gpick001" }),
      userId: "user-qa",
    },
  ]);
  const live = result.state.players["user-qa"];
  assert.ok(live !== undefined && live.inventory !== undefined);
  assert.equal(countItem(live.inventory, MANUAL_QA_GROUND_ITEM_ID), 1);
  const remaining = result.state.groundItems !== undefined ? result.state.groundItems : [];
  assert.equal(remaining.length, 0);
  const removed = result.outbound.filter(function (row) {
    return row.opcode === ServerOpcode.GROUND_ITEM_REMOVED;
  });
  assert.equal(removed.length, 1);
});

test("dropping the potion publishes it on SNAPSHOT for every player", () => {
  const picker = addPlayer(qaZone(), playerAt("user-qa", MANUAL_QA_GROUND_X, MANUAL_QA_GROUND_Y));
  picker.groundItems = seedManualQaGroundItems({ itemsById: defs, tickRate: MATCH_TICK_RATE });
  const picked = applyMatchLoop(picker, 1, contentHash, [
    {
      opcode: ClientOpcode.PICKUP_GROUND_ITEM,
      raw: envelope({ groundEntityId: MANUAL_QA_GROUND_ENTITY_ID, requestId: "req-qa-gpick002" }),
      userId: "user-qa",
    },
  ]);
  const live = picked.state.players["user-qa"];
  assert.ok(live !== undefined && live.inventory !== undefined);
  const potion = live.inventory.items.find(function (item) {
    return item.itemId === MANUAL_QA_GROUND_ITEM_ID;
  });
  assert.ok(potion !== undefined);
  const potionInstanceId = potion !== undefined ? potion.instanceId : "";
  assert.ok(potionInstanceId.length > 0);
  const withWatcher = addPlayer(picked.state, playerAt("user-bob", MANUAL_QA_GROUND_X + 24, MANUAL_QA_GROUND_Y));
  const dropped = applyMatchLoop(withWatcher, 2, contentHash, [
    {
      opcode: ClientOpcode.DROP_ITEM,
      raw: envelope({ instanceId: potionInstanceId, requestId: "req-qa-gdrop001", quantity: 1 }),
      userId: "user-qa",
    },
  ]);
  assert.equal(countItem(dropped.state.players["user-qa"].inventory, MANUAL_QA_GROUND_ITEM_ID), 0);
  const published = dropped.state.groundItems !== undefined ? dropped.state.groundItems : [];
  assert.equal(published.length, 1);
  assert.equal(published[0].itemId, MANUAL_QA_GROUND_ITEM_ID);
  assert.equal(published[0].state, "PUBLIC_AVAILABLE");
  const snap = JSON.parse(buildSnapshot(dropped.state, 2)) as {
    groundItems?: Array<{ itemId?: string; groundEntityId?: string; x?: number; y?: number }>;
  };
  assert.ok(Array.isArray(snap.groundItems));
  assert.equal(snap.groundItems.length, 1);
  assert.equal(snap.groundItems[0].itemId, MANUAL_QA_GROUND_ITEM_ID);
  assert.ok(typeof snap.groundItems[0].groundEntityId === "string" && snap.groundItems[0].groundEntityId.length > 0);
});

test("QA merchant interact from spawn returns INTERACTION_RESULT", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const state = addPlayer(qaZone(), playerAt("user-qa", spawn.x, spawn.y, emptyInventory()));
  state.players["user-qa"].gold = 5000;
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.qa_merchant", requestId: "req-qa-merch001" }),
      userId: "user-qa",
    },
  ]);
  const interaction = result.outbound.filter(function (row) {
    return row.opcode === ServerOpcode.INTERACTION_RESULT;
  });
  assert.equal(interaction.length, 1);
  const body = JSON.parse(interaction[0].body) as { ok?: boolean; code?: string; vendorId?: string };
  assert.equal(body.ok, true);
  assert.equal(body.code, "ok");
  assert.equal(body.vendorId, "vendor.qa_general");
});
