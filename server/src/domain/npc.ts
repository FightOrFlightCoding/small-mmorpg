export const NPC_SERVICE_DIALOGUE = "dialogue";
export const NPC_SERVICE_QUEST_OFFER = "quest_offer";
export const NPC_SERVICE_QUEST_TURN_IN = "quest_turn_in";
export const NPC_SERVICE_QUEST_OFFER_ALIAS = "offer";
export const NPC_SERVICE_QUEST_TURN_IN_ALIAS = "turn_in";
export const NPC_SERVICE_QUEST_OFFER_AND_TURN_IN = "offer_and_turn_in";
export const NPC_SERVICE_VENDOR = "vendor";

export const NPC_QUEST_MARKER_READY = "?";
export const NPC_QUEST_MARKER_AVAILABLE = "!";
export const NPC_QUEST_MARKER_ACTIVE = "·";

export type QuestBindRole = "offer" | "turn_in";

const QUEST_OFFER_TYPES = [
  NPC_SERVICE_QUEST_OFFER,
  NPC_SERVICE_QUEST_OFFER_ALIAS,
  NPC_SERVICE_QUEST_OFFER_AND_TURN_IN,
];
const QUEST_TURN_IN_TYPES = [
  NPC_SERVICE_QUEST_TURN_IN,
  NPC_SERVICE_QUEST_TURN_IN_ALIAS,
  NPC_SERVICE_QUEST_OFFER_AND_TURN_IN,
];
export const NPC_SERVICE_INN = "inn";
export const NPC_SERVICE_HEALER = "healer";
export const NPC_SERVICE_CAVE_ENTRANCE = "cave_entrance";
export const NPC_SERVICE_CAVE_EXIT = "cave_exit";
export const NPC_SERVICE_RESPEC = "respec";
export const NPC_SERVICE_WORLD_INTERACTION = "world_interaction";

export interface NpcService {
  type: string;
  questIds?: string[];
  vendorId?: string;
  goldCost?: number;
  healToFull?: boolean;
  restoreResources?: boolean;
  bindRespawn?: boolean;
  minLevel?: number;
  classRequirements?: ReadonlyArray<string>;
  requireParty?: boolean;
  requiredQuestId?: string;
  requiredQuestStatus?: string;
  grantItemId?: string;
  grantQuantity?: number;
  grantSourceType?: string;
}

export interface NpcDefinition {
  id: string;
  displayName: string;
  displayNameKey?: string;
  visualId: string;
  zoneId: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  routeId: string;
  interactionRange: number;
  dialogueId: string;
  services: NpcService[];
}

export type NpcMovePhase = "idle" | "moving" | "paused";

export interface NpcMovementRuntime {
  currentNodeId: string;
  nextNodeId: string;
  revision: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTick: number;
  endTick: number;
  idleUntilTick: number;
  rngState: number;
  phase: NpcMovePhase;
  pingPongDir: number;
}

export interface NpcRuntimeInstance {
  id: string;
  npcId: string;
  x: number;
  y: number;
  zoneId: string;
  interactionRange: number;
  dialogueId: string;
  visualId: string;
  displayName: string;
  displayNameKey: string;
  homeX: number;
  homeY: number;
  routeId: string;
  movement?: NpcMovementRuntime;
}

export function createNpcRuntimeInstance(input: {
  npcId: string;
  x: number;
  y: number;
  zoneId: string;
  definition?: NpcDefinition;
  defaultInteractionRange: number;
}): NpcRuntimeInstance {
  const definition = input.definition;
  return {
    id: input.npcId,
    npcId: input.npcId,
    x: input.x,
    y: input.y,
    zoneId: input.zoneId,
    interactionRange: definition !== undefined ? definition.interactionRange : input.defaultInteractionRange,
    dialogueId: definition !== undefined ? definition.dialogueId : "",
    visualId: definition !== undefined ? definition.visualId : "",
    displayName: definition !== undefined ? definition.displayName : input.npcId,
    displayNameKey:
      definition !== undefined && definition.displayNameKey !== undefined ? definition.displayNameKey : "",
    homeX: definition !== undefined ? definition.homeX : input.x,
    homeY: definition !== undefined ? definition.homeY : input.y,
    routeId: definition !== undefined ? definition.routeId : "",
  };
}

