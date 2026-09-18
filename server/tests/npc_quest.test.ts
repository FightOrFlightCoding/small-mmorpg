import assert from "node:assert/strict";
import test from "node:test";
import { content, contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import {
  addPlayer,
  buildFullState,
  buildSnapshot,
  createStarterZoneState,
  type MatchPlayer,
  type StarterZoneState,
} from "../src/domain/match_state";
import {
  applyQuestAccept,
  emptyQuestLog,
  publicNpcQuestMarkers,
  questDefinitionsFromContent,
  questDialogueState,
} from "../src/domain/quest";
import {
  npcBindsQuest,
  npcDefinitionsFromContent,
  NPC_QUEST_MARKER_ACTIVE,
  NPC_QUEST_MARKER_AVAILABLE,
  NPC_QUEST_MARKER_READY,
} from "../src/domain/npc";
import { dialogueDefinitionsFromContent } from "../src/domain/dialogue";
import { addOrStackItem, emptyInventory, itemDefinitionsFromContent } from "../src/domain/inventory";
import { ClientOpcode, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import {
  acceptMessage,
  interactMessage,
  openNpcSession,
  turnInMessage,
} from "./npc_session";

function emptyZone(): StarterZoneState {
  return createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemiesById(),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
    {
      npcsById: npcDefinitionsFromContent(content.npcs),
      dialoguesById: dialogueDefinitionsFromContent(content.dialogues),
    },
  );
}

function enemiesById() {
  const map: { [id: string]: { id: string; maxHealth: number } } = {};
  const ids = Object.keys(content.enemies);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    map[id] = { id: id, maxHealth: content.enemies[id as keyof typeof content.enemies].maxHealth };
  }
  return map;
}

function playerAt(userId: string, name: string, x: number, y: number): MatchPlayer {
  return {
    userId: userId,
    sessionId: "session-" + userId,
    username: name.toLowerCase(),
    characterId: "char-" + userId,
    name: name,
    x: x,
    y: y,
    maxHealth: content.player.maxHealth,
    health: content.player.maxHealth,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: emptyQuestLog(),
  };
}

function elderPos() {
  return content.zones["zone.starter"].npcs[0];
}

function heraldPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_herald") as {
    npcId: string;
    x: number;
    y: number;
  };
}

function merchantPos() {
  return content.zones["zone.starter"].npcs.find((npc) => npc.npcId === "npc.test_vendor") as {
    npcId: string;
    x: number;
    y: number;
  };
}

function actionMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.ACTION_RESULT)
    .map((item) => JSON.parse(item.body) as { ok: boolean; code: string; requestId?: string });
}

function questMessages(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.QUEST_STATE)
    .map(
      (item) =>
        JSON.parse(item.body) as {
          quests: Array<{ questId: string; status: string }>;
          npcQuestMarkers?: Array<{ npcId: string; marker: string }>;
        },
    );
}

function interactionBodies(result: ReturnType<typeof applyMatchLoop>) {
  return result.outbound
    .filter((item) => item.opcode === ServerOpcode.INTERACTION_RESULT)
    .map(
      (item) =>
        JSON.parse(item.body) as {
          ok: boolean;
          code: string;
          currentNodeId?: string;
          interactionSessionId?: string;
        },
    );
}

function markerOf(markers: Array<{ npcId: string; marker: string }> | undefined, npcId: string): string {
  if (markers === undefined) {
    return "";
  }
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].npcId === npcId) {
      return markers[i].marker;
    }
  }
  return "";
}

test("herald offer_and_turn_in binds offer and turn-in", () => {
  const herald = npcDefinitionsFromContent(content.npcs)["npc.test_herald"];
  assert.equal(npcBindsQuest(herald, "quest.test.talk", "offer"), true);
  assert.equal(npcBindsQuest(herald, "quest.test.talk", "turn_in"), true);
	assert.equal(npcBindsQuest(herald, "quest.slime_problem", "offer"), false);
});

test("in_progress dialogue state is distinct from accepted and ready", () => {
  const slime = questDefinitionsFromContent(content.quests)["quest.slime_problem"];
  const log = emptyQuestLog();
  log.quests["quest.slime_problem"] = {
    questId: "quest.slime_problem",
    status: "accepted",
    objectives: [{ type: "acquire_item", itemId: "item.slime_gel", current: 0, required: 2 }],
  };
  assert.equal(questDialogueState("quest.slime_problem", log, slime), "accepted");
  log.quests["quest.slime_problem"].objectives[0].current = 1;
  assert.equal(questDialogueState("quest.slime_problem", log, slime), "in_progress");
  log.quests["quest.slime_problem"].objectives[0].current = 2;
  assert.equal(questDialogueState("quest.slime_problem", log, slime), "ready");
});

