import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { autoAttackDefinitionsFromContent, abilityDefinitionsFromContent } from "../src/domain/ability";
import { applyMatchLoop } from "../src/domain/match_loop";
import { addPlayer, createStarterZoneState, enemyDefinitionsFromContent, type MatchEnemy, type MatchPlayer, type StarterZoneState } from "../src/domain/match_state";
import { emptyQuestLog, questDefinitionsFromContent } from "../src/domain/quest";
import { emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { emptyEquipment } from "../src/domain/equipment";
import { initializeProgression } from "../src/domain/progression";
import { catalogFromContent } from "../src/domain/stats";
import { classTagsFromContent } from "../src/domain/class_catalog";
import { syncDerivedAbilityOwnership } from "../src/domain/canonical_talents";
import { applyCanonicalRespec } from "../src/domain/canonical_respec";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { scriptedRandom } from "../src/domain/combat_rng";
import { formulaCastTime } from "../src/domain/canonical_stats";
import { cooldownTicks } from "../src/domain/combat";
import { SNAPSHOT_RATE_HZ } from "../src/domain/movement";

const catalog = catalogFromContent(content);

function zone(): StarterZoneState {
  const state = createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    content.player,
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      abilitiesById: abilityDefinitionsFromContent(content.abilities),
      autoAttacksById: autoAttackDefinitionsFromContent(content.autoAttacks),
      classTags: classTagsFromContent(content.classes),
    },
  );
  state.progressionCatalog = catalog;
  state.combatRandom = scriptedRandom([0.99]);
  return state;
}

function enemy(id: string, x = 960, y = 400): MatchEnemy {
  return {
    id: id,
    enemyId: id,
    spawnX: x,
    spawnY: y,
    x: x,
    y: y,
    maxHealth: 1000,
    health: 1000,
    aiState: "idle",
    aggroTarget: "",
    lastAttackTick: 0,
    deadUntilTick: 0,
    damage: 100,
    moveSpeed: 0,
    aggroRadius: 0,
    attackRange: 0,
    attackCooldownSec: 99,
    leashRadius: 999,
    respawnDelaySec: 99,
    xpReward: 0,
    deathCount: 0,
    aiProfileId: "test.ai.melee",
  };
}

function marksman(
  level: number,
  branchId = "",
  classNodes: string[] = [],
  branchRanks: { [id: string]: number } = {},
): MatchPlayer {
  const progression = initializeProgression(catalog, "class.marksman");
  progression.level = level;
  progression.branchId = branchId;
  progression.purchasedClassNodeIds = classNodes.slice();
  progression.purchasedBranchNodeRanks = { ...branchRanks };
  syncDerivedAbilityOwnership(progression, catalog, "class.marksman");
  return {
    userId: "marksman",
    sessionId: "session-marksman",
    username: "marksman",
    characterId: "char-marksman",
    name: "Marksman",
    classId: "class.marksman",
    x: 900,
    y: 400,
    maxHealth: 1,
    health: 1000,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    progression: progression,
    effects: [],
    abilityCooldowns: {},
    facingX: 1,
    facingY: 0,
  };
}

function message(opcode: ClientOpcode, body: { [id: string]: unknown }) {
  return {
    opcode: opcode,
    userId: "marksman",
    raw: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...body }),
  };
}

function run(state: StarterZoneState, tick: number, messages: ReturnType<typeof message>[] = []) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function damage(before: number, after: number): number {
  return before - after;
}

function stunEffect(): NonNullable<MatchPlayer["effects"]>[number] {
  return {
    effectId: "stun",
    abilityId: "test.stun",
    sourceId: "enemy-1",
    sourceKind: "enemy",
    type: "stun",
    stacks: 1,
    magnitude: 0,
    remainingTicks: 20,
    tickIntervalTicks: 0,
    nextTickAt: 0,
    stackPolicy: "replace",
    maxStacks: 1,
    refreshPolicy: "refresh",
    tags: ["stun"],
    statChannel: "",
    resourceRole: "",
  };
}

test("Marksman auto attack and Aimed Shot use canonical AGI values and ranks", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(2, "", ["talent.marksman.aimed_shot_r2"]));
  const beforeAuto = state.enemies[0].health;
  let result = run(state, 10, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "marksman-auto-01" })]);
  assert.ok(Math.abs(damage(beforeAuto, result.state.enemies[0].health) - 10 * 1.12) < 0.0001);
  assert.equal(result.state.players.marksman.progression?.hotbarAssignments.indexOf("ability.marksman.auto_attack"), -1);

  const beforeAimed = result.state.enemies[0].health;
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.aimed_shot", targetId: "enemy-1", requestId: "marksman-aimed-01" })]);
  assert.ok(Math.abs(damage(beforeAimed, result.state.enemies[0].health) - 22 * 1.12 * 1.25) < 0.0001);
});

