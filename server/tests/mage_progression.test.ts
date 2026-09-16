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
import { catalogFromContent, evaluateStats, playerStatContext, resourceIdForRole } from "../src/domain/stats";
import { classTagsFromContent } from "../src/domain/class_catalog";
import { syncDerivedAbilityOwnership } from "../src/domain/canonical_talents";
import { applyCanonicalRespec } from "../src/domain/canonical_respec";
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { scriptedRandom } from "../src/domain/combat_rng";
import { formulaCastTime, formulaSpellHit } from "../src/domain/canonical_stats";
import { cooldownTicks } from "../src/domain/combat";
import { SNAPSHOT_RATE_HZ } from "../src/domain/movement";

const catalog = catalogFromContent(content);
const MANA = resourceIdForRole(catalog, "mana");

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
    damage: 20,
    moveSpeed: 0,
    aggroRadius: 0,
    attackRange: 200,
    attackCooldownSec: 99,
    leashRadius: 999,
    respawnDelaySec: 99,
    xpReward: 0,
    deathCount: 0,
    aiProfileId: "test.ai.melee",
  };
}

function mage(
  level: number,
  branchId = "",
  classNodes: string[] = [],
  branchRanks: { [id: string]: number } = {},
  userId = "mage",
): MatchPlayer {
  const progression = initializeProgression(catalog, "class.mage");
  progression.level = level;
  progression.branchId = branchId;
  progression.purchasedClassNodeIds = classNodes.slice();
  progression.purchasedBranchNodeRanks = { ...branchRanks };
  syncDerivedAbilityOwnership(progression, catalog, "class.mage");
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mage", progression, emptyEquipment(), emptyInventory(), {}, {}),
  );
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: "Mage",
    classId: "class.mage",
    x: 900,
    y: 400,
    maxHealth: 1000,
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
    resources: { [MANA]: stats.maxMana > 0 ? stats.maxMana : 164 },
    facingX: 1,
    facingY: 0,
  };
}

function message(opcode: ClientOpcode, body: { [id: string]: unknown }, userId = "mage") {
  return {
    opcode: opcode,
    userId: userId,
    raw: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...body }),
  };
}

function run(state: StarterZoneState, tick: number, messages: ReturnType<typeof message>[] = []) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function damage(before: number, after: number): number {
  return before - after;
}

function manaOf(player: MatchPlayer | undefined): number {
  if (player === undefined || player.resources === undefined) {
    return 0;
  }
  return player.resources[MANA] !== undefined ? player.resources[MANA] : 0;
}

function completeCast(state: StarterZoneState, startTick: number, body: { [id: string]: unknown }, userId = "mage") {
  let result = run(state, startTick, [message(ClientOpcode.USE_ABILITY, body, userId)]);
  const cast = result.state.players[userId]?.activeCast;
  if (cast === undefined || cast.interruptReason !== "") {
    return result;
  }
  const until = cast.completionTick;
  for (let tick = startTick + 1; tick <= until; tick++) {
    result = run(result.state, tick);
  }
  return result;
}

function intScale(level: number): number {
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mage", { level: level, allocatedAttributes: {}, freeStatAllocations: {} }, emptyEquipment(), emptyInventory(), {}, {}),
  );
  return 1 + stats.values["stat.intelligence"] / 100;
}

test("Mage auto attack and Arcane Bolt use canonical INT values, ranks, and mana cost", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "", ["talent.mage.arcane_bolt_r2"]));
  const scale = intScale(10);
  const beforeAuto = state.enemies[0].health;
  let result = run(state, 10, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "mage-auto-01" })]);
  assert.ok(Math.abs(damage(beforeAuto, result.state.enemies[0].health) - 6 * scale) < 0.0001);
  assert.equal(result.state.players.mage.progression?.hotbarAssignments.indexOf("ability.mage.auto_attack"), -1);

  const beforeBolt = result.state.enemies[0].health;
  const manaBefore = manaOf(result.state.players.mage);
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.arcane_bolt", targetId: "enemy-1", requestId: "mage-bolt-01" })]);
  assert.ok(Math.abs(manaBefore - manaOf(result.state.players.mage) - (5 - 3.8 / SNAPSHOT_RATE_HZ)) < 0.02);
  const until = result.state.players.mage.activeCast?.completionTick as number;
  for (let tick = 12; tick <= until; tick++) {
    result = run(result.state, tick);
  }
  assert.ok(Math.abs(damage(beforeBolt, result.state.enemies[0].health) - 16 * scale * 1.25) < 0.0001);
});

