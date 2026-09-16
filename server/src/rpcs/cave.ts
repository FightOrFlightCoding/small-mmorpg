import { requirePlayableUser } from "../nakama/playable_account";
import {
  associateCharacterWithCave,
  canJoinOwnedCave,
  evaluateCaveEntry,
  evaluateCaveExit,
  findOrCreateOwnedCave,
  resolvePartyForActor,
  emptyTimeoutMs,
} from "../domain/cave";
import { CAVE_ZONE_ID, PARTY_CAVE_INSTANCE_TYPE, type CaveCompletionState } from "../domain/instance";
import { PROTOCOL_VERSION } from "../domain/protocol";
import {
  CAVE_EMPTY_TIMEOUT_TICKS,
  CAVE_MATCH_MAX_PLAYERS,
  CAVE_RECONNECT_GRACE_TICKS,
  CAVE_ZONE_ID as MATCH_CAVE_ZONE_ID,
  STARTER_ZONE_MODULE,
} from "../domain/match_state";
import { npcDefinitionsFromContent } from "../domain/npc";
import { content, contentHash } from "../generated/content";
import { accountCaveRepository } from "../nakama/cave_store";
import { readCharacter } from "../nakama/character_store";
import { nakamaPartyRepository } from "../nakama/party_store";
import { readSelection } from "../nakama/selection_store";
import { readActiveLocation } from "../nakama/location_store";
import { findOrCreateStarterZoneMatch } from "../nakama/starter_zone_registry";
import { readEnvironment, rejectIfGameplayClosed } from "../nakama/ops_store";
import { formatOpsLog, incrementCounter } from "../domain/ops_metrics";
import { rpcFailureCode, rpcFailurePayload } from "../domain/rpc_error";

export const REQUEST_CAVE_ENTRY_RPC_ID = "request_cave_entry";
export const FIND_OR_CREATE_OWNED_CAVE_RPC_ID = "find_or_create_owned_cave";
export const REQUEST_CAVE_EXIT_RPC_ID = "request_cave_exit";

export function parseEmptyOrNpcPayload(payload: string): { npcId: string } {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return { npcId: "" };
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
  const data = parsed as { [key: string]: unknown };
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== "npcId") {
      throw new Error("unknown_field:" + keys[i]);
    }
  }
  const npcId = data.npcId;
  if (npcId !== undefined && typeof npcId !== "string") {
    throw new Error("malformed_json");
  }
  return { npcId: typeof npcId === "string" ? npcId : "" };
}

export function createCaveMatch(nk: nkruntime.Nakama, params: {
  instanceId: string;
  ownerPartyId?: string;
  ownerCharacterId?: string;
  completionState: CaveCompletionState;
  zoneTemplateId?: string;
}): string {
  const payload: { [key: string]: string } = {
    instanceType: PARTY_CAVE_INSTANCE_TYPE,
    zoneTemplateId: params.zoneTemplateId !== undefined && params.zoneTemplateId.length > 0 ? params.zoneTemplateId : MATCH_CAVE_ZONE_ID,
    instanceId: params.instanceId,
    completionState: params.completionState,
    maxPlayers: String(CAVE_MATCH_MAX_PLAYERS),
    emptyTimeoutTicks: String(CAVE_EMPTY_TIMEOUT_TICKS),
    reconnectGraceTicks: String(CAVE_RECONNECT_GRACE_TICKS),
  };
  if (params.ownerPartyId !== undefined && params.ownerPartyId.length > 0) {
    payload.ownerPartyId = params.ownerPartyId;
  }
  if (params.ownerCharacterId !== undefined && params.ownerCharacterId.length > 0) {
    payload.ownerCharacterId = params.ownerCharacterId;
  }
  return nk.matchCreate(STARTER_ZONE_MODULE, payload);
}

function selectedCharacter(nk: nkruntime.Nakama, userId: string) {
  const ticket = readSelection(nk, userId);
  if (ticket === null || ticket.characterId.length === 0) {
    throw new Error("selection_required");
  }
  const character = readCharacter(nk, userId, ticket.characterId);
  if (character === null) {
    throw new Error("character_missing");
  }
  return character;
}

function allocateOwnedCave(nk: nkruntime.Nakama, userId: string, characterId: string) {
  const repo = accountCaveRepository(nk, userId);
  const party = resolvePartyForActor(nakamaPartyRepository(nk), userId, characterId);
  const ownerKind = party !== null ? "party" : "character";
  const ownerId = party !== null ? party.partyId : characterId;
  return findOrCreateOwnedCave(repo, {
    create: function (params) {
      return createCaveMatch(nk, params);
    },
    isRunning: function (matchId: string) {
      return nk.matchGet(matchId) !== null;
    },
    contentHash: contentHash,
    nowMs: Date.now(),
    newId: function () {
      return nk.uuidv4();
    },
    emptyTimeoutMs: emptyTimeoutMs(),
  }, {
    characterId: characterId,
    ownerKind: ownerKind,
    ownerId: ownerId,
    party: party,
  });
}

