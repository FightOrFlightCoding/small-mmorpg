import { content, contentHash } from "../generated/content";
import { readCharacter, writeCharacterCheckpoint } from "./character_store";
import { readQuests, writeQuests } from "./quest_store";
import { readInventory, writeInventory, writeInventoryOnce } from "./inventory_store";
import { readEquipment, writeEquipment } from "./equipment_store";
import { commitQuestReward, readGold } from "./quest_reward_store";
import { validateJoinAttempt } from "../domain/join_validation";
import { applyMatchLoop, snapshotForOthers, type IncomingMatchData } from "../domain/match_loop";
import { PLAYER_RESPAWN_DELAY_SEC } from "../domain/combat";
import { questDefinitionsFromContent } from "../domain/quest";
import { initializeInventory, itemDefinitionsFromContent } from "../domain/inventory";
import {
  derivedAttack,
  loadEquipment,
} from "../domain/equipment";
import {
  MATCH_TICK_RATE,
  STARTER_ZONE_LABEL,
  addPlayer,
  buildFullState,
  createStarterZoneState,
  enemyDefinitionsFromContent,
  fullStateOpcode,
  type MatchPlayer,
  type StarterZoneState,
} from "../domain/match_state";
import { dict } from "../domain/maps";
import {
  applyPlayerLeave,
  checkpointsForTerminate,
  joinHealth,
  restoreGracePlayer,
  takeGracePlayer,
  type PositionCheckpoint,
} from "../domain/persistence";

export interface StarterMatchRuntimeState {
  zone: StarterZoneState;
  presences: { [userId: string]: nkruntime.Presence };
}

export function matchInit(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _params: { [key: string]: any },
): { state: StarterMatchRuntimeState; tickRate: number; label: string } {
  const zone = createStarterZoneState(
    contentHash,
    content.zones["zone.starter"],
    enemyDefinitionsFromContent(content.enemies),
    {
      id: content.player.id,
      maxHealth: content.player.maxHealth,
      moveSpeed: content.player.moveSpeed,
      interactionRange: content.player.interactionRange,
      attack: content.player.attack,
      attackRange: content.player.attackRange,
      attackCooldown: content.player.attackCooldown,
      respawnDelaySec: PLAYER_RESPAWN_DELAY_SEC,
      pickupRange: content.player.pickupRange,
    },
    questDefinitionsFromContent(content.quests),
    itemDefinitionsFromContent(content.items),
  );
  logger.info("starter_zone init label=%s content_hash=%s", STARTER_ZONE_LABEL, contentHash);
  return {
    state: { zone: zone, presences: {} },
    tickRate: MATCH_TICK_RATE,
    label: STARTER_ZONE_LABEL,
  };
}

export function matchJoinAttempt(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: StarterMatchRuntimeState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: any },
): { state: StarterMatchRuntimeState; accept: boolean; rejectMessage?: string } {
  state = hydrateRuntime(state);
  const meta: { [key: string]: string } = {};
  const keys = Object.keys(dict(metadata));
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    meta[key] = String(metadata[key]);
  }
  const alreadyJoined = Object.prototype.hasOwnProperty.call(state.zone.players, presence.userId);
  const existing = state.presences[presence.userId];
  const gate = validateJoinAttempt(
    state.zone,
    contentHash,
    meta,
    alreadyJoined,
    presence.sessionId,
    existing !== undefined ? existing.sessionId : "",
  );
  if (!gate.accept) {
    logger.info("starter_zone join rejected user_id=%s reason=%s", presence.userId, gate.rejectMessage);
    return { state: state, accept: false, rejectMessage: gate.rejectMessage };
  }
  const character = readCharacter(nk, presence.userId);
  if (character === null) {
    logger.info("starter_zone join rejected user_id=%s reason=character_missing", presence.userId);
    return { state: state, accept: false, rejectMessage: "character_missing" };
  }
  return { state: state, accept: true };
}

