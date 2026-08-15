export const STARTER_ZONE_CHAT_ROOM = "zone.starter";
export const MAX_CHAT_MESSAGE_CHARS = 200;
export const CHANNEL_TYPE_ROOM = 1;

export function parseChatMessageContent(raw: string): string {
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
    if (keys[i] !== "message") {
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
  return trimmed;
}

export function filterChannelMessageSend(
  envelope: nkruntime.EnvelopeChannelMessageSend,
): nkruntime.EnvelopeChannelMessageSend {
  if (envelope === null || envelope === undefined || envelope.channelMessageSend === null || envelope.channelMessageSend === undefined) {
    throw chatError("invalid_payload");
  }
  const send = envelope.channelMessageSend;
  if (typeof send.channelId !== "string" || send.channelId.length === 0) {
    throw chatError("invalid_payload");
  }
  const message = parseChatMessageContent(send.content);
  send.content = JSON.stringify({ message: message });
  return envelope;
}

export function filterChannelJoin(envelope: nkruntime.EnvelopeChannelJoin): nkruntime.EnvelopeChannelJoin {
  if (envelope === null || envelope === undefined || envelope.channelJoin === null || envelope.channelJoin === undefined) {
    throw chatError("invalid_payload");
  }
  const join = envelope.channelJoin;
  if (join.type !== CHANNEL_TYPE_ROOM) {
    throw chatError("invalid_channel");
  }
  if (typeof join.target !== "string" || join.target !== STARTER_ZONE_CHAT_ROOM) {
    throw chatError("invalid_channel");
  }
  return envelope;
}

function chatError(code: string): Error {
  return new Error(code);
}
