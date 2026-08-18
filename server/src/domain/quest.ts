import { distance, findNpc, type InteractionNpc } from "./interaction";
import { npcOffersQuest, type NpcDefinition } from "./npc";
import { countItem, type PlayerInventory } from "./inventory";
import { cloneTickMap, dict } from "./maps";
import { cloneExtras, envelopeFromRecord } from "./save_schema";

export const QUEST_STATUS_ACCEPTED = "accepted";
export const QUEST_STATUS_COMPLETED = "completed";
export const QUEST_CATEGORY_MAIN = "main";
export const QUEST_CATEGORY_SIDE = "side";

export interface QuestObjectiveDef {
  type: string;
  itemId?: string;
  npcId?: string;
  enemyId?: string;
  quantity: number;
  enemyTags?: ReadonlyArray<string>;
  itemTags?: ReadonlyArray<string>;
  zoneId?: string;
  instanceId?: string;
  location?: { x: number; y: number; width: number; height: number };
  partyCreditPolicy?: string;
}

export interface QuestStageDef {
  id: string;
  objectives: QuestObjectiveDef[];
}

export interface QuestItemStack {
  itemId: string;
  quantity: number;
}

export interface QuestRewards {
  gold: number;
  xp?: number;
  items: QuestItemStack[];
  abilityUnlockIds?: string[];
  attributePoints?: number;
  skillPoints?: number;
}

export interface QuestPrerequisites {
  questIds?: ReadonlyArray<string>;
  minLevel?: number;
  classIds?: ReadonlyArray<string>;
}

export interface QuestDefinition {
  id: string;
  displayName: string;
  category: string;
  acceptNpcId: string;
  turnInNpcId: string;
  objectives: QuestObjectiveDef[];
  stages: QuestStageDef[];
  consume: QuestItemStack[];
  rewards: QuestRewards;
  completeOnce: boolean;
  repeatable: boolean;
  prerequisites?: QuestPrerequisites;
}

export interface QuestObjectiveProgress {
  type: string;
  itemId?: string;
  npcId?: string;
  enemyId?: string;
  enemyTags?: string[];
  zoneId?: string;
  current: number;
  required: number;
  stageId?: string;
  stageIndex?: number;
  partyCreditPolicy?: string;
}

export interface QuestProgress {
  questId: string;
  status: string;
  stageIndex?: number;
  objectives: QuestObjectiveProgress[];
}

export interface QuestLog {
  quests: { [questId: string]: QuestProgress };
  acceptByRequestId: { [requestId: string]: string };
  turnInByRequestId: { [requestId: string]: string };
  acceptRequestTicks?: { [requestId: string]: number };
  turnInRequestTicks?: { [requestId: string]: number };
  schemaVersion?: number;
  createdAt?: number;
  updatedAt?: number;
  extras?: { [key: string]: unknown };
}