export function isNpcRuntimeId(
  npcs: ReadonlyArray<{ id?: string; npcId?: string }> | undefined,
  entityId: string,
): boolean {
  if (!Array.isArray(npcs) || entityId.length === 0) {
    return false;
  }
  const wanted = String(entityId);
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (String(npc.id) === wanted || String(npc.npcId) === wanted) {
      return true;
    }
  }
  return false;
}

export function npcDefinitionsFromContent(npcs: {
  [id: string]: {
    id: string;
    displayName: string;
    displayNameKey?: string;
    visualId: string;
    zoneId?: string;
    position?: { x: number; y: number };
    homePosition?: { x: number; y: number };
    routeId?: string;
    interactionRange?: number;
    dialogueId?: string;
    services?: ReadonlyArray<{
      type: string;
      questIds?: ReadonlyArray<string>;
      vendorId?: string;
      goldCost?: number;
      healToFull?: boolean;
      restoreResources?: boolean;
      bindRespawn?: boolean;
      minLevel?: number;
      classRequirements?: ReadonlyArray<string>;
      requireParty?: boolean;
      requiredQuestId?: string;
      requiredQuestStatus?: string;
      grantItemId?: string;
      grantQuantity?: number;
      grantSourceType?: string;
    }>;
  };
}): { [id: string]: NpcDefinition } {
  const map: { [id: string]: NpcDefinition } = {};
  const ids = Object.keys(npcs);
  for (let i = 0; i < ids.length; i++) {
    const entry = npcs[ids[i]];
    const services: NpcService[] = [];
    const source = Array.isArray(entry.services) ? entry.services : [];
    for (let s = 0; s < source.length; s++) {
      services.push(copyService(source[s]));
    }
    if (services.length === 0) {
      services.push({ type: NPC_SERVICE_DIALOGUE });
    }
    map[ids[i]] = {
      id: entry.id,
      displayName: entry.displayName,
      displayNameKey: entry.displayNameKey,
      visualId: entry.visualId,
      zoneId: entry.zoneId !== undefined ? entry.zoneId : "",
      x: entry.position !== undefined ? entry.position.x : 0,
      y: entry.position !== undefined ? entry.position.y : 0,
      homeX: entry.homePosition !== undefined ? entry.homePosition.x : entry.position !== undefined ? entry.position.x : 0,
      homeY: entry.homePosition !== undefined ? entry.homePosition.y : entry.position !== undefined ? entry.position.y : 0,
      routeId: entry.routeId !== undefined ? entry.routeId : "",
      interactionRange: entry.interactionRange !== undefined ? entry.interactionRange : 48,
      dialogueId: entry.dialogueId !== undefined ? entry.dialogueId : "",
      services: services,
    };
  }
  return map;
}

export function findNpcService(definition: NpcDefinition | undefined, type: string): NpcService | null {
  if (definition == null || !Array.isArray(definition.services)) {
    return null;
  }
  for (let i = 0; i < definition.services.length; i++) {
    if (definition.services[i].type === type) {
      return definition.services[i];
    }
  }
  return null;
}

export function questBindRoleOf(type: string): QuestBindRole | null {
  if (QUEST_OFFER_TYPES.indexOf(type) !== -1) {
    return "offer";
  }
  if (QUEST_TURN_IN_TYPES.indexOf(type) !== -1) {
    return "turn_in";
  }
  return null;
}

export function isQuestBindType(type: string): boolean {
  return questBindRoleOf(type) !== null;
}

export function findQuestBindService(
  definition: NpcDefinition | undefined,
  role: QuestBindRole,
): NpcService | null {
  if (definition == null || !Array.isArray(definition.services)) {
    return null;
  }
  const types = role === "offer" ? QUEST_OFFER_TYPES : QUEST_TURN_IN_TYPES;
  for (let i = 0; i < definition.services.length; i++) {
    if (types.indexOf(definition.services[i].type) !== -1) {
      return definition.services[i];
    }
  }
  return null;
}

