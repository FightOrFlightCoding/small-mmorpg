import {
  ClientOpcode,
  ServerOpcode,
  actionResult,
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
  buildFullState,
  buildSnapshot,
  cloneStarterZoneState,
  fullStateOpcode,
  snapshotOpcode,
} from "./match_state";
import { intendedDelta, resolveMove } from "./movement";
import { resolveInteraction } from "./interaction";
import { applyQuestAccept, cloneQuestLog, publicQuestPayloads, syncAcquireObjectives, type QuestLog } from "./quest";
import {
  applyQuestTurnIn,
  type QuestRewardWrite,
  type RewardCommitter,
} from "./quest_reward";
import { applyPlayerAttack, type CombatEvent } from "./combat";
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
import { applyPickup, expireLoot, lootExpireTicks, spawnGuaranteedLoot } from "./loot";
import {
  allocateAttributes,
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
      combatEvents,
      makeId,
      commitReward,
    );
    collectFailedApplies(outbound, outboundBefore, incoming.userId, action, tick, rejections);
  }

  simulateMovement(next, 1 / MATCH_TICK_RATE);
  simulateCombatants(next, tick, 1 / MATCH_TICK_RATE, MATCH_TICK_RATE, combatEvents);
  spawnLootFromDeaths(next, tick, combatEvents, makeId);
  next.loot = expireLoot(next.loot, tick);
  pushCombatEvents(outbound, tick, combatEvents);
  expireDisconnected(next, tick);
  const persistCheckpoints = collectPositionCheckpoints(next, tick);
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
  combatEvents: CombatEvent[],
  makeId: () => string,
  commitReward?: RewardCommitter,
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
    handleInteract(parsed, userId, state, outbound);
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
    handleAttack(parsed, userId, state, tick, outbound, combatEvents, persistProgressionByUser);
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
  const result = actionResult("not_implemented", false, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
}

function handleInteract(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  outbound: MatchOutbound[],
): void {
  const targetId = parsed.fields.targetId;
  const player = state.players[userId];
  if (player === undefined) {
    const missing = interactionResult("player_missing", false, parsed.requestId, targetId);
    outbound.push({ opcode: missing.opcode, body: missing.body, toUserId: userId });
    return;
  }
  const decision = resolveInteraction({
    playerHealth: player.health,
    playerX: player.x,
    playerY: player.y,
    targetId: targetId,
    npcs: state.npcs,
    interactionRange: state.interactionRange,
  });
  const result = interactionResult(decision.code, decision.ok, parsed.requestId, targetId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
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
  });
  player.questLog = outcome.log;
  const synced = syncAcquireObjectives(player.questLog, player.inventory);
  player.questLog = synced.log;
  if (outcome.persist || synced.changed) {
    persistByUser[userId] = cloneQuestLog(player.questLog);
  }
  const result = actionResult(outcome.code, outcome.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (outcome.ok) {
    const quests = questState(
      state.contentHash,
      publicQuestPayloads(player.questLog, state.questsById),
      parsed.requestId,
    );
    outbound.push({ opcode: quests.opcode, body: quests.body, toUserId: userId });
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
    const notice = systemMessage(
      "quest_complete",
      "Quest complete. You received an Iron Sword and 25 gold.",
    );
    outbound.push({ opcode: notice.opcode, body: notice.body, toUserId: userId });
  }
}

function handleAttack(
  parsed: ParsedClientMessage,
  userId: string,
  state: StarterZoneState,
  tick: number,
  outbound: MatchOutbound[],
  combatEvents: CombatEvent[],
  persistProgressionByUser: { [userId: string]: CharacterProgression },
): void {
  const eventStart = combatEvents.length;
  const decision = applyPlayerAttack(
    {
      player: state.players[userId],
      targetId: parsed.fields.targetId,
      requestId: parsed.requestId as string,
      tick: tick,
      enemies: state.enemies,
      attack: playerAttack(state, userId),
      attackRange: state.playerAttackRange,
      attackCooldownSec: state.playerAttackCooldownSec,
      tickRate: MATCH_TICK_RATE,
    },
    combatEvents,
  );
  const result = actionResult(decision.code, decision.ok, parsed.requestId);
  outbound.push({ opcode: result.opcode, body: result.body, toUserId: userId });
  if (decision.ok && !decision.replay) {
    grantKillXpFromEvents(state, userId, combatEvents, eventStart, tick, persistProgressionByUser, outbound);
  }
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
    const synced = syncCombatStatsFromPipeline(player, state.progressionCatalog, state.itemsById);
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
  const expireTicks = lootExpireTicks(MATCH_TICK_RATE);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "death" || event.targetKind !== "enemy") {
      continue;
    }
    const enemy = findEnemyById(state, event.targetId);
    if (enemy === null) {
      continue;
    }
    const drops = state.enemyLootById[enemy.enemyId];
    state.loot = spawnGuaranteedLoot(
      state.loot,
      drops,
      event.x !== undefined ? event.x : enemy.x,
      event.y !== undefined ? event.y : enemy.y,
      tick,
      expireTicks,
      newId,
    );
  }
}

function findEnemyById(state: StarterZoneState, enemyId: string) {
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === enemyId) {
      return state.enemies[i];
    }
  }
  return null;
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
  userId: string,
  events: CombatEvent[],
  startIndex: number,
  tick: number,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
): void {
  for (let i = startIndex; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "death" || event.targetKind !== "enemy" || event.sourceId !== userId) {
      continue;
    }
    const enemy = findMatchEnemy(state, event.targetId);
    if (enemy === null || enemy.xpReward <= 0) {
      continue;
    }
    applyTrustedXp(
      state,
      userId,
      {
        characterId: characterIdOf(state, userId) !== undefined ? (characterIdOf(state, userId) as string) : "",
        amount: enemy.xpReward,
        reasonType: "kill",
        reasonId: enemy.enemyId,
        eventId: "kill:" + enemy.id + ":" + String(enemy.deathCount),
      },
      tick,
      persistProgressionByUser,
      outbound,
    );
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
  applyTrustedXp(
    state,
    userId,
    {
      characterId: characterIdOf(state, userId) !== undefined ? (characterIdOf(state, userId) as string) : "",
      amount: amount,
      reasonType: "quest",
      reasonId: questId,
      eventId: "quest:" + questId + ":" + requestId,
    },
    tick,
    persistProgressionByUser,
    outbound,
  );
}

function applyTrustedXp(
  state: StarterZoneState,
  userId: string,
  grant: {
    characterId: string;
    amount: number;
    reasonType: string;
    reasonId: string;
    eventId: string;
  },
  tick: number,
  persistProgressionByUser: { [userId: string]: CharacterProgression },
  outbound: MatchOutbound[],
): void {
  const player = state.players[userId];
  if (player === undefined || player.progression === undefined || state.progressionCatalog === undefined) {
    return;
  }
  const classId = player.classId !== undefined ? player.classId : "";
  if (classId.length === 0) {
    return;
  }
  const outcome = grantXp(player.progression, state.progressionCatalog, classId, grant, tick);
  player.progression = outcome.progression;
  if (outcome.changed) {
    persistProgressionByUser[userId] = cloneProgression(player.progression);
    refreshPlayerDerived(state, userId);
    pushProgressionState(state, userId, outbound);
  }
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
    effectModifiers: emptyModifierMap(),
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
