import { cloneEquipment, type PlayerEquipment } from "./equipment";
import { cloneInventory, type PlayerInventory } from "./inventory";
import { dict } from "./maps";
import {
  cloneStarterZoneState,
  playerCount,
  type MatchPlayer,
  type StarterZoneState,
} from "./match_state";
import { cloneProgression, type CharacterProgression } from "./progression";
import { cloneQuestLog, type QuestLog } from "./quest";
import { cloneCooldownMap, cloneResourceMap } from "./ability";
import { cloneActiveEffects } from "./effects";

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
  bindX?: number;
  bindY?: number;
  bindZoneId?: string;
  innByRequestId?: { [requestId: string]: string };
}

function withBind(checkpoint: PositionCheckpoint, player: MatchPlayer): PositionCheckpoint {
  if (typeof player.bindX === "number" && isFinite(player.bindX) && typeof player.bindY === "number" && isFinite(player.bindY)) {
    checkpoint.bindX = player.bindX;
    checkpoint.bindY = player.bindY;
    checkpoint.bindZoneId = player.bindZoneId !== undefined ? player.bindZoneId : "";
    checkpoint.innByRequestId = player.innByRequestId;
  }
  return checkpoint;
}

export interface PlayerLeaveResult {
  state: StarterZoneState;
  checkpoint: PositionCheckpoint | null;
}

export interface RequestHistoryPrune {
  questsChanged: boolean;
  inventoryChanged: boolean;
  equipmentChanged: boolean;
  progressionChanged: boolean;
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
    checkpoint: withBind(
      { userId: userId, characterId: parked.characterId, x: parked.x, y: parked.y },
      parked,
    ),
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
    classId: parked.classId,
    progression: parked.progression !== undefined ? cloneProgression(parked.progression) : undefined,
    lastCheckpointTick: parked.lastCheckpointTick,
    lastCheckpointX: parked.lastCheckpointX,
    lastCheckpointY: parked.lastCheckpointY,
    resources: cloneResourceMap(parked.resources),
    effects: cloneActiveEffects(parked.effects),
    activeCast: undefined,
    abilityCooldowns: cloneCooldownMap(parked.abilityCooldowns),
    globalCooldownUntilTick: parked.globalCooldownUntilTick,
    abilityUseByRequestId: parked.abilityUseByRequestId,
    abilityUseTicks: parked.abilityUseTicks,
    inCombat: parked.inCombat === true,
    lastHostileActionTick: parked.lastHostileActionTick,
    lastDamageReceivedTick: parked.lastDamageReceivedTick,
    hostileTargetId: parked.hostileTargetId,
    friendlyTargetId: parked.friendlyTargetId,
    bindX: parked.bindX,
    bindY: parked.bindY,
    bindZoneId: parked.bindZoneId,
    innByRequestId: parked.innByRequestId,
    lastSetTargetRequestId: parked.lastSetTargetRequestId,
    lastSetTargetResultCode: parked.lastSetTargetResultCode,
    lastSetTargetResultOk: parked.lastSetTargetResultOk,
    lastReleaseRequestId: parked.lastReleaseRequestId,
    lastReleaseResultCode: parked.lastReleaseResultCode,
    lastReleaseResultOk: parked.lastReleaseResultOk,
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
    checkpoints.push(
      withBind({ userId: userId, characterId: player.characterId, x: player.x, y: player.y }, player),
    );
  }
  return checkpoints;
}