export interface PublicQuestObjective {
  type: string;
  itemId?: string;
  npcId?: string;
  enemyId?: string;
  current: number;
  required: number;
  stageId?: string;
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
  category?: string;
  acceptNpcId: string;
  turnInNpcId: string;
  startNpcId?: string;
  objectives?: ReadonlyArray<QuestObjectiveDef>;
  stages?: ReadonlyArray<{ id: string; objectives: ReadonlyArray<QuestObjectiveDef> }>;
  consume?: ReadonlyArray<QuestItemStack>;
  rewards?: {
    gold: number;
    xp?: number;
    items: ReadonlyArray<QuestItemStack>;
    abilityUnlockIds?: ReadonlyArray<string>;
    attributePoints?: number;
    skillPoints?: number;
  };
  completeOnce?: boolean;
  repeatable?: boolean;
  prerequisites?: QuestPrerequisites;
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
  tick?: number;
  playerLevel?: number;
  classId?: string;
  inParty?: boolean;
  npcById?: { [id: string]: NpcDefinition };
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
  if (log == null) {
    return emptyQuestLog();
  }
  const quests: { [questId: string]: QuestProgress } = {};
  const questSource = dict(log.quests);
  const questIds = Object.keys(questSource);
  for (let i = 0; i < questIds.length; i++) {
    const id = questIds[i];
    const progress = questSource[id];
    if (progress == null) {
      continue;
    }
    quests[id] = cloneQuestProgress(progress);
  }
  const acceptByRequestId: { [requestId: string]: string } = {};
  const acceptSource = dict(log.acceptByRequestId);
  const requestIds = Object.keys(acceptSource);
  for (let j = 0; j < requestIds.length; j++) {
    const requestId = requestIds[j];
    acceptByRequestId[requestId] = acceptSource[requestId];
  }
  const turnInByRequestId: { [requestId: string]: string } = {};
  const turnInSource = dict(log.turnInByRequestId);
  const turnInIds = Object.keys(turnInSource);
  for (let k = 0; k < turnInIds.length; k++) {
    const requestId = turnInIds[k];
    turnInByRequestId[requestId] = turnInSource[requestId];
  }
  const envelope = envelopeFromRecord(log);
  return {
    quests: quests,
    acceptByRequestId: acceptByRequestId,
    turnInByRequestId: turnInByRequestId,
    acceptRequestTicks: cloneTickMap(log.acceptRequestTicks),
    turnInRequestTicks: cloneTickMap(log.turnInRequestTicks),
    schemaVersion: envelope.schemaVersion,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    extras: cloneExtras(log.extras),
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
    const stages = stagesFromEntry(entry);
    const objectives = flattenStages(stages);
    const consume: QuestItemStack[] = [];
    if (Array.isArray(entry.consume)) {
      for (let c = 0; c < entry.consume.length; c++) {
        consume.push({ itemId: entry.consume[c].itemId, quantity: entry.consume[c].quantity });
      }
    }
    const rewardItems: QuestItemStack[] = [];
    let gold = 0;
    let xp = 0;
    const abilityUnlockIds: string[] = [];
    let attributePoints = 0;
    let skillPoints = 0;
    if (entry.rewards !== undefined && entry.rewards !== null && typeof entry.rewards === "object") {
      gold = entry.rewards.gold;
      if (entry.rewards.xp !== undefined) {
        xp = entry.rewards.xp;
      }
      const items = entry.rewards.items !== undefined ? entry.rewards.items : [];
      for (let r = 0; r < items.length; r++) {
        rewardItems.push({
          itemId: items[r].itemId,
          quantity: items[r].quantity,
        });
      }
      if (entry.rewards.abilityUnlockIds !== undefined) {
        for (let u = 0; u < entry.rewards.abilityUnlockIds.length; u++) {
          abilityUnlockIds.push(entry.rewards.abilityUnlockIds[u]);
        }
      }
      if (entry.rewards.attributePoints !== undefined) {
        attributePoints = entry.rewards.attributePoints;
      }
      if (entry.rewards.skillPoints !== undefined) {
        skillPoints = entry.rewards.skillPoints;
      }
    }
    const rewards: QuestRewards = { gold: gold, items: rewardItems };
    if (xp > 0) {
      rewards.xp = xp;
    }
    if (abilityUnlockIds.length > 0) {
      rewards.abilityUnlockIds = abilityUnlockIds;
    }
    if (attributePoints > 0) {
      rewards.attributePoints = attributePoints;
    }
    if (skillPoints > 0) {
      rewards.skillPoints = skillPoints;
    }
    const acceptNpcId =
      typeof entry.startNpcId === "string" && entry.startNpcId.length > 0 ? entry.startNpcId : entry.acceptNpcId;
    const mapped: QuestDefinition = {
      id: entry.id,
      displayName: entry.displayName,
      category: entry.category !== undefined ? entry.category : QUEST_CATEGORY_SIDE,
      acceptNpcId: acceptNpcId,
      turnInNpcId: entry.turnInNpcId,
      objectives: objectives,
      stages: stages,
      consume: consume,
      rewards: rewards,
      completeOnce: entry.completeOnce !== false,
      repeatable: entry.repeatable === true,
    };
    const prereq = objectRecord(entry.prerequisites);
    if (prereq !== undefined) {
      const copied: QuestPrerequisites = {};
      if (typeof prereq.minLevel === "number") {
        copied.minLevel = prereq.minLevel;
      }
      const classIds = stringList(prereq.classIds);
      if (classIds.length > 0) {
        copied.classIds = classIds;
      }
      const questIds = stringList(prereq.questIds);
      if (questIds.length > 0) {
        copied.questIds = questIds;
      }
      mapped.prerequisites = copied;
    }
    map[id] = mapped;
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
  const range = npc.interactionRange !== undefined ? npc.interactionRange : input.interactionRange;
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > range) {
    return { ok: false, code: "out_of_range", persist: false, log: log };
  }
  if (input.npcById !== undefined) {
    const npcDef = input.npcById[definition.acceptNpcId];
    if (npcDef !== undefined && !npcOffersQuest(npcDef, definition.id, "quest_offer")) {
      return { ok: false, code: "invalid_service", persist: false, log: log };
    }
  }
  const existing = log.quests[input.questId];
  if (existing !== undefined && !(definition.repeatable && existing.status === QUEST_STATUS_COMPLETED)) {
    log.acceptByRequestId[input.requestId] = "already_accepted";
    stampAcceptTick(log, input.requestId, input.tick);
    return { ok: true, code: "already_accepted", persist: true, log: log };
  }
  const prereq = evaluatePrerequisites(definition, log, input.playerLevel, input.classId);
  if (prereq.length > 0) {
    return { ok: false, code: prereq, persist: false, log: log };
  }
  if (input.inParty !== true && requiresParty(definition)) {
    return { ok: false, code: "party_required", persist: false, log: log };
  }
  log.quests[input.questId] = createAcceptedProgress(definition);
  log.acceptByRequestId[input.requestId] = "accepted";
  stampAcceptTick(log, input.requestId, input.tick);
  return { ok: true, code: "accepted", persist: true, log: log };
}