export function matchJoin(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  presences: nkruntime.Presence[],
): { state: StarterMatchRuntimeState } {
  state = hydrateRuntime(state);
  let zone = state.zone;
  const nextPresences: { [userId: string]: nkruntime.Presence } = {};
  const existing = Object.keys(state.presences);
  for (let i = 0; i < existing.length; i++) {
    nextPresences[existing[i]] = state.presences[existing[i]];
  }

  const joined: nkruntime.Presence[] = [];
  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    nextPresences[presence.userId] = presence;
    const character = readCharacter(nk, presence.userId);
    if (character === null) {
      dispatcher.matchKick([presence]);
      delete nextPresences[presence.userId];
      continue;
    }
    const existingLive = zone.players[presence.userId];
    if (existingLive !== undefined) {
      existingLive.sessionId = presence.sessionId;
      existingLive.username = presence.username;
      joined.push(presence);
      logger.info("starter_zone session resume user_id=%s", presence.userId);
      continue;
    }
    const inventory = loadPlayerInventory(nk, presence.userId);
    const loadedEquipment = loadEquipment(readEquipment(nk, presence.userId), inventory);
    if (loadedEquipment.persist) {
      writeEquipment(nk, presence.userId, loadedEquipment.equipment);
      logger.info("starter_zone reconcile equipment user_id=%s", presence.userId);
    }
    const derived = derivedAttack(
      content.player.attack,
      loadedEquipment.equipment,
      inventory,
      zone.itemsById,
    );
    const gold = readGold(nk, presence.userId);
    const questLog = readQuests(nk, presence.userId);
    const parked = takeGracePlayer(zone, presence.userId, tick);
    let player: MatchPlayer;
    if (parked !== null) {
      player = restoreGracePlayer(
        parked,
        presence.sessionId,
        presence.username,
        questLog,
        inventory,
        loadedEquipment.equipment,
        derived,
        gold,
      );
      logger.info("starter_zone grace rejoin user_id=%s", presence.userId);
    } else {
      player = {
        userId: presence.userId,
        sessionId: presence.sessionId,
        username: presence.username,
        characterId: character.characterId,
        name: character.name,
        x: character.position.x,
        y: character.position.y,
        maxHealth: content.player.maxHealth,
        health: joinHealth(content.player.maxHealth),
        lastProcessedSeq: 0,
        axisX: 0,
        axisY: 0,
        questLog: questLog,
        inventory: inventory,
        equipment: loadedEquipment.equipment,
        derivedAttack: derived,
        gold: gold,
        lastCheckpointTick: tick,
        lastCheckpointX: character.position.x,
        lastCheckpointY: character.position.y,
      };
      logger.info("starter_zone join user_id=%s character_id=%s", presence.userId, character.characterId);
    }
    zone = addPlayer(zone, player);
    joined.push(presence);
  }

  for (let i = 0; i < joined.length; i++) {
    const presence = joined[i];
    dispatcher.broadcastMessage(fullStateOpcode(), buildFullState(zone, tick, presence.userId), [presence], null, true);
  }
  if (joined.length > 0) {
    const snapshot = snapshotForOthers(zone, tick, "");
    const others = presencesNotIn(nextPresences, joined);
    if (others.length > 0) {
      dispatcher.broadcastMessage(snapshot.opcode, snapshot.body, others, null, true);
    }
  }

  return { state: { zone: zone, presences: nextPresences } };
}

export function matchLeave(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  presences: nkruntime.Presence[],
): { state: StarterMatchRuntimeState } {
  state = hydrateRuntime(state);
  let zone = state.zone;
  const nextPresences: { [userId: string]: nkruntime.Presence } = {};
  const existing = Object.keys(state.presences);
  for (let i = 0; i < existing.length; i++) {
    nextPresences[existing[i]] = state.presences[existing[i]];
  }
  for (let i = 0; i < presences.length; i++) {
    const presence = presences[i];
    const left = applyPlayerLeave(zone, presence.userId, tick);
    zone = left.state;
    if (left.checkpoint !== null) {
      writeCharacterCheckpoint(nk, left.checkpoint.userId, left.checkpoint.x, left.checkpoint.y);
      logger.info("starter_zone leave checkpoint user_id=%s", presence.userId);
    }
    delete nextPresences[presence.userId];
    logger.info("starter_zone leave user_id=%s", presence.userId);
  }
  const remaining = allPresences(nextPresences);
  if (remaining.length > 0) {
    const snapshot = snapshotForOthers(zone, tick, "");
    dispatcher.broadcastMessage(snapshot.opcode, snapshot.body, remaining, null, true);
  }
  return { state: { zone: zone, presences: nextPresences } };
}

export function matchLoop(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  messages: nkruntime.MatchMessage[],
): { state: StarterMatchRuntimeState } | null {
  state = hydrateRuntime(state);
  const incoming: IncomingMatchData[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    incoming.push({
      opcode: message.opCode,
      raw: nk.binaryToString(message.data),
      userId: message.sender.userId,
    });
  }
  const result = applyMatchLoop(state.zone, tick, contentHash, incoming, function () {
    return nk.uuidv4();
  }, function (request) {
    return commitQuestReward(nk, request);
  });
  for (let p = 0; p < result.persistQuests.length; p++) {
    const persist = result.persistQuests[p];
    writeQuests(nk, persist.userId, persist.log);
    logger.info("starter_zone persist quests user_id=%s", persist.userId);
  }
  for (let inv = 0; inv < result.persistInventories.length; inv++) {
    const persist = result.persistInventories[inv];
    writeInventory(nk, persist.userId, persist.inventory);
    logger.info("starter_zone persist inventory user_id=%s", persist.userId);
  }
  for (let eq = 0; eq < result.persistEquipment.length; eq++) {
    const persist = result.persistEquipment[eq];
    writeEquipment(nk, persist.userId, persist.equipment);
    logger.info("starter_zone persist equipment user_id=%s", persist.userId);
  }
  writeCheckpoints(nk, logger, result.persistCheckpoints);
  for (let r = 0; r < result.rejections.length; r++) {
    const rejected = result.rejections[r];
    logger.info(
      "match_action rejected user_id=%s action=%s reason=%s tick=%s",
      rejected.userId,
      rejected.action,
      rejected.code,
      String(rejected.tick),
    );
  }
  for (let i = 0; i < result.outbound.length; i++) {
    const out = result.outbound[i];
    const targets = resolveTargets(state.presences, out.toUserId, out.broadcastOthersFrom);
    if (targets !== null && targets.length === 0) {
      continue;
    }
    dispatcher.broadcastMessage(out.opcode, out.body, targets, null, true);
  }
  if (result.terminate) {
    logger.info("starter_zone empty timeout tick=%s", String(tick));
    return null;
  }
  return { state: { zone: result.state, presences: state.presences } };
}