export function checkpointsForTerminate(state: StarterZoneState): PositionCheckpoint[] {
  const checkpoints: PositionCheckpoint[] = [];
  const liveIds = Object.keys(dict(state.players));
  for (let i = 0; i < liveIds.length; i++) {
    const userId = liveIds[i];
    const player = state.players[userId];
    checkpoints.push(
      withBind({ userId: userId, characterId: player.characterId, x: player.x, y: player.y }, player),
    );
  }
  state.disconnected = dict(state.disconnected);
  const parkedIds = Object.keys(state.disconnected);
  for (let j = 0; j < parkedIds.length; j++) {
    const userId = parkedIds[j];
    const parked = state.disconnected[userId].player;
    checkpoints.push(
      withBind({ userId: userId, characterId: parked.characterId, x: parked.x, y: parked.y }, parked),
    );
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
  const progressionChanged = player.progression !== undefined ? pruneProgressionHistory(player.progression, tick) : false;
  pruneAbilityUseHistory(player, tick);
  return {
    questsChanged: questsChanged,
    inventoryChanged: inventoryChanged,
    equipmentChanged: equipmentChanged,
    progressionChanged: progressionChanged,
  };
}

function pruneAbilityUseHistory(player: MatchPlayer, tick: number): void {
  const map = dict(player.abilityUseByRequestId);
  const keys = Object.keys(map);
  const pruned = pruneKeyedHistory(keys, player.abilityUseTicks, tick);
  if (!pruned.changed) {
    player.abilityUseTicks = pruned.ticks;
    return;
  }
  const next: { [requestId: string]: { ok: boolean; code: string } } = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (pruned.keep[key] === true && map[key] !== undefined) {
      next[key] = map[key];
    }
  }
  player.abilityUseByRequestId = next;
  player.abilityUseTicks = pruned.ticks;
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
  inventory.mutationByRequestId = dict(inventory.mutationByRequestId);
  const mutationKeys = Object.keys(inventory.mutationByRequestId);
  const mutationPruned = pruneKeyedHistory(mutationKeys, inventory.mutationRequestTicks, tick);
  if (!pruned.changed && !mutationPruned.changed) {
    inventory.pickupRequestTicks = pruned.ticks;
    inventory.mutationRequestTicks = mutationPruned.ticks;
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
  const nextMutations: NonNullable<PlayerInventory["mutationByRequestId"]> = {};
  for (let m = 0; m < mutationKeys.length; m++) {
    const key = mutationKeys[m];
    if (mutationPruned.keep[key] === true && inventory.mutationByRequestId[key] !== undefined) {
      nextMutations[key] = inventory.mutationByRequestId[key];
    }
  }
  inventory.mutationByRequestId = nextMutations;
  inventory.mutationRequestTicks = mutationPruned.ticks;
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

function pruneProgressionHistory(progression: CharacterProgression, tick: number): boolean {
  progression.xpByEventId = dict(progression.xpByEventId);
  progression.allocateByRequestId = dict(progression.allocateByRequestId);
  const xpKeys = Object.keys(progression.xpByEventId);
  const xp = pruneKeyedHistory(xpKeys, progression.xpEventTicks, tick);
  const allocateKeys = Object.keys(progression.allocateByRequestId);
  const allocate = pruneKeyedHistory(allocateKeys, progression.allocateRequestTicks, tick);
  progression.assignHotbarByRequestId = dict(progression.assignHotbarByRequestId);
  progression.unlockAbilityByRequestId = dict(progression.unlockAbilityByRequestId);
  const hotbarKeys = Object.keys(progression.assignHotbarByRequestId);
  const hotbar = pruneKeyedHistory(hotbarKeys, progression.hotbarRequestTicks, tick);
  const unlockKeys = Object.keys(progression.unlockAbilityByRequestId);
  const unlock = pruneKeyedHistory(unlockKeys, progression.unlockRequestTicks, tick);
  if (!xp.changed && !allocate.changed && !hotbar.changed && !unlock.changed) {
    progression.xpEventTicks = xp.ticks;
    progression.allocateRequestTicks = allocate.ticks;
    progression.hotbarRequestTicks = hotbar.ticks;
    progression.unlockRequestTicks = unlock.ticks;
    return false;
  }
  const nextXp: CharacterProgression["xpByEventId"] = {};
  for (let i = 0; i < xpKeys.length; i++) {
    const key = xpKeys[i];
    if (xp.keep[key] === true) {
      nextXp[key] = progression.xpByEventId[key];
    }
  }
  const nextAllocate: CharacterProgression["allocateByRequestId"] = {};
  for (let j = 0; j < allocateKeys.length; j++) {
    const key = allocateKeys[j];
    if (allocate.keep[key] === true) {
      nextAllocate[key] = progression.allocateByRequestId[key];
    }
  }
  progression.xpByEventId = nextXp;
  progression.allocateByRequestId = nextAllocate;
  progression.xpEventTicks = xp.ticks;
  progression.allocateRequestTicks = allocate.ticks;
  const nextHotbar: NonNullable<CharacterProgression["assignHotbarByRequestId"]> = {};
  for (let h = 0; h < hotbarKeys.length; h++) {
    const key = hotbarKeys[h];
    if (hotbar.keep[key] === true && progression.assignHotbarByRequestId[key] !== undefined) {
      nextHotbar[key] = progression.assignHotbarByRequestId[key];
    }
  }
  const nextUnlock: NonNullable<CharacterProgression["unlockAbilityByRequestId"]> = {};
  for (let u = 0; u < unlockKeys.length; u++) {
    const key = unlockKeys[u];
    if (unlock.keep[key] === true && progression.unlockAbilityByRequestId[key] !== undefined) {
      nextUnlock[key] = progression.unlockAbilityByRequestId[key];
    }
  }
  progression.assignHotbarByRequestId = nextHotbar;
  progression.unlockAbilityByRequestId = nextUnlock;
  progression.hotbarRequestTicks = hotbar.ticks;
  progression.unlockRequestTicks = unlock.ticks;
  return true;
}
