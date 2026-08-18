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
  ALLOCATE_ATTRIBUTES: 9,
  DESTROY_ITEM: 10,
  SPLIT_STACK: 11,
  MOVE_ITEM: 12,
  USE_ABILITY: 13,
  CANCEL_CAST: 14,
  ASSIGN_HOTBAR: 15,
  UNLOCK_ABILITY: 16,
  SET_TARGET: 17,
  RELEASE_RESPAWN: 18,
  VENDOR_BUY: 19,
  VENDOR_SELL: 20,
  INN_REST: 21,
  CAVE_ENTER: 22,
  CAVE_EXIT: 23,
  TRADE_INVITE: 24,
  TRADE_ACCEPT_INVITE: 25,
  TRADE_DECLINE_INVITE: 26,
  TRADE_SET_OFFER: 27,
  TRADE_REMOVE_OFFER: 28,
  TRADE_SET_GOLD: 29,
  TRADE_ACCEPT_REVISION: 30,
  TRADE_CANCEL: 31,
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
  WALLET_STATE: 110,
  PROGRESSION_STATE: 111,
  ABILITY_STATE: 112,
  PARTY_STATE: 113,
  PARTY_EVENT: 114,
  TRADE_STATE: 115,
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
  ClientOpcode.ALLOCATE_ATTRIBUTES,
  ClientOpcode.DESTROY_ITEM,
  ClientOpcode.SPLIT_STACK,
  ClientOpcode.MOVE_ITEM,
  ClientOpcode.USE_ABILITY,
  ClientOpcode.CANCEL_CAST,
  ClientOpcode.ASSIGN_HOTBAR,
  ClientOpcode.UNLOCK_ABILITY,
  ClientOpcode.SET_TARGET,
  ClientOpcode.RELEASE_RESPAWN,
  ClientOpcode.VENDOR_BUY,
  ClientOpcode.VENDOR_SELL,
  ClientOpcode.INN_REST,
  ClientOpcode.CAVE_ENTER,
  ClientOpcode.CAVE_EXIT,
  ClientOpcode.TRADE_INVITE,
  ClientOpcode.TRADE_ACCEPT_INVITE,
  ClientOpcode.TRADE_DECLINE_INVITE,
  ClientOpcode.TRADE_SET_OFFER,
  ClientOpcode.TRADE_REMOVE_OFFER,
  ClientOpcode.TRADE_SET_GOLD,
  ClientOpcode.TRADE_ACCEPT_REVISION,
  ClientOpcode.TRADE_CANCEL,
];

const REWARD_OPCODES: ClientOpcode[] = [
  ClientOpcode.PICKUP,
  ClientOpcode.QUEST_ACCEPT,
  ClientOpcode.QUEST_TURN_IN,
  ClientOpcode.VENDOR_BUY,
  ClientOpcode.VENDOR_SELL,
  ClientOpcode.INN_REST,
];

const COMMON_KEYS = ["protocolVersion", "contentHash", "requestId"];

