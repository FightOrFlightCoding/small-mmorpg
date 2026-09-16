import {
  CHARACTER_IDEMPOTENCY_KEY_PREFIX,
  idempotencyFromStorage,
  idempotencyRecord,
  idempotencyStorageKey,
  type CharacterIdempotencyRecord,
} from "../domain/character_idempotency";
import { CHARACTER_COLLECTION } from "../domain/character";

export function readCharacterIdempotency(
  nk: nkruntime.Nakama,
  userId: string,
  operation: string,
  key: string,
): CharacterIdempotencyRecord | null {
  const objects = nk.storageRead([
    { collection: CHARACTER_COLLECTION, key: idempotencyStorageKey(operation, key), userId: userId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return idempotencyFromStorage(objects[0].value as { [key: string]: unknown });
}

export function writeCharacterIdempotencyOnce(
  nk: nkruntime.Nakama,
  userId: string,
  operation: string,
  key: string,
  result: { [key: string]: unknown },
  nowMs: number,
): CharacterIdempotencyRecord {
  const record = idempotencyRecord(operation, key, userId, result, nowMs);
  const storageKey = idempotencyStorageKey(operation, key);
  nk.storageWriteRetry(
    [{ collection: CHARACTER_COLLECTION, key: storageKey, userId: userId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        return [];
      }
      return [
        {
          collection: CHARACTER_COLLECTION,
          key: storageKey,
          userId: userId,
          value: {
            operation: record.operation,
            idempotencyKey: record.idempotencyKey,
            accountUserId: record.accountUserId,
            result: record.result,
            schemaVersion: record.schemaVersion,
            createdAt: record.createdAt,
            keyPrefix: CHARACTER_IDEMPOTENCY_KEY_PREFIX,
          },
          permissionRead: 1,
          permissionWrite: 0,
        },
      ];
    },
    5,
  );
  const stored = readCharacterIdempotency(nk, userId, operation, key);
  return stored !== null ? stored : record;
}
