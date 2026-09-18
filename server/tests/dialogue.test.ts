import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedOptionIds,
  dialogueContextFor,
  nextDialogueNodeId,
  resolveDialogueNodeId,
  type DialogueDefinition,
} from "../src/domain/dialogue";
import { emptyQuestLog } from "../src/domain/quest";

function graph(): DialogueDefinition {
  return {
    id: "dialogue.test.choice",
    startNodeId: "start",
    entry: [
      { nodeId: "done", conditions: [{ type: "offered_quest_status", status: "completed" }] },
      { nodeId: "start" },
    ],
    nodes: {
      start: {
        id: "start",
        lines: [{ text: "Hello." }, { text: "Need anything?" }],
        options: [
          { id: "opt.yes", text: "Yes.", nextNodeId: "yes" },
          { id: "opt.no", text: "No.", nextNodeId: "no" },
        ],
      },
      yes: { id: "yes", lines: [{ text: "Then we talk." }] },
      no: { id: "no", lines: [{ text: "Suit yourself." }] },
      done: { id: "done", lines: [{ text: "Already finished." }] },
    },
  };
}

test("dialogue start uses the first matching entry node", () => {
  const log = emptyQuestLog();
  const start = resolveDialogueNodeId(graph(), dialogueContextFor(1, "", log, ["quest.missing"], undefined));
  assert.equal(start, "start");
  log.quests["quest.missing"] = {
    questId: "quest.missing",
    status: "completed",
    objectives: [{ type: "talk_to_npc", current: 1, required: 1 }],
  };
  const done = resolveDialogueNodeId(graph(), dialogueContextFor(1, "", log, ["quest.missing"], undefined));
  assert.equal(done, "done");
});

test("valid dialogue choice advances to the next node", () => {
  const context = dialogueContextFor(1, "", emptyQuestLog(), [], undefined);
  const allowed = allowedOptionIds(graph().nodes.start, context);
  assert.deepEqual(allowed, ["opt.yes", "opt.no"]);
  const next = nextDialogueNodeId(graph(), "start", "opt.yes", context);
  assert.equal(next.ok, true);
  assert.equal(next.nodeId, "yes");
});

test("invalid dialogue choice is rejected", () => {
  const context = dialogueContextFor(1, "", emptyQuestLog(), [], undefined);
  const next = nextDialogueNodeId(graph(), "start", "opt.missing", context);
  assert.equal(next.ok, false);
  assert.equal(next.code, "invalid_option");
  assert.equal(next.nodeId, "start");
});
