import { resolveInteraction, type InteractionNpc } from "./interaction";
import {
  cloneInventory,
  clearLocksByLockId,
  emptyInventory,
  findItem,
  isItemLocked,
  occupiedSlots,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import {
  QUEST_STATUS_ACCEPTED,
  QUEST_STATUS_COMPLETED,
  cloneQuestLog,
  questObjectivesSatisfied,
  type QuestDefinition,
  type QuestLog,
} from "./quest";
import { npcOffersQuest, type NpcDefinition } from "./npc";
import { applyGoldMutation, WALLET_CURRENCY_GOLD } from "./wallet";
import { ITEM_ERROR_INVENTORY_FULL, staleRevisionCode } from "./item_errors";
import { applyCapacityPlan, planCapacity } from "./item_capacity";
import { acquireItemLock, LOCK_TYPE_QUEST_TURN_IN } from "./item_lock";
import { appendItemAudits, itemAuditFromChange } from "./item_audit";

export interface QuestTurnInInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  questLog: QuestLog;
  inventory: PlayerInventory | undefined;
  gold: number;
  questId: string;
  npcId: string;
  requestId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  questsById: { [id: string]: QuestDefinition };
  itemsById: { [id: string]: ItemDefinition };
  equippedItems?: ReadonlyArray<ItemInstance>;
  newId: () => string;
  tick?: number;
  npcById?: { [id: string]: NpcDefinition };
  zoneId?: string;
  playerLevel?: number;
  classId?: string;
  inParty?: boolean;
  npcInstanceId?: string;
  expectedRevision?: number;
}

export interface QuestTurnInOutcome {
  ok: boolean;
  code: string;
  persist: boolean;
  replay: boolean;
  log: QuestLog;
  inventory: PlayerInventory;
  gold: number;
  goldDelta: number;
  metadata: { [key: string]: unknown };
  message?: string;
}

export interface QuestRewardWrite {
  userId: string;
  characterId?: string;
  requestId: string;
  questId: string;
  inventory: PlayerInventory;
  log: QuestLog;
  goldDelta: number;
  metadata: { [key: string]: unknown };
}

export interface RewardCommitResult {
  ok: boolean;
  code: string;
  gold: number;
}

export type RewardCommitter = (request: QuestRewardWrite) => RewardCommitResult;

