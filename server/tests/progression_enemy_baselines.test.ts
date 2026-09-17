import assert from "node:assert/strict";
import test from "node:test";
import { content } from "../src/generated/content";
import { canonicalKillXpAmount, eliteKillXp, killXp } from "../src/domain/canonical_progression";
import {
  ELITE_SCALING_ID,
  STANDARD_SCALING_ID,
  parseEnemyScalingProfile,
  profileAuthoredKillXp,
  scaledMobDamage,
  scaledMobDps,
  scaledMobHp,
  scaledMobKillXp,
} from "../src/domain/enemy_baselines";

function profile(id: string) {
  const raw = content.enemyScalingProfiles[id as keyof typeof content.enemyScalingProfiles];
  const parsed = parseEnemyScalingProfile(raw, id);
  assert.ok(parsed !== null, id);
  return parsed;
}

test("canonical enemy baselines match §13 for levels 1-10 without retuning live slime HP", () => {
  const standard = profile(STANDARD_SCALING_ID);
  const elite = profile(ELITE_SCALING_ID);
  assert.equal(standard.hpIntercept, 40);
  assert.equal(standard.hpPerLevel, 8);
  assert.equal(standard.damageIntercept, 2);
  assert.equal(standard.damagePerLevel, 0.5);
  assert.equal(standard.swingInterval, 2);
  assert.equal(elite.hpMultiplier, 3);
  assert.equal(elite.damageMultiplier, 2);
  assert.equal(elite.killXpMultiplier, 3);
  for (let level = 1; level <= 10; level++) {
    assert.equal(scaledMobHp(standard, level), 40 + 8 * level);
    assert.equal(scaledMobDamage(standard, level), 2 + 0.5 * level);
    assert.equal(scaledMobDps(standard, level), (2 + 0.5 * level) / 2);
    assert.equal(scaledMobHp(elite, level), 3 * (40 + 8 * level));
    assert.equal(scaledMobDamage(elite, level), 2 * (2 + 0.5 * level));
    assert.equal(scaledMobKillXp(standard, level), killXp(level));
    assert.equal(scaledMobKillXp(elite, level), eliteKillXp(level));
    assert.equal(profileAuthoredKillXp(standard, level), killXp(level));
    assert.equal(profileAuthoredKillXp(elite, level), eliteKillXp(level));
    assert.equal(canonicalKillXpAmount(level, []), killXp(level));
    assert.equal(canonicalKillXpAmount(level, ["elite"]), eliteKillXp(level));
  }
  assert.equal(scaledMobHp(standard, 1), 48);
  assert.equal(scaledMobHp(standard, 10), 120);
  assert.equal(content.enemies["enemy.green_slime"].maxHealth, 20);
  assert.equal(content.enemies["enemy.green_slime"].level, 1);
});
