import { characterLifecycleDeps } from "../nakama/character_lifecycle_deps";
import {
  handleCharacterBootstrapViaRoster,
  handleCharacterCreate,
  handleCharacterList,
  handleCharacterRestore,
  handleCharacterSelect,
  handleCharacterSoftDelete,
} from "../domain/character_lifecycle";

function rpcError(logger: nkruntime.Logger, userId: string | undefined, action: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "internal_error";
  logger.error("%s rejected user_id=%s action=%s reason=%s", action, userId !== undefined ? userId : "", action, message);
  throw error instanceof Error ? error : new Error(message);
}

export function rpcCharacterBootstrap(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const response = handleCharacterBootstrapViaRoster(ctx.userId, ctx.username, payload, characterLifecycleDeps(nk));
    logger.info(
      "character_bootstrap ok user_id=%s character_id=%s created=%s",
      ctx.userId,
      response.characterId,
      String(response.created),
    );
    return JSON.stringify(response);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_bootstrap", error);
  }
}

export function rpcCharacterList(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _payload: string,
): string {
  try {
    return JSON.stringify(handleCharacterList(ctx.userId, characterLifecycleDeps(nk)));
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_list", error);
  }
}

export function rpcCharacterCreate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const response = handleCharacterCreate(ctx.userId, payload, characterLifecycleDeps(nk));
    logger.info("character_create ok user_id=%s character_id=%s", ctx.userId, response.characterId);
    return JSON.stringify(response);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_create", error);
  }
}

export function rpcCharacterSelect(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const response = handleCharacterSelect(ctx.userId, payload, characterLifecycleDeps(nk));
    logger.info("character_select ok user_id=%s character_id=%s", ctx.userId, response.characterId);
    return JSON.stringify(response);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_select", error);
  }
}

export function rpcCharacterSoftDelete(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    return JSON.stringify(handleCharacterSoftDelete(ctx.userId, payload, characterLifecycleDeps(nk)));
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_soft_delete", error);
  }
}

export function rpcCharacterRestore(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    return JSON.stringify(handleCharacterRestore(ctx.userId, payload, characterLifecycleDeps(nk)));
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_restore", error);
  }
}
