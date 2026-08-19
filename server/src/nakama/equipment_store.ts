import {
  EQUIPMENT_COLLECTION,
  EQUIPMENT_KEY,
  EQUIPMENT_PERMISSION_READ,
  EQUIPMENT_PERMISSION_WRITE,
  storedEquipmentWriteValue,
} from "../domain/equipment_store";
import { type PlayerEquipment } from "../domain/equipment";
import { storageKey } from "../domain/storage_scope";
import { loadCanonicalEquipment } from "../domain/save_load";
import { readPlayerObject } from "./player_storage";

export function buildEquipmentWrite(
  userId: string,
  equipment: PlayerEquipment,
  version?: string,
  characterId?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: EQUIPMENT_COLLECTION,
    key: storageKey(EQUIPMENT_KEY, characterId),
    userId: userId,
    value: storedEquipmentWriteValue(equipment),
    permissionRead: EQUIPMENT_PERMISSION_READ,
    permissionWrite: EQUIPMENT_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readEquipment(nk: nkruntime.Nakama, userId: string, characterId?: string): PlayerEquipment | null {
  const object = readPlayerObject(nk, EQUIPMENT_COLLECTION, EQUIPMENT_KEY, userId, characterId);
  if (object === null) {
    return null;
  }
  const loaded = loadCanonicalEquipment(object.value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return null;
  }
  if (loaded.persist) {
    persistMigratedEquipment(nk, userId, characterId);
  }
  return loaded.value;
}

export function writeEquipment(
  nk: nkruntime.Nakama,
  userId: string,
  equipment: PlayerEquipment,
  characterId?: string,
): void {
  nk.storageWriteRetry(
    [{ collection: EQUIPMENT_COLLECTION, key: storageKey(EQUIPMENT_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildEquipmentWrite(userId, equipment, objects[0].version, characterId)];
      }
      return [buildEquipmentWrite(userId, equipment, undefined, characterId)];
    },
    5,
  );
}

export function writeEquipmentOnce(
  nk: nkruntime.Nakama,
  userId: string,
  equipment: PlayerEquipment,
  characterId?: string,
): void {
  const write = buildEquipmentWrite(userId, equipment, undefined, characterId);
  nk.storageWriteRetry(
    [{ collection: EQUIPMENT_COLLECTION, key: storageKey(EQUIPMENT_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

function persistMigratedEquipment(nk: nkruntime.Nakama, userId: string, characterId?: string): void {
  nk.storageWriteRetry(
    [{ collection: EQUIPMENT_COLLECTION, key: storageKey(EQUIPMENT_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalEquipment(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildEquipmentWrite(userId, loaded.value, objects[0].version, characterId)];
    },
    5,
  );
}