export function matchTerminate(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  _tick: number,
  state: StarterMatchRuntimeState,
  _graceSeconds: number,
): { state: StarterMatchRuntimeState } {
  state = hydrateRuntime(state);
  writeCheckpoints(nk, logger, checkpointsForTerminate(state.zone));
  return { state: state };
}

export function matchSignal(
  _ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  _nk: nkruntime.Nakama,
  _dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: StarterMatchRuntimeState,
  _data: string,
): { state: StarterMatchRuntimeState; data: string } {
  state = hydrateRuntime(state);
  return {
    state: state,
    data: JSON.stringify({
      tick: tick,
      zoneId: state.zone.zoneId,
      playerCount: Object.keys(state.zone.players).length,
    }),
  };
}

function hydrateRuntime(state: StarterMatchRuntimeState): StarterMatchRuntimeState {
  const zone = state.zone;
  zone.players = dict(zone.players);
  zone.disconnected = dict(zone.disconnected);
  zone.actionRates = dict(zone.actionRates);
  return {
    zone: zone,
    presences: dict(state.presences),
  };
}

function writeCheckpoints(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  checkpoints: PositionCheckpoint[],
): void {
  for (let i = 0; i < checkpoints.length; i++) {
    const checkpoint = checkpoints[i];
    writeCharacterCheckpoint(nk, checkpoint.userId, checkpoint.x, checkpoint.y);
    logger.info("starter_zone persist checkpoint user_id=%s", checkpoint.userId);
  }
}

function presencesExcept(
  presences: { [userId: string]: nkruntime.Presence },
  userId: string,
): nkruntime.Presence[] {
  const list: nkruntime.Presence[] = [];
  const ids = Object.keys(presences);
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== userId) {
      list.push(presences[ids[i]]);
    }
  }
  return list;
}

function presencesNotIn(
  presences: { [userId: string]: nkruntime.Presence },
  exclude: nkruntime.Presence[],
): nkruntime.Presence[] {
  const skip: { [userId: string]: boolean } = {};
  for (let i = 0; i < exclude.length; i++) {
    skip[exclude[i].userId] = true;
  }
  const list: nkruntime.Presence[] = [];
  const ids = Object.keys(presences);
  for (let i = 0; i < ids.length; i++) {
    if (!skip[ids[i]]) {
      list.push(presences[ids[i]]);
    }
  }
  return list;
}

function loadPlayerInventory(nk: nkruntime.Nakama, userId: string) {
  const existing = readInventory(nk, userId);
  const loaded = initializeInventory(existing, function () {
    return nk.uuidv4();
  });
  if (loaded.created) {
    writeInventoryOnce(nk, userId, loaded.inventory);
  }
  return loaded.inventory;
}

function allPresences(presences: { [userId: string]: nkruntime.Presence }): nkruntime.Presence[] {
  const list: nkruntime.Presence[] = [];
  const ids = Object.keys(presences);
  for (let i = 0; i < ids.length; i++) {
    list.push(presences[ids[i]]);
  }
  return list;
}

function resolveTargets(
  presences: { [userId: string]: nkruntime.Presence },
  toUserId?: string,
  broadcastOthersFrom?: string,
): nkruntime.Presence[] | null {
  if (toUserId !== undefined) {
    const presence = presences[toUserId];
    return presence !== undefined ? [presence] : [];
  }
  if (broadcastOthersFrom !== undefined && broadcastOthersFrom.length > 0) {
    return presencesExcept(presences, broadcastOthersFrom);
  }
  return null;
}

export const starterZoneMatchHandler: nkruntime.MatchHandler<StarterMatchRuntimeState> = {
  matchInit: matchInit,
  matchJoinAttempt: matchJoinAttempt,
  matchJoin: matchJoin,
  matchLeave: matchLeave,
  matchLoop: matchLoop,
  matchTerminate: matchTerminate,
  matchSignal: matchSignal,
};
