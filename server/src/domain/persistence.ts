import { cloneEquipment, type PlayerEquipment } from "./equipment";
import { cloneInventory, type PlayerInventory } from "./inventory";
import { dict } from "./maps";
import {
  cloneStarterZoneState,
  playerCount,
  type MatchPlayer,
  type StarterZoneState,
} from "./match_state";
import { cloneQuestLog, type QuestLog } from "./quest";

export const CHECKPOINT_INTERVAL_SEC = 5;
export const CHECKPOINT_INTERVAL_TICKS = 50;
export const RECONNECT_GRACE_SEC = 5;
export const RECONNECT_GRACE_TICKS = 50;
export const REQUEST_ID_TTL_SEC = 600;
export const REQUEST_ID_TTL_TICKS = 6000;

export interface PositionCheckpoint {
  userId: string;
  characterId: string;
  x: number;
  y: number;
}

export interface PlayerLeaveResult {
  state: StarterZoneState;
  checkpoint: PositionCheckpoint | null;
}

export interface RequestHistoryPrune {
  questsChanged: boolean;
  inventoryChanged: boolean;
  equipmentChanged: boolean;
}

export function joinHealth(maxHealth: number): number {
  return maxHealth;
}

export function applyPlayerLeave(state: StarterZoneState, userId: string, tick: number): PlayerLeaveResult {
  const player = dict(state.players)[userId];
  if (player === undefined) {
    return { state: state, checkpoint: null };
  }
  const next = cloneStarterZoneState(state);
  const parked = next.players[userId];
  delete next.players[userId];
  next.disconnected[userId] = {
    player: parked,
    expiresAtTick: tick + RECONNECT_GRACE_TICKS,
  };
  if (playerCount(next) === 0) {
    next.emptyTicks = 0;
  }
  return {
    state: next,
    checkpoint: { userId: userId, characterId: parked.characterId, x: parked.x, y: parked.y },
  };
}

export function expireDisconnected(state: StarterZoneState, tick: number): void {
  state.disconnected = dict(state.disconnected);
  const ids = Object.keys(state.disconnected);
  for (let i = 0; i < ids.length; i++) {
    const userId = ids[i];
    const parked = state.disconnected[userId];
    if (parked == null || parked.expiresAtTick <= tick) {
      delete state.disconnected[userId];
    }
  }
}

export function takeGracePlayer(state: StarterZoneState, userId: string, tick: number): MatchPlayer | null {
  state.disconnected = dict(state.disconnected);
  const parked = state.disconnected[userId];
  if (parked === undefined) {
    return null;
  }
  if (parked.expiresAtTick <= tick) {
    delete state.disconnected[userId];
    return null;
  }
  delete state.disconnected[userId];
  return parked.player;
}

export function lastProcessedSeqForSession(
  previousSessionId: string,
  joiningSessionId: string,
  lastProcessedSeq: number,
): number {
  if (joiningSessionId !== "" && joiningSessionId === previousSessionId) {
    return lastProcessedSeq;
  }
  return 0;
}

export function bindJoiningSession(player: MatchPlayer, sessionId: string, username: string): void {
  if (player.sessionId !== sessionId) {
    player.lastProcessedSeq = 0;
    player.axisX = 0;
    player.axisY = 0;
  }
  player.sessionId = sessionId;
  player.username = username;
}

export function restoreGracePlayer(
  parked: MatchPlayer,
  sessionId: string,
  username: string,
  questLog: QuestLog,
  inventory: PlayerInventory,
  equipment: PlayerEquipment,
  derivedAttack: number,
  gold: number,
): MatchPlayer {
  return {
    userId: parked.userId,
    sessionId: sessionId,
    username: username,
    characterId: parked.characterId,
    name: parked.name,
    x: parked.x,
    y: parked.y,
    maxHealth: parked.maxHealth,
    health: parked.health,
    lastProcessedSeq: lastProcessedSeqForSession(parked.sessionId, sessionId, parked.lastProcessedSeq),
    axisX: 0,
    axisY: 0,
    questLog: cloneQuestLog(questLog),
    lastAttackTick: parked.lastAttackTick,
    deadUntilTick: parked.deadUntilTick,
    lastAttackRequestId: parked.lastAttackRequestId,
    lastAttackResultCode: parked.lastAttackResultCode,
    lastAttackResultOk: parked.lastAttackResultOk,
    inventory: cloneInventory(inventory),
    equipment: cloneEquipment(equipment),
    derivedAttack: derivedAttack,
    gold: gold,
    lastCheckpointTick: parked.lastCheckpointTick,
    lastCheckpointX: parked.lastCheckpointX,
    lastCheckpointY: parked.lastCheckpointY,
  };
}

export function collectPositionCheckpoints(state: StarterZoneState, tick: number): PositionCheckpoint[] {
  const checkpoints: PositionCheckpoint[] = [];
  const ids = Object.keys(dict(state.players));
  for (let i = 0; i < ids.length; i++) {
    const userId = ids[i];
    const player = state.players[userId];
    if (player.lastCheckpointTick === undefined) {
      player.lastCheckpointTick = tick;
      player.lastCheckpointX = player.x;
      player.lastCheckpointY = player.y;
      continue;
    }
    if (tick - player.lastCheckpointTick < CHECKPOINT_INTERVAL_TICKS) {
      continue;
    }
    if (player.x === player.lastCheckpointX && player.y === player.lastCheckpointY) {
      player.lastCheckpointTick = tick;
      continue;
    }
    player.lastCheckpointTick = tick;
    player.lastCheckpointX = player.x;
    player.lastCheckpointY = player.y;
    checkpoints.push({ userId: userId, characterId: player.characterId, x: player.x, y: player.y });
  }
  return checkpoints;
}

