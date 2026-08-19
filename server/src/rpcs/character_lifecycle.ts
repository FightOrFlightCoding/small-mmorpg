import { characterLifecycleDeps } from "../nakama/character_lifecycle_deps";
import { requirePlayableUser } from "../nakama/playable_account";
import { rpcFailureCode, rpcFailurePayload } from "../domain/rpc_error";
import {
  handleCharacterBootstrapViaRoster,
  handleCharacterCreate,
  handleCharacterList,
  handleCharacterRestore,
  handleCharacterSelect,
  handleCharacterSoftDelete,
} from "../domain/character_lifecycle";

function rpcError(logger: nkruntime.Logger, userId: string | undefined, action: string, error: unknown): string {
  const message = rpcFailureCode(error);
  logger.error("%s rejected user_id=%s action=%s reason=%s", action, userId !== undefined ? userId : "", action, message);
  return rpcFailurePayload(message);
}

export function rpcCharacterBootstrap(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const response = handleCharacterBootstrapViaRoster(userId, ctx.username, payload, characterLifecycleDeps(nk));
    logger.info(
      "character_bootstrap ok user_id=%s character_id=%s created=%s",
      userId,
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
    const userId = requirePlayableUser(ctx, nk);
    return JSON.stringify(handleCharacterList(userId, characterLifecycleDeps(nk)));
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
    const userId = requirePlayableUser(ctx, nk);
    const response = handleCharacterCreate(userId, payload, characterLifecycleDeps(nk));
    logger.info("character_create ok user_id=%s character_id=%s", userId, response.characterId);
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
    const userId = requirePlayableUser(ctx, nk);
    const response = handleCharacterSelect(userId, payload, characterLifecycleDeps(nk));
    logger.info("character_select ok user_id=%s character_id=%s", userId, response.characterId);
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
    const userId = requirePlayableUser(ctx, nk);
    return JSON.stringify(handleCharacterSoftDelete(userId, payload, characterLifecycleDeps(nk)));
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
    const userId = requirePlayableUser(ctx, nk);
    return JSON.stringify(handleCharacterRestore(userId, payload, characterLifecycleDeps(nk)));
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_restore", error);
  }
}
