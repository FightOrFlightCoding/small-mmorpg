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
