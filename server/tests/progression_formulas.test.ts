import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  CANONICAL_SOURCE_EQUIPMENT,
  CANONICAL_SOURCE_TALENT_NODE,
  CANONICAL_SOURCE_TEMPORARY_EFFECT,
  CHANNEL_OUTGOING,
  CHANNEL_TAKEN,
  evaluateCanonicalHit,
  evaluateCanonicalSnapshot,
  formulaAttackInterval,
  formulaCastTime,
  formulaCritChance,
  formulaCritMult,
  formulaDamageReduction,
  formulaDotTickInterval,
  formulaEffectiveHp,
  formulaHeal,
  formulaHpMax,
  formulaHasteMult,
  formulaManaMax,
  formulaManaRegen,
  formulaMeleeHit,
  formulaRangedHit,
  formulaSpellHit,
  regenerateMana,
  roundToTenths,
  scalePower,
  validateNumericTree,
  type CanonicalModifier,
} from "../src/domain/canonical_stats";
import { catalogFromContent, evaluateStats, emptyModifierMap } from "../src/domain/stats";
import { classUsesMana } from "../src/domain/canonical_progression";
import { cooldownTicks } from "../src/domain/combat";

const catalog = catalogFromContent(content);

function snapshotFor(classId: string, level: number, free: { [id: string]: number } = {}, modifiers: CanonicalModifier[] = []) {
  const classDef = catalog.classes[classId];
  assert.ok(classDef !== undefined);
  return evaluateCanonicalSnapshot({
    classId: classId,
    level: level,
    baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
    automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
    freeStatAllocations: free,
    usesMana: classUsesMana(classDef.resourceType),
    modifiers: modifiers,
  });
}

function liveStats(classId: string, level: number, identified: CanonicalModifier[] = []) {
  return evaluateStats(catalog, {
    classId: classId,
    level: level,
    allocatedAttributes: {},
    freeStatAllocations: {},
    equipmentModifiers: emptyModifierMap(),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
    identifiedModifiers: identified,
  });
}

test("canonical formulas match section 4 identities", () => {
  assert.equal(formulaHpMax(8), 110);
  assert.equal(formulaManaMax(9, true), 56);
  assert.equal(formulaManaMax(9, false), 0);
  assert.equal(formulaManaRegen(5, true), 2);
  assert.equal(formulaManaRegen(5, false), 0);
  assert.equal(formulaCritChance(12), 0.06);
  assert.equal(formulaCritMult(35), 1.85);
  assert.equal(formulaHasteMult(12), 1.12);
  assert.equal(formulaDamageReduction(12), 0.06);
  assert.equal(roundToTenths(formulaEffectiveHp(290, 0.06)), 308.5);
  assert.equal(formulaAttackInterval(2, 1.03), 2 / 1.03);
  assert.equal(formulaCastTime(1.5, 1.12), 1.5 / 1.12);
  assert.equal(formulaDotTickInterval(1, 2), 0.5);
  assert.equal(formulaMeleeHit(12, 35), 12 * (1 + 35 / 100));
  assert.equal(roundToTenths(formulaRangedHit(10, 36)), 13.6);
  assert.equal(roundToTenths(formulaSpellHit(16, 36)), 21.8);
  assert.equal(roundToTenths(formulaHeal(22, 26)), 27.7);
  assert.equal(scalePower(10, "melee", { "stat.strength": 50 }), 10 * (1 + 50 / 100));
  assert.equal(scalePower(10, "ranged", { "stat.agility": 50 }), 10 * (1 + 50 / 100));
  assert.equal(scalePower(10, "spell", { "stat.intelligence": 50 }), 10 * (1 + 50 / 100));
  assert.equal(scalePower(10, "curse", { "stat.intelligence": 50 }), 10 * (1 + 50 / 100));
  assert.equal(scalePower(10, "heal", { "stat.spirit": 50 }), 10 * (1 + 50 / 100));
  assert.equal(scalePower(10, "shield", { "stat.spirit": 50 }), 10 * (1 + 50 / 100));
});

