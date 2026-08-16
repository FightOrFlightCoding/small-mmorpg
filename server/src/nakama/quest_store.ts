import {
  QUEST_COLLECTION,
  QUEST_KEY,
  QUEST_PERMISSION_READ,
  QUEST_PERMISSION_WRITE,
  storedQuestWriteValue,
} from "../domain/quest_store";
import { emptyQuestLog, type QuestLog } from "../domain/quest";
import { loadCanonicalQuests } from "../domain/save_load";

export function buildQuestWrite(userId: string, log: QuestLog, version?: string): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: QUEST_COLLECTION,
    key: QUEST_KEY,
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

export function readQuests(nk: nkruntime.Nakama, userId: string): QuestLog {
  const objects = nk.storageRead([
    {
      collection: QUEST_COLLECTION,
      key: QUEST_KEY,
      userId: userId,
    },
  ]);
  if (objects.length === 0) {
    return emptyQuestLog();
  }
  const loaded = loadCanonicalQuests(objects[0].value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return emptyQuestLog();
  }
  if (loaded.persist) {
    persistMigratedQuests(nk, userId);
  }
  return loaded.value;
}

export function writeQuests(nk: nkruntime.Nakama, userId: string, log: QuestLog): void {
  nk.storageWriteRetry(
    [{ collection: QUEST_COLLECTION, key: QUEST_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildQuestWrite(userId, log, objects[0].version)];
      }
      return [buildQuestWrite(userId, log)];
    },
    5,
  );
}

function persistMigratedQuests(nk: nkruntime.Nakama, userId: string): void {
  nk.storageWriteRetry(
    [{ collection: QUEST_COLLECTION, key: QUEST_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalQuests(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildQuestWrite(userId, loaded.value, objects[0].version)];
    },
    5,
  );
}
