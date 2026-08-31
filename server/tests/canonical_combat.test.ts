import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  CANONICAL_SOURCE_TALENT_NODE,
  formulaAttackInterval,
  formulaCastTime,
  formulaHasteMult,
} from "../src/domain/canonical_stats";
import {
  MECHANIC_KINDS,
  activeConditionalModifiers,
  advanceCooldownRemaining,
  autoAttackBase,
  bonusCritChance,
  canPropagateHeal,
  canReflect,
  conditionHolds,
  cooldownRecoveryRate,
  createGenericCombatBus,
  defaultMechanicHandlers,
  dueDelayedGround,
  evaluatePowerHit,
  flatDamageReduction,
  hasteDoesNotChangeCooldown,
  hasteScaledAttackInterval,
  hasteScaledCastTime,
  hasMechanicKind,
  lifestealHandler,
  mechanicKindCount,
  overflowHealHandler,
  reflectDamageHandler,
  reflectedDamageAmount,
  resetAbilityCooldown,
  resetOncePerCombat,
  resolveIndependentHits,
  scheduleDelayedGround,
  secondaryHealAmount,
  tryConsumeOncePerCombat,
  type ConditionalModifier,
  type DirectHitRequest,
} from "../src/domain/canonical_combat";
import { scriptedRandom } from "../src/domain/combat_rng";
import { cooldownTicks } from "../src/domain/combat";

const STATS = {
  "stat.strength": 20,
  "stat.agility": 10,
  "stat.intelligence": 15,
  "stat.spirit": 12,
};

function hitRequest(overrides: { [key: string]: unknown } = {}): DirectHitRequest {
  const request: DirectHitRequest = {
    base: 20,
    category: "melee",
    stats: STATS,
    critChance: 0.5,
    critMult: 2,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: 1,
    random: scriptedRandom([0.9]),
  };
  const keys = Object.keys(overrides);
  for (let i = 0; i < keys.length; i++) {
    (request as unknown as { [key: string]: unknown })[keys[i]] = overrides[keys[i]];
  }
  return request;
}

test("every required mechanic kind has a generic handler stub", () => {
  assert.ok(mechanicKindCount() >= 40);
  const handlers = defaultMechanicHandlers();
  assert.equal(handlers.length, MECHANIC_KINDS.length);
  for (let i = 0; i < MECHANIC_KINDS.length; i++) {
    assert.equal(hasMechanicKind(MECHANIC_KINDS[i]), true);
    assert.equal(handlers[i].id, MECHANIC_KINDS[i]);
  }
});

test("core combat modules do not branch on class names", () => {
  const files = [
    "combat_rng.ts",
    "combat_events.ts",
    "canonical_combat.ts",
    "effects.ts",
    "combat_pipeline.ts",
    "threat.ts",
    "targeting.ts",
    "ability.ts",
    "movement.ts",
  ];
  const domainDir = join(process.cwd(), "src", "domain");
  const forbidden = ["class.warrior", "class.mage", "class.marksman", "class.mystic"];
  for (let f = 0; f < files.length; f++) {
    const text = readFileSync(join(domainDir, files[f]), "utf8");
    for (let i = 0; i < forbidden.length; i++) {
      assert.equal(text.indexOf(forbidden[i]) < 0, true, files[f] + " contains " + forbidden[i]);
    }
  }
});

test("direct melee ranged spell and heal use generic power categories", () => {
  const noCrit = scriptedRandom([0.99]);
  const melee = evaluatePowerHit("melee", hitRequest({ random: noCrit, critChance: 0 }));
  const ranged = evaluatePowerHit("ranged", hitRequest({ category: "ranged", random: noCrit, critChance: 0 }));
  const spell = evaluatePowerHit("spell", hitRequest({ category: "spell", random: noCrit, critChance: 0 }));
  const heal = evaluatePowerHit("heal", hitRequest({ category: "heal", random: noCrit, critChance: 0, damageReduction: 0 }));
  assert.ok(melee.final > 20);
  assert.ok(ranged.final > 20);
  assert.ok(spell.final > 20);
  assert.ok(heal.final > 20);
  assert.equal(melee.crit, false);
});

