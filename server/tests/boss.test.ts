import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";
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
import { aiProfilesFromContent } from "../src/domain/threat";
import { lootTablesFromContent } from "../src/domain/loot_table";
import { ServerOpcode } from "../src/domain/protocol";
import { tickBossPhases } from "../src/domain/boss";
import type { CombatEvent } from "../src/domain/combat";

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

function combatEvents(result: { outbound: { opcode: number; body: string }[] }): { type: string; message?: string }[] {
  const bodies = result.outbound
    .filter((item) => item.opcode === ServerOpcode.COMBAT_EVENT)
    .map((item) => JSON.parse(item.body));
  if (bodies.length === 0) {
    return [];
  }
  return bodies[0].events;
}

test("cave boss enrages at half health, adds nova, and triggers an add", () => {
  const spawn = content.spawns["spawn.starter.cave_boss"];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  activateSpawn(state, "spawn.starter.cave_boss", enemyDefinitionsFromContent(content.enemies));
  const boss = findEnemy(state, "test.enemy.cave_boss");
  assert.ok(boss !== null);
  if (boss === null) {
    return;
  }
  assert.deepEqual(boss.abilityLoadout, ["test.ability.boss_smash"]);
  boss.health = 40;
  const result = applyMatchLoop(state, 4, contentHash, []);
  const enraged = findEnemy(result.state, "test.enemy.cave_boss");
  assert.ok(enraged !== null);
  if (enraged === null) {
    return;
  }
  assert.equal(enraged.phaseId, "enraged");
  assert.equal(enraged.moveSpeed, 55);
  assert.equal((enraged.abilityLoadout !== undefined ? enraged.abilityLoadout : []).indexOf("test.ability.boss_nova") !== -1, true);
  assert.ok(findEnemy(result.state, "test.enemy.melee") !== null);
  const messages = combatEvents(result).filter((row) => row.type === "message");
  assert.equal(messages[0].message, "The cave boss enrages.");
});

test("boss reset after a wipe restores phase, health, and despawns adds", () => {
  const spawn = content.spawns["spawn.starter.cave_boss"];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y, 1));
  activateSpawn(state, "spawn.starter.cave_boss", enemyDefinitionsFromContent(content.enemies));
  const boss = findEnemy(state, "test.enemy.cave_boss");
  assert.ok(boss !== null);
  if (boss === null) {
    return;
  }
  boss.health = 40;
  const enraged = applyMatchLoop(state, 2, contentHash, []);
  const liveBoss = findEnemy(enraged.state, "test.enemy.cave_boss");
  assert.equal(liveBoss?.phaseId, "enraged");
  assert.ok(findEnemy(enraged.state, "test.enemy.melee") !== null);
  enraged.state.players["user-alice"].health = 0;
  const wiped = applyMatchLoop(enraged.state, 3, contentHash, []);
  const reset = findEnemy(wiped.state, "test.enemy.cave_boss");
  assert.ok(reset !== null);
  if (reset === null) {
    return;
  }
  assert.equal(reset.health, content.enemies["test.enemy.cave_boss"].maxHealth);
  assert.equal(reset.phaseId, "normal");
  assert.deepEqual(reset.abilityLoadout, ["test.ability.boss_smash"]);
  assert.equal(reset.moveSpeed, content.enemies["test.enemy.cave_boss"].moveSpeed);
  assert.equal(findEnemy(wiped.state, "test.enemy.melee"), null);
});

test("boss leash reset restores the encounter", () => {
  const spawn = content.spawns["spawn.starter.cave_boss"];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  activateSpawn(state, "spawn.starter.cave_boss", enemyDefinitionsFromContent(content.enemies));
  const boss = findEnemy(state, "test.enemy.cave_boss");
  assert.ok(boss !== null);
  if (boss === null) {
    return;
  }
  boss.health = 40;
  state = applyMatchLoop(state, 2, contentHash, []).state;
  const pulled = findEnemy(state, "test.enemy.cave_boss");
  assert.ok(pulled !== null);
  if (pulled === null) {
    return;
  }
  pulled.x = spawn.x + pulled.leashRadius + 8;
  pulled.y = spawn.y;
  state = applyMatchLoop(state, 3, contentHash, []).state;
  assert.equal(findEnemy(state, "test.enemy.cave_boss")?.aiState, "returning");
  const returning = findEnemy(state, "test.enemy.cave_boss");
  assert.ok(returning !== null);
  if (returning === null) {
    return;
  }
  returning.x = spawn.x;
  returning.y = spawn.y;
  const reset = applyMatchLoop(state, 4, contentHash, []);
  const restored = findEnemy(reset.state, "test.enemy.cave_boss");
  assert.equal(restored?.aiState, "idle");
  assert.equal(restored?.health, content.enemies["test.enemy.cave_boss"].maxHealth);
  assert.equal(restored?.phaseId, "normal");
  assert.equal(findEnemy(reset.state, "test.enemy.melee"), null);
});

test("tickBossPhases ignores missing or null phase lists", () => {
  const events: CombatEvent[] = [];
  const state = catalogZone();
  const slime = state.enemies[0];
  slime.phases = undefined;
  tickBossPhases(state, slime, 1, 10, events);
  slime.phases = null as unknown as [];
  tickBossPhases(state, slime, 1, 10, events);
  assert.equal(events.length, 0);
});

test("starter zone tick after JSON roundtrip keeps the slime idle", () => {
  const raw = JSON.parse(JSON.stringify(catalogZone())) as StarterZoneState;
  const result = applyMatchLoop(raw, 0, contentHash, []);
  assert.equal(result.state.enemies[0].enemyId, "enemy.green_slime");
  assert.equal(result.state.enemies[0].aiState, "idle");
});