test("Snipe channels with Haste then Steady Hands, pauses autos, and stuns interrupt", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10, "branch.marksman.sniper"));
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.snipe", targetId: "enemy-1", requestId: "snipe-01" })]);
  const expectedChannel = cooldownTicks(formulaCastTime(1.5, 1.12), SNAPSHOT_RATE_HZ);
  assert.equal(result.state.players.marksman.activeCast?.phase, "channeling");
  assert.equal(result.state.players.marksman.activeCast?.channelUntilTick, 10 + expectedChannel);
  assert.equal(result.state.enemies[0].health, 1000);

  result = run(result.state, 11, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "snipe-auto-blocked" })]);
  assert.equal(result.state.enemies[0].health, 1000);

  result.state.players.marksman.effects = [stunEffect()];
  result = run(result.state, 12);
  assert.equal(result.state.players.marksman.activeCast, undefined);
  assert.equal(result.state.enemies[0].health, 1000);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10, "branch.marksman.sniper", [], { "talent.marksman.sniper.steady_hands": 1 }));
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.snipe", targetId: "enemy-1", requestId: "snipe-r1" })]);
  const r1 = cooldownTicks(formulaCastTime(1.5 * 0.85, 1.12), SNAPSHOT_RATE_HZ);
  assert.equal(result.state.players.marksman.activeCast?.channelUntilTick, 10 + r1);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10, "branch.marksman.sniper", [], { "talent.marksman.sniper.steady_hands": 2 }));
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.snipe", targetId: "enemy-1", requestId: "snipe-r2" })]);
  const r2 = cooldownTicks(formulaCastTime(1.5 * 0.7, 1.12), SNAPSHOT_RATE_HZ);
  assert.equal(result.state.players.marksman.activeCast?.channelUntilTick, 10 + r2);
  assert.ok(r2 < r1);
  assert.ok(r1 < expectedChannel);
});

test("Snipe resolves at channel end with R2 damage, Weak Spot, and R3 crit", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state.enemies[0].health = 1000;
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.sniper", [], {
      "talent.marksman.sniper.snipe_r2": 1,
      "talent.marksman.sniper.weak_spot": 1,
    }),
  );
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.snipe", targetId: "enemy-1", requestId: "snipe-resolve-01" })]);
  const until = result.state.players.marksman.activeCast?.channelUntilTick as number;
  for (let tick = 11; tick < until; tick++) {
    result = run(result.state, tick);
    assert.equal(result.state.enemies[0].health, 1000);
  }
  const before = result.state.enemies[0].health;
  result = run(result.state, until);
  assert.equal(result.state.players.marksman.activeCast, undefined);
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - 45 * 1.36 * 1.25 * 1.3) < 0.0001);

  state = zone();
  state.combatRandom = scriptedRandom([0.1]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.sniper", [], {
      "talent.marksman.sniper.snipe_r2": 1,
      "talent.marksman.sniper.snipe_r3": 1,
    }),
  );
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.snipe", targetId: "enemy-1", requestId: "snipe-crit-01" })]);
  const critUntil = result.state.players.marksman.activeCast?.channelUntilTick as number;
  for (let tick = 11; tick < critUntil; tick++) {
    result = run(result.state, tick);
  }
  const beforeCrit = result.state.enemies[0].health;
  result = run(result.state, critUntil);
  assert.ok(Math.abs(damage(beforeCrit, result.state.enemies[0].health) - 45 * 1.36 * 1.25 * 1.54) < 0.0001);
});

test("Piercing Shot hits every enemy on the line and R2 slows them", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1", 960), enemy("enemy-2", 1040)];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.sniper", [], {
      "talent.marksman.sniper.piercing_shot": 1,
      "talent.marksman.sniper.piercing_shot_r2": 1,
    }),
  );
  const beforeA = state.enemies[0].health;
  const beforeB = state.enemies[1].health;
  const result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.piercing_shot", targetId: "enemy-1", requestId: "pierce-01" })]);
  assert.ok(Math.abs(damage(beforeA, result.state.enemies[0].health) - 30 * 1.36) < 0.0001);
  assert.ok(Math.abs(damage(beforeB, result.state.enemies[1].health) - 30 * 1.36) < 0.0001);
  assert.equal(result.state.enemies[0].effects?.some((effect) => effect.type === "slow"), true);
  assert.equal(result.state.enemies[1].effects?.some((effect) => effect.type === "slow"), true);
});

