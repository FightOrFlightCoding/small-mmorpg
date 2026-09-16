import { requirePlayableUser } from "../nakama/playable_account";
import { PROTOCOL_VERSION } from "../domain/protocol";
import { STARTER_ZONE_ID } from "../domain/match_state";
import { PUBLIC_WORLD_INSTANCE_ID, PUBLIC_WORLD_INSTANCE_TYPE, publicWorldLocation, type ActiveLocation } from "../domain/instance";
import { findOrCreateStarterZoneMatch } from "../nakama/starter_zone_registry";
import { contentHash } from "../generated/content";
import { readSelection } from "../nakama/selection_store";
import { readActiveLocation, writeActiveLocation } from "../nakama/location_store";
import { accountCaveRepository, nakamaCaveRepository } from "../nakama/cave_store";
import { nakamaPartyRepository } from "../nakama/party_store";
import {
  chooseReconnectMatch,
  clearCharacterCaveAssociation,
  resolvePartyForActor,
} from "../domain/cave";
import { readEnvironment, rejectIfGameplayClosed } from "../nakama/ops_store";
import { formatOpsLog, incrementCounter } from "../domain/ops_metrics";
import { rpcFailureCode, rpcFailurePayload } from "../domain/rpc_error";

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
    const userId = requirePlayableUser(ctx, nk);
    parseFindOrCreatePayload(payload);
    let reconnectingCave = false;
    let staleCaveLocation: ActiveLocation | null = null;
    const selected = readSelection(nk, userId);
    if (selected !== null && selected.characterId.length > 0) {
      const location = readActiveLocation(nk, userId, selected.characterId);
      if (location !== null && location.instanceType === "party_cave") {
        const cave = nakamaCaveRepository(nk).getCave(location.instanceId);
        const caveMatchRunning =
          cave !== null &&
          cave.lifecycleState !== "expired" &&
          cave.lifecycleState !== "terminated" &&
          nk.matchGet(cave.matchId) !== null;
        const party = resolvePartyForActor(nakamaPartyRepository(nk), userId, selected.characterId);
        if (
          chooseReconnectMatch({
            locationInstanceType: location.instanceType,
            cave: cave,
            caveMatchRunning: caveMatchRunning,
            characterId: selected.characterId,
            party: party,
          }) === "cave" &&
          cave !== null
        ) {
          reconnectingCave = true;
          logger.info(formatOpsLog("zone_transfer", { user_id: userId, action: "reconnect_cave", match_id: cave.matchId }));
          return JSON.stringify({
            matchId: cave.matchId,
            zoneId: cave.zoneTemplateId,
            instanceId: cave.instanceId,
            instanceType: "party_cave",
            protocolVersion: PROTOCOL_VERSION,
            contentHash: contentHash,
          });
        }
        staleCaveLocation = location;
        const instanceId = cave !== null ? cave.instanceId : location.instanceId;
        clearCharacterCaveAssociation(accountCaveRepository(nk, userId), selected.characterId, instanceId);
      }
    }
    rejectIfGameplayClosed(nk, readEnvironment(ctx), ctx.env, reconnectingCave);
    const matchId = findOrCreateStarterZoneMatch(nk, logger);
    if (staleCaveLocation !== null && selected !== null) {
      writeActiveLocation(
        nk,
        publicWorldLocation(
          matchId,
          selected.characterId,
          userId,
          staleCaveLocation.position.x,
          staleCaveLocation.position.y,
          Date.now(),
        ),
      );
      logger.info(formatOpsLog("zone_transfer", { user_id: userId, action: "cave_reconnect_fallback", match_id: matchId }));
    }
    logger.info(formatOpsLog("zone_transfer", { user_id: userId, action: "find_or_create_starter_zone", match_id: matchId }));
    return JSON.stringify({
      matchId: matchId,
      zoneId: STARTER_ZONE_ID,
      instanceId: PUBLIC_WORLD_INSTANCE_ID,
      instanceType: PUBLIC_WORLD_INSTANCE_TYPE,
      protocolVersion: PROTOCOL_VERSION,
      contentHash: contentHash,
    });
  } catch (error) {
    const message = rpcFailureCode(error);
    logger.error(formatOpsLog("zone_transfer", {
      user_id: ctx.userId !== undefined ? ctx.userId : "",
      action: "find_or_create_starter_zone",
      reason: message,
    }));
    incrementCounter("transferFailures");
    return rpcFailurePayload(message);
  }
}
