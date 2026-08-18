import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import {
  PLAYER_HALF_EXTENT,
  aabbsOverlap,
  intendedDelta,
  playerAabb,
  resolveMove,
  sanitizeAxes,
} from "../src/domain/movement";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
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
  return createStarterZoneState(contentHash, content.zones["zone.starter"], enemiesById(), {
    id: content.player.id,
    maxHealth: content.player.maxHealth,
    moveSpeed: content.player.moveSpeed,
    interactionRange: content.player.interactionRange,
  }, questDefinitionsFromContent(content.quests));
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

function input(seq: number, axisX: number, axisY: number): string {
  return envelope({ seq: seq, axisX: axisX, axisY: axisY });
}

function step(
  state: StarterZoneState,
  tick: number,
  userId: string,
  seq: number,
  axisX: number,
  axisY: number,
) {
  return applyMatchLoop(state, tick, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: input(seq, axisX, axisY), userId: userId },
  ]);
}

test("diagonal movement is normalized to content speed", () => {
  const axes = sanitizeAxes(1, 1);
  assert.ok(Math.abs(axes.x - axes.y) < 1e-12);
  assert.ok(Math.abs(Math.sqrt(axes.x * axes.x + axes.y * axes.y) - 1) < 1e-12);
  const dt = 1 / MATCH_TICK_RATE;
  const diagonal = intendedDelta(1, 1, content.player.moveSpeed, dt);
  const cardinal = intendedDelta(1, 0, content.player.moveSpeed, dt);
  const diagonalSpeed = Math.sqrt(diagonal.x * diagonal.x + diagonal.y * diagonal.y);
  assert.ok(Math.abs(diagonalSpeed - Math.abs(cardinal.x)) < 1e-9);

  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const before = state.players["user-alice"];
  const result = step(state, 1, "user-alice", 1, 1, 1);
  const moved = result.state.players["user-alice"];
  const dx = moved.x - before.x;
  const dy = moved.y - before.y;
  assert.ok(Math.abs(dx - dy) < 1e-9);
  assert.ok(Math.abs(Math.sqrt(dx * dx + dy * dy) - content.player.moveSpeed * dt) < 1e-9);
});

test("NaN and infinite axis values are rejected without moving", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const before = state.players["user-alice"];
  const nan = applyMatchLoop(state, 1, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: '{"protocolVersion":1,"seq":1,"axisX":1e999,"axisY":0}', userId: "user-alice" },
  ]);
  assert.equal(nan.state.players["user-alice"].x, before.x);
  assert.equal(nan.state.players["user-alice"].y, before.y);
  assert.equal(JSON.parse(nan.outbound[0].body).code, "invalid_input");

  const missing = applyMatchLoop(state, 2, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: null, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(missing.state.players["user-alice"].x, before.x);
  assert.equal(JSON.parse(missing.outbound[0].body).code, "invalid_input");
});

test("out-of-range axes are clamped to the same speed as a unit vector", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const unit = step(state, 1, "user-alice", 1, 1, 0);
  const extreme = step(state, 1, "user-alice", 1, 100, 0);
  assert.equal(unit.state.players["user-alice"].x, extreme.state.players["user-alice"].x);
  assert.equal(unit.state.players["user-alice"].y, extreme.state.players["user-alice"].y);
  const dt = 1 / MATCH_TICK_RATE;
  assert.ok(Math.abs(unit.state.players["user-alice"].x - (400 + content.player.moveSpeed * dt)) < 1e-9);
});

test("stale sequence numbers are ignored", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const first = step(state, 1, "user-alice", 5, 1, 0);
  const afterFirst = first.state.players["user-alice"].x;
  const stale = step(first.state, 2, "user-alice", 5, -1, 0);
  assert.equal(stale.state.players["user-alice"].x, afterFirst + (afterFirst - 400));
  assert.equal(stale.state.players["user-alice"].lastProcessedSeq, 5);
  const older = step(first.state, 3, "user-alice", 4, -1, 0);
  assert.equal(older.state.players["user-alice"].lastProcessedSeq, 5);
  assert.ok(older.state.players["user-alice"].x > afterFirst);
});

test("world bounds stop movement", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 80, 400));
  let current = state;
  for (let i = 1; i <= 20; i++) {
    current = step(current, i, "user-alice", i, -1, 0).state;
  }
  const minX = content.zones["zone.starter"].walkableBounds.x + 12;
  assert.ok(current.players["user-alice"].x >= minX - 1e-9);
  assert.equal(current.players["user-alice"].x, minX);
});

test("obstacle collision blocks movement", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 200, 280));
  let current = state;
  for (let i = 1; i <= 20; i++) {
    current = step(current, i, "user-alice", i, -1, 0).state;
  }
  const obstacleRight = 80 + 96;
  const minX = obstacleRight + 12;
  assert.ok(current.players["user-alice"].x >= minX - 1e-9);
  assert.equal(current.players["user-alice"].x, minX);
});

test("speed-hack style payloads cannot increase speed", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  const honest = step(state, 1, "user-alice", 1, 1, 0);
  const injected = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: 1, axisX: 1, axisY: 0, speed: 999, dt: 5, x: 12, y: 12 }),
      userId: "user-alice",
    },
  ]);
  assert.equal(injected.state.players["user-alice"].x, 400);
  assert.equal(injected.state.players["user-alice"].y, 400);
  assert.equal(JSON.parse(injected.outbound[0].body).code.indexOf("stat_injection:"), 0);
  const parsed = parseClientMessage(
    ClientOpcode.INPUT,
    envelope({ seq: 1, axisX: 1, axisY: 0, position: { x: 1, y: 1 } }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), true);

  const many = applyMatchLoop(state, 2, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: input(1, 1, 0), userId: "user-alice" },
    { opcode: ClientOpcode.INPUT, raw: input(2, 1, 0), userId: "user-alice" },
    { opcode: ClientOpcode.INPUT, raw: input(3, 1, 0), userId: "user-alice" },
  ]);
  assert.ok(Math.abs(many.state.players["user-alice"].x - honest.state.players["user-alice"].x) < 1e-9);
});

