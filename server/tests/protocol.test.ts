import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/generated/content";
import {
  ClientOpcode,
  MAX_MATCH_PAYLOAD_BYTES,
  PROTOCOL_VERSION,
  ServerOpcode,
  isProtocolError,
  parseClientMessage,
} from "../src/domain/protocol";

const HASH = contentHash;

function parse(opcode: number, body: string) {
  return parseClientMessage(opcode, body, HASH);
}

test("client and server opcodes use the allocated values", () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.equal(ClientOpcode.INPUT, 1);
  assert.equal(ClientOpcode.INTERACT, 2);
  assert.equal(ClientOpcode.ATTACK, 3);
  assert.equal(ClientOpcode.PICKUP, 4);
  assert.equal(ClientOpcode.EQUIP, 5);
  assert.equal(ClientOpcode.QUEST_ACCEPT, 6);
  assert.equal(ClientOpcode.QUEST_TURN_IN, 7);
  assert.equal(ClientOpcode.RESYNC_REQUEST, 8);
  assert.equal(ServerOpcode.FULL_STATE, 101);
  assert.equal(ServerOpcode.SNAPSHOT, 102);
  assert.equal(ServerOpcode.ACTION_RESULT, 103);
  assert.equal(ServerOpcode.COMBAT_EVENT, 104);
  assert.equal(ServerOpcode.INVENTORY_STATE, 105);
  assert.equal(ServerOpcode.QUEST_STATE, 106);
  assert.equal(ServerOpcode.INTERACTION_RESULT, 107);
  assert.equal(ServerOpcode.SYSTEM_MESSAGE, 108);
});

test("valid movement input parses direction and sequence only", () => {
  const parsed = parse(
    ClientOpcode.INPUT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, seq: 42, axisX: 1, axisY: 0 }),
  );
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.seq, 42);
    assert.equal(parsed.axisX, 1);
    assert.equal(parsed.axisY, 0);
  }
});

test("fabricated position on INPUT is rejected", () => {
  const parsed = parse(
    ClientOpcode.INPUT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, seq: 1, axisX: 1, axisY: 0, x: 999, y: 999 }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:x");
  }
});

test("valid resync request parses", () => {
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
  assert.equal(isProtocolError(parsed), false);
  if (!isProtocolError(parsed)) {
    assert.equal(parsed.opcode, ClientOpcode.RESYNC_REQUEST);
    assert.equal(parsed.protocolVersion, PROTOCOL_VERSION);
  }
});

test("malformed JSON is rejected", () => {
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, "{");
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "malformed_json");
  }
});

test("unknown opcode is rejected", () => {
  const parsed = parse(99, JSON.stringify({ protocolVersion: PROTOCOL_VERSION }));
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "unknown_opcode");
  }
});

test("unknown fields on strict intentions are rejected", () => {
  const parsed = parse(
    ClientOpcode.RESYNC_REQUEST,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, extra: true }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "unknown_field:extra");
  }
});

test("protocol version mismatch is rejected", () => {
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, JSON.stringify({ protocolVersion: 99 }));
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "protocol_mismatch");
  }
});

test("content hash mismatch is rejected", () => {
  const parsed = parse(
    ClientOpcode.RESYNC_REQUEST,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "content_mismatch");
  }
});

test("reward and interact requests require a unique requestId", () => {
  const missingPickup = parse(
    ClientOpcode.PICKUP,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, lootId: "loot.1" }),
  );
  assert.equal(isProtocolError(missingPickup), true);
  if (isProtocolError(missingPickup)) {
    assert.equal(missingPickup.code, "invalid_request_id");
  }
  const missingInteract = parse(
    ClientOpcode.INTERACT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "npc.elder" }),
  );
  assert.equal(isProtocolError(missingInteract), true);
  if (isProtocolError(missingInteract)) {
    assert.equal(missingInteract.code, "invalid_request_id");
  }
  const valid = parse(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-abc-123",
    }),
  );
  assert.equal(isProtocolError(valid), false);
});

test("stat injection keys are rejected", () => {
  const parsed = parse(
    ClientOpcode.ATTACK,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: "enemy.1", damage: 999 }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "stat_injection:damage");
  }
});

test("invalid target ids are rejected", () => {
  const parsed = parse(
    ClientOpcode.INTERACT,
    JSON.stringify({ protocolVersion: PROTOCOL_VERSION, targetId: 12, requestId: "req-interact-1" }),
  );
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "invalid_id");
  }
});

test("quest completion injection is rejected", () => {
  const completed = parse(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-complete-1",
      status: "completed",
    }),
  );
  assert.equal(isProtocolError(completed), true);
  if (isProtocolError(completed)) {
    assert.equal(completed.code, "unknown_field:status");
  }
  const flag = parse(
    ClientOpcode.QUEST_ACCEPT,
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-complete-2",
      questComplete: true,
    }),
  );
  assert.equal(isProtocolError(flag), true);
  if (isProtocolError(flag)) {
    assert.equal(flag.code, "stat_injection:questComplete");
  }
});

test("oversized payloads are rejected", () => {
  const huge = '{"protocolVersion":1,"pad":"' + "x".repeat(MAX_MATCH_PAYLOAD_BYTES) + '"}';
  const parsed = parse(ClientOpcode.RESYNC_REQUEST, huge);
  assert.equal(isProtocolError(parsed), true);
  if (isProtocolError(parsed)) {
    assert.equal(parsed.code, "payload_too_large");
  }
});
