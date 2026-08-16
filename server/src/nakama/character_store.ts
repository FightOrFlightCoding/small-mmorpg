import {
  CHARACTER_COLLECTION,
  CHARACTER_KEY,
  CHARACTER_PERMISSION_READ,
  CHARACTER_PERMISSION_WRITE,
  checkpointCharacterPosition,
  storedCharacterFromValue,
  storedCharacterWriteValue,
  type StoredCharacter,
} from "../domain/character";

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
  return storedCharacterFromValue(objects[0].value, objects[0].version);
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
      const current = storedCharacterFromValue(objects[0].value, objects[0].version);
      if (current === null) {
        return [];
      }
      if (current.position.x === x && current.position.y === y) {
        return [];
      }
      return [buildCharacterWrite(userId, checkpointCharacterPosition(current, x, y), objects[0].version)];
    },
    5,
  );
}
