import { ClientOpcode, MAX_MATCH_PAYLOAD_BYTES, PROTOCOL_VERSION } from "../../src/domain/protocol";

export interface MalformedFixture {
  name: string;
  opcode: number;
  raw: string;
  codePrefix: string;
}

function envelope(extra: { [key: string]: unknown }): string {
  return JSON.stringify(extra);
}

export const MALFORMED_MESSAGE_FIXTURES: MalformedFixture[] = [
  {
    name: "malformed JSON",
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: "{",
    codePrefix: "malformed_json",
  },
  {
    name: "JSON array",
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: "[]",
    codePrefix: "malformed_json",
  },
  {
    name: "missing protocol version",
    opcode: ClientOpcode.INPUT,
    raw: envelope({ seq: 1, axisX: 1, axisY: 0 }),
    codePrefix: "protocol_mismatch",
  },
  {
    name: "unknown field on strict payload",
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: envelope({ protocolVersion: PROTOCOL_VERSION, extra: true }),
    codePrefix: "unknown_field:extra",
  },
  {
    name: "unknown opcode",
    opcode: 99,
    raw: envelope({ protocolVersion: PROTOCOL_VERSION }),
    codePrefix: "unknown_opcode",
  },
  {
    name: "wrong protocol version",
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: envelope({ protocolVersion: 99 }),
    codePrefix: "protocol_mismatch",
  },
  {
    name: "wrong content hash",
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: envelope({
      protocolVersion: PROTOCOL_VERSION,
      contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
    codePrefix: "content_mismatch",
  },
  {
    name: "NaN axis",
    opcode: ClientOpcode.INPUT,
    raw: '{"protocolVersion":1,"seq":1,"axisX":null,"axisY":0}',
    codePrefix: "invalid_input",
  },
  {
    name: "infinite axis",
    opcode: ClientOpcode.INPUT,
    raw: '{"protocolVersion":1,"seq":1,"axisX":1e999,"axisY":0}',
    codePrefix: "invalid_input",
  },
  {
    name: "oversized payload",
    opcode: ClientOpcode.RESYNC_REQUEST,
    raw: '{"protocolVersion":1,"pad":"' + "x".repeat(MAX_MATCH_PAYLOAD_BYTES) + '"}',
    codePrefix: "payload_too_large",
  },
  {
    name: "fabricated position",
    opcode: ClientOpcode.INPUT,
    raw: envelope({ protocolVersion: PROTOCOL_VERSION, seq: 1, axisX: 1, axisY: 0, x: 999, y: 999 }),
    codePrefix: "stat_injection:x",
  },
  {
    name: "client-supplied damage",
    opcode: ClientOpcode.ATTACK,
    raw: envelope({
      protocolVersion: PROTOCOL_VERSION,
      targetId: "enemy.green_slime:0",
      requestId: "req-atk-dmg1",
      damage: 999,
    }),
    codePrefix: "stat_injection:damage",
  },
  {
    name: "item instance injection",
    opcode: ClientOpcode.PICKUP,
    raw: envelope({
      protocolVersion: PROTOCOL_VERSION,
      lootId: "loot.1",
      requestId: "req-pickup-id1",
      instanceId: "client-forged",
    }),
    codePrefix: "stat_injection:instanceId",
  },
  {
    name: "client-supplied quest progress",
    opcode: ClientOpcode.QUEST_ACCEPT,
    raw: envelope({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      requestId: "req-quest-status1",
      status: "completed",
    }),
    codePrefix: "unknown_field:status",
  },
  {
    name: "quest skip flag",
    opcode: ClientOpcode.QUEST_TURN_IN,
    raw: envelope({
      protocolVersion: PROTOCOL_VERSION,
      questId: "quest.slime_problem",
      npcId: "npc.elder",
      requestId: "req-quest-complete1",
      questComplete: true,
    }),
    codePrefix: "stat_injection:questComplete",
  },
  {
    name: "missing requestId",
    opcode: ClientOpcode.PICKUP,
    raw: envelope({ protocolVersion: PROTOCOL_VERSION, lootId: "loot.1" }),
    codePrefix: "invalid_request_id",
  },
  {
    name: "missing target id",
    opcode: ClientOpcode.INTERACT,
    raw: envelope({ protocolVersion: PROTOCOL_VERSION, requestId: "req-interact-miss" }),
    codePrefix: "invalid_id",
  },
  {
    name: "grant-style unknown opcode",
    opcode: 50,
    raw: envelope({ protocolVersion: PROTOCOL_VERSION, items: [{ itemId: "item.iron_sword" }] }),
    codePrefix: "unknown_opcode",
  },
];