export function applyQuestTurnIn(input: QuestTurnInInput): QuestTurnInOutcome {
  const log = cloneQuestLog(input.questLog);
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const priorCode = log.turnInByRequestId[input.requestId];
  if (priorCode !== undefined) {
    return {
      ok: priorCode === "ok",
      code: priorCode,
      persist: false,
      replay: true,
      log: log,
      inventory: inventory,
      gold: input.gold,
      goldDelta: 0,
      metadata: {},
    };
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return fail(stale, log, inventory, input.gold);
  }
  if (input.playerHealth <= 0) {
    return fail("player_dead", log, inventory, input.gold);
  }
  const definition = input.questsById[input.questId];
  if (definition === undefined) {
    return fail("invalid_id", log, inventory, input.gold);
  }
  const targetId =
    input.npcInstanceId !== undefined && input.npcInstanceId.length > 0 ? input.npcInstanceId : input.npcId;
  const interacted = findTurnInNpc(input.npcs, targetId);
  const catalogId = interacted !== null ? interacted.npcId : targetId;
  if (catalogId !== definition.turnInNpcId) {
    return fail("invalid_target", log, inventory, input.gold);
  }
  const npcDef = input.npcById !== undefined ? input.npcById[catalogId] : undefined;
  const decision = resolveInteraction({
    playerHealth: input.playerHealth,
    playerX: input.playerX,
    playerY: input.playerY,
    targetId: targetId,
    npcs: input.npcs,
    interactionRange: input.interactionRange,
    zoneId: input.zoneId,
    playerLevel: input.playerLevel,
    classId: input.classId,
    inParty: input.inParty,
    questLog: input.questLog,
    npcById: input.npcById,
    requiredService: npcDef !== undefined ? "quest_turn_in" : undefined,
  });
  if (!decision.ok) {
    return fail(decision.code, log, inventory, input.gold);
  }
  if (npcDef !== undefined && !npcOffersQuest(npcDef, input.questId, "quest_turn_in")) {
    return fail("invalid_service", log, inventory, input.gold);
  }
  const progress = log.quests[input.questId];
  if (progress === undefined) {
    return fail("invalid_id", log, inventory, input.gold);
  }
  if (progress.status === QUEST_STATUS_COMPLETED) {
    return fail("already_completed", log, inventory, input.gold);
  }
  if (progress.status !== QUEST_STATUS_ACCEPTED) {
    return fail("invalid_id", log, inventory, input.gold);
  }
  if (!questObjectivesSatisfied(progress)) {
    return fail("incomplete_objective", log, inventory, input.gold);
  }
  const consume = definition.consume !== undefined ? definition.consume : [];
  const allocations = selectConsumeAllocations(inventory, consume);
  if (allocations === null) {
    return fail("missing_item", log, inventory, input.gold);
  }
  const incoming: Array<{ itemId: string; quantity: number; sourceType: string; sourceId: string }> = [];
  for (let j = 0; j < definition.rewards.items.length; j++) {
    const reward = definition.rewards.items[j];
    if (input.itemsById[reward.itemId] === undefined) {
      return fail("invalid_id", log, inventory, input.gold);
    }
    incoming.push({
      itemId: reward.itemId,
      quantity: reward.quantity,
      sourceType: "quest_reward",
      sourceId: input.questId,
    });
  }
  const capacity = planCapacity({
    inventory: inventory,
    incoming: incoming,
    outgoing: allocations,
    definitions: input.itemsById,
    equippedItems: input.equippedItems,
    operationMode: "grant",
  });
  if (!capacity.fits) {
    const code = capacity.failureCode.length > 0 ? capacity.failureCode : ITEM_ERROR_INVENTORY_FULL;
    const needed = capacity.requiredNewInstanceIds > 0 ? capacity.requiredNewInstanceIds : 1;
    return fail(code, log, inventory, input.gold, rewardCapacityMessage(inventory, allocations, needed));
  }
  const goldDelta = definition.rewards.gold > 0 ? definition.rewards.gold : 0;
  const gold = applyGoldMutation({
    characterId: "",
    currentGold: input.gold,
    delta: goldDelta,
    reasonType: "quest_reward",
    reasonId: input.questId,
    requestId: input.requestId,
    metadata: rewardMetadata(input.questId, input.requestId, catalogId, definition),
  });
  if (!gold.ok) {
    return fail(gold.code, log, inventory, input.gold);
  }
  const lockId = "quest-turn-in:" + input.requestId;
  let nextInventory = inventory;
  const nowMs = input.tick !== undefined ? input.tick * 100 : 0;
  for (let a = 0; a < allocations.length; a++) {
    const locked = acquireItemLock({
      inventory: nextInventory,
      instanceId: allocations[a].instanceId,
      lockId: lockId,
      lockType: LOCK_TYPE_QUEST_TURN_IN,
      quantity: allocations[a].quantity,
      ownerOperation: input.requestId,
      nowMs: nowMs,
    });
    if (!locked.ok || locked.lock === null) {
      return fail(locked.code.length > 0 ? locked.code : "item_locked", log, inventory, input.gold);
    }
    nextInventory = locked.inventory;
  }
  const newIds: string[] = [];
  for (let n = 0; n < capacity.requiredNewInstanceIds; n++) {
    newIds.push(input.newId());
  }
  nextInventory = applyCapacityPlan(nextInventory, capacity, newIds);
  nextInventory = clearLocksByLockId(nextInventory, lockId);
  nextInventory.itemAudits = appendItemAudits(nextInventory.itemAudits, [
    itemAuditFromChange({
      transactionId: input.requestId,
      requestId: input.requestId,
      characterId: "",
      operationType: "quest_turn_in",
      definitionId: input.questId,
      instanceId: newIds.length > 0 ? newIds[0] : "",
      quantityBefore: occupiedSlots(inventory),
      quantityAfter: occupiedSlots(nextInventory),
      sourceContainer: "character_bag",
      destinationContainer: "character_bag",
      goldDelta: definition.rewards.gold > 0 ? definition.rewards.gold : 0,
      timestamp: nowMs,
      result: "ok",
    }),
  ]);
  progress.status = QUEST_STATUS_COMPLETED;
  log.turnInByRequestId[input.requestId] = "ok";
  if (input.tick !== undefined) {
    const ticks: { [requestId: string]: number } = {};
    if (log.turnInRequestTicks != null) {
      const keys = Object.keys(log.turnInRequestTicks);
      for (let t = 0; t < keys.length; t++) {
        ticks[keys[t]] = log.turnInRequestTicks[keys[t]];
      }
    }
    ticks[input.requestId] = input.tick;
    log.turnInRequestTicks = ticks;
  }
  return {
    ok: true,
    code: "ok",
    persist: true,
    replay: false,
    log: log,
    inventory: nextInventory,
    gold: gold.resultingBalance,
    goldDelta: gold.goldDelta,
    metadata: gold.metadata,
  };
}

