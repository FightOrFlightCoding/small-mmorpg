import { SAVE_SCHEMA_VERSION } from "./save_schema";

export const CHARACTER_PURGE_KEY = "purge";
export const CHARACTER_PURGE_KEY_PREFIX = "purge_";
export const CHARACTER_AUDIT_COLLECTION = "character_audit";
export const CHARACTER_AUDIT_KEY = "p";
export const CHARACTER_AUDIT_KEY_PREFIX = "p_";
export const CHARACTER_AUDIT_PERMISSION_READ: 0 = 0;
export const CHARACTER_AUDIT_PERMISSION_WRITE: 0 = 0;

export const PURGE_STEPS = [
  "inventory",
  "equipment",
  "progression",
  "quests",
  "location",
  "cave",
  "character",
  "reservation",
  "roster",
  "audit",
] as const;

export type PurgeStep = (typeof PURGE_STEPS)[number];

export interface CharacterPurgeJob {
  characterId: string;
  accountUserId: string;
  completedSteps: string[];
  startedAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface CharacterPurgeAudit {
  characterId: string;
  purgedAt: number;
  schemaVersion: number;
}

export function emptyPurgeJob(characterId: string, accountUserId: string, nowMs: number): CharacterPurgeJob {
  return {
    characterId: characterId,
    accountUserId: accountUserId,
    completedSteps: [],
    startedAt: nowMs,
    updatedAt: nowMs,
    schemaVersion: SAVE_SCHEMA_VERSION,
  };
}

export function purgeJobFromStorage(value: { [key: string]: unknown } | null | undefined): CharacterPurgeJob | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.characterId !== "string" || typeof value.accountUserId !== "string") {
    return null;
  }
  const completed: string[] = [];
  if (Array.isArray(value.completedSteps)) {
    for (let i = 0; i < value.completedSteps.length; i++) {
      if (typeof value.completedSteps[i] === "string") {
        completed.push(value.completedSteps[i] as string);
      }
    }
  }
  return {
    characterId: value.characterId,
    accountUserId: value.accountUserId,
    completedSteps: completed,
    startedAt: typeof value.startedAt === "number" ? value.startedAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_VERSION,
  };
}

export function isPurgeStepComplete(job: CharacterPurgeJob, step: PurgeStep): boolean {
  return job.completedSteps.indexOf(step) !== -1;
}

export function withCompletedPurgeStep(job: CharacterPurgeJob, step: PurgeStep, nowMs: number): CharacterPurgeJob {
  const completed = job.completedSteps.slice();
  if (completed.indexOf(step) === -1) {
    completed.push(step);
  }
  return {
    characterId: job.characterId,
    accountUserId: job.accountUserId,
    completedSteps: completed,
    startedAt: job.startedAt,
    updatedAt: nowMs,
    schemaVersion: SAVE_SCHEMA_VERSION,
  };
}

export function nextPurgeStep(job: CharacterPurgeJob): PurgeStep | null {
  for (let i = 0; i < PURGE_STEPS.length; i++) {
    if (!isPurgeStepComplete(job, PURGE_STEPS[i])) {
      return PURGE_STEPS[i];
    }
  }
  return null;
}

export function purgeAuditRecord(characterId: string, nowMs: number): CharacterPurgeAudit {
  return {
    characterId: characterId,
    purgedAt: nowMs,
    schemaVersion: SAVE_SCHEMA_VERSION,
  };
}
