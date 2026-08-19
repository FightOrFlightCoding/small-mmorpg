import { PARTY_CHAT_PREFIX, partyIdFromChatRoom } from "./party";
import { CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS } from "./rate_limit";

export const STARTER_ZONE_CHAT_ROOM = "zone.starter";
export const MAX_CHAT_MESSAGE_CHARS = 200;
export const CHANNEL_TYPE_ROOM = 1;
export { CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS };

export interface ChatPayload {
  message: string;
  partyId?: string;
}

export interface ChatFilterOptions {
  isPartyMember?: (partyId: string) => boolean;
  nowMs?: number;
  recentSendTimes?: number[];
}

export function parseChatPayload(raw: string): ChatPayload {
  if (typeof raw !== "string" || raw.length === 0) {
    throw chatError("malformed_json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw chatError("malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw chatError("malformed_json");
  }
  const data = parsed as { [key: string]: unknown };
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== "message" && keys[i] !== "partyId") {
      throw chatError("invalid_payload");
    }
  }
  if (typeof data.message !== "string") {
    throw chatError("invalid_payload");
  }
  const trimmed = data.message.replace(/^\s+|\s+$/g, "");
  if (trimmed.length === 0) {
    throw chatError("empty_message");
  }
  if (trimmed.length > MAX_CHAT_MESSAGE_CHARS) {
    throw chatError("message_too_long");
  }
  const payload: ChatPayload = { message: trimmed };
  if (Object.prototype.hasOwnProperty.call(data, "partyId")) {
    if (typeof data.partyId !== "string" || data.partyId.length === 0) {
      throw chatError("invalid_payload");
    }
    payload.partyId = data.partyId;
  }
  return payload;
}

export function parseChatMessageContent(raw: string): string {
  return parseChatPayload(raw).message;
}

export function acceptChatRate(recentSendTimes: number[], nowMs: number): { ok: boolean; next: number[] } {
  const windowStart = nowMs - CHAT_RATE_WINDOW_MS;
  const kept: number[] = [];
  for (let i = 0; i < recentSendTimes.length; i++) {
    if (recentSendTimes[i] > windowStart) {
      kept.push(recentSendTimes[i]);
    }
  }
  if (kept.length >= CHAT_RATE_MAX) {
    return { ok: false, next: kept };
  }
  kept.push(nowMs);
  return { ok: true, next: kept };
}

export function filterChannelMessageSend(
  envelope: nkruntime.EnvelopeChannelMessageSend,
  options?: ChatFilterOptions,
): nkruntime.EnvelopeChannelMessageSend {
  if (envelope === null || envelope === undefined || envelope.channelMessageSend === null || envelope.channelMessageSend === undefined) {
    throw chatError("invalid_payload");
  }
  const send = envelope.channelMessageSend;
  if (typeof send.channelId !== "string" || send.channelId.length === 0) {
    throw chatError("invalid_payload");
  }
  const parsed = parseChatPayload(send.content);
  if (parsed.partyId !== undefined) {
    if (options === undefined || options.isPartyMember === undefined || !options.isPartyMember(parsed.partyId)) {
      throw chatError("not_party_member");
    }
  }
  if (options !== undefined && options.nowMs !== undefined && options.recentSendTimes !== undefined) {
    const rate = acceptChatRate(options.recentSendTimes, options.nowMs);
    if (!rate.ok) {
      throw chatError("rate_limited");
    }
    options.recentSendTimes.length = 0;
    for (let i = 0; i < rate.next.length; i++) {
      options.recentSendTimes.push(rate.next[i]);
    }
  }
  if (parsed.partyId !== undefined) {
    send.content = JSON.stringify({ message: parsed.message, partyId: parsed.partyId });
  } else {
    send.content = JSON.stringify({ message: parsed.message });
  }
  return envelope;
}

export function filterChannelJoin(
  envelope: nkruntime.EnvelopeChannelJoin,
  options?: ChatFilterOptions,
): nkruntime.EnvelopeChannelJoin {
  if (envelope === null || envelope === undefined || envelope.channelJoin === null || envelope.channelJoin === undefined) {
    throw chatError("invalid_payload");
  }
  const join = envelope.channelJoin;
  if (!isRoomChannelType(join.type)) {
    throw chatError("invalid_channel");
  }
  if (typeof join.target !== "string") {
    throw chatError("invalid_channel");
  }
  if (join.target === STARTER_ZONE_CHAT_ROOM) {
    return envelope;
  }
  if (join.target.indexOf(PARTY_CHAT_PREFIX) === 0) {
    const partyId = partyIdFromChatRoom(join.target);
    if (partyId.length === 0) {
      throw chatError("invalid_channel");
    }
    if (options === undefined || options.isPartyMember === undefined || !options.isPartyMember(partyId)) {
      throw chatError("invalid_channel");
    }
    return envelope;
  }
  throw chatError("invalid_channel");
}

function isRoomChannelType(value: unknown): boolean {
  if (value === CHANNEL_TYPE_ROOM || value === 1 || value === "1" || value === "ROOM") {
    return true;
  }
  if (value !== null && typeof value === "object") {
    const boxed = value as { toNumber?: () => number };
    if (typeof boxed.toNumber === "function") {
      return boxed.toNumber() === CHANNEL_TYPE_ROOM;
    }
  }
  return false;
}

function chatError(code: string): Error {
  return new Error(code);
}
