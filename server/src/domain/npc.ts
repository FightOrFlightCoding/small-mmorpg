export const NPC_SERVICE_DIALOGUE = "dialogue";
export const NPC_SERVICE_QUEST_OFFER = "quest_offer";
export const NPC_SERVICE_QUEST_TURN_IN = "quest_turn_in";
export const NPC_SERVICE_VENDOR = "vendor";
export const NPC_SERVICE_INN = "inn";
export const NPC_SERVICE_HEALER = "healer";
export const NPC_SERVICE_CAVE_ENTRANCE = "cave_entrance";
export const NPC_SERVICE_CAVE_EXIT = "cave_exit";

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
}

export interface NpcDefinition {
  id: string;
  displayName: string;
  displayNameKey?: string;
  visualId: string;
  zoneId: string;
  x: number;
  y: number;
  interactionRange: number;
  dialogueId: string;
  services: NpcService[];
}

export function npcDefinitionsFromContent(npcs: {
  [id: string]: {
    id: string;
    displayName: string;
    displayNameKey?: string;
    visualId: string;
    zoneId?: string;
    position?: { x: number; y: number };
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
      interactionRange: entry.interactionRange !== undefined ? entry.interactionRange : 48,
      dialogueId: entry.dialogueId !== undefined ? entry.dialogueId : "",
      services: services,
    };
  }
  return map;
}

export function findNpcService(definition: NpcDefinition | undefined, type: string): NpcService | null {
  if (definition === undefined || !Array.isArray(definition.services)) {
    return null;
  }
  for (let i = 0; i < definition.services.length; i++) {
    if (definition.services[i].type === type) {
      return definition.services[i];
    }
  }
  return null;
}

export function npcOffersQuest(definition: NpcDefinition | undefined, questId: string, type: string): boolean {
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
  return service;
}
