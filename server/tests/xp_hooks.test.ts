import assert from "node:assert/strict";
import test from "node:test";
import {
  applyServerXpGrant,
  killXpGrantFromEnemy,
  memoryXpSink,
  questXpGrant,
} from "../src/domain/xp_hooks";

test("XP hook test grant path is idempotent on eventId", () => {
  const memory = memoryXpSink();
  const grant = killXpGrantFromEnemy(
    { id: "enemy.green_slime:0", enemyId: "enemy.green_slime", xpReward: 10, deathCount: 1 },
    "char-alice",
  );
  const first = applyServerXpGrant(memory.sink, "user-alice", grant);
  const second = applyServerXpGrant(memory.sink, "user-alice", grant);
  assert.equal(first.applied, true);
  assert.equal(second.replay, true);
  assert.equal(second.applied, false);
  assert.equal(memory.grants.length, 1);
  assert.equal(memory.grants[0].eventId, "kill:enemy.green_slime:0:1");
  assert.equal(memory.grants[0].amount, 10);
});

test("quest XP grants reuse the same trusted hook", () => {
  const memory = memoryXpSink();
  const grant = questXpGrant("quest.slime_problem", 40, "req-quest-xp01", "char-alice");
  assert.ok(grant !== null);
  applyServerXpGrant(memory.sink, "user-alice", grant);
  applyServerXpGrant(memory.sink, "user-alice", grant);
  assert.equal(memory.grants.length, 1);
  assert.equal(memory.grants[0].reasonType, "quest");
});

test("zero enemy XP does not create a grant", () => {
  const grant = killXpGrantFromEnemy(
    { id: "enemy.green_slime:0", enemyId: "enemy.green_slime", xpReward: 0, deathCount: 1 },
    "char-alice",
  );
  assert.equal(grant, null);
  const skipped = applyServerXpGrant(memoryXpSink().sink, "user-alice", grant);
  assert.equal(skipped.code, "skipped");
});