export function walletChangeset(goldDelta: number): { [key: string]: number } {
  const changeset: { [key: string]: number } = {};
  changeset[WALLET_CURRENCY_GOLD] = goldDelta;
  return changeset;
}

function rewardMetadata(
  questId: string,
  requestId: string,
  npcId: string,
  definition: QuestDefinition,
): { [key: string]: unknown } {
  const consumed: string[] = [];
  for (let i = 0; i < definition.consume.length; i++) {
    consumed.push(definition.consume[i].itemId);
  }
  const granted: string[] = [];
  for (let j = 0; j < definition.rewards.items.length; j++) {
    granted.push(definition.rewards.items[j].itemId);
  }
  return {
    source: "quest_turn_in",
    questId: questId,
    requestId: requestId,
    npcId: npcId,
    itemsConsumed: consumed.join(","),
    itemsGranted: granted.join(","),
    gold: definition.rewards.gold,
  };
}

function fail(
  code: string,
  log: QuestLog,
  inventory: PlayerInventory,
  gold: number,
  message?: string,
): QuestTurnInOutcome {
  return {
    ok: false,
    code: code,
    persist: false,
    replay: false,
    log: log,
    inventory: inventory,
    gold: gold,
    goldDelta: 0,
    metadata: {},
    message: message,
  };
}

function selectConsumeAllocations(
  inventory: PlayerInventory,
  consume: ReadonlyArray<{ itemId: string; quantity: number }>,
): Array<{ instanceId: string; quantity: number }> | null {
  const allocations: Array<{ instanceId: string; quantity: number }> = [];
  const remaining: { [itemId: string]: number } = {};
  for (let i = 0; i < consume.length; i++) {
    const current = remaining[consume[i].itemId];
    remaining[consume[i].itemId] = (current !== undefined ? current : 0) + consume[i].quantity;
  }
  const itemIds = Object.keys(remaining);
  for (let i = 0; i < itemIds.length; i++) {
    const itemId = itemIds[i];
    let need = remaining[itemId];
    for (let s = 0; s < inventory.items.length && need > 0; s++) {
      const stack = inventory.items[s];
      if (stack.itemId !== itemId || isItemLocked(stack)) {
        continue;
      }
      const take = stack.quantity < need ? stack.quantity : need;
      allocations.push({ instanceId: stack.instanceId, quantity: take });
      need -= take;
    }
    if (need > 0) {
      return null;
    }
  }
  return allocations;
}

function rewardCapacityMessage(
  inventory: PlayerInventory,
  outgoing: Array<{ instanceId: string; quantity: number }>,
  neededSlots: number,
): string {
  let occupied = occupiedSlots(inventory);
  for (let i = 0; i < outgoing.length; i++) {
    const item = findItem(inventory, outgoing[i].instanceId);
    if (item !== null && outgoing[i].quantity >= item.quantity) {
      occupied -= 1;
    }
  }
  const free = inventory.capacity - occupied;
  const needed = neededSlots > 0 ? neededSlots : 1;
  return (
    "Need " +
    String(needed) +
    " free bag slot(s) after delivering required items; " +
    String(free < 0 ? 0 : free) +
    " available."
  );
}

function findTurnInNpc(
  npcs: ReadonlyArray<InteractionNpc>,
  targetId: string,
): InteractionNpc | null {
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (npc.id === targetId || npc.npcId === targetId) {
      return npc;
    }
  }
  return null;
}