function stampAcceptTick(log: QuestLog, requestId: string, tick: number | undefined): void {
  if (tick === undefined) {
    return;
  }
  const ticks: { [requestId: string]: number } = {};
  if (log.acceptRequestTicks != null) {
    const keys = Object.keys(log.acceptRequestTicks);
    for (let i = 0; i < keys.length; i++) {
      ticks[keys[i]] = log.acceptRequestTicks[keys[i]];
    }
  }
  ticks[requestId] = tick;
  log.acceptRequestTicks = ticks;
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
      if (objective.type !== "acquire_item" && objective.type !== "collect_item") {
        continue;
      }
      if (objective.itemId === undefined) {
        continue;
      }
      if (!isCurrentStageObjective(progress, objective)) {
        continue;
      }
      const owned = countItem(inventory, objective.itemId);
      const current = owned < objective.required ? owned : objective.required;
      if (current !== objective.current) {
        objective.current = current;
        changed = true;
      }
    }
    if (advanceStages(progress)) {
      changed = true;
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
        npcId: objective.npcId,
        enemyId: objective.enemyId,
        current: objective.current,
        required: objective.required,
        stageId: objective.stageId,
      });
    }
    const payload: { [key: string]: unknown } = {
      questId: view.questId,
      displayName: view.displayName,
      status: view.status,
      turnInNpcId: view.turnInNpcId,
      objectives: objectives,
    };
    payloads.push(payload);
  }
  return payloads;
}

export function createAcceptedProgress(definition: QuestDefinition): QuestProgress {
  const objectives: QuestObjectiveProgress[] = [];
  for (let s = 0; s < definition.stages.length; s++) {
    const stage = definition.stages[s];
    for (let i = 0; i < stage.objectives.length; i++) {
      const objective = stage.objectives[i];
      const progress: QuestObjectiveProgress = {
        type: objective.type,
        current: 0,
        required: objective.quantity > 0 ? objective.quantity : 1,
        stageId: stage.id,
        stageIndex: s,
      };
      if (objective.itemId !== undefined) {
        progress.itemId = objective.itemId;
      }
      if (objective.npcId !== undefined) {
        progress.npcId = objective.npcId;
      }
      if (objective.enemyId !== undefined) {
        progress.enemyId = objective.enemyId;
      }
      if (objective.enemyTags !== undefined) {
        progress.enemyTags = objective.enemyTags.slice();
      }
      if (objective.zoneId !== undefined) {
        progress.zoneId = objective.zoneId;
      }
      if (objective.partyCreditPolicy !== undefined) {
        progress.partyCreditPolicy = objective.partyCreditPolicy;
      }
      objectives.push(progress);
    }
  }
  return {
    questId: definition.id,
    status: QUEST_STATUS_ACCEPTED,
    stageIndex: 0,
    objectives: objectives,
  };
}

