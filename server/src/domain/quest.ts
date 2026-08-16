import { distance, findNpc, type InteractionNpc } from "./interaction";
import { countItem, type PlayerInventory } from "./inventory";

export const QUEST_STATUS_ACCEPTED = "accepted";
export const QUEST_STATUS_COMPLETED = "completed";

export interface QuestObjectiveDef {
  type: string;
  itemId: string;
  quantity: number;
}

export interface QuestItemStack {
  itemId: string;
  quantity: number;
}

export interface QuestDefinition {
  id: string;
  displayName: string;
  acceptNpcId: string;
  turnInNpcId: string;
  objectives: QuestObjectiveDef[];
  consume: QuestItemStack[];
  rewards: { gold: number; items: QuestItemStack[] };
  completeOnce: boolean;
}

export interface QuestObjectiveProgress {
  type: string;
  itemId: string;
  current: number;
  required: number;
}

export interface QuestProgress {
  questId: string;
  status: string;
  objectives: QuestObjectiveProgress[];
}

export interface QuestLog {
  quests: { [questId: string]: QuestProgress };
  acceptByRequestId: { [requestId: string]: string };
  turnInByRequestId: { [requestId: string]: string };
}

export interface PublicQuestObjective {
  type: string;
  itemId: string;
  current: number;
  required: number;
}

export interface PublicQuestView {
  questId: string;
  displayName: string;
  status: string;
  turnInNpcId: string;
  objectives: PublicQuestObjective[];
}

export interface QuestCatalogEntry {
  id: string;
  displayName: string;
  acceptNpcId: string;
  turnInNpcId: string;
  objectives: ReadonlyArray<QuestObjectiveDef>;
  consume?: ReadonlyArray<QuestItemStack>;
  rewards?: { gold: number; items: ReadonlyArray<QuestItemStack> };
  completeOnce?: boolean;
}

export interface QuestAcceptInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  questLog: QuestLog;
  questId: string;
  requestId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  questsById: { [id: string]: QuestDefinition };
}

export interface QuestAcceptOutcome {
  ok: boolean;
  code: string;
  persist: boolean;
  log: QuestLog;
}

export function emptyQuestLog(): QuestLog {
  return {
    quests: {},
    acceptByRequestId: {},
    turnInByRequestId: {},
  };
}

export function cloneQuestLog(log: QuestLog): QuestLog {
  const quests: { [questId: string]: QuestProgress } = {};
  const questIds = Object.keys(log.quests);
  for (let i = 0; i < questIds.length; i++) {
    const id = questIds[i];
    quests[id] = cloneQuestProgress(log.quests[id]);
  }
  const acceptByRequestId: { [requestId: string]: string } = {};
  const requestIds = Object.keys(log.acceptByRequestId);
  for (let j = 0; j < requestIds.length; j++) {
    const requestId = requestIds[j];
    acceptByRequestId[requestId] = log.acceptByRequestId[requestId];
  }
  const turnInByRequestId: { [requestId: string]: string } = {};
  const turnInIds = Object.keys(log.turnInByRequestId);
  for (let k = 0; k < turnInIds.length; k++) {
    const requestId = turnInIds[k];
    turnInByRequestId[requestId] = log.turnInByRequestId[requestId];
  }
  return {
    quests: quests,
    acceptByRequestId: acceptByRequestId,
    turnInByRequestId: turnInByRequestId,
  };
}

export function questDefinitionsFromContent(quests: { [id: string]: QuestCatalogEntry }): {
  [id: string]: QuestDefinition;
} {
  const map: { [id: string]: QuestDefinition } = {};
  const ids = Object.keys(quests);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const entry = quests[id];
    const objectives: QuestObjectiveDef[] = [];
    for (let j = 0; j < entry.objectives.length; j++) {
      const objective = entry.objectives[j];
      objectives.push({
        type: objective.type,
        itemId: objective.itemId,
        quantity: objective.quantity,
      });
    }
    const consume: QuestItemStack[] = [];
    if (entry.consume !== undefined) {
      for (let c = 0; c < entry.consume.length; c++) {
        consume.push({ itemId: entry.consume[c].itemId, quantity: entry.consume[c].quantity });
      }
    }
    const rewardItems: QuestItemStack[] = [];
    let gold = 0;
    if (entry.rewards !== undefined) {
      gold = entry.rewards.gold;
      for (let r = 0; r < entry.rewards.items.length; r++) {
        rewardItems.push({
          itemId: entry.rewards.items[r].itemId,
          quantity: entry.rewards.items[r].quantity,
        });
      }
    }
    map[id] = {
      id: entry.id,
      displayName: entry.displayName,
      acceptNpcId: entry.acceptNpcId,
      turnInNpcId: entry.turnInNpcId,
      objectives: objectives,
      consume: consume,
      rewards: { gold: gold, items: rewardItems },
      completeOnce: entry.completeOnce !== false,
    };
  }
  return map;
}

