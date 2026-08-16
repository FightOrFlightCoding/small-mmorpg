import assert from "node:assert/strict";
import test from "node:test";
import { emptyQuestLog } from "../src/domain/quest";
import {
  QUEST_COLLECTION,
  QUEST_KEY,
  QUEST_PERMISSION_READ,
  QUEST_PERMISSION_WRITE,
  storedQuestFromValue,
  storedQuestWriteValue,
} from "../src/domain/quest_store";
import { buildQuestWrite } from "../src/nakama/quest_store";

test("quest storage writes are server-only", () => {
  const log = emptyQuestLog();
  log.quests["quest.slime_problem"] = {
    questId: "quest.slime_problem",
    status: "accepted",
    objectives: [{ type: "acquire_item", itemId: "item.slime_gel", current: 0, required: 1 }],
  };
  log.acceptByRequestId["req-accept-1"] = "accepted";
  const write = buildQuestWrite("user-alice", log);
  assert.equal(write.collection, QUEST_COLLECTION);
  assert.equal(write.key, QUEST_KEY);
  assert.equal(write.userId, "user-alice");
  assert.equal(write.permissionRead, QUEST_PERMISSION_READ);
  assert.equal(write.permissionWrite, QUEST_PERMISSION_WRITE);
  assert.equal(write.permissionWrite, 0);
  const roundTrip = storedQuestFromValue(storedQuestWriteValue(log));
  assert.equal(roundTrip.quests["quest.slime_problem"].status, "accepted");
  assert.equal(roundTrip.acceptByRequestId["req-accept-1"], "accepted");
  assert.deepEqual(roundTrip.turnInByRequestId, {});
});

test("malformed stored quests become an empty log", () => {
  const parsed = storedQuestFromValue({ quests: "nope" });
  assert.deepEqual(parsed.quests, {});
  assert.deepEqual(parsed.acceptByRequestId, {});
  assert.deepEqual(parsed.turnInByRequestId, {});
});
