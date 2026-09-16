import { SYSTEM_USER_ID } from "./starter_zone_registry";
import { storageKey } from "../domain/storage_scope";
import {
  ACCOUNT_DELETION_COLLECTION,
  ACCOUNT_DELETION_KEY,
  ACCOUNT_DELETION_PERMISSION_READ,
  ACCOUNT_DELETION_PERMISSION_WRITE,
  deletionJobFromStorage,
  deletionTombstoneValue,
  type AccountDeletionJob,
} from "../domain/account_deletion";

function deletionStorageKey(accountUserId: string): string {
  return storageKey(ACCOUNT_DELETION_KEY, accountUserId);
}

export function readAccountDeletionJob(nk: nkruntime.Nakama, accountUserId: string): AccountDeletionJob | null {
  const objects = nk.storageRead([
    {
      collection: ACCOUNT_DELETION_COLLECTION,
      key: deletionStorageKey(accountUserId),
      userId: SYSTEM_USER_ID,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return deletionJobFromStorage(objects[0].value as { [key: string]: unknown });
}

export function writeAccountDeletionJob(nk: nkruntime.Nakama, job: AccountDeletionJob): void {
  const value = job.completedAt > 0 ? deletionTombstoneValue(job) : job;
  nk.storageWrite([
    {
      collection: ACCOUNT_DELETION_COLLECTION,
      key: deletionStorageKey(job.accountUserId),
      userId: SYSTEM_USER_ID,
      value: value,
      permissionRead: ACCOUNT_DELETION_PERMISSION_READ,
      permissionWrite: ACCOUNT_DELETION_PERMISSION_WRITE,
    },
  ]);
}
