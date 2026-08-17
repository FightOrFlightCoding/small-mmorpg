import {
  CHARACTER_COLLECTION,
  CHARACTER_KEY,
  CHARACTER_PERMISSION_READ,
  CHARACTER_PERMISSION_WRITE,
  checkpointCharacterPosition,
  storedCharacterWriteValue,
  type StoredCharacter,
} from "../domain/character";
import { storageKey } from "../domain/storage_scope";
import { loadCanonicalCharacter } from "../domain/save_load";
import { readPlayerObject } from "./player_storage";

export function buildCharacterWrite(
  userId: string,
  record: StoredCharacter,
  version?: string,
  characterId?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: CHARACTER_COLLECTION,
    key: storageKey(CHARACTER_KEY, characterId),
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

export function readCharacter(nk: nkruntime.Nakama, userId: string, characterId?: string): StoredCharacter | null {
  const object = readPlayerObject(nk, CHARACTER_COLLECTION, CHARACTER_KEY, userId, characterId);
  if (object === null) {
    return null;
  }
  const loaded = loadCanonicalCharacter(object.value, true, object.version);
  if (!loaded.ok || loaded.value === null) {
    throw new Error(loaded.reason);
  }
  if (characterId !== undefined && characterId.length > 0 && loaded.value.characterId !== characterId) {
    return null;
  }
  if (loaded.persist) {
    persistMigratedCharacter(nk, userId, object.key, loaded.value);
  }
  return loaded.value;
}

export function writeCharacter(nk: nkruntime.Nakama, userId: string, record: StoredCharacter): void {
  const keyId = record.characterId;
  const write = buildCharacterWrite(userId, record, undefined, keyId);
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: storageKey(CHARACTER_KEY, keyId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildCharacterWrite(userId, record, objects[0].version, keyId)];
      }
      return [write];
    },
    5,
  );
}

export function writeCharacterOnce(nk: nkruntime.Nakama, userId: string, record: StoredCharacter): void {
  const keyId = record.characterId;
  const write = buildCharacterWrite(userId, record, undefined, keyId);
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: storageKey(CHARACTER_KEY, keyId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

export function writeLegacyCharacterOnce(nk: nkruntime.Nakama, userId: string, record: StoredCharacter): void {
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

export function writeCharacterCheckpoint(
  nk: nkruntime.Nakama,
  userId: string,
  x: number,
  y: number,
  characterId?: string,
  bind?: { bindX: number; bindY: number; bindZoneId: string; innByRequestId?: { [requestId: string]: string } },
): void {
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: storageKey(CHARACTER_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      let currentObjects = objects;
      if (currentObjects.length === 0 && characterId !== undefined && characterId.length > 0) {
        currentObjects = nk.storageRead([
          { collection: CHARACTER_COLLECTION, key: CHARACTER_KEY, userId: userId },
        ]);
      }
      if (currentObjects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalCharacter(currentObjects[0].value, true, currentObjects[0].version);
      if (!loaded.ok || loaded.value === null) {
        return [];
      }
      const current = loaded.value;
      if (characterId !== undefined && characterId.length > 0 && current.characterId !== characterId) {
        return [];
      }
      if (current.position.x === x && current.position.y === y && bind === undefined && !loaded.persist) {
        return [];
      }
      const next = checkpointCharacterPosition(current, x, y, Date.now(), bind);
      const sourceKey = currentObjects[0].key;
      let writeId: string | undefined;
      if (sourceKey === CHARACTER_KEY) {
        writeId = undefined;
      } else if (characterId !== undefined && characterId.length > 0) {
        writeId = characterId;
      } else {
        writeId = current.characterId;
      }
      return [buildCharacterWrite(userId, next, currentObjects[0].version, writeId)];
    },
    5,
  );
}

function persistMigratedCharacter(
  nk: nkruntime.Nakama,
  userId: string,
  key: string,
  record: StoredCharacter,
): void {
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: key, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalCharacter(objects[0].value, true, objects[0].version);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      const writeId = key === CHARACTER_KEY ? undefined : record.characterId;
      return [buildCharacterWrite(userId, loaded.value, objects[0].version, writeId)];
    },
    5,
  );
}
