import {
  INVENTORY_COLLECTION,
  INVENTORY_KEY,
  INVENTORY_PERMISSION_READ,
  INVENTORY_PERMISSION_WRITE,
  storedInventoryWriteValue,
} from "../domain/inventory_store";
import { type PlayerInventory } from "../domain/inventory";
import { storageKey } from "../domain/storage_scope";
import { loadCanonicalInventory } from "../domain/save_load";
import { readPlayerObject } from "./player_storage";

export function buildInventoryWrite(
  userId: string,
  inventory: PlayerInventory,
  version?: string,
  characterId?: string,
): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: INVENTORY_COLLECTION,
    key: storageKey(INVENTORY_KEY, characterId),
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

export function readInventory(nk: nkruntime.Nakama, userId: string, characterId?: string): PlayerInventory | null {
  const object = readPlayerObject(nk, INVENTORY_COLLECTION, INVENTORY_KEY, userId, characterId);
  if (object === null) {
    return null;
  }
  const loaded = loadCanonicalInventory(object.value, true);
  if (!loaded.ok) {
    throw new Error(loaded.reason);
  }
  if (loaded.missing || loaded.value === null) {
    return null;
  }
  if (loaded.persist) {
    persistMigratedInventory(nk, userId, characterId);
  }
  return loaded.value;
}

export function writeInventoryOnce(
  nk: nkruntime.Nakama,
  userId: string,
  inventory: PlayerInventory,
  characterId?: string,
): void {
  const write = buildInventoryWrite(userId, inventory, undefined, characterId);
  nk.storageWriteRetry(
    [{ collection: INVENTORY_COLLECTION, key: storageKey(INVENTORY_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [write];
    },
    5,
  );
}

export function writeInventory(
  nk: nkruntime.Nakama,
  userId: string,
  inventory: PlayerInventory,
  characterId?: string,
): void {
  nk.storageWriteRetry(
    [{ collection: INVENTORY_COLLECTION, key: storageKey(INVENTORY_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [buildInventoryWrite(userId, inventory, objects[0].version, characterId)];
      }
      return [buildInventoryWrite(userId, inventory, undefined, characterId)];
    },
    5,
  );
}

function persistMigratedInventory(nk: nkruntime.Nakama, userId: string, characterId?: string): void {
  nk.storageWriteRetry(
    [{ collection: INVENTORY_COLLECTION, key: storageKey(INVENTORY_KEY, characterId), userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length === 0) {
        return [];
      }
      const loaded = loadCanonicalInventory(objects[0].value, true);
      if (!loaded.ok || loaded.value === null || !loaded.persist) {
        return [];
      }
      return [buildInventoryWrite(userId, loaded.value, objects[0].version, characterId)];
    },
    5,
  );
}
