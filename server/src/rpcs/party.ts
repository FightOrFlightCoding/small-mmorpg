import { readCharacter } from "../nakama/character_store";
import { readRoster } from "../nakama/roster_store";
import { readNameReservation } from "../nakama/name_reservation_store";
import { nakamaPartyRepository } from "../nakama/party_store";
import { readStarterZoneMatchId } from "../nakama/starter_zone_registry";
import { canonicalCharacterName } from "../domain/character_name";
import {
  acceptPartyInvite,
  createParty,
  declinePartyInvite,
  disbandParty,
  getPartyState,
  inviteToParty,
  kickPartyMember,
  leaveParty,
  markPartyConnection,
  optionalRevision,
  parsePartyRpcPayload,
  promotePartyLeader,
  partyDomainFailureCode,
  publicPartyState,
  type PartyActor,
  type PartyOpResult,
} from "../domain/party";

function rpcError(logger: nkruntime.Logger, userId: string | undefined, action: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "internal_error";
  logger.error("%s rejected user_id=%s action=%s reason=%s", action, userId !== undefined ? userId : "", action, message);
  throw error instanceof Error ? error : new Error(message);
}

function requireUser(ctx: nkruntime.Context): string {
  if (typeof ctx.userId !== "string" || ctx.userId.length === 0) {
    throw new Error("unauthenticated");
  }
  return ctx.userId;
}

function actorFromOwnedCharacter(nk: nkruntime.Nakama, userId: string, characterId: string): PartyActor {
  const roster = readRoster(nk, userId);
  if (roster === null || roster.characterIds.indexOf(characterId) === -1) {
    throw new Error("character_missing");
  }
  const record = readCharacter(nk, userId, characterId);
  if (record === null) {
    throw new Error("character_missing");
  }
  if (record.accountUserId !== undefined && record.accountUserId.length > 0 && record.accountUserId !== userId) {
    throw new Error("selection_foreign");
  }
  return {
    accountUserId: userId,
    characterId: record.characterId,
    displayName: record.name,
  };
}

function resolveTarget(nk: nkruntime.Nakama, data: { [key: string]: unknown }): PartyActor {
  const targetName = typeof data.targetName === "string" ? data.targetName : "";
  if (targetName.length === 0) {
    throw new Error("invalid_target");
  }
  const reservation = readNameReservation(nk, canonicalCharacterName(targetName));
  if (reservation === null) {
    throw new Error("invalid_target");
  }
  if (
    typeof data.targetCharacterId === "string" &&
    data.targetCharacterId.length > 0 &&
    data.targetCharacterId !== reservation.characterId
  ) {
    throw new Error("invalid_target");
  }
  return {
    accountUserId: reservation.accountUserId,
    characterId: reservation.characterId,
    displayName: reservation.canonicalName,
  };
}

function encodeResult(result: PartyOpResult, actor: PartyActor): string {
  const body: { [key: string]: unknown } = {
    ok: result.ok,
    code: result.code,
    replay: result.replay === true,
    deleted: result.deleted === true,
  };
  if (result.party !== undefined) {
    body.party = publicPartyState(result.party, actor.characterId);
  }
  if (result.systemMessage !== undefined) {
    body.systemMessage = result.systemMessage;
  }
  if (result.eventType !== undefined) {
    body.eventType = result.eventType;
  }
  return JSON.stringify(body);
}

function signalMatch(nk: nkruntime.Nakama, result: PartyOpResult, actor: PartyActor): void {
  const matchId = readStarterZoneMatchId(nk);
  if (matchId === null) {
    return;
  }
  const payload: { [key: string]: unknown } = {
    type: result.deleted === true ? "party_disbanded" : "party_update",
    characterId: actor.characterId,
    accountUserId: actor.accountUserId,
  };
  if (result.systemMessage !== undefined) {
    payload.systemMessage = result.systemMessage;
  }
  const signaledPartyId =
    result.party !== undefined ? result.party.partyId : result.partyId !== undefined ? result.partyId : "";
  if (signaledPartyId.length > 0) {
    payload.partyId = signaledPartyId;
  }
  if (result.party !== undefined) {
    payload.party = publicPartyState(result.party, actor.characterId);
    payload.partyId = result.party.partyId;
    payload.revision = result.party.revision;
    payload.eventType = result.eventType !== undefined ? result.eventType : "updated";
    payload.leaderCharacterId = result.party.leaderCharacterId;
    payload.lootPolicy = result.party.lootPolicy;
    const members: { [key: string]: unknown }[] = [];
    for (let i = 0; i < result.party.members.length; i++) {
      const member = result.party.members[i];
      members.push({
        accountUserId: member.accountUserId,
        characterId: member.characterId,
        displayName: member.displayName,
        connectionState: member.connectionState,
      });
    }
    payload.members = members;
    const pending: { [key: string]: unknown }[] = [];
    for (let i = 0; i < result.party.invites.length; i++) {
      const invite = result.party.invites[i];
      pending.push({
        characterId: invite.targetCharacterId,
        partyId: result.party.partyId,
        fromDisplayName: inviteFromDisplayName(result.party, invite.invitedByCharacterId),
        expiresAt: invite.expiresAt,
      });
    }
    payload.pendingInvites = pending;
  }
  try {
    nk.matchSignal(matchId, JSON.stringify(payload));
  } catch {
    return;
  }
}