export function npcBindsQuest(
  definition: NpcDefinition | undefined,
  questId: string,
  role: QuestBindRole,
): boolean {
  if (definition == null || !Array.isArray(definition.services)) {
    return false;
  }
  const types = role === "offer" ? QUEST_OFFER_TYPES : QUEST_TURN_IN_TYPES;
  for (let i = 0; i < definition.services.length; i++) {
    const service = definition.services[i];
    if (types.indexOf(service.type) === -1) {
      continue;
    }
    const ids = Array.isArray(service.questIds) ? service.questIds : [];
    if (ids.length === 0 || ids.indexOf(questId) !== -1) {
      return true;
    }
  }
  return false;
}

export function npcOffersQuest(definition: NpcDefinition | undefined, questId: string, type: string): boolean {
  const role = questBindRoleOf(type);
  if (role !== null) {
    return npcBindsQuest(definition, questId, role);
  }
  const service = findNpcService(definition, type);
  if (service === null) {
    return false;
  }
  const ids = Array.isArray(service.questIds) ? service.questIds : [];
  if (ids.length === 0) {
    return true;
  }
  return ids.indexOf(questId) !== -1;
}

export function boundQuestIds(definition: NpcDefinition | undefined, role?: QuestBindRole): string[] {
  if (definition === undefined) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < definition.services.length; i++) {
    const service = definition.services[i];
    if (role === undefined) {
      if (questBindRoleOf(service.type) === null) {
        continue;
      }
    } else {
      const types = role === "offer" ? QUEST_OFFER_TYPES : QUEST_TURN_IN_TYPES;
      if (types.indexOf(service.type) === -1) {
        continue;
      }
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

export function serviceMeetsLevel(service: NpcService | null, level: number): boolean {
  if (service === null || service.minLevel === undefined || service.minLevel === null) {
    return true;
  }
  return level >= service.minLevel;
}

export function serviceMeetsClass(service: NpcService | null, classId: string): boolean {
  if (service === null || service.classRequirements === undefined || service.classRequirements.length === 0) {
    return true;
  }
  return service.classRequirements.indexOf(classId) !== -1;
}

export function publicNpcServices(definition: NpcDefinition | undefined): string[] {
  if (definition === undefined) {
    return [];
  }
  const types: string[] = [];
  for (let i = 0; i < definition.services.length; i++) {
    types.push(definition.services[i].type);
  }
  return types;
}

function copyService(source: {
  type: string;
  questIds?: ReadonlyArray<string>;
  vendorId?: string;
  goldCost?: number;
  healToFull?: boolean;
  restoreResources?: boolean;
  bindRespawn?: boolean;
  minLevel?: number;
  classRequirements?: ReadonlyArray<string>;
  requireParty?: boolean;
  requiredQuestId?: string;
  requiredQuestStatus?: string;
  grantItemId?: string;
  grantQuantity?: number;
  grantSourceType?: string;
}): NpcService {
  const service: NpcService = { type: source.type };
  if (source.questIds !== undefined) {
    const questIds: string[] = [];
    for (let i = 0; i < source.questIds.length; i++) {
      questIds.push(source.questIds[i]);
    }
    service.questIds = questIds;
  }
  if (source.vendorId !== undefined) {
    service.vendorId = source.vendorId;
  }
  if (source.goldCost !== undefined) {
    service.goldCost = source.goldCost;
  }
  if (source.healToFull !== undefined) {
    service.healToFull = source.healToFull;
  }
  if (source.restoreResources !== undefined) {
    service.restoreResources = source.restoreResources;
  }
  if (source.bindRespawn !== undefined) {
    service.bindRespawn = source.bindRespawn;
  }
  if (source.minLevel !== undefined) {
    service.minLevel = source.minLevel;
  }
  if (source.classRequirements !== undefined) {
    service.classRequirements = source.classRequirements.slice();
  }
  if (source.requireParty === true) {
    service.requireParty = true;
  }
  if (source.requiredQuestId !== undefined) {
    service.requiredQuestId = source.requiredQuestId;
  }
  if (source.requiredQuestStatus !== undefined) {
    service.requiredQuestStatus = source.requiredQuestStatus;
  }
  if (source.grantItemId !== undefined) {
    service.grantItemId = source.grantItemId;
  }
  if (source.grantQuantity !== undefined) {
    service.grantQuantity = source.grantQuantity;
  }
  if (source.grantSourceType !== undefined) {
    service.grantSourceType = source.grantSourceType;
  }
  return service;
}
