import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import {
  L10_REFERENCE,
  evaluateCanonicalSnapshot,
  roundToTenths,
} from "../src/domain/canonical_stats";
import { catalogFromContent } from "../src/domain/stats";
import { classUsesMana } from "../src/domain/canonical_progression";

const catalog = catalogFromContent(content);

function autoGrowthSnapshot(classId: string) {
  const classDef = catalog.classes[classId];
  assert.ok(classDef !== undefined);
  return evaluateCanonicalSnapshot({
    classId: classId,
    level: 10,
    baseStats: classDef.baseStats !== undefined ? classDef.baseStats : {},
    automaticGrowth: classDef.automaticGrowth !== undefined ? classDef.automaticGrowth : {},
    freeStatAllocations: {},
    usesMana: classUsesMana(classDef.resourceType),
    modifiers: [],
  });
}

test("level-10 auto-growth reference sheet matches warrior mage marksman mystic", () => {
  const warrior = autoGrowthSnapshot("class.warrior");
  const mage = autoGrowthSnapshot("class.mage");
  const marksman = autoGrowthSnapshot("class.marksman");
  const mystic = autoGrowthSnapshot("class.mystic");
  assert.deepEqual(warrior.stats, L10_REFERENCE.warrior.stats);
  assert.equal(warrior.hpMax, L10_REFERENCE.warrior.hp);
  assert.equal(roundToTenths(warrior.effectiveHp), L10_REFERENCE.warrior.effectiveHp);
  assert.equal(warrior.manaMax, 0);
  assert.equal(warrior.manaRegen, 0);
  assert.equal(warrior.critChance, L10_REFERENCE.warrior.critChance);
  assert.equal(warrior.critMult, L10_REFERENCE.warrior.critMult);
  assert.equal(warrior.hasteMult, L10_REFERENCE.warrior.hasteMult);
  assert.equal(warrior.damageReduction, L10_REFERENCE.warrior.damageReduction);

  assert.deepEqual(mage.stats, L10_REFERENCE.mage.stats);
  assert.equal(mage.hpMax, L10_REFERENCE.mage.hp);
  assert.equal(roundToTenths(mage.effectiveHp), L10_REFERENCE.mage.effectiveHp);
  assert.equal(mage.manaMax, L10_REFERENCE.mage.mana);
  assert.equal(roundToTenths(mage.manaRegen), L10_REFERENCE.mage.regen);
  assert.equal(mage.critChance, L10_REFERENCE.mage.critChance);
  assert.equal(mage.critMult, L10_REFERENCE.mage.critMult);
  assert.equal(mage.hasteMult, L10_REFERENCE.mage.hasteMult);
  assert.equal(mage.damageReduction, L10_REFERENCE.mage.damageReduction);

  assert.deepEqual(marksman.stats, L10_REFERENCE.marksman.stats);
  assert.equal(marksman.hpMax, L10_REFERENCE.marksman.hp);
  assert.equal(roundToTenths(marksman.effectiveHp), L10_REFERENCE.marksman.effectiveHp);
  assert.equal(marksman.manaMax, 0);
  assert.equal(marksman.critChance, L10_REFERENCE.marksman.critChance);
  assert.equal(marksman.critMult, L10_REFERENCE.marksman.critMult);
  assert.equal(marksman.hasteMult, L10_REFERENCE.marksman.hasteMult);
  assert.equal(marksman.damageReduction, L10_REFERENCE.marksman.damageReduction);

  assert.deepEqual(mystic.stats, L10_REFERENCE.mystic.stats);
  assert.equal(mystic.hpMax, L10_REFERENCE.mystic.hp);
  assert.equal(roundToTenths(mystic.effectiveHp), L10_REFERENCE.mystic.effectiveHp);
  assert.equal(mystic.manaMax, L10_REFERENCE.mystic.mana);
  assert.equal(roundToTenths(mystic.manaRegen), L10_REFERENCE.mystic.regen);
  assert.equal(mystic.critChance, L10_REFERENCE.mystic.critChance);
  assert.equal(mystic.critMult, L10_REFERENCE.mystic.critMult);
  assert.equal(mystic.hasteMult, L10_REFERENCE.mystic.hasteMult);
  assert.equal(mystic.damageReduction, L10_REFERENCE.mystic.damageReduction);
});
