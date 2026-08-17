import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../src/domain/combat";
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
import { spawnDefinitionsFromContent } from "../src/domain/spawn_controller";
import { aiProfilesFromContent } from "../src/domain/threat";
import {
  applyEnemyDeathSideEffects,
  lootTablesFromContent,
  rollLootTable,
  type LootTableDefinition,
} from "../src/domain/loot_table";
import { partyCreditFromThreat } from "../src/domain/party_credit";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { initializeProgression } from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";

function catalogZone(): StarterZoneState {
  const state = createStarterZoneState(
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
  state.progressionCatalog = catalogFromContent(content);
  return state;
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
  const classId = Object.keys(content.classes)[0];
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    classId: classId,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    progression: initializeProgression(catalogFromContent(content), classId),
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

function constantRng(values: number[]): () => number {
  let i = 0;
  return function () {
    const value = i < values.length ? values[i] : 0;
    i += 1;
    return value;
  };
}

test("guaranteed loot always rolls the authored quantity", () => {
  const table = lootTablesFromContent(content.lootTables)["loot.green_slime"];
  const drops = rollLootTable(table, constantRng([0, 0]));
  assert.equal(drops.length, 1);
  assert.equal(drops[0].itemId, "item.slime_gel");
  assert.equal(drops[0].quantity, 1);
});

test("independent chance entries can miss", () => {
  const table: LootTableDefinition = {
    id: "loot.chance",
    ownershipPolicy: "ground_free",
    entries: [
      {
        itemDefinitionId: "item.test_pebble",
        minimumQuantity: 1,
        maximumQuantity: 1,
        chance: 0.5,
      },
    ],
  };
  const hit = rollLootTable(table, constantRng([0.1, 0]));
  const miss = rollLootTable(table, constantRng([0.9, 0]));
  assert.equal(hit.length, 1);
  assert.equal(miss.length, 0);
});

test("weighted groups pick one entry", () => {
  const table = lootTablesFromContent(content.lootTables)["loot.test_weighted"];
  const first = rollLootTable(table, constantRng([0.1, 0]));
  const second = rollLootTable(table, constantRng([0.9, 0]));
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].itemId, "item.test_cloth");
  assert.equal(second[0].itemId, "item.test_pebble");
});

test("empty loot tables spawn nothing", () => {
  const table = lootTablesFromContent(content.lootTables)["loot.empty"];
  assert.equal(rollLootTable(table, constantRng([0])).length, 0);
});

test("rollLootTable ignores missing tables and entry lists", () => {
  assert.equal(rollLootTable(undefined, constantRng([0])).length, 0);
  assert.equal(
    rollLootTable({ id: "loot.broken", ownershipPolicy: "ground_free", entries: undefined as unknown as [] }, constantRng([0]))
      .length,
    0,
  );
});

test("slime death grants gel and xp once; duplicate death events do not repeat", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = 1;
  const kill = applyMatchLoop(state, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-loot-xp" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(kill.state.enemies[0].aiState, "dead");
  assert.equal(kill.state.loot.length, 1);
  assert.equal(kill.state.loot[0].itemId, "item.slime_gel");
  assert.equal(kill.state.players["user-alice"].progression?.currentXp, content.enemies["enemy.green_slime"].xpReward);
  const events = [
    {
      type: "death" as const,
      sourceId: "user-alice",
      sourceKind: "player" as const,
      targetId: kill.state.enemies[0].id,
      targetKind: "enemy" as const,
      remainingHealth: 0,
      x: spawn.x,
      y: spawn.y,
    },
  ];
  applyEnemyDeathSideEffects(kill.state, events, 9, MATCH_TICK_RATE, function () {
    return "dup-id";
  });
  assert.equal(kill.state.loot.length, 1);
  const replay = applyMatchLoop(kill.state, 9, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: kill.state.enemies[0].id, requestId: "req-loot-dead" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(replay.state.loot.length, 1);
  assert.equal(replay.state.players["user-alice"].progression?.currentXp, content.enemies["enemy.green_slime"].xpReward);
});

test("slime death after JSON roundtrip still grants gel", () => {
  const spawn = content.zones["zone.starter"].enemies[0];
  let state = addPlayer(catalogZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  state.enemies[0].health = 1;
  const raw = JSON.parse(JSON.stringify(state)) as StarterZoneState;
  const kill = applyMatchLoop(raw, 8, contentHash, [
    {
      opcode: ClientOpcode.ATTACK,
      raw: envelope({ targetId: state.enemies[0].id, requestId: "req-loot-json" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(kill.state.enemies[0].aiState, "dead");
  assert.equal(kill.state.loot.length, 1);
  assert.equal(kill.state.loot[0].itemId, "item.slime_gel");
});

test("party credit hook lists the killer and threat contributors", () => {
  const event = partyCreditFromThreat(
    "kill:enemy.green_slime:0:1",
    "enemy.green_slime",
    "enemy.green_slime:0",
    { "user-bob": 8, "user-alice": 12 },
    "user-alice",
  );
  assert.deepEqual(event.contributors, ["user-alice", "user-bob"]);
});
