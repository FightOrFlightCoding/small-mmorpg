import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  buildFullState,
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

function actionMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string; requestId?: string });
}

function questMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.QUEST_STATE)
    .map((item) => JSON.parse(item.body) as { quests: Array<{ questId: string; status: string; objectives: Array<{ current: number; required: number }> }> });
}

test("first quest acceptance creates accepted state once", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-1" }),
      userId: "user-alice",
    },
  ]);
  const actions = actionMessages(result);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].ok, true);
  assert.equal(actions[0].code, "accepted");
  const quests = questMessages(result);
  assert.equal(quests.length, 1);
  assert.equal(quests[0].quests.length, 1);
  assert.equal(quests[0].quests[0].questId, "quest.slime_problem");
  assert.equal(quests[0].quests[0].status, "accepted");
  assert.equal(quests[0].quests[0].objectives[0].current, 0);
  assert.equal(quests[0].quests[0].objectives[0].required, 1);
  assert.equal(result.persistQuests.length, 1);
  assert.equal(result.persistQuests[0].userId, "user-alice");
  assert.equal(result.state.players["user-alice"].questLog.quests["quest.slime_problem"].status, "accepted");
});

test("duplicate quest acceptance is idempotent", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const first = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-1" }),
      userId: "user-alice",
    },
  ]);
  const replay = applyMatchLoop(first.state, 3, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionMessages(replay)[0].code, "accepted");
  assert.equal(replay.persistQuests.length, 0);
  const second = applyMatchLoop(first.state, 4, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-2" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionMessages(second)[0].ok, true);
  assert.equal(actionMessages(second)[0].code, "already_accepted");
  assert.equal(questMessages(second)[0].quests.length, 1);
  assert.equal(Object.keys(second.state.players["user-alice"].questLog.quests).length, 1);
});

test("unknown quest id is rejected", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.missing", requestId: "req-accept-unknown" }),
      userId: "user-alice",
    },
  ]);
  const actions = actionMessages(result);
  assert.equal(actions[0].ok, false);
  assert.equal(actions[0].code, "invalid_id");
  assert.equal(questMessages(result).length, 0);
  assert.equal(result.persistQuests.length, 0);
});

test("quest accept out of elder range is rejected", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const result = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-far" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionMessages(result)[0].ok, false);
  assert.equal(actionMessages(result)[0].code, "out_of_range");
  assert.equal(result.persistQuests.length, 0);
});

test("full state restores accepted quests after join", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const actor = playerAt("user-alice", "Alice", elder.x, elder.y);
  const accepted = applyMatchLoop(addPlayer(emptyZone(), actor), 2, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.slime_problem", requestId: "req-accept-1" }),
      userId: "user-alice",
    },
  ]);
  const body = JSON.parse(buildFullState(accepted.state, 9, "user-alice"));
  assert.equal(body.quests.length, 1);
  assert.equal(body.quests[0].questId, "quest.slime_problem");
  assert.equal(body.quests[0].status, "accepted");
  assert.equal(body.quests[0].turnInNpcId, "npc.elder");
});