test("dead and disconnected players do not move", () => {
  const dead = playerAt("user-alice", "Alice", 400, 400);
  dead.health = 0;
  let state = addPlayer(emptyZone(), dead);
  const deadResult = step(state, 1, "user-alice", 1, 1, 0);
  assert.equal(deadResult.state.players["user-alice"].x, 400);
  assert.equal(deadResult.state.players["user-alice"].lastProcessedSeq, 1);

  const disconnected = applyMatchLoop(emptyZone(), 1, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: input(1, 1, 0), userId: "user-bob" },
  ]);
  assert.equal(disconnected.state.players["user-bob"], undefined);
  assert.equal(Object.keys(disconnected.state.players).length, 0);
});

test("alice and bob move independently and share snapshot positions", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state = addPlayer(state, playerAt("user-bob", "Bob", 500, 400));
  const result = applyMatchLoop(state, 7, contentHash, [
    { opcode: ClientOpcode.INPUT, raw: input(1, 1, 0), userId: "user-alice" },
    { opcode: ClientOpcode.INPUT, raw: input(1, 0, 1), userId: "user-bob" },
  ]);
  const alice = result.state.players["user-alice"];
  const bob = result.state.players["user-bob"];
  assert.ok(alice.x > 400);
  assert.equal(alice.y, 400);
  assert.equal(bob.x, 500);
  assert.ok(bob.y > 400);
  const snap = result.outbound.filter((item) => item.opcode === ServerOpcode.SNAPSHOT);
  assert.equal(snap.length, 1);
  const body = JSON.parse(snap[0].body);
  assert.equal(body.tick, 7);
  assert.equal(body.players.length, 2);
  assert.equal(body.players[0].x, alice.x);
  assert.equal(body.players[1].x, bob.x);
  assert.equal(body.players[0].lastProcessedSeq, 1);
  assert.equal(body.players[1].lastProcessedSeq, 1);
});

test("already overlapping an obstacle is pushed out instead of sinking further", () => {
  const bounds = content.zones["zone.starter"].walkableBounds;
  const collisions = content.zones["zone.starter"].collisions;
  const inside = resolveMove(695, 504, -12, 0, PLAYER_HALF_EXTENT, collisions, bounds);
  assert.equal(
    aabbsOverlap(playerAabb(inside.x, inside.y, PLAYER_HALF_EXTENT), {
      x: 640,
      y: 480,
      width: 48,
      height: 48,
    }),
    false,
  );
  assert.ok(inside.x >= 688 + PLAYER_HALF_EXTENT - 1e-9);
});

test("extended sliding along an obstacle stays outside it", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 760, 504));
  let current = state;
  for (let i = 1; i <= 30; i++) {
    current = step(current, i, "user-alice", i, -1, 0).state;
    const pose = current.players["user-alice"];
    assert.equal(
      aabbsOverlap(playerAabb(pose.x, pose.y, PLAYER_HALF_EXTENT), {
        x: 640,
        y: 480,
        width: 48,
        height: 48,
      }),
      false,
    );
    assert.ok(pose.x >= 688 + PLAYER_HALF_EXTENT - 1e-9);
  }
  assert.equal(current.players["user-alice"].x, 688 + PLAYER_HALF_EXTENT);
});

test("living players block each other and dead players do not", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  state = addPlayer(state, playerAt("user-bob", "Bob", 448, 400));
  let current = state;
  for (let i = 1; i <= 10; i++) {
    current = step(current, i, "user-alice", i, 1, 0).state;
  }
  const alice = current.players["user-alice"];
  const bob = current.players["user-bob"];
  assert.equal(
    aabbsOverlap(
      playerAabb(alice.x, alice.y, PLAYER_HALF_EXTENT),
      playerAabb(bob.x, bob.y, PLAYER_HALF_EXTENT),
    ),
    false,
  );
  assert.ok(alice.x <= bob.x - PLAYER_HALF_EXTENT * 2 + 1e-9);
  assert.ok(alice.x < 400 + content.player.moveSpeed);

  const corpse = playerAt("user-bob", "Bob", 424, 400);
  corpse.health = 0;
  let open = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 400, 400));
  open = addPlayer(open, corpse);
  const through = step(open, 1, "user-alice", 1, 1, 0).state;
  assert.equal(through.players["user-alice"].x, 400 + content.player.moveSpeed * (1 / MATCH_TICK_RATE));
});

test("npcs block movement", () => {
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", 320, 700));
  let current = state;
  for (let i = 1; i <= 20; i++) {
    current = step(current, i, "user-alice", i, 0, -1).state;
    const pose = current.players["user-alice"];
    assert.equal(
      aabbsOverlap(playerAabb(pose.x, pose.y, PLAYER_HALF_EXTENT), playerAabb(320, 640, PLAYER_HALF_EXTENT)),
      false,
    );
  }
  assert.ok(current.players["user-alice"].y >= 640 + PLAYER_HALF_EXTENT * 2 - 1e-9);
});
