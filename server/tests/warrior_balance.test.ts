import assert from "node:assert/strict";
import test from "node:test";
import { L10_REFERENCE, formulaAttackInterval, formulaMeleeHit } from "../src/domain/canonical_stats";

function withinFivePercent(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) / expected <= 0.05;
}

test("level-10 Warrior auto-growth DPS and effective health remain at canonical regression targets", () => {
  const warrior = L10_REFERENCE.warrior;
  const auto = formulaMeleeHit(12, warrior.stats["stat.strength"]);
  const heavy = formulaMeleeHit(28, warrior.stats["stat.strength"]);
  const autoInterval = formulaAttackInterval(2, warrior.hasteMult);
  const bulwarkDps = auto / autoInterval + heavy / 6;
  const berserkerDps = auto * 1.15 / autoInterval + heavy / 6;

  assert.equal(withinFivePercent(bulwarkDps, 14.8), true);
  assert.equal(withinFivePercent(berserkerDps, 16.1), true);
  assert.equal(warrior.effectiveHp, 308.5);
});
