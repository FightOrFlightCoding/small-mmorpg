import {
  ClientOpcode,
  ServerOpcode,
  actionResult,
  abilityState,
  combatEvent,
  equipmentState,
  interactionResult,
  inventoryState,
  isProtocolError,
  parseClientMessage,
  progressionState,
  questState,
  systemMessage,
  walletState,
  type ParsedClientMessage,
} from "./protocol";
import {
  EMPTY_MATCH_TIMEOUT_TICKS,
  MATCH_TICK_RATE,
  playerCount,
  type StarterZoneState,
  type MatchPlayer,
  buildFullState,
  buildSnapshot,
  cloneStarterZoneState,
  fullStateOpcode,
  snapshotOpcode,
} from "./match_state";
import { intendedDelta, resolveMove } from "./movement";
import { findNpc, resolveInteraction } from "./interaction";
import { applyQuestAccept, cloneQuestLog, publicQuestPayloads, syncAcquireObjectives, type QuestLog } from "./quest";
import { applyTalkObjectives, applyKillObjectives, applyEnterLocation, enterLocationsFromQuests } from "./quest_objectives";
import { applyVendorBuy, applyVendorSell, type VendorTradeOutcome } from "./vendor";
import { applyCaveEnter, applyInnRest } from "./inn";
import { TX_REASON_INN, TX_REASON_VENDOR, type TransactionCommitter } from "./transaction";
import {
  applyQuestTurnIn,
  type QuestRewardWrite,
  type RewardCommitter,
} from "./quest_reward";
import { type CombatEvent } from "./combat";
import { assignHotbar, cancelCast, interruptMovingCasters, interruptOnDamage, publicAbilityState, tickCasts, unlockAbility, useAbility, useLegacyAttackOrAbility } from "./ability";
import { applyReleaseRespawn, tickCombatFlags } from "./combat_pipeline";
import { applySetTarget } from "./targeting";
import { applyServerXpGrant, killXpGrantFromEnemy, questXpGrant, type TrustedXpGrant } from "./xp_hooks";
import { effectModifiersFrom, hasControlTag, tickEffects } from "./effects";
import { simulateCombatants } from "./enemy_ai";
import { publicInventory, applyDestroyItem, applyMoveItem, applySplitStack, emptyInventory, type PlayerInventory } from "./inventory";
import {
  applyEquip,
  cloneEquipment,
  derivedAttack,
  emptyEquipment,
  equippedInstanceIds,
  publicDerived,
  publicEquipment,
  reconcileEquipment,
  type InventoryOwner,
  type PlayerEquipment,
} from "./equipment";
import { applyPickup, expireLoot } from "./loot";
import { applyEnemyDeathSideEffects } from "./loot_table";
import {
  allocateAttributes,
  applyQuestRewardProgression,
  cloneProgression,
  grantXp,
  publicProgression,
  type CharacterProgression,
} from "./progression";
import {
  collectPositionCheckpoints,
  expireDisconnected,
  prunePlayerRequestHistory,
  type PositionCheckpoint,
} from "./persistence";
import {
  MAX_MESSAGES_PER_PLAYER_PER_TICK,
  actionForOpcode,
  consumeActionRate,
  type RateAction,
} from "./rate_limit";
import { type RejectedAction } from "./security_log";
import {
  emptyModifierMap,
  equipmentModifiersFromGear,
  evaluateStats,
  resourceIdForRole,
  syncCombatStatsFromPipeline,
} from "./stats";

export interface MatchOutbound {
  opcode: number;
  body: string;
  toUserId?: string;
  broadcastOthersFrom?: string;
}

export interface QuestPersist {
  userId: string;
  characterId?: string;
  log: QuestLog;
}

export interface InventoryPersist {
  userId: string;
  characterId?: string;
  inventory: PlayerInventory;
}

export interface EquipmentPersist {
  userId: string;
  characterId?: string;
  equipment: PlayerEquipment;
}

export interface ProgressionPersist {
  userId: string;
  characterId?: string;
  progression: CharacterProgression;
}

export interface RewardPersist {
  userId: string;
  request: QuestRewardWrite;
}

export interface MatchLoopResult {
  state: StarterZoneState;
  terminate: boolean;
  outbound: MatchOutbound[];
  persistQuests: QuestPersist[];
  persistInventories: InventoryPersist[];
  persistEquipment: EquipmentPersist[];
  persistProgression: ProgressionPersist[];
  persistRewards: RewardPersist[];
  persistCheckpoints: PositionCheckpoint[];
  rejections: RejectedAction[];
}

export interface IncomingMatchData {
  opcode: number;
  raw: string;
  userId: string;
}

