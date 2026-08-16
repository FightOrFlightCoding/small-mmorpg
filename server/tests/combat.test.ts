import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  PLAYER_RESPAWN_DELAY_SEC,
  cooldownTicks,
} from "../src/domain/combat";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";

function enemiesById() {
  const map: { [id: string]: { id: string; maxHealth: number } } = {};
  const ids = Object.keys(content.enemies);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const def = content.enemies[id as keyof typeof content.enemies];
    map[id] = def;
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
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
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

function slime(state: StarterZoneState) {
  return state.enemies[0];
}

function attack(userId: string, targetId: string, requestId: string) {
  return {
    opcode: ClientOpcode.ATTACK,
    raw: envelope({ targetId: targetId, requestId: requestId }),
    userId: userId,
  };
}

function step(state: StarterZoneState, tick: number, messages: { opcode: number; raw: string; userId: string }[] = []) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function combatBodies(result: { outbound: { opcode: number; body: string }[] }) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.COMBAT_EVENT)
    .map((item) => JSON.parse(item.body));
}

function actionCodes(result: { outbound: { opcode: number; body: string }[] }) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body));
}

test("attack in range uses server attack and is seen by both clients", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 8, spawn.y));
  const before = slime(state).health;
  const result = step(state, 20, [attack("user-alice", slime(state).id, "req-atk-in-range")]);
  const actions = actionCodes(result);
  assert.equal(actions[0].ok, true);
  assert.equal(actions[0].code, "ok");
  assert.equal(result.state.enemies[0].health, before - content.player.attack);
  const snap = result.outbound.filter((item) => item.opcode === ServerOpcode.SNAPSHOT);
  const body = JSON.parse(snap[0].body);
  assert.equal(body.enemies[0].health, before - content.player.attack);
  assert.equal(body.enemies[0].alive, true);
  const events = combatBodies(result)[0].events;
  assert.equal(events[0].type, "hit");
  assert.equal(events[0].damage, content.player.attack);
  assert.equal(events[0].sourceId, "user-alice");
});

test("attack out of range is rejected", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const before = slime(state).health;
  const result = step(state, 4, [attack("user-alice", slime(state).id, "req-atk-far")]);
  assert.equal(actionCodes(result)[0].code, "out_of_range");
  assert.equal(result.state.enemies[0].health, before);
});

test("attack cooldown rejects spam", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const first = step(state, 8, [attack("user-alice", slime(state).id, "req-atk-cd-1")]);
  assert.equal(actionCodes(first)[0].code, "ok");
  const second = step(first.state, 9, [attack("user-alice", slime(state).id, "req-atk-cd-2")]);
  assert.equal(actionCodes(second)[0].code, "on_cooldown");
  assert.equal(second.state.enemies[0].health, first.state.enemies[0].health);
});

test("unknown target is rejected", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const result = step(state, 3, [attack("user-alice", "enemy.missing", "req-atk-unknown")]);
  assert.equal(actionCodes(result)[0].code, "invalid_target");
});

test("dead attacker cannot attack", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 0));
  const before = slime(state).health;
  const result = step(state, 3, [attack("user-alice", slime(state).id, "req-atk-dead-self")]);
  assert.equal(actionCodes(result)[0].code, "player_dead");
  assert.equal(result.state.enemies[0].health, before);
});

test("dead target cannot be attacked", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = 0;
  state.enemies[0].aiState = "dead";
  state.enemies[0].deadUntilTick = 999;
  const result = step(state, 3, [attack("user-alice", slime(state).id, "req-atk-dead-target")]);
  assert.equal(actionCodes(result)[0].code, "target_dead");
});

test("client-supplied damage is ignored", () => {
  const parsed = parseClientMessage(
    ClientOpcode.ATTACK,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      targetId: "enemy.green_slime:0",
      requestId: "req-atk-dmg",
      damage: 999,
    }),
    contentHash,
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:damage");
  }
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const result = step(state, 5, [attack("user-alice", slime(state).id, "req-atk-server-dmg")]);
  assert.equal(result.state.enemies[0].health, content.enemies["enemy.green_slime"].maxHealth - content.player.attack);
});

test("enemy targets the nearest living player inside aggro", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x + 90, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 20, spawn.y));
  const result = step(state, 1, []);
  assert.equal(result.state.enemies[0].aggroTarget, "user-bob");
  assert.equal(result.state.enemies[0].aiState === "chasing" || result.state.enemies[0].aiState === "attacking", true);
});