function cloneQuestProgress(progress: QuestProgress): QuestProgress {
  const objectives: QuestObjectiveProgress[] = [];
  for (let i = 0; i < progress.objectives.length; i++) {
    const objective = progress.objectives[i];
    const copied: QuestObjectiveProgress = {
      type: objective.type,
      current: objective.current,
      required: objective.required,
    };
    if (objective.itemId !== undefined) {
      copied.itemId = objective.itemId;
    }
    if (objective.npcId !== undefined) {
      copied.npcId = objective.npcId;
    }
    if (objective.enemyId !== undefined) {
      copied.enemyId = objective.enemyId;
    }
    if (objective.enemyTags !== undefined) {
      copied.enemyTags = objective.enemyTags.slice();
    }
    if (objective.zoneId !== undefined) {
      copied.zoneId = objective.zoneId;
    }
    if (objective.partyCreditPolicy !== undefined) {
      copied.partyCreditPolicy = objective.partyCreditPolicy;
    }
    if (objective.stageId !== undefined) {
      copied.stageId = objective.stageId;
    }
    if (objective.stageIndex !== undefined) {
      copied.stageIndex = objective.stageIndex;
    }
    objectives.push(copied);
  }
  return {
    questId: progress.questId,
    status: progress.status,
    stageIndex: progress.stageIndex !== undefined ? progress.stageIndex : 0,
    objectives: objectives,
  };
}

function toPublicView(progress: QuestProgress, definition: QuestDefinition | undefined): PublicQuestView {
  const objectives: PublicQuestObjective[] = [];
  for (let i = 0; i < progress.objectives.length; i++) {
    const objective = progress.objectives[i];
    const view: PublicQuestObjective = {
      type: objective.type,
      current: objective.current,
      required: objective.required,
    };
    if (objective.itemId !== undefined) {
      view.itemId = objective.itemId;
    }
    if (objective.npcId !== undefined) {
      view.npcId = objective.npcId;
    }
    if (objective.enemyId !== undefined) {
      view.enemyId = objective.enemyId;
    }
    if (objective.stageId !== undefined) {
      view.stageId = objective.stageId;
    }
    objectives.push(view);
  }
  return {
    questId: progress.questId,
    displayName: definition !== undefined ? definition.displayName : progress.questId,
    status: progress.status,
    turnInNpcId: definition !== undefined ? definition.turnInNpcId : "",
    objectives: objectives,
  };
}

function stagesFromEntry(entry: QuestCatalogEntry): QuestStageDef[] {
  if (Array.isArray(entry.stages) && entry.stages.length > 0) {
    const stages: QuestStageDef[] = [];
    for (let s = 0; s < entry.stages.length; s++) {
      const stage = entry.stages[s];
      const objectives: QuestObjectiveDef[] = [];
      for (let o = 0; o < stage.objectives.length; o++) {
        objectives.push(copyObjective(stage.objectives[o]));
      }
      stages.push({ id: stage.id, objectives: objectives });
    }
    return stages;
  }
  const objectives: QuestObjectiveDef[] = [];
  const source = Array.isArray(entry.objectives) ? entry.objectives : [];
  for (let i = 0; i < source.length; i++) {
    objectives.push(copyObjective(source[i]));
  }
  return [{ id: "stage.0", objectives: objectives }];
}

function flattenStages(stages: QuestStageDef[]): QuestObjectiveDef[] {
  const objectives: QuestObjectiveDef[] = [];
  for (let s = 0; s < stages.length; s++) {
    for (let o = 0; o < stages[s].objectives.length; o++) {
      objectives.push(stages[s].objectives[o]);
    }
  }
  return objectives;
}

function copyObjective(objective: QuestObjectiveDef): QuestObjectiveDef {
  const copied: QuestObjectiveDef = {
    type: objective.type,
    quantity: objective.quantity !== undefined && objective.quantity > 0 ? objective.quantity : 1,
  };
  if (objective.itemId !== undefined) {
    copied.itemId = objective.itemId;
  }
  if (objective.npcId !== undefined) {
    copied.npcId = objective.npcId;
  }
  if (objective.enemyId !== undefined) {
    copied.enemyId = objective.enemyId;
  }
  if (objective.enemyTags !== undefined) {
    copied.enemyTags = objective.enemyTags.slice();
  }
  if (objective.itemTags !== undefined) {
    copied.itemTags = objective.itemTags.slice();
  }
  if (objective.zoneId !== undefined) {
    copied.zoneId = objective.zoneId;
  }
  if (objective.instanceId !== undefined) {
    copied.instanceId = objective.instanceId;
  }
  if (objective.location !== undefined) {
    copied.location = {
      x: objective.location.x,
      y: objective.location.y,
      width: objective.location.width,
      height: objective.location.height,
    };
  }
  if (objective.partyCreditPolicy !== undefined) {
    copied.partyCreditPolicy = objective.partyCreditPolicy;
  }
  return copied;
}