function runPartyRpc(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
  action: string,
  allowedKeys: string[],
  requireRequestId: boolean,
  apply: (actor: PartyActor, data: { [key: string]: unknown }, nowMs: number, requestId: string) => PartyOpResult,
): string {
  try {
    const userId = requireUser(ctx);
    const data = parsePartyRpcPayload(payload, allowedKeys, requireRequestId);
    const actor = actorFromOwnedCharacter(nk, userId, String(data.characterId));
    const requestId = typeof data.requestId === "string" ? data.requestId : "req-getst";
    const result = apply(actor, data, Date.now(), requestId);
    if (result.deleted === true || (result.ok && action !== "party_get_state")) {
      signalMatch(nk, result, actor);
    }
    logger.info("party rpc=%s user_id=%s code=%s", action, userId, result.code);
    return encodeResult(result, actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    const domainCode = partyDomainFailureCode(message);
    if (domainCode.length > 0) {
      logger.info("party rpc=%s user_id=%s code=%s", action, ctx.userId !== undefined ? ctx.userId : "", domainCode);
      return JSON.stringify({ ok: false, code: domainCode });
    }
    return rpcError(logger, ctx.userId, action, error);
  }
}

function inviteFromDisplayName(party: { members: { characterId: string; displayName: string }[] }, characterId: string): string {
  for (let i = 0; i < party.members.length; i++) {
    if (party.members[i].characterId === characterId) {
      return party.members[i].displayName;
    }
  }
  return characterId;
}

export function rpcPartyCreate(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(ctx, logger, nk, payload, "party_create", ["characterId", "requestId"], true, function (actor, _data, nowMs, requestId) {
    return createParty(nakamaPartyRepository(nk), actor, nowMs, "p_" + nk.uuidv4().split("-").join(""), requestId);
  });
}

export function rpcPartyInvite(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_invite",
    ["characterId", "requestId", "targetCharacterId", "targetName", "revision"],
    true,
    function (actor, data, nowMs, requestId) {
      const target = resolveTarget(nk, data);
      return inviteToParty(nakamaPartyRepository(nk), actor, target, nowMs, requestId, optionalRevision(data));
    },
  );
}

export function rpcPartyAccept(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_accept",
    ["characterId", "requestId", "partyId", "revision"],
    true,
    function (actor, data, nowMs, requestId) {
      if (typeof data.partyId !== "string" || data.partyId.length === 0) {
        throw new Error("invalid_id");
      }
      return acceptPartyInvite(nakamaPartyRepository(nk), actor, data.partyId, nowMs, requestId, optionalRevision(data));
    },
  );
}

export function rpcPartyDecline(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_decline",
    ["characterId", "requestId", "partyId"],
    true,
    function (actor, data, nowMs, requestId) {
      if (typeof data.partyId !== "string" || data.partyId.length === 0) {
        throw new Error("invalid_id");
      }
      return declinePartyInvite(nakamaPartyRepository(nk), actor, data.partyId, nowMs, requestId);
    },
  );
}

export function rpcPartyLeave(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_leave",
    ["characterId", "requestId", "revision"],
    true,
    function (actor, data, nowMs, requestId) {
      return leaveParty(nakamaPartyRepository(nk), actor, nowMs, requestId, optionalRevision(data));
    },
  );
}

export function rpcPartyKick(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_kick",
    ["characterId", "requestId", "targetCharacterId", "revision"],
    true,
    function (actor, data, nowMs, requestId) {
      if (typeof data.targetCharacterId !== "string" || data.targetCharacterId.length === 0) {
        throw new Error("invalid_target");
      }
      return kickPartyMember(
        nakamaPartyRepository(nk),
        actor,
        data.targetCharacterId,
        nowMs,
        requestId,
        optionalRevision(data),
      );
    },
  );
}

export function rpcPartyPromote(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_promote",
    ["characterId", "requestId", "targetCharacterId", "revision"],
    true,
    function (actor, data, nowMs, requestId) {
      if (typeof data.targetCharacterId !== "string" || data.targetCharacterId.length === 0) {
        throw new Error("invalid_target");
      }
      return promotePartyLeader(
        nakamaPartyRepository(nk),
        actor,
        data.targetCharacterId,
        nowMs,
        requestId,
        optionalRevision(data),
      );
    },
  );
}

export function rpcPartyDisband(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(
    ctx,
    logger,
    nk,
    payload,
    "party_disband",
    ["characterId", "requestId", "revision"],
    true,
    function (actor, data, nowMs, requestId) {
      return disbandParty(nakamaPartyRepository(nk), actor, nowMs, requestId, optionalRevision(data));
    },
  );
}

export function rpcPartyGetState(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  return runPartyRpc(ctx, logger, nk, payload, "party_get_state", ["characterId"], false, function (actor, _data, nowMs) {
    return getPartyState(nakamaPartyRepository(nk), actor, nowMs);
  });
}

export function markPartyOnline(nk: nkruntime.Nakama, actor: PartyActor, nowMs: number): void {
  markPartyConnection(nakamaPartyRepository(nk), actor, nowMs, "online");
}

export function markPartyDisconnectGrace(nk: nkruntime.Nakama, actor: PartyActor, nowMs: number): void {
  markPartyConnection(nakamaPartyRepository(nk), actor, nowMs, "disconnect_grace");
}
