import { requirePlayableUser } from "../nakama/playable_account";
import { rpcFailureCode, rpcFailurePayload } from "../domain/rpc_error";
import {
  applyGmToMatch,
  isGmAuthorized,
  makeGmAudit,
  parseGmCommandPayload,
  resolveGmZoneTemplateId,
  type GmAccount,
  type GmApplyResult,
  type GmCommandRequest,
} from "../domain/gm";
import { emptyInventory, itemDefinitionsFromContent } from "../domain/inventory";
import { questDefinitionsFromContent } from "../domain/quest";
import { catalogFromContent } from "../domain/stats";
import { initializeProgression } from "../domain/progression";
import { cancelTrade, cloneTradeRecord } from "../domain/trade";
import { TX_REASON_ADMIN_GRANT } from "../domain/transaction";
import { getPartyState, type PartyActor } from "../domain/party";
import {
  findOrCreateOwnedCave,
  resolvePartyForActor,
  emptyTimeoutMs,
} from "../domain/cave";
import { issueTransferTicket } from "../domain/transfer";
import { publicWorldLocation } from "../domain/instance";
import { withTransferState } from "../domain/location";
import { content, contentHash } from "../generated/content";
import { STARTER_ZONE_ID, type MatchPlayer, type StarterZoneState } from "../domain/match_state";
import { createCaveMatch } from "./cave";
import { accountCaveRepository } from "../nakama/cave_store";
import { readCharacter, writeCharacterCheckpoint } from "../nakama/character_store";
import { readRoster } from "../nakama/roster_store";
import { readActiveLocation, writeActiveLocation } from "../nakama/location_store";
import { readInventory, writeInventory } from "../nakama/inventory_store";
import { readProgression, writeProgression } from "../nakama/progression_store";
import { readQuests, writeQuests } from "../nakama/quest_store";
import { commitTransaction, readGold } from "../nakama/transaction_store";
import { nakamaPartyRepository } from "../nakama/party_store";
import { nakamaTransferRepository } from "../nakama/transfer_store";
import { readTrade, readTradeAudit, readTradeIndex, writeTrade } from "../nakama/trade_store";
import {
  readGmAllowlist,
  readGmCommandResult,
  readRecentGmAudits,
  writeGmAudit,
} from "../nakama/gm_store";
import { findOrCreateStarterZoneMatch, readStarterZoneMatchId } from "../nakama/starter_zone_registry";

export const GM_COMMAND_RPC_ID = "gm_command";

export function rpcGmCommand(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    const userId = requirePlayableUser(ctx, nk);
    let request: GmCommandRequest;
    try {
      request = parseGmCommandPayload(payload);
    } catch (error) {
      const message = rpcFailureCode(error);
      logger.info("gm_command rejected user_id=%s reason=%s", userId, message);
      return rpcFailurePayload(message);
    }
    const allowlist = readGmAllowlist(nk);
    const account = gmAccountFromNakama(userId, nk.accountGetId(userId));
    if (!isGmAuthorized(allowlist, account)) {
      const code = allowlist.enabled === true ? "unauthorized" : "gm_disabled";
      recordAudit(nk, userId, request, Date.now(), code, nk.uuidv4());
      logger.info("gm_command rejected user_id=%s reason=%s", userId, code);
      return rpcFailurePayload(code);
    }
    const nowMs = Date.now();
    const auditId = nk.uuidv4();
    try {
      const outcome = dispatchGm(nk, logger, userId, request, nowMs);
      recordAudit(nk, userId, request, nowMs, outcome.code, auditId);
      logger.info(
        "gm_command user_id=%s character_id=%s command=%s code=%s",
        userId,
        request.characterId,
        request.command,
        outcome.code,
      );
      return JSON.stringify({
        ok: outcome.ok,
        code: outcome.code,
        command: request.command,
        characterId: request.characterId,
        result: outcome.result,
      });
    } catch (error) {
      const message = rpcFailureCode(error);
      recordAudit(nk, userId, request, nowMs, message, auditId);
      logger.info("gm_command rejected user_id=%s reason=%s", userId, message);
      return rpcFailurePayload(message);
    }
  } catch (error) {
    return rpcFailurePayload(error);
  }
}

