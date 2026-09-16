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
import { formulaHeal, formulaSpellHit } from "../src/domain/canonical_stats";
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

function mystic(
  level: number,
  branchId = "",
  classNodes: string[] = [],
  branchRanks: { [id: string]: number } = {},
  userId = "mystic",
): MatchPlayer {
  const progression = initializeProgression(catalog, "class.mystic");
  progression.level = level;
  progression.branchId = branchId;
  progression.purchasedClassNodeIds = classNodes.slice();
  progression.purchasedBranchNodeRanks = { ...branchRanks };
  syncDerivedAbilityOwnership(progression, catalog, "class.mystic");
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mystic", progression, emptyEquipment(), emptyInventory(), {}, {}),
  );
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: userId,
    characterId: "char-" + userId,
    name: "Mystic",
    classId: "class.mystic",
    x: 900,
    y: 400,
    maxHealth: 1000,
    health: 500,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
    inventory: emptyInventory(),
    equipment: emptyEquipment(),
    progression: progression,
    effects: [],
    abilityCooldowns: {},
    resources: { [MANA]: stats.maxMana > 0 ? stats.maxMana : 116 },
    facingX: 1,
    facingY: 0,
  };
}

function ally(userId = "ally"): MatchPlayer {
  const player = mystic(10, "", [], {}, userId);
  player.x = 910;
  player.y = 400;
  player.health = 400;
  player.classId = "class.warrior";
  player.progression = initializeProgression(catalog, "class.warrior");
  player.progression.level = 10;
  player.resources = {};
  return player;
}

function message(opcode: ClientOpcode, body: { [id: string]: unknown }, userId = "mystic") {
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

function completeCast(state: StarterZoneState, startTick: number, body: { [id: string]: unknown }, userId = "mystic") {
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

function intOf(level: number): number {
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mystic", { level: level, allocatedAttributes: {}, freeStatAllocations: {} }, emptyEquipment(), emptyInventory(), {}, {}),
  );
  return stats.values["stat.intelligence"];
}

function spiOf(level: number): number {
  const stats = evaluateStats(
    catalog,
    playerStatContext("class.mystic", { level: level, allocatedAttributes: {}, freeStatAllocations: {} }, emptyEquipment(), emptyInventory(), {}, {}),
  );
  return stats.values["stat.spirit"];
}

function tagged(effects: MatchEnemy["effects"] | MatchPlayer["effects"], tag: string) {
  const list = effects !== undefined ? effects : [];
  const found = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].remainingTicks > 0 && list[i].tags.indexOf(tag) >= 0) {
      found.push(list[i]);
    }
  }
  return found;
}

test("Mystic auto-attack and Fateweave use INT harm, SPI mend, self heal, and hostile polarity", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mystic(10));
  const intel = intOf(10);
  const spirit = spiOf(10);
  const beforeAuto = state.enemies[0].health;
  let result = run(state, 10, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "mystic-aa-01" })]);
  assert.ok(Math.abs(damage(beforeAuto, result.state.enemies[0].health) - formulaSpellHit(6, intel)) < 0.0001);
  assert.equal(result.state.players.mystic.progression?.hotbarAssignments.indexOf("ability.mystic.auto_attack"), -1);

  const beforeHarm = result.state.enemies[0].health;
  const manaBefore = manaOf(result.state.players.mystic);
  result = completeCast(result.state, 11, { abilityId: "ability.mystic.fateweave", targetId: "enemy-1", requestId: "mystic-harm-01" });
  assert.ok(Math.abs(manaBefore - manaOf(result.state.players.mystic) - (12 - 6.2 / SNAPSHOT_RATE_HZ)) < 0.05);
  assert.ok(Math.abs(damage(beforeHarm, result.state.enemies[0].health) - formulaSpellHit(20, intel)) < 0.0001);
  assert.equal(result.state.players.mystic.health, 500);

  const beforeSelf = result.state.players.mystic.health;
  result = completeCast(result.state, 40, { abilityId: "ability.mystic.fateweave", targetId: "mystic", requestId: "mystic-self-01" });
  assert.ok(Math.abs(result.state.players.mystic.health - beforeSelf - formulaHeal(22, spirit)) < 0.0001);
  assert.equal(result.state.enemies[0].health, beforeHarm - formulaSpellHit(20, intel));
});

