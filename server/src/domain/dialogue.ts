import { NPC_SERVICE_DIALOGUE, type NpcDefinition, type NpcService } from "./npc";
import { authorizeNpcService, type InteractionInput } from "./interaction";
import type { QuestLog } from "./quest";
import type { PlayerInventory } from "./inventory";

export interface DialogueCondition {
  type: "quest_status" | "offered_quest_status" | "min_level" | "class_id" | "has_item";
  questId?: string;
  status?: string;
  minLevel?: number;
  classId?: string;
  itemId?: string;
}

export interface DialogueLine {
  text: string;
  textKey?: string;
}

export interface DialogueOption {
  id: string;
  text: string;
  textKey?: string;
  nextNodeId: string;
  conditions?: ReadonlyArray<DialogueCondition>;
}

export interface DialogueNode {
  id: string;
  lines: ReadonlyArray<DialogueLine>;
  options?: ReadonlyArray<DialogueOption>;
}

export interface DialogueEntry {
  nodeId: string;
  conditions?: ReadonlyArray<DialogueCondition>;
}

export interface DialogueDefinition {
  id: string;
  displayName?: string;
  displayNameKey?: string;
  startNodeId: string;
  entry?: ReadonlyArray<DialogueEntry>;
  nodes: { [id: string]: DialogueNode };
}

export interface DialogueEvalContext {
  playerLevel: number;
  classId: string;
  questLog?: QuestLog;
  offeredQuestIds: ReadonlyArray<string>;
  itemCounts: { [itemId: string]: number };
}

export function dialogueDefinitionsFromContent(dialogues: {
  [id: string]: {
    id: string;
    displayName?: string;
    displayNameKey?: string;
    startNodeId: string;
    entry?: ReadonlyArray<DialogueEntry>;
    nodes: { [id: string]: DialogueNode };
  };
}): { [id: string]: DialogueDefinition } {
  const map: { [id: string]: DialogueDefinition } = {};
  const ids = Object.keys(dialogues);
  for (let i = 0; i < ids.length; i++) {
    const entry = dialogues[ids[i]];
    map[ids[i]] = copyDialogue(entry);
  }
  return map;
}

export function copyDialogue(source: DialogueDefinition): DialogueDefinition {
  const nodes: { [id: string]: DialogueNode } = {};
  const nodeIds = Object.keys(source.nodes);
  for (let i = 0; i < nodeIds.length; i++) {
    nodes[nodeIds[i]] = copyNode(source.nodes[nodeIds[i]]);
  }
  const definition: DialogueDefinition = {
    id: source.id,
    startNodeId: source.startNodeId,
    nodes: nodes,
  };
  if (source.displayName !== undefined) {
    definition.displayName = source.displayName;
  }
  if (source.displayNameKey !== undefined) {
    definition.displayNameKey = source.displayNameKey;
  }
  if (source.entry !== undefined) {
    const entry: DialogueEntry[] = [];
    for (let e = 0; e < source.entry.length; e++) {
      entry.push({
        nodeId: source.entry[e].nodeId,
        conditions: copyConditions(source.entry[e].conditions),
      });
    }
    definition.entry = entry;
  }
  return definition;
}

export function resolveDialogueNodeId(
  dialogue: DialogueDefinition | undefined,
  context: DialogueEvalContext,
): string {
  if (dialogue === undefined) {
    return "";
  }
  const candidates = dialogue.entry !== undefined ? dialogue.entry : [{ nodeId: dialogue.startNodeId }];
  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    if (conditionsPass(row.conditions, context) && dialogue.nodes[row.nodeId] !== undefined) {
      return row.nodeId;
    }
  }
  if (dialogue.nodes[dialogue.startNodeId] !== undefined) {
    return dialogue.startNodeId;
  }
  return "";
}

export function allowedOptionIds(node: DialogueNode | undefined, context: DialogueEvalContext): string[] {
  if (node === undefined || node.options === undefined) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < node.options.length; i++) {
    const option = node.options[i];
    if (conditionsPass(option.conditions, context)) {
      ids.push(option.id);
    }
  }
  return ids;
}

