import {
  GAMEPLAY_LEASE_COLLECTION,
  GAMEPLAY_LEASE_KEY,
  GAMEPLAY_LEASE_PERMISSION_READ,
  GAMEPLAY_LEASE_PERMISSION_WRITE,
  decideLeaseAcquire,
  enteringLease,
  leaseFromStorage,
  leaseStorageValue,
  type GameplayLease,
  type LeaseAcquireInput,
} from "../domain/gameplay_lease";

function leaseWriteRequest(lease: GameplayLease, version?: string): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: GAMEPLAY_LEASE_COLLECTION,
    key: GAMEPLAY_LEASE_KEY,
    userId: lease.accountUserId,
    value: leaseStorageValue(lease),
    permissionRead: GAMEPLAY_LEASE_PERMISSION_READ,
    permissionWrite: GAMEPLAY_LEASE_PERMISSION_WRITE,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}

export function readGameplayLease(nk: nkruntime.Nakama, userId: string): GameplayLease | null {
  const objects = nk.storageRead([{ collection: GAMEPLAY_LEASE_COLLECTION, key: GAMEPLAY_LEASE_KEY, userId: userId }]);
  if (objects.length === 0) {
    return null;
  }
  return leaseFromStorage(objects[0].value as { [key: string]: unknown });
}

export function writeGameplayLease(nk: nkruntime.Nakama, lease: GameplayLease): void {
  nk.storageWrite([leaseWriteRequest(lease)]);
}

export function deleteGameplayLease(nk: nkruntime.Nakama, userId: string): void {
  nk.storageDelete([{ collection: GAMEPLAY_LEASE_COLLECTION, key: GAMEPLAY_LEASE_KEY, userId: userId }]);
}

export function matchStillExists(nk: nkruntime.Nakama, matchId: string): boolean {
  if (matchId.length === 0) {
    return false;
  }
  return nk.matchGet(matchId) !== null;
}

export function tryAcquireEnteringLease(nk: nkruntime.Nakama, input: LeaseAcquireInput): GameplayLease {
  let acquired: GameplayLease | null = null;
  let conflict = false;
  nk.storageWriteRetry(
    [{ collection: GAMEPLAY_LEASE_COLLECTION, key: GAMEPLAY_LEASE_KEY, userId: input.accountUserId }],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      const existing = objects.length > 0 ? leaseFromStorage(objects[0].value as { [key: string]: unknown }) : null;
      const matchExists =
        existing !== null && existing.matchId.length > 0 ? matchStillExists(nk, existing.matchId) : false;
      const candidate = enteringLease(input);
      const decision = decideLeaseAcquire(existing, candidate, input.nowMs, matchExists);
      if (!decision.ok) {
        conflict = true;
        return [];
      }
      acquired = decision.lease;
      const version = objects.length > 0 ? objects[0].version : "*";
      return [leaseWriteRequest(decision.lease, version)];
    },
    5,
  );
  if (conflict || acquired === null) {
    throw new Error("account_busy");
  }
  return acquired;
}