test("Fateweave heals a friendly target and Fateweave R2 raises both polarities by 25%", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mystic(10, "", ["talent.mystic.fateweave_r2"]));
  state = addPlayer(state, ally());
  const intel = intOf(10);
  const spirit = spiOf(10);
  const beforeAlly = state.players.ally.health;
  let result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "ally", requestId: "mystic-ally-01" });
  assert.ok(Math.abs(result.state.players.ally.health - beforeAlly - formulaHeal(22, spirit) * 1.25) < 0.0001);
  assert.equal(result.state.enemies[0].health, 1000);

  const beforeHarm = result.state.enemies[0].health;
  result = completeCast(result.state, 40, { abilityId: "ability.mystic.fateweave", targetId: "enemy-1", requestId: "mystic-r2-harm" });
  assert.ok(Math.abs(damage(beforeHarm, result.state.enemies[0].health) - formulaSpellHit(20, intel) * 1.25) < 0.0001);
});

test("Compassion leaves a 20% HoT over 4s after a mend", () => {
  let state = zone();
  state = addPlayer(state, mystic(10, "", ["talent.mystic.compassion"]));
  const spirit = spiOf(10);
  const heal = formulaHeal(22, spirit);
  const before = state.players.mystic.health;
  let result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "mystic", requestId: "compassion-01" });
  const hots = tagged(result.state.players.mystic.effects, "compassion");
  assert.equal(hots.length, 1);
  const total = hots[0].totalRemaining !== undefined ? hots[0].totalRemaining : 0;
  assert.ok(Math.abs(total - heal * 0.2) < 0.05);
  const until = result.state.players.mystic.effects?.find((effect) => effect.tags.indexOf("compassion") >= 0);
  const start = until !== undefined && until.nextTickAt > 0 ? until.nextTickAt : 30;
  for (let tick = start; tick <= start + 50; tick++) {
    result = run(result.state, tick);
  }
  assert.ok(Math.abs(result.state.players.mystic.health - before - heal * 1.2) < 0.2);
});

test("Malice leaves a 20% DoT over 4s that never crits", () => {
  let state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mystic(10, "", ["talent.mystic.malice"]));
  const intel = intOf(10);
  const hit = formulaSpellHit(20, intel);
  let result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "enemy-1", requestId: "malice-01" });
  const dots = tagged(result.state.enemies[0].effects, "malice");
  assert.equal(dots.length, 1);
  const total = dots[0].totalRemaining !== undefined ? dots[0].totalRemaining : 0;
  assert.ok(Math.abs(total - hit * 0.2) < 0.05);
  const nextTick = dots[0].nextTickAt;
  const beforeTick = result.state.enemies[0].health;
  const perTick = dots[0].magnitude;
  result = run(result.state, nextTick);
  const tickDamage = beforeTick - result.state.enemies[0].health;
  assert.ok(Math.abs(tickDamage - perTick) < 0.05);
  assert.ok(tickDamage < hit * 0.2);
  assert.ok(Math.abs(tickDamage - perTick * 1.5) > 0.5);
});

test("Protective Charm scales with SPI, R2 raises absorb 30%, and R3 heals once on break or expiry", () => {
  const spirit = spiOf(10);
  const expectedAbsorb = Math.floor(formulaHeal(40 * 1.3, spirit));

  let state = zone();
  state.enemies = [enemy("enemy-1")];
  const tank = mystic(10, "branch.mystic.charms", [], {
    "talent.mystic.charms.protective_charm_r2": 1,
    "talent.mystic.charms.protective_charm_r3": 1,
  });
  tank.maxHealth = 4000;
  tank.health = 3000;
  state = addPlayer(state, tank);
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.protective_charm", targetId: "mystic", requestId: "charm-r3-01" })]);
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.protective_charm", targetId: "mystic", requestId: "charm-refresh" })]);
  assert.equal(tagged(result.state.players.mystic.effects, "shield").length, 1);
  result.state.enemies[0].damage = 400;
  result.state.enemies[0].attackCooldownSec = 0.1;
  result.state.enemies[0].lastAttackTick = -1;
  result.state.enemies[0].aggroTarget = "mystic";
  result.state.enemies[0].aggroRadius = 400;
  const beforeBreak = result.state.players.mystic.health;
  result = run(result.state, 20);
  assert.equal(tagged(result.state.players.mystic.effects, "shield").length, 0);
  const lost = beforeBreak - result.state.players.mystic.health;
  assert.ok(lost > 0);
  assert.ok(lost < 400);
  assert.ok(result.state.players.mystic.health > beforeBreak - 400 + expectedAbsorb * 0.1);

  state = zone();
  const waiting = mystic(10, "branch.mystic.charms", [], {
    "talent.mystic.charms.protective_charm_r2": 1,
    "talent.mystic.charms.protective_charm_r3": 1,
  });
  state = addPlayer(state, waiting);
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.protective_charm", targetId: "mystic", requestId: "charm-expire" })]);
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.protective_charm", targetId: "mystic", requestId: "charm-expire-2" })]);
  const beforeExpire = result.state.players.mystic.health;
  const durationTicks = cooldownTicks(6, SNAPSHOT_RATE_HZ);
  for (let tick = 12; tick <= 11 + durationTicks + 2; tick++) {
    result = run(result.state, tick);
  }
  assert.equal(tagged(result.state.players.mystic.effects, "shield").length, 0);
  assert.ok(Math.abs(result.state.players.mystic.health - beforeExpire - expectedAbsorb * 0.15) < 0.8);
});

