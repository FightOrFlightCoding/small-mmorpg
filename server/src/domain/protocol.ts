export const PROTOCOL_VERSION = 1;
export const MAX_MATCH_PAYLOAD_BYTES = 2048;
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export const ClientOpcode = {
  INPUT: 1,
  INTERACT: 2,
  ATTACK: 3,
  PICKUP: 4,
  EQUIP: 5,
  QUEST_ACCEPT: 6,
  QUEST_TURN_IN: 7,
  RESYNC_REQUEST: 8,
} as const;

export const ServerOpcode = {
  FULL_STATE: 101,
  SNAPSHOT: 102,
  ACTION_RESULT: 103,
  COMBAT_EVENT: 104,
  INVENTORY_STATE: 105,
  QUEST_STATE: 106,
  INTERACTION_RESULT: 107,
  SYSTEM_MESSAGE: 108,
  EQUIPMENT_STATE: 109,
} as const;

export type ClientOpcode = (typeof ClientOpcode)[keyof typeof ClientOpcode];
export type ServerOpcode = (typeof ServerOpcode)[keyof typeof ServerOpcode];

const CLIENT_OPCODES: ClientOpcode[] = [
  ClientOpcode.INPUT,
  ClientOpcode.INTERACT,
  ClientOpcode.ATTACK,
  ClientOpcode.PICKUP,
  ClientOpcode.EQUIP,
  ClientOpcode.QUEST_ACCEPT,
  ClientOpcode.QUEST_TURN_IN,
  ClientOpcode.RESYNC_REQUEST,
];

const REWARD_OPCODES: ClientOpcode[] = [
  ClientOpcode.PICKUP,
  ClientOpcode.QUEST_ACCEPT,
  ClientOpcode.QUEST_TURN_IN,
];

const COMMON_KEYS = ["protocolVersion", "contentHash", "requestId"];

const OPCODE_KEYS: { [opcode: number]: string[] } = {};
OPCODE_KEYS[ClientOpcode.INPUT] = ["seq", "axisX", "axisY"];
OPCODE_KEYS[ClientOpcode.INTERACT] = ["targetId"];
OPCODE_KEYS[ClientOpcode.ATTACK] = ["targetId"];
OPCODE_KEYS[ClientOpcode.PICKUP] = ["lootId"];
OPCODE_KEYS[ClientOpcode.EQUIP] = ["instanceId", "slot"];
OPCODE_KEYS[ClientOpcode.QUEST_ACCEPT] = ["questId"];
OPCODE_KEYS[ClientOpcode.QUEST_TURN_IN] = ["questId"];
OPCODE_KEYS[ClientOpcode.RESYNC_REQUEST] = [];

const OUTCOME_KEYS = [
  "attack",
  "damage",
  "health",
  "maxHealth",
  "position",
  "x",
  "y",
  "dx",
  "dy",
  "speed",
  "moveSpeed",
  "dt",
  "elapsed",
  "elapsedTime",
  "deltaTime",
  "velocity",
  "currency",
  "gold",
  "items",
  "instanceId",
  "itemInstanceId",
  "questComplete",
  "stats",
  "attackBonus",
];

const INPUT_NUMBER_KEYS = ["seq", "axisX", "axisY"];

export interface ProtocolError {
  code: string;
  message: string;
}

export interface ParsedClientMessage {
  opcode: ClientOpcode;
  protocolVersion: number;
  contentHash?: string;
  requestId?: string;
  fields: { [key: string]: string };
  seq?: number;
  axisX?: number;
  axisY?: number;
}

export function isClientOpcode(opcode: number): opcode is ClientOpcode {
  return CLIENT_OPCODES.indexOf(opcode as ClientOpcode) !== -1;
}

export function isRewardOpcode(opcode: ClientOpcode): boolean {
  return REWARD_OPCODES.indexOf(opcode) !== -1;
}

function requiresRequestId(opcode: ClientOpcode): boolean {
  return (
    isRewardOpcode(opcode) ||
    opcode === ClientOpcode.INTERACT ||
    opcode === ClientOpcode.ATTACK ||
    opcode === ClientOpcode.EQUIP
  );
}

