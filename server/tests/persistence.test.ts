import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { checkpointCharacterPosition } from "../src/domain/character";
import { emptyEquipment } from "../src/domain/equipment";
import { emptyInventory } from "../src/domain/inventory";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  buildFullState,
  buildSnapshot,
  createStarterZoneState,
  playerCount,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import {
  CHECKPOINT_INTERVAL_TICKS,
  REQUEST_ID_TTL_TICKS,
  RECONNECT_GRACE_TICKS,
  applyPlayerLeave,
  bindJoiningSession,
  checkpointsForTerminate,
  collectPositionCheckpoints,
  expireDisconnected,
  joinHealth,
  lastProcessedSeqForSession,
  pruneKeyedHistory,
  restoreGracePlayer,
  takeGracePlayer,
} from "../src/domain/persistence";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";

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

function playerAt(userId: string, name: string, x: number, y: number, health?: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: health !== undefined ? health : content.player.maxHealth,
    lastProcessedSeq: 3,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    derivedAttack: content.player.attack,
    gold: 25,
    lastCheckpointTick: 0,
    lastCheckpointX: x,
    lastCheckpointY: y,
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

test("position checkpoints write on the interval only after movement", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state.players["user-alice"].lastCheckpointTick = 0;
  state.players["user-alice"].lastCheckpointX = 400;
  state.players["user-alice"].lastCheckpointY = 400;
  const idle = applyMatchLoop(state, CHECKPOINT_INTERVAL_TICKS, contentHash, []);
  assert.equal(idle.persistCheckpoints.length, 0);
  let moving = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  moving.players["user-alice"].lastCheckpointTick = 0;
  moving.players["user-alice"].lastCheckpointX = 400;
  moving.players["user-alice"].lastCheckpointY = 400;
  for (let tick = 1; tick < CHECKPOINT_INTERVAL_TICKS; tick++) {
    const step = applyMatchLoop(moving, tick, contentHash, [
      { opcode: ClientOpcode.INPUT, raw: envelope({ seq: tick, axisX: 1, axisY: 0 }), userId: "user-alice" },
    ]);
    assert.equal(step.persistCheckpoints.length, 0);
    moving = step.state;
  }
  const due = applyMatchLoop(moving, CHECKPOINT_INTERVAL_TICKS, contentHash, [
    {
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: CHECKPOINT_INTERVAL_TICKS, axisX: 1, axisY: 0 }),
      userId: "user-alice",
    },
  ]);
  assert.equal(due.persistCheckpoints.length, 1);
  assert.equal(due.persistCheckpoints[0].userId, "user-alice");
  assert.ok(due.persistCheckpoints[0].x > 400);
});

test("graceful leave checkpoints and removes the avatar from snapshots", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 512, 400));
  state = addPlayer(state, playerAt("user-bob", "Bob", 240, 384));
  state.players["user-alice"].health = 40;
  const left = applyPlayerLeave(state, "user-alice", 12);
  assert.equal(playerCount(left.state), 1);
  assert.equal(left.state.players["user-alice"], undefined);
  assert.ok(left.state.disconnected["user-alice"] !== undefined);
  assert.equal(left.checkpoint?.userId, "user-alice");
  assert.equal(left.checkpoint?.x, 512);
  const snap = JSON.parse(buildSnapshot(left.state, 12));
  assert.equal(snap.players.length, 1);
  assert.equal(snap.players[0].userId, "user-bob");
  const full = JSON.parse(buildFullState(left.state, 12, "user-bob"));
  assert.equal(full.players.length, 1);
});

test("abrupt leave uses the same presence removal path", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 500, 390));
  const left = applyPlayerLeave(state, "user-alice", 3);
  assert.equal(playerCount(left.state), 0);
  assert.equal(left.checkpoint?.x, 500);
  assert.equal(JSON.parse(buildSnapshot(left.state, 3)).players.length, 0);
});

test("rejoin during grace restores live pose and health", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 640, 400, 55));
  const left = applyPlayerLeave(state, "user-alice", 8);
  state = left.state;
  const parked = takeGracePlayer(state, "user-alice", 8 + RECONNECT_GRACE_TICKS - 1);
  assert.ok(parked !== null);
  const restored = restoreGracePlayer(
    parked,
    "session-reconnect",
    "alice",
    parked.questLog,
    parked.inventory !== undefined ? parked.inventory : emptyInventory(),
    parked.equipment !== undefined ? parked.equipment : emptyEquipment(),
    parked.derivedAttack !== undefined ? parked.derivedAttack : 4,
    parked.gold !== undefined ? parked.gold : 0,
  );
  assert.equal(restored.x, 640);
  assert.equal(restored.health, 55);
  assert.equal(restored.lastProcessedSeq, 0);
  assert.equal(restored.sessionId, "session-reconnect");
  assert.equal(joinHealth(content.player.maxHealth), content.player.maxHealth);
});

