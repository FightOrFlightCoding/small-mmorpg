import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC, type CombatEvent } from "../src/domain/combat";
import { applyCombat } from "../src/domain/combat_pipeline";
import {
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { itemDefinitionsFromContent } from "../src/domain/inventory";
import { abilityDefinitionsFromContent } from "../src/domain/ability";
import { activateSpawn, spawnDefinitionsFromContent } from "../src/domain/spawn_controller";
import { aiProfilesFromContent, profileForEnemy } from "../src/domain/threat";
import { lootTablesFromContent } from "../src/domain/loot_table";
import { applyEffectDefinition, enemyAsTarget, writeTarget } from "../src/domain/effects";

function catalogZone(): StarterZoneState {
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
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      abilitiesById: abilityDefinitionsFromContent(content.abilities),
      spawnsById: spawnDefinitionsFromContent(content.spawns),
      aiProfilesById: aiProfilesFromContent(content.aiProfiles),
      lootTablesById: lootTablesFromContent(content.lootTables),
    },
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

function findEnemy(state: StarterZoneState, enemyId: string) {
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].enemyId === enemyId) {
      return state.enemies[i];
    }
  }
  return null;
}

test("melee AI attacks a player in range", () => {
  const spawn = content.spawns["spawn.starter.test_melee"];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  activateSpawn(state, "spawn.starter.test_melee", enemyDefinitionsFromContent(content.enemies));
  const result = applyMatchLoop(state, 1, contentHash, []);
  const enemy = findEnemy(result.state, "test.enemy.melee");
  assert.ok(enemy !== null);
  if (enemy === null) {
    return;
  }
  assert.equal(enemy.aiState, "attacking");
  assert.equal(enemy.aggroTarget, "user-alice");
  assert.ok(result.state.players["user-alice"].health < content.player.maxHealth);
});

test("ranged AI kites inside kite range and attacks at preferred range", () => {
  const spawn = content.spawns["spawn.starter.test_ranged"];
  let close = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  activateSpawn(close, "spawn.starter.test_ranged", enemyDefinitionsFromContent(content.enemies));
  const kited = applyMatchLoop(close, 1, contentHash, []);
  const kiter = findEnemy(kited.state, "test.enemy.ranged");
  assert.ok(kiter !== null);
  if (kiter === null) {
    return;
  }
  assert.equal(kiter.aiState, "positioning");
  let far = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x - 140, spawn.y));
  activateSpawn(far, "spawn.starter.test_ranged", enemyDefinitionsFromContent(content.enemies));
  const shot = applyMatchLoop(far, 1, contentHash, []);
  const shooter = findEnemy(shot.state, "test.enemy.ranged");
  assert.ok(shooter !== null);
  if (shooter === null) {
    return;
  }
  assert.equal(shooter.aiState, "attacking");
});

test("caster AI enters casting before the projectile lands", () => {
  const spawn = content.spawns["spawn.starter.test_caster"];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x + 140, spawn.y));
  activateSpawn(state, "spawn.starter.test_caster", enemyDefinitionsFromContent(content.enemies));
  const result = applyMatchLoop(state, 1, contentHash, []);
  const enemy = findEnemy(result.state, "test.enemy.caster");
  assert.ok(enemy !== null);
  if (enemy === null) {
    return;
  }
  assert.equal(enemy.aiState, "casting");
  assert.equal(enemy.activeCast?.abilityId, "test.ability.enemy_cast");
  assert.equal(result.state.players["user-alice"].health, content.player.maxHealth);
});

test("stun interrupts enemy AI until the control expires", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const events: CombatEvent[] = [];
  const target = enemyAsTarget(state.enemies[0]);
  applyEffectDefinition(
    state,
    {
      id: "stun",
      type: "stun",
      source: "caster",
      target: "primary",
      magnitude: { kind: "constant", value: 0 },
      duration: 2,
      tickInterval: 0,
      stackPolicy: "replace",
      maxStacks: 1,
      refreshPolicy: "refresh",
      removalReason: "expired",
      tags: ["stun"],
    },
    "test.stun",
    { id: "user-alice", kind: "player" },
    target,
    null,
    0,
    1,
    events,
  );
  writeTarget(state, target);
  const stunned = applyMatchLoop(state, 1, contentHash, []);
  assert.equal(stunned.state.enemies[0].aiState, "stunned");
});

test("damage threat switches target when the ratio is exceeded", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x + 20, spawn.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x + 8, spawn.y));
  const acquired = applyMatchLoop(state, 1, contentHash, []);
  assert.equal(acquired.state.enemies[0].aggroTarget, "user-bob");
  const events: CombatEvent[] = [];
  applyCombat(
    acquired.state,
    {
      action: "damage",
      sourceId: "user-alice",
      sourceKind: "player",
      targetId: acquired.state.enemies[0].id,
      targetKind: "enemy",
      formula: { base: 8 },
      tick: 2,
    },
    events,
  );
  const switched = applyMatchLoop(acquired.state, 3, contentHash, []);
  assert.equal(switched.state.enemies[0].aggroTarget, "user-alice");
  const profile = profileForEnemy(switched.state, switched.state.enemies[0]);
  assert.equal(profile.style, "melee");
});

test("heal threat is generated when the AI profile enables it", () => {
  const spawn = content.spawns["spawn.starter.test_ranged"];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x - 140, spawn.y, 40));
  state = addPlayer(state, playerAt("user-bob", "Bob", spawn.x - 140, spawn.y));
  activateSpawn(state, "spawn.starter.test_ranged", enemyDefinitionsFromContent(content.enemies));
  const enemy = findEnemy(state, "test.enemy.ranged");
  assert.ok(enemy !== null);
  if (enemy === null) {
    return;
  }
  enemy.aggroTarget = "user-alice";
  enemy.threatByPlayerId = { "user-alice": 10 };
  const events: CombatEvent[] = [];
  applyCombat(
    state,
    {
      action: "heal",
      sourceId: "user-bob",
      sourceKind: "player",
      targetId: "user-alice",
      targetKind: "player",
      formula: { base: 8 },
      tick: 2,
    },
    events,
  );
  assert.equal(enemy.threatByPlayerId !== undefined ? enemy.threatByPlayerId["user-bob"] : 0, 4);
});

test("ordinary melee leashes without restoring health", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x + 40, spawn.y));
  state = applyMatchLoop(state, 1, contentHash, []).state;
  state.enemies[0].health = 7;
  state.enemies[0].x = spawn.x + state.enemies[0].leashRadius + 8;
  state.enemies[0].y = spawn.y;
  const pulled = applyMatchLoop(state, 2, contentHash, []);
  assert.equal(pulled.state.enemies[0].aiState, "returning");
  pulled.state.enemies[0].x = spawn.x;
  pulled.state.enemies[0].y = spawn.y;
  const reset = applyMatchLoop(pulled.state, 3, contentHash, []);
  assert.equal(reset.state.enemies[0].aiState, "idle");
  assert.equal(reset.state.enemies[0].health, 7);
});
