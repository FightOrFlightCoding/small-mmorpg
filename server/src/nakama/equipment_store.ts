import {
  EQUIPMENT_COLLECTION,
  EQUIPMENT_KEY,
  EQUIPMENT_PERMISSION_READ,
  EQUIPMENT_PERMISSION_WRITE,
  storedEquipmentFromValue,
  storedEquipmentWriteValue,
} from "../domain/equipment_store";
import { type PlayerEquipment } from "../domain/equipment";

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
  return storedEquipmentFromValue(objects[0].value);
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