test("quest available dialogue and marker", () => {
  const elder = elderPos();
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc05-avail01");
  assert.equal(opened.result.outbound.filter((row) => row.opcode === ServerOpcode.INTERACTION_RESULT).length > 0, true);
  const interact = interactionBodies(opened.result)[0];
  assert.equal(interact.ok, true);
  assert.equal(interact.currentNodeId, "start");
  const full = JSON.parse(buildFullState(opened.state, 2, "user-alice")) as {
    npcQuestMarkers: Array<{ npcId: string; marker: string }>;
  };
  assert.equal(markerOf(full.npcQuestMarkers, "npc.elder"), NPC_QUEST_MARKER_AVAILABLE);
  assert.equal(
    questDialogueState("quest.slime_problem", emptyQuestLog(), questDefinitionsFromContent(content.quests)["quest.slime_problem"]),
    "available",
  );
});

test("prerequisite missing rejects accept and uses dialogue state", () => {
  const herald = heraldPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  const opened = openNpcSession(state, "user-alice", "npc.test_herald", 1, "req-npc05-prereq1");
  state = opened.state;
  const result = applyMatchLoop(state, 2, contentHash, [
    acceptMessage("user-alice", "quest.test.gated", opened.sessionId, opened.npcInstanceId, "req-npc05-prereq2"),
  ]);
  assert.equal(actionMessages(result)[0].ok, false);
  assert.equal(actionMessages(result)[0].code, "missing_prerequisite");
  assert.equal(
    questDialogueState(
      "quest.test.gated",
      emptyQuestLog(),
      questDefinitionsFromContent(content.quests)["quest.test.gated"],
    ),
    "prerequisite_missing",
  );
});

test("quest accept requires session, returns canonical state and accepted dialogue", () => {
  const elder = elderPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const missing = applyMatchLoop(state, 1, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", "sess-missing", "npc.elder", "req-npc05-nosess1"),
  ]);
  assert.equal(actionMessages(missing)[0].ok, false);
  assert.equal(actionMessages(missing)[0].code, "invalid_session");
  const opened = openNpcSession(state, "user-alice", "npc.elder", 2, "req-npc05-accint");
  const accepted = applyMatchLoop(opened.state, 3, contentHash, [
    acceptMessage(
      "user-alice",
      "quest.slime_problem",
      opened.sessionId,
      opened.npcInstanceId,
      "req-npc05-accept1",
    ),
  ]);
  assert.equal(actionMessages(accepted)[0].ok, true);
  assert.equal(actionMessages(accepted)[0].code, "accepted");
  assert.equal(questMessages(accepted)[0].quests[0].status, "accepted");
  const dialogue = interactionBodies(accepted).find((row) => row.currentNodeId !== undefined);
  assert.ok(dialogue);
  assert.equal(dialogue?.currentNodeId, "in_progress");
  assert.equal(markerOf(questMessages(accepted)[0].npcQuestMarkers, "npc.elder"), NPC_QUEST_MARKER_ACTIVE);
});

test("duplicate accept is idempotent", () => {
  const elder = elderPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc05-dupint");
  const first = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-dupacc"),
  ]);
  const replay = applyMatchLoop(first.state, 3, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-dupacc"),
  ]);
  assert.equal(actionMessages(replay)[0].ok, true);
  assert.equal(actionMessages(replay)[0].code, "accepted");
  assert.equal(replay.persistQuests.length, 0);
  const second = applyMatchLoop(first.state, 4, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-dupacc2"),
  ]);
  assert.equal(actionMessages(second)[0].ok, true);
  assert.equal(actionMessages(second)[0].code, "already_accepted");
  assert.equal(Object.keys(second.state.players["user-alice"].questLog.quests).length, 1);
});

