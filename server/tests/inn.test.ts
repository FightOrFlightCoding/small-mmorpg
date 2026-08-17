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
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";
import { applyPlayerLeave, restoreGracePlayer } from "../src/domain/persistence";
import { emptyEquipment } from "../src/domain/equipment";

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

function innPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_innkeeper") as { x: number; y: number };
}

function cavePos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_cave_portal") as { x: number; y: number };
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

function actions(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string });
}

test("inn rest heals, spends gold, and binds respawn", () => {
  const inn = innPos();
  const actor = playerAt(inn.x, inn.y, 5);
  actor.health = 3;
  const state = addPlayer(serviceZone(), actor);
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.INN_REST,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-inn-rest0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(result)[0].ok, true);
  assert.equal(result.state.players["user-alice"].health, content.player.maxHealth);
  assert.equal(result.state.players["user-alice"].gold, 0);
  assert.equal(result.state.players["user-alice"].bindX, inn.x);
  assert.equal(result.state.players["user-alice"].bindY, inn.y);
  assert.equal(result.persistCheckpoints.some((row) => row.bindX === inn.x && row.bindY === inn.y), true);
});

test("inn rest with insufficient gold is rejected", () => {
  const inn = innPos();
  const actor = playerAt(inn.x, inn.y, 0);
  actor.health = 3;
  const state = addPlayer(serviceZone(), actor);
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.INN_REST,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-inn-poor0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "insufficient_gold");
  assert.equal(result.state.players["user-alice"].health, 3);
});

test("healer rest restores health without charging or rebinding", () => {
  const inn = innPos();
  const actor = playerAt(inn.x, inn.y, 8);
  actor.health = 4;
  actor.bindX = 10;
  actor.bindY = 20;
  const state = addPlayer(serviceZone(), actor);
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.INN_REST,
      raw: envelope({ npcId: "npc.test_innkeeper", mode: "healer", requestId: "req-inn-heal0001" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(result)[0].ok, true);
  assert.equal(result.state.players["user-alice"].health, content.player.maxHealth);
  assert.equal(result.state.players["user-alice"].gold, 8);
  assert.equal(result.state.players["user-alice"].bindX, 10);
  assert.equal(result.state.players["user-alice"].bindY, 20);
});

test("inn bind survives reconnect grace restore", () => {
  const inn = innPos();
  const actor = playerAt(inn.x, inn.y, 5);
  actor.health = 2;
  let state = addPlayer(serviceZone(), actor);
  state = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.INN_REST,
      raw: envelope({ npcId: "npc.test_innkeeper", requestId: "req-inn-bind0001" }),
      userId: "user-alice",
    },
  ]).state;
  const left = applyPlayerLeave(state, "user-alice", 3);
  assert.equal(left.checkpoint?.bindX, inn.x);
  assert.equal(left.checkpoint?.bindY, inn.y);
  const restored = restoreGracePlayer(
    left.state.disconnected["user-alice"].player,
    "session-2",
    "alice",
    emptyQuestLog(),
    emptyInventory(),
    emptyEquipment(),
    0,
    0,
  );
  assert.equal(restored.bindX, inn.x);
  assert.equal(restored.bindY, inn.y);
});

test("cave entrance returns unavailable and does not transfer", () => {
  const cave = cavePos();
  const actor = playerAt(cave.x, cave.y, 0);
  actor.x = cave.x;
  actor.y = cave.y;
  const state = addPlayer(serviceZone(), actor);
  const beforeX = state.players["user-alice"].x;
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.CAVE_ENTER,
      raw: envelope({ npcId: "npc.test_cave_portal", requestId: "req-cave-enter01" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actions(result)[0].ok, false);
  assert.equal(actions(result)[0].code, "cave_unavailable");
  assert.equal(result.state.players["user-alice"].x, beforeX);
});
