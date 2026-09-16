import assert from "node:assert/strict";
import test from "node:test";
import { productionRandom, scriptedRandom, seededRandom } from "../src/domain/combat_rng";

test("seeded random is deterministic", () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  const first = [a.next(), a.next(), a.next()];
  const second = [b.next(), b.next(), b.next()];
  assert.deepEqual(first, second);
  for (let i = 0; i < first.length; i++) {
    assert.ok(first[i] >= 0 && first[i] < 1);
  }
});

test("scripted random returns injected values and does not invent crits", () => {
  const random = scriptedRandom([0.99, 0.01]);
  assert.equal(random.next(), 0.99);
  assert.equal(random.next(), 0.01);
  assert.equal(random.next(), 0.01);
});

test("production random stays in unit interval", () => {
  const random = productionRandom();
  for (let i = 0; i < 8; i++) {
    const value = random.next();
    assert.ok(value >= 0 && value < 1);
  }
});
