import { filterChannelJoin, filterChannelMessageSend } from "../domain/chat";

export function beforeChannelMessageSend(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelMessageSend,
): nkruntime.EnvelopeChannelMessageSend {
  try {
    return filterChannelMessageSend(envelope);
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
  _nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelJoin,
): nkruntime.EnvelopeChannelJoin {
  try {
    return filterChannelJoin(envelope);
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