test("in progress and ready markers plus dialogue", () => {
  const elder = elderPos();
  const actor = playerAt("user-alice", "Alice", elder.x, elder.y);
  actor.inventory = addOrStackItem(
    emptyInventory(),
    "item.slime_gel",
    1,
    "gel-ready",
    itemDefinitionsFromContent(content.items)["item.slime_gel"],
  );
  let state = addPlayer(emptyZone(), actor);
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc05-readyint");
  const accepted = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-readyacc"),
  ]);
  assert.equal(accepted.state.players["user-alice"].questLog.quests["quest.slime_problem"].objectives[0].current, 1);
  assert.equal(markerOf(questMessages(accepted)[0].npcQuestMarkers, "npc.elder"), NPC_QUEST_MARKER_READY);
  const dialogue = interactionBodies(accepted).find((row) => row.currentNodeId === "ready");
  assert.ok(dialogue);
  const log = accepted.state.players["user-alice"].questLog;
  const slime = questDefinitionsFromContent(content.quests)["quest.slime_problem"];
  log.quests["quest.slime_problem"].objectives[0].current = 0;
  assert.equal(questDialogueState("quest.slime_problem", log, slime), "accepted");
});

test("turn in requires session, applies rewards once, returns completion dialogue", () => {
  const elder = elderPos();
  const actor = playerAt("user-alice", "Alice", elder.x, elder.y);
  actor.inventory = addOrStackItem(
    emptyInventory(),
    "item.slime_gel",
    1,
    "gel-turn",
    itemDefinitionsFromContent(content.items)["item.slime_gel"],
  );
  let state = addPlayer(emptyZone(), actor);
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc05-tnint");
  state = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-tnacc"),
  ]).state;
  const turned = applyMatchLoop(state, 3, contentHash, [
    turnInMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-tn1"),
  ]);
  assert.equal(actionMessages(turned)[0].ok, true);
  assert.equal(turned.state.players["user-alice"].questLog.quests["quest.slime_problem"].status, "completed");
  assert.equal(turned.state.players["user-alice"].gold, 25);
  const complete = interactionBodies(turned).find((row) => row.currentNodeId === "completed");
  assert.ok(complete);
  assert.equal(markerOf(questMessages(turned)[0].npcQuestMarkers, "npc.elder"), "");
  const duplicate = applyMatchLoop(turned.state, 4, contentHash, [
    turnInMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-tn1"),
  ]);
  assert.equal(actionMessages(duplicate)[0].ok, true);
  assert.equal(duplicate.state.players["user-alice"].gold, 25);
  const second = applyMatchLoop(turned.state, 5, contentHash, [
    turnInMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-tn2"),
  ]);
  assert.equal(actionMessages(second)[0].ok, false);
  assert.equal(actionMessages(second)[0].code, "already_completed");
  assert.equal(second.state.players["user-alice"].gold, 25);
});

test("wrong NPC cannot accept or turn in", () => {
  const merchant = merchantPos();
  const state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", merchant.x, merchant.y));
  const opened = openNpcSession(state, "user-alice", "npc.test_vendor", 1, "req-npc05-wrongint");
  const accepted = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-wrongacc"),
  ]);
  assert.equal(actionMessages(accepted)[0].ok, false);
  assert.equal(actionMessages(accepted)[0].code, "invalid_service");
});

test("out of range and invalid session reject quest actions", () => {
  const spawn = content.zones["zone.starter"].playerSpawn;
  const elder = elderPos();
  const far = addPlayer(emptyZone(), playerAt("user-alice", "Alice", spawn.x, spawn.y));
  const farInteract = applyMatchLoop(far, 1, contentHash, [
    interactMessage("user-alice", "npc.elder", "req-npc05-farint"),
  ]);
  const farBody = farInteract.outbound
    .filter((row) => row.opcode === ServerOpcode.INTERACTION_RESULT)
    .map((row) => JSON.parse(row.body) as { ok: boolean; code: string })[0];
  assert.equal(farBody.ok, false);
  assert.equal(farBody.code, "out_of_range");
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const opened = openNpcSession(state, "user-alice", "npc.elder", 2, "req-npc05-rangeint");
  opened.state.players["user-alice"].x = spawn.x;
  opened.state.players["user-alice"].y = spawn.y;
  const walked = applyMatchLoop(opened.state, 3, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-rangeacc"),
  ]);
  assert.equal(actionMessages(walked)[0].ok, false);
  assert.equal(actionMessages(walked)[0].code, "out_of_range");
});

