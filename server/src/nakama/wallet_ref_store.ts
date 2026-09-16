import {
  WALLET_REF_COLLECTION,
  WALLET_REF_KEY,
  WALLET_REF_PERMISSION_READ,
  WALLET_REF_PERMISSION_WRITE,
} from "../domain/wallet_ref";
import { migrateWalletRef } from "../domain/migration";

export function loadWalletRef(nk: nkruntime.Nakama, userId: string): void {
  const objects = nk.storageRead([
    {
      collection: WALLET_REF_COLLECTION,
      key: WALLET_REF_KEY,
      userId: userId,
    },
  ]);
  const migrated = migrateWalletRef({
    userId: userId,
    walletRef: objects.length > 0 ? objects[0].value : undefined,
    walletRefPresent: objects.length > 0,
  });
  if (!migrated.ok || migrated.value === null) {
    throw new Error(migrated.reason);
  }
  if (!migrated.changed) {
    return;
  }
  nk.storageWriteRetry(
    [{ collection: WALLET_REF_COLLECTION, key: WALLET_REF_KEY, userId: userId }],
    function (existing: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      const again = migrateWalletRef({
        userId: userId,
        walletRef: existing.length > 0 ? existing[0].value : undefined,
        walletRefPresent: existing.length > 0,
      });
      if (!again.ok || again.value === null || !again.changed) {
        return [];
      }
      const write: nkruntime.StorageWriteRequest = {
        collection: WALLET_REF_COLLECTION,
        key: WALLET_REF_KEY,
        userId: userId,
        value: again.value,
        permissionRead: WALLET_REF_PERMISSION_READ,
        permissionWrite: WALLET_REF_PERMISSION_WRITE,
      };
      if (existing.length > 0) {
        write.version = existing[0].version;
      }
      return [write];
    },
    5,
  );
}
