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
import { ClientOpcode, PROTOCOL_VERSION } from "../src/domain/protocol";
import { scriptedRandom } from "../src/domain/combat_rng";

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

function enemy(id: string, x = 960): MatchEnemy {
  return {
    id: id,
    enemyId: id,
    spawnX: x,
    spawnY: 400,
    x: x,
    y: 400,
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

function warrior(
  level: number,
  branchId = "",
  classNodes: string[] = [],
  branchRanks: { [id: string]: number } = {},
): MatchPlayer {
  const progression = initializeProgression(catalog, "class.warrior");
  progression.level = level;
  progression.branchId = branchId;
  progression.purchasedClassNodeIds = classNodes.slice();
  progression.purchasedBranchNodeRanks = { ...branchRanks };
  syncDerivedAbilityOwnership(progression, catalog, "class.warrior");
  return {
    userId: "warrior",
    sessionId: "session-warrior",
    username: "warrior",
    characterId: "char-warrior",
    name: "Warrior",
    classId: "class.warrior",
    x: 930,
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
  };
}

function message(opcode: ClientOpcode, body: { [id: string]: unknown }) {
  return {
    opcode: opcode,
    userId: "warrior",
    raw: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...body }),
  };
}

function run(state: StarterZoneState, tick: number, messages: ReturnType<typeof message>[] = []) {
  return applyMatchLoop(state, tick, contentHash, messages);
}

function damage(before: number, after: number): number {
  return before - after;
}

test("Warrior auto attack and Heavy Strike use canonical STR values and ranks", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1")];
  state = addPlayer(state, warrior(2, "", ["talent.warrior.heavy_strike_r2", "talent.warrior.weapon_mastery"]));
  const beforeAuto = state.enemies[0].health;
  let result = run(state, 10, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "warrior-auto-01" })]);
  assert.ok(Math.abs(damage(beforeAuto, result.state.enemies[0].health) - 12 * 1.11 * 1.08) < 0.0001);
  assert.equal(result.state.players.warrior.progression?.hotbarAssignments.indexOf("ability.warrior.auto_attack"), -1);

  const beforeHeavy = result.state.enemies[0].health;
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.heavy_strike", targetId: "enemy-1", requestId: "warrior-heavy-01" })]);
  assert.ok(Math.abs(damage(beforeHeavy, result.state.enemies[0].health) - 28 * 1.11 * 1.25) < 0.0001);
});