test("character-specific markers differ for two players and omit SNAPSHOT", () => {
  const elder = elderPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  state = addPlayer(state, playerAt("user-bob", "Bob", elder.x, elder.y));
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc05-twoaint");
  const accepted = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-twoaacc"),
  ]);
  const aliceFull = JSON.parse(buildFullState(accepted.state, 4, "user-alice")) as {
    npcQuestMarkers: Array<{ npcId: string; marker: string }>;
  };
  const bobFull = JSON.parse(buildFullState(accepted.state, 4, "user-bob")) as {
    npcQuestMarkers: Array<{ npcId: string; marker: string }>;
  };
  assert.equal(markerOf(aliceFull.npcQuestMarkers, "npc.elder"), NPC_QUEST_MARKER_ACTIVE);
  assert.equal(markerOf(bobFull.npcQuestMarkers, "npc.elder"), NPC_QUEST_MARKER_AVAILABLE);
  const snap = JSON.parse(buildSnapshot(accepted.state, 5, true)) as { npcQuestMarkers?: unknown; npcs?: Array<{ marker?: string }> };
  assert.equal(snap.npcQuestMarkers, undefined);
  if (snap.npcs !== undefined) {
    for (let i = 0; i < snap.npcs.length; i++) {
      assert.equal(snap.npcs[i].marker, undefined);
    }
  }
});

test("reconnect full state restores quests and markers", () => {
  const elder = elderPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", elder.x, elder.y));
  const opened = openNpcSession(state, "user-alice", "npc.elder", 1, "req-npc05-reint");
  const accepted = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.slime_problem", opened.sessionId, opened.npcInstanceId, "req-npc05-reacc"),
  ]);
  const rejoined = addPlayer(emptyZone(), accepted.state.players["user-alice"]);
  const full = JSON.parse(buildFullState(rejoined, 9, "user-alice")) as {
    quests: Array<{ questId: string; status: string }>;
    npcQuestMarkers: Array<{ npcId: string; marker: string }>;
  };
  assert.equal(full.quests[0].status, "accepted");
  assert.equal(markerOf(full.npcQuestMarkers, "npc.elder"), NPC_QUEST_MARKER_ACTIVE);
});

test("offer_and_turn_in talk quest completes through generic bindings", () => {
  const herald = heraldPos();
  let state = addPlayer(emptyZone(), playerAt("user-alice", "Alice", herald.x, herald.y));
  const opened = openNpcSession(state, "user-alice", "npc.test_herald", 1, "req-npc05-htalk1");
  state = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.test.talk", opened.sessionId, opened.npcInstanceId, "req-npc05-htalk2"),
  ]).state;
  const talked = openNpcSession(state, "user-alice", "npc.test_herald", 3, "req-npc05-htalk3");
  assert.equal(talked.state.players["user-alice"].questLog.quests["quest.test.talk"].objectives[0].current, 1);
  const done = applyMatchLoop(talked.state, 4, contentHash, [
    turnInMessage("user-alice", "quest.test.talk", talked.sessionId, talked.npcInstanceId, "req-npc05-htalk4"),
  ]);
  assert.equal(actionMessages(done)[0].ok, true);
  assert.equal(done.state.players["user-alice"].questLog.quests["quest.test.talk"].status, "completed");
});

test("domain accept still works without a match session", () => {
  const elder = elderPos();
  const outcome = applyQuestAccept({
    playerHealth: 20,
    playerX: elder.x,
    playerY: elder.y,
    questLog: emptyQuestLog(),
    questId: "quest.slime_problem",
    requestId: "req-npc05-domain1",
    npcs: [{ id: "npc.elder", npcId: "npc.elder", x: elder.x, y: elder.y }],
    interactionRange: 48,
    questsById: questDefinitionsFromContent(content.quests),
    playerLevel: 1,
    npcById: npcDefinitionsFromContent(content.npcs),
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.code, "accepted");
});

test("publicNpcQuestMarkers honor ready over available", () => {
  const log = emptyQuestLog();
  log.quests["quest.slime_problem"] = {
    questId: "quest.slime_problem",
    status: "accepted",
    objectives: [{ type: "acquire_item", itemId: "item.slime_gel", current: 1, required: 1 }],
  };
  const markers = publicNpcQuestMarkers(
    [{ id: "npc.elder", npcId: "npc.elder" }],
    npcDefinitionsFromContent(content.npcs),
    log,
    questDefinitionsFromContent(content.quests),
    1,
    "",
  );
  assert.equal(markerOf(markers, "npc.elder"), NPC_QUEST_MARKER_READY);
});

test("quest accept protocol requires session fields", () => {
  const result = parseClientMessage(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-npc05-proto1",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(result), true);
});
