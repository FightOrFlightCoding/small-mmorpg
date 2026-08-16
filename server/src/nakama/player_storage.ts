import { storageKey } from "../domain/storage_scope";

export function readPlayerObject(
  nk: nkruntime.Nakama,
  collection: string,
  baseKey: string,
  userId: string,
  characterId?: string,
): nkruntime.StorageObject | null {
  if (characterId !== undefined && characterId.length > 0) {
    const scoped = nk.storageRead([
      { collection: collection, key: storageKey(baseKey, characterId), userId: userId },
    ]);
    if (scoped.length > 0) {
      return scoped[0];
    }
  }
  const legacy = nk.storageRead([{ collection: collection, key: baseKey, userId: userId }]);
  if (legacy.length === 0) {
    return null;
  }
  return legacy[0];
}
