import { SYSTEM_USER_ID } from "./starter_zone_registry";
import { listedStorageObjects } from "./storage_index";
import { storageKey } from "../domain/storage_scope";
import {
  AUTH_CHALLENGE_COLLECTION,
  AUTH_CHALLENGE_INDEX,
  AUTH_CHALLENGE_KEY,
  AUTH_CHALLENGE_PERMISSION_READ,
  AUTH_CHALLENGE_PERMISSION_WRITE,
  parseAuthChallengeRecord,
  type AuthChallengePurpose,
  type AuthChallengeRecord,
} from "../domain/auth_challenge";

function challengeStorageKey(challengeId: string): string {
  return storageKey(AUTH_CHALLENGE_KEY, challengeId);
}

export function writeAuthChallenge(nk: nkruntime.Nakama, record: AuthChallengeRecord): void {
  nk.storageWrite([
    {
      collection: AUTH_CHALLENGE_COLLECTION,
      key: challengeStorageKey(record.challenge_id),
      userId: SYSTEM_USER_ID,
      value: record,
      permissionRead: AUTH_CHALLENGE_PERMISSION_READ,
      permissionWrite: AUTH_CHALLENGE_PERMISSION_WRITE,
    },
  ]);
}

export function readAuthChallenge(nk: nkruntime.Nakama, challengeId: string): AuthChallengeRecord | null {
  const objects = nk.storageRead([
    {
      collection: AUTH_CHALLENGE_COLLECTION,
      key: challengeStorageKey(challengeId),
      userId: SYSTEM_USER_ID,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return parseAuthChallengeRecord(objects[0].value);
}

export function listAuthChallengesByHash(
  nk: nkruntime.Nakama,
  emailLookupHash: string,
  purpose: AuthChallengePurpose,
): AuthChallengeRecord[] {
  const queries = ["+value.email_lookup_hash:" + emailLookupHash, "*"];
  let objects: nkruntime.StorageObject[] = [];
  for (let i = 0; i < queries.length; i++) {
    const listed = nk.storageIndexList(AUTH_CHALLENGE_INDEX, queries[i], 50);
    objects = listedStorageObjects(listed);
    if (objects.length > 0) {
      break;
    }
  }
  const records: AuthChallengeRecord[] = [];
  for (let i = 0; i < objects.length; i++) {
    const parsed = parseAuthChallengeRecord(objects[i].value);
    if (parsed !== null && parsed.email_lookup_hash === emailLookupHash && parsed.purpose === purpose) {
      records.push(parsed);
    }
  }
  return records;
}