function dispatchGm(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  administratorUser: string,
  request: GmCommandRequest,
  nowMs: number,
): { ok: boolean; code: string; result: { [key: string]: unknown } } {
  if (request.command === "view_recent_transaction_audit") {
    return viewAudit(nk, administratorUser, request);
  }
  const target = resolveTargetAccount(nk, administratorUser, request.characterId);
  if (request.command === "open_cave") {
    if (target === null) {
      return { ok: false, code: "character_missing", result: {} };
    }
    return openCave(nk, logger, target, request, nowMs);
  }
  const live = signalLiveMatches(nk, logger, administratorUser, request, target);
  if (live !== null && live.code !== "character_missing") {
    return live;
  }
  if (target === null) {
    return { ok: false, code: "character_missing", result: {} };
  }
  return applyOffline(nk, logger, target, request, nowMs);
}

function signalLiveMatches(
  nk: nkruntime.Nakama,
  _logger: nkruntime.Logger,
  administratorUser: string,
  request: GmCommandRequest,
  target: { userId: string; characterId: string } | null,
): { ok: boolean; code: string; result: { [key: string]: unknown } } | null {
  const payload: { [key: string]: unknown } = {
    type: "gm_command",
    administratorUser: administratorUser,
    command: request.command,
    reason: request.reason,
    characterId: request.characterId,
    requestId: request.requestId,
  };
  copyOptional(payload, request);
  const publicMatchId = readStarterZoneMatchId(nk);
  const fromPublic = signalMatch(nk, publicMatchId, payload);
  if (fromPublic !== null && fromPublic.code !== "character_missing") {
    return fromPublic;
  }
  if (target === null) {
    return fromPublic;
  }
  const location = readActiveLocation(nk, target.userId, target.characterId);
  if (location === null || location.matchId.length === 0 || location.matchId === publicMatchId) {
    return fromPublic;
  }
  const fromLocated = signalMatch(nk, location.matchId, payload);
  return fromLocated !== null ? fromLocated : fromPublic;
}

function signalMatch(
  nk: nkruntime.Nakama,
  matchId: string | null,
  payload: { [key: string]: unknown },
): { ok: boolean; code: string; result: { [key: string]: unknown } } | null {
  if (matchId === null || matchId.length === 0) {
    return null;
  }
  try {
    if (nk.matchGet(matchId) === null) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    nk.matchSignal(matchId, JSON.stringify(payload));
  } catch {
    return null;
  }
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  return readGmCommandResult(nk, requestId);
}