export function findDialogueOption(node: DialogueNode | undefined, optionId: string): DialogueOption | null {
  if (node === undefined || node.options === undefined) {
    return null;
  }
  for (let i = 0; i < node.options.length; i++) {
    if (node.options[i].id === optionId) {
      return node.options[i];
    }
  }
  return null;
}

export function nextDialogueNodeId(
  dialogue: DialogueDefinition | undefined,
  currentNodeId: string,
  optionId: string,
  context: DialogueEvalContext,
): { ok: boolean; code: string; nodeId: string } {
  if (dialogue === undefined) {
    return { ok: false, code: "invalid_dialogue", nodeId: currentNodeId };
  }
  const node = dialogue.nodes[currentNodeId];
  const allowed = allowedOptionIds(node, context);
  if (allowed.indexOf(optionId) < 0) {
    return { ok: false, code: "invalid_option", nodeId: currentNodeId };
  }
  const option = findDialogueOption(node, optionId);
  if (option === null) {
    return { ok: false, code: "invalid_option", nodeId: currentNodeId };
  }
  if (dialogue.nodes[option.nextNodeId] === undefined) {
    return { ok: false, code: "invalid_option", nodeId: currentNodeId };
  }
  return { ok: true, code: "ok", nodeId: option.nextNodeId };
}

export function offeredQuestIdsFromNpc(definition: NpcDefinition | undefined): string[] {
  if (definition === undefined) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < definition.services.length; i++) {
    const service = definition.services[i];
    if (service.type !== "quest_offer" && service.type !== "quest_turn_in") {
      continue;
    }
    const questIds = service.questIds !== undefined ? service.questIds : [];
    for (let q = 0; q < questIds.length; q++) {
      if (ids.indexOf(questIds[q]) < 0) {
        ids.push(questIds[q]);
      }
    }
  }
  return ids;
}

export function availableServiceIds(
  definition: NpcDefinition | undefined,
  gate: InteractionInput,
): string[] {
  if (definition === undefined) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < definition.services.length; i++) {
    const service = definition.services[i];
    if (service.type === NPC_SERVICE_DIALOGUE) {
      continue;
    }
    if (!authorizeNpcService(service, gate).ok) {
      continue;
    }
    if (!serviceVisible(service, gate.questLog)) {
      continue;
    }
    ids.push(service.type);
  }
  return ids;
}

export function dialogueContextFor(
  playerLevel: number,
  classId: string | undefined,
  questLog: QuestLog | undefined,
  offeredQuestIds: ReadonlyArray<string>,
  inventory: PlayerInventory | undefined,
): DialogueEvalContext {
  return {
    playerLevel: playerLevel,
    classId: classId !== undefined ? classId : "",
    questLog: questLog,
    offeredQuestIds: offeredQuestIds,
    itemCounts: itemCountsOf(inventory),
  };
}

function serviceVisible(service: NpcService, questLog: DialogueEvalContext["questLog"] | InteractionInput["questLog"]): boolean {
  if (service.type === "quest_offer") {
    const questIds = service.questIds !== undefined ? service.questIds : [];
    for (let i = 0; i < questIds.length; i++) {
      const status = questStatusOf(questLog, questIds[i]);
      if (status === "not_started") {
        return true;
      }
    }
    return questIds.length === 0;
  }
  if (service.type === "quest_turn_in") {
    const questIds = service.questIds !== undefined ? service.questIds : [];
    for (let i = 0; i < questIds.length; i++) {
      if (offeredStatus(questLog, questIds[i]) === "ready") {
        return true;
      }
    }
    return false;
  }
  return true;
}

function conditionsPass(
  conditions: ReadonlyArray<DialogueCondition> | undefined,
  context: DialogueEvalContext,
): boolean {
  if (conditions === undefined || conditions.length === 0) {
    return true;
  }
  for (let i = 0; i < conditions.length; i++) {
    if (!conditionPasses(conditions[i], context)) {
      return false;
    }
  }
  return true;
}