test("Killer Instinct and Sniper's Nest detect range and standing still, then Nest ends on movement", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1", 980)];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.sniper", ["talent.marksman.deadly_aim"], {
      "talent.marksman.sniper.killer_instinct": 1,
      "talent.marksman.sniper.snipers_nest": 1,
    }),
  );
  state.combatRandom = scriptedRandom([0]);
  let result = run(state, 10);
  for (let tick = 11; tick <= 31; tick++) {
    result = run(result.state, tick);
  }
  const before = result.state.enemies[0].health;
  result = run(result.state, 32, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "nest-auto-01" })]);
  const nestHit = damage(before, result.state.enemies[0].health);
  assert.ok(Math.abs(nestHit - 10 * 1.36 * 1.1 * (1.54 + 0.1 + 0.15)) < 0.0001);

  result = run(result.state, 33, [message(ClientOpcode.INPUT, { seq: 1, axisX: 1, axisY: 0 })]);
  result.state.combatRandom = scriptedRandom([0]);
  const afterMoveHealth = result.state.enemies[0].health;
  result.state.players.marksman.lastAttackTick = -1;
  result = run(result.state, 50, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "nest-ended-01" })]);
  const movedHit = damage(afterMoveHealth, result.state.enemies[0].health);
  assert.ok(movedHit < nestHit);
});

test("Coup de Grâce always crits and resets only when its own damage kills", () => {
  let state = zone();
  state.combatRandom = scriptedRandom([0.99]);
  state.enemies = [enemy("enemy-1")];
  state.enemies[0].health = 50;
  state = addPlayer(state, marksman(10, "branch.marksman.sniper"));
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.coup_de_grace", targetId: "enemy-1", requestId: "coup-kill-01" })]);
  assert.equal(result.state.enemies[0].health, 0);
  assert.ok((result.state.players.marksman.abilityCooldowns?.["ability.marksman.coup_de_grace"] ?? 1) <= 10);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10, "branch.marksman.sniper"));
  const before = state.enemies[0].health;
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.coup_de_grace", targetId: "enemy-1", requestId: "coup-live-01" })]);
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - 70 * 1.36 * 1.54) < 0.0001);
  assert.ok((result.state.players.marksman.abilityCooldowns?.["ability.marksman.coup_de_grace"] ?? 0) > 10);
});

test("Barrage fires independent arrows, R2/R3 change count and damage, and Serrated bleeds never crit", () => {
  let state = zone();
  state.combatRandom = scriptedRandom([0, 0.99, 0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10, "branch.marksman.skirmisher"));
  const before = state.enemies[0].health;
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.barrage", targetId: "enemy-1", requestId: "barrage-01" })]);
  const expected = 6 * 1.36 * 1.54 + 6 * 1.36 + 6 * 1.36 * 1.54;
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - expected) < 0.0001);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.skirmisher", [], {
      "talent.marksman.skirmisher.barrage_r2": 1,
      "talent.marksman.skirmisher.barrage_r3": 1,
    }),
  );
  const beforeR3 = state.enemies[0].health;
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.barrage", targetId: "enemy-1", requestId: "barrage-r3" })]);
  assert.ok(Math.abs(damage(beforeR3, result.state.enemies[0].health) - 4 * 6 * 1.36 * 1.2) < 0.0001);

  state = zone();
  state.combatRandom = scriptedRandom([0, 0, 0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.skirmisher", [], { "talent.marksman.skirmisher.serrated_arrows": 1 }),
  );
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.barrage", targetId: "enemy-1", requestId: "serrated-01" })]);
  const bleeds = (result.state.enemies[0].effects ?? []).filter((effect) => effect.tags.indexOf("bleed") >= 0);
  assert.equal(bleeds.length, 3);
  const totalBleed = bleeds.reduce((sum, effect) => sum + (effect.totalRemaining !== undefined ? effect.totalRemaining : 0), 0);
  assert.ok(Math.abs(totalBleed - 3 * 6 * 1.36 * 1.54 * 0.2) < 0.05);

  const beforeStorm = totalBleed;
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.arrowstorm", requestId: "storm-01" })]);
  const afterStorm = (result.state.enemies[0].effects ?? [])
    .filter((effect) => effect.tags.indexOf("bleed") >= 0)
    .reduce((sum, effect) => sum + (effect.totalRemaining !== undefined ? effect.totalRemaining : 0), 0);
  assert.ok(Math.abs(afterStorm - beforeStorm) < 0.05);
  const faster = (result.state.enemies[0].effects ?? []).filter((effect) => effect.tags.indexOf("bleed") >= 0);
  assert.ok((faster[0].tickIntervalTicks ?? 99) < (bleeds[0].tickIntervalTicks ?? 0));
});

