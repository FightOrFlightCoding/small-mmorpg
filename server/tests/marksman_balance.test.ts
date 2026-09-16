import assert from "node:assert/strict";
import test from "node:test";
import { L10_REFERENCE, formulaAttackInterval, formulaCastTime, formulaRangedHit } from "../src/domain/canonical_stats";

function withinFivePercent(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) / expected <= 0.05;
}

test("level-10 Marksman Sniper and Skirmisher sustained DPS remain at canonical regression targets", () => {
  const marksman = L10_REFERENCE.marksman;
  const auto = formulaRangedHit(10, marksman.stats["stat.agility"]);
  const aimed = formulaRangedHit(22, marksman.stats["stat.agility"]);
  const snipe = formulaRangedHit(45, marksman.stats["stat.agility"]);
  const barrage = formulaRangedHit(6, marksman.stats["stat.agility"]);
  const autoInterval = formulaAttackInterval(1.8, marksman.hasteMult);
  const snipeChannel = formulaCastTime(1.5, marksman.hasteMult);
  const sniperDps = (auto / autoInterval) * (1 - snipeChannel / 10) + aimed / 6 + snipe / 10;
  const skirmisherDps = auto / autoInterval + aimed / 6 + (3 * barrage) / 5;

  assert.equal(withinFivePercent(sniperDps, 19.0), true);
  assert.equal(withinFivePercent(skirmisherDps, 18.9), true);
});
