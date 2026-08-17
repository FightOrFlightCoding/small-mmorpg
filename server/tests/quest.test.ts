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
import { applyQuestAccept, emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { applyKillObjectives, applyTalkObjectives } from "../src/domain/quest_objectives";
import { addOrStackItem, emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { initializeProgression } from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";
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
    itemDefinitionsFromContent(content.items),
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

test("quest accept ignores null prerequisites from Nakama JSON", () => {
  const questsById = questDefinitionsFromContent(content.quests);
  const slime = questsById["quest.slime_problem"];
  const poisoned = {
    id: slime.id,
    displayName: slime.displayName,
    category: slime.category,
    acceptNpcId: slime.acceptNpcId,
    turnInNpcId: slime.turnInNpcId,
    objectives: slime.objectives,
    stages: slime.stages,
    consume: slime.consume,
    rewards: slime.rewards,
    completeOnce: slime.completeOnce,
    repeatable: slime.repeatable,
    prerequisites: null as unknown as undefined,
  };
  const elder = content.zones["zone.starter"].npcs[0];
  const outcome = applyQuestAccept({
    playerHealth: 20,
    playerX: elder.x,
    playerY: elder.y,
    questLog: emptyQuestLog(),
    questId: "quest.slime_problem",
    requestId: "req-null-prereq",
    npcs: [{ id: "npc.elder", npcId: "npc.elder", x: elder.x, y: elder.y }],
    interactionRange: 48,
    questsById: { "quest.slime_problem": poisoned },
    playerLevel: 1,
    classId: "test.class.vanguard",
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.code, "accepted");
});

function heraldPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_herald") as { npcId: string; x: number; y: number };
}

function interact(npcId: string, requestId: string) {
  return {
    opcode: ClientOpcode.INTERACT,
    raw: envelope({ targetId: npcId, requestId: requestId }),
    userId: "user-alice",
  };
}

function accept(questId: string, requestId: string) {
  return {
    opcode: ClientOpcode.QUEST_ACCEPT,
    raw: envelope({ questId: questId, requestId: requestId }),
    userId: "user-alice",
  };
}

function turnIn(questId: string, npcId: string, requestId: string) {
  return {
    opcode: ClientOpcode.QUEST_TURN_IN,
    raw: envelope({ questId: questId, npcId: npcId, requestId: requestId }),
    userId: "user-alice",
  };
}

test("talk_to_npc objective completes on approved interact after accept", () => {
  const herald = heraldPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  state = applyMatchLoop(state, 2, contentHash, [accept("quest.test.talk", "req-talk-accept1")]).state;
  const talked = applyMatchLoop(state, 3, contentHash, [interact("npc.test_herald", "req-talk-int01")]);
  const progress = talked.state.players["user-alice"].questLog.quests["quest.test.talk"];
  assert.equal(progress.objectives[0].type, "talk_to_npc");
  assert.equal(progress.objectives[0].current, 1);
  const done = applyMatchLoop(talked.state, 4, contentHash, [turnIn("quest.test.talk", "npc.test_herald", "req-talk-turn01")]);
  assert.equal(actionMessages(done)[0].ok, true);
  assert.equal(done.state.players["user-alice"].questLog.quests["quest.test.talk"].status, "completed");
});

test("kill_enemy and defeat_boss objectives honor ids, tags, and zone", () => {
  const herald = heraldPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  state = applyMatchLoop(state, 2, contentHash, [accept("quest.test.kill", "req-kill-accept1")]).state;
  const missed = applyTalkObjectives(state.players["user-alice"].questLog, "npc.test_herald");
  assert.equal(missed.changed, false);
  const wrong = applyKillObjectives(state.players["user-alice"].questLog, {
    enemyId: "test.enemy.melee",
    tags: ["test", "melee"],
    zoneId: "zone.starter",
    isBoss: false,
  });
  assert.equal(wrong.changed, false);
  const killed = applyKillObjectives(state.players["user-alice"].questLog, {
    enemyId: "enemy.green_slime",
    tags: ["slime", "wildlife"],
    zoneId: "zone.starter",
    isBoss: false,
  });
  assert.equal(killed.changed, true);
  assert.equal(killed.log.quests["quest.test.kill"].objectives[0].current, 1);
  state = applyMatchLoop(state, 3, contentHash, [accept("quest.test.boss", "req-boss-accept1")]).state;
  const notBoss = applyKillObjectives(state.players["user-alice"].questLog, {
    enemyId: "test.enemy.cave_boss",
    tags: ["test"],
    zoneId: "zone.starter",
    isBoss: false,
  });
  assert.equal(notBoss.changed, false);
  const boss = applyKillObjectives(state.players["user-alice"].questLog, {
    enemyId: "test.enemy.cave_boss",
    tags: ["test", "boss"],
    zoneId: "zone.starter",
    isBoss: true,
  });
  assert.equal(boss.changed, true);
  assert.equal(boss.log.quests["quest.test.boss"].objectives[0].current, 1);
});

test("collect_item objective reads inventory and never client counts", () => {
  const herald = heraldPos();
  const actor = playerAt("user-alice", "Alice", herald.x, herald.y);
  actor.inventory = addOrStackItem(
    actor.inventory !== undefined ? actor.inventory : emptyInventory(),
    "item.test_pebble",
    1,
    "pebble-1",
    itemDefinitionsFromContent(content.items)["item.test_pebble"],
  );
  let state = addPlayer(emptyZone(), actor);
  const accepted = applyMatchLoop(state, 2, contentHash, [accept("quest.test.collect", "req-collect-acc1")]);
  assert.equal(accepted.state.players["user-alice"].questLog.quests["quest.test.collect"].objectives[0].current, 1);
  const done = applyMatchLoop(accepted.state, 3, contentHash, [turnIn("quest.test.collect", "npc.test_herald", "req-collect-tn1")]);
  assert.equal(actionMessages(done)[0].ok, true);
  assert.equal(done.state.players["user-alice"].questLog.quests["quest.test.collect"].status, "completed");
});

test("enter_location completes after the player is inside the authored box", () => {
  const herald = heraldPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  state = applyMatchLoop(state, 2, contentHash, [accept("quest.test.enter", "req-enter-acc01")]).state;
  assert.equal(state.players["user-alice"].questLog.quests["quest.test.enter"].objectives[0].current, 0);
  state.players["user-alice"].x = 80;
  state.players["user-alice"].y = 640;
  const entered = applyMatchLoop(state, 3, contentHash, []);
  assert.equal(entered.state.players["user-alice"].questLog.quests["quest.test.enter"].objectives[0].current, 1);
});

test("ordered stages block later objectives until the current stage is complete", () => {
  const herald = heraldPos();
  const actor = playerAt("user-alice", "Alice", herald.x, herald.y);
  let state = addPlayer(emptyZone(), actor);
  state = applyMatchLoop(state, 2, contentHash, [accept("quest.test.main_chain", "req-chain-acc01")]).state;
  const withPebble = addOrStackItem(
    state.players["user-alice"].inventory !== undefined
      ? state.players["user-alice"].inventory
      : emptyInventory(),
    "item.test_pebble",
    1,
    "pebble-chain",
    itemDefinitionsFromContent(content.items)["item.test_pebble"],
  );
  state.players["user-alice"].inventory = withPebble;
  const beforeTalk = applyMatchLoop(state, 3, contentHash, [accept("quest.test.main_chain", "req-chain-sync1")]);
  const objectives = beforeTalk.state.players["user-alice"].questLog.quests["quest.test.main_chain"].objectives;
  assert.equal(objectives[0].current, 0);
  assert.equal(objectives[1].current, 0);
  const talked = applyMatchLoop(beforeTalk.state, 4, contentHash, [interact("npc.test_herald", "req-chain-talk1")]);
  const afterTalk = talked.state.players["user-alice"].questLog.quests["quest.test.main_chain"].objectives;
  assert.equal(afterTalk[0].current, 1);
  const synced = applyMatchLoop(talked.state, 5, contentHash, [accept("quest.test.main_chain", "req-chain-sync2")]);
  const afterCollect = synced.state.players["user-alice"].questLog.quests["quest.test.main_chain"].objectives;
  assert.equal(afterCollect[1].current, 1);
  const returned = applyMatchLoop(synced.state, 6, contentHash, [interact("npc.test_herald", "req-chain-ret01")]);
  const afterReturn = returned.state.players["user-alice"].questLog.quests["quest.test.main_chain"].objectives;
  assert.equal(afterReturn[2].current, 1);
  const done = applyMatchLoop(returned.state, 7, contentHash, [turnIn("quest.test.main_chain", "npc.test_herald", "req-chain-tn01")]);
  assert.equal(actionMessages(done)[0].ok, true);
  assert.equal(done.state.players["user-alice"].questLog.quests["quest.test.main_chain"].status, "completed");
});

test("missing quest prerequisite is rejected", () => {
  const herald = heraldPos();
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  const result = applyMatchLoop(state, 2, contentHash, [accept("quest.test.gated", "req-gated-acc01")]);
  assert.equal(actionMessages(result)[0].ok, false);
  assert.equal(actionMessages(result)[0].code, "missing_prerequisite");
});

test("duplicate completion is rejected", () => {
  const herald = heraldPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  state = applyMatchLoop(state, 2, contentHash, [accept("quest.test.talk", "req-dup-acc0001")]).state;
  state = applyMatchLoop(state, 3, contentHash, [interact("npc.test_herald", "req-dup-int0001")]).state;
  const first = applyMatchLoop(state, 4, contentHash, [turnIn("quest.test.talk", "npc.test_herald", "req-dup-tn0001")]);
  assert.equal(actionMessages(first)[0].ok, true);
  const second = applyMatchLoop(first.state, 5, contentHash, [turnIn("quest.test.talk", "npc.test_herald", "req-dup-tn0002")]);
  assert.equal(actionMessages(second)[0].ok, false);
  assert.equal(actionMessages(second)[0].code, "already_completed");
});

test("quest extra rewards grant ability unlocks and unspent points", () => {
  const herald = heraldPos();
  const catalog = catalogFromContent(content);
  const actor = playerAt("user-alice", "Alice", herald.x, herald.y);
  actor.classId = "test.class.vanguard";
  actor.progression = initializeProgression(catalog, "test.class.vanguard");
  const beforeAttr = actor.progression.unspentAttributePoints;
  const beforeSkill = actor.progression.unspentSkillPoints;
  let state = addPlayer(emptyZone(), actor);
  state = applyMatchLoop(state, 2, contentHash, [accept("quest.test.reward", "req-rew-acc0001")]).state;
  state = applyMatchLoop(state, 3, contentHash, [interact("npc.test_herald", "req-rew-int0001")]).state;
  const done = applyMatchLoop(state, 4, contentHash, [turnIn("quest.test.reward", "npc.test_herald", "req-rew-tn0001")]);
  assert.equal(actionMessages(done)[0].ok, true);
  const progression = done.state.players["user-alice"].progression;
  assert.equal(progression !== undefined, true);
  if (progression !== undefined) {
    assert.equal(progression.unspentAttributePoints, beforeAttr + 1);
    assert.equal(progression.unspentSkillPoints, beforeSkill + 1);
    assert.equal(progression.unlockedAbilityIds.indexOf("test.ability.small_heal") !== -1, true);
  }
  assert.equal(done.state.players["user-alice"].gold, 3);
});