const OPCODE_KEYS: { [opcode: number]: string[] } = {};
OPCODE_KEYS[ClientOpcode.INPUT] = ["seq", "axisX", "axisY"];
OPCODE_KEYS[ClientOpcode.INTERACT] = ["targetId"];
OPCODE_KEYS[ClientOpcode.ATTACK] = ["targetId"];
OPCODE_KEYS[ClientOpcode.PICKUP] = ["lootId"];
OPCODE_KEYS[ClientOpcode.EQUIP] = ["instanceId", "slot"];
OPCODE_KEYS[ClientOpcode.QUEST_ACCEPT] = ["questId"];
OPCODE_KEYS[ClientOpcode.QUEST_TURN_IN] = ["questId", "npcId"];
OPCODE_KEYS[ClientOpcode.RESYNC_REQUEST] = [];
OPCODE_KEYS[ClientOpcode.ALLOCATE_ATTRIBUTES] = ["attributeId", "amount"];
OPCODE_KEYS[ClientOpcode.DESTROY_ITEM] = ["instanceId", "quantity"];
OPCODE_KEYS[ClientOpcode.SPLIT_STACK] = ["instanceId", "quantity"];
OPCODE_KEYS[ClientOpcode.MOVE_ITEM] = ["instanceId", "toSlotIndex"];
OPCODE_KEYS[ClientOpcode.USE_ABILITY] = ["abilityId", "targetId", "targetX", "targetY"];
OPCODE_KEYS[ClientOpcode.CANCEL_CAST] = [];
OPCODE_KEYS[ClientOpcode.ASSIGN_HOTBAR] = ["slotIndex", "abilityId"];
OPCODE_KEYS[ClientOpcode.UNLOCK_ABILITY] = ["abilityId"];
OPCODE_KEYS[ClientOpcode.SET_TARGET] = ["targetId", "intent"];
OPCODE_KEYS[ClientOpcode.RELEASE_RESPAWN] = [];
OPCODE_KEYS[ClientOpcode.VENDOR_BUY] = ["npcId", "itemId", "quantity"];
OPCODE_KEYS[ClientOpcode.VENDOR_SELL] = ["npcId", "instanceId", "quantity"];
OPCODE_KEYS[ClientOpcode.INN_REST] = ["npcId", "mode"];
OPCODE_KEYS[ClientOpcode.CAVE_ENTER] = ["npcId"];
OPCODE_KEYS[ClientOpcode.CAVE_EXIT] = ["npcId"];
OPCODE_KEYS[ClientOpcode.TRADE_INVITE] = ["targetId"];
OPCODE_KEYS[ClientOpcode.TRADE_ACCEPT_INVITE] = ["tradeId"];
OPCODE_KEYS[ClientOpcode.TRADE_DECLINE_INVITE] = ["tradeId"];
OPCODE_KEYS[ClientOpcode.TRADE_SET_OFFER] = ["tradeId", "instanceId", "quantity"];
OPCODE_KEYS[ClientOpcode.TRADE_REMOVE_OFFER] = ["tradeId", "instanceId"];
OPCODE_KEYS[ClientOpcode.TRADE_SET_GOLD] = ["tradeId", "amount"];
OPCODE_KEYS[ClientOpcode.TRADE_ACCEPT_REVISION] = ["tradeId", "revision"];
OPCODE_KEYS[ClientOpcode.TRADE_CANCEL] = ["tradeId"];

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
  "xp",
  "currentXp",
  "lifetimeXp",
  "level",
  "unspentAttributePoints",
  "unspentSkillPoints",
  "allocatedAttributes",
  "resultingGold",
  "resultingBalance",
  "healing",
  "heal",
  "range",
  "cooldown",
  "castTime",
  "channelTime",
  "resourceCost",
  "duration",
  "effectDuration",
  "magnitude",
  "stacks",
  "members",
  "memberIds",
  "partyMembers",
  "creditUserIds",
  "lootRecipients",
  "xpRecipients",
];

