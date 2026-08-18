import { filterChannelJoin, filterChannelMessageSend, parseChatPayload } from "../domain/chat";
import { accountOwnsPartyMembership } from "../domain/party";
import { nakamaPartyRepository } from "./party_store";

const partyChatSends: { [userId: string]: number[] } = {};

export function beforeChannelMessageSend(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelMessageSend,
): nkruntime.EnvelopeChannelMessageSend {
  try {
    const userId = ctx.userId !== undefined ? ctx.userId : "";
    let parsedPartyId = "";
    try {
      const parsed = parseChatPayload(envelope.channelMessageSend.content);
      parsedPartyId = parsed.partyId !== undefined ? parsed.partyId : "";
    } catch {
      parsedPartyId = "";
    }
    const options =
      parsedPartyId.length > 0
        ? {
            isPartyMember: function (partyId: string) {
              return accountIsPartyMember(nk, userId, partyId);
            },
            nowMs: Date.now(),
            recentSendTimes: partyChatSends[userId] !== undefined ? partyChatSends[userId] : [],
          }
        : undefined;
    const filtered = filterChannelMessageSend(envelope, options);
    if (parsedPartyId.length > 0 && options !== undefined && options.recentSendTimes !== undefined) {
      partyChatSends[userId] = options.recentSendTimes;
    }
    return filtered;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_payload";
    logger.error(
      "match_action rejected user_id=%s action=channel_message_send reason=%s tick=0",
      ctx.userId,
      reason,
    );
    throw error;
  }
}

export function beforeChannelJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelJoin,
): nkruntime.EnvelopeChannelJoin {
  try {
    const userId = ctx.userId !== undefined ? ctx.userId : "";
    return filterChannelJoin(envelope, {
      isPartyMember: function (partyId: string) {
        return accountIsPartyMember(nk, userId, partyId);
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_payload";
    logger.error(
      "match_action rejected user_id=%s action=channel_join reason=%s tick=0",
      ctx.userId,
      reason,
    );
    throw error;
  }
}

function accountIsPartyMember(nk: nkruntime.Nakama, userId: string, partyId: string): boolean {
  if (userId.length === 0 || partyId.length === 0) {
    return false;
  }
  const party = nakamaPartyRepository(nk).getParty(partyId);
  return party !== null && accountOwnsPartyMembership(party, userId);
}
