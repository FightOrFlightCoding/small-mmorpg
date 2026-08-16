import {
  INVENTORY_COLLECTION,
  INVENTORY_KEY,
  INVENTORY_PERMISSION_READ,
  INVENTORY_PERMISSION_WRITE,
  storedInventoryFromValue,
  storedInventoryWriteValue,
} from "../domain/inventory_store";
import { type PlayerInventory } from "../domain/inventory";

export function buildInventoryWrite(
  userId: string,
  inventory: PlayerInventory,
  version?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: INVENTORY_COLLECTION,
    key: INVENTORY_KEY,
    userId: userId,
    value: storedInventoryWriteValue(inventory),
    permissionRead: INVENTORY_PERMISSION_READ,
    permissionWrite: INVENTORY_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readInventory(nk: nkruntime.Nakama, userId: string): PlayerInventory | null {
  const objects = nk.storageRead([
    {
      collection: INVENTORY_COLLECTION,
      key: INVENTORY_KEY,
      userId: userId,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return storedInventoryFromValue(objects[0].value);
}

export function writeInventoryOnce(nk: nkruntime.Nakama, userId: string, inventory: PlayerInventory): void {
  const write = buildInventoryWrite(userId, inventory);
  nk.storageWriteRetry(
    [{ collection: INVENTORY_COLLECTION, key: INVENTORY_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

export function writeInventory(nk: nkruntime.Nakama, userId: string, inventory: PlayerInventory): void {
  nk.storageWriteRetry(
    [{ collection: INVENTORY_COLLECTION, key: INVENTORY_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildInventoryWrite(userId, inventory, objects[0].version)];
      }
      return [buildInventoryWrite(userId, inventory)];
    },
    5,
  );
}
