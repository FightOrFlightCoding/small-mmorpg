import {
  CHARACTER_AUDIT_COLLECTION,
  CHARACTER_AUDIT_KEY_PREFIX,
  CHARACTER_AUDIT_PERMISSION_READ,
  CHARACTER_AUDIT_PERMISSION_WRITE,
  CHARACTER_PURGE_KEY_PREFIX,
  emptyPurgeJob,
  purgeAuditRecord,
  purgeJobFromStorage,
  type CharacterPurgeJob,
} from "../domain/character_purge";
import { compactCharacterId } from "../domain/storage_scope";
import { CHARACTER_COLLECTION } from "../domain/character";
import { SYSTEM_USER_ID } from "./starter_zone_registry";

export function purgeJobKey(characterId: string): string {
  return CHARACTER_PURGE_KEY_PREFIX + compactCharacterId(characterId);
}

export function readPurgeJob(nk: nkruntime.Nakama, userId: string, characterId: string): CharacterPurgeJob | null {
  const objects = nk.storageRead([
    { collection: CHARACTER_COLLECTION, key: purgeJobKey(characterId), userId: userId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  const parsed = purgeJobFromStorage(objects[0].value as { [key: string]: unknown });
  return parsed !== null ? parsed : emptyPurgeJob(characterId, userId, 0);
}

export function writePurgeJob(nk: nkruntime.Nakama, userId: string, job: CharacterPurgeJob): void {
  nk.storageWrite([
    {
      collection: CHARACTER_COLLECTION,
      key: purgeJobKey(job.characterId),
      userId: userId,
      value: {
        characterId: job.characterId,
        accountUserId: job.accountUserId,
        completedSteps: job.completedSteps,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        schemaVersion: job.schemaVersion,
      },
      permissionRead: 1,
      permissionWrite: 0,
    },
  ]);
}

export function deletePurgeJob(nk: nkruntime.Nakama, userId: string, characterId: string): void {
  nk.storageDelete([{ collection: CHARACTER_COLLECTION, key: purgeJobKey(characterId), userId: userId }]);
}

export function writePurgeAudit(nk: nkruntime.Nakama, characterId: string, nowMs: number): void {
  const audit = purgeAuditRecord(characterId, nowMs);
  nk.storageWrite([
    {
      collection: CHARACTER_AUDIT_COLLECTION,
      key: CHARACTER_AUDIT_KEY_PREFIX + compactCharacterId(characterId),
      userId: SYSTEM_USER_ID,
      value: {
        characterId: audit.characterId,
        purgedAt: audit.purgedAt,
        schemaVersion: audit.schemaVersion,
      },
      permissionRead: CHARACTER_AUDIT_PERMISSION_READ,
      permissionWrite: CHARACTER_AUDIT_PERMISSION_WRITE,
    },
  ]);
}
