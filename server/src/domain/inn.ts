import { distance, findNpc, type InteractionNpc } from "./interaction";
import { findNpcService, type NpcDefinition, type NpcService } from "./npc";
import { dict } from "./maps";

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
  if (input.playerHealth <= 0) {
    return failInn("player_dead", input);
  }
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return failInn("invalid_target", input);
  }
  const range = npc.interactionRange !== undefined ? npc.interactionRange : input.interactionRange;
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > range) {
    return failInn("out_of_range", input);
  }
  const npcDef = input.npcById[npc.npcId];
  const service = input.bind ? findNpcService(npcDef, "inn") : findHealerOrInn(npcDef);
  if (service === null) {
    return failInn("invalid_service", input);
  }
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
  if (input.bind && service.bindRespawn !== false) {
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
}): { ok: boolean; code: string; message: string } {
  if (input.playerHealth <= 0) {
    return { ok: false, code: "player_dead", message: "You cannot enter while dead." };
  }
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return { ok: false, code: "invalid_target", message: "That entrance does not exist." };
  }
  const range = npc.interactionRange !== undefined ? npc.interactionRange : input.interactionRange;
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > range) {
    return { ok: false, code: "out_of_range", message: "Move closer to the entrance." };
  }
  const service = findNpcService(input.npcById[npc.npcId], "cave_entrance");
  if (service === null) {
    return { ok: false, code: "invalid_service", message: "This NPC does not offer cave entry." };
  }
  return {
    ok: true,
    code: "ok",
    message: "",
  };
}

function findHealerOrInn(definition: NpcDefinition | undefined): NpcService | null {
  const healer = findNpcService(definition, "healer");
  if (healer !== null) {
    return healer;
  }
  return findNpcService(definition, "inn");
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
