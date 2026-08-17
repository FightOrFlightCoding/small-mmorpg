import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC, cooldownTicks } from "../src/domain/combat";
import {
  MATCH_TICK_RATE,
  addPlayer,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { itemDefinitionsFromContent } from "../src/domain/inventory";
import { abilityDefinitionsFromContent } from "../src/domain/ability";
import {
  activateSpawn,
  resetSpawnGroup,
  scheduleEnemyRespawn,
  spawnDefinitionsFromContent,
} from "../src/domain/spawn_controller";
import { aiProfilesFromContent } from "../src/domain/threat";
import { lootTablesFromContent } from "../src/domain/loot_table";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";

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

function livingOf(state: StarterZoneState, enemyId: string): number {
  let n = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].enemyId === enemyId && state.enemies[i].health > 0) {
      n += 1;
    }
  }
  return n;
}

test("green slime is the first always-on enemy instance", () => {
  const state = catalogZone();
  assert.equal(state.enemies.length, 1);
  assert.equal(state.enemies[0].id, "enemy.green_slime:0");
  assert.equal(state.enemies[0].enemyId, "enemy.green_slime");
  assert.equal(state.enemies[0].aiProfileId, "test.ai.melee");
  assert.equal(state.enemies[0].lootTableId, "loot.green_slime");
  assert.equal(state.enemies[0].x, 960);
  assert.equal(state.enemies[0].y, 400);
  assert.equal(livingOf(state, "test.enemy.melee"), 0);
  assert.equal(livingOf(state, "test.enemy.cave_boss"), 0);
});

test("spawn controller creates a manual enemy once", () => {
  const state = catalogZone();
  const first = activateSpawn(state, "spawn.starter.test_melee", enemyDefinitionsFromContent(content.enemies));
  const second = activateSpawn(state, "spawn.starter.test_melee", enemyDefinitionsFromContent(content.enemies));
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.equal(livingOf(state, "test.enemy.melee"), 1);
  assert.equal(first[0].id, "test.enemy.melee:0");
});

test("duplicate pending respawn for the same slot is ignored", () => {
  const state = catalogZone();
  const created = activateSpawn(state, "spawn.starter.test_melee", enemyDefinitionsFromContent(content.enemies));
  const enemy = created[0];
  scheduleEnemyRespawn(state, enemy, 10, MATCH_TICK_RATE);
  scheduleEnemyRespawn(state, enemy, 10, MATCH_TICK_RATE);
  const spawn = state.spawns.filter((row) => row.spawnId === "spawn.starter.test_melee")[0];
  assert.equal(spawn.pendingRespawns.length, 1);
  assert.equal(spawn.deaths, 1);
});

test("slime death respawns in place without a second instance", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = content.player.attack;
  const kill = applyMatchLoop(state, 6, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-spawn-kill" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(kill.state.enemies.length, 1);
  assert.equal(kill.state.enemies[0].aiState, "dead");
  kill.state.enemies[0].respawnDelaySec = 0.5;
  kill.state.enemies[0].deadUntilTick = 6 + cooldownTicks(0.5, MATCH_TICK_RATE);
  const ready = 6 + cooldownTicks(0.5, MATCH_TICK_RATE);
  let next = kill.state;
  for (let tick = 7; tick < ready; tick++) {
    next = applyMatchLoop(next, tick, contentHash, []).state;
    assert.equal(next.enemies.length, 1);
    assert.equal(next.enemies[0].aiState, "dead");
  }
  const respawn = applyMatchLoop(next, ready, contentHash, []);
  assert.equal(respawn.state.enemies.length, 1);
  assert.equal(respawn.state.enemies[0].id, "enemy.green_slime:0");
  assert.equal(respawn.state.enemies[0].health, content.enemies["enemy.green_slime"].maxHealth);
  assert.equal(respawn.state.enemies[0].aiState, "idle");
});

test("spawn group reset recreates always-on enemies and clears manuals", () => {
  const state = catalogZone();
  activateSpawn(state, "spawn.starter.test_melee", enemyDefinitionsFromContent(content.enemies));
  assert.equal(livingOf(state, "test.enemy.melee"), 1);
  resetSpawnGroup(state, "group.test_ai", enemyDefinitionsFromContent(content.enemies));
  assert.equal(livingOf(state, "test.enemy.melee"), 0);
  resetSpawnGroup(state, "group.starter_wildlife", enemyDefinitionsFromContent(content.enemies));
  assert.equal(state.enemies[0].id, "enemy.green_slime:0");
  assert.equal(state.enemies[0].health, content.enemies["enemy.green_slime"].maxHealth);
});
