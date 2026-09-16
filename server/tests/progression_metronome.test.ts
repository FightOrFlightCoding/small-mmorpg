import assert from "node:assert/strict";
import test from "node:test";
import { L10_REFERENCE, formulaCastTime } from "../src/domain/canonical_stats";

test("Metronome Law: level-10 Mage Arcane Bolt cost over effective cast is at or below regen", () => {
  const mage = L10_REFERENCE.mage;
  const cost = 5;
  const effectiveCast = formulaCastTime(1.5, mage.hasteMult);
  const spendRate = cost / effectiveCast;
  assert.ok(Math.abs(spendRate - 3.73) < 0.01);
  assert.ok(spendRate <= mage.regen);
  assert.equal(mage.regen, 3.8);
  assert.equal(5 / (1.5 / 1.12) <= 3.8, true);
});

test("Metronome Law: level-10 Mystic Fateweave is not mana-neutral as authored", () => {
  const mystic = L10_REFERENCE.mystic;
  const cost = 12;
  const effectiveCast = formulaCastTime(1.8, mystic.hasteMult);
  const spendRate = cost / effectiveCast;
  assert.ok(Math.abs(spendRate - 6.87) < 0.02);
  assert.equal(mystic.regen, 6.2);
  assert.ok(spendRate > mystic.regen);
  assert.equal(12 / (1.8 / 1.03) <= 6.2, false);
});
