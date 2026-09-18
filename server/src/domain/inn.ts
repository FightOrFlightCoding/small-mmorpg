import { findNpc, resolveInteraction, type InteractionNpc } from "./interaction";
import { findNpcService, type NpcDefinition, type NpcService } from "./npc";
import { dict } from "./maps";
import type { QuestLog } from "./quest";

export interface InnRestInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  maxHealth: number;
  gold: number;
  npcId: string;
  requestId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  npcById: { [id: string]: NpcDefinition };
  resources?: { [resourceId: string]: number };
  resourceMax?: { [resourceId: string]: number };
  bind: boolean;
  tick?: number;
  priorCodes?: { [requestId: string]: string };
  zoneId?: string;
  playerLevel?: number;
  classId?: string;
  inParty?: boolean;
  questLog?: QuestLog;
}

export interface InnRestOutcome {
  ok: boolean;
  code: string;
  persist: boolean;
  replay: boolean;
  health: number;
  gold: number;
  goldDelta: number;
  resources: { [resourceId: string]: number };
  bindX?: number;
  bindY?: number;
  bindZoneId?: string;
  metadata: { [key: string]: unknown };
}

export function applyInnRest(input: InnRestInput): InnRestOutcome {
  if (input.priorCodes !== undefined && input.priorCodes[input.requestId] !== undefined) {
    const prior = input.priorCodes[input.requestId];
    return {
      ok: prior === "ok",
      code: prior,
      persist: false,
      replay: true,
      health: input.playerHealth,
      gold: input.gold,
      goldDelta: 0,
      resources: copyResources(input.resources),
      metadata: {},
    };
  }
  const access = authorizeInnService(input);
  if (!access.ok) {
    return failInn(access.code, input);
  }
  const service = access.service;
  const npc = findNpc(input.npcs, input.npcId);
  const npcDef = npc !== null ? input.npcById[npc.npcId] : undefined;
  const cost = service.goldCost !== undefined ? service.goldCost : 0;
  if (input.gold < cost) {
    return failInn("insufficient_gold", input);
  }
  const health = service.healToFull !== false ? input.maxHealth : input.playerHealth;
  const resources = restoreResources(input.resources, input.resourceMax, service);
  const gold = input.gold - cost;
  const outcome: InnRestOutcome = {
    ok: true,
    code: "ok",
    persist: true,
    replay: false,
    health: health,
    gold: gold,
    goldDelta: -cost,
    resources: resources,
    metadata: { source: input.bind ? "inn" : "healer", npcId: input.npcId, goldCost: cost },
  };
  if (input.bind && service.bindRespawn !== false && npc !== null) {
    outcome.bindX = npc.x;
    outcome.bindY = npc.y;
    outcome.bindZoneId = npc.zoneId !== undefined && npc.zoneId.length > 0
      ? npc.zoneId
      : npcDef !== undefined
        ? npcDef.zoneId
        : "";
  }
  return outcome;
}

export function applyCaveEnter(input: {
  playerHealth: number;
  playerX: number;
  playerY: number;
  npcId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  npcById: { [id: string]: NpcDefinition };
  zoneId?: string;
  playerLevel?: number;
  classId?: string;
  inParty?: boolean;
  questLog?: QuestLog;
}): { ok: boolean; code: string; message: string } {
  const decision = resolveInteraction({
    playerHealth: input.playerHealth,
    playerX: input.playerX,
    playerY: input.playerY,
    targetId: input.npcId,
    npcs: input.npcs,
    interactionRange: input.interactionRange,
    zoneId: input.zoneId,
    playerLevel: input.playerLevel,
    classId: input.classId,
    inParty: input.inParty,
    questLog: input.questLog,
    npcById: input.npcById,
    requiredService: "cave_entrance",
  });
  if (!decision.ok) {
    return { ok: false, code: decision.code, message: caveEnterMessage(decision.code) };
  }
  return {
    ok: true,
    code: "ok",
    message: "",
  };
}

function authorizeInnService(input: InnRestInput): { ok: true; service: NpcService } | { ok: false; code: string } {
  const types = input.bind ? ["inn"] : ["healer", "inn"];
  let lastCode = "invalid_service";
  for (let i = 0; i < types.length; i++) {
    const decision = resolveInteraction({
      playerHealth: input.playerHealth,
      playerX: input.playerX,
      playerY: input.playerY,
      targetId: input.npcId,
      npcs: input.npcs,
      interactionRange: input.interactionRange,
      zoneId: input.zoneId,
      playerLevel: input.playerLevel,
      classId: input.classId,
      inParty: input.inParty,
      questLog: input.questLog,
      npcById: input.npcById,
      requiredService: types[i],
    });
    if (decision.ok) {
      const npc = findNpc(input.npcs, input.npcId);
      const definition = npc !== null ? input.npcById[npc.npcId] : input.npcById[input.npcId];
      const service = findNpcService(definition, types[i]);
      if (service !== null) {
        return { ok: true, service: service };
      }
    }
    lastCode = decision.code;
  }
  return { ok: false, code: lastCode };
}

function caveEnterMessage(code: string): string {
  if (code === "player_dead") {
    return "You cannot enter while dead.";
  }
  if (code === "invalid_target") {
    return "That entrance does not exist.";
  }
  if (code === "out_of_range") {
    return "Move closer to the entrance.";
  }
  if (code === "invalid_service") {
    return "This NPC does not offer cave entry.";
  }
  return "You cannot enter here.";
}

function restoreResources(
  current: { [resourceId: string]: number } | undefined,
  max: { [resourceId: string]: number } | undefined,
  service: NpcService,
): { [resourceId: string]: number } {
  const resources = copyResources(current);
  if (service.restoreResources === false) {
    return resources;
  }
  const caps = max !== undefined ? max : {};
  const ids = Object.keys(caps);
  for (let i = 0; i < ids.length; i++) {
    resources[ids[i]] = caps[ids[i]];
  }
  return resources;
}

function copyResources(resources: { [resourceId: string]: number } | undefined): { [resourceId: string]: number } {
  return dict(resources);
}

function failInn(code: string, input: InnRestInput): InnRestOutcome {
  return {
    ok: false,
    code: code,
    persist: false,
    replay: false,
    health: input.playerHealth,
    gold: input.gold,
    goldDelta: 0,
    resources: copyResources(input.resources),
    metadata: {},
  };
}
