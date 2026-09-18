import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/generated/content";
import { applyMatchLoop } from "../src/domain/match_loop";
import { addPlayer } from "../src/domain/match_state";
import { ClientOpcode, MAX_MATCH_PAYLOAD_BYTES, PROTOCOL_VERSION, ServerOpcode, isProtocolError, parseClientMessage } from "../src/domain/protocol";
import { validateJoinAttempt } from "../src/domain/join_validation";
import { ACTION_LIMITS } from "../src/domain/rate_limit";
import { INTERACTION_SESSION_TTL_TICKS } from "../src/domain/interaction";
import {
  acceptMessage,
  buyMessage,
  chooseMessage,
  envelope,
  interactionPayload,
  openNpcSession,
  turnInMessage,
} from "./npc_session";
import { npcPos, platformPlayer, platformZone } from "./npc_platform_fixtures";

function actionCode(result: ReturnType<typeof applyMatchLoop>): string {
  const row = result.outbound.find((item) => item.opcode === ServerOpcode.ACTION_RESULT);
  if (row === undefined) {
    return "";
  }
  return String((JSON.parse(row.body) as { code?: string }).code);
}

function systemCode(result: ReturnType<typeof applyMatchLoop>): string {
  const row = result.outbound.find((item) => item.opcode === ServerOpcode.SYSTEM_MESSAGE);
  if (row === undefined) {
    return "";
  }
  return String((JSON.parse(row.body) as { code?: string }).code);
}

test("forged NPC id is invalid_target", () => {
  const greeter = npcPos("npc.platform_greeter");
  const state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y));
  const result = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.forged", requestId: "req-npc07-forge1" }),
      userId: "user-alice",
    },
  ]);
  assert.equal(interactionPayload(result).ok, false);
  assert.equal(interactionPayload(result).code, "invalid_target");
});

test("forged and foreign session ids are invalid_session", () => {
  const greeter = npcPos("npc.platform_greeter");
  let state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y));
  state = addPlayer(state, platformPlayer("user-bob", "Bob", greeter.x, greeter.y));
  const alice = openNpcSession(state, "user-alice", "npc.platform_greeter", 1, "req-npc07-sess1");
  const forged = applyMatchLoop(alice.state, 2, contentHash, [
    chooseMessage("user-alice", "sess-forged01", "opt.understood", "req-npc07-sess2"),
  ]);
  assert.equal(interactionPayload(forged).code, "invalid_session");
  const foreign = applyMatchLoop(alice.state, 2, contentHash, [
    chooseMessage("user-bob", alice.sessionId, "opt.understood", "req-npc07-sess3"),
  ]);
  assert.equal(interactionPayload(foreign).code, "invalid_session");
});

test("expired session and wrong match reject later actions", () => {
  const guide = npcPos("npc.platform_guide");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", guide.x, guide.y)),
    "user-alice",
    "npc.platform_guide",
    1,
    "req-npc07-exp01",
  );
  const expiredTick = 1 + INTERACTION_SESSION_TTL_TICKS + 1;
  const expired = applyMatchLoop(opened.state, expiredTick, contentHash, []);
  const choose = applyMatchLoop(expired.state, expiredTick + 1, contentHash, [
    chooseMessage("user-alice", opened.sessionId, "opt.understood", "req-npc07-exp02"),
  ]);
  assert.equal(interactionPayload(choose).code, "session_expired");

  const other = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", guide.x, guide.y));
  const wrongMatch = applyMatchLoop(other, 2, contentHash, [
    chooseMessage("user-alice", opened.sessionId, "opt.understood", "req-npc07-wrong1"),
  ]);
  assert.equal(interactionPayload(wrongMatch).code, "invalid_session");
});