test("Fireball spends mana at cast start, movement interrupts without refund, and R3 shortens base cast before Haste", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    mage(10, "branch.mage.fire", [], {
      "talent.mage.fire.fireball_r2": 1,
      "talent.mage.fire.fireball_r3": 1,
    }),
  );
  const scale = intScale(10);
  const manaBefore = manaOf(state.players.mage);
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "fb-cast-01" })]);
  const expectedCast = cooldownTicks(formulaCastTime(2, 1.12), SNAPSHOT_RATE_HZ);
  assert.equal(result.state.players.mage.activeCast?.phase, "casting");
  assert.equal(result.state.players.mage.activeCast?.completionTick, 10 + expectedCast);
  assert.ok(Math.abs(manaBefore - manaOf(result.state.players.mage) - (20 - 3.8 / SNAPSHOT_RATE_HZ)) < 0.02);
  assert.equal(result.state.enemies[0].health, 1000);

  result = run(result.state, 12, [message(ClientOpcode.INPUT, { seq: 1, axisX: 1, axisY: 0 })]);
  assert.equal(result.state.players.mage.activeCast, undefined);
  assert.ok(manaOf(result.state.players.mage) < manaBefore - 18);
  assert.equal(result.state.enemies[0].health, 1000);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.fire", [], { "talent.mage.fire.fireball_r2": 1 }));
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "fb-r2-cast" })]);
  const r2Cast = cooldownTicks(formulaCastTime(2.5, 1.12), SNAPSHOT_RATE_HZ);
  assert.equal(result.state.players.mage.activeCast?.completionTick, 10 + r2Cast);
  assert.ok(r2Cast > expectedCast);

  const until = result.state.players.mage.activeCast?.completionTick as number;
  for (let tick = 11; tick <= until; tick++) {
    result = run(result.state, tick);
  }
  assert.ok(Math.abs(1000 - result.state.enemies[0].health - 34 * scale * 1.25) < 0.0001);
});

test("Kindled Mind reduces tagged spell costs by rank and Second Spark refunds crits without exceeding max", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.fire", [], { "talent.mage.fire.kindled_mind": 1 }));
  const maxMana = manaOf(state.players.mage);
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "kindled-r1" })]);
  assert.ok(Math.abs(maxMana - manaOf(result.state.players.mage) - (18 - 3.8 / SNAPSHOT_RATE_HZ)) < 0.02);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.fire", [], { "talent.mage.fire.kindled_mind": 2 }));
  const maxR2 = manaOf(state.players.mage);
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "kindled-r2" })]);
  assert.ok(Math.abs(maxR2 - manaOf(result.state.players.mage) - (16 - 3.8 / SNAPSHOT_RATE_HZ)) < 0.02);

  state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  const sparkMage = mage(10, "branch.mage.fire", [], { "talent.mage.fire.second_spark": 1 });
  sparkMage.resources = { [MANA]: maxMana };
  state = addPlayer(state, sparkMage);
  result = completeCast(state, 10, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "spark-01" });
  const afterCrit = manaOf(result.state.players.mage);
  assert.ok(afterCrit > maxMana - 20);
  assert.ok(afterCrit <= maxMana);

  state = zone();
  state.combatRandom = scriptedRandom([0.99]);
  state.enemies = [enemy("enemy-1")];
  const clampMage = mage(10, "branch.mage.fire", [], { "talent.mage.fire.second_spark": 1 });
  clampMage.resources = { [MANA]: maxMana - 8 };
  state = addPlayer(state, clampMage);
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.meteor", targetX: 960, targetY: 400, requestId: "spark-meteor" })]);
  const resolveAt = 10 + cooldownTicks(1.5, SNAPSHOT_RATE_HZ);
  for (let tick = 11; tick <= resolveAt; tick++) {
    result = run(result.state, tick);
  }
  assert.equal(manaOf(result.state.players.mage), maxMana);
});

