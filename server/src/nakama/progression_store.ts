import {
  PROGRESSION_COLLECTION,
  PROGRESSION_KEY,
  PROGRESSION_PERMISSION_READ,
  PROGRESSION_PERMISSION_WRITE,
  storedProgressionWriteValue,
} from "../domain/progression_store";
import { type CharacterProgression } from "../domain/progression";
import { storageKey } from "../domain/storage_scope";
import { loadCanonicalProgression } from "../domain/save_load";
import { readPlayerObject } from "./player_storage";

export function buildProgressionWrite(
  userId: string,
  progression: CharacterProgression,
  version?: string,
  characterId?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: PROGRESSION_COLLECTION,
    key: storageKey(PROGRESSION_KEY, characterId),
    userId: userId,
    value: storedProgressionWriteValue(progression),
    permissionRead: PROGRESSION_PERMISSION_READ,
    permissionWrite: PROGRESSION_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readProgression(nk: nkruntime.Nakama, userId: string, characterId?: string): CharacterProgression | null {
  const object = readPlayerObject(nk, PROGRESSION_COLLECTION, PROGRESSION_KEY, userId, characterId);
  if (object === null) {
    return null;
  }
  const loaded = loadCanonicalProgression(object.value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return null;
  }
  if (loaded.persist) {
    persistMigratedProgression(nk, userId, characterId);
  }
  return loaded.value;
}

export function writeProgressionOnce(
  nk: nkruntime.Nakama,
  userId: string,
  progression: CharacterProgression,
  characterId?: string,
): void {
  const write = buildProgressionWrite(userId, progression, undefined, characterId);
  nk.storageWriteRetry(
    [{ collection: PROGRESSION_COLLECTION, key: storageKey(PROGRESSION_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

export function writeProgression(
  nk: nkruntime.Nakama,
  userId: string,
  progression: CharacterProgression,
  characterId?: string,
): void {
  nk.storageWriteRetry(
    [{ collection: PROGRESSION_COLLECTION, key: storageKey(PROGRESSION_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildProgressionWrite(userId, progression, objects[0].version, characterId)];
      }
      return [buildProgressionWrite(userId, progression, undefined, characterId)];
    },
    5,
  );
}

function persistMigratedProgression(nk: nkruntime.Nakama, userId: string, characterId?: string): void {
  nk.storageWriteRetry(
    [{ collection: PROGRESSION_COLLECTION, key: storageKey(PROGRESSION_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalProgression(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildProgressionWrite(userId, loaded.value, objects[0].version, characterId)];
    },
    5,
  );
}
