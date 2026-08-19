import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import {
  COMBAT_PIPELINE_STEPS,
  applyCombat,
  applyPlayerRespawn,
  applyReleaseRespawn,
  evaluateCombatFormula,
} from "../src/domain/combat_pipeline";
import { PLAYER_RESPAWN_DELAY_SEC, cooldownTicks, type CombatEvent } from "../src/domain/combat";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import {
  RECONNECT_GRACE_TICKS,
  applyPlayerLeave,
  restoreGracePlayer,
  takeGracePlayer,
} from "../src/domain/persistence";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { applySetTarget, resolveTargetQuery } from "../src/domain/targeting";

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
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    gold: 25,
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

function step(state: StarterZoneState, tick: number, messages: { opcode: number; raw: string; userId: string }[] = []) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function actionCodes(result: { outbound: { opcode: number; body: string }[] }) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body));
}

test("damage pipeline records every resolution stage in order", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const events: CombatEvent[] = [];
  const result = applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: slime(state).id,
      targetKind: "enemy",
      formula: { base: 4 },
      tick: 4,
      eventId: "pipe-order-1",
    },
    events,
  );
  assert.deepEqual(result.steps, COMBAT_PIPELINE_STEPS.slice());
  assert.equal(result.amount, 4);
  assert.equal(result.stages.base, 4);
  assert.equal(result.stages.finalAmount, 4);
  assert.equal(events[0].type, "hit");
});

test("healing uses the combat pipeline and clamps to max health", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 40));
  const events: CombatEvent[] = [];
  const result = applyCombat(
    state,
    {
      action: "heal",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: "user-alice",
      targetKind: "player",
      formula: { base: 25 },
      tick: 3,
      eventId: "pipe-heal-1",
    },
    events,
  );
  assert.equal(result.ok, true);
  assert.equal(result.amount, 25);
  assert.equal(state.players["user-alice"].health, 65);
  assert.equal(events[0].type, "heal");
  const overheal = applyCombat(
    state,
    {
      action: "heal",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: "user-alice",
      targetKind: "player",
      formula: { base: 200 },
      tick: 4,
      eventId: "pipe-heal-2",
    },
    events,
  );
  assert.equal(overheal.remainingHealth, content.player.maxHealth);
});

test("defense mitigation reduces damage with a structured formula", () => {
  const stages = evaluateCombatFormula({ base: 100, defense: 100 }, "damage", 0);
  assert.equal(stages.afterMitigation, 50);
  assert.equal(stages.finalAmount, 50);
  const unmitigated = evaluateCombatFormula({ base: 4, defense: 0 }, "damage", 0);
  assert.equal(unmitigated.finalAmount, 4);
});

test("stat modifiers apply after base magnitude", () => {
  const stages = evaluateCombatFormula(
    {
      base: 10,
      sourceStatValue: 4,
      sourceStatCoefficient: 0.5,
      sourceFlat: 3,
      sourcePercent: 1,
      targetFlat: 2,
      targetPercent: 0,
    },
    "damage",
    0,
  );
  assert.equal(stages.base, 10);
  assert.equal(stages.afterSource, 30);
  assert.equal(stages.afterTarget, 32);
  assert.equal(stages.finalAmount, 32);
});

test("periodic damage reuses the pipeline each tick", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const before = slime(state).health;
  const events: CombatEvent[] = [];
  applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: slime(state).id,
      targetKind: "enemy",
      formula: { base: 2 },
      tick: 8,
      eventId: "dot:8",
    },
    events,
  );
  applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: slime(state).id,
      targetKind: "enemy",
      formula: { base: 2 },
      tick: 9,
      eventId: "dot:9",
    },
    events,
  );
  assert.equal(slime(state).health, before - 4);
});

