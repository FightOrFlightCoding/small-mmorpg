import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_TOTAL_XP_TO_10,
  CANONICAL_XP_TO_NEXT,
  canonicalKillXpAmount,
  eliteKillXp,
  killXp,
  roundToTens,
  xpToNext,
} from "../src/domain/canonical_progression";
import { CAP_OVERFLOW_POLICY } from "../src/domain/canonical_leveling";
import { catalogFromContent, levelCurveFor } from "../src/domain/stats";
import { content } from "../src/generated/content";

const catalog = catalogFromContent(content);

test("round_to_tens uses deterministic nearest-ten rounding", () => {
  assert.equal(roundToTens(100), 100);
  assert.equal(roundToTens(519.615), 520);
  assert.equal(roundToTens(1124.685), 1120);
  assert.equal(roundToTens(1469.693), 1470);
});

test("every canonical XP transition matches round_to_tens(100 * level^1.5)", () => {
  for (let level = 1; level <= 9; level++) {
    assert.equal(xpToNext(level), CANONICAL_XP_TO_NEXT[level - 1]);
    assert.equal(xpToNext(level), roundToTens(100 * Math.pow(level, 1.5)));
  }
  assert.equal(xpToNext(10), 0);
  assert.equal(xpToNext(0), 0);
});

test("total XP to level 10 is 11100", () => {
  let total = 0;
  for (let i = 0; i < CANONICAL_XP_TO_NEXT.length; i++) {
    total += CANONICAL_XP_TO_NEXT[i];
  }
  assert.equal(total, 11100);
  assert.equal(CANONICAL_TOTAL_XP_TO_10, 11100);
});

test("production classes overlay the L10 curve while test classes keep Foundation cap 5", () => {
  const warrior = levelCurveFor(catalog, "class.warrior");
  const vanguard = levelCurveFor(catalog, "test.class.vanguard");
  assert.notEqual(warrior, null);
  assert.notEqual(vanguard, null);
  if (warrior === null || vanguard === null) {
    return;
  }
  assert.equal(warrior.id, "curve.vibecode.l10");
  assert.equal(warrior.maxLevel, 10);
  assert.equal(vanguard.id, "test.curve.standard");
  assert.equal(vanguard.maxLevel, 5);
  assert.equal(content.levelCurves["test.curve.standard"].maxLevel, 5);
});

test("KillXP is 8 + 2 * enemy_level and elite is three times that", () => {
  assert.equal(killXp(1), 10);
  assert.equal(killXp(5), 18);
  assert.equal(eliteKillXp(1), 30);
  assert.equal(eliteKillXp(5), 54);
  assert.equal(canonicalKillXpAmount(1, ["slime"]), 10);
  assert.equal(canonicalKillXpAmount(1, ["elite"]), 30);
  assert.equal(content.enemies["enemy.green_slime"].xpReward, killXp(1));
});

test("capped XP overflow policy is lifetime_only", () => {
  assert.equal(CAP_OVERFLOW_POLICY, "lifetime_only");
});