export function checkpointsForTerminate(state: StarterZoneState): PositionCheckpoint[] {
  const checkpoints: PositionCheckpoint[] = [];
  const liveIds = Object.keys(dict(state.players));
  for (let i = 0; i < liveIds.length; i++) {
    const userId = liveIds[i];
    const player = state.players[userId];
    checkpoints.push({ userId: userId, characterId: player.characterId, x: player.x, y: player.y });
  }
  state.disconnected = dict(state.disconnected);
  const parkedIds = Object.keys(state.disconnected);
  for (let j = 0; j < parkedIds.length; j++) {
    const userId = parkedIds[j];
    const parked = state.disconnected[userId].player;
    checkpoints.push({ userId: userId, characterId: parked.characterId, x: parked.x, y: parked.y });
  }
  return checkpoints;
}

export function stampRequestTick(ticks: { [requestId: string]: number } | undefined, requestId: string, tick: number): {
  [requestId: string]: number;
} {
  const next: { [requestId: string]: number } = {};
  const source = dict(ticks);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    next[keys[i]] = source[keys[i]];
  }
  next[requestId] = tick;
  return next;
}

export function pruneKeyedHistory(
  keys: string[],
  ticks: { [requestId: string]: number } | undefined,
  nowTick: number,
): { keep: { [requestId: string]: boolean }; ticks: { [requestId: string]: number }; changed: boolean } {
  const keep: { [requestId: string]: boolean } = {};
  const nextTicks: { [requestId: string]: number } = {};
  let changed = false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const stamped = ticks != null && typeof ticks[key] === "number" ? ticks[key] : nowTick;
    if (nowTick - stamped >= REQUEST_ID_TTL_TICKS) {
      changed = true;
      continue;
    }
    keep[key] = true;
    nextTicks[key] = stamped;
  }
  return { keep: keep, ticks: nextTicks, changed: changed };
}

export function prunePlayerRequestHistory(player: MatchPlayer, tick: number): RequestHistoryPrune {
  const questsChanged = pruneQuestHistory(player.questLog, tick);
  const inventoryChanged = player.inventory !== undefined ? pruneInventoryHistory(player.inventory, tick) : false;
  const equipmentChanged = player.equipment !== undefined ? pruneEquipmentHistory(player.equipment, tick) : false;
  return {
    questsChanged: questsChanged,
    inventoryChanged: inventoryChanged,
    equipmentChanged: equipmentChanged,
  };
}

function pruneQuestHistory(log: QuestLog, tick: number): boolean {
  log.acceptByRequestId = dict(log.acceptByRequestId);
  log.turnInByRequestId = dict(log.turnInByRequestId);
  const acceptKeys = Object.keys(log.acceptByRequestId);
  const accept = pruneKeyedHistory(acceptKeys, log.acceptRequestTicks, tick);
  const turnInKeys = Object.keys(log.turnInByRequestId);
  const turnIn = pruneKeyedHistory(turnInKeys, log.turnInRequestTicks, tick);
  if (!accept.changed && !turnIn.changed) {
    log.acceptRequestTicks = accept.ticks;
    log.turnInRequestTicks = turnIn.ticks;
    return false;
  }
  const nextAccept: { [requestId: string]: string } = {};
  for (let i = 0; i < acceptKeys.length; i++) {
    const key = acceptKeys[i];
    if (accept.keep[key] === true) {
      nextAccept[key] = log.acceptByRequestId[key];
    }
  }
  const nextTurnIn: { [requestId: string]: string } = {};
  for (let j = 0; j < turnInKeys.length; j++) {
    const key = turnInKeys[j];
    if (turnIn.keep[key] === true) {
      nextTurnIn[key] = log.turnInByRequestId[key];
    }
  }
  log.acceptByRequestId = nextAccept;
  log.turnInByRequestId = nextTurnIn;
  log.acceptRequestTicks = accept.ticks;
  log.turnInRequestTicks = turnIn.ticks;
  return true;
}

function pruneInventoryHistory(inventory: PlayerInventory, tick: number): boolean {
  inventory.pickupByRequestId = dict(inventory.pickupByRequestId);
  const keys = Object.keys(inventory.pickupByRequestId);
  const pruned = pruneKeyedHistory(keys, inventory.pickupRequestTicks, tick);
  if (!pruned.changed) {
    inventory.pickupRequestTicks = pruned.ticks;
    return false;
  }
  const next: PlayerInventory["pickupByRequestId"] = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (pruned.keep[key] === true) {
      next[key] = inventory.pickupByRequestId[key];
    }
  }
  inventory.pickupByRequestId = next;
  inventory.pickupRequestTicks = pruned.ticks;
  return true;
}

function pruneEquipmentHistory(equipment: PlayerEquipment, tick: number): boolean {
  equipment.equipByRequestId = dict(equipment.equipByRequestId);
  const keys = Object.keys(equipment.equipByRequestId);
  const pruned = pruneKeyedHistory(keys, equipment.equipRequestTicks, tick);
  if (!pruned.changed) {
    equipment.equipRequestTicks = pruned.ticks;
    return false;
  }
  const next: PlayerEquipment["equipByRequestId"] = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (pruned.keep[key] === true) {
      next[key] = equipment.equipByRequestId[key];
    }
  }
  equipment.equipByRequestId = next;
  equipment.equipRequestTicks = pruned.ticks;
  return true;
}