export function applyQuestAccept(input: QuestAcceptInput): QuestAcceptOutcome {
  const log = cloneQuestLog(input.questLog);
  const priorCode = log.acceptByRequestId[input.requestId];
  if (priorCode !== undefined) {
    return { ok: true, code: priorCode, persist: false, log: log };
  }
  if (input.playerHealth <= 0) {
    return { ok: false, code: "player_dead", persist: false, log: log };
  }
  const definition = input.questsById[input.questId];
  if (definition === undefined) {
    return { ok: false, code: "invalid_id", persist: false, log: log };
  }
  const npc = findNpc(input.npcs, definition.acceptNpcId);
  if (npc === null) {
    return { ok: false, code: "invalid_target", persist: false, log: log };
  }
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > input.interactionRange) {
    return { ok: false, code: "out_of_range", persist: false, log: log };
  }
  if (log.quests[input.questId] !== undefined) {
    log.acceptByRequestId[input.requestId] = "already_accepted";
    return { ok: true, code: "already_accepted", persist: true, log: log };
  }
  log.quests[input.questId] = createAcceptedProgress(definition);
  log.acceptByRequestId[input.requestId] = "accepted";
  return { ok: true, code: "accepted", persist: true, log: log };
}

export function syncAcquireObjectives(
  log: QuestLog,
  inventory: PlayerInventory | undefined,
): { log: QuestLog; changed: boolean } {
  const next = cloneQuestLog(log);
  let changed = false;
  const ids = Object.keys(next.quests);
  for (let i = 0; i < ids.length; i++) {
    const progress = next.quests[ids[i]];
    if (progress.status !== QUEST_STATUS_ACCEPTED) {
      continue;
    }
    for (let j = 0; j < progress.objectives.length; j++) {
      const objective = progress.objectives[j];
      if (objective.type !== "acquire_item") {
        continue;
      }
      const owned = countItem(inventory, objective.itemId);
      const current = owned < objective.required ? owned : objective.required;
      if (current !== objective.current) {
        objective.current = current;
        changed = true;
      }
    }
  }
  return { log: next, changed: changed };
}

export function publicQuestViews(
  log: QuestLog,
  questsById: { [id: string]: QuestDefinition },
): PublicQuestView[] {
  const ids = Object.keys(log.quests);
  ids.sort();
  const views: PublicQuestView[] = [];
  for (let i = 0; i < ids.length; i++) {
    const progress = log.quests[ids[i]];
    const definition = questsById[progress.questId];
    views.push(toPublicView(progress, definition));
  }
  return views;
}

export function publicQuestPayloads(
  log: QuestLog,
  questsById: { [id: string]: QuestDefinition },
): { [key: string]: unknown }[] {
  const views = publicQuestViews(log, questsById);
  const payloads: { [key: string]: unknown }[] = [];
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const objectives: { [key: string]: unknown }[] = [];
    for (let j = 0; j < view.objectives.length; j++) {
      const objective = view.objectives[j];
      objectives.push({
        type: objective.type,
        itemId: objective.itemId,
        current: objective.current,
        required: objective.required,
      });
    }
    payloads.push({
      questId: view.questId,
      displayName: view.displayName,
      status: view.status,
      turnInNpcId: view.turnInNpcId,
      objectives: objectives,
    });
  }
  return payloads;
}

function createAcceptedProgress(definition: QuestDefinition): QuestProgress {
  const objectives: QuestObjectiveProgress[] = [];
  for (let i = 0; i < definition.objectives.length; i++) {
    const objective = definition.objectives[i];
    objectives.push({
      type: objective.type,
      itemId: objective.itemId,
      current: 0,
      required: objective.quantity,
    });
  }
  return {
    questId: definition.id,
    status: QUEST_STATUS_ACCEPTED,
    objectives: objectives,
  };
}

function cloneQuestProgress(progress: QuestProgress): QuestProgress {
  const objectives: QuestObjectiveProgress[] = [];
  for (let i = 0; i < progress.objectives.length; i++) {
    const objective = progress.objectives[i];
    objectives.push({
      type: objective.type,
      itemId: objective.itemId,
      current: objective.current,
      required: objective.required,
    });
  }
  return {
    questId: progress.questId,
    status: progress.status,
    objectives: objectives,
  };
}

function toPublicView(progress: QuestProgress, definition: QuestDefinition | undefined): PublicQuestView {
  const objectives: PublicQuestObjective[] = [];
  for (let i = 0; i < progress.objectives.length; i++) {
    const objective = progress.objectives[i];
    objectives.push({
      type: objective.type,
      itemId: objective.itemId,
      current: objective.current,
      required: objective.required,
    });
  }
  return {
    questId: progress.questId,
    displayName: definition !== undefined ? definition.displayName : progress.questId,
    status: progress.status,
    turnInNpcId: definition !== undefined ? definition.turnInNpcId : "",
    objectives: objectives,
  };
}
