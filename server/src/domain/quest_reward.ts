import { distance, findNpc, type InteractionNpc } from "./interaction";
import {
  addOrStackItem,
  canAcceptItem,
  cloneInventory,
  consumeItem,
  countItem,
  emptyInventory,
  type ItemDefinition,
  type PlayerInventory,
} from "./inventory";
import {
  QUEST_STATUS_ACCEPTED,
  QUEST_STATUS_COMPLETED,
  cloneQuestLog,
  type QuestDefinition,
  type QuestLog,
} from "./quest";
import { WALLET_CURRENCY_GOLD } from "./wallet";

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
  newId: () => string;
  tick?: number;
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
}

export interface QuestRewardWrite {
  userId: string;
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
  if (input.playerHealth <= 0) {
    return fail("player_dead", log, inventory, input.gold);
  }
  const definition = input.questsById[input.questId];
  if (definition === undefined) {
    return fail("invalid_id", log, inventory, input.gold);
  }
  if (input.npcId !== definition.turnInNpcId) {
    return fail("invalid_target", log, inventory, input.gold);
  }
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return fail("invalid_target", log, inventory, input.gold);
  }
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > input.interactionRange) {
    return fail("out_of_range", log, inventory, input.gold);
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
  if (!objectivesSatisfied(progress.objectives)) {
    return fail("incomplete_objective", log, inventory, input.gold);
  }
  let nextInventory = inventory;
  for (let i = 0; i < definition.consume.length; i++) {
    const need = definition.consume[i];
    if (countItem(nextInventory, need.itemId) < need.quantity) {
      return fail("missing_item", log, nextInventory, input.gold);
    }
    const consumed = consumeItem(nextInventory, need.itemId, need.quantity);
    if (consumed === null) {
      return fail("missing_item", log, nextInventory, input.gold);
    }
    nextInventory = consumed;
  }
  for (let j = 0; j < definition.rewards.items.length; j++) {
    const reward = definition.rewards.items[j];
    const itemDef = input.itemsById[reward.itemId];
    if (itemDef === undefined) {
      return fail("invalid_id", log, inventory, input.gold);
    }
    if (!canAcceptItem(nextInventory, reward.itemId, reward.quantity, itemDef)) {
      return fail("inventory_full", log, inventory, input.gold);
    }
    nextInventory = addOrStackItem(nextInventory, reward.itemId, reward.quantity, input.newId(), itemDef);
  }
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
  const goldDelta = definition.rewards.gold > 0 ? definition.rewards.gold : 0;
  return {
    ok: true,
    code: "ok",
    persist: true,
    replay: false,
    log: log,
    inventory: nextInventory,
    gold: input.gold + goldDelta,
    goldDelta: goldDelta,
    metadata: rewardMetadata(input.questId, input.requestId, input.npcId, definition),
  };
}

export function walletChangeset(goldDelta: number): { [key: string]: number } {
  const changeset: { [key: string]: number } = {};
  changeset[WALLET_CURRENCY_GOLD] = goldDelta;
  return changeset;
}

function objectivesSatisfied(objectives: { current: number; required: number }[]): boolean {
  for (let i = 0; i < objectives.length; i++) {
    if (objectives[i].current < objectives[i].required) {
      return false;
    }
  }
  return objectives.length > 0;
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

function fail(code: string, log: QuestLog, inventory: PlayerInventory, gold: number): QuestTurnInOutcome {
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
  };
}
