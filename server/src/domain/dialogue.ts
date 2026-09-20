import { NPC_SERVICE_DIALOGUE, NPC_SERVICE_WORLD_INTERACTION, boundQuestIds, type NpcDefinition, type NpcService } from "./npc";
import { authorizeNpcService, type InteractionInput } from "./interaction";
import { questDialogueState, type QuestDefinition, type QuestLog } from "./quest";
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
  questsById?: { [id: string]: QuestDefinition };
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
  if (node == null || !Array.isArray(node.options)) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < node.options.length; i++) {
    const option = node.options[i];
    if (option == null) {
      continue;
    }
    if (conditionsPass(option.conditions, context)) {
      ids.push(option.id);
    }
  }
  return ids;
}

export function findDialogueOption(node: DialogueNode | undefined, optionId: string): DialogueOption | null {
  if (node == null || !Array.isArray(node.options)) {
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
  return boundQuestIds(definition);
}

export function availableServiceIds(
  definition: NpcDefinition | undefined,
  gate: InteractionInput,
): string[] {
  if (definition == null || !Array.isArray(definition.services)) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < definition.services.length; i++) {
    const service = definition.services[i];
    if (service == null) {
      continue;
    }
    if (service.type === NPC_SERVICE_DIALOGUE || service.type === NPC_SERVICE_WORLD_INTERACTION) {
      continue;
    }
    if (!authorizeNpcService(service, gate).ok) {
      continue;
    }
    if (!serviceVisible(service, gate.questLog, gate.questsById, gate.playerLevel, gate.classId)) {
      continue;
    }
    const presented = presentedServiceIds(service, gate.questLog, gate.questsById, gate.playerLevel, gate.classId);
    for (let p = 0; p < presented.length; p++) {
      if (ids.indexOf(presented[p]) < 0) {
        ids.push(presented[p]);
      }
    }
  }
  return ids;
}

export function dialogueContextFor(
  playerLevel: number,
  classId: string | undefined,
  questLog: QuestLog | undefined,
  offeredQuestIds: ReadonlyArray<string>,
  inventory: PlayerInventory | undefined,
  questsById?: { [id: string]: QuestDefinition },
): DialogueEvalContext {
  const context: DialogueEvalContext = {
    playerLevel: playerLevel,
    classId: classId !== undefined ? classId : "",
    questLog: questLog,
    offeredQuestIds: offeredQuestIds,
    itemCounts: itemCountsOf(inventory),
  };
  if (questsById !== undefined) {
    context.questsById = questsById;
  }
  return context;
}

function presentedServiceIds(
  service: NpcService,
  questLog: DialogueEvalContext["questLog"] | InteractionInput["questLog"],
  questsById: InteractionInput["questsById"],
  playerLevel: number | undefined,
  classId: string | undefined,
): string[] {
  if (service.type === "offer_and_turn_in") {
    const ids: string[] = [];
    if (serviceVisible({ ...service, type: "quest_offer" }, questLog, questsById, playerLevel, classId)) {
      ids.push("quest_offer");
    }
    if (serviceVisible({ ...service, type: "quest_turn_in" }, questLog, questsById, playerLevel, classId)) {
      ids.push("quest_turn_in");
    }
    return ids;
  }
  if (service.type === "offer") {
    return ["quest_offer"];
  }
  if (service.type === "turn_in") {
    return ["quest_turn_in"];
  }
  return [service.type];
}

function serviceVisible(
  service: NpcService,
  questLog: DialogueEvalContext["questLog"] | InteractionInput["questLog"],
  questsById?: InteractionInput["questsById"],
  playerLevel?: number,
  classId?: string,
): boolean {
  if (service.type === "quest_offer" || service.type === "offer" || service.type === "offer_and_turn_in") {
    if (service.type === "offer_and_turn_in") {
      return true;
    }
    const questIds = service.questIds !== undefined ? service.questIds : [];
    for (let i = 0; i < questIds.length; i++) {
      if (questDialogueStateOf(questLog, questIds[i], questsById, playerLevel, classId) === "available") {
        return true;
      }
    }
    return questIds.length === 0;
  }
  if (service.type === "quest_turn_in" || service.type === "turn_in") {
    const questIds = service.questIds !== undefined ? service.questIds : [];
    for (let i = 0; i < questIds.length; i++) {
      if (questDialogueStateOf(questLog, questIds[i], questsById, playerLevel, classId) === "ready") {
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
  if (conditions == null || conditions.length === 0) {
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
    return statusMatches(
      questDialogueStateOf(context.questLog, condition.questId, context.questsById, context.playerLevel, context.classId),
      expectedStatus(condition),
    );
  }
  if (condition.type === "offered_quest_status") {
    const expected = expectedStatus(condition);
    if (context.offeredQuestIds.length === 0) {
      return expected === "not_started" || expected === "available" || expected === "prerequisite_missing";
    }
    for (let i = 0; i < context.offeredQuestIds.length; i++) {
      if (
        statusMatches(
          questDialogueStateOf(
            context.questLog,
            context.offeredQuestIds[i],
            context.questsById,
            context.playerLevel,
            context.classId,
          ),
          expected,
        )
      ) {
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

function statusMatches(actual: string, expected: string): boolean {
  if (actual === expected) {
    return true;
  }
  if (expected === "accepted" && actual === "in_progress") {
    return true;
  }
  if (expected === "not_started" && (actual === "available" || actual === "prerequisite_missing")) {
    return true;
  }
  return false;
}

function questDialogueStateOf(
  log: DialogueEvalContext["questLog"] | InteractionInput["questLog"],
  questId: string,
  questsById: DialogueEvalContext["questsById"] | InteractionInput["questsById"],
  playerLevel: number | undefined,
  classId: string | undefined,
): string {
  const definition = questsById !== undefined ? questsById[questId] : undefined;
  return questDialogueState(questId, log, definition, playerLevel, classId);
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
  const sourceLines = Array.isArray(node.lines) ? node.lines : [];
  for (let i = 0; i < sourceLines.length; i++) {
    const line: DialogueLine = { text: sourceLines[i].text };
    if (sourceLines[i].textKey !== undefined) {
      line.textKey = sourceLines[i].textKey;
    }
    lines.push(line);
  }
  const copied: DialogueNode = { id: node.id, lines: lines };
  if (Array.isArray(node.options)) {
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
  if (conditions == null) {
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
