import assert from "node:assert/strict";
import test from "node:test";
import {
  CHANNEL_TYPE_ROOM,
  CHAT_RATE_MAX,
  MAX_CHAT_MESSAGE_CHARS,
  STARTER_ZONE_CHAT_ROOM,
  filterChannelJoin,
  filterChannelMessageSend,
  parseChatMessageContent,
} from "../src/domain/chat";

function sendEnvelope(content: string, channelId = "channel-1"): nkruntime.EnvelopeChannelMessageSend {
  return {
    channelMessageSend: {
      channelId: channelId,
      content: content,
    },
  };
}

function joinEnvelope(
  target: string,
  type: number,
): nkruntime.EnvelopeChannelJoin {
  return {
    channelJoin: {
      target: target,
      type: type,
      persistence: false,
      hidden: false,
    },
  };
}

test("valid chat content is trimmed and accepted", () => {
  assert.equal(parseChatMessageContent(JSON.stringify({ message: "  hello  " })), "hello");
  const filtered = filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "  hi  " })));
  assert.equal(filtered.channelMessageSend.content, JSON.stringify({ message: "hi" }));
});

test("empty chat messages are rejected", () => {
  assert.throws(() => parseChatMessageContent(JSON.stringify({ message: "" })), /empty_message/);
  assert.throws(() => parseChatMessageContent(JSON.stringify({ message: "   " })), /empty_message/);
  assert.throws(() => filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "" }))), /empty_message/);
});

test("oversized chat messages are rejected", () => {
  const tooLong = "a".repeat(MAX_CHAT_MESSAGE_CHARS + 1);
  assert.throws(
    () => parseChatMessageContent(JSON.stringify({ message: tooLong })),
    /message_too_long/,
  );
  assert.equal(parseChatMessageContent(JSON.stringify({ message: "b".repeat(MAX_CHAT_MESSAGE_CHARS) })).length, 200);
});

test("invalid chat payloads are rejected", () => {
  assert.throws(() => parseChatMessageContent(""), /malformed_json/);
  assert.throws(() => parseChatMessageContent("not-json"), /malformed_json/);
  assert.throws(() => parseChatMessageContent("[]"), /malformed_json/);
  assert.throws(() => parseChatMessageContent("null"), /malformed_json/);
  assert.throws(() => parseChatMessageContent(JSON.stringify({ message: 12 })), /invalid_payload/);
  assert.throws(
    () => parseChatMessageContent(JSON.stringify({ message: "hi", extra: true })),
    /invalid_payload/,
  );
  assert.throws(() => filterChannelMessageSend({} as nkruntime.EnvelopeChannelMessageSend), /invalid_payload/);
  assert.throws(
    () => filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "hi" }), "")),
    /invalid_payload/,
  );
});

test("only the starter-zone room or a member party room may be joined", () => {
  const allowed = filterChannelJoin(joinEnvelope(STARTER_ZONE_CHAT_ROOM, CHANNEL_TYPE_ROOM));
  assert.equal(allowed.channelJoin.target, STARTER_ZONE_CHAT_ROOM);
  assert.throws(() => filterChannelJoin(joinEnvelope("other.room", CHANNEL_TYPE_ROOM)), /invalid_channel/);
  assert.throws(() => filterChannelJoin(joinEnvelope(STARTER_ZONE_CHAT_ROOM, 2)), /invalid_channel/);
  assert.throws(() => filterChannelJoin({} as nkruntime.EnvelopeChannelJoin), /invalid_payload/);
  assert.throws(() => filterChannelJoin(joinEnvelope("party.p_one", CHANNEL_TYPE_ROOM)), /invalid_channel/);
  const partyJoin = filterChannelJoin(joinEnvelope("party.p_one", CHANNEL_TYPE_ROOM), {
    isPartyMember: function (partyId: string) {
      return partyId === "p_one";
    },
  });
  assert.equal(partyJoin.channelJoin.target, "party.p_one");
  const boxedType = filterChannelJoin(joinEnvelope(STARTER_ZONE_CHAT_ROOM, "1" as unknown as number));
  assert.equal(boxedType.channelJoin.target, STARTER_ZONE_CHAT_ROOM);
});

test("party chat send requires membership and allows partyId", () => {
  assert.throws(
    () =>
      filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "hi", partyId: "p_one" }))),
    /not_party_member/,
  );
  const sent = filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "  hi  ", partyId: "p_one" })), {
    isPartyMember: function (partyId: string) {
      return partyId === "p_one";
    },
  });
  assert.equal(sent.channelMessageSend.content, JSON.stringify({ message: "hi", partyId: "p_one" }));
  const times: number[] = [];
  const member = {
    isPartyMember: function (partyId: string) {
      return partyId === "p_one";
    },
    nowMs: 1000,
    recentSendTimes: times,
  };
  for (let i = 0; i < CHAT_RATE_MAX; i++) {
    member.nowMs = 1000 + i;
    filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "n" + String(i), partyId: "p_one" })), member);
  }
  member.nowMs = 1000 + CHAT_RATE_MAX;
  assert.throws(
    () =>
      filterChannelMessageSend(sendEnvelope(JSON.stringify({ message: "nope", partyId: "p_one" })), member),
    /rate_limited/,
  );
});