test("pipeline death interrupts casts and strips temporary effects", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 2));
  state.players["user-alice"].activeCast = {
    abilityId: "test.ability.ranged_bolt",
    casterId: "user-alice",
    targetId: slime(state).id,
    targetX: spawn.x,
    targetY: spawn.y,
    startTick: 1,
    completionTick: 20,
    channelUntilTick: 0,
    phase: "casting",
    interruptReason: "",
    requestId: "req-cast-death1",
  };
  state.players["user-alice"].effects = [
    {
      effectId: "buff",
      abilityId: "test.ability.power_buff",
      sourceId: "user-alice",
      sourceKind: "player",
      type: "timed_stat_modifier",
      stacks: 1,
      magnitude: 2,
      remainingTicks: 10,
      tickIntervalTicks: 0,
      nextTickAt: 0,
      stackPolicy: "refresh",
      maxStacks: 1,
      refreshPolicy: "refresh",
      tags: [],
      statChannel: "attack",
      resourceRole: "",
    },
  ];
  const events: CombatEvent[] = [];
  const result = applyCombat(
    state,
    {
      action: "damage",
      sourceId: slime(state).id,
      sourceKind: "enemy",
      targetId: "user-alice",
      targetKind: "player",
      formula: { base: 4 },
      tick: 12,
      eventId: "pipe-death-1",
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
      tickRate: MATCH_TICK_RATE,
    },
    events,
  );
  assert.equal(result.died, true);
  assert.equal(state.players["user-alice"].health, 0);
  assert.equal(state.players["user-alice"].activeCast, undefined);
  assert.equal(state.players["user-alice"].effects.length, 0);
  assert.equal(
    events.some((event) => event.type === "interrupt" && event.interruptReason === "death"),
    true,
  );
  assert.equal(events.some((event) => event.type === "death"), true);
});

test("dead characters cannot move, attack, or interact", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 2));
  const death = step(state, 10, []);
  assert.equal(death.state.players["user-alice"].health, 0);
  const moving = step(death.state, 11, [
    { opcode: ClientOpcode.INPUT, raw: envelope({ seq: 1, axisX: 1, axisY: 0 }), userId: "user-alice" },
  ]);
  assert.equal(moving.state.players["user-alice"].x, spawn.x);
  const attack = step(moving.state, 12, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: slime(moving.state).id, requestId: "req-dead-atk1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(attack)[0].code, "player_dead");
  const interact = step(attack.state, 13, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.elder", requestId: "req-dead-int1" }),
      userId: "user-alice",
    },
  ]);
  const interaction = interact.outbound.filter((item) => item.opcode === ServerOpcode.INTERACTION_RESULT);
  assert.equal(JSON.parse(interaction[0].body).code, "player_dead");
});

test("respawn restores health at the default spawn and keeps items", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const home = content.zones["zone.starter"].playerSpawn;
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 2));
  const death = step(state, 10, []);
  const gold = death.state.players["user-alice"].gold;
  const respawnTick = 10 + cooldownTicks(PLAYER_RESPAWN_DELAY_SEC, MATCH_TICK_RATE);
  let next = death.state;
  for (let tick = 11; tick < respawnTick; tick++) {
    next = step(next, tick, []).state;
  }
  const respawn = step(next, respawnTick, []);
  assert.equal(respawn.state.players["user-alice"].health, content.player.maxHealth);
  assert.equal(respawn.state.players["user-alice"].x, home.x);
  assert.equal(respawn.state.players["user-alice"].y, home.y);
  assert.equal(respawn.state.players["user-alice"].gold, gold);
});

test("bound-point fallback uses bind coordinates when present", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 0));
  state.players["user-alice"].bindX = 220;
  state.players["user-alice"].bindY = 180;
  state.players["user-alice"].bindZoneId = "zone.starter";
  state.players["user-alice"].deadUntilTick = 1;
  const events: CombatEvent[] = [];
  applyPlayerRespawn(state, state.players["user-alice"], 4, events);
  assert.equal(state.players["user-alice"].x, 220);
  assert.equal(state.players["user-alice"].y, 180);
  assert.equal(state.players["user-alice"].health, content.player.maxHealth);
});

test("cave death uses cave spawn instead of a public-world inn bind", () => {
  const cave = createStarterZoneState(
    contentHash,
    content.zones["zone.cave"],
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
    {},
    { instanceType: "party_cave", instanceId: "cave-bind-test" },
  );
  const spawn = content.zones["zone.cave"].playerSpawn;
  const state = addPlayer(cave, playerAt("user-alice", "Alice", 200, 200, 0));
  state.players["user-alice"].bindX = 220;
  state.players["user-alice"].bindY = 180;
  state.players["user-alice"].bindZoneId = "zone.starter";
  state.players["user-alice"].deadUntilTick = 1;
  applyPlayerRespawn(state, state.players["user-alice"], 4, []);
  assert.equal(state.players["user-alice"].x, spawn.x);
  assert.equal(state.players["user-alice"].y, spawn.y);
});

