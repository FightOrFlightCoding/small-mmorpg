import { requireAuthenticatedUserId } from "../domain/character";
import { PROTOCOL_VERSION } from "../domain/protocol";
import { STARTER_ZONE_ID } from "../domain/match_state";
import { findOrCreateStarterZoneMatch } from "../nakama/starter_zone_registry";
import { contentHash } from "../generated/content";

export const FIND_OR_CREATE_STARTER_ZONE_RPC_ID = "find_or_create_starter_zone";

export function parseFindOrCreatePayload(payload: string): void {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("malformed_json");
  }
  const keys = Object.keys(parsed);
  if (keys.length > 0) {
    throw new Error("unknown_field:" + keys[0]);
  }
}

export function rpcFindOrCreateStarterZone(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    requireAuthenticatedUserId(ctx.userId);
    parseFindOrCreatePayload(payload);
    const matchId = findOrCreateStarterZoneMatch(nk, logger);
    logger.info("find_or_create_starter_zone ok user_id=%s match_id=%s", ctx.userId, matchId);
    return JSON.stringify({
      matchId: matchId,
      zoneId: STARTER_ZONE_ID,
      protocolVersion: PROTOCOL_VERSION,
      contentHash: contentHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    logger.error("find_or_create_starter_zone rejected reason=%s", message);
    throw error;
  }
}
