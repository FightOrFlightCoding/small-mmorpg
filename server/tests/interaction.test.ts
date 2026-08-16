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
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode } from "../src/domain/protocol";

function enemiesById() {
  const map: { [id: string]: { id: string; maxHealth: number } } = {};
  const ids = Object.keys(content.enemies);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    map[id] = { id: id, maxHealth: content.enemies[id as keyof typeof content.enemies].maxHealth };
  }
  return map;
}

function emptyZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemiesById(),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
  );
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
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

function interactionBody(result: ReturnType<typeof applyMatchLoop>) {
  const messages = result.outbound.filter((item) => item.opcode === ServerOpcode.INTERACTION_RESULT);
  assert.equal(messages.length, 1);
  return JSON.parse(messages[0].body) as { ok: boolean; code: string; requestId: string; targetId: string };
}

test("interaction in range is approved", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-interact-ok" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, true);
  assert.equal(body.code, "ok");
  assert.equal(body.requestId, "req-interact-ok");
  assert.equal(body.targetId, "npc.elder");
});

test("interaction out of range is rejected", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-interact-far" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, false);
  assert.equal(body.code, "out_of_range");
});

test("unknown npc interaction is rejected", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.missing", requestId: "req-interact-missing" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_target");
});

test("dead player interaction is rejected", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const actor = playerAt("user-alice", "Alice", elder.x, elder.y);
  actor.health = 0;
  const state = addPlayer(emptyZone(), actor);
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-interact-dead" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, false);
  assert.equal(body.code, "player_dead");
});
