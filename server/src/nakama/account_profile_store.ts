import { listedStorageObjects } from "./storage_index";
import {
  ACCOUNT_PROFILE_COLLECTION,
  ACCOUNT_PROFILE_INDEX,
  ACCOUNT_PROFILE_KEY,
  ACCOUNT_PROFILE_PERMISSION_READ,
  ACCOUNT_PROFILE_PERMISSION_WRITE,
  accountProfileWriteValue,
  decideProfileEmailLookup,
  parseAccountProfileValue,
  type AccountProfileRecord,
} from "../domain/account_profile";
import { hmacIndexQuery, hmacIndexQueryQuoted, type EmailIndexRecord } from "../domain/account_compat";
import { type EmailLookupDecision } from "../domain/account_compat";

function recordsFromListed(listed: unknown): EmailIndexRecord[] {
  const objects = listedStorageObjects(listed);
  const records: EmailIndexRecord[] = [];
  for (let i = 0; i < objects.length; i++) {
    const parsed = parseAccountProfileValue(objects[i].value, objects[i].userId);
    if (parsed !== null) {
      records.push({ hmac: parsed.hmac, userId: parsed.userId });
    }
  }
  return records;
}

export function writeAccountProfile(
  nk: nkruntime.Nakama,
  userId: string,
  hmac: string,
  verifiedAt: number,
): AccountProfileRecord {
  const value = accountProfileWriteValue(userId, hmac, verifiedAt);
  nk.storageWrite([
    {
      collection: ACCOUNT_PROFILE_COLLECTION,
      key: ACCOUNT_PROFILE_KEY,
      userId: userId,
      value: value,
      permissionRead: ACCOUNT_PROFILE_PERMISSION_READ,
      permissionWrite: ACCOUNT_PROFILE_PERMISSION_WRITE,
    },
  ]);
  return value;
}

export function readAccountProfile(nk: nkruntime.Nakama, userId: string): AccountProfileRecord | null {
  const objects = nk.storageRead([
    { collection: ACCOUNT_PROFILE_COLLECTION, key: ACCOUNT_PROFILE_KEY, userId: userId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return parseAccountProfileValue(objects[0].value, objects[0].userId);
}

export function lookupAccountProfileByHmac(
  nk: nkruntime.Nakama,
  hmac: string,
): { decision: EmailLookupDecision; hits: EmailIndexRecord[] } {
  const queries = [hmacIndexQuery(hmac), hmacIndexQueryQuoted(hmac), "*"];
  let hits: EmailIndexRecord[] = [];
  for (let i = 0; i < queries.length; i++) {
    const listed = nk.storageIndexList(ACCOUNT_PROFILE_INDEX, queries[i], 10);
    let found = recordsFromListed(listed);
    if (queries[i] === "*") {
      const filtered: EmailIndexRecord[] = [];
      for (let h = 0; h < found.length; h++) {
        if (found[h].hmac === hmac) {
          filtered.push(found[h]);
        }
      }
      found = filtered;
    }
    if (found.length > 0) {
      hits = found;
      break;
    }
  }
  const primary = hits.length === 1 ? readAccountProfile(nk, hits[0].userId) : null;
  return { decision: decideProfileEmailLookup(hits, primary, hmac), hits: hits };
}