test("out of range, dead, link-dead, and transfer block interaction", () => {
  const greeter = npcPos("npc.platform_greeter");
  const far = applyMatchLoop(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x + 400, greeter.y)),
    1,
    contentHash,
    [
      {
        opcode: ClientOpcode.INTERACT,
        raw: envelope({ targetId: "npc.platform_greeter", requestId: "req-npc07-rng01" }),
        userId: "user-alice",
      },
    ],
  );
  assert.equal(interactionPayload(far).code, "out_of_range");

  const dead = applyMatchLoop(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y, 0, { health: 0 })),
    1,
    contentHash,
    [
      {
        opcode: ClientOpcode.INTERACT,
        raw: envelope({ targetId: "npc.platform_greeter", requestId: "req-npc07-dead1" }),
        userId: "user-alice",
      },
    ],
  );
  assert.equal(interactionPayload(dead).code, "player_dead");

  const linkDead = applyMatchLoop(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y, 0, { linkDead: true })),
    1,
    contentHash,
    [
      {
        opcode: ClientOpcode.INTERACT,
        raw: envelope({ targetId: "npc.platform_greeter", requestId: "req-npc07-ld001" }),
        userId: "user-alice",
      },
    ],
  );
  assert.equal(interactionPayload(linkDead).code, "link_dead");

  const transferring = applyMatchLoop(
    addPlayer(
      platformZone(),
      platformPlayer("user-alice", "Alice", greeter.x, greeter.y, 0, { transferState: "issued" }),
    ),
    1,
    contentHash,
    [
      {
        opcode: ClientOpcode.INTERACT,
        raw: envelope({ targetId: "npc.platform_greeter", requestId: "req-npc07-xf001" }),
        userId: "user-alice",
      },
    ],
  );
  assert.equal(interactionPayload(transferring).code, "already_transferring");
});

test("dialogue option injection and unknown service are rejected", () => {
  const guide = npcPos("npc.platform_guide");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", guide.x, guide.y)),
    "user-alice",
    "npc.platform_guide",
    1,
    "req-npc07-opt01",
  );
  const injected = applyMatchLoop(opened.state, 2, contentHash, [
    chooseMessage("user-alice", opened.sessionId, "opt.reward_me", "req-npc07-opt02"),
  ]);
  assert.equal(interactionPayload(injected).code, "invalid_option");
  assert.equal(injected.state.players["user-alice"].interactionSession?.currentNodeId, "start");

  const greeter = npcPos("npc.platform_greeter");
  const talk = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y, 20)),
    "user-alice",
    "npc.platform_greeter",
    1,
    "req-npc07-svc01",
  );
  const buy = applyMatchLoop(talk.state, 2, contentHash, [
    buyMessage("user-alice", "item.test_potion", talk.sessionId, talk.npcInstanceId, "req-npc07-svc02"),
  ]);
  assert.equal(actionCode(buy), "invalid_service");
});

test("quest-state injection and reward replay are rejected", () => {
  const questNpc = npcPos("npc.platform_quest");
  const state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", questNpc.x, questNpc.y));
  const injected = applyMatchLoop(state, 1, contentHash, [
    {
      opcode: ClientOpcode.QUEST_ACCEPT,
      raw: envelope({
        questId: "quest.platform_talk",
        interactionSessionId: "sess-inject",
        npcInstanceId: "npc.platform_quest",
        requestId: "req-npc07-qinj1",
        status: "completed",
      }),
      userId: "user-alice",
    },
  ]);
  assert.ok(systemCode(injected).indexOf("unknown_field") === 0);
  assert.equal(injected.state.players["user-alice"].questLog.quests["quest.platform_talk"], undefined);

  const opened = openNpcSession(state, "user-alice", "npc.platform_quest", 1, "req-npc07-qacc0");
  const accept = applyMatchLoop(opened.state, 2, contentHash, [
    acceptMessage("user-alice", "quest.platform_talk", opened.sessionId, opened.npcInstanceId, "req-npc07-qacc1"),
  ]);
  const talked = openNpcSession(accept.state, "user-alice", "npc.platform_quest", 3, "req-npc07-qtalk");
  const first = applyMatchLoop(talked.state, 4, contentHash, [
    turnInMessage("user-alice", "quest.platform_talk", talked.sessionId, talked.npcInstanceId, "req-npc07-qturn"),
  ]);
  assert.equal(first.state.players["user-alice"].questLog.quests["quest.platform_talk"].status, "completed");
  const gold = first.state.players["user-alice"].gold;
  const replay = applyMatchLoop(first.state, 5, contentHash, [
    turnInMessage("user-alice", "quest.platform_talk", talked.sessionId, talked.npcInstanceId, "req-npc07-qturn"),
  ]);
  assert.equal(replay.state.players["user-alice"].gold, gold);
});

