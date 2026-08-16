import {
  CHARACTER_COLLECTION,
  CHARACTER_KEY,
  CHARACTER_PERMISSION_READ,
  CHARACTER_PERMISSION_WRITE,
  checkpointCharacterPosition,
  storedCharacterWriteValue,
  type StoredCharacter,
} from "../domain/character";
import { loadCanonicalCharacter } from "../domain/save_load";

export function buildCharacterWrite(
  userId: string,
  record: StoredCharacter,
  version?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: CHARACTER_COLLECTION,
    key: CHARACTER_KEY,
    userId: userId,
    value: storedCharacterWriteValue(record),
    permissionRead: CHARACTER_PERMISSION_READ,
    permissionWrite: CHARACTER_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readCharacter(nk: nkruntime.Nakama, userId: string): StoredCharacter | null {
  const objects = nk.storageRead([
    {
      collection: CHARACTER_COLLECTION,
      key: CHARACTER_KEY,
      userId: userId,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  const loaded = loadCanonicalCharacter(objects[0].value, true, objects[0].version);
  if (!loaded.ok || loaded.value === null) {
    throw new Error(loaded.reason);
  }
  if (loaded.persist && loaded.raw !== null) {
    persistMigratedCharacter(nk, userId);
  }
  return loaded.value;
}

export function writeCharacter(nk: nkruntime.Nakama, userId: string, record: StoredCharacter): void {
  const write = buildCharacterWrite(userId, record);
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: CHARACTER_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

export function writeCharacterCheckpoint(nk: nkruntime.Nakama, userId: string, x: number, y: number): void {
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: CHARACTER_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalCharacter(objects[0].value, true, objects[0].version);
      if (!loaded.ok || loaded.value === null) {
        return [];
      }
      const current = loaded.value;
      if (current.position.x === x && current.position.y === y && !loaded.persist) {
        return [];
      }
      const next = checkpointCharacterPosition(current, x, y, Date.now());
      return [buildCharacterWrite(userId, next, objects[0].version)];
    },
    5,
  );
}

function persistMigratedCharacter(nk: nkruntime.Nakama, userId: string): void {
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: CHARACTER_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalCharacter(objects[0].value, true, objects[0].version);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildCharacterWrite(userId, loaded.value, objects[0].version)];
    },
    5,
  );
}
