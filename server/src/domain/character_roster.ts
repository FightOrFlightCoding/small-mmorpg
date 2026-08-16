import { SAVE_SCHEMA_VERSION } from "./save_schema";

export const CHARACTER_SLOT_LIMIT = 3;
export const ROSTER_COLLECTION = "player";
export const ROSTER_KEY = "roster";
export const ROSTER_PERMISSION_READ: 1 = 1;
export const ROSTER_PERMISSION_WRITE: 0 = 0;
export const NAMES_COLLECTION = "names";
export const NAMES_KEY = "n";
export const NAMES_PERMISSION_READ: 0 = 0;
export const NAMES_PERMISSION_WRITE: 0 = 0;

export interface CharacterRoster {
  characterIds: string[];
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
}

export function emptyRoster(nowMs: number): CharacterRoster {
  return {
    characterIds: [],
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

export function liveCharacterCount(records: Array<{ deletedAt?: number }>): number {
  let live = 0;
  for (let i = 0; i < records.length; i++) {
    if (!isDeleted(records[i].deletedAt)) {
      live += 1;
    }
  }
  return live;
}

export function isDeleted(deletedAt: number | undefined): boolean {
  return typeof deletedAt === "number" && deletedAt > 0;
}

export function canCreateCharacter(liveCount: number, limit: number = CHARACTER_SLOT_LIMIT): boolean {
  return liveCount < limit;
}

export function canRestoreCharacter(liveCount: number, limit: number = CHARACTER_SLOT_LIMIT): boolean {
  return liveCount < limit;
}

export function addCharacterId(roster: CharacterRoster, characterId: string, nowMs: number): CharacterRoster {
  const characterIds = roster.characterIds.slice();
  if (characterIds.indexOf(characterId) === -1) {
    characterIds.push(characterId);
  }
  return {
    characterIds: characterIds,
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: roster.createdAt,
    updatedAt: nowMs,
  };
}

export function rosterFromLegacy(characterId: string, nowMs: number): CharacterRoster {
  return {
    characterIds: [characterId],
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}
