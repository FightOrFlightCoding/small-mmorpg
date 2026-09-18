import { distance } from "./movement";
import {
  findNpcService,
  findQuestBindService,
  questBindRoleOf,
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
  questsById?: { [id: string]: import("./quest").QuestDefinition };
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
    const bindRole = questBindRoleOf(input.requiredService);
    const service =
      bindRole !== null
        ? findQuestBindService(definition, bindRole)
        : findNpcService(definition, input.requiredService);
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

export const INTERACTION_SESSION_TTL_TICKS = 300;

export type InteractionSessionState = "open" | "active" | "closed" | "expired" | "invalidated";

export interface InteractionSession {
  sessionId: string;
  requestId: string;
  targetId: string;
  npcInstanceId: string;
  dialogueId: string;
  currentNodeId: string;
  allowedOptionIds: string[];
  availableServiceIds: string[];
  expiresAtTick: number;
  state: InteractionSessionState;
}

export interface InteractPresentation {
  ok: boolean;
  code: string;
  targetId: string;
  dialogueId?: string;
  services?: string[];
  interactionSessionId?: string;
  currentNodeId?: string;
  allowedOptionIds?: string[];
  availableServiceIds?: string[];
  expiresAtTick?: number;
}

export function isUsableInteractionSession(session: InteractionSession | undefined | null, tick: number): boolean {
  if (session == null) {
    return false;
  }
  if (session.state !== "open" && session.state !== "active") {
    return false;
  }
  return tick <= session.expiresAtTick;
}

export function sessionMatchesNpc(session: InteractionSession, npcInstanceId: string): boolean {
  return session.npcInstanceId === npcInstanceId || session.targetId === npcInstanceId;
}

export function countNpcSessions(
  players: { [userId: string]: { interactionSession?: InteractionSession } },
  npcInstanceId: string,
  tick: number,
): number {
  let count = 0;
  const ids = Object.keys(players);
  for (let i = 0; i < ids.length; i++) {
    const player = players[ids[i]];
    if (player == null) {
      continue;
    }
    const session = player.interactionSession;
    if (session == null || !isUsableInteractionSession(session, tick)) {
      continue;
    }
    if (sessionMatchesNpc(session, npcInstanceId)) {
      count += 1;
    }
  }
  return count;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    out.push(String(value[i]));
  }
  return out;
}

export function cloneInteractionSession(
  session: InteractionSession | undefined | null,
): InteractionSession | undefined {
  if (session == null || typeof session !== "object") {
    return undefined;
  }
  const state = session.state;
  const normalizedState: InteractionSessionState =
    state === "open" || state === "active" || state === "closed" || state === "expired" || state === "invalidated"
      ? state
      : "invalidated";
  return {
    sessionId: String(session.sessionId !== undefined ? session.sessionId : ""),
    requestId: String(session.requestId !== undefined ? session.requestId : ""),
    targetId: String(session.targetId !== undefined ? session.targetId : ""),
    npcInstanceId: String(session.npcInstanceId !== undefined ? session.npcInstanceId : ""),
    dialogueId: String(session.dialogueId !== undefined ? session.dialogueId : ""),
    currentNodeId: String(session.currentNodeId !== undefined ? session.currentNodeId : ""),
    allowedOptionIds: stringList(session.allowedOptionIds),
    availableServiceIds: stringList(session.availableServiceIds),
    expiresAtTick: typeof session.expiresAtTick === "number" && isFinite(session.expiresAtTick) ? session.expiresAtTick : 0,
    state: normalizedState,
  };
}

export function cloneInteractPresentation(
  row:
    | {
        ok: boolean;
        code: string;
        targetId: string;
        dialogueId?: string;
        services?: string[];
        interactionSessionId?: string;
        currentNodeId?: string;
        allowedOptionIds?: string[];
        availableServiceIds?: string[];
        expiresAtTick?: number;
      }
    | undefined
    | null,
): InteractPresentation | undefined {
  if (row == null || typeof row !== "object") {
    return undefined;
  }
  const copied: InteractPresentation = {
    ok: row.ok === true,
    code: String(row.code),
    targetId: String(row.targetId),
  };
  if (row.dialogueId !== undefined) {
    copied.dialogueId = String(row.dialogueId);
  }
  if (Array.isArray(row.services)) {
    copied.services = row.services.map((entry) => String(entry));
  }
  if (row.interactionSessionId !== undefined) {
    copied.interactionSessionId = String(row.interactionSessionId);
  }
  if (row.currentNodeId !== undefined) {
    copied.currentNodeId = String(row.currentNodeId);
  }
  if (Array.isArray(row.allowedOptionIds)) {
    copied.allowedOptionIds = row.allowedOptionIds.map((entry) => String(entry));
  }
  if (Array.isArray(row.availableServiceIds)) {
    copied.availableServiceIds = row.availableServiceIds.map((entry) => String(entry));
  }
  if (typeof row.expiresAtTick === "number") {
    copied.expiresAtTick = row.expiresAtTick;
  }
  return copied;
}

export function presentationFromSession(
  session: InteractionSession,
  ok: boolean,
  code: string,
): InteractPresentation {
  const extra: InteractPresentation = {
    ok: ok,
    code: code,
    targetId: session.targetId,
    interactionSessionId: session.sessionId,
    currentNodeId: session.currentNodeId,
    allowedOptionIds: stringList(session.allowedOptionIds),
    availableServiceIds: stringList(session.availableServiceIds),
    expiresAtTick: session.expiresAtTick,
    services: stringList(session.availableServiceIds),
  };
  if (session.dialogueId.length > 0) {
    extra.dialogueId = session.dialogueId;
  }
  return extra;
}

export function extrasFromPresentation(row: InteractPresentation): { [key: string]: unknown } {
  const extra: { [key: string]: unknown } = {};
  if (row.dialogueId !== undefined) {
    extra.dialogueId = row.dialogueId;
  }
  if (Array.isArray(row.services)) {
    extra.services = row.services.slice();
  }
  if (row.interactionSessionId !== undefined) {
    extra.interactionSessionId = row.interactionSessionId;
  }
  if (row.currentNodeId !== undefined) {
    extra.currentNodeId = row.currentNodeId;
  }
  if (Array.isArray(row.allowedOptionIds)) {
    extra.allowedOptionIds = row.allowedOptionIds.slice();
  }
  if (Array.isArray(row.availableServiceIds)) {
    extra.availableServiceIds = row.availableServiceIds.slice();
  }
  if (row.expiresAtTick !== undefined) {
    extra.expiresAtTick = row.expiresAtTick;
  }
  return extra;
}
