import { characterLifecycleDeps } from "../nakama/character_lifecycle_deps";
import { requirePlayableUser } from "../nakama/playable_account";
import { rpcFailureCode, rpcFailurePayload } from "../domain/rpc_error";
import { consumeSessionRate } from "../domain/rate_limit";
import { formatAccountAudit } from "../domain/account_audit";
import {
  handleCharacterBootstrapViaRoster,
  handleCharacterCreate,
  handleCharacterDeleteRequest,
  handleCharacterList,
  handleCharacterNameAvailable,
  handleCharacterPurge,
  handleCharacterRestore,
  handleCharacterSelect,
} from "../domain/character_lifecycle";

function rpcError(logger: nkruntime.Logger, userId: string | undefined, action: string, error: unknown): string {
  const message = rpcFailureCode(error);
  logger.error("%s rejected user_id=%s action=%s reason=%s", action, userId !== undefined ? userId : "", action, message);
  return rpcFailurePayload(message);
}

function rateLimited(userId: string, kind: "character_create" | "character_name" | "character_select"): string | null {
  if (consumeSessionRate(kind, userId, Date.now())) {
    return null;
  }
  return rpcFailurePayload("rate_limited");
}

function deps(nk: nkruntime.Nakama, ctx: nkruntime.Context, logger: nkruntime.Logger) {
  return characterLifecycleDeps(nk, ctx.env, logger);
}

export function rpcCharacterBootstrap(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const response = handleCharacterBootstrapViaRoster(userId, ctx.username, payload, deps(nk, ctx, logger));
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
    return JSON.stringify(handleCharacterList(userId, deps(nk, ctx, logger)));
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
    const limited = rateLimited(userId, "character_create");
    if (limited !== null) {
      return limited;
    }
    const response = handleCharacterCreate(userId, payload, deps(nk, ctx, logger));
    logger.info(formatAccountAudit("character_created", { user_id: userId, character_id: response.characterId }));
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
    const limited = rateLimited(userId, "character_select");
    if (limited !== null) {
      return limited;
    }
    const response = handleCharacterSelect(userId, payload, deps(nk, ctx, logger));
    logger.info(formatAccountAudit("character_selected", { user_id: userId, character_id: response.characterId }));
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
    const result = handleCharacterDeleteRequest(userId, payload, deps(nk, ctx, logger));
    logger.info(formatAccountAudit("character_soft_deleted", { user_id: userId }));
    return JSON.stringify(result);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_soft_delete", error);
  }
}

export function rpcCharacterDeleteRequest(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const result = handleCharacterDeleteRequest(userId, payload, deps(nk, ctx, logger));
    logger.info(formatAccountAudit("character_soft_deleted", { user_id: userId }));
    return JSON.stringify(result);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_delete_request", error);
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
    const restored = handleCharacterRestore(userId, payload, deps(nk, ctx, logger));
    logger.info(formatAccountAudit("character_restored", { user_id: userId }));
    return JSON.stringify(restored);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_restore", error);
  }
}

export function rpcCharacterNameAvailable(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const limited = rateLimited(userId, "character_name");
    if (limited !== null) {
      return limited;
    }
    return JSON.stringify(handleCharacterNameAvailable(userId, payload, deps(nk, ctx, logger)));
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_name_available", error);
  }
}

export function rpcCharacterPurge(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const purged = handleCharacterPurge(userId, payload, deps(nk, ctx, logger));
    logger.info(formatAccountAudit("character_purged", { user_id: userId }));
    return JSON.stringify(purged);
  } catch (error) {
    return rpcError(logger, ctx.userId, "character_purge", error);
  }
}