function evaluatePrerequisites(
  definition: QuestDefinition,
  log: QuestLog,
  playerLevel: number | undefined,
  classId: string | undefined,
): string {
  const prereq = objectRecord(definition.prerequisites);
  if (prereq === undefined) {
    return "";
  }
  if (typeof prereq.minLevel === "number" && (playerLevel !== undefined ? playerLevel : 1) < prereq.minLevel) {
    return "level_too_low";
  }
  const classIds = stringList(prereq.classIds);
  if (classIds.length > 0) {
    const id = classId !== undefined ? classId : "";
    if (classIds.indexOf(id) === -1) {
      return "class_restricted";
    }
  }
  const questIds = stringList(prereq.questIds);
  for (let i = 0; i < questIds.length; i++) {
    const other = log.quests[questIds[i]];
    if (other === undefined || other.status !== QUEST_STATUS_COMPLETED) {
      return "missing_prerequisite";
    }
  }
  return "";
}

function objectRecord(value: unknown): { [key: string]: unknown } | undefined {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as { [key: string]: unknown };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] === "string") {
      out.push(value[i]);
    }
  }
  return out;
}

function requiresParty(definition: QuestDefinition): boolean {
  for (let i = 0; i < definition.objectives.length; i++) {
    if (definition.objectives[i].partyCreditPolicy === "party") {
      return true;
    }
  }
  for (let s = 0; s < definition.stages.length; s++) {
    const objectives = definition.stages[s].objectives;
    for (let i = 0; i < objectives.length; i++) {
      if (objectives[i].partyCreditPolicy === "party") {
        return true;
      }
    }
  }
  return false;
}

export function isCurrentStageObjective(progress: QuestProgress, objective: QuestObjectiveProgress): boolean {
  const stageIndex = progress.stageIndex !== undefined ? progress.stageIndex : 0;
  if (objective.stageIndex === undefined) {
    return true;
  }
  return objective.stageIndex === stageIndex;
}

export function stageObjectivesComplete(progress: QuestProgress, stageIndex: number): boolean {
  let saw = false;
  for (let i = 0; i < progress.objectives.length; i++) {
    const objective = progress.objectives[i];
    const index = objective.stageIndex !== undefined ? objective.stageIndex : 0;
    if (index !== stageIndex) {
      continue;
    }
    saw = true;
    if (objective.current < objective.required) {
      return false;
    }
  }
  return saw;
}

export function advanceStages(progress: QuestProgress): boolean {
  if (progress.status !== QUEST_STATUS_ACCEPTED) {
    return false;
  }
  let changed = false;
  let stageIndex = progress.stageIndex !== undefined ? progress.stageIndex : 0;
  let maxStage = 0;
  for (let i = 0; i < progress.objectives.length; i++) {
    const index = progress.objectives[i].stageIndex !== undefined ? (progress.objectives[i].stageIndex as number) : 0;
    if (index > maxStage) {
      maxStage = index;
    }
  }
  while (stageIndex <= maxStage && stageObjectivesComplete(progress, stageIndex)) {
    stageIndex += 1;
    changed = true;
  }
  progress.stageIndex = stageIndex;
  return changed;
}

export function questObjectivesSatisfied(progress: QuestProgress): boolean {
  if (progress.objectives.length === 0) {
    return false;
  }
  for (let i = 0; i < progress.objectives.length; i++) {
    if (progress.objectives[i].current < progress.objectives[i].required) {
      return false;
    }
  }
  return true;
}

export function incrementObjective(
  progress: QuestProgress,
  matcher: (objective: QuestObjectiveProgress) => boolean,
  amount: number,
): boolean {
  if (progress.status !== QUEST_STATUS_ACCEPTED || amount <= 0) {
    return false;
  }
  let changed = false;
  for (let i = 0; i < progress.objectives.length; i++) {
    const objective = progress.objectives[i];
    if (!isCurrentStageObjective(progress, objective)) {
      continue;
    }
    if (!matcher(objective)) {
      continue;
    }
    const next = objective.current + amount;
    const capped = next < objective.required ? next : objective.required;
    if (capped !== objective.current) {
      objective.current = capped;
      changed = true;
    }
  }
  if (changed) {
    advanceStages(progress);
  }
  return changed;
}