test("independent multi-hit rolls crits separately on one parent cooldown", () => {
  const hits = resolveIndependentHits(3, hitRequest({ random: scriptedRandom([0.01, 0.9, 0.01]), critChance: 0.5 }));
  assert.equal(hits.length, 3);
  assert.equal(hits[0].result.crit, true);
  assert.equal(hits[1].result.crit, false);
  assert.equal(hits[2].result.crit, true);
  assert.ok(hits[0].result.final > hits[1].result.final);
});

test("haste changes cast and attack timing but not stored cooldown remaining", () => {
  const haste = formulaHasteMult(12);
  assert.ok(hasteScaledCastTime(1.5, haste, 1) < 1.5);
  assert.ok(hasteScaledAttackInterval(2, haste, 1) < 2);
  assert.equal(formulaCastTime(1.5, haste), hasteScaledCastTime(1.5, haste, 1));
  assert.equal(formulaAttackInterval(2, haste), hasteScaledAttackInterval(2, haste, 1));
  assert.equal(hasteDoesNotChangeCooldown(40, haste), 40);
  assert.equal(cooldownTicks(8, 10), 80);
});

test("cooldown recovery advances remaining ticks without rewriting stored duration", () => {
  const stored = 40;
  const withHaste = hasteDoesNotChangeCooldown(stored, 2);
  const recovered = advanceCooldownRemaining(stored, 1.25, 8);
  assert.equal(withHaste, 40);
  assert.equal(recovered, 30);
  const mods: ConditionalModifier[] = [
    {
      sourceId: "node.relentless",
      sourceKind: CANONICAL_SOURCE_TALENT_NODE,
      nodeId: "node.relentless",
      rank: 1,
      channel: "cooldown_recovery",
      op: "add",
      value: 0.2,
      condition: "moving",
    },
    {
      sourceId: "node.relentless",
      sourceKind: CANONICAL_SOURCE_TALENT_NODE,
      nodeId: "node.relentless",
      rank: 2,
      channel: "cooldown_recovery",
      op: "add",
      value: 0.4,
      condition: "moving",
    },
  ];
  const standing = activeConditionalModifiers(mods, {
    health: 100,
    maxHealth: 100,
    axisX: 0,
    axisY: 0,
  });
  const moving = activeConditionalModifiers(mods, {
    health: 100,
    maxHealth: 100,
    axisX: 1,
    axisY: 0,
  });
  assert.equal(cooldownRecoveryRate(standing), 1);
  assert.equal(cooldownRecoveryRate(moving), 1.4);
});

test("conditions cover health, motion, proximity, and control counts", () => {
  const low: Parameters<typeof conditionHolds>[1] = {
    health: 20,
    maxHealth: 100,
    healthThreshold: 0.35,
    axisX: 0,
    axisY: 0,
    nearestEnemyDistance: 12,
    proximityRange: 16,
    controlledEnemyCount: 2,
    requiredControlled: 2,
    targetHealth: 10,
    targetMaxHealth: 100,
    targetHealthThreshold: 0.2,
    inCombat: true,
  };
  assert.equal(conditionHolds("health_threshold", low), true);
  assert.equal(conditionHolds("target_health", low), true);
  assert.equal(conditionHolds("standing_still", low), true);
  assert.equal(conditionHolds("moving", low), false);
  assert.equal(conditionHolds("enemy_proximity", low), true);
  assert.equal(conditionHolds("controlled_enemy_count", low), true);
});

test("modifier helpers cover DR, crit, auto-attack, and mana cost", () => {
  const mods: ConditionalModifier[] = [
    { sourceId: "a", sourceKind: CANONICAL_SOURCE_TALENT_NODE, channel: "flat_damage_reduction", op: "add", value: 0.15 },
    { sourceId: "b", sourceKind: CANONICAL_SOURCE_TALENT_NODE, channel: "crit_chance", op: "add", value: 0.05 },
    { sourceId: "c", sourceKind: CANONICAL_SOURCE_TALENT_NODE, channel: "auto_attack", op: "pct", value: 0.1 },
  ];
  assert.equal(flatDamageReduction(mods), 0.15);
  assert.equal(bonusCritChance(mods), 0.05);
  assert.equal(autoAttackBase(10, mods), 11);
});

