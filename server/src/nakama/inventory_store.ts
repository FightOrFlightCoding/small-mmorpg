import {
  INVENTORY_COLLECTION,
  INVENTORY_KEY,
  INVENTORY_PERMISSION_READ,
  INVENTORY_PERMISSION_WRITE,
  storedInventoryWriteValue,
} from "../domain/inventory_store";
import { type PlayerInventory } from "../domain/inventory";
import { loadCanonicalInventory } from "../domain/save_load";

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
  const loaded = loadCanonicalInventory(objects[0].value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return null;
  }
  if (loaded.persist) {
    persistMigratedInventory(nk, userId);
  }
  return loaded.value;
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

function persistMigratedInventory(nk: nkruntime.Nakama, userId: string): void {
  nk.storageWriteRetry(
    [{ collection: INVENTORY_COLLECTION, key: INVENTORY_KEY, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalInventory(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildInventoryWrite(userId, loaded.value, objects[0].version)];
    },
    5,
  );
}
