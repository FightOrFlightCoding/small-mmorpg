import { requireAuthenticatedUserId } from "../domain/character";
import { PROTOCOL_VERSION } from "../domain/protocol";
import { STARTER_ZONE_ID } from "../domain/match_state";
import { PUBLIC_WORLD_INSTANCE_ID, PUBLIC_WORLD_INSTANCE_TYPE } from "../domain/instance";
import { findOrCreateStarterZoneMatch } from "../nakama/starter_zone_registry";
import { contentHash } from "../generated/content";
import { readSelection } from "../nakama/selection_store";
import { readActiveLocation } from "../nakama/location_store";
import { nakamaCaveRepository } from "../nakama/cave_store";

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
    const userId = requireAuthenticatedUserId(ctx.userId);
    parseFindOrCreatePayload(payload);
    const selected = readSelection(nk, userId);
    if (selected !== null && selected.characterId.length > 0) {
      const location = readActiveLocation(nk, userId, selected.characterId);
      if (location !== null && location.instanceType === "party_cave") {
        const cave = nakamaCaveRepository(nk).getCave(location.instanceId);
        if (
          cave !== null &&
          cave.lifecycleState !== "expired" &&
          cave.lifecycleState !== "terminated" &&
          nk.matchGet(cave.matchId) !== null
        ) {
          logger.info("find_or_create_starter_zone reconnect_cave user_id=%s match_id=%s", userId, cave.matchId);
          return JSON.stringify({
            matchId: cave.matchId,
            zoneId: cave.zoneTemplateId,
            instanceId: cave.instanceId,
            instanceType: "party_cave",
            protocolVersion: PROTOCOL_VERSION,
            contentHash: contentHash,
          });
        }
      }
    }
    const matchId = findOrCreateStarterZoneMatch(nk, logger);
    logger.info("find_or_create_starter_zone ok user_id=%s match_id=%s", ctx.userId, matchId);
    return JSON.stringify({
      matchId: matchId,
      zoneId: STARTER_ZONE_ID,
      instanceId: PUBLIC_WORLD_INSTANCE_ID,
      instanceType: PUBLIC_WORLD_INSTANCE_TYPE,
      protocolVersion: PROTOCOL_VERSION,
      contentHash: contentHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    logger.error(
      "find_or_create_starter_zone rejected user_id=%s action=find_or_create_starter_zone reason=%s",
      ctx.userId !== undefined ? ctx.userId : "",
      message,
    );
    throw error;
  }
}
