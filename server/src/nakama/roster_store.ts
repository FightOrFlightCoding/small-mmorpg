import {
  ROSTER_COLLECTION,
  ROSTER_KEY,
  ROSTER_PERMISSION_READ,
  ROSTER_PERMISSION_WRITE,
  type CharacterRoster,
} from "../domain/character_roster";
import { SAVE_SCHEMA_VERSION } from "../domain/save_schema";

export function readRoster(nk: nkruntime.Nakama, userId: string): CharacterRoster | null {
  const objects = nk.storageRead([
    { collection: ROSTER_COLLECTION, key: ROSTER_KEY, userId: userId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return rosterFromValue(objects[0].value);
}

export function writeRoster(nk: nkruntime.Nakama, userId: string, roster: CharacterRoster): void {
  nk.storageWrite([
    {
      collection: ROSTER_COLLECTION,
      key: ROSTER_KEY,
      userId: userId,
      value: {
        characterIds: roster.characterIds.slice(),
        schemaVersion: SAVE_SCHEMA_VERSION,
        createdAt: roster.createdAt,
        updatedAt: roster.updatedAt,
      },
      permissionRead: ROSTER_PERMISSION_READ,
      permissionWrite: ROSTER_PERMISSION_WRITE,
    },
  ]);
}

export function rosterFromValue(value: { [key: string]: unknown }): CharacterRoster | null {
  if (!Array.isArray(value.characterIds)) {
    return null;
  }
  const characterIds: string[] = [];
  for (let i = 0; i < value.characterIds.length; i++) {
    const id = value.characterIds[i];
    if (typeof id === "string" && id.length > 0) {
      characterIds.push(id);
    }
  }
  return {
    characterIds: characterIds,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_VERSION,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
  };
}