function applyOffline(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  target: { userId: string; characterId: string },
  request: GmCommandRequest,
  nowMs: number,
): { ok: boolean; code: string; result: { [key: string]: unknown } } {
  if (request.command === "spawn_enemy" || request.command === "kill_enemy") {
    return { ok: false, code: "not_in_match", result: {} };
  }
  const character = readCharacter(nk, target.userId, target.characterId);
  if (character === null) {
    return { ok: false, code: "character_missing", result: {} };
  }
  if (request.command === "inspect_party") {
    const actor: PartyActor = {
      accountUserId: target.userId,
      characterId: target.characterId,
      displayName: character.name,
    };
    const party = getPartyState(nakamaPartyRepository(nk), actor, nowMs);
    return {
      ok: true,
      code: "ok",
      result: { party: party.party !== undefined ? party.party : null },
    };
  }
  if (request.command === "cancel_trade") {
    return cancelStoredTrade(nk, target, request);
  }
  if (request.command === "repair_invalid_location") {
    const matchId = findOrCreateStarterZoneMatch(nk, logger);
    writeActiveLocation(
      nk,
      publicWorldLocation(matchId, target.characterId, target.userId, character.position.x, character.position.y, nowMs),
    );
    return { ok: true, code: "ok", result: { zoneTemplateId: STARTER_ZONE_ID } };
  }
  if (request.command === "teleport_character") {
    const x = request.x;
    const y = request.y;
    if (typeof x !== "number" || typeof y !== "number") {
      return { ok: false, code: "invalid_position", result: {} };
    }
    writeCharacterCheckpoint(nk, target.userId, x, y, target.characterId);
    const location = readActiveLocation(nk, target.userId, target.characterId);
    if (location !== null) {
      writeActiveLocation(nk, {
        instanceType: location.instanceType,
        zoneTemplateId: location.zoneTemplateId,
        instanceId: location.instanceId,
        matchId: location.matchId,
        position: { x: x, y: y },
        characterId: location.characterId,
        accountUserId: location.accountUserId,
        selectionTicketId: location.selectionTicketId,
        lastCheckpointAt: nowMs,
        transferState: location.transferState,
        schemaVersion: location.schemaVersion,
      });
    }
    return { ok: true, code: "ok", result: { x: x, y: y } };
  }
  const player = playerFromStorage(nk, target, character);
  const catalog = catalogFromContent(content);
  const dummy = {
    collisions: [],
    walkableBounds: { x: 0, y: 0, width: 10000, height: 10000 },
    playerSpawnX: character.position.x,
    playerSpawnY: character.position.y,
    enemies: [],
    enemiesById: {},
    questsById: questDefinitionsFromContent(content.quests),
    itemsById: itemDefinitionsFromContent(content.items),
    progressionCatalog: catalog,
    trades: {},
    partyByCharacterId: {},
    players: {},
  };
  const applied = applyGmToMatch(
    dummy as unknown as StarterZoneState,
    player,
    request,
    nowMs,
    0,
    itemDefinitionsFromContent(content.items),
    questDefinitionsFromContent(content.quests),
    startingAbilitiesFromContent(player.classId !== undefined ? player.classId : ""),
  );
  persistApply(nk, logger, player, applied, request.requestId, nowMs);
  return { ok: applied.ok, code: applied.code, result: applied.result };
}

function openCave(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  target: { userId: string; characterId: string },
  request: GmCommandRequest,
  nowMs: number,
): { ok: boolean; code: string; result: { [key: string]: unknown } } {
  const zones = content.zones as { [id: string]: unknown };
  const zoneTemplateId = resolveGmZoneTemplateId(request.zoneTemplateId, zones);
  const party = resolvePartyForActor(nakamaPartyRepository(nk), target.userId, target.characterId);
  const allocated = findOrCreateOwnedCave(
    accountCaveRepository(nk, target.userId),
    {
      create: function (params) {
        return createCaveMatch(nk, params);
      },
      isRunning: function (matchId: string) {
        return nk.matchGet(matchId) !== null;
      },
      contentHash: contentHash,
      nowMs: nowMs,
      newId: function () {
        return nk.uuidv4();
      },
      emptyTimeoutMs: emptyTimeoutMs(),
    },
    {
      characterId: target.characterId,
      ownerKind: party !== null ? "party" : "character",
      ownerId: party !== null ? party.partyId : target.characterId,
      party: party,
      zoneTemplateId: zoneTemplateId,
    },
  );
  if (!allocated.ok || allocated.record === undefined) {
    return { ok: false, code: allocated.code, result: {} };
  }
  const origin = readActiveLocation(nk, target.userId, target.characterId);
  const originMatchId = origin !== null ? origin.matchId : findOrCreateStarterZoneMatch(nk, logger);
  const ticket = issueTransferTicket({
    ticketId: nk.uuidv4(),
    characterId: target.characterId,
    accountUserId: target.userId,
    originMatchId: originMatchId,
    destinationMatchId: allocated.record.matchId,
    destinationInstanceId: allocated.record.instanceId,
    nowMs: nowMs,
  });
  nakamaTransferRepository(nk).putTicket(ticket);
  const location =
    origin !== null
      ? origin
      : publicWorldLocation(originMatchId, target.characterId, target.userId, 0, 0, nowMs);
  writeActiveLocation(nk, withTransferState(location, "issued", nowMs));
  const signaled = signalLiveMatches(nk, logger, target.userId, request, target);
  if (signaled !== null && signaled.code === "character_missing") {
    // Character is offline; ticket is still valid for the next join.
  }
  return {
    ok: true,
    code: "ok",
    result: {
      ticketId: ticket.ticketId,
      destinationMatchId: ticket.destinationMatchId,
      destinationInstanceId: ticket.destinationInstanceId,
      originMatchId: ticket.originMatchId,
      zoneId: allocated.record.zoneTemplateId,
      instanceType: "party_cave",
      ticket_id: ticket.ticketId,
      destination_match_id: ticket.destinationMatchId,
    },
  };
}

