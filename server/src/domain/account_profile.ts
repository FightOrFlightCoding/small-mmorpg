import { decideEmailLookup, type EmailIndexRecord, type EmailLookupDecision } from "./account_compat";

export const ACCOUNT_PROFILE_COLLECTION = "account_profile";
export const ACCOUNT_PROFILE_KEY = "email_index";
export const ACCOUNT_PROFILE_INDEX = "account_profile_email_hmac";
export const ACCOUNT_PROFILE_PERMISSION_READ: 0 = 0;
export const ACCOUNT_PROFILE_PERMISSION_WRITE: 0 = 0;

export interface AccountProfileRecord {
  hmac: string;
  userId: string;
  verifiedAt: number;
}

export function parseAccountProfileValue(
  value: { [key: string]: unknown } | undefined,
  objectUserId: string,
): AccountProfileRecord | null {
  if (value === undefined || typeof value.hmac !== "string" || value.hmac.length === 0) {
    return null;
  }
  const storedUserId = typeof value.userId === "string" && value.userId.length > 0 ? value.userId : objectUserId;
  const verifiedAt = typeof value.verifiedAt === "number" && isFinite(value.verifiedAt) ? value.verifiedAt : 0;
  return { hmac: value.hmac, userId: storedUserId, verifiedAt: verifiedAt };
}

export function accountProfileWriteValue(userId: string, hmac: string, verifiedAt: number): AccountProfileRecord {
  return { hmac: hmac, userId: userId, verifiedAt: verifiedAt };
}

export function decideProfileEmailLookup(
  indexHits: EmailIndexRecord[],
  reread: AccountProfileRecord | null,
  expectedHmac: string,
): EmailLookupDecision {
  const mapped: EmailIndexRecord | null =
    reread === null ? null : { hmac: reread.hmac, userId: reread.userId };
  return decideEmailLookup(indexHits, mapped, expectedHmac);
}
