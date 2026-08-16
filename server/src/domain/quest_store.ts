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
        current: objective.current,
        required: objective.required,
      });
    }
    quests.push({
      questId: progress.questId,
      status: progress.status,
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
  return {
    quests: quests,
    acceptByRequestId: acceptByRequestId,
    turnInByRequestId: turnInByRequestId,
  };
}

export function storedQuestFromValue(value: unknown): QuestLog {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return emptyQuestLog();
  }
  const data = value as { [key: string]: unknown };
  const log = emptyQuestLog();
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
  return log;
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
    if (typeof row.type !== "string" || typeof row.itemId !== "string") {
      continue;
    }
    if (typeof row.current !== "number" || typeof row.required !== "number") {
      continue;
    }
    objectives.push({
      type: row.type,
      itemId: row.itemId,
      current: row.current,
      required: row.required,
    });
  }
  return {
    questId: data.questId,
    status: data.status,
    objectives: objectives,
  };
}