test("every production class has the canonical level-1 array and resources", () => {
  const warrior = snapshotFor("class.warrior", 1);
  const mage = snapshotFor("class.mage", 1);
  const marksman = snapshotFor("class.marksman", 1);
  const mystic = snapshotFor("class.mystic", 1);
  assert.deepEqual(warrior.stats, {
    "stat.strength": 8,
    "stat.agility": 4,
    "stat.intelligence": 2,
    "stat.spirit": 3,
    "stat.vitality": 8,
    "stat.precision": 3,
    "stat.haste": 3,
    "stat.endurance": 3,
  });
  assert.deepEqual(mage.stats, {
    "stat.strength": 2,
    "stat.agility": 4,
    "stat.intelligence": 9,
    "stat.spirit": 5,
    "stat.vitality": 5,
    "stat.precision": 3,
    "stat.haste": 3,
    "stat.endurance": 3,
  });
  assert.deepEqual(marksman.stats, {
    "stat.strength": 4,
    "stat.agility": 9,
    "stat.intelligence": 3,
    "stat.spirit": 3,
    "stat.vitality": 6,
    "stat.precision": 3,
    "stat.haste": 3,
    "stat.endurance": 3,
  });
  assert.deepEqual(mystic.stats, {
    "stat.strength": 2,
    "stat.agility": 4,
    "stat.intelligence": 6,
    "stat.spirit": 8,
    "stat.vitality": 5,
    "stat.precision": 3,
    "stat.haste": 3,
    "stat.endurance": 3,
  });
  assert.equal(warrior.hpMax, 110);
  assert.equal(warrior.manaMax, 0);
  assert.equal(warrior.manaRegen, 0);
  assert.equal(marksman.manaMax, 0);
  assert.equal(mage.hpMax, 80);
  assert.equal(mage.manaMax, 56);
  assert.equal(mage.manaRegen, 2);
  assert.equal(mystic.manaMax, 44);
  assert.equal(mystic.manaRegen, 2.6);
  const liveWarrior = liveStats("class.warrior", 1);
  const liveMage = liveStats("class.mage", 1);
  assert.equal(liveWarrior.maxHealth, 110);
  assert.equal(liveWarrior.maxMana, 0);
  assert.equal(liveMage.maxHealth, 80);
  assert.equal(liveMage.maxMana, 56);
  assert.equal(liveWarrior.values["formula.mana_max"], undefined);
  assert.ok(liveMage.values["formula.mana_max"] > 0);
});

test("equipment and temporary-effect modifiers keep source identity", () => {
  const geared = snapshotFor("class.warrior", 1, {}, [
    {
      sourceId: "sword-1",
      sourceKind: CANONICAL_SOURCE_EQUIPMENT,
      channel: "stat.vitality",
      op: "add",
      value: 2,
    },
    {
      sourceId: "buff-fortitude",
      sourceKind: CANONICAL_SOURCE_TEMPORARY_EFFECT,
      channel: "stat.strength",
      op: "add",
      value: 4,
    },
  ]);
  assert.equal(geared.stats["stat.vitality"], 10);
  assert.equal(geared.hpMax, 130);
  assert.equal(geared.stats["stat.strength"], 12);
  const vitalitySource = geared.modifiers.filter((row) => row.channel === "stat.vitality" || row.sourceId === "sword-1");
  assert.ok(vitalitySource.some((row) => row.sourceId === "sword-1" && row.sourceKind === CANONICAL_SOURCE_EQUIPMENT));
  const live = liveStats("class.warrior", 1, [
    {
      sourceId: "sword-1",
      sourceKind: CANONICAL_SOURCE_EQUIPMENT,
      channel: "stat.vitality",
      op: "add",
      value: 2,
    },
  ]);
  assert.equal(live.maxHealth, 130);
});

test("higher ranks of the same node replace lower ranks", () => {
  const snapshot = snapshotFor("class.warrior", 1, {}, [
    {
      sourceId: "talent.warrior.bulwark.fortitude",
      sourceKind: CANONICAL_SOURCE_TALENT_NODE,
      nodeId: "talent.warrior.bulwark.fortitude",
      rank: 1,
      channel: CHANNEL_OUTGOING,
      op: "pct",
      value: 0.05,
    },
    {
      sourceId: "talent.warrior.bulwark.fortitude",
      sourceKind: CANONICAL_SOURCE_TALENT_NODE,
      nodeId: "talent.warrior.bulwark.fortitude",
      rank: 2,
      channel: CHANNEL_OUTGOING,
      op: "pct",
      value: 0.12,
    },
  ]);
  assert.equal(snapshot.outgoingProduct, 1.12);
});

test("different source percentage modifiers multiply", () => {
  const snapshot = snapshotFor("class.warrior", 1, {}, [
    {
      sourceId: "ability.mystic.evil_eye",
      sourceKind: CANONICAL_SOURCE_TEMPORARY_EFFECT,
      channel: CHANNEL_TAKEN,
      op: "pct",
      value: 0.15,
    },
    {
      sourceId: "ability.warrior.berserk",
      sourceKind: CANONICAL_SOURCE_TEMPORARY_EFFECT,
      channel: CHANNEL_TAKEN,
      op: "pct",
      value: 0.2,
    },
  ]);
  assert.equal(snapshot.takenProduct, 1.15 * 1.2);
});