const INPUT_NUMBER_KEYS = ["seq", "axisX", "axisY"];
const ALLOCATE_NUMBER_KEYS = ["amount"];
const INVENTORY_NUMBER_KEYS = ["quantity", "toSlotIndex"];
const ABILITY_NUMBER_KEYS = ["targetX", "targetY", "slotIndex"];
const TRADE_NUMBER_KEYS = ["revision"];

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
  amount?: number;
  quantity?: number;
  toSlotIndex?: number;
  targetX?: number;
  targetY?: number;
  slotIndex?: number;
  revision?: number;
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
    opcode === ClientOpcode.EQUIP ||
    opcode === ClientOpcode.ALLOCATE_ATTRIBUTES ||
    opcode === ClientOpcode.DESTROY_ITEM ||
    opcode === ClientOpcode.SPLIT_STACK ||
    opcode === ClientOpcode.MOVE_ITEM ||
    opcode === ClientOpcode.USE_ABILITY ||
    opcode === ClientOpcode.CANCEL_CAST ||
    opcode === ClientOpcode.ASSIGN_HOTBAR ||
    opcode === ClientOpcode.UNLOCK_ABILITY ||
    opcode === ClientOpcode.SET_TARGET ||
    opcode === ClientOpcode.RELEASE_RESPAWN ||
    opcode === ClientOpcode.CAVE_ENTER ||
    opcode === ClientOpcode.CAVE_EXIT ||
    opcode === ClientOpcode.TRADE_INVITE ||
    opcode === ClientOpcode.TRADE_ACCEPT_INVITE ||
    opcode === ClientOpcode.TRADE_DECLINE_INVITE ||
    opcode === ClientOpcode.TRADE_SET_OFFER ||
    opcode === ClientOpcode.TRADE_REMOVE_OFFER ||
    opcode === ClientOpcode.TRADE_SET_GOLD ||
    opcode === ClientOpcode.TRADE_ACCEPT_REVISION ||
    opcode === ClientOpcode.TRADE_CANCEL
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
    if (ALLOCATE_NUMBER_KEYS.indexOf(key) !== -1) {
      continue;
    }
    if (INVENTORY_NUMBER_KEYS.indexOf(key) !== -1) {
      continue;
    }
    if (ABILITY_NUMBER_KEYS.indexOf(key) !== -1) {
      continue;
    }
    if (TRADE_NUMBER_KEYS.indexOf(key) !== -1) {
      continue;
    }
    if (key === "instanceId" && !Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    if (key === "targetId" && opcode === ClientOpcode.USE_ABILITY && !Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    if (key === "targetId" && opcode === ClientOpcode.SET_TARGET && !Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    if (key === "intent" && opcode === ClientOpcode.SET_TARGET && !Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    if (key === "abilityId" && opcode === ClientOpcode.ASSIGN_HOTBAR && !Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    if (key === "mode" && opcode === ClientOpcode.INN_REST && !Object.prototype.hasOwnProperty.call(data, key)) {
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
  if (opcode === ClientOpcode.ALLOCATE_ATTRIBUTES || opcode === ClientOpcode.TRADE_SET_GOLD) {
    const amount = data.amount;
    if (typeof amount !== "number" || !isFinite(amount) || amount !== Math.floor(amount)) {
      return { code: "invalid_amount", message: "Amount must be a finite integer." };
    }
    message.amount = amount;
  }
  if (
    opcode === ClientOpcode.TRADE_SET_OFFER &&
    Object.prototype.hasOwnProperty.call(data, "quantity")
  ) {
    const quantity = data.quantity;
    if (typeof quantity !== "number" || !isFinite(quantity) || quantity !== Math.floor(quantity)) {
      return { code: "invalid_amount", message: "TRADE quantity must be a finite integer." };
    }
    message.quantity = quantity;
  }
  if (opcode === ClientOpcode.TRADE_ACCEPT_REVISION) {
    const revision = data.revision;
    if (typeof revision !== "number" || !isFinite(revision) || revision !== Math.floor(revision)) {
      return { code: "invalid_amount", message: "TRADE revision must be a finite integer." };
    }
    message.revision = revision;
  }
  if (opcode === ClientOpcode.DESTROY_ITEM && Object.prototype.hasOwnProperty.call(data, "quantity")) {
    const quantity = data.quantity;
    if (typeof quantity !== "number" || !isFinite(quantity) || quantity !== Math.floor(quantity)) {
      return { code: "invalid_amount", message: "DESTROY quantity must be a finite integer." };
    }
    message.quantity = quantity;
  }
  if (
    (opcode === ClientOpcode.VENDOR_BUY || opcode === ClientOpcode.VENDOR_SELL) &&
    Object.prototype.hasOwnProperty.call(data, "quantity")
  ) {
    const quantity = data.quantity;
    if (typeof quantity !== "number" || !isFinite(quantity) || quantity !== Math.floor(quantity)) {
      return { code: "invalid_amount", message: "Vendor quantity must be a finite integer." };
    }
    message.quantity = quantity;
  }
  if (opcode === ClientOpcode.SPLIT_STACK) {
    const quantity = data.quantity;
    if (typeof quantity !== "number" || !isFinite(quantity) || quantity !== Math.floor(quantity)) {
      return { code: "invalid_amount", message: "SPLIT quantity must be a finite integer." };
    }
    message.quantity = quantity;
  }
  if (opcode === ClientOpcode.MOVE_ITEM) {
    const toSlotIndex = data.toSlotIndex;
    if (typeof toSlotIndex !== "number" || !isFinite(toSlotIndex) || toSlotIndex !== Math.floor(toSlotIndex)) {
      return { code: "invalid_slot", message: "MOVE toSlotIndex must be a finite integer." };
    }
    message.toSlotIndex = toSlotIndex;
  }
  if (opcode === ClientOpcode.USE_ABILITY) {
    const hasX = Object.prototype.hasOwnProperty.call(data, "targetX");
    const hasY = Object.prototype.hasOwnProperty.call(data, "targetY");
    if (hasX !== hasY) {
      return { code: "invalid_target", message: "Ability ground targets require both targetX and targetY." };
    }
    if (hasX) {
      const targetX = data.targetX;
      const targetY = data.targetY;
      if (typeof targetX !== "number" || !isFinite(targetX) || typeof targetY !== "number" || !isFinite(targetY)) {
        return { code: "invalid_target", message: "Ability target point must be finite numbers." };
      }
      message.targetX = targetX;
      message.targetY = targetY;
    }
  }
  if (opcode === ClientOpcode.ASSIGN_HOTBAR) {
    const slotIndex = data.slotIndex;
    if (typeof slotIndex !== "number" || !isFinite(slotIndex) || slotIndex !== Math.floor(slotIndex)) {
      return { code: "invalid_slot", message: "ASSIGN_HOTBAR slotIndex must be a finite integer." };
    }
    message.slotIndex = slotIndex;
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
  extra?: { [key: string]: unknown },
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    ok: ok,
    code: code,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  if (extra !== undefined) {
    const keys = Object.keys(extra);
    for (let i = 0; i < keys.length; i++) {
      payload[keys[i]] = extra[keys[i]];
    }
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
  extra?: { [key: string]: unknown },
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
  if (extra !== undefined) {
    const keys = Object.keys(extra);
    for (let i = 0; i < keys.length; i++) {
      payload[keys[i]] = extra[keys[i]];
    }
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

export function walletState(
  contentHash: string,
  gold: number,
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    gold: gold,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.WALLET_STATE,
    body: JSON.stringify(payload),
  };
}

export function progressionState(
  contentHash: string,
  progression: { [key: string]: unknown },
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    progression: progression,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.PROGRESSION_STATE,
    body: JSON.stringify(payload),
  };
}

export function abilityState(
  contentHash: string,
  abilities: { [key: string]: unknown },
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    abilities: abilities,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.ABILITY_STATE,
    body: JSON.stringify(payload),
  };
}

export function partyStateMessage(
  contentHash: string,
  party: { [key: string]: unknown } | null,
  pendingInvite: { [key: string]: unknown } | null,
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    party: party,
    pendingInvite: pendingInvite,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.PARTY_STATE,
    body: JSON.stringify(payload),
  };
}

export function tradeStateMessage(
  contentHash: string,
  trade: { [key: string]: unknown } | null,
  requestId?: string,
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    trade: trade,
  };
  if (requestId !== undefined) {
    payload.requestId = requestId;
  }
  return {
    opcode: ServerOpcode.TRADE_STATE,
    body: JSON.stringify(payload),
  };
}

export function partyEventMessage(
  contentHash: string,
  eventType: string,
  extras: { [key: string]: unknown } = {},
): { opcode: number; body: string } {
  const payload: { [key: string]: unknown } = {
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    type: eventType,
  };
  const keys = Object.keys(extras);
  for (let i = 0; i < keys.length; i++) {
    payload[keys[i]] = extras[keys[i]];
  }
  return {
    opcode: ServerOpcode.PARTY_EVENT,
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