test("explicit release respawns before the timer", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 2));
  state = step(state, 10, []).state;
  assert.equal(state.players["user-alice"].health, 0);
  const released = step(state, 11, [
    {
      opcode: ClientOpcode.RELEASE_RESPAWN,
      raw: envelope({ requestId: "req-release-1a" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(actionCodes(released)[0].code, "ok");
  assert.equal(released.state.players["user-alice"].health, content.player.maxHealth);
  const alive = applyReleaseRespawn(released.state, released.state.players["user-alice"], 12, "req-release-2a", []);
  assert.equal(alive.code, "not_dead");
});

test("duplicate combat eventId does not apply damage twice", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const before = slime(state).health;
  const events: CombatEvent[] = [];
  const first = applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: slime(state).id,
      targetKind: "enemy",
      formula: { base: 4 },
      tick: 5,
      eventId: "dup-combat-1",
    },
    events,
  );
  const second = applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: slime(state).id,
      targetKind: "enemy",
      formula: { base: 4 },
      tick: 6,
      eventId: "dup-combat-1",
    },
    events,
  );
  assert.equal(first.applied, true);
  assert.equal(second.replay, true);
  assert.equal(second.applied, false);
  assert.equal(slime(state).health, before - 4);
});

test("invalid targets are rejected against match state", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const events: CombatEvent[] = [];
  const missing = applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: "enemy.missing:0",
      targetKind: "enemy",
      formula: { base: 4 },
      tick: 2,
      eventId: "bad-target-1",
    },
    events,
  );
  assert.equal(missing.code, "invalid_target");
  const set = applySetTarget(state, state.players["user-alice"], "no-such-id", "", "req-set-bad01");
  assert.equal(set.code, "invalid_target");
});

test("hostile player targeting remains impossible", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 8, spawn.y));
  const events: CombatEvent[] = [];
  const hit = applyCombat(
    state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: "user-bob",
      targetKind: "player",
      formula: { base: 4 },
      tick: 3,
      eventId: "pvp-hit-1",
    },
    events,
  );
  assert.equal(hit.code, "pvp_disabled");
  assert.equal(state.players["user-bob"].health, content.player.maxHealth);
  const set = applySetTarget(state, state.players["user-alice"], "user-bob", "hostile", "req-set-pvp01");
  assert.equal(set.code, "pvp_disabled");
});

test("reconnect while dead keeps death and the respawn timer", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 2));
  state = step(state, 10, []).state;
  assert.equal(state.players["user-alice"].health, 0);
  const until = state.players["user-alice"].deadUntilTick;
  const left = applyPlayerLeave(state, "user-alice", 11);
  const parked = takeGracePlayer(left.state, "user-alice", 11 + RECONNECT_GRACE_TICKS - 1);
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
  assert.equal(restored.health, 0);
  assert.equal(restored.deadUntilTick, until);
  state = addPlayer(left.state, restored);
  const stillDead = step(state, 12, []).state;
  assert.equal(stillDead.players["user-alice"].health, 0);
});

test("SET_TARGET and RELEASE_RESPAWN parse without outcome fields", () => {
  const set = parseClientMessage(
    ClientOpcode.SET_TARGET,
    envelope({ targetId: "enemy.green_slime:0", intent: "hostile", requestId: "req-set-ok-01" }),
    contentHash,
  );
  assert.equal(isProtocolError(set), false);
  const xp = parseClientMessage(
    ClientOpcode.SET_TARGET,
    envelope({ targetId: "enemy.green_slime:0", requestId: "req-set-xp-01", xp: 99 }),
    contentHash,
  );
  assert.equal(isProtocolError(xp), true);
  const release = parseClientMessage(
    ClientOpcode.RELEASE_RESPAWN,
    envelope({ requestId: "req-rel-ok-01" }),
    contentHash,
  );
  assert.equal(isProtocolError(release), false);
});

test("area targeting validates living match entities", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const aroundSource = resolveTargetQuery(state, "user-alice", { mode: "area_source", radius: 80 });
  assert.equal(aroundSource.ok, true);
  assert.equal(aroundSource.entities.some((row) => row.kind === "enemy"), true);
  const ground = resolveTargetQuery(state, "user-alice", { mode: "ground_point", x: spawn.x, y: spawn.y });
  assert.equal(ground.ok, true);
  assert.equal(ground.pointX, spawn.x);
  const missingActor = resolveTargetQuery(state, "user-missing", { mode: "self" });
  assert.equal(missingActor.code, "player_missing");
});
