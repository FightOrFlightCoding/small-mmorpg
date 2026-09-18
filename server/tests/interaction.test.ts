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
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { INTERACTION_SESSION_TTL_TICKS } from "../src/domain/interaction";
import { ACTION_LIMITS } from "../src/domain/rate_limit";
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

function cataloguedZone(): StarterZoneState {
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
    {},
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

function interactionMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound.filter((item) => item.opcode === ServerOpcode.INTERACTION_RESULT);
}

function interactionBody(result: ReturnType<typeof applyMatchLoop>) {
  const messages = interactionMessages(result);
  assert.equal(messages.length, 1);
  return JSON.parse(messages[0].body) as {
    ok: boolean;
    code: string;
    requestId: string;
    targetId: string;
    dialogueId?: string;
    services?: string[];
    interactionSessionId?: string;
    currentNodeId?: string;
    allowedOptionIds?: string[];
    availableServiceIds?: string[];
    expiresAtTick?: number;
  };
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

test("approved interaction includes npc services and dialogue id", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const zone = createStarterZoneState(
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
    {},
    { npcsById: npcDefinitionsFromContent(content.npcs) },
  );
  const state = addPlayer(zone, playerAt("user-alice", "Alice", elder.x, elder.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-interact-svc01" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, true);
  assert.equal(body.dialogueId, "dialogue.npc.elder");
  assert.equal(Array.isArray(body.services) && body.services.indexOf("quest_offer") !== -1, true);
});

test("repeated interact request id replays without reapplying talk objectives", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  const zone = createStarterZoneState(
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
    {},
    { npcsById: npcDefinitionsFromContent(content.npcs) },
  );
  let state = addPlayer(zone, playerAt("user-alice", "Alice", herald.x, herald.y));
  state = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({ questId: "quest.test.talk", requestId: "req-talk-accept-replay" }),
      userId: "user-alice",
    },
  ]).state;
  const first = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-interact-replay" }),
      userId: "user-alice",
    },
  ]);
  const firstBody = interactionBody(first);
  assert.equal(firstBody.ok, true);
  assert.equal(first.state.players["user-alice"].questLog.quests["quest.test.talk"].objectives[0].current, 1);
  assert.equal(first.state.players["user-alice"].interactionSession?.state, "active");
  first.state.players["user-alice"].questLog.quests["quest.test.talk"].objectives[0].current = 0;
  const replay = applyMatchLoop(first.state, 3, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-interact-replay" }),
      userId: "user-alice",
    },
  ]);
  const replayBody = interactionBody(replay);
  assert.equal(replayBody.ok, true);
  assert.equal(replayBody.requestId, "req-interact-replay");
  assert.equal(replay.state.players["user-alice"].questLog.quests["quest.test.talk"].objectives[0].current, 0);
});

test("link-dead character interaction is rejected", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const actor = playerAt("user-alice", "Alice", elder.x, elder.y);
  actor.linkDead = true;
  const state = addPlayer(emptyZone(), actor);
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-interact-ld01" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, false);
  assert.equal(body.code, "link_dead");
});

test("transferring character interaction is rejected", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const actor = playerAt("user-alice", "Alice", elder.x, elder.y);
  actor.transferState = "issued";
  const state = addPlayer(emptyZone(), actor);
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-interact-xf01" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, false);
  assert.equal(body.code, "already_transferring");
});

test("dialogue start returns the current node, options, services, and expiry", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  const state = addPlayer(cataloguedZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-start01" }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(result);
  assert.equal(body.ok, true);
  assert.equal(body.dialogueId, "dialogue.npc.test_herald");
  assert.equal(body.currentNodeId, "start");
  assert.ok(Array.isArray(body.allowedOptionIds) && body.allowedOptionIds.indexOf("opt.hear_more") !== -1);
  assert.ok(Array.isArray(body.availableServiceIds));
  assert.equal(body.expiresAtTick, 1 + INTERACTION_SESSION_TTL_TICKS);
  assert.equal(typeof body.interactionSessionId, "string");
  assert.ok((body.interactionSessionId as string).length >= 8);
  assert.equal(result.state.players["user-alice"].interactionSession?.state, "active");
});