test("enemy leashes back to spawn when pulled too far", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x + 40, spawn.y));
  state = step(state, 1, []).state;
  assert.equal(state.enemies[0].aiState === "idle", false);
  state.enemies[0].x = spawn.x + state.enemies[0].leashRadius + 8;
  state.enemies[0].y = spawn.y;
  const result = step(state, 2, []);
  assert.equal(result.state.enemies[0].aiState, "returning");
  assert.equal(result.state.enemies[0].aggroTarget, "");
  assert.ok(result.state.enemies[0].x < spawn.x + state.enemies[0].leashRadius + 8);
});

test("enemy attack cooldown is server-owned", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const first = step(state, 4, []);
  assert.equal(first.state.players["user-alice"].health, content.player.maxHealth - content.enemies["enemy.green_slime"].damage);
  const second = step(first.state, 5, []);
  assert.equal(second.state.players["user-alice"].health, first.state.players["user-alice"].health);
  const readyTick = 4 + cooldownTicks(content.enemies["enemy.green_slime"].attackCooldown, MATCH_TICK_RATE);
  let next = second.state;
  for (let tick = 6; tick < readyTick; tick++) {
    next = step(next, tick, []).state;
  }
  const third = step(next, readyTick, []);
  assert.equal(
    third.state.players["user-alice"].health,
    content.player.maxHealth - content.enemies["enemy.green_slime"].damage * 2,
  );
});

test("player death stops movement and respawns at spawn", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const home = content.zones["zone.starter"].playerSpawn;
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 2));
  const death = step(state, 10, []);
  assert.equal(death.state.players["user-alice"].health, 0);
  const events = combatBodies(death)[0].events;
  const types = events.map((row: { type: string }) => row.type);
  assert.equal(types.indexOf("death") !== -1, true);
  const moving = step(death.state, 11, [
    {
      opcode: ClientOpcode.INPUT,
      raw: envelope({ seq: 1, axisX: 1, axisY: 0 }),
      userId: "user-alice",
    },
  ]);
  assert.equal(moving.state.players["user-alice"].x, spawn.x);
  assert.equal(moving.state.players["user-alice"].health, 0);
  const attackWhileDead = step(moving.state, 12, [attack("user-alice", slime(moving.state).id, "req-atk-while-dead")]);
  assert.equal(actionCodes(attackWhileDead)[0].code, "player_dead");
  const respawnTick = 10 + cooldownTicks(PLAYER_RESPAWN_DELAY_SEC, MATCH_TICK_RATE);
  let next = attackWhileDead.state;
  for (let tick = 13; tick < respawnTick; tick++) {
    next = step(next, tick, []).state;
    assert.equal(next.players["user-alice"].health, 0);
  }
  const respawn = step(next, respawnTick, []);
  assert.equal(respawn.state.players["user-alice"].health, content.player.maxHealth);
  assert.equal(respawn.state.players["user-alice"].x, home.x);
  assert.equal(respawn.state.players["user-alice"].y, home.y);
});

test("slime death and respawn restore health at spawn", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = content.player.attack;
  const kill = step(state, 6, [attack("user-alice", slime(state).id, "req-atk-kill")]);
  assert.equal(kill.state.enemies[0].health, 0);
  assert.equal(kill.state.enemies[0].aiState, "dead");
  const snap = JSON.parse(kill.outbound.filter((item) => item.opcode === ServerOpcode.SNAPSHOT)[0].body);
  assert.equal(snap.enemies[0].alive, false);
  kill.state.enemies[0].respawnDelaySec = 0.5;
  kill.state.enemies[0].deadUntilTick = 6 + cooldownTicks(0.5, MATCH_TICK_RATE);
  const ready = 6 + cooldownTicks(0.5, MATCH_TICK_RATE);
  let next = kill.state;
  for (let tick = 7; tick < ready; tick++) {
    next = step(next, tick, []).state;
    assert.equal(next.enemies[0].aiState, "dead");
  }
  const respawn = step(next, ready, []);
  assert.equal(respawn.state.enemies[0].health, content.enemies["enemy.green_slime"].maxHealth);
  assert.equal(respawn.state.enemies[0].aiState, "idle");
  assert.equal(respawn.state.enemies[0].x, spawn.x);
  assert.equal(respawn.state.enemies[0].y, spawn.y);
});

test("duplicate attack requestId does not apply damage twice", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const first = step(state, 2, [attack("user-alice", slime(state).id, "req-atk-same")]);
  const second = step(first.state, 20, [attack("user-alice", slime(state).id, "req-atk-same")]);
  assert.equal(actionCodes(second)[0].code, "ok");
  assert.equal(second.state.enemies[0].health, first.state.enemies[0].health);
});
