import { cloneQuestLog, incrementObjective, QUEST_STATUS_ACCEPTED, type QuestLog } from "./quest";

export interface KillCredit {
  enemyId: string;
  tags: ReadonlyArray<string>;
  zoneId: string;
  isBoss: boolean;
}

export function applyTalkObjectives(log: QuestLog, npcId: string): { log: QuestLog; changed: boolean } {
  return incrementMatching(log, function (objective) {
    if (objective.type !== "talk_to_npc" && objective.type !== "return_to_npc") {
      return false;
    }
    return objective.npcId === undefined || objective.npcId === npcId;
  }, 1);
}

export function applyKillObjectives(log: QuestLog, credit: KillCredit): { log: QuestLog; changed: boolean } {
  return incrementMatching(log, function (objective) {
    if (objective.zoneId !== undefined && objective.zoneId.length > 0 && objective.zoneId !== credit.zoneId) {
      return false;
    }
    if (!tagsAllowed(objective.enemyTags, credit.tags)) {
      return false;
    }
    if (objective.type === "defeat_boss") {
      if (!credit.isBoss) {
        return false;
      }
      if (objective.enemyId !== undefined && objective.enemyId.length > 0 && objective.enemyId !== credit.enemyId) {
        return false;
      }
      return true;
    }
    if (objective.type !== "kill_enemy") {
      return false;
    }
    if (objective.enemyId !== undefined && objective.enemyId.length > 0 && objective.enemyId !== credit.enemyId) {
      return false;
    }
    return true;
  }, 1);
}

export function applyEnterLocation(
  log: QuestLog,
  zoneId: string,
  x: number,
  y: number,
  locations: { [questId: string]: { [stageId: string]: { x: number; y: number; width: number; height: number } } },
): { log: QuestLog; changed: boolean } {
  const next = cloneQuestLog(log);
  let changed = false;
  const ids = Object.keys(next.quests);
  for (let i = 0; i < ids.length; i++) {
    const progress = next.quests[ids[i]];
    if (progress.status !== QUEST_STATUS_ACCEPTED) {
      continue;
    }
    const bumped = incrementObjective(progress, function (objective) {
      if (objective.type !== "enter_location") {
        return false;
      }
      if (objective.zoneId !== undefined && objective.zoneId.length > 0 && objective.zoneId !== zoneId) {
        return false;
      }
      const box = locationFor(locations, progress.questId, objective.stageId);
      if (box === null) {
        return false;
      }
      return x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height;
    }, 1);
    if (bumped) {
      changed = true;
    }
  }
  return { log: next, changed: changed };
}

export function enterLocationsFromQuests(questsById: {
  [id: string]: {
    id: string;
    stages: Array<{
      id: string;
      objectives: Array<{
        type: string;
        zoneId?: string;
        location?: { x: number; y: number; width: number; height: number };
      }>;
    }>;
  };
}): { [questId: string]: { [stageId: string]: { x: number; y: number; width: number; height: number } } } {
  const map: { [questId: string]: { [stageId: string]: { x: number; y: number; width: number; height: number } } } = {};
  const ids = Object.keys(questsById);
  for (let i = 0; i < ids.length; i++) {
    const quest = questsById[ids[i]];
    if (quest === undefined || !Array.isArray(quest.stages)) {
      continue;
    }
    for (let s = 0; s < quest.stages.length; s++) {
      const stage = quest.stages[s];
      for (let o = 0; o < stage.objectives.length; o++) {
        const objective = stage.objectives[o];
        if (objective.type !== "enter_location" || objective.location === undefined) {
          continue;
        }
        if (map[quest.id] === undefined) {
          map[quest.id] = {};
        }
        map[quest.id][stage.id] = objective.location;
      }
    }
  }
  return map;
}

function tagsAllowed(required: ReadonlyArray<string> | undefined, have: ReadonlyArray<string>): boolean {
  if (required === undefined || required.length === 0) {
    return true;
  }
  for (let i = 0; i < required.length; i++) {
    if (have.indexOf(required[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function incrementMatching(
  log: QuestLog,
  matcher: (objective: {
    type: string;
    npcId?: string;
    enemyId?: string;
    enemyTags?: string[];
    zoneId?: string;
  }) => boolean,
  amount: number,
): { log: QuestLog; changed: boolean } {
  const next = cloneQuestLog(log);
  let changed = false;
  const ids = Object.keys(next.quests);
  for (let i = 0; i < ids.length; i++) {
    const progress = next.quests[ids[i]];
    if (incrementObjective(progress, matcher, amount)) {
      changed = true;
    }
  }
  return { log: next, changed: changed };
}

function locationFor(
  locations: { [questId: string]: { [stageId: string]: { x: number; y: number; width: number; height: number } } },
  questId: string,
  stageId: string | undefined,
): { x: number; y: number; width: number; height: number } | null {
  const quest = locations[questId];
  if (quest === undefined) {
    return null;
  }
  const key = stageId !== undefined ? stageId : Object.keys(quest)[0];
  if (key === undefined) {
    return null;
  }
  return quest[key] !== undefined ? quest[key] : null;
}