test("Vault stops on collision, R2 drops caltrops, and Nimble/Runner's High recover cooldowns", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1", 900, 400)];
  state.collisions = [{ x: 820, y: 380, width: 20, height: 40 }];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.skirmisher", [], {
      "talent.marksman.skirmisher.vault": 1,
      "talent.marksman.skirmisher.vault_r2": 1,
      "talent.marksman.skirmisher.nimble": 2,
    }),
  );
  state.players.marksman.facingX = 1;
  state.players.marksman.facingY = 0;
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.vault", requestId: "vault-01" })]);
  assert.ok(result.state.players.marksman.x > 820);
  assert.ok(result.state.players.marksman.x < 900);
  assert.equal(result.state.enemies[0].effects?.some((effect) => effect.tags.indexOf("caltrop") >= 0 || effect.type === "slow"), true);
  assert.equal(result.state.players.marksman.effects?.some((effect) => effect.statChannel === "movement_speed"), true);

  const aimedReady = result.state.players.marksman.abilityCooldowns?.["ability.marksman.aimed_shot"];
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.aimed_shot", targetId: "enemy-1", requestId: "aimed-cd-01" })]);
  const readyAt = result.state.players.marksman.abilityCooldowns?.["ability.marksman.aimed_shot"] as number;
  result = run(result.state, 12);
  const afterNimble = result.state.players.marksman.abilityCooldowns?.["ability.marksman.aimed_shot"] as number;
  assert.ok(afterNimble < readyAt);
  assert.equal(aimedReady, undefined);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.skirmisher", [], { "talent.marksman.skirmisher.runners_high": 1 }),
  );
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.aimed_shot", targetId: "enemy-1", requestId: "run-cd-01" })]);
  const stored = result.state.players.marksman.abilityCooldowns?.["ability.marksman.aimed_shot"] as number;
  result = run(result.state, 11, [message(ClientOpcode.INPUT, { seq: 1, axisX: 1, axisY: 0 })]);
  const movingReady = result.state.players.marksman.abilityCooldowns?.["ability.marksman.aimed_shot"] as number;
  assert.ok(movingReady < stored);
});

test("Light Step and Twist the Knife apply generic modifiers", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10, "", ["talent.marksman.light_step"]));
  let result = run(state, 10, [message(ClientOpcode.INPUT, { seq: 1, axisX: 1, axisY: 0 })]);
  const withStep = result.state.players.marksman.x;
  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, marksman(10));
  result = run(state, 10, [message(ClientOpcode.INPUT, { seq: 1, axisX: 1, axisY: 0 })]);
  assert.ok(withStep > result.state.players.marksman.x);

  state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  state.enemies[0].effects = [
    {
      effectId: "bleed-pre",
      abilityId: "ability.marksman.barrage",
      sourceId: "marksman",
      sourceKind: "player",
      type: "periodic_damage",
      stacks: 1,
      magnitude: 1,
      remainingTicks: 20,
      tickIntervalTicks: 10,
      nextTickAt: 99,
      stackPolicy: "replace",
      maxStacks: 1,
      refreshPolicy: "refresh",
      tags: ["bleed"],
      statChannel: "",
      resourceRole: "",
    },
  ];
  state = addPlayer(
    state,
    marksman(10, "branch.marksman.skirmisher", ["talent.marksman.deadly_aim"], {
      "talent.marksman.skirmisher.twist_the_knife": 1,
    }),
  );
  const before = state.enemies[0].health;
  result = run(state, 10, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "twist-01" })]);
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - 10 * 1.36 * (1.54 + 0.1 + 0.15)) < 0.0001);
});

test("respec removes Marksman ranks, unlocks, and combat modifiers", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  const player = marksman(
    10,
    "branch.marksman.sniper",
    ["talent.marksman.aimed_shot_r2"],
    {
      "talent.marksman.sniper.snipe_r2": 1,
      "talent.marksman.sniper.piercing_shot": 1,
    },
  );
  state = addPlayer(state, player);
  const progression = state.players.marksman.progression;
  assert.ok(progression !== undefined);
  assert.equal(progression.unlockedAbilityIds.indexOf("ability.marksman.piercing_shot") >= 0, true);
  applyCanonicalRespec(progression, catalog, "class.marksman", "char-marksman", "respec-marksman-01", "npc.test_innkeeper", 1);
  assert.equal(progression.purchasedClassNodeIds.length, 0);
  assert.equal(Object.keys(progression.purchasedBranchNodeRanks).length, 0);
  assert.equal(progression.unlockedAbilityIds.indexOf("ability.marksman.piercing_shot") >= 0, false);
  const before = state.enemies[0].health;
  const result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.marksman.aimed_shot", targetId: "enemy-1", requestId: "respec-aimed-01" })]);
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - 22 * 1.36) < 0.0001);
});