test("Bulwark modifiers, active control, taunt, reflection, and Last Stand use the shared pipeline", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1"), enemy("enemy-2", 950)];
  state = addPlayer(
    state,
    warrior(
      10,
      "branch.warrior.bulwark",
      ["talent.warrior.conditioning"],
      {
        "talent.warrior.bulwark.challenge_r2": 1,
        "talent.warrior.bulwark.challenge_r3": 1,
        "talent.warrior.bulwark.fortitude": 2,
        "talent.warrior.bulwark.shield_bash": 1,
        "talent.warrior.bulwark.shield_bash_r2": 1,
        "talent.warrior.bulwark.punishment": 1,
        "talent.warrior.bulwark.iron_thorns": 1,
        "talent.warrior.bulwark.last_stand": 1,
      },
    ),
  );
  let result = run(state, 10, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.challenge", requestId: "bulwark-challenge-01" })]);
  assert.equal(result.state.enemies[0].tauntSourceId, "warrior");
  assert.equal(result.state.enemies[0].tauntTakenReduction, 0.1);
  assert.equal(result.state.enemies[0].tauntUntilTick, 70);
  assert.equal(result.state.players.warrior.effects?.some((effect) => effect.effectId === "dr" && effect.remainingTicks === 59), true);
  assert.equal(result.state.players.warrior.maxHealth, (30 + 10 * 26 + 30) * 1.1);

  const beforePunishment = result.state.enemies[0].health;
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.heavy_strike", targetId: "enemy-1", requestId: "bulwark-punishment-01" })]);
  assert.ok(Math.abs(damage(beforePunishment, result.state.enemies[0].health) - 28 * 1.35 * 1.25) < 0.0001);

  const beforeBash = result.state.enemies[0].health;
  result = run(result.state, 12, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.shield_bash", targetId: "enemy-1", requestId: "bulwark-bash-01" })]);
  assert.ok(Math.abs(damage(beforeBash, result.state.enemies[0].health) - 10 * 1.35) < 0.0001);
  assert.equal(result.state.enemies[0].effects?.some((effect) => effect.type === "stun" && effect.remainingTicks === 19), true);

  result.state.players.warrior.health = 100;
  result.state.enemies[0].effects = [];
  result.state.enemies[0].aggroTarget = "warrior";
  result.state.enemies[0].attackRange = 40;
  result.state.enemies[0].x = 940;
  result.state.enemies[0].lastAttackTick = -1;
  result = run(result.state, 30);
  assert.ok(result.state.players.warrior.health > 100);
  assert.ok(result.state.enemies[0].health < beforeBash - 10 * 1.35);
  const afterLastStand = result.state.players.warrior.health;
  result.state.enemies[0].lastAttackTick = -1;
  result = run(result.state, 31);
  assert.ok(result.state.players.warrior.health < afterLastStand);

  result = run(result.state, 32, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.unbreakable", requestId: "bulwark-capstone-01" })]);
  assert.equal(result.state.players.warrior.effects?.some((effect) => effect.abilityId === "ability.warrior.unbreakable" && effect.remainingTicks === 79), true);
});

test("Berserker Frenzy, execute, cooldown recovery, sustain, Whirlwind, and Berserk are data-driven", () => {
  let state = zone();
  state.enemies = [enemy("enemy-1"), enemy("enemy-2", 950)];
  state.enemies[0].health = 200;
  state = addPlayer(
    state,
    warrior(
      10,
      "branch.warrior.berserker",
      [],
      {
        "talent.warrior.berserker.frenzy_r2": 1,
        "talent.warrior.berserker.frenzy_r3": 1,
        "talent.warrior.berserker.slaughter": 1,
        "talent.warrior.berserker.relentless": 2,
        "talent.warrior.berserker.bloodlust": 1,
        "talent.warrior.berserker.whirlwind": 1,
        "talent.warrior.berserker.bloodthirst": 1,
        "talent.warrior.berserker.reckless": 1,
      },
    ),
  );
  let result = run(state, 10, [message(ClientOpcode.ATTACK, { targetId: "enemy-1", requestId: "berserker-auto-01" })]);
  const frenzy = result.state.players.warrior.effects?.find((effect) => effect.type === "passive_stacker");
  assert.equal(frenzy?.stacks, 1, JSON.stringify(result.state.players.warrior.effects));
  assert.equal(frenzy?.maxStacks, 5);
  assert.equal(frenzy?.magnitude, 0.07);

  result.state.enemies[0].health = 100;
  result.state.players.warrior.health = 100;
  const beforeHeavy = result.state.enemies[0].health;
  result = run(result.state, 11, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.heavy_strike", targetId: "enemy-1", requestId: "berserker-heavy-01" })]);
  assert.ok(Math.abs(damage(beforeHeavy, result.state.enemies[0].health) - 28 * 1.35 * 1.3 * 1.1) < 0.0001);
  assert.ok(result.state.players.warrior.health > 100);

  const beforeA = result.state.enemies[0].health;
  const beforeB = result.state.enemies[1].health;
  result = run(result.state, 12, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.whirlwind", requestId: "berserker-whirlwind-01" })]);
  assert.ok(result.state.enemies[0].health < beforeA);
  assert.ok(result.state.enemies[1].health < beforeB);
  assert.ok((result.state.players.warrior.abilityCooldowns?.["ability.warrior.whirlwind"] ?? 0) < 112);

  result = run(result.state, 13, [message(ClientOpcode.USE_ABILITY, { abilityId: "ability.warrior.berserk", requestId: "berserker-capstone-01" })]);
  assert.equal(result.state.players.warrior.effects?.some((effect) => effect.abilityId === "ability.warrior.berserk" && effect.remainingTicks === 99), true);
  for (let tick = 14; tick <= 64; tick++) {
    result = run(result.state, tick);
  }
  assert.equal(result.state.players.warrior.effects?.some((effect) => effect.type === "passive_stacker"), false);
});