test("valid dialogue choice advances to the next node", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  let state = addPlayer(cataloguedZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  const opened = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-open01" }),
      userId: "user-alice",
    },
  ]);
  const session = opened.state.players["user-alice"].interactionSession;
  assert.ok(session);
  state = opened.state;
  const chosen = applyMatchLoop(state, 2, contentHash, [
    {
      opcode: ClientOpcode.DIALOGUE_CHOOSE,
      raw: envelope({
        interactionSessionId: session.sessionId,
        optionId: "opt.hear_more",
        requestId: "req-dlg-yes001",
      }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(chosen);
  assert.equal(body.ok, true);
  assert.equal(body.currentNodeId, "more");
  assert.equal(chosen.state.players["user-alice"].interactionSession?.currentNodeId, "more");
});

test("invalid dialogue choice is rejected without advancing", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  const opened = applyMatchLoop(addPlayer(cataloguedZone(), playerAt("user-alice", "Alice", herald.x, herald.y)), 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-open02" }),
      userId: "user-alice",
    },
  ]);
  const session = opened.state.players["user-alice"].interactionSession;
  assert.ok(session);
  const chosen = applyMatchLoop(opened.state, 2, contentHash, [
    {
      opcode: ClientOpcode.DIALOGUE_CHOOSE,
      raw: envelope({
        interactionSessionId: session.sessionId,
        optionId: "opt.missing",
        requestId: "req-dlg-bad001",
      }),
      userId: "user-alice",
    },
  ]);
  const body = interactionBody(chosen);
  assert.equal(body.ok, false);
  assert.equal(body.code, "invalid_option");
  assert.equal(chosen.state.players["user-alice"].interactionSession?.currentNodeId, "start");
});

test("expired interaction session is rejected", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  const opened = applyMatchLoop(addPlayer(cataloguedZone(), playerAt("user-alice", "Alice", herald.x, herald.y)), 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-open03" }),
      userId: "user-alice",
    },
  ]);
  const session = opened.state.players["user-alice"].interactionSession;
  assert.ok(session);
  const expiredTick = session.expiresAtTick + 1;
  const expired = applyMatchLoop(opened.state, expiredTick, contentHash, []);
  const messages = interactionMessages(expired);
  assert.equal(messages.length, 1);
  const body = JSON.parse(messages[0].body) as { ok: boolean; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "session_expired");
  assert.equal(expired.state.players["user-alice"].interactionSession?.state, "expired");
  const choose = applyMatchLoop(expired.state, expiredTick + 1, contentHash, [
    {
      opcode: ClientOpcode.DIALOGUE_CHOOSE,
      raw: envelope({
        interactionSessionId: session.sessionId,
        optionId: "opt.hear_more",
        requestId: "req-dlg-exp001",
      }),
      userId: "user-alice",
    },
  ]);
  const chooseBody = interactionBody(choose);
  assert.equal(chooseBody.ok, false);
  assert.equal(chooseBody.code, "session_expired");
});

test("repeated interact request id replays the same session fields", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  const first = applyMatchLoop(addPlayer(cataloguedZone(), playerAt("user-alice", "Alice", herald.x, herald.y)), 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-rplay1" }),
      userId: "user-alice",
    },
  ]);
  const firstBody = interactionBody(first);
  const replay = applyMatchLoop(first.state, 2, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-rplay1" }),
      userId: "user-alice",
    },
  ]);
  const replayBody = interactionBody(replay);
  assert.equal(replayBody.ok, true);
  assert.equal(replayBody.interactionSessionId, firstBody.interactionSessionId);
  assert.equal(replayBody.currentNodeId, firstBody.currentNodeId);
  assert.deepEqual(replayBody.allowedOptionIds, firstBody.allowedOptionIds);
  assert.equal(replay.state.players["user-alice"].interactionSession?.sessionId, firstBody.interactionSessionId);
});

test("multiple players may interact with the same NPC", () => {
  const herald = content.zones["zone.starter"].npcs.find((row) => row.npcId === "npc.test_herald");
  assert.ok(herald);
  let state = addPlayer(cataloguedZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", herald.x, herald.y));
  const alice = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-alice1" }),
      userId: "user-alice",
    },
  ]);
  const bob = applyMatchLoop(alice.state, 2, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.test_herald", requestId: "req-dlg-bob001" }),
      userId: "user-bob",
    },
  ]);
  assert.equal(interactionBody(alice).ok, true);
  assert.equal(interactionBody(bob).ok, true);
  const aliceSession = bob.state.players["user-alice"].interactionSession;
  const bobSession = bob.state.players["user-bob"].interactionSession;
  assert.ok(aliceSession);
  assert.ok(bobSession);
  assert.notEqual(aliceSession.sessionId, bobSession.sessionId);
  assert.equal(aliceSession.state, "active");
  assert.equal(bobSession.state, "active");
});

test("interact actions are rate limited in the interact bucket", () => {
  const elder = content.zones["zone.starter"].npcs[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const flood: { opcode: number; raw: string; userId: string }[] = [];
  for (let i = 0; i < ACTION_LIMITS.interact + 1; i++) {
    flood.push({
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-rl-" + String(i).padStart(2, "0") }),
      userId: "user-alice",
    });
  }
  const result = applyMatchLoop(state, 1, contentHash, flood);
  assert.ok(result.rejections.some((row) => row.action === "interact" && row.code === "rate_limited"));
});