test("Battle Blessing arms after a mend and is consumed once on the next harm", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mystic(10, "branch.mystic.charms", [], { "talent.mystic.charms.battle_blessing": 1 }));
  const intel = intOf(10);
  let result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "mystic", requestId: "bless-arm-01" });
  assert.equal(tagged(result.state.players.mystic.effects, "battle_blessing").length, 1);
  const beforeFirst = result.state.enemies[0].health;
  result = completeCast(result.state, 40, { abilityId: "ability.mystic.fateweave", targetId: "enemy-1", requestId: "bless-harm-01" });
  assert.ok(Math.abs(damage(beforeFirst, result.state.enemies[0].health) - formulaSpellHit(20, intel) * 1.25) < 0.0001);
  assert.equal(tagged(result.state.players.mystic.effects, "battle_blessing").length, 0);
  const beforeSecond = result.state.enemies[0].health;
  result = completeCast(result.state, 70, { abilityId: "ability.mystic.fateweave", targetId: "enemy-1", requestId: "bless-harm-02" });
  assert.ok(Math.abs(damage(beforeSecond, result.state.enemies[0].health) - formulaSpellHit(20, intel)) < 0.0001);
});

test("Devotion increases Fateweave mends and Blessing R2 adds damage reduction on allies", () => {
  let state = zone();
  state = addPlayer(
    state,
    mystic(10, "branch.mystic.charms", [], {
      "talent.mystic.charms.devotion": 2,
      "talent.mystic.charms.blessing": 1,
      "talent.mystic.charms.blessing_r2": 1,
    }),
  );
  state = addPlayer(state, ally());
  const spirit = spiOf(10);
  const before = state.players.ally.health;
  let result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "ally", requestId: "devotion-01" });
  assert.ok(Math.abs(result.state.players.ally.health - before - formulaHeal(22, spirit) * 1.16) < 0.0001);

  result = run(result.state, 40, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.blessing", requestId: "blessing-r2-01" })]);
  assert.equal(tagged(result.state.players.mystic.effects, "buff").length, 1);
  assert.equal(tagged(result.state.players.ally.effects, "buff").length, 1);
  const dr = tagged(result.state.players.ally.effects, "blessing_dr");
  assert.equal(dr.length, 1);
  assert.ok(Math.abs(dr[0].magnitude - 0.08) < 0.0001);
});

test("Mending Ward heals while the Mystic shield lasts, and Overflow cannot recurse", () => {
  let state = zone();
  state = addPlayer(state, mystic(10, "branch.mystic.charms", [], { "talent.mystic.charms.mending_ward": 1 }));
  state = addPlayer(state, ally());
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.protective_charm", targetId: "ally", requestId: "ward-01" })]);
  const wards = tagged(result.state.players.ally.effects, "mending_ward");
  assert.equal(wards.length, 1);
  const beforeAlly = result.state.players.ally.health;
  const nextTick = wards[0].nextTickAt;
  result = run(result.state, nextTick);
  assert.ok(Math.abs(result.state.players.ally.health - beforeAlly - result.state.players.ally.maxHealth * 0.02) < 0.05);

  state = zone();
  state = addPlayer(state, mystic(10, "branch.mystic.charms", [], { "talent.mystic.charms.overflow": 1 }));
  state = addPlayer(state, ally());
  const spirit = spiOf(10);
  const beforeOverflow = state.players.mystic.health;
  const allyBefore = state.players.ally.health;
  result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "ally", requestId: "overflow-01" });
  const allyGain = result.state.players.ally.health - allyBefore;
  const selfGain = result.state.players.mystic.health - beforeOverflow;
  assert.ok(Math.abs(allyGain - formulaHeal(22, spirit)) < 0.05);
  assert.ok(Math.abs(selfGain - allyGain * 0.2) < 0.05);
});