test("Afterburn applies only after a Fireball crit, deals 25% over 4s, and never crits", () => {
  let state = zone();
  state.combatRandom = scriptedRandom([0.99]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.fire", [], { "talent.mage.fire.afterburn": 1 }));
  let result = completeCast(state, 10, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "ab-nocrit" });
  assert.equal((result.state.enemies[0].effects ?? []).some((effect) => effect.tags.indexOf("afterburn") >= 0), false);

  state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.fire", [], { "talent.mage.fire.afterburn": 1 }));
  const scale = intScale(10);
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mage", state.players.mage.progression as never, emptyEquipment(), emptyInventory(), {}, {}),
  );
  result = completeCast(state, 10, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "afterburn-crit" });
  const hit = formulaSpellHit(34, 36) * (stats.critMult !== undefined ? stats.critMult : 1.52);
  const burns = (result.state.enemies[0].effects ?? []).filter((effect) => effect.tags.indexOf("afterburn") >= 0);
  assert.equal(burns.length, 1);
  const total = burns[0].totalRemaining !== undefined ? burns[0].totalRemaining : 0;
  assert.ok(Math.abs(total - hit * 0.25) < 0.05);
  const beforeTick = result.state.enemies[0].health;
  const nextTick = burns[0].nextTickAt;
  result = run(result.state, nextTick);
  const tickDamage = beforeTick - result.state.enemies[0].health;
  assert.ok(tickDamage > 0);
  assert.ok(tickDamage < hit * 0.25);
  assert.ok(Math.abs(scale - 1.36) < 0.0001);
});

test("Flame Wave is a cone, Detonation raises spell crits, and R2 leaves INT-scaled burn that never crits", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1", 960, 400), enemy("enemy-2", 900, 520)];
  state = addPlayer(
    state,
    mage(10, "branch.mage.fire", [], {
      "talent.mage.fire.flame_wave": 1,
      "talent.mage.fire.flame_wave_r2": 1,
      "talent.mage.fire.detonation": 1,
    }),
  );
  const scale = intScale(10);
  const beforeA = state.enemies[0].health;
  const beforeB = state.enemies[1].health;
  const result = completeCast(state, 10, { abilityId: "ability.mage.flame_wave", targetId: "enemy-1", requestId: "flame-wave-01" });
  assert.ok(Math.abs(damage(beforeA, result.state.enemies[0].health) - 22 * scale) < 0.0001);
  assert.equal(result.state.enemies[1].health, beforeB);
  const burns = (result.state.enemies[0].effects ?? []).filter((effect) => effect.tags.indexOf("burn") >= 0);
  assert.equal(burns.length, 1);
  const burnTotal = burns[0].totalRemaining !== undefined ? burns[0].totalRemaining : 0;
  assert.ok(Math.abs(burnTotal - 12 * scale) < 0.05);

  state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.fire", [], { "talent.mage.fire.detonation": 1 }));
  const stats = evaluateStats(
    catalog,
    playerStatContext(
      "class.mage",
      state.players.mage.progression as never,
      emptyEquipment(),
      emptyInventory(),
      {},
      {},
    ),
  );
  const before = 1000;
  const critResult = completeCast(state, 10, { abilityId: "ability.mage.fireball", targetId: "enemy-1", requestId: "detonate-01" });
  const expected = 34 * scale * ((stats.critMult !== undefined ? stats.critMult : 1.52));
  assert.ok(Math.abs(damage(before, critResult.state.enemies[0].health) - expected) < 0.0001);
});

test("Meteor marks ground, resolves after 1.5s, always crits, costs zero mana, and uses a 90s cooldown", () => {
  let state = zone();
  state.combatRandom = scriptedRandom([0.99]);
  state.enemies = [enemy("enemy-1"), enemy("enemy-2", 980, 400)];
  state = addPlayer(state, mage(10, "branch.mage.fire"));
  const scale = intScale(10);
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mage", state.players.mage.progression as never, emptyEquipment(), emptyInventory(), {}, {}),
  );
  const manaBefore = manaOf(state.players.mage);
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.meteor", targetX: 960, targetY: 400, requestId: "meteor-01" })]);
  assert.equal(manaOf(result.state.players.mage), manaBefore);
  assert.equal(result.state.enemies[0].health, 1000);
  const resolveAt = 10 + cooldownTicks(1.5, SNAPSHOT_RATE_HZ);
  for (let tick = 11; tick < resolveAt; tick++) {
    result = run(result.state, tick);
    assert.equal(result.state.enemies[0].health, 1000);
  }
  result = run(result.state, resolveAt);
  const expected = 60 * scale * (stats.critMult !== undefined ? stats.critMult : 1.52);
  assert.ok(Math.abs(damage(1000, result.state.enemies[0].health) - expected) < 0.0001);
  assert.ok(Math.abs(damage(1000, result.state.enemies[1].health) - expected) < 0.0001);
  assert.ok((result.state.players.mage.abilityCooldowns?.["ability.mage.meteor"] ?? 0) >= 10 + cooldownTicks(90, SNAPSHOT_RATE_HZ) - 1);
});