export function applyMatchLoop(
  state: StarterZoneState,
  tick: number,
  expectedContentHash: string,
  messages: IncomingMatchData[],
  newId?: () => string,
  commitReward?: RewardCommitter,
  commitTxn?: TransactionCommitter,
): MatchLoopResult {
  const outbound: MatchOutbound[] = [];
  const rejections: RejectedAction[] = [];
  const messagesThisTick: { [userId: string]: number } = {};
  const rateNotified: { [key: string]: boolean } = {};
  const next = cloneStarterZoneState(state);
  const persistByUser: { [userId: string]: QuestLog } = {};
  const persistInventoryByUser: { [userId: string]: PlayerInventory } = {};
  const persistEquipmentByUser: { [userId: string]: PlayerEquipment } = {};
  const persistProgressionByUser: { [userId: string]: CharacterProgression } = {};
  const persistRewardByUser: { [userId: string]: QuestRewardWrite } = {};
  const skipStorageUsers: { [userId: string]: boolean } = {};
  const extraCheckpoints: PositionCheckpoint[] = [];
  const combatEvents: CombatEvent[] = [];
  const makeId = newId !== undefined ? newId : sequentialIdFactory(tick);
  reconcileAllEquipment(next, persistEquipmentByUser);

  for (let i = 0; i < messages.length; i++) {
    const incoming = messages[i];
    const seen = messagesThisTick[incoming.userId] !== undefined ? messagesThisTick[incoming.userId] : 0;
    if (seen >= MAX_MESSAGES_PER_PLAYER_PER_TICK) {
      notifyRateLimited(incoming.userId, "unknown", tick, outbound, rejections, rateNotified);
      continue;
    }
    messagesThisTick[incoming.userId] = seen + 1;
    const parsed = parseClientMessage(incoming.opcode, incoming.raw, expectedContentHash);
    const action = actionForOpcode(incoming.opcode);
    if (isProtocolError(parsed)) {
      const sys = systemMessage(parsed.code, parsed.message);
      outbound.push({ opcode: sys.opcode, body: sys.body, toUserId: incoming.userId });
      rejections.push({ userId: incoming.userId, action: action, code: parsed.code, tick: tick });
      continue;
    }
    if (!consumeActionRate(next.actionRates, incoming.userId, action, tick)) {
      notifyRateLimited(incoming.userId, action, tick, outbound, rejections, rateNotified);
      continue;
    }
    const outboundBefore = outbound.length;
    handleValidated(
      parsed,
      incoming.userId,
      next,
      tick,
      outbound,
      persistByUser,
      persistInventoryByUser,
      persistEquipmentByUser,
      persistProgressionByUser,
      persistRewardByUser,
      skipStorageUsers,
      extraCheckpoints,
      combatEvents,
      makeId,
      commitReward,
      commitTxn,
    );
    collectFailedApplies(outbound, outboundBefore, incoming.userId, action, tick, rejections);
  }

  const previousPos = capturePlayerPositions(next);
  simulateMovement(next, 1 / MATCH_TICK_RATE);
  interruptMovingCasters(next, previousPos, tick, combatEvents);
  tickCasts(next, tick, combatEvents);
  simulateCombatants(next, tick, 1 / MATCH_TICK_RATE, MATCH_TICK_RATE, combatEvents);
  tickCombatFlags(next, tick);
  interruptDamagedCasters(next, combatEvents, tick);
  tickEffects(next, tick, combatEvents);
  grantKillXpFromEvents(next, combatEvents, tick, persistProgressionByUser, outbound);
  applyKillQuestProgress(next, combatEvents, persistByUser, outbound);
  refreshAllDerived(next);
  spawnLootFromDeaths(next, tick, combatEvents, makeId);
  next.loot = expireLoot(next.loot, tick);
  applyEnterQuestProgress(next, persistByUser, outbound);
  pushCombatEvents(outbound, tick, combatEvents);
  expireDisconnected(next, tick);
  const persistCheckpoints = collectPositionCheckpoints(next, tick).concat(extraCheckpoints);
  pruneLiveRequestHistory(
    next,
    tick,
    persistByUser,
    persistInventoryByUser,
    persistEquipmentByUser,
    persistProgressionByUser,
    skipStorageUsers,
  );

  if (playerCount(next) === 0) {
    next.emptyTicks = next.emptyTicks + 1;
  } else {
    next.emptyTicks = 0;
    outbound.push({
      opcode: snapshotOpcode(),
      body: buildSnapshot(next, tick),
    });
  }

  const persistQuests: QuestPersist[] = [];
  const persistIds = Object.keys(persistByUser);
  for (let j = 0; j < persistIds.length; j++) {
    const userId = persistIds[j];
    if (skipStorageUsers[userId] === true) {
      continue;
    }
    persistQuests.push({
      userId: userId,
      characterId: characterIdOf(next, userId),
      log: persistByUser[userId],
    });
  }
  const persistInventories: InventoryPersist[] = [];
  const inventoryIds = Object.keys(persistInventoryByUser);
  for (let k = 0; k < inventoryIds.length; k++) {
    const userId = inventoryIds[k];
    if (skipStorageUsers[userId] === true) {
      continue;
    }
    persistInventories.push({
      userId: userId,
      characterId: characterIdOf(next, userId),
      inventory: persistInventoryByUser[userId],
    });
  }
  const persistEquipment: EquipmentPersist[] = [];
  const equipmentIds = Object.keys(persistEquipmentByUser);
  for (let e = 0; e < equipmentIds.length; e++) {
    const userId = equipmentIds[e];
    persistEquipment.push({
      userId: userId,
      characterId: characterIdOf(next, userId),
      equipment: persistEquipmentByUser[userId],
    });
  }
  const persistProgression: ProgressionPersist[] = [];
  const progressionIds = Object.keys(persistProgressionByUser);
  for (let p = 0; p < progressionIds.length; p++) {
    const userId = progressionIds[p];
    persistProgression.push({
      userId: userId,
      characterId: characterIdOf(next, userId),
      progression: persistProgressionByUser[userId],
    });
  }
  const persistRewards: RewardPersist[] = [];
  const rewardIds = Object.keys(persistRewardByUser);
  for (let r = 0; r < rewardIds.length; r++) {
    const userId = rewardIds[r];
    persistRewards.push({ userId: userId, request: persistRewardByUser[userId] });
  }

  return {
    state: next,
    terminate: playerCount(next) === 0 && next.emptyTicks >= EMPTY_MATCH_TIMEOUT_TICKS,
    outbound: outbound,
    persistQuests: persistQuests,
    persistInventories: persistInventories,
    persistEquipment: persistEquipment,
    persistProgression: persistProgression,
    persistRewards: persistRewards,
    persistCheckpoints: persistCheckpoints,
    rejections: rejections,
  };
}

function characterIdOf(state: StarterZoneState, userId: string): string | undefined {
  const player = state.players[userId];
  if (player === undefined) {
    return undefined;
  }
  return player.characterId;
}

function notifyRateLimited(
  userId: string,
  action: RateAction,
  tick: number,
  outbound: MatchOutbound[],
  rejections: RejectedAction[],
  rateNotified: { [key: string]: boolean },
): void {
  const key = userId + ":" + action;
  if (rateNotified[key] === true) {
    return;
  }
  rateNotified[key] = true;
  const sys = systemMessage("rate_limited", "Too many " + action + " requests.");
  outbound.push({ opcode: sys.opcode, body: sys.body, toUserId: userId });
  rejections.push({ userId: userId, action: action, code: "rate_limited", tick: tick });
}

function collectFailedApplies(
  outbound: MatchOutbound[],
  startIndex: number,
  userId: string,
  action: RateAction,
  tick: number,
  rejections: RejectedAction[],
): void {
  for (let i = startIndex; i < outbound.length; i++) {
    const message = outbound[i];
    if (message.opcode !== ServerOpcode.ACTION_RESULT && message.opcode !== ServerOpcode.INTERACTION_RESULT) {
      continue;
    }
    let parsed: { ok?: unknown; code?: unknown };
    try {
      parsed = JSON.parse(message.body) as { ok?: unknown; code?: unknown };
    } catch {
      continue;
    }
    if (parsed.ok === false && typeof parsed.code === "string") {
      rejections.push({ userId: userId, action: action, code: parsed.code, tick: tick });
    }
  }
}

