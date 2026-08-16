import {
  QUEST_COLLECTION,
  QUEST_KEY,
  QUEST_PERMISSION_READ,
  QUEST_PERMISSION_WRITE,
  storedQuestWriteValue,
} from "../domain/quest_store";
import { emptyQuestLog, type QuestLog } from "../domain/quest";
import { storageKey } from "../domain/storage_scope";
import { loadCanonicalQuests } from "../domain/save_load";
import { readPlayerObject } from "./player_storage";

export function buildQuestWrite(
  userId: string,
  log: QuestLog,
  version?: string,
  characterId?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: QUEST_COLLECTION,
    key: storageKey(QUEST_KEY, characterId),
    userId: userId,
    value: storedQuestWriteValue(log),
    permissionRead: QUEST_PERMISSION_READ,
    permissionWrite: QUEST_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readQuests(nk: nkruntime.Nakama, userId: string, characterId?: string): QuestLog {
  const object = readPlayerObject(nk, QUEST_COLLECTION, QUEST_KEY, userId, characterId);
  if (object === null) {
    return emptyQuestLog();
  }
  const loaded = loadCanonicalQuests(object.value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return emptyQuestLog();
  }
  if (loaded.persist) {
    persistMigratedQuests(nk, userId, characterId);
  }
  return loaded.value;
}

export function writeQuests(nk: nkruntime.Nakama, userId: string, log: QuestLog, characterId?: string): void {
  nk.storageWriteRetry(
    [{ collection: QUEST_COLLECTION, key: storageKey(QUEST_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildQuestWrite(userId, log, objects[0].version, characterId)];
      }
      return [buildQuestWrite(userId, log, undefined, characterId)];
    },
    5,
  );
}

function persistMigratedQuests(nk: nkruntime.Nakama, userId: string, characterId?: string): void {
  nk.storageWriteRetry(
    [{ collection: QUEST_COLLECTION, key: storageKey(QUEST_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalQuests(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildQuestWrite(userId, loaded.value, objects[0].version, characterId)];
    },
    5,
  );
}
