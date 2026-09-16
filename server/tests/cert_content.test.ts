import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { npcDefinitionsFromContent } from "../src/domain/npc";
import { vendorDefinitionsFromContent } from "../src/domain/vendor";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
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

function certZone(): StarterZoneState {
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
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      vendorsById: vendorDefinitionsFromContent(content.vendors),
    },
  );
}

function playerAt(x: number, y: number, gold = 0): MatchPlayer {
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
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
  };
}

function npcPos(npcId: string): { x: number; y: number } {
  const row = content.zones["zone.starter"].npcs.find((npc) => npc.npcId === npcId);
  assert.ok(row);
  return { x: row.x, y: row.y };
}

function scout(state: StarterZoneState) {
  const found = state.enemies.find((enemy) => enemy.enemyId === "enemy.cert_scout");
  assert.ok(found);
  return found;
}

function actions(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string });
}

test("content-only cert pack is present without new protocol ids", () => {
  assert.ok(content.classes["test.class.warden"]);
  assert.ok(content.abilities["test.ability.cert_strike"]);
  assert.equal(content.abilities["test.ability.cert_strike"].effects[0].type, "direct_damage");
  assert.ok(content.items["item.cert_mail"]);
  assert.equal(content.items["item.cert_mail"].equipSlot, "chest");
  assert.ok(content.enemies["enemy.cert_scout"]);
  assert.ok(content.lootTables["loot.cert_scout"]);
  assert.ok(content.npcs["npc.cert_quartermaster"]);
  assert.ok(content.quests["quest.cert_scout"]);
  assert.ok(content.vendors["vendor.cert_quartermaster"]);
  assert.equal(content.vendors["vendor.cert_quartermaster"].stock[0].itemId, "item.cert_mail");
  assert.ok(content.spawns["spawn.starter.cert_scout"]);
});

test("content-only cert scout quest completes through existing opcodes", () => {
  const giver = npcPos("npc.cert_quartermaster");
  let state = addPlayer(certZone(), playerAt(giver.x, giver.y, 0));
  const accepted = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.cert_scout", requestId: "req-cert-accept01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(accepted)[0].ok, true);
  state = accepted.state;
  const enemy = scout(state);
  state.players["user-alice"].x = enemy.x;
  state.players["user-alice"].y = enemy.y;
  let tick = 10;
  let hits = 0;
  while (hits < 8) {
    const result = applyMatchLoop(state, tick, contentHash, [
      {
        opcode: ClientOpcode.ATTACK,
        raw: envelope({ targetId: enemy.id, requestId: "req-cert-hit" + String(hits) }),
        userId: "user-alice",
      },
    ]);
    const code = actions(result)[0];
    if (code !== undefined && code.ok) {
      hits += 1;
    }
    state = result.state;
    tick += 10;
    const live = state.enemies.find((row) => row.enemyId === "enemy.cert_scout" && row.health > 0 && row.aiState !== "dead");
    if (live === undefined) {
      break;
    }
  }
  const quest = state.players["user-alice"].questLog.quests["quest.cert_scout"];
  assert.ok(quest);
  assert.equal(quest.objectives[0].current, 1);
  state.players["user-alice"].x = giver.x;
  state.players["user-alice"].y = giver.y;
  const turned = applyMatchLoop(state, tick + 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_TURN_IN,
      raw: envelope({ questId: "quest.cert_scout", npcId: "npc.cert_quartermaster", requestId: "req-cert-turnin01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(turned)[0].ok, true);
  assert.equal(turned.state.players["user-alice"].questLog.quests["quest.cert_scout"].status, "completed");
  assert.equal(turned.state.players["user-alice"].gold, 4);
  const replay = applyMatchLoop(turned.state, tick + 4, contentHash, [
    {
      opcode: ClientOpcode.QUEST_TURN_IN,
      raw: envelope({ questId: "quest.cert_scout", npcId: "npc.cert_quartermaster", requestId: "req-cert-turnin02" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(replay)[0].ok, false);
  assert.equal(actions(replay)[0].code, "already_completed");
  assert.equal(replay.state.players["user-alice"].gold, 4);
});

test("content-only cert mail buys through the existing vendor opcode", () => {
  const giver = npcPos("npc.cert_quartermaster");
  const state = addPlayer(certZone(), playerAt(giver.x, giver.y, 5));
  const bought = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.VENDOR_BUY,
      raw: envelope({ npcId: "npc.cert_quartermaster", itemId: "item.cert_mail", requestId: "req-cert-buy0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(bought)[0].ok, true);
  const items = bought.state.players["user-alice"].inventory !== undefined
    ? bought.state.players["user-alice"].inventory.items
    : [];
  assert.equal(items.some((item) => item.itemId === "item.cert_mail"), true);
  assert.equal(bought.state.players["user-alice"].gold, 0);
});