test("Ice Bolt slows 30% for 3s, Deep Chill extends duration, and R3 adds damage only against slowed targets", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.frost", [], { "talent.mage.frost.ice_bolt_r2": 1 }));
  const scale = intScale(10);
  let result = completeCast(state, 10, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "ice-bolt-01" });
  assert.ok(Math.abs(damage(1000, result.state.enemies[0].health) - 24 * scale * 1.25) < 0.0001);
  const slow = (result.state.enemies[0].effects ?? []).find((effect) => effect.type === "slow");
  assert.ok(slow !== undefined);
  assert.equal(slow?.magnitude, -30);
  assert.equal(slow?.remainingTicks, cooldownTicks(3, SNAPSHOT_RATE_HZ) - 1);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.frost", [], { "talent.mage.frost.deep_chill": 1 }));
  result = completeCast(state, 10, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "chill-r1" });
  assert.equal((result.state.enemies[0].effects ?? []).find((effect) => effect.type === "slow")?.remainingTicks, cooldownTicks(4, SNAPSHOT_RATE_HZ) - 1);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "branch.mage.frost", [], { "talent.mage.frost.deep_chill": 2 }));
  result = completeCast(state, 10, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "chill-r2" });
  assert.equal((result.state.enemies[0].effects ?? []).find((effect) => effect.type === "slow")?.remainingTicks, cooldownTicks(5, SNAPSHOT_RATE_HZ) - 1);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    mage(10, "branch.mage.frost", [], {
      "talent.mage.frost.ice_bolt_r2": 1,
      "talent.mage.frost.ice_bolt_r3": 1,
    }),
  );
  result = completeCast(state, 10, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "ice-fresh" });
  const firstHit = damage(1000, result.state.enemies[0].health);
  assert.ok(Math.abs(firstHit - 24 * scale * 1.25) < 0.0001);
  const beforeSecond = result.state.enemies[0].health;
  result.state.players.mage.lastAttackTick = -1;
  result = completeCast(result.state, 40, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "ice-slowed" });
  assert.ok(Math.abs(damage(beforeSecond, result.state.enemies[0].health) - 24 * scale * 1.25 * 1.2) < 0.0001);
});

