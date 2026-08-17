import {
  QUEST_SAVE_KEYS,
  attachEnvelope,
  envelopeFromRecord,
  optionalExtras,
} from "./save_schema";
import { QUEST_STATUS_ACCEPTED, QUEST_STATUS_COMPLETED, emptyQuestLog, type QuestLog, type QuestProgress } from "./quest";

export const QUEST_COLLECTION = "player";
export const QUEST_KEY = "quests";
export const QUEST_PERMISSION_READ: 1 = 1;
export const QUEST_PERMISSION_WRITE: 0 = 0;

export function storedQuestWriteValue(log: QuestLog): { [key: string]: unknown } {
  const quests: { [key: string]: unknown }[] = [];
  const ids = Object.keys(log.quests);
  ids.sort();
  for (let i = 0; i < ids.length; i++) {
    const progress = log.quests[ids[i]];
    const objectives: { [key: string]: unknown }[] = [];
    for (let j = 0; j < progress.objectives.length; j++) {
      const objective = progress.objectives[j];
      objectives.push({
        type: objective.type,
        itemId: objective.itemId,
        npcId: objective.npcId,
        enemyId: objective.enemyId,
        current: objective.current,
        required: objective.required,
        stageId: objective.stageId,
        stageIndex: objective.stageIndex,
      });
    }
    quests.push({
      questId: progress.questId,
      status: progress.status,
      stageIndex: progress.stageIndex !== undefined ? progress.stageIndex : 0,
      objectives: objectives,
    });
  }
  const acceptByRequestId: { [requestId: string]: string } = {};
  const requestIds = Object.keys(log.acceptByRequestId);
  for (let k = 0; k < requestIds.length; k++) {
    const requestId = requestIds[k];
    acceptByRequestId[requestId] = log.acceptByRequestId[requestId];
  }
  const turnInByRequestId: { [requestId: string]: string } = {};
  const turnInIds = Object.keys(log.turnInByRequestId);
  for (let t = 0; t < turnInIds.length; t++) {
    const requestId = turnInIds[t];
    turnInByRequestId[requestId] = log.turnInByRequestId[requestId];
  }
  const gameplay: { [key: string]: unknown } = {
    quests: quests,
    acceptByRequestId: acceptByRequestId,
    turnInByRequestId: turnInByRequestId,
  };
  const acceptTicks = copyTickMap(log.acceptRequestTicks);
  if (acceptTicks !== undefined) {
    gameplay.acceptRequestTicks = acceptTicks;
  }
  const turnInTicks = copyTickMap(log.turnInRequestTicks);
  if (turnInTicks !== undefined) {
    gameplay.turnInRequestTicks = turnInTicks;
  }
  return attachEnvelope(gameplay, envelopeFromRecord(log), log.extras);
}

export function storedQuestFromValue(value: unknown): QuestLog {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return emptyQuestLog();
  }
  const data = value as { [key: string]: unknown };
  const log = emptyQuestLog();
  if (typeof data.schemaVersion === "number") {
    log.schemaVersion = data.schemaVersion;
  }
  if (typeof data.createdAt === "number") {
    log.createdAt = data.createdAt;
  }
  if (typeof data.updatedAt === "number") {
    log.updatedAt = data.updatedAt;
  }
  log.extras = optionalExtras(data, QUEST_SAVE_KEYS);
  if (Array.isArray(data.quests)) {
    for (let i = 0; i < data.quests.length; i++) {
      const parsed = parseProgress(data.quests[i]);
      if (parsed !== null) {
        log.quests[parsed.questId] = parsed;
      }
    }
  }
  if (data.acceptByRequestId !== null && typeof data.acceptByRequestId === "object" && !Array.isArray(data.acceptByRequestId)) {
    const map = data.acceptByRequestId as { [key: string]: unknown };
    const keys = Object.keys(map);
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      if (typeof map[key] === "string") {
        log.acceptByRequestId[key] = map[key];
      }
    }
  }
  if (data.turnInByRequestId !== null && typeof data.turnInByRequestId === "object" && !Array.isArray(data.turnInByRequestId)) {
    const map = data.turnInByRequestId as { [key: string]: unknown };
    const keys = Object.keys(map);
    for (let t = 0; t < keys.length; t++) {
      const key = keys[t];
      if (typeof map[key] === "string") {
        log.turnInByRequestId[key] = map[key];
      }
    }
  }
  log.acceptRequestTicks = parseTickMap(data.acceptRequestTicks);
  log.turnInRequestTicks = parseTickMap(data.turnInRequestTicks);
  return log;
}

function copyTickMap(ticks: { [requestId: string]: number } | null | undefined): { [requestId: string]: number } | undefined {
  if (ticks === undefined || ticks === null || typeof ticks !== "object" || Array.isArray(ticks)) {
    return undefined;
  }
  const copy: { [requestId: string]: number } = {};
  const keys = Object.keys(ticks);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = ticks[keys[i]];
  }
  return copy;
}

function parseTickMap(value: unknown): { [requestId: string]: number } | undefined {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const map = value as { [key: string]: unknown };
  const ticks: { [requestId: string]: number } = {};
  const keys = Object.keys(map);
  let any = false;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (typeof map[key] === "number" && isFinite(map[key])) {
      ticks[key] = map[key];
      any = true;
    }
  }
  return any ? ticks : undefined;
}

function parseProgress(value: unknown): QuestProgress | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.questId !== "string" || data.questId.length === 0) {
    return null;
  }
  if (data.status !== QUEST_STATUS_ACCEPTED && data.status !== QUEST_STATUS_COMPLETED) {
    return null;
  }
  if (!Array.isArray(data.objectives)) {
    return null;
  }
  const objectives: QuestProgress["objectives"] = [];
  for (let i = 0; i < data.objectives.length; i++) {
    const objective = data.objectives[i];
    if (objective === null || typeof objective !== "object" || Array.isArray(objective)) {
      continue;
    }
    const row = objective as { [key: string]: unknown };
    if (typeof row.type !== "string") {
      continue;
    }
    if (typeof row.current !== "number" || typeof row.required !== "number") {
      continue;
    }
    const parsed: QuestProgress["objectives"][number] = {
      type: row.type,
      current: row.current,
      required: row.required,
    };
    if (typeof row.itemId === "string") {
      parsed.itemId = row.itemId;
    }
    if (typeof row.npcId === "string") {
      parsed.npcId = row.npcId;
    }
    if (typeof row.enemyId === "string") {
      parsed.enemyId = row.enemyId;
    }
    if (typeof row.stageId === "string") {
      parsed.stageId = row.stageId;
    }
    if (typeof row.stageIndex === "number" && isFinite(row.stageIndex)) {
      parsed.stageIndex = row.stageIndex;
    }
    objectives.push(parsed);
  }
  return {
    questId: data.questId,
    status: data.status,
    stageIndex: typeof data.stageIndex === "number" && isFinite(data.stageIndex) ? data.stageIndex : 0,
    objectives: objectives,
  };
}