test("same-session grace rejoin keeps lastProcessedSeq", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 640, 400, 55));
  const parkedSession = state.players["user-alice"].sessionId;
  const left = applyPlayerLeave(state, "user-alice", 8);
  const parked = takeGracePlayer(left.state, "user-alice", 9);
  assert.ok(parked !== null);
  const restored = restoreGracePlayer(
    parked,
    parkedSession,
    "alice",
    parked.questLog,
    parked.inventory !== undefined ? parked.inventory : emptyInventory(),
    parked.equipment !== undefined ? parked.equipment : emptyEquipment(),
    parked.derivedAttack !== undefined ? parked.derivedAttack : 4,
    parked.gold !== undefined ? parked.gold : 0,
  );
  assert.equal(lastProcessedSeqForSession(parkedSession, parkedSession, 3), 3);
  assert.equal(restored.lastProcessedSeq, 3);
  assert.equal(restored.health, 55);
});

test("new session grace rejoin resets input sequence so the first INPUT applies", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state.players["user-alice"].lastProcessedSeq = 40;
  const left = applyPlayerLeave(state, "user-alice", 5);
  const parked = takeGracePlayer(left.state, "user-alice", 6);
  assert.ok(parked !== null);
  const restored = restoreGracePlayer(
    parked,
    "session-new-login",
    "alice",
    parked.questLog,
    parked.inventory !== undefined ? parked.inventory : emptyInventory(),
    parked.equipment !== undefined ? parked.equipment : emptyEquipment(),
    parked.derivedAttack !== undefined ? parked.derivedAttack : 4,
    parked.gold !== undefined ? parked.gold : 0,
  );
  assert.equal(restored.lastProcessedSeq, 0);
  state = addPlayer(left.state, restored);
  const result = applyMatchLoop(state, 7, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: 1, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(result.state.players["user-alice"].lastProcessedSeq, 1);
  assert.ok(result.state.players["user-alice"].x > 400);
});

test("live resume with a new session resets lastProcessedSeq", () => {
  const player = playerAt("user-alice", "Alice", 512, 400);
  player.lastProcessedSeq = 12;
  player.axisX = 1;
  bindJoiningSession(player, "session-new-login", "alice");
  assert.equal(player.lastProcessedSeq, 0);
  assert.equal(player.axisX, 0);
  assert.equal(player.sessionId, "session-new-login");
});

test("live resume with the same session keeps lastProcessedSeq", () => {
  const player = playerAt("user-alice", "Alice", 512, 400);
  bindJoiningSession(player, "session-user-alice", "alice");
  assert.equal(player.lastProcessedSeq, 3);
  assert.equal(player.sessionId, "session-user-alice");
});

test("rejoin after grace loads checkpointed position and full health", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 700, 410, 12));
  const left = applyPlayerLeave(state, "user-alice", 10);
  state = left.state;
  expireDisconnected(state, 10 + RECONNECT_GRACE_TICKS);
  assert.equal(state.disconnected["user-alice"], undefined);
  const parked = takeGracePlayer(state, "user-alice", 10 + RECONNECT_GRACE_TICKS + 1);
  assert.equal(parked, null);
  const record = checkpointCharacterPosition(
    {
      characterId: "char-user-alice",
      name: "Alice",
      contentId: "player.base",
      zoneId: "zone.starter",
      position: { x: 240, y: 384 },
      storageVersion: "v1",
      schemaVersion: 1,
      createdAt: 0,
      updatedAt: 0,
    },
    left.checkpoint !== null ? left.checkpoint.x : 0,
    left.checkpoint !== null ? left.checkpoint.y : 0,
  );
  assert.equal(record.position.x, 700);
  assert.equal(joinHealth(content.player.maxHealth), 100);
});

test("abandoned request ids are dropped after the ttl", () => {
  const ticks: { [requestId: string]: number } = { "req-old": 1, "req-fresh": 10 };
  const pruned = pruneKeyedHistory(["req-old", "req-fresh"], ticks, 1 + REQUEST_ID_TTL_TICKS);
  assert.equal(pruned.changed, true);
  assert.equal(pruned.keep["req-old"], undefined);
  assert.equal(pruned.keep["req-fresh"], true);
});