export function parseClientMessage(
  opcode: number,
  raw: string,
  expectedContentHash: string,
): ParsedClientMessage | ProtocolError {
  if (raw.length > MAX_MATCH_PAYLOAD_BYTES) {
    return { code: "payload_too_large", message: "Match payload exceeds the allowed size." };
  }
  if (!isClientOpcode(opcode)) {
    return { code: "unknown_opcode", message: "Unknown client opcode " + String(opcode) + "." };
  }

  let parsed: unknown;
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    parsed = {};
  } else {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { code: "malformed_json", message: "Match payload is not valid JSON." };
    }
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { code: "malformed_json", message: "Match payload must be a JSON object." };
  }

  const data = parsed as { [key: string]: unknown };
  const versionValue = data.protocolVersion;
  if (typeof versionValue !== "number" || versionValue !== PROTOCOL_VERSION) {
    return {
      code: "protocol_mismatch",
      message:
        "Protocol version " +
        String(versionValue) +
        " is not supported (expected " +
        String(PROTOCOL_VERSION) +
        ").",
    };
  }

  if (Object.prototype.hasOwnProperty.call(data, "contentHash")) {
    if (typeof data.contentHash !== "string" || !CONTENT_HASH_PATTERN.test(data.contentHash)) {
      return { code: "content_mismatch", message: "Match payload contentHash is invalid." };
    }
    if (data.contentHash !== expectedContentHash) {
      return { code: "content_mismatch", message: "Match payload contentHash does not match the server catalog." };
    }
  }

  const allowed = COMMON_KEYS.concat(OPCODE_KEYS[opcode]);
  for (let i = 0; i < OUTCOME_KEYS.length; i++) {
    const key = OUTCOME_KEYS[i];
    if (allowed.indexOf(key) !== -1) {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return { code: "stat_injection:" + key, message: "Clients may not send authoritative " + key + "." };
    }
  }
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (allowed.indexOf(key) === -1) {
      return { code: "unknown_field:" + key, message: "Unknown field " + key + "." };
    }
  }

  let requestId: string | undefined;
  if (requiresRequestId(opcode)) {
    if (typeof data.requestId !== "string" || !REQUEST_ID_PATTERN.test(data.requestId)) {
      return { code: "invalid_request_id", message: "This request requires a unique requestId." };
    }
    requestId = data.requestId;
  } else if (typeof data.requestId === "string") {
    if (!REQUEST_ID_PATTERN.test(data.requestId)) {
      return { code: "invalid_request_id", message: "requestId is malformed." };
    }
    requestId = data.requestId;
  }

  const required = OPCODE_KEYS[opcode];
  const fields: { [key: string]: string } = {};
  for (let i = 0; i < required.length; i++) {
    const key = required[i];
    if (INPUT_NUMBER_KEYS.indexOf(key) !== -1) {
      continue;
    }
    if (key === "instanceId" && !Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    if (typeof data[key] !== "string") {
      return { code: "invalid_id", message: "Field " + key + " must be a string id." };
    }
    fields[key] = data[key];
  }

  const message: ParsedClientMessage = {
    opcode: opcode,
    protocolVersion: PROTOCOL_VERSION,
    fields: fields,
  };
  if (typeof data.contentHash === "string") {
    message.contentHash = data.contentHash;
  }
  if (requestId !== undefined) {
    message.requestId = requestId;
  }
  if (opcode === ClientOpcode.INPUT) {
    const seq = data.seq;
    const axisX = data.axisX;
    const axisY = data.axisY;
    if (typeof seq !== "number" || !isFinite(seq) || seq !== Math.floor(seq)) {
      return { code: "invalid_input", message: "INPUT seq must be a finite integer." };
    }
    if (typeof axisX !== "number" || !isFinite(axisX) || typeof axisY !== "number" || !isFinite(axisY)) {
      return { code: "invalid_input", message: "INPUT axes must be finite numbers." };
    }
    message.seq = seq;
    message.axisX = axisX;
    message.axisY = axisY;
  }
  return message;
}

export function isProtocolError(value: ParsedClientMessage | ProtocolError): value is ProtocolError {
  return Object.prototype.hasOwnProperty.call(value, "code") && !Object.prototype.hasOwnProperty.call(value, "opcode");
}

export function systemMessage(code: string, message: string): { opcode: number; body: string } {
  return {
    opcode: ServerOpcode.SYSTEM_MESSAGE,
    body: JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      code: code,
      message: message,
    }),
  };
}

export function actionResult(
  code: string,
  ok: boolean,
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    ok: ok,
    code: code,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.ACTION_RESULT,
    body: JSON.stringify(payload),
  };
}

export function interactionResult(
  code: string,
  ok: boolean,
  requestId?: string,
  targetId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    ok: ok,
    code: code,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  if (targetId !== undefined) {
    payload.targetId = targetId;
  }
  return {
    opcode: ServerOpcode.INTERACTION_RESULT,
    body: JSON.stringify(payload),
  };
}

export function questState(
  contentHash: string,
  quests: { [key: string]: unknown }[],
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    quests: quests,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.QUEST_STATE,
    body: JSON.stringify(payload),
  };
}

export function equipmentState(
  contentHash: string,
  equipment: { [key: string]: unknown },
  derived: { [key: string]: unknown },
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    slots: equipment.slots,
    derived: derived,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.EQUIPMENT_STATE,
    body: JSON.stringify(payload),
  };
}

export function inventoryState(
  contentHash: string,
  inventory: { [key: string]: unknown },
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    capacity: inventory.capacity,
    items: inventory.items,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.INVENTORY_STATE,
    body: JSON.stringify(payload),
  };
}

export function combatEvent(
  tick: number,
  events: { [key: string]: unknown }[],
): { opcode: number; body: string } {
  return {
    opcode: ServerOpcode.COMBAT_EVENT,
    body: JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      tick: tick,
      events: events,
    }),
  };
}