test("merchant price spoof, item injection, and quantity abuse are rejected", () => {
  const merchant = npcPos("npc.platform_merchant");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", merchant.x, merchant.y, 20)),
    "user-alice",
    "npc.platform_merchant",
    1,
    "req-npc07-mopen",
  );
  const price = parseClientMessage(
    ClientOpcode.VENDOR_BUY,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      interactionSessionId: opened.sessionId,
      npcInstanceId: opened.npcInstanceId,
      itemId: "item.test_potion",
      price: 1,
      requestId: "req-npc07-price1",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(price), true);
  if (isProtocolError(price)) {
    assert.equal(price.code, "unknown_field:price");
  }

  const injected = applyMatchLoop(opened.state, 2, contentHash, [
    buyMessage("user-alice", "item.training_sword", opened.sessionId, opened.npcInstanceId, "req-npc07-item1"),
  ]);
  assert.equal(actionCode(injected), "invalid_id");

  const zero = applyMatchLoop(opened.state, 3, contentHash, [
    buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc07-qty00", 0),
  ]);
  assert.equal(actionCode(zero), "invalid_amount");
  const negative = applyMatchLoop(opened.state, 4, contentHash, [
    buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc07-qtyneg", -2),
  ]);
  assert.equal(actionCode(negative), "invalid_amount");
  const huge = applyMatchLoop(opened.state, 5, contentHash, [
    buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc07-qty99", 100),
  ]);
  assert.equal(actionCode(huge), "invalid_amount");
  assert.equal(zero.state.players["user-alice"].gold, 20);
  assert.equal(negative.state.players["user-alice"].gold, 20);
  assert.equal(huge.state.players["user-alice"].gold, 20);
});

test("duplicate vendor transaction does not grant twice", () => {
  const merchant = npcPos("npc.platform_merchant");
  const opened = openNpcSession(
    addPlayer(platformZone(), platformPlayer("user-alice", "Alice", merchant.x, merchant.y, 20)),
    "user-alice",
    "npc.platform_merchant",
    1,
    "req-npc07-dup01",
  );
  const first = applyMatchLoop(opened.state, 2, contentHash, [
    buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc07-dup02"),
  ]);
  const second = applyMatchLoop(first.state, 3, contentHash, [
    buyMessage("user-alice", "item.test_potion", opened.sessionId, opened.npcInstanceId, "req-npc07-dup02"),
  ]);
  assert.equal(second.state.players["user-alice"].gold, 10);
});

test("interaction spam, oversized payload, and unknown fields are rejected", () => {
  const greeter = npcPos("npc.platform_greeter");
  const state = addPlayer(platformZone(), platformPlayer("user-alice", "Alice", greeter.x, greeter.y));
  const flood: { opcode: number; raw: string; userId: string }[] = [];
  for (let i = 0; i < ACTION_LIMITS.interact + 1; i++) {
    flood.push({
      opcode: ClientOpcode.INTERACT,
      raw: envelope({ targetId: "npc.platform_greeter", requestId: "req-npc07-rl" + String(i).padStart(2, "0") }),
      userId: "user-alice",
    });
  }
  const limited = applyMatchLoop(state, 1, contentHash, flood);
  assert.ok(limited.rejections.some((row) => row.action === "interact" && row.code === "rate_limited"));

  const huge = '{"protocolVersion":1,"targetId":"npc.platform_greeter","requestId":"req-npc07-big01","pad":"' +
    "x".repeat(MAX_MATCH_PAYLOAD_BYTES) +
    '"}';
  const oversized = parseClientMessage(ClientOpcode.INTERACT, huge, contentHash);
  assert.equal(isProtocolError(oversized), true);
  if (isProtocolError(oversized)) {
    assert.equal(oversized.code, "payload_too_large");
  }

  const unknown = parseClientMessage(
    ClientOpcode.INTERACT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      targetId: "npc.platform_greeter",
      requestId: "req-npc07-unk01",
      service: "gm",
    }),
    contentHash,
  );
  assert.equal(isProtocolError(unknown), true);
});

test("join protocol and content mismatches stay rejected", () => {
  const state = platformZone();
  const proto = validateJoinAttempt(
    state,
    contentHash,
    { protocolVersion: "2", contentHash: contentHash, clientVersion: "1.0.0", selectionTicket: "ticket-1" },
    false,
  );
  assert.equal(proto.accept, false);
  assert.equal(proto.rejectMessage, "protocol_mismatch");
  const mismatch = validateJoinAttempt(
    state,
    contentHash,
    {
      protocolVersion: "1",
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      clientVersion: "1.0.0",
      selectionTicket: "ticket-1",
    },
    false,
  );
  assert.equal(mismatch.accept, false);
  assert.equal(mismatch.rejectMessage, "content_mismatch");
});
