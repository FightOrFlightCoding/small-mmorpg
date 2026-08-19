import { filterChannelJoin, filterChannelMessageSend } from "../domain/chat";
import { consumeSessionRate } from "../domain/rate_limit";
import { accountOwnsPartyMembership } from "../domain/party";
import { nakamaPartyRepository } from "./party_store";
import { incrementCounter } from "../domain/ops_metrics";
import { requirePlayableUser } from "./playable_account";
import { rpcFailureCode, throwRpcFailure } from "../domain/rpc_error";

export function beforeChannelMessageSend(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelMessageSend,
): nkruntime.EnvelopeChannelMessageSend {
  try {
    const userId = requirePlayableUser(ctx, nk);
    if (!consumeSessionRate("chat", userId, Date.now())) {
      incrementCounter("rejectedActions");
      throw new Error("rate_limited");
    }
    const filtered = filterChannelMessageSend(envelope, {
      isPartyMember: function (partyId: string) {
        return accountIsPartyMember(nk, userId, partyId);
      },
    });
    return filtered;
  } catch (error) {
    const reason = rpcFailureCode(error);
    logger.error(
      "match_action rejected user_id=%s action=channel_message_send reason=%s tick=0",
      ctx.userId,
      reason,
    );
    throwRpcFailure(reason);
  }
}

export function beforeChannelJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelJoin,
): nkruntime.EnvelopeChannelJoin {
  try {
    const userId = requirePlayableUser(ctx, nk);
    return filterChannelJoin(envelope, {
      isPartyMember: function (partyId: string) {
        return accountIsPartyMember(nk, userId, partyId);
      },
    });
  } catch (error) {
    const reason = rpcFailureCode(error);
    logger.error(
      "match_action rejected user_id=%s action=channel_join reason=%s tick=0",
      ctx.userId,
      reason,
    );
    throwRpcFailure(reason);
  }
}

function accountIsPartyMember(nk: nkruntime.Nakama, userId: string, partyId: string): boolean {
  if (userId.length === 0 || partyId.length === 0) {
    return false;
  }
  const party = nakamaPartyRepository(nk).getParty(partyId);
  return party !== null && accountOwnsPartyMembership(party, userId);
}