function conditionPasses(condition: DialogueCondition, context: DialogueEvalContext): boolean {
  if (condition.type === "min_level") {
    const min = condition.minLevel !== undefined ? condition.minLevel : 1;
    return context.playerLevel >= min;
  }
  if (condition.type === "class_id") {
    return condition.classId !== undefined && condition.classId === context.classId;
  }
  if (condition.type === "has_item") {
    if (condition.itemId === undefined) {
      return false;
    }
    const count = context.itemCounts[condition.itemId];
    return count !== undefined && count > 0;
  }
  if (condition.type === "quest_status") {
    if (condition.questId === undefined) {
      return false;
    }
    return offeredStatus(context.questLog, condition.questId) === expectedStatus(condition);
  }
  if (condition.type === "offered_quest_status") {
    const expected = expectedStatus(condition);
    if (context.offeredQuestIds.length === 0) {
      return expected === "not_started";
    }
    for (let i = 0; i < context.offeredQuestIds.length; i++) {
      if (offeredStatus(context.questLog, context.offeredQuestIds[i]) === expected) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function expectedStatus(condition: DialogueCondition): string {
  return condition.status !== undefined && condition.status.length > 0 ? condition.status : "completed";
}

function offeredStatus(
  log: DialogueEvalContext["questLog"] | InteractionInput["questLog"],
  questId: string,
): string {
  const status = questStatusOf(log, questId);
  if (status !== "accepted") {
    return status;
  }
  if (objectivesReady(log, questId)) {
    return "ready";
  }
  return "accepted";
}

function questStatusOf(
  log: DialogueEvalContext["questLog"] | InteractionInput["questLog"],
  questId: string,
): string {
  if (log === undefined || log.quests[questId] === undefined) {
    return "not_started";
  }
  return log.quests[questId].status;
}

function objectivesReady(
  log: DialogueEvalContext["questLog"] | InteractionInput["questLog"],
  questId: string,
): boolean {
  if (log === undefined || log.quests[questId] === undefined) {
    return false;
  }
  const entry = log.quests[questId] as { status: string; objectives?: ReadonlyArray<{ current: number; required: number }> };
  const objectives = entry.objectives;
  if (!Array.isArray(objectives) || objectives.length === 0) {
    return false;
  }
  for (let i = 0; i < objectives.length; i++) {
    if (objectives[i].current < objectives[i].required) {
      return false;
    }
  }
  return true;
}

function itemCountsOf(inventory: PlayerInventory | undefined): { [itemId: string]: number } {
  const counts: { [itemId: string]: number } = {};
  if (inventory === undefined || !Array.isArray(inventory.items)) {
    return counts;
  }
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    const itemId = item.itemId;
    const quantity = item.quantity;
    counts[itemId] = (counts[itemId] !== undefined ? counts[itemId] : 0) + quantity;
  }
  return counts;
}

function copyNode(node: DialogueNode): DialogueNode {
  const lines: DialogueLine[] = [];
  for (let i = 0; i < node.lines.length; i++) {
    const line: DialogueLine = { text: node.lines[i].text };
    if (node.lines[i].textKey !== undefined) {
      line.textKey = node.lines[i].textKey;
    }
    lines.push(line);
  }
  const copied: DialogueNode = { id: node.id, lines: lines };
  if (node.options !== undefined) {
    const options: DialogueOption[] = [];
    for (let i = 0; i < node.options.length; i++) {
      const option: DialogueOption = {
        id: node.options[i].id,
        text: node.options[i].text,
        nextNodeId: node.options[i].nextNodeId,
      };
      if (node.options[i].textKey !== undefined) {
        option.textKey = node.options[i].textKey;
      }
      option.conditions = copyConditions(node.options[i].conditions);
      if (option.conditions === undefined) {
        delete option.conditions;
      }
      options.push(option);
    }
    copied.options = options;
  }
  return copied;
}

function copyConditions(
  conditions: ReadonlyArray<DialogueCondition> | undefined,
): DialogueCondition[] | undefined {
  if (conditions === undefined) {
    return undefined;
  }
  const next: DialogueCondition[] = [];
  for (let i = 0; i < conditions.length; i++) {
    const row = conditions[i];
    const copied: DialogueCondition = { type: row.type };
    if (row.questId !== undefined) {
      copied.questId = row.questId;
    }
    if (row.status !== undefined) {
      copied.status = row.status;
    }
    if (row.minLevel !== undefined) {
      copied.minLevel = row.minLevel;
    }
    if (row.classId !== undefined) {
      copied.classId = row.classId;
    }
    if (row.itemId !== undefined) {
      copied.itemId = row.itemId;
    }
    next.push(copied);
  }
  return next;
}