test("Benediction heals and shields nearby allies for max-HP percents at zero mana", () => {
  let state = zone();
  state = addPlayer(state, mystic(10, "branch.mystic.charms"));
  state = addPlayer(state, ally());
  const manaBefore = manaOf(state.players.mystic);
  const before = state.players.ally.health;
  const result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.benediction", requestId: "benediction-01" })]);
  assert.ok(Math.abs(manaOf(result.state.players.mystic) - manaBefore) < 0.0001);
  assert.ok(Math.abs(result.state.players.ally.health - before - result.state.players.ally.maxHealth * 0.3) < 0.05);
  const shields = tagged(result.state.players.ally.effects, "shield");
  assert.equal(shields.length, 1);
  assert.ok(Math.abs((shields[0].maxAbsorb !== undefined ? shields[0].maxAbsorb : 0) - result.state.players.ally.maxHealth * 0.1) < 0.05);
});

test("Wither deals 36 INT-scaled damage over eight ticks, never crits, and R2 adds 25%", () => {
  let state = zone();
  state.combatRandom = scriptedRandom([0]);
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mystic(10, "branch.mystic.curses", [], { "talent.mystic.curses.wither_r2": 1 }));
  const intel = intOf(10);
  const expected = formulaSpellHit(36, intel) * 1.25;
  let result = completeCast(state, 10, { abilityId: "ability.mystic.wither", targetId: "enemy-1", requestId: "wither-r2-01" });
  const dots = tagged(result.state.enemies[0].effects, "wither");
  assert.equal(dots.length, 1);
  const total = dots[0].totalRemaining !== undefined ? dots[0].totalRemaining : 0;
  assert.ok(Math.abs(total - expected) < 0.05);
  assert.equal(dots[0].baseTickCount, 8);
  const before = result.state.enemies[0].health;
  const nextTick = dots[0].nextTickAt;
  const perTick = dots[0].magnitude;
  result = run(result.state, nextTick);
  assert.ok(Math.abs(before - result.state.enemies[0].health - perTick) < 0.05);
  assert.ok(Math.abs(before - result.state.enemies[0].health - perTick * 1.5) > 0.5);
});

test("Dark Bargain reduces curse costs and Evil Eye increases damage taken", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    mystic(10, "branch.mystic.curses", [], {
      "talent.mystic.curses.dark_bargain": 2,
      "talent.mystic.curses.evil_eye": 1,
    }),
  );
  const intel = intOf(10);
  const manaBefore = manaOf(state.players.mystic);
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.wither", targetId: "enemy-1", requestId: "bargain-01" })]);
  assert.ok(Math.abs(manaBefore - manaOf(result.state.players.mystic) - (14 * 0.8 - 6.2 / SNAPSHOT_RATE_HZ)) < 0.08);

  result = run(result.state, 40, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.evil_eye", targetId: "enemy-1", requestId: "evil-eye-01" })]);
  assert.equal(tagged(result.state.enemies[0].effects, "debuff").length >= 1, true);
  const before = result.state.enemies[0].health;
  result = run(result.state, 41, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "evil-eye-hit" })]);
  assert.ok(Math.abs(damage(before, result.state.enemies[0].health) - formulaSpellHit(6, intel) * 1.15) < 0.05);
});

test("Festering hastens this Mystic's DoTs without changing total damage, and Vampiric heals from ticks", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(
    state,
    mystic(10, "branch.mystic.curses", [], {
      "talent.mystic.curses.festering": 1,
      "talent.mystic.curses.vampiric_curse": 1,
    }),
  );
  const intel = intOf(10);
  const expected = formulaSpellHit(36, intel);
  let result = completeCast(state, 10, { abilityId: "ability.mystic.wither", targetId: "enemy-1", requestId: "fester-01" });
  const dots = tagged(result.state.enemies[0].effects, "wither");
  assert.equal(dots.length, 1);
  const total = dots[0].totalRemaining !== undefined ? dots[0].totalRemaining : 0;
  assert.ok(Math.abs(total - expected) < 0.05);
  assert.ok((dots[0].tickRateModifiers !== undefined ? dots[0].tickRateModifiers : 1) > 1);
  const beforeHealth = result.state.players.mystic.health;
  const nextTick = dots[0].nextTickAt;
  const beforeEnemy = result.state.enemies[0].health;
  result = run(result.state, nextTick);
  const tickDamage = beforeEnemy - result.state.enemies[0].health;
  assert.ok(Math.abs(result.state.players.mystic.health - beforeHealth - tickDamage * 0.1) < 0.05);
});