export function rpcFindOrCreateOwnedCave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    parseEmptyOrNpcPayload(payload);
    const character = selectedCharacter(nk, userId);
    const location = readActiveLocation(nk, userId, character.characterId);
    const reconnecting =
      location !== null &&
      location.instanceType === "party_cave" &&
      nk.matchGet(location.matchId) !== null;
    rejectIfGameplayClosed(nk, readEnvironment(ctx), ctx.env, reconnecting);
    const allocated = allocateOwnedCave(nk, userId, character.characterId);
    if (!allocated.ok || allocated.record === undefined) {
      throw new Error(allocated.code);
    }
    logger.info(formatOpsLog("cave_create", { user_id: userId, instance_id: allocated.record.instanceId }));
    return JSON.stringify({
      matchId: allocated.record.matchId,
      instanceId: allocated.record.instanceId,
      zoneId: allocated.record.zoneTemplateId,
      instanceType: PARTY_CAVE_INSTANCE_TYPE,
      protocolVersion: PROTOCOL_VERSION,
      contentHash: contentHash,
    });
  } catch (error) {
    const message = rpcFailureCode(error);
    logger.error("find_or_create_owned_cave rejected user_id=%s reason=%s", ctx.userId !== undefined ? ctx.userId : "", message);
    incrementCounter("transferFailures");
    return rpcFailurePayload(message);
  }
}

export function rpcRequestCaveEntry(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const parsed = parseEmptyOrNpcPayload(payload);
    rejectIfGameplayClosed(nk, readEnvironment(ctx), ctx.env, false);
    const character = selectedCharacter(nk, userId);
    const location = readActiveLocation(nk, userId, character.characterId);
    const npcId = parsed.npcId.length > 0 ? parsed.npcId : "npc.test_cave_portal";
    const party = resolvePartyForActor(nakamaPartyRepository(nk), userId, character.characterId);
    const zone = content.zones["zone.starter"];
    const npcs = zone.npcs.map(function (spawn) {
      return { id: spawn.npcId, npcId: spawn.npcId, x: spawn.x, y: spawn.y };
    });
    const gate = evaluateCaveEntry({
      accountUserId: userId,
      characterId: character.characterId,
      health: 1,
      x: character.position.x,
      y: character.position.y,
      npcId: npcId,
      npcs: npcs,
      interactionRange: content.player.interactionRange,
      npcById: npcDefinitionsFromContent(content.npcs),
      transferring: location !== null && location.transferState !== "idle",
      originInstanceType: location !== null ? location.instanceType : "public_world",
      contentHash: contentHash,
      expectedContentHash: contentHash,
      party: party,
    });
    if (!gate.ok) {
      throw new Error(gate.code);
    }
    const allocated = allocateOwnedCave(nk, userId, character.characterId);
    if (!allocated.ok || allocated.record === undefined) {
      throw new Error(allocated.code);
    }
    logger.info(formatOpsLog("cave_create", { user_id: userId, action: "request_cave_entry", instance_id: allocated.record.instanceId }));
    return JSON.stringify({
      matchId: allocated.record.matchId,
      instanceId: allocated.record.instanceId,
      zoneId: allocated.record.zoneTemplateId,
      instanceType: PARTY_CAVE_INSTANCE_TYPE,
      protocolVersion: PROTOCOL_VERSION,
      contentHash: contentHash,
    });
  } catch (error) {
    const message = rpcFailureCode(error);
    logger.error("request_cave_entry rejected user_id=%s reason=%s", ctx.userId !== undefined ? ctx.userId : "", message);
    return rpcFailurePayload(message);
  }
}

export function rpcRequestCaveExit(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    const parsed = parseEmptyOrNpcPayload(payload);
    const character = selectedCharacter(nk, userId);
    const location = readActiveLocation(nk, userId, character.characterId);
    if (location === null || location.instanceType !== "party_cave") {
      throw new Error("invalid_origin");
    }
    const npcId = parsed.npcId.length > 0 ? parsed.npcId : "npc.test_cave_exit";
    const caveZone = content.zones[CAVE_ZONE_ID];
    const npcs = caveZone.npcs.map(function (spawn) {
      return { id: spawn.npcId, npcId: spawn.npcId, x: spawn.x, y: spawn.y };
    });
    const gate = evaluateCaveExit({
      health: 1,
      x: location.position.x,
      y: location.position.y,
      npcId: npcId,
      npcs: npcs,
      interactionRange: content.player.interactionRange,
      npcById: npcDefinitionsFromContent(content.npcs),
      transferring: location.transferState !== "idle",
      originInstanceType: location.instanceType,
    });
    if (!gate.ok) {
      throw new Error(gate.code);
    }
    const publicMatchId = findOrCreateStarterZoneMatch(nk, logger);
    logger.info(formatOpsLog("zone_transfer", { user_id: userId, action: "request_cave_exit", match_id: publicMatchId }));
    return JSON.stringify({
      matchId: publicMatchId,
      zoneId: "zone.starter",
      instanceType: "public_world",
      protocolVersion: PROTOCOL_VERSION,
      contentHash: contentHash,
    });
  } catch (error) {
    const message = rpcFailureCode(error);
    logger.error("request_cave_exit rejected user_id=%s reason=%s", ctx.userId !== undefined ? ctx.userId : "", message);
    return rpcFailurePayload(message);
  }
}

export function assertCanEnterAllocatedCave(
  nk: nkruntime.Nakama,
  userId: string,
  characterId: string,
  instanceId: string,
): void {
  const repo = accountCaveRepository(nk, userId);
  const record = repo.getCave(instanceId);
  if (record === null) {
    throw new Error("cave_expired");
  }
  const party = resolvePartyForActor(nakamaPartyRepository(nk), userId, characterId);
  const allowed = canJoinOwnedCave({ characterId: characterId, record: record, party: party });
  if (!allowed.ok) {
    throw new Error(allowed.code);
  }
  const associated = associateCharacterWithCave(repo, characterId, instanceId);
  if (!associated.ok) {
    throw new Error(associated.code);
  }
}