test("attributes crit chance and damage reduction are not capped", () => {
  const snapshot = snapshotFor("class.warrior", 1, {
    "stat.precision": 200,
    "stat.endurance": 200,
    "stat.strength": 200,
  });
  assert.equal(snapshot.stats["stat.precision"], 203);
  assert.equal(snapshot.critChance, 0.005 * 203);
  assert.ok(snapshot.critChance > 1);
  assert.equal(snapshot.damageReduction, 0.005 * 203);
  assert.ok(snapshot.damageReduction > 1);
  assert.equal(snapshot.critMult, 1.5 + 0.01 * 208);
});

test("caster mana regenerates continuously and physical classes have none", () => {
  assert.equal(regenerateMana(10, 56, 2, 1), 12);
  assert.equal(regenerateMana(55, 56, 2, 1), 56);
  assert.equal(regenerateMana(40, 0, 2, 1), 0);
  const mage = liveStats("class.mage", 1);
  const warrior = liveStats("class.warrior", 1);
  assert.equal(mage.manaRegen, 2);
  assert.equal(warrior.manaRegen, 0);
  assert.equal(warrior.maxMana, 0);
});

test("haste scales attack cast and DoT interval but not cooldown ticks", () => {
  const haste = 2;
  assert.equal(formulaAttackInterval(2, haste), 1);
  assert.equal(formulaCastTime(1.5, haste), 0.75);
  assert.equal(formulaDotTickInterval(1, haste), 0.5);
  assert.equal(cooldownTicks(6, 10), cooldownTicks(6 / 1, 10));
  assert.notEqual(cooldownTicks(formulaCastTime(6, haste), 10), cooldownTicks(6, 10));
});

test("haste-scaled DoT intervals preserve total damage", () => {
  const baseMagnitude = 20;
  const baseInterval = 1;
  const duration = 10;
  function totalDamage(hasteMult: number): number {
    const interval = formulaDotTickInterval(baseInterval, hasteMult);
    const magnitude = baseMagnitude * (interval / baseInterval);
    return magnitude * (duration / interval);
  }
  assert.equal(totalDamage(1), 200);
  assert.equal(totalDamage(2), 200);
  assert.equal(roundToTenths(totalDamage(1.12)), 200);
});

test("damage taken follows scaled hit, crit, outgoing, DR, then taken product", () => {
  const hit = evaluateCanonicalHit({
    base: 100,
    category: "melee",
    stats: { "stat.strength": 0 },
    critChance: 0,
    critMult: 1.5,
    outgoingProduct: 1.1,
    damageReduction: 0.2,
    takenProduct: 1.15,
    critDamageProduct: 1.25,
    guaranteedCrit: true,
    random: function () {
      return 0;
    },
  });
  assert.equal(hit.rawScaled, 100);
  assert.equal(hit.crit, true);
  assert.equal(hit.afterCrit, 100 * 1.5 * 1.25);
  assert.equal(hit.afterOutgoing, 100 * 1.5 * 1.25 * 1.1);
  assert.equal(hit.afterDamageReduction, 100 * 1.5 * 1.25 * 1.1 * 0.8);
  assert.equal(hit.final, 100 * 1.5 * 1.25 * 1.1 * 0.8 * 1.15);
});

test("DoTs never roll crit and shields do not crit unless content says so", () => {
  const dot = evaluateCanonicalHit({
    base: 10,
    category: "spell",
    stats: { "stat.intelligence": 0 },
    critChance: 1,
    critMult: 2,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: 1,
    isDot: true,
    guaranteedCrit: true,
    random: function () {
      return 0;
    },
  });
  assert.equal(dot.crit, false);
  assert.equal(dot.final, 10);
  const shield = evaluateCanonicalHit({
    base: 40,
    category: "shield",
    stats: { "stat.spirit": 0 },
    critChance: 1,
    critMult: 2,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: 1,
    isShield: true,
    random: function () {
      return 0;
    },
  });
  assert.equal(shield.crit, false);
  const allowed = evaluateCanonicalHit({
    base: 40,
    category: "shield",
    stats: { "stat.spirit": 0 },
    critChance: 1,
    critMult: 2,
    outgoingProduct: 1,
    damageReduction: 0,
    takenProduct: 1,
    critDamageProduct: 1,
    isShield: true,
    shieldCanCrit: true,
    random: function () {
      return 0;
    },
  });
  assert.equal(allowed.crit, true);
});

test("nonfinite content numbers are rejected", () => {
  const issues: string[] = [];
  validateNumericTree({ baseStats: { "stat.vitality": Number.NaN } }, "class.warrior", issues);
  assert.ok(issues.some((code) => code.indexOf("nonfinite:") === 0));
  assert.throws(function () {
    evaluateCanonicalSnapshot({
      classId: "class.warrior",
      level: 1,
      baseStats: { "stat.vitality": Number.POSITIVE_INFINITY },
      automaticGrowth: {},
      freeStatAllocations: {},
      usesMana: false,
      modifiers: [],
    });
  });
});
