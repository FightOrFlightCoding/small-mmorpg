import { distance } from "./movement";
import {
  findNpcService,
  serviceMeetsClass,
  serviceMeetsLevel,
  type NpcDefinition,
  type NpcService,
} from "./npc";

export { distance };

export interface InteractionNpc {
  id: string;
  npcId: string;
  x: number;
  y: number;
  zoneId?: string;
  interactionRange?: number;
}

export interface InteractionInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  targetId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  zoneId?: string;
  playerLevel?: number;
  classId?: string;
  inParty?: boolean;
  questLog?: { quests: { [questId: string]: { status: string } } };
  npcById?: { [id: string]: NpcDefinition };
  requiredService?: string;
}

export interface InteractionDecision {
  ok: boolean;
  code: string;
}

export function findNpc(npcs: ReadonlyArray<InteractionNpc>, targetId: string): InteractionNpc | null {
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (npc.id === targetId || npc.npcId === targetId) {
      return npc;
    }
  }
  return null;
}

export function resolveInteraction(input: InteractionInput): InteractionDecision {
  if (input.playerHealth <= 0) {
    return { ok: false, code: "player_dead" };
  }
  const npc = findNpc(input.npcs, input.targetId);
  if (npc === null) {
    return { ok: false, code: "invalid_target" };
  }
  const definition = input.npcById !== undefined ? input.npcById[npc.npcId] : undefined;
  const zoneId = npc.zoneId !== undefined && npc.zoneId.length > 0
    ? npc.zoneId
    : definition !== undefined
      ? definition.zoneId
      : "";
  if (input.zoneId !== undefined && zoneId.length > 0 && input.zoneId !== zoneId) {
    return { ok: false, code: "invalid_zone" };
  }
  const range = npc.interactionRange !== undefined
    ? npc.interactionRange
    : definition !== undefined
      ? definition.interactionRange
      : input.interactionRange;
  if (distance(input.playerX, input.playerY, npc.x, npc.y) > range) {
    return { ok: false, code: "out_of_range" };
  }
  if (input.requiredService !== undefined) {
    const service = findNpcService(definition, input.requiredService);
    if (service === null) {
      return { ok: false, code: "invalid_service" };
    }
    const gated = authorizeNpcService(service, input);
    if (!gated.ok) {
      return gated;
    }
  }
  return { ok: true, code: "ok" };
}

export function authorizeNpcService(service: NpcService, input: InteractionInput): InteractionDecision {
  const level = input.playerLevel !== undefined ? input.playerLevel : 1;
  if (!serviceMeetsLevel(service, level)) {
    return { ok: false, code: "level_too_low" };
  }
  if (!serviceMeetsClass(service, input.classId !== undefined ? input.classId : "")) {
    return { ok: false, code: "class_restricted" };
  }
  if (service.requireParty === true && input.inParty !== true) {
    return { ok: false, code: "party_required" };
  }
  if (service.requiredQuestId !== undefined && service.requiredQuestId.length > 0) {
    const status = questStatusOf(input.questLog, service.requiredQuestId);
    const expected = service.requiredQuestStatus !== undefined ? service.requiredQuestStatus : "completed";
    if (status !== expected) {
      return { ok: false, code: "missing_prerequisite" };
    }
  }
  return { ok: true, code: "ok" };
}

function questStatusOf(log: InteractionInput["questLog"], questId: string): string {
  if (log === undefined || log.quests[questId] === undefined) {
    return "not_started";
  }
  return log.quests[questId].status;
}