test("inventory, quest, equipment, and wallet survive a fresh match after restart", () => {
  const previous = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 812, 420));
  previous.players["user-alice"].gold = 25;
  previous.players["user-alice"].questLog.quests["quest.slime_problem"] = {
    questId: "quest.slime_problem",
    status: "completed",
    objectives: [{ type: "acquire_item", itemId: "item.slime_gel", current: 1, required: 1 }],
  };
  previous.players["user-alice"].inventory = {
    capacity: 20,
    items: [
      {
        instanceId: "inst-iron",
        itemId: "item.iron_sword",
        quantity: 1,
        createdAt: 0,
        sourceType: "quest_reward",
        sourceId: "quest.slime_problem",
        metadata: {},
        lockReason: "",
        lockId: "",
        slotIndex: 0,
      },
    ],
    pickupByRequestId: {},
  };
  previous.players["user-alice"].equipment = {
    slots: { main_hand: "inst-iron" },
    equipByRequestId: {},
  };
  previous.enemies[0].health = 1;
  previous.loot.push({
    id: "loot-temp",
    itemId: "item.slime_gel",
    quantity: 1,
    instanceId: "inst-gel",
    x: 900,
    y: 400,
    expiresAtTick: 50,
  });
  const stored = previous.players["user-alice"];
  const restarted = emptyZone();
  const rejoined: MatchPlayer = {
    userId: stored.userId,
    sessionId: "session-new",
    username: stored.username,
    characterId: stored.characterId,
    name: stored.name,
    x: stored.x,
    y: stored.y,
    maxHealth: stored.maxHealth,
    health: joinHealth(stored.maxHealth),
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: stored.questLog,
    inventory: stored.inventory,
    equipment: stored.equipment,
    derivedAttack: stored.derivedAttack,
    gold: stored.gold,
  };
  const next = addPlayer(restarted, rejoined);
  assert.equal(next.players["user-alice"].x, 812);
  assert.equal(next.players["user-alice"].health, content.player.maxHealth);
  assert.equal(next.players["user-alice"].gold, 25);
  assert.equal(next.players["user-alice"].questLog.quests["quest.slime_problem"].status, "completed");
  assert.equal(next.players["user-alice"].inventory?.items[0].itemId, "item.iron_sword");
  assert.equal(next.players["user-alice"].equipment?.slots.main_hand, "inst-iron");
  assert.equal(next.enemies[0].health, next.enemies[0].maxHealth);
  assert.equal(next.enemies[0].aiState, "idle");
  assert.equal(next.loot.length, 0);
});

test("match terminate checkpoints remaining live players", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 333, 390));
  const checkpoints = checkpointsForTerminate(state);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].x, 333);
});

test("occupied ticks do not persist a checkpoint every tick", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  for (let tick = 1; tick < CHECKPOINT_INTERVAL_TICKS; tick++) {
    const step = applyMatchLoop(state, tick, contentHash, []);
    assert.equal(step.persistCheckpoints.length, 0);
    state = step.state;
  }
});

test("collectPositionCheckpoints skips idle players after the interval", () => {
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state.players["user-alice"].lastCheckpointTick = 0;
  const first = collectPositionCheckpoints(state, CHECKPOINT_INTERVAL_TICKS);
  assert.equal(first.length, 0);
});

function poisonEmptyMaps(state: StarterZoneState): StarterZoneState {
  const copy = JSON.parse(JSON.stringify(state));
  copy.disconnected = null;
  const ids = Object.keys(copy.players);
  for (let i = 0; i < ids.length; i++) {
    const player = copy.players[ids[i]];
    player.questLog.quests = null;
    player.questLog.acceptByRequestId = null;
    player.questLog.turnInByRequestId = null;
    player.questLog.extras = null;
    if (player.inventory !== undefined) {
      player.inventory.pickupByRequestId = null;
      player.inventory.extras = null;
    }
    if (player.equipment !== undefined) {
      player.equipment.equipByRequestId = null;
      player.equipment.extras = null;
    }
  }
  return copy as StarterZoneState;
}

test("match loop survives Nakama null maps on tick 0", () => {
  const poisoned = poisonEmptyMaps(addPlayer(emptyZone(), playerAt("user-alice", "Alice", 512, 400)));
  const result = applyMatchLoop(poisoned, 0, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 4, axisX: 1, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(result.state.players["user-alice"].userId, "user-alice");
  assert.equal(result.state.players["user-alice"].lastProcessedSeq, 4);
  assert.deepEqual(result.state.disconnected, {});
});

test("player leave survives Nakama null disconnected map", () => {
  const poisoned = poisonEmptyMaps(addPlayer(emptyZone(), playerAt("user-alice", "Alice", 512, 400)));
  const left = applyPlayerLeave(poisoned, "user-alice", 1);
  assert.equal(playerCount(left.state), 0);
  assert.ok(left.state.disconnected["user-alice"] !== undefined);
  assert.equal(left.checkpoint?.x, 512);
});

test("JSON roundtrip of live match state still loops", () => {
  const roundtripped = JSON.parse(
    JSON.stringify(addPlayer(emptyZone(), playerAt("user-alice", "Alice", 512, 400))),
  ) as StarterZoneState;
  const result = applyMatchLoop(roundtripped, 0, contentHash, []);
  assert.equal(result.state.players["user-alice"].userId, "user-alice");
});
