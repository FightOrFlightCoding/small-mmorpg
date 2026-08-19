import {
  GAMEPLAY_LEASE_COLLECTION,
  GAMEPLAY_LEASE_KEY,
  GAMEPLAY_LEASE_PERMISSION_READ,
  GAMEPLAY_LEASE_PERMISSION_WRITE,
  leaseFromStorage,
  type GameplayLease,
} from "../domain/gameplay_lease";

export function readGameplayLease(nk: nkruntime.Nakama, userId: string): GameplayLease | null {
  const objects = nk.storageRead([{ collection: GAMEPLAY_LEASE_COLLECTION, key: GAMEPLAY_LEASE_KEY, userId: userId }]);
  if (objects.length === 0) {
    return null;
  }
  return leaseFromStorage(objects[0].value as { [key: string]: unknown });
}

export function writeGameplayLease(nk: nkruntime.Nakama, lease: GameplayLease): void {
  nk.storageWrite([
    {
      collection: GAMEPLAY_LEASE_COLLECTION,
      key: GAMEPLAY_LEASE_KEY,
      userId: lease.accountUserId,
      value: {
        accountUserId: lease.accountUserId,
        characterId: lease.characterId,
        matchId: lease.matchId,
        presenceState: lease.presenceState,
        acquiredAt: lease.acquiredAt,
        lastSeenAt: lease.lastSeenAt,
        playAvailableAt: lease.playAvailableAt,
        schemaVersion: lease.schemaVersion,
      },
      permissionRead: GAMEPLAY_LEASE_PERMISSION_READ,
      permissionWrite: GAMEPLAY_LEASE_PERMISSION_WRITE,
    },
  ]);
}

export function deleteGameplayLease(nk: nkruntime.Nakama, userId: string): void {
  nk.storageDelete([{ collection: GAMEPLAY_LEASE_COLLECTION, key: GAMEPLAY_LEASE_KEY, userId: userId }]);
}
