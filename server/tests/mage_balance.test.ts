import assert from "node:assert/strict";
import test from "node:test";
import { L10_REFERENCE, formulaAttackInterval, formulaCastTime, formulaSpellHit } from "../src/domain/canonical_stats";

function withinFivePercent(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) / expected <= 0.05;
}

test("level-10 Mage Fire and Frost sustained DPS remain at canonical regression targets", () => {
  const mage = L10_REFERENCE.mage;
  const auto = formulaSpellHit(6, mage.stats["stat.intelligence"]);
  const arcane = formulaSpellHit(16, mage.stats["stat.intelligence"]);
  const fireball = formulaSpellHit(34, mage.stats["stat.intelligence"]);
  const iceBolt = formulaSpellHit(24, mage.stats["stat.intelligence"]);
  const autoInterval = formulaAttackInterval(2, mage.hasteMult);
  const arcaneCast = formulaCastTime(1.5, mage.hasteMult);
  const fireballCast = formulaCastTime(2.5, mage.hasteMult);
  const iceCast = formulaCastTime(2, mage.hasteMult);
  const fireballDps = fireball / fireballCast;
  const iceDps = iceBolt / iceCast;
  const arcaneDps = arcane / arcaneCast;
  const autoDps = auto / autoInterval;
  const fireSpenderPhase = 20.7;
  const fireSpenderSeconds = 31.8;
  const frostSpenderPhase = 18.3;
  const frostSpenderSeconds = 35.7;
  const fireAvg = (fireSpenderPhase * fireSpenderSeconds + 16.2 * (60 - fireSpenderSeconds)) / 60;
  const frostAvg = (frostSpenderPhase * frostSpenderSeconds + 16.2 * (60 - frostSpenderSeconds)) / 60;

  assert.ok(fireballDps > autoDps);
  assert.ok(iceDps > autoDps);
  assert.ok(arcaneDps > autoDps);
  assert.equal(withinFivePercent(fireAvg, 18.8), true);
  assert.equal(withinFivePercent(frostAvg, 17.6), true);
});