function handleValidated(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  persistRewardByUser: { [userId: string]: QuestRewardWrite },
  skipStorageUsers: { [userId: string]: boolean },
  extraCheckpoints: PositionCheckpoint[],
  combatEvents: CombatEvent[],
  makeId: () => string,
  commitReward?: RewardCommitter,
  commitTxn?: TransactionCommitter,
): void {
  if (parsed.opcode === ClientOpcode.RESYNC_REQUEST) {
    outbound.push({
      opcode: fullStateOpcode(),
      body: buildFullState(state, tick, userId),
      toUserId: userId,
    });
    return;
  }
  if (parsed.opcode === ClientOpcode.INPUT) {
    applyInput(state, userId, parsed.seq as number, parsed.axisX as number, parsed.axisY as number);
    return;
  }
  if (parsed.opcode === ClientOpcode.INTERACT) {
    handleInteract(parsed, userId, state, outbound, persistByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.QUEST_ACCEPT) {
    handleQuestAccept(parsed, userId, state, tick, outbound, persistByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.QUEST_TURN_IN) {
    handleQuestTurnIn(
      parsed,
      userId,
      state,
      tick,
      outbound,
      persistRewardByUser,
      persistEquipmentByUser,
      skipStorageUsers,
      makeId,
      commitReward,
      persistProgressionByUser,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.ATTACK) {
    handleAttack(parsed, userId, state, tick, outbound, combatEvents);
    return;
  }
  if (parsed.opcode === ClientOpcode.USE_ABILITY) {
    handleUseAbility(parsed, userId, state, tick, outbound, combatEvents);
    return;
  }
  if (parsed.opcode === ClientOpcode.CANCEL_CAST) {
    handleCancelCast(parsed, userId, state, tick, outbound, combatEvents);
    return;
  }
  if (parsed.opcode === ClientOpcode.ASSIGN_HOTBAR) {
    handleAssignHotbar(parsed, userId, state, tick, outbound, persistProgressionByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.UNLOCK_ABILITY) {
    handleUnlockAbility(parsed, userId, state, tick, outbound, persistProgressionByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.SET_TARGET) {
    handleSetTarget(parsed, userId, state, outbound);
    return;
  }
  if (parsed.opcode === ClientOpcode.RELEASE_RESPAWN) {
    handleReleaseRespawn(parsed, userId, state, tick, outbound, combatEvents);
    return;
  }
  if (parsed.opcode === ClientOpcode.PICKUP) {
    handlePickup(parsed, userId, state, tick, outbound, persistByUser, persistInventoryByUser, persistEquipmentByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.EQUIP) {
    handleEquip(parsed, userId, state, tick, outbound, persistEquipmentByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.DESTROY_ITEM) {
    handleDestroyItem(parsed, userId, state, tick, outbound, persistInventoryByUser, persistEquipmentByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.SPLIT_STACK) {
    handleSplitStack(parsed, userId, state, tick, outbound, persistInventoryByUser, makeId);
    return;
  }
  if (parsed.opcode === ClientOpcode.MOVE_ITEM) {
    handleMoveItem(parsed, userId, state, tick, outbound, persistInventoryByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.ALLOCATE_ATTRIBUTES) {
    handleAllocate(parsed, userId, state, tick, outbound, persistProgressionByUser);
    return;
  }
  if (parsed.opcode === ClientOpcode.VENDOR_BUY) {
    handleVendorBuy(
      parsed,
      userId,
      state,
      tick,
      outbound,
      persistByUser,
      persistInventoryByUser,
      persistEquipmentByUser,
      skipStorageUsers,
      makeId,
      commitTxn,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.VENDOR_SELL) {
    handleVendorSell(
      parsed,
      userId,
      state,
      tick,
      outbound,
      persistInventoryByUser,
      persistEquipmentByUser,
      skipStorageUsers,
      makeId,
      commitTxn,
    );
    return;
  }
  if (parsed.opcode === ClientOpcode.INN_REST) {
    handleInnRest(parsed, userId, state, tick, outbound, extraCheckpoints, skipStorageUsers, commitTxn);
    return;
  }
  if (parsed.opcode === ClientOpcode.CAVE_ENTER) {
    handleCaveEnter(parsed, userId, state, outbound);
    return;
  }
  const result = actionResult("not_implemented", false, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleInteract(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
): void {
  const targetId = parsed.fields.targetId;
  const player = state.players[userId];
  if (player === undefined) {
    const missing = interactionResult("player_missing", false, parsed.requestId, targetId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const npc = findNpc(state.npcs, targetId);
  const decision = resolveInteraction({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    targetId: targetId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    zoneId: state.zoneId,
    playerLevel: playerLevelOf(player),
    classId: player.classId,
    questLog: player.questLog,
    npcById: npcCatalog(state),
  });
  const extra = interactionExtras(state, player, npc !== null ? npc.npcId : targetId);
  const result = interactionResult(decision.code, decision.ok, parsed.requestId, targetId, extra);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (!decision.ok || npc === null) {
    return;
  }
  const talked = applyTalkObjectives(player.questLog, npc.npcId);
  if (talked.changed) {
    player.questLog = talked.log;
    persistByUser[userId] = cloneQuestLog(player.questLog);
    pushQuestState(state, userId, outbound, parsed.requestId);
  }
}

function handleQuestAccept(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = applyQuestAccept({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    questLog: player.questLog,
    questId: parsed.fields.questId,
    requestId: parsed.requestId as string,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    questsById: state.questsById,
    tick: tick,
    playerLevel: playerLevelOf(player),
    classId: player.classId,
    npcById: npcCatalog(state),
  });
  player.questLog = outcome.log;
  const synced = syncAcquireObjectives(player.questLog, player.inventory);
  player.questLog = synced.log;
  const entered = applyEnterLocation(
    player.questLog,
    state.zoneId,
    player.x,
    player.y,
    enterLocationsFromQuests(state.questsById),
  );
  player.questLog = entered.log;
  if (outcome.persist || synced.changed || entered.changed) {
    persistByUser[userId] = cloneQuestLog(player.questLog);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    pushQuestState(state, userId, outbound, parsed.requestId);
  }
}

function handleQuestTurnIn(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistRewardByUser: { [userId: string]: QuestRewardWrite },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
  skipStorageUsers: { [userId: string]: boolean },
  makeId: () => string,
  commitReward: RewardCommitter | undefined,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const requestId = parsed.requestId as string;
  const outcome = applyQuestTurnIn({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    questLog: player.questLog,
    inventory: player.inventory,
    gold: player.gold !== undefined ? player.gold : 0,
    questId: parsed.fields.questId,
    npcId: parsed.fields.npcId,
    requestId: requestId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    questsById: state.questsById,
    itemsById: state.itemsById,
    newId: makeId,
    tick: tick,
    npcById: npcCatalog(state),
  });
  if (!outcome.ok) {
    const failed = actionResult(outcome.code, false, requestId);
    outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: userId });
    return;
  }
  if (!outcome.replay) {
    if (commitReward !== undefined) {
      const committed = commitReward({
        userId: userId,
        characterId: player.characterId,
        requestId: requestId,
        questId: parsed.fields.questId,
        inventory: outcome.inventory,
        log: outcome.log,
        goldDelta: outcome.goldDelta,
        metadata: outcome.metadata,
      });
      if (!committed.ok) {
        const persistFailed = actionResult(committed.code, false, requestId);
        outbound.push({ opcode: persistFailed.opcode, body: persistFailed.body, toUserId: userId });
        return;
      }
      player.gold = committed.gold;
    } else {
      player.gold = outcome.gold;
      persistRewardByUser[userId] = {
        userId: userId,
        characterId: player.characterId,
        requestId: requestId,
        questId: parsed.fields.questId,
        inventory: outcome.inventory,
        log: outcome.log,
        goldDelta: outcome.goldDelta,
        metadata: outcome.metadata,
      };
    }
    player.inventory = outcome.inventory;
    player.questLog = outcome.log;
    skipStorageUsers[userId] = true;
    refreshDerivedFromInventory(state, userId, persistEquipmentByUser);
    grantQuestXp(state, userId, parsed.fields.questId, requestId, tick, persistProgressionByUser, outbound);
    grantQuestExtraRewards(state, userId, parsed.fields.questId, persistProgressionByUser, outbound, requestId);
  }
  const gold = player.gold !== undefined ? player.gold : 0;
  const result = actionResult(outcome.code, true, requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  const quests = questState(
    state.contentHash,
    publicQuestPayloads(player.questLog, state.questsById),
    requestId,
  );
  outbound.push({ opcode: quests.opcode, body: quests.body, toUserId: userId });
  const inventory = inventoryState(
    state.contentHash,
    publicInventory(player.inventory !== undefined ? player.inventory : outcome.inventory),
    requestId,
  );
  outbound.push({ opcode: inventory.opcode, body: inventory.body, toUserId: userId });
  const wallet = walletState(state.contentHash, gold, requestId);
  outbound.push({ opcode: wallet.opcode, body: wallet.body, toUserId: userId });
  if (!outcome.replay) {
    const notice = systemMessage("quest_complete", questCompleteNotice(parsed.fields.questId));
    outbound.push({ opcode: notice.opcode, body: notice.body, toUserId: userId });
  }
}

function handleVendorBuy(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
  skipStorageUsers: { [userId: string]: boolean },
  makeId: () => string,
  commitTxn?: TransactionCommitter,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const requestId = parsed.requestId as string;
  const outcome = applyVendorBuy({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    gold: player.gold !== undefined ? player.gold : 0,
    inventory: player.inventory,
    npcId: parsed.fields.npcId,
    itemId: parsed.fields.itemId,
    quantity: parsed.quantity !== undefined ? parsed.quantity : 1,
    requestId: requestId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    npcById: npcCatalog(state),
    vendorsById: vendorCatalog(state),
    itemsById: state.itemsById,
    equippedInstanceIds: equippedInstanceIds(player.equipment !== undefined ? player.equipment : emptyEquipment()),
    classId: player.classId,
    playerLevel: playerLevelOf(player),
    newId: makeId,
    tick: tick,
  });
  if (!outcome.ok) {
    const failed = actionResult(outcome.code, false, requestId);
    outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: userId });
    return;
  }
  if (!commitVendorTrade(player, userId, requestId, parsed.fields.npcId, outcome, persistInventoryByUser, skipStorageUsers, commitTxn)) {
    const persistFailed = actionResult("persist_failed", false, requestId);
    outbound.push({ opcode: persistFailed.opcode, body: persistFailed.body, toUserId: userId });
    return;
  }
  refreshDerivedFromInventory(state, userId, persistEquipmentByUser);
  const synced = syncAcquireObjectives(player.questLog, player.inventory);
  player.questLog = synced.log;
  if (synced.changed) {
    persistByUser[userId] = cloneQuestLog(player.questLog);
    pushQuestState(state, userId, outbound, requestId);
  }
  pushEconomyResult(state, userId, outbound, requestId, outcome.code, true);
}

function handleVendorSell(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
  skipStorageUsers: { [userId: string]: boolean },
  makeId: () => string,
  commitTxn?: TransactionCommitter,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const requestId = parsed.requestId as string;
  const outcome = applyVendorSell({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    gold: player.gold !== undefined ? player.gold : 0,
    inventory: player.inventory,
    npcId: parsed.fields.npcId,
    instanceId: parsed.fields.instanceId,
    quantity: parsed.quantity !== undefined ? parsed.quantity : 0,
    requestId: requestId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    npcById: npcCatalog(state),
    vendorsById: vendorCatalog(state),
    itemsById: state.itemsById,
    equippedInstanceIds: equippedInstanceIds(player.equipment !== undefined ? player.equipment : emptyEquipment()),
    classId: player.classId,
    playerLevel: playerLevelOf(player),
    newId: makeId,
    tick: tick,
  });
  if (!outcome.ok) {
    const failed = actionResult(outcome.code, false, requestId);
    outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: userId });
    return;
  }
  if (!commitVendorTrade(player, userId, requestId, parsed.fields.npcId, outcome, persistInventoryByUser, skipStorageUsers, commitTxn)) {
    const persistFailed = actionResult("persist_failed", false, requestId);
    outbound.push({ opcode: persistFailed.opcode, body: persistFailed.body, toUserId: userId });
    return;
  }
  refreshDerivedFromInventory(state, userId, persistEquipmentByUser);
  pushEconomyResult(state, userId, outbound, requestId, outcome.code, true);
}

function handleInnRest(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  extraCheckpoints: PositionCheckpoint[],
  skipStorageUsers: { [userId: string]: boolean },
  commitTxn?: TransactionCommitter,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const requestId = parsed.requestId as string;
  const bind = parsed.fields.mode !== "healer";
  const outcome = applyInnRest({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    maxHealth: player.maxHealth,
    gold: player.gold !== undefined ? player.gold : 0,
    npcId: parsed.fields.npcId,
    requestId: requestId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    npcById: npcCatalog(state),
    resources: player.resources,
    resourceMax: resourceCaps(state, player),
    bind: bind,
    tick: tick,
    priorCodes: player.innByRequestId,
  });
  if (!outcome.ok) {
    rememberInn(player, requestId, outcome.code);
    const failed = actionResult(outcome.code, false, requestId);
    outbound.push({ opcode: failed.opcode, body: failed.body, toUserId: userId });
    return;
  }
  if (!outcome.replay) {
    if (outcome.goldDelta !== 0 && commitTxn !== undefined) {
      const committed = commitTxn({
        requestId: requestId,
        characterId: player.characterId !== undefined ? player.characterId : "",
        userId: userId,
        reasonType: TX_REASON_INN,
        reasonId: parsed.fields.npcId,
        goldDelta: outcome.goldDelta,
        currentGold: player.gold !== undefined ? player.gold : 0,
        metadata: outcome.metadata,
      });
      if (!committed.ok) {
        const persistFailed = actionResult(committed.code, false, requestId);
        outbound.push({ opcode: persistFailed.opcode, body: persistFailed.body, toUserId: userId });
        return;
      }
      player.gold = committed.gold;
      skipStorageUsers[userId] = true;
    } else {
      player.gold = outcome.gold;
    }
    player.health = outcome.health;
    player.resources = outcome.resources;
    if (outcome.bindX !== undefined && outcome.bindY !== undefined) {
      player.bindX = outcome.bindX;
      player.bindY = outcome.bindY;
      player.bindZoneId = outcome.bindZoneId;
    }
    rememberInn(player, requestId, outcome.code);
    extraCheckpoints.push({
      userId: userId,
      characterId: player.characterId !== undefined ? player.characterId : "",
      x: player.x,
      y: player.y,
      bindX: player.bindX,
      bindY: player.bindY,
      bindZoneId: player.bindZoneId,
      innByRequestId: player.innByRequestId,
    });
  }
  const result = actionResult(outcome.code, true, requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  const gold = player.gold !== undefined ? player.gold : 0;
  const wallet = walletState(state.contentHash, gold, requestId);
  outbound.push({ opcode: wallet.opcode, body: wallet.body, toUserId: userId });
}

function handleCaveEnter(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = applyCaveEnter({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    npcId: parsed.fields.npcId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
    npcById: npcCatalog(state),
  });
  const result = actionResult(outcome.code, false, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleAttack(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
): void {
  const decision = useLegacyAttackOrAbility(
    state,
    userId,
    parsed.fields.targetId,
    parsed.requestId as string,
    tick,
    combatEvents,
    playerAttack(state, userId),
    state.playerAttackRange,
    state.playerAttackCooldownSec,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleUseAbility(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
): void {
  const decision = useAbility(
    state,
    userId,
    {
      abilityId: parsed.fields.abilityId,
      targetId: parsed.fields.targetId,
      targetX: parsed.targetX,
      targetY: parsed.targetY,
      requestId: parsed.requestId as string,
    },
    tick,
    combatEvents,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  pushAbilityState(state, userId, outbound, tick, parsed.requestId);
  if (decision.ok && !decision.replay) {
    refreshPlayerDerived(state, userId);
  }
}

function handleCancelCast(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
): void {
  const decision = cancelCast(state.players[userId], parsed.requestId as string, tick, combatEvents);
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  pushAbilityState(state, userId, outbound, tick, parsed.requestId);
}

function handleSetTarget(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
): void {
  const decision = applySetTarget(
    state,
    state.players[userId],
    parsed.fields.targetId !== undefined ? parsed.fields.targetId : "",
    parsed.fields.intent !== undefined ? parsed.fields.intent : "",
    parsed.requestId as string,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleReleaseRespawn(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
): void {
  const decision = applyReleaseRespawn(
    state,
    state.players[userId],
    tick,
    parsed.requestId as string,
    combatEvents,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleAssignHotbar(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistProgressionByUser: { [userId: string]: CharacterProgression },
): void {
  const player = state.players[userId];
  if (player === undefined || player.progression === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const abilityId = parsed.fields.abilityId !== undefined ? parsed.fields.abilityId : "";
  const outcome = assignHotbar(
    player.progression,
    parsed.slotIndex !== undefined ? parsed.slotIndex : -1,
    abilityId,
    parsed.requestId as string,
    tick,
  );
  player.progression = outcome.progression;
  if (outcome.changed) {
    persistProgressionByUser[userId] = cloneProgression(player.progression);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  pushAbilityState(state, userId, outbound, tick, parsed.requestId);
}

function handleUnlockAbility(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistProgressionByUser: { [userId: string]: CharacterProgression },
): void {
  const player = state.players[userId];
  if (player === undefined || player.progression === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const abilityId = parsed.fields.abilityId;
  const definition = state.abilitiesById !== undefined ? state.abilitiesById[abilityId] : undefined;
  const classId = player.classId !== undefined ? player.classId : "";
  const tags = state.classTags !== undefined && classId.length > 0 && state.classTags[classId] !== undefined
    ? state.classTags[classId]
    : [];
  const outcome = unlockAbility(
    player.progression,
    definition,
    tags,
    classId,
    parsed.requestId as string,
    tick,
  );
  player.progression = outcome.progression;
  if (outcome.changed) {
    persistProgressionByUser[userId] = cloneProgression(player.progression);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    pushProgressionState(state, userId, outbound, parsed.requestId);
  }
  pushAbilityState(state, userId, outbound, tick, parsed.requestId);
}

function handlePickup(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistByUser: { [userId: string]: QuestLog },
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = applyPickup({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    inventory: player.inventory,
    lootId: parsed.fields.lootId,
    requestId: parsed.requestId as string,
    loot: state.loot,
    pickupRange: state.pickupRange,
    itemsById: state.itemsById,
    tick: tick,
  });
  player.inventory = outcome.inventory;
  state.loot = outcome.loot;
  if (outcome.persist) {
    persistInventoryByUser[userId] = outcome.inventory;
  }
  if (outcome.ok && !outcome.replay) {
    const synced = syncAcquireObjectives(player.questLog, player.inventory);
    player.questLog = synced.log;
    if (synced.changed) {
      persistByUser[userId] = cloneQuestLog(synced.log);
      const quests = questState(
        state.contentHash,
        publicQuestPayloads(player.questLog, state.questsById),
        parsed.requestId,
      );
      outbound.push({ opcode: quests.opcode, body: quests.body, toUserId: userId });
    }
  }
  refreshDerivedFromInventory(state, userId, persistEquipmentByUser);
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const inventory = inventoryState(
      state.contentHash,
      publicInventory(player.inventory),
      parsed.requestId,
    );
    outbound.push({ opcode: inventory.opcode, body: inventory.body, toUserId: userId });
  }
}

function handleEquip(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const unequip = parsed.fields.instanceId === undefined;
  const classId = player.classId !== undefined ? player.classId : "";
  const classTags =
    classId.length > 0 && state.classEquipmentTags !== undefined ? state.classEquipmentTags[classId] : undefined;
  const outcome = applyEquip({
    playerHealth: player.health,
    userId: userId,
    instanceId: parsed.fields.instanceId !== undefined ? parsed.fields.instanceId : "",
    slot: parsed.fields.slot,
    requestId: parsed.requestId as string,
    equipment: player.equipment !== undefined ? player.equipment : emptyEquipment(),
    inventory: player.inventory,
    itemsById: state.itemsById,
    baseAttack: state.playerAttack,
    owners: inventoryOwners(state),
    unequip: unequip,
    tick: tick,
    classId: classId,
    playerLevel: player.progression !== undefined ? player.progression.level : 1,
    classEquipmentTags: classTags,
    equipmentSlotsByTag: state.equipmentSlotsByTag,
  });
  player.equipment = outcome.equipment;
  refreshPlayerDerived(state, userId);
  if (outcome.persist) {
    persistEquipmentByUser[userId] = cloneEquipment(outcome.equipment);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const equipment = equipmentState(
      state.contentHash,
      publicEquipment(player.equipment),
      publicDerived(player.derivedAttack !== undefined ? player.derivedAttack : 0),
      parsed.requestId,
    );
    outbound.push({ opcode: equipment.opcode, body: equipment.body, toUserId: userId });
  }
}

function handleDestroyItem(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const inventory = player.inventory !== undefined ? player.inventory : emptyInventory(state.inventoryCapacity);
  const outcome = applyDestroyItem({
    playerHealth: player.health,
    inventory: inventory,
    equippedInstanceIds: equippedInstanceIds(player.equipment),
    instanceId: parsed.fields.instanceId,
    quantity: parsed.quantity,
    requestId: parsed.requestId as string,
    itemsById: state.itemsById,
    tick: tick,
  });
  player.inventory = outcome.inventory;
  if (outcome.persist) {
    persistInventoryByUser[userId] = outcome.inventory;
  }
  refreshDerivedFromInventory(state, userId, persistEquipmentByUser);
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const inventoryStateMsg = inventoryState(
      state.contentHash,
      publicInventory(player.inventory),
      parsed.requestId,
    );
    outbound.push({ opcode: inventoryStateMsg.opcode, body: inventoryStateMsg.body, toUserId: userId });
  }
}

function handleSplitStack(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  makeId: () => string,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const inventory = player.inventory !== undefined ? player.inventory : emptyInventory(state.inventoryCapacity);
  const outcome = applySplitStack({
    playerHealth: player.health,
    inventory: inventory,
    equippedInstanceIds: equippedInstanceIds(player.equipment),
    instanceId: parsed.fields.instanceId,
    quantity: parsed.quantity as number,
    requestId: parsed.requestId as string,
    itemsById: state.itemsById,
    newId: makeId,
    tick: tick,
  });
  player.inventory = outcome.inventory;
  if (outcome.persist) {
    persistInventoryByUser[userId] = outcome.inventory;
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const inventoryStateMsg = inventoryState(
      state.contentHash,
      publicInventory(player.inventory),
      parsed.requestId,
    );
    outbound.push({ opcode: inventoryStateMsg.opcode, body: inventoryStateMsg.body, toUserId: userId });
  }
}

function handleMoveItem(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistInventoryByUser: { [userId: string]: PlayerInventory },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const inventory = player.inventory !== undefined ? player.inventory : emptyInventory(state.inventoryCapacity);
  const outcome = applyMoveItem({
    playerHealth: player.health,
    inventory: inventory,
    instanceId: parsed.fields.instanceId,
    toSlotIndex: parsed.toSlotIndex as number,
    requestId: parsed.requestId as string,
    itemsById: state.itemsById,
    tick: tick,
  });
  player.inventory = outcome.inventory;
  if (outcome.persist) {
    persistInventoryByUser[userId] = outcome.inventory;
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const inventoryStateMsg = inventoryState(
      state.contentHash,
      publicInventory(player.inventory),
      parsed.requestId,
    );
    outbound.push({ opcode: inventoryStateMsg.opcode, body: inventoryStateMsg.body, toUserId: userId });
  }
}

function playerAttack(state: StarterZoneState, userId: string): number {
  const player = state.players[userId];
  if (player === undefined) {
    return state.playerAttack;
  }
  refreshPlayerDerived(state, userId);
  if (player.derivedAttack !== undefined) {
    return player.derivedAttack;
  }
  return derivedAttack(
    state.playerAttack,
    player.equipment !== undefined ? player.equipment : emptyEquipment(),
    player.inventory,
    state.itemsById,
  );
}

function refreshPlayerDerived(state: StarterZoneState, userId: string): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  if (
    state.progressionCatalog !== undefined &&
    player.classId !== undefined &&
    player.classId.length > 0 &&
    player.progression !== undefined
  ) {
    const synced = syncCombatStatsFromPipeline(
      player,
      state.progressionCatalog,
      state.itemsById,
      effectModifiersFrom(player.effects),
    );
    if (synced !== null) {
      return;
    }
  }
  player.derivedAttack = derivedAttack(
    state.playerAttack,
    player.equipment !== undefined ? player.equipment : emptyEquipment(),
    player.inventory,
    state.itemsById,
  );
}

function refreshDerivedFromInventory(
  state: StarterZoneState,
  userId: string,
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  const current = player.equipment !== undefined ? player.equipment : emptyEquipment();
  const reconciled = reconcileEquipment(current, player.inventory);
  player.equipment = reconciled.equipment;
  refreshPlayerDerived(state, userId);
  if (reconciled.persist) {
    persistEquipmentByUser[userId] = cloneEquipment(reconciled.equipment);
  }
}

function inventoryOwners(state: StarterZoneState): InventoryOwner[] {
  const owners: InventoryOwner[] = [];
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    owners.push({ userId: id, inventory: state.players[id].inventory });
  }
  return owners;
}

function reconcileAllEquipment(
  state: StarterZoneState,
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    refreshDerivedFromInventory(state, ids[i], persistEquipmentByUser);
  }
}

function spawnLootFromDeaths(
  state: StarterZoneState,
  tick: number,
  events: CombatEvent[],
  newId: () => string,
): void {
  applyEnemyDeathSideEffects(state, events, tick, MATCH_TICK_RATE, newId);
}

function sequentialIdFactory(tick: number): () => string {
  let n = 0;
  return function () {
    n += 1;
    return "id-" + String(tick) + "-" + String(n);
  };
}

function pushCombatEvents(outbound: MatchOutbound[], tick: number, events: CombatEvent[]): void {
  if (events.length === 0) {
    return;
  }
  const payload: { [key: string]: unknown }[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const row: { [key: string]: unknown } = {
      type: event.type,
      sourceId: event.sourceId,
      sourceKind: event.sourceKind,
      targetId: event.targetId,
      targetKind: event.targetKind,
    };
    if (event.damage !== undefined) {
      row.damage = event.damage;
    }
    if (event.remainingHealth !== undefined) {
      row.remainingHealth = event.remainingHealth;
    }
    if (event.x !== undefined) {
      row.x = event.x;
    }
    if (event.y !== undefined) {
      row.y = event.y;
    }
    if (event.respawnDelaySec !== undefined) {
      row.respawnDelaySec = event.respawnDelaySec;
    }
    if (event.healing !== undefined) {
      row.healing = event.healing;
    }
    if (event.interruptReason !== undefined) {
      row.interruptReason = event.interruptReason;
    }
    if (event.effectId !== undefined) {
      row.effectId = event.effectId;
    }
    if (event.abilityId !== undefined) {
      row.abilityId = event.abilityId;
    }
    if (event.resourceId !== undefined) {
      row.resourceId = event.resourceId;
    }
    if (event.resourceDelta !== undefined) {
      row.resourceDelta = event.resourceDelta;
    }
    if (event.message !== undefined && event.message.length > 0) {
      row.message = event.message;
    }
    payload.push(row);
  }
  const message = combatEvent(tick, payload);
  outbound.push({ opcode: message.opcode, body: message.body });
}

function applyInput(state: StarterZoneState, userId: string, seq: number, axisX: number, axisY: number): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  if (seq <= player.lastProcessedSeq) {
    return;
  }
  player.lastProcessedSeq = seq;
  if (player.health <= 0) {
    player.axisX = 0;
    player.axisY = 0;
    return;
  }
  player.axisX = axisX;
  player.axisY = axisY;
}

function simulateMovement(state: StarterZoneState, dt: number): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player.health <= 0) {
      continue;
    }
    if (hasControlTag(player.effects, "stun") || hasControlTag(player.effects, "root")) {
      continue;
    }
    const delta = intendedDelta(player.axisX, player.axisY, state.moveSpeed, dt);
    const next = resolveMove(
      player.x,
      player.y,
      delta.x,
      delta.y,
      state.playerHalfExtent,
      state.collisions,
      state.walkableBounds,
    );
    player.x = next.x;
    player.y = next.y;
  }
}

export function snapshotForOthers(state: StarterZoneState, tick: number, fromUserId: string): MatchOutbound {
  return {
    opcode: snapshotOpcode(),
    body: buildSnapshot(state, tick),
    broadcastOthersFrom: fromUserId,
  };
}

function pruneLiveRequestHistory(
  state: StarterZoneState,
  tick: number,
  persistByUser: { [userId: string]: QuestLog },
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  persistEquipmentByUser: { [userId: string]: PlayerEquipment },
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  skipStorageUsers: { [userId: string]: boolean },
): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const userId = ids[i];
    const player = state.players[userId];
    const pruned = prunePlayerRequestHistory(player, tick);
    if (skipStorageUsers[userId] === true) {
      continue;
    }
    if (pruned.questsChanged) {
      persistByUser[userId] = cloneQuestLog(player.questLog);
    }
    if (pruned.inventoryChanged && player.inventory !== undefined) {
      persistInventoryByUser[userId] = player.inventory;
    }
    if (pruned.equipmentChanged && player.equipment !== undefined) {
      persistEquipmentByUser[userId] = cloneEquipment(player.equipment);
    }
    if (pruned.progressionChanged && player.progression !== undefined) {
      persistProgressionByUser[userId] = cloneProgression(player.progression);
    }
  }
}

function handleAllocate(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  persistProgressionByUser: { [userId: string]: CharacterProgression },
): void {
  const player = state.players[userId];
  if (player === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  if (player.progression === undefined || state.progressionCatalog === undefined || player.classId === undefined) {
    const missing = actionResult("player_missing", false, parsed.requestId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const outcome = allocateAttributes(player.progression, state.progressionCatalog, {
    requestId: parsed.requestId as string,
    attributeId: parsed.fields.attributeId,
    amount: parsed.amount !== undefined ? parsed.amount : 0,
    classId: player.classId,
    tick: tick,
  });
  player.progression = outcome.progression;
  if (outcome.changed) {
    persistProgressionByUser[userId] = cloneProgression(player.progression);
    refreshPlayerDerived(state, userId);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    pushProgressionState(state, userId, outbound, parsed.requestId);
  }
}

function grantKillXpFromEvents(
  state: StarterZoneState,
  events: CombatEvent[],
  tick: number,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
): void {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "death" || event.targetKind !== "enemy") {
      continue;
    }
    const userId = event.sourceId;
    const enemy = findMatchEnemy(state, event.targetId);
    if (enemy === null) {
      continue;
    }
    const characterId = characterIdOf(state, userId) !== undefined ? (characterIdOf(state, userId) as string) : "";
    applyServerXpGrant(matchXpSink(state, tick, persistProgressionByUser, outbound), userId, killXpGrantFromEnemy(enemy, characterId));
  }
}

function grantQuestXp(
  state: StarterZoneState,
  userId: string,
  questId: string,
  requestId: string,
  tick: number,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
): void {
  const definition = state.questsById[questId];
  const amount = definition !== undefined && definition.rewards.xp !== undefined ? definition.rewards.xp : 0;
  if (amount <= 0) {
    return;
  }
  const characterId = characterIdOf(state, userId) !== undefined ? (characterIdOf(state, userId) as string) : "";
  applyServerXpGrant(
    matchXpSink(state, tick, persistProgressionByUser, outbound),
    userId,
    questXpGrant(questId, amount, requestId, characterId),
  );
}

function matchXpSink(
  state: StarterZoneState,
  tick: number,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
): { apply: (userId: string, grant: TrustedXpGrant) => { ok: boolean; replay: boolean; applied: boolean; code: string } } {
  return {
    apply: function (userId: string, grant: TrustedXpGrant) {
      return applyTrustedXp(state, userId, grant, tick, persistProgressionByUser, outbound);
    },
  };
}

function applyTrustedXp(
  state: StarterZoneState,
  userId: string,
  grant: TrustedXpGrant,
  tick: number,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
): { ok: boolean; replay: boolean; applied: boolean; code: string } {
  const player = state.players[userId];
  if (player === undefined || player.progression === undefined || state.progressionCatalog === undefined) {
    return { ok: false, replay: false, applied: false, code: "player_missing" };
  }
  const classId = player.classId !== undefined ? player.classId : "";
  if (classId.length === 0) {
    return { ok: false, replay: false, applied: false, code: "player_missing" };
  }
  const outcome = grantXp(player.progression, state.progressionCatalog, classId, grant, tick);
  player.progression = outcome.progression;
  if (outcome.changed) {
    persistProgressionByUser[userId] = cloneProgression(player.progression);
    refreshPlayerDerived(state, userId);
    pushProgressionState(state, userId, outbound);
  }
  return {
    ok: outcome.code === "ok",
    replay: outcome.replay,
    applied: outcome.changed,
    code: outcome.code,
  };
}

function pushProgressionState(
  state: StarterZoneState,
  userId: string,
  outbound: MatchOutbound[],
  requestId?: string,
): void {
  const player = state.players[userId];
  if (player === undefined || player.progression === undefined || state.progressionCatalog === undefined) {
    return;
  }
  const classId = player.classId !== undefined ? player.classId : "";
  if (classId.length === 0) {
    return;
  }
  const evaluated = evaluateStats(state.progressionCatalog, {
    classId: classId,
    level: player.progression.level,
    allocatedAttributes: player.progression.allocatedAttributes,
    equipmentModifiers: equipmentModifiersFromGear(player.equipment, player.inventory, state.itemsById),
    effectModifiers: effectModifiersFrom(player.effects),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  const payload = publicProgression(state.progressionCatalog, classId, player.progression, evaluated.values);
  const message = progressionState(state.contentHash, payload, requestId);
  outbound.push({ opcode: message.opcode, body: message.body, toUserId: userId });
}

function findMatchEnemy(state: StarterZoneState, targetId: string) {
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === targetId || state.enemies[i].enemyId === targetId) {
      return state.enemies[i];
    }
  }
  return null;
}

function capturePlayerPositions(state: StarterZoneState): { [userId: string]: { x: number; y: number } } {
  const map: { [userId: string]: { x: number; y: number } } = {};
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    map[player.userId] = { x: player.x, y: player.y };
  }
  return map;
}

function interruptDamagedCasters(state: StarterZoneState, events: CombatEvent[], tick: number): void {
  const seen: { [userId: string]: boolean } = {};
  const limit = events.length;
  for (let i = 0; i < limit; i++) {
    const event = events[i];
    if (event.type !== "hit" || event.targetKind !== "player") {
      continue;
    }
    if (seen[event.targetId] === true) {
      continue;
    }
    seen[event.targetId] = true;
    const player = state.players[event.targetId];
    if (player !== undefined) {
      interruptOnDamage(player, state, tick, events);
    }
  }
}

function refreshAllDerived(state: StarterZoneState): void {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    refreshPlayerDerived(state, ids[i]);
  }
}

function pushAbilityState(
  state: StarterZoneState,
  userId: string,
  outbound: MatchOutbound[],
  tick: number,
  requestId?: string,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  const message = abilityState(state.contentHash, publicAbilityState(player, tick), requestId);
  outbound.push({ opcode: message.opcode, body: message.body, toUserId: userId });
}

function npcCatalog(state: StarterZoneState) {
  return state.npcsById !== undefined ? state.npcsById : {};
}

function vendorCatalog(state: StarterZoneState) {
  return state.vendorsById !== undefined ? state.vendorsById : {};
}

function playerLevelOf(player: MatchPlayer): number {
  return player.progression !== undefined ? player.progression.level : 1;
}

function interactionExtras(
  state: StarterZoneState,
  player: MatchPlayer,
  npcId: string,
): { [key: string]: unknown } {
  const definition = npcCatalog(state)[npcId];
  const extra: { [key: string]: unknown } = {
    context: {
      classId: player.classId !== undefined ? player.classId : "",
      level: playerLevelOf(player),
    },
  };
  if (definition === undefined) {
    return extra;
  }
  extra.dialogueId = definition.dialogueId;
  const services: string[] = [];
  for (let i = 0; i < definition.services.length; i++) {
    services.push(definition.services[i].type);
  }
  extra.services = services;
  return extra;
}

function pushQuestState(
  state: StarterZoneState,
  userId: string,
  outbound: MatchOutbound[],
  requestId?: string,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  const quests = questState(state.contentHash, publicQuestPayloads(player.questLog, state.questsById), requestId);
  outbound.push({ opcode: quests.opcode, body: quests.body, toUserId: userId });
}

function questCompleteNotice(questId: string): string {
  if (questId === "quest.slime_problem") {
    return "Quest complete. You received an Iron Sword and 25 gold.";
  }
  return "Quest complete.";
}

function grantQuestExtraRewards(
  state: StarterZoneState,
  userId: string,
  questId: string,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
  requestId: string,
): void {
  const player = state.players[userId];
  const definition = state.questsById[questId];
  if (player === undefined || player.progression === undefined || definition === undefined) {
    return;
  }
  const rewards = definition.rewards;
  const hasPoints =
    (rewards.attributePoints !== undefined && rewards.attributePoints > 0) ||
    (rewards.skillPoints !== undefined && rewards.skillPoints > 0);
  const hasUnlocks = rewards.abilityUnlockIds !== undefined && rewards.abilityUnlockIds.length > 0;
  if (!hasPoints && !hasUnlocks) {
    return;
  }
  player.progression = applyQuestRewardProgression(player.progression, rewards);
  persistProgressionByUser[userId] = cloneProgression(player.progression);
  refreshPlayerDerived(state, userId);
  pushProgressionState(state, userId, outbound, requestId);
}

function applyKillQuestProgress(
  state: StarterZoneState,
  events: CombatEvent[],
  persistByUser: { [userId: string]: QuestLog },
  outbound: MatchOutbound[],
): void {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "death" || event.targetKind !== "enemy") {
      continue;
    }
    const player = state.players[event.sourceId];
    const enemy = findMatchEnemy(state, event.targetId);
    if (player === undefined || enemy === null) {
      continue;
    }
    const tags = enemy.tags !== undefined ? enemy.tags : [];
    const credited = applyKillObjectives(player.questLog, {
      enemyId: enemy.enemyId,
      tags: tags,
      zoneId: state.zoneId,
      isBoss: tags.indexOf("boss") !== -1,
    });
    if (!credited.changed) {
      continue;
    }
    player.questLog = credited.log;
    persistByUser[event.sourceId] = cloneQuestLog(player.questLog);
    pushQuestState(state, event.sourceId, outbound);
  }
}

function applyEnterQuestProgress(
  state: StarterZoneState,
  persistByUser: { [userId: string]: QuestLog },
  outbound: MatchOutbound[],
): void {
  const locations = enterLocationsFromQuests(state.questsById);
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const userId = ids[i];
    const player = state.players[userId];
    const entered = applyEnterLocation(player.questLog, state.zoneId, player.x, player.y, locations);
    if (!entered.changed) {
      continue;
    }
    player.questLog = entered.log;
    persistByUser[userId] = cloneQuestLog(player.questLog);
    pushQuestState(state, userId, outbound);
  }
}

function commitVendorTrade(
  player: MatchPlayer,
  userId: string,
  requestId: string,
  npcId: string,
  outcome: VendorTradeOutcome,
  persistInventoryByUser: { [userId: string]: PlayerInventory },
  skipStorageUsers: { [userId: string]: boolean },
  commitTxn?: TransactionCommitter,
): boolean {
  if (outcome.replay) {
    return true;
  }
  if (commitTxn !== undefined) {
    const committed = commitTxn({
      requestId: requestId,
      characterId: player.characterId !== undefined ? player.characterId : "",
      userId: userId,
      reasonType: TX_REASON_VENDOR,
      reasonId: npcId,
      goldDelta: outcome.goldDelta,
      currentGold: player.gold !== undefined ? player.gold : 0,
      inventory: outcome.inventory,
      metadata: outcome.metadata,
    });
    if (!committed.ok) {
      return false;
    }
    player.gold = committed.gold;
    player.inventory = outcome.inventory;
    skipStorageUsers[userId] = true;
    return true;
  }
  player.gold = outcome.gold;
  player.inventory = outcome.inventory;
  persistInventoryByUser[userId] = outcome.inventory;
  return true;
}

function pushEconomyResult(
  state: StarterZoneState,
  userId: string,
  outbound: MatchOutbound[],
  requestId: string,
  code: string,
  ok: boolean,
): void {
  const player = state.players[userId];
  if (player === undefined) {
    return;
  }
  const result = actionResult(code, ok, requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  const inventory = inventoryState(
    state.contentHash,
    publicInventory(player.inventory !== undefined ? player.inventory : emptyInventory()),
    requestId,
  );
  outbound.push({ opcode: inventory.opcode, body: inventory.body, toUserId: userId });
  const wallet = walletState(state.contentHash, player.gold !== undefined ? player.gold : 0, requestId);
  outbound.push({ opcode: wallet.opcode, body: wallet.body, toUserId: userId });
}

function rememberInn(player: MatchPlayer, requestId: string, code: string): void {
  const next: { [requestId: string]: string } = {};
  if (player.innByRequestId !== undefined) {
    const keys = Object.keys(player.innByRequestId);
    for (let i = 0; i < keys.length; i++) {
      next[keys[i]] = player.innByRequestId[keys[i]];
    }
  }
  next[requestId] = code;
  player.innByRequestId = next;
}

function resourceCaps(state: StarterZoneState, player: MatchPlayer): { [resourceId: string]: number } {
  const caps: { [resourceId: string]: number } = {};
  if (state.progressionCatalog === undefined || player.classId === undefined || player.progression === undefined) {
    return caps;
  }
  const manaId = resourceIdForRole(state.progressionCatalog, "mana");
  const evaluated = evaluateStats(state.progressionCatalog, {
    classId: player.classId,
    level: player.progression.level,
    allocatedAttributes: player.progression.allocatedAttributes,
    equipmentModifiers: equipmentModifiersFromGear(player.equipment, player.inventory, state.itemsById),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  if (manaId.length > 0) {
    caps[manaId] = evaluated.maxMana;
  }
  return caps;
}
