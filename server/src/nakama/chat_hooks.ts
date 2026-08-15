import { filterChannelJoin, filterChannelMessageSend } from "../domain/chat";

export function registerChatHooks(initializer: nkruntime.Initializer): void {
  initializer.registerRtBefore("ChannelMessageSend", beforeChannelMessageSend);
  initializer.registerRtBefore("ChannelJoin", beforeChannelJoin);
}

function beforeChannelMessageSend(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelMessageSend,
): nkruntime.EnvelopeChannelMessageSend {
  try {
    return filterChannelMessageSend(envelope);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_payload";
    logger.error("channel_message_send rejected user_id=%s reason=%s", ctx.userId, reason);
    throw error;
  }
}

function beforeChannelJoin(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  envelope: nkruntime.EnvelopeChannelJoin,
): nkruntime.EnvelopeChannelJoin {
  try {
    return filterChannelJoin(envelope);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_payload";
    logger.error("channel_join rejected user_id=%s reason=%s", ctx.userId, reason);
    throw error;
  }
}
