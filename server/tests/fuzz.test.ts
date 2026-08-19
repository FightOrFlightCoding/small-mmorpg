import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { emptyEquipment } from "../src/domain/equipment";
import { initializeInventory, type PlayerInventory } from "../src/domain/inventory";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { itemDefinitionsFromContent } from "../src/domain/inventory";
import { ClientOpcode, PROTOCOL_VERSION, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { MALFORMED_MESSAGE_FIXTURES } from "./fixtures/malformed_messages";

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
    itemDefinitionsFromContent(content.items),
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
    gold: 7,
    questLog: emptyQuestLog(),
    inventory: initializeInventory(null, function () {
      return userId + "-sword";
    }).inventory,
    equipment: emptyEquipment(),
  };
}

function itemSlots(stateGoldOwner: ReturnType<typeof applyMatchLoop>["state"], userId: string): number {
  const inventory = stateGoldOwner.players[userId].inventory as PlayerInventory;
  return inventory.items.length;
}

test("deterministic malformed fixtures never crash or mutate gold or inventory", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", 240, 384));
  const gold = state.players["user-alice"].gold;
  const slots = itemSlots(state, "user-alice");
  const pose = state.players["user-alice"].x;
  const mixed = MALFORMED_MESSAGE_FIXTURES.map((fixture) => {
    return { opcode: fixture.opcode, raw: fixture.raw, userId: "user-alice" };
  });
  const burst = applyMatchLoop(state, 1, contentHash, mixed);
  assert.equal(burst.terminate, false);
  assert.equal(burst.state.players["user-alice"].gold, gold);
  assert.equal(itemSlots(burst.state, "user-alice"), slots);
  for (let i = 0; i < MALFORMED_MESSAGE_FIXTURES.length; i++) {
    const fixture = MALFORMED_MESSAGE_FIXTURES[i];
    const parsed = parseClientMessage(fixture.opcode, fixture.raw, contentHash);
    assert.equal(isProtocolError(parsed), true, fixture.name);
    const result = applyMatchLoop(state, 10 + i, contentHash, [
      { opcode: fixture.opcode, raw: fixture.raw, userId: "user-alice" },
    ]);
    assert.equal(result.terminate, false, fixture.name);
    assert.equal(result.state.players["user-alice"].gold, gold, fixture.name);
    assert.equal(result.state.players["user-alice"].x, pose, fixture.name);
    assert.equal(itemSlots(result.state, "user-alice"), slots, fixture.name);
  }
});

test("boundary NaN Infinity and nested objects are protocol errors", () => {
  const nan = parseClientMessage(
    ClientOpcode.TRADE_SET_GOLD,
    '{"protocolVersion":' + String(PROTOCOL_VERSION) + ',"tradeId":"t","amount":null,"requestId":"r1"}',
    contentHash,
  );
  assert.equal(isProtocolError(nan), true);
  const inf = parseClientMessage(
    ClientOpcode.ALLOCATE_ATTRIBUTES,
    '{"protocolVersion":' + String(PROTOCOL_VERSION) + ',"attributeId":"attr.strength","amount":1e999,"requestId":"r2"}',
    contentHash,
  );
  assert.equal(isProtocolError(inf), true);
  const nested = parseClientMessage(
    ClientOpcode.RESYNC_REQUEST,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, extra: { inner: true } }),
    contentHash,
  );
  assert.equal(isProtocolError(nested), true);
});
