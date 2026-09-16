import assert from "node:assert/strict";
import test from "node:test";
import { L10_REFERENCE, formulaCastTime, formulaHeal, formulaSpellHit } from "../src/domain/canonical_stats";

function withinFivePercent(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) / expected <= 0.05;
}

test("level-10 Mystic Charms and Curses sustained DPS/HPS remain at canonical regression targets", () => {
  const mystic = L10_REFERENCE.mystic;
  const intel = mystic.stats["stat.intelligence"];
  const spirit = mystic.stats["stat.spirit"];
  const harm = formulaSpellHit(20, intel);
  const mend = formulaHeal(22, spirit);
  const wither = formulaSpellHit(36, intel);
  const charmAbsorb = formulaHeal(40, spirit);
  const fateweaveCast = formulaCastTime(1.8, mystic.hasteMult);
  const witherCast = formulaCastTime(1.5, mystic.hasteMult);
  const charmsSoloDps = harm / fateweaveCast;
  const mendHps = mend / fateweaveCast;
  const charmAmortized = charmAbsorb / 8;
  const partyHps = mendHps + charmAmortized;
  const cycle = 8;
  const fillers = (cycle - witherCast) / fateweaveCast;
  const cursesDps = wither / cycle + (fillers * harm) / cycle;

  assert.equal(withinFivePercent(charmsSoloDps, 14.3), true);
  assert.equal(withinFivePercent(partyHps, 22.2), true);
  assert.equal(withinFivePercent(cursesDps, 17.3), true);
});
