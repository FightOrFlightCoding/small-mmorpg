import { content } from "../generated/content";
import { handleCharacterBootstrap } from "../domain/character";
import { readCharacter, writeCharacter } from "../nakama/character_store";

export const CHARACTER_BOOTSTRAP_RPC_ID = "character_bootstrap";

export function rpcCharacterBootstrap(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const response = handleCharacterBootstrap(ctx.userId, ctx.username, payload, {
      store: {
        read: function (userId: string) {
          return readCharacter(nk, userId);
        },
        write: function (userId: string, record) {
          writeCharacter(nk, userId, record);
        },
      },
      newId: function () {
        return nk.uuidv4();
      },
      player: content.player,
      zone: content.zones["zone.starter"],
    });
    logger.info(
      "character_bootstrap ok user_id=%s character_id=%s created=%s",
      ctx.userId,
      response.characterId,
      String(response.created),
    );
    return JSON.stringify(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    logger.error(
      "character_bootstrap rejected user_id=%s action=character_bootstrap reason=%s",
      ctx.userId !== undefined ? ctx.userId : "",
      message,
    );
    throw error;
  }
}
