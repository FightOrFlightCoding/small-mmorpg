import {
  EQUIPMENT_COLLECTION,
  EQUIPMENT_KEY,
  EQUIPMENT_PERMISSION_READ,
  EQUIPMENT_PERMISSION_WRITE,
  storedEquipmentWriteValue,
} from "../domain/equipment_store";
import { type PlayerEquipment } from "../domain/equipment";
import { loadCanonicalEquipment } from "../domain/save_load";

export function buildEquipmentWrite(
  userId: string,
  equipment: PlayerEquipment,
  version?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: EQUIPMENT_COLLECTION,
    key: EQUIPMENT_KEY,
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

export function readEquipment(nk: nkruntime.Nakama, userId: string): PlayerEquipment | null {
  const objects = nk.storageRead([
    {
      collection: EQUIPMENT_COLLECTION,
      key: EQUIPMENT_KEY,
      userId: userId,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  const loaded = loadCanonicalEquipment(objects[0].value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return null;
  }
  if (loaded.persist) {
    persistMigratedEquipment(nk, userId);
  }
  return loaded.value;
}

export function writeEquipment(nk: nkruntime.Nakama, userId: string, equipment: PlayerEquipment): void {
  nk.storageWriteRetry(
    [{ collection: EQUIPMENT_COLLECTION, key: EQUIPMENT_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildEquipmentWrite(userId, equipment, objects[0].version)];
      }
      return [buildEquipmentWrite(userId, equipment)];
    },
    5,
  );
}

function persistMigratedEquipment(nk: nkruntime.Nakama, userId: string): void {
  nk.storageWriteRetry(
    [{ collection: EQUIPMENT_COLLECTION, key: EQUIPMENT_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalEquipment(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildEquipmentWrite(userId, loaded.value, objects[0].version)];
    },
    5,
  );
}