test("Wither R3 and Malediction apply separate outgoing reductions, and Contagion hops once", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1", 960, 400), enemy("enemy-2", 980, 400)];
  state = addPlayer(
    state,
    mystic(10, "branch.mystic.curses", [], {
      "talent.mystic.curses.wither_r2": 1,
      "talent.mystic.curses.wither_r3": 1,
      "talent.mystic.curses.contagion": 1,
    }),
  );
  let result = completeCast(state, 10, { abilityId: "ability.mystic.wither", targetId: "enemy-1", requestId: "wither-r3-01" });
  const r3 = tagged(result.state.enemies[0].effects, "wither_r3");
  assert.equal(r3.length, 1);
  assert.ok(Math.abs(r3[0].magnitude + 0.1) < 0.0001);

  result.state.enemies[0].health = 1;
  const hopTick = tagged(result.state.enemies[0].effects, "wither")[0].nextTickAt;
  result = run(result.state, hopTick);
  assert.equal(result.state.enemies[0].health, 0);
  const hopped = tagged(result.state.enemies[1].effects, "wither");
  assert.equal(hopped.length, 1);
  assert.ok((hopped[0].remainingTicks ?? 0) > cooldownTicks(7, SNAPSHOT_RATE_HZ));
  result = run(result.state, hopTick + 1);
  assert.equal(tagged(result.state.enemies[1].effects, "wither").length, 1);

  state = zone();
  state.enemies = [enemy("enemy-1", 920, 400), enemy("enemy-2", 930, 410)];
  state = addPlayer(
    state,
    mystic(10, "branch.mystic.curses", [], {
      "talent.mystic.curses.wither_r3": 1,
    }),
  );
  const manaBefore = manaOf(state.players.mystic);
  result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.mystic.malediction", requestId: "malediction-01" })]);
  assert.ok(Math.abs(manaOf(result.state.players.mystic) - manaBefore) < 0.0001);
  assert.equal(tagged(result.state.enemies[0].effects, "wither").length, 1);
  assert.equal(tagged(result.state.enemies[1].effects, "wither").length, 1);
  const weaken = result.state.enemies[0].effects?.filter((effect) => effect.statChannel === "outgoing_damage" && effect.remainingTicks > 0) ?? [];
  assert.ok(weaken.length >= 2);
  const sources = weaken.map((effect) => effect.effectId).sort();
  assert.equal(sources.indexOf("weaken") >= 0, true);
  assert.equal(sources.indexOf("wither-r3-outgoing") >= 0, true);
});

test("Siphon heals from Fateweave harm and respec removes Charm and Curse grants", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, mystic(10, "branch.mystic.curses", [], { "talent.mystic.curses.siphon": 1 }));
  const intel = intOf(10);
  const before = state.players.mystic.health;
  const result = completeCast(state, 10, { abilityId: "ability.mystic.fateweave", targetId: "enemy-1", requestId: "siphon-01" });
  assert.ok(Math.abs(result.state.players.mystic.health - before - formulaSpellHit(20, intel) * 0.15) < 0.05);

  const charms = mystic(10, "branch.mystic.charms", [], {
    "talent.mystic.charms.blessing": 1,
    "talent.mystic.charms.overflow": 1,
  });
  const curses = mystic(10, "branch.mystic.curses", [], {
    "talent.mystic.curses.evil_eye": 1,
    "talent.mystic.curses.contagion": 1,
  });
  assert.equal((charms.progression?.unlockedAbilityIds ?? []).indexOf("ability.mystic.blessing") >= 0, true);
  assert.equal((charms.progression?.unlockedAbilityIds ?? []).indexOf("ability.mystic.protective_charm") >= 0, true);
  assert.equal((curses.progression?.unlockedAbilityIds ?? []).indexOf("ability.mystic.evil_eye") >= 0, true);
  const cursesProgression = curses.progression;
  assert.ok(cursesProgression !== undefined);
  const wiped = applyCanonicalRespec(cursesProgression, catalog, "class.mystic", "char-mystic", "respec-mystic-01", "npc.test_innkeeper", 1);
  assert.equal((cursesProgression.unlockedAbilityIds ?? []).indexOf("ability.mystic.evil_eye") >= 0, false);
  assert.equal((cursesProgression.unlockedAbilityIds ?? []).indexOf("ability.mystic.wither") >= 0, false);
  assert.equal(wiped.ok, true);
});
