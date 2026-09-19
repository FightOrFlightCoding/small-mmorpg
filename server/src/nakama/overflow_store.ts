import {
  OVERFLOW_COLLECTION,
  OVERFLOW_KEY,
  OVERFLOW_PERMISSION_READ,
  OVERFLOW_PERMISSION_WRITE,
  type MigrationOverflow,
} from "../domain/overflow";
import { storedOverflowFromValue, storedOverflowWriteValue } from "../domain/overflow_store";
import { storageKey } from "../domain/storage_scope";
import { readPlayerObject } from "./player_storage";

export function buildOverflowWrite(
  userId: string,
  overflow: MigrationOverflow,
  version?: string,
  characterId?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: OVERFLOW_COLLECTION,
    key: storageKey(OVERFLOW_KEY, characterId),
    userId: userId,
    value: storedOverflowWriteValue(overflow),
    permissionRead: OVERFLOW_PERMISSION_READ,
    permissionWrite: OVERFLOW_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readOverflow(nk: nkruntime.Nakama, userId: string, characterId?: string): MigrationOverflow | null {
  const object = readPlayerObject(nk, OVERFLOW_COLLECTION, OVERFLOW_KEY, userId, characterId);
  if (object === null) {
    return null;
  }
  return storedOverflowFromValue(object.value);
}

export function writeOverflow(
  nk: nkruntime.Nakama,
  userId: string,
  overflow: MigrationOverflow,
  characterId?: string,
): void {
  nk.storageWriteRetry(
    [{ collection: OVERFLOW_COLLECTION, key: storageKey(OVERFLOW_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildOverflowWrite(userId, overflow, objects[0].version, characterId)];
      }
      return [buildOverflowWrite(userId, overflow, undefined, characterId)];
    },
    5,
  );
}

export function writeOverflowOnce(
  nk: nkruntime.Nakama,
  userId: string,
  overflow: MigrationOverflow,
  characterId?: string,
): void {
  const write = buildOverflowWrite(userId, overflow, undefined, characterId);
  nk.storageWriteRetry(
    [{ collection: OVERFLOW_COLLECTION, key: storageKey(OVERFLOW_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

export function deleteOverflow(nk: nkruntime.Nakama, userId: string, characterId?: string): void {
  const deletes: nkruntime.StorageDeleteRequest[] = [];
  if (characterId !== undefined && characterId.length > 0) {
    deletes.push({ collection: OVERFLOW_COLLECTION, key: storageKey(OVERFLOW_KEY, characterId), userId: userId });
  }
  deletes.push({ collection: OVERFLOW_COLLECTION, key: OVERFLOW_KEY, userId: userId });
  nk.storageDelete(deletes);
}