function viewAudit(
  nk: nkruntime.Nakama,
  administratorUser: string,
  request: GmCommandRequest,
): { ok: boolean; code: string; result: { [key: string]: unknown } } {
  const gm = readRecentGmAudits(nk, 20);
  const target = resolveTargetAccount(nk, administratorUser, request.characterId);
  let trade: { [key: string]: unknown } | null = null;
  let gold = 0;
  if (target !== null) {
    trade = readTradeAudit(nk, target.userId, target.characterId);
    gold = readGold(nk, target.userId);
  }
  return {
    ok: true,
    code: "ok",
    result: { gm: gm, trade: trade, gold: gold },
  };
}

function cancelStoredTrade(
  nk: nkruntime.Nakama,
  target: { userId: string; characterId: string },
  request: GmCommandRequest,
): { ok: boolean; code: string; result: { [key: string]: unknown } } {
  const indexed = readTradeIndex(nk, target.userId, target.characterId);
  const tradeId = request.tradeId !== undefined && request.tradeId.length > 0 ? request.tradeId : indexed;
  if (tradeId.length === 0) {
    return { ok: false, code: "trade_missing", result: {} };
  }
  const found = readTrade(nk, tradeId);
  if (found === null) {
    return { ok: false, code: "trade_missing", result: {} };
  }
  const decision = cancelTrade(found, "cancelled", request.requestId);
  writeTrade(nk, cloneTradeRecord(decision.trade));
  return { ok: decision.ok, code: decision.code, result: { tradeId: decision.trade.tradeId, state: decision.trade.state } };
}

function persistApply(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  player: MatchPlayer,
  applied: GmApplyResult,
  requestId: string,
  nowMs: number,
): void {
  if (applied.persistInventory && player.inventory !== undefined) {
    writeInventory(nk, player.userId, player.inventory, player.characterId);
  }
  if (applied.persistProgression && player.progression !== undefined) {
    writeProgression(nk, player.userId, player.progression, player.characterId);
  }
  if (applied.persistQuests && player.questLog !== undefined) {
    writeQuests(nk, player.userId, player.questLog, player.characterId);
  }
  if (applied.goldDelta !== 0) {
    const committed = commitTransaction(nk, {
      requestId: requestId,
      characterId: player.characterId,
      userId: player.userId,
      reasonType: TX_REASON_ADMIN_GRANT,
      reasonId: requestId,
      goldDelta: applied.goldDelta,
      currentGold: player.gold !== undefined ? player.gold : 0,
    });
    if (committed.ok) {
      player.gold = committed.gold;
    }
  }
  if (applied.repairLocation) {
    const matchId = findOrCreateStarterZoneMatch(nk, logger);
    writeActiveLocation(nk, publicWorldLocation(matchId, player.characterId, player.userId, player.x, player.y, nowMs));
  }
}