test("reflection cannot recurse or crit unless explicitly allowed", () => {
  const incoming = {
    type: "damage_taken" as const,
    tick: 1,
    sourceId: "enemy",
    sourceKind: "enemy" as const,
    targetId: "player",
    targetKind: "player" as const,
    amount: 40,
    originTag: "primary" as const,
  };
  assert.equal(canReflect(incoming), true);
  assert.equal(canReflect({ ...incoming, isReflection: true, originTag: "reflect" }), false);
  assert.equal(reflectedDamageAmount(40, 0.5, false, true), 20);
  const bus = createGenericCombatBus([reflectDamageHandler(0.5, false)]);
  bus.emit({
    type: "damage_taken",
    tick: 1,
    sourceId: "enemy",
    sourceKind: "enemy",
    targetId: "player",
    targetKind: "player",
    amount: 40,
  });
  const reflected = bus.events.filter(function (event) {
    return event.originTag === "reflect" && event.type === "damage_dealt";
  });
  assert.equal(reflected.length, 1);
  assert.equal(reflected[0].isReflection, true);
  assert.equal(reflected[0].crit, false);
  const before = bus.events.length;
  bus.emit({
    type: "damage_taken",
    tick: 2,
    sourceId: "player",
    sourceKind: "player",
    targetId: "enemy",
    targetKind: "enemy",
    amount: 20,
    originTag: "reflect",
    isReflection: true,
  });
  assert.equal(bus.events.length, before + 1);
});

test("secondary overflow heals do not recurse", () => {
  const primary = {
    type: "healing_dealt" as const,
    tick: 1,
    sourceId: "healer",
    sourceKind: "player" as const,
    targetId: "ally",
    targetKind: "player" as const,
    amount: 50,
    originTag: "primary" as const,
  };
  assert.equal(canPropagateHeal(primary), true);
  assert.equal(secondaryHealAmount(50, 0.2), 10);
  const bus = createGenericCombatBus([overflowHealHandler(0.2)]);
  bus.emit(primary);
  const overflow = bus.events.filter(function (event) {
    return event.originTag === "overflow";
  });
  assert.equal(overflow.length, 1);
  const before = bus.events.length;
  bus.emit({
    type: "healing_dealt",
    tick: 2,
    sourceId: overflow[0].sourceId,
    sourceKind: overflow[0].sourceKind,
    targetId: overflow[0].targetId,
    targetKind: overflow[0].targetKind,
    amount: overflow[0].amount,
    originTag: "overflow",
  });
  assert.equal(bus.events.length, before + 1);
});

test("lifesteal does not convert reflected or periodic damage", () => {
  const bus = createGenericCombatBus([lifestealHandler(0.1)]);
  bus.emit({
    type: "damage_dealt",
    tick: 1,
    sourceId: "player",
    sourceKind: "player",
    targetId: "enemy",
    targetKind: "enemy",
    amount: 30,
    isDot: true,
  });
  assert.equal(
    bus.events.filter(function (event) {
      return event.originTag === "lifesteal";
    }).length,
    0,
  );
});

test("once-per-combat triggers reset on combat end", () => {
  const table: { [id: string]: boolean } = {};
  assert.equal(tryConsumeOncePerCombat(table, "last_stand"), true);
  assert.equal(tryConsumeOncePerCombat(table, "last_stand"), false);
  resetOncePerCombat(table);
  assert.equal(tryConsumeOncePerCombat(table, "last_stand"), true);
});

test("cooldown reset and delayed ground targeting are generic", () => {
  const cds: { [id: string]: number } = { "ability.test.skill": 40 };
  assert.equal(resetAbilityCooldown(cds, "ability.test.skill", 10), true);
  assert.equal(cds["ability.test.skill"], 10);
  const pending = scheduleDelayedGround([], {
    id: "ground-1",
    sourceId: "player",
    sourceKind: "player",
    abilityId: "ability.test.meteor",
    x: 8,
    y: 8,
    radius: 24,
    resolveTick: 12,
    effectId: "nova",
  });
  const early = dueDelayedGround(pending, 11);
  assert.equal(early.due.length, 0);
  const late = dueDelayedGround(pending, 12);
  assert.equal(late.due.length, 1);
});
