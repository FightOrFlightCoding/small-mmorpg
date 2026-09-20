import assert from "node:assert/strict";
import test from "node:test";
import { publicWorldLocation } from "../src/domain/instance";
import { bindJoinLocation, chooseJoinCoordinates } from "../src/domain/location";

test("join uses the newer of character and location checkpoints", () => {
  const character = { x: 2016, y: 2976 };
  const older = publicWorldLocation("match-a", "char-1", "user-1", 1440, 1664, 100);
  const newer = publicWorldLocation("match-a", "char-1", "user-1", 1800, 2400, 500);
  assert.deepEqual(chooseJoinCoordinates(character, 400, older), character);
  assert.deepEqual(chooseJoinCoordinates(character, 400, newer), { x: 1800, y: 2400 });
  assert.deepEqual(chooseJoinCoordinates(character, 400, null), character);
});

test("joining a match does not make the join stamp newer than the last checkpoint", () => {
  const saved = publicWorldLocation("match-a", "char-1", "user-1", 1800, 2400, 100);
  const joinStamp = publicWorldLocation("match-a", "char-1", "user-1", 1800, 2400, 999);
  const bound = bindJoinLocation(saved, joinStamp);
  assert.equal(bound.lastCheckpointAt, 100);
  assert.equal(bound.matchId, "match-a");
  assert.deepEqual(bound.position, { x: 1800, y: 2400 });
});