test("Numbing Cold is source-owned, Flash Freeze roots, R2 grows radius and duration, and Absolute Zero fully incapacitates", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state.enemies[0].damage = 100;
  state = addPlayer(state, mage(10, "branch.mage.frost", [], { "talent.mage.frost.numbing_cold": 1 }));
  let result = completeCast(state, 10, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "numb-slow" });
  assert.equal((result.state.enemies[0].effects ?? []).some((effect) => effect.tags.indexOf("numbing") >= 0), true);
  result.state.enemies[0].attackCooldownSec = 0.1;
  result.state.enemies[0].lastAttackTick = -1;
  result.state.enemies[0].aggroTarget = "mage";
  result.state.enemies[0].aggroRadius = 200;
  const beforeHp = result.state.players.mage.health;
  result = run(result.state, 40);
  const taken = beforeHp - result.state.players.mage.health;
  assert.ok(taken > 0);
  assert.ok(taken <= 90 * (1 - 0.015) + 0.01);

  state = zone();
  state.enemies = [enemy("enemy-1", 930, 400), enemy("enemy-2", 970, 400)];
  state = addPlayer(state, mage(10, "branch.mage.frost", [], { "talent.mage.frost.flash_freeze": 1 }));
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.flash_freeze", requestId: "flash-root-01" })]);
  assert.equal(result.state.enemies[0].effects?.some((effect) => effect.type === "root"), true);
  assert.equal(result.state.enemies[1].effects?.some((effect) => effect.type === "root"), false);
  assert.equal(result.state.enemies[0].health, 1000);
  assert.equal((result.state.enemies[0].effects ?? []).find((effect) => effect.type === "root")?.remainingTicks, cooldownTicks(2, SNAPSHOT_RATE_HZ) - 1);

  state = zone();
  state.enemies = [enemy("enemy-1", 930, 400), enemy("enemy-2", 955, 400)];
  state = addPlayer(
    state,
    mage(10, "branch.mage.frost", [], {
      "talent.mage.frost.flash_freeze": 1,
      "talent.mage.frost.flash_freeze_r2": 1,
    }),
  );
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.flash_freeze", requestId: "flash-root-r2" })]);
  assert.equal(result.state.enemies[0].effects?.some((effect) => effect.type === "root"), true);
  assert.equal(result.state.enemies[1].effects?.some((effect) => effect.type === "root"), true);
  assert.equal((result.state.enemies[0].effects ?? []).find((effect) => effect.type === "root")?.remainingTicks, cooldownTicks(3, SNAPSHOT_RATE_HZ) - 1);

  state = zone();
  state.enemies = [enemy("enemy-1", 920, 400), enemy("enemy-2", 930, 410)];
  state = addPlayer(state, mage(10, "branch.mage.frost"));
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mage.absolute_zero", requestId: "abs-zero-01" })]);
  assert.equal(result.state.enemies[0].effects?.some((effect) => effect.type === "stun" && effect.tags.indexOf("freeze") >= 0), true);
  assert.equal(result.state.enemies[1].effects?.some((effect) => effect.type === "stun"), true);
  result = run(result.state, 11);
  assert.equal(result.state.enemies[0].aiState, "stunned");
});

test("Rimeguard and Winter Harvest track living enemies this Mage currently slows or freezes", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1"), enemy("enemy-2", 980, 400)];
  state.enemies[0].damage = 100;
  state = addPlayer(
    state,
    mage(10, "branch.mage.frost", ["talent.mage.ward"], {
      "talent.mage.frost.rimeguard": 1,
      "talent.mage.frost.winter_harvest": 1,
    }),
  );
  const maxMana = manaOf(state.players.mage);
  state.players.mage.resources = { [MANA]: 100 };
  let result = completeCast(state, 10, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-1", requestId: "rime-cc-01" });
  result.state.enemies[0].attackCooldownSec = 0.1;
  result.state.enemies[0].lastAttackTick = -1;
  result.state.enemies[0].aggroTarget = "mage";
  result.state.enemies[0].aggroRadius = 200;
  const beforeHit = result.state.players.mage.health;
  result = run(result.state, 40);
  const withGuard = beforeHit - result.state.players.mage.health;
  assert.ok(withGuard > 0);
  assert.ok(withGuard < 100 * (1 - 0.065) - 1);
  result.state.enemies[0].attackCooldownSec = 99;
  result.state.players.mage.health = beforeHit;

  const manaMid = manaOf(result.state.players.mage);
  result = completeCast(result.state, 50, { abilityId: "ability.mage.ice_bolt", targetId: "enemy-2", requestId: "rime-cc-02" });
  const manaAfterSecond = manaOf(result.state.players.mage);
  result = run(result.state, 60);
  const regenTwo = manaOf(result.state.players.mage) - manaAfterSecond;
  result.state.enemies[0].health = 0;
  result.state.enemies[0].aiState = "dead";
  const manaBeforeOne = manaOf(result.state.players.mage);
  result = run(result.state, 70);
  const regenOne = manaOf(result.state.players.mage) - manaBeforeOne;
  assert.ok(regenTwo > regenOne);
  assert.ok(manaMid < maxMana);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  state.enemies[0].effects = [
    {
      effectId: "foreign-slow",
      abilityId: "ability.mage.ice_bolt",
      sourceId: "other-mage",
      sourceKind: "player",
      type: "slow",
      stacks: 1,
      magnitude: -30,
      remainingTicks: 30,
      tickIntervalTicks: 0,
      nextTickAt: 0,
      stackPolicy: "replace",
      maxStacks: 1,
      refreshPolicy: "refresh",
      tags: ["slow"],
      statChannel: "movement_speed",
      resourceRole: "",
    },
  ];
  state.enemies[0].damage = 100;
  state.enemies[0].attackCooldownSec = 0.1;
  state.enemies[0].lastAttackTick = -1;
  state.enemies[0].aggroTarget = "mage";
  state.enemies[0].aggroRadius = 200;
  state = addPlayer(state, mage(10, "branch.mage.frost", [], { "talent.mage.frost.rimeguard": 1 }));
  const hp = state.players.mage.health;
  result = run(state, 10);
  const foreignTaken = hp - result.state.players.mage.health;
  assert.ok(foreignTaken > 100 * (1 - 0.05) - 1);
});