function playerFromStorage(
  nk: nkruntime.Nakama,
  target: { userId: string; characterId: string },
  character: { name: string; classId?: string; position: { x: number; y: number } },
): MatchPlayer {
  const classId = character.classId !== undefined ? character.classId : "";
  const catalog = catalogFromContent(content);
  const existingProgression = readProgression(nk, target.userId, target.characterId);
  const inventory = readInventory(nk, target.userId, target.characterId);
  return {
    userId: target.userId,
    sessionId: "",
    username: "",
    characterId: target.characterId,
    name: character.name,
    classId: classId,
    x: character.position.x,
    y: character.position.y,
    maxHealth: 1,
    health: 1,
    lastProcessedSeq: 0,
    axisX: 0,
    axisY: 0,
    questLog: readQuests(nk, target.userId, target.characterId),
    inventory: inventory !== null ? inventory : emptyInventory(),
    progression: existingProgression !== null ? existingProgression : initializeProgression(catalog, classId),
    gold: readGold(nk, target.userId),
  };
}

function resolveTargetAccount(
  nk: nkruntime.Nakama,
  administratorUser: string,
  characterId: string,
): { userId: string; characterId: string } | null {
  if (administratorUser.length > 0) {
    const roster = readRoster(nk, administratorUser);
    if (roster !== null && roster.characterIds.indexOf(characterId) !== -1) {
      return { userId: administratorUser, characterId: characterId };
    }
    const own = readCharacter(nk, administratorUser, characterId);
    if (own !== null) {
      return { userId: administratorUser, characterId: characterId };
    }
  }
  return null;
}

function startingAbilitiesFromContent(classId: string): string[] {
  const classes = content.classes as { [id: string]: { startingAbilities?: readonly string[] } };
  const row = classes[classId];
  if (row === undefined || row.startingAbilities === undefined) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < row.startingAbilities.length; i++) {
    out.push(row.startingAbilities[i]);
  }
  return out;
}

function gmAccountFromNakama(userId: string, account: nkruntime.Account): GmAccount {
  const row = account as unknown as { [key: string]: unknown };
  const customId = typeof row.customId === "string" ? row.customId : typeof row.custom_id === "string" ? row.custom_id : "";
  const email = typeof account.email === "string" ? account.email : typeof row.email === "string" ? row.email : "";
  const out: GmAccount = { userId: userId };
  if (customId.length > 0) {
    out.customId = customId;
  }
  if (email.length > 0) {
    out.email = email;
  }
  return out;
}

function recordAudit(
  nk: nkruntime.Nakama,
  administratorUser: string,
  request: GmCommandRequest,
  timestamp: number,
  result: string,
  auditId: string,
): void {
  writeGmAudit(
    nk,
    makeGmAudit({
      administratorUser: administratorUser,
      targetCharacter: request.characterId,
      command: request.command,
      reason: request.reason,
      timestamp: timestamp,
      result: result,
      requestId: request.requestId,
    }),
    auditId,
  );
}

function copyOptional(payload: { [key: string]: unknown }, request: GmCommandRequest): void {
  if (request.x !== undefined) {
    payload.x = request.x;
  }
  if (request.y !== undefined) {
    payload.y = request.y;
  }
  if (request.itemId !== undefined) {
    payload.itemId = request.itemId;
  }
  if (request.quantity !== undefined) {
    payload.quantity = request.quantity;
  }
  if (request.amount !== undefined) {
    payload.amount = request.amount;
  }
  if (request.questId !== undefined) {
    payload.questId = request.questId;
  }
  if (request.status !== undefined) {
    payload.status = request.status;
  }
  if (request.stageIndex !== undefined) {
    payload.stageIndex = request.stageIndex;
  }
  if (request.spawnId !== undefined) {
    payload.spawnId = request.spawnId;
  }
  if (request.enemyInstanceId !== undefined) {
    payload.enemyInstanceId = request.enemyInstanceId;
  }
  if (request.zoneTemplateId !== undefined) {
    payload.zoneTemplateId = request.zoneTemplateId;
  }
  if (request.tradeId !== undefined) {
    payload.tradeId = request.tradeId;
  }
}
