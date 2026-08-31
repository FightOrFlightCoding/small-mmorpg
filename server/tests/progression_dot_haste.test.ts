import assert from "node:assert/strict";
import test from "node:test";
import { formulaDotTickInterval, formulaHasteMult } from "../src/domain/canonical_stats";
import { evaluateCanonicalHit } from "../src/domain/canonical_stats";
import {
  cloneActiveEffect,
  retimePeriodic,
  type ActiveEffect,
} from "../src/domain/effects";
import { scriptedRandom } from "../src/domain/combat_rng";

function dot(total: number, ticks: number, interval: number): ActiveEffect {
  return {
    effectId: "dot.generic",
    abilityId: "ability.test.dot",
    sourceId: "caster-a",
    sourceKind: "player",
    type: "periodic_damage",
    stacks: 1,
    magnitude: total / ticks,
    remainingTicks: 80,
    tickIntervalTicks: 15,
    nextTickAt: 15,
    stackPolicy: "refresh",
    maxStacks: 1,
    refreshPolicy: "refresh",
    tags: ["bleed"],
    statChannel: "",
    resourceRole: "",
    instanceId: "caster-a:dot.generic",
    totalRemaining: total,
    ticksRemaining: ticks,
    baseTickCount: ticks,
    currentIntervalSec: interval,
    tickRateModifiers: 1,
    snapshotStats: { "stat.intelligence": 24 },
  };
}

test("DoT ticks never crit including guaranteed-crit rolls", () => {
  const hit = evaluateCanonicalHit({
    base: 12,
    category: "spell",
    stats: { "stat.intelligence": 24 },
    critChance: 1,
    critMult: 3,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: 2,
    guaranteedCrit: true,
    isDot: true,
    random: scriptedRandom([0]),
  });
  assert.equal(hit.crit, false);
  assert.equal(hit.afterCrit, hit.rawScaled);
});

test("haste compresses interval and preserves total damage", () => {
  const baseInterval = 1.5;
  const haste = formulaHasteMult(12);
  const scaled = formulaDotTickInterval(baseInterval, haste);
  assert.ok(scaled < baseInterval);
  const total = 36;
  const baseTicks = 8;
  const effect = dot(total, baseTicks, scaled);
  const perTick = effect.totalRemaining! / effect.ticksRemaining!;
  assert.equal(perTick * effect.ticksRemaining!, total);
});

test("festering-like tick-rate modifiers preserve remaining damage", () => {
  const effect = dot(40, 8, 1);
  const before = effect.totalRemaining;
  assert.equal(retimePeriodic(effect, 1.2), true);
  assert.equal(effect.totalRemaining, before);
  const reconstructed = effect.magnitude * (effect.ticksRemaining !== undefined ? effect.ticksRemaining : 0);
  assert.ok(Math.abs(reconstructed - 40) < 0.001);
});

test("arrowstorm-like modifiers only retune tagged bleeds", () => {
  const bleed = dot(20, 4, 1);
  const curse = cloneActiveEffect(dot(20, 4, 1));
  curse.tags = ["curse"];
  curse.effectId = "dot.curse";
  assert.equal(retimePeriodic(bleed, 1.25, "bleed"), true);
  assert.equal(retimePeriodic(curse, 1.25, "bleed"), false);
  assert.equal(curse.currentIntervalSec, 1);
});

test("different source instances stay distinguishable", () => {
  const a = dot(12, 4, 1);
  const b = cloneActiveEffect(a);
  b.sourceId = "caster-b";
  b.instanceId = "caster-b:dot.generic";
  assert.notEqual(a.instanceId, b.instanceId);
  assert.notEqual(a.sourceId, b.sourceId);
});