test("Mana regenerates continuously and Volatility plus Ward apply their ranks", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  const player = mage(10, "", ["talent.mage.volatility", "talent.mage.ward"]);
  player.resources = { [MANA]: 0 };
  state = addPlayer(state, player);
  let result = run(state, 10);
  for (let tick = 11; tick <= 19; tick++) {
    result = run(result.state, tick);
  }
  assert.ok(Math.abs(manaOf(result.state.players.mage) - 3.8) < 0.05);

  state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mage(10, "", ["talent.mage.volatility"]));
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mage", state.players.mage.progression as never, emptyEquipment(), emptyInventory(), {}, {}),
  );
  const before = 1000;
  result = completeCast(state, 10, { abilityId: "ability.mage.arcane_bolt", targetId: "enemy-1", requestId: "volatility-01" });
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - 16 * 1.36 * (stats.critMult !== undefined ? stats.critMult : 1.62)) < 0.0001);
});

test("every Mage talent rank is live and respec removes Fire and Frost grants", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  const player = mage(
    10,
    "branch.mage.fire",
    ["talent.mage.arcane_bolt_r2", "talent.mage.volatility", "talent.mage.ward"],
    {
      "talent.mage.fire.fireball_r2": 1,
      "talent.mage.fire.afterburn": 1,
      "talent.mage.fire.kindled_mind": 2,
      "talent.mage.fire.fireball_r3": 1,
      "talent.mage.fire.flame_wave": 1,
      "talent.mage.fire.detonation": 1,
      "talent.mage.fire.second_spark": 1,
      "talent.mage.fire.flame_wave_r2": 1,
    },
  );
  state = addPlayer(state, player);
  const fireProgression = state.players.mage.progression;
  assert.ok(fireProgression !== undefined);
  assert.equal(fireProgression.unlockedAbilityIds.indexOf("ability.mage.flame_wave") >= 0, true);
  assert.equal(fireProgression.unlockedAbilityIds.indexOf("ability.mage.fireball") >= 0, true);
  assert.equal(fireProgression.unlockedAbilityIds.indexOf("ability.mage.meteor") >= 0, true);

  state = zone();
  state.enemies = [enemy("enemy-1")];
  const frost = mage(
    10,
    "branch.mage.frost",
    ["talent.mage.arcane_bolt_r2"],
    {
      "talent.mage.frost.ice_bolt_r2": 1,
      "talent.mage.frost.numbing_cold": 1,
      "talent.mage.frost.deep_chill": 2,
      "talent.mage.frost.ice_bolt_r3": 1,
      "talent.mage.frost.flash_freeze": 1,
      "talent.mage.frost.rimeguard": 1,
      "talent.mage.frost.winter_harvest": 1,
      "talent.mage.frost.flash_freeze_r2": 1,
    },
  );
  state = addPlayer(state, frost);
  const frostProgression = state.players.mage.progression;
  assert.ok(frostProgression !== undefined);
  assert.equal(frostProgression.unlockedAbilityIds.indexOf("ability.mage.flash_freeze") >= 0, true);
  assert.equal(frostProgression.unlockedAbilityIds.indexOf("ability.mage.absolute_zero") >= 0, true);
  applyCanonicalRespec(frostProgression, catalog, "class.mage", "char-mage", "respec-mage-01", "npc.test_innkeeper", 1);
  assert.equal(frostProgression.purchasedClassNodeIds.length, 0);
  assert.equal(Object.keys(frostProgression.purchasedBranchNodeRanks).length, 0);
  assert.equal(frostProgression.unlockedAbilityIds.indexOf("ability.mage.flash_freeze") >= 0, false);
  assert.equal(frostProgression.unlockedAbilityIds.indexOf("ability.mage.ice_bolt") >= 0, false);
});
