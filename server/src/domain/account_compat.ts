export const ACCOUNT_COMPAT_COLLECTION = "account_compat";
export const ACCOUNT_COMPAT_KEY = "email_index";
export const ACCOUNT_COMPAT_INDEX = "acct_compat_email_hmac";
export const ACCOUNT_COMPAT_PERMISSION_READ: 0 = 0;
export const ACCOUNT_COMPAT_PERMISSION_WRITE: 0 = 0;
export const ACCOUNT_COMPAT_RPC_ID = "acct_compat_probe";
export const ACCOUNT_COMPAT_HMAC_FIELD = "hmac";

export const ACCOUNT_COMPAT_OPS = ["put", "get", "list", "delete_object", "verify", "export", "delete_account", "account_summary"] as const;
export type AccountCompatOp = (typeof ACCOUNT_COMPAT_OPS)[number];

export interface EmailIndexRecord {
  hmac: string;
  userId: string;
}

export type EmailLookupReason = "missing" | "multiple" | "stale" | "mismatch";

export type EmailLookupDecision = { ok: true; userId: string } | { ok: false; reason: EmailLookupReason };

export function hmacIndexQuery(hmac: string): string {
  return "+value.hmac:" + hmac;
}

export function hmacIndexQueryQuoted(hmac: string): string {
  return '+value.hmac:"' + hmac + '"';
}

export function parseEmailIndexValue(value: { [key: string]: unknown } | undefined, objectUserId: string): EmailIndexRecord | null {
  if (value === undefined || typeof value.hmac !== "string" || value.hmac.length === 0) {
    return null;
  }
  const storedUserId = typeof value.userId === "string" && value.userId.length > 0 ? value.userId : objectUserId;
  return { hmac: value.hmac, userId: storedUserId };
}

export function decideEmailLookup(
  indexHits: EmailIndexRecord[],
  reread: EmailIndexRecord | null,
  expectedHmac: string,
): EmailLookupDecision {
  if (indexHits.length === 0) {
    return { ok: false, reason: "missing" };
  }
  if (indexHits.length !== 1) {
    return { ok: false, reason: "multiple" };
  }
  if (reread === null) {
    return { ok: false, reason: "stale" };
  }
  if (reread.hmac !== expectedHmac || reread.userId !== indexHits[0].userId || indexHits[0].hmac !== expectedHmac) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, userId: reread.userId };
}

export function emailIndexWriteValue(userId: string, hmac: string): EmailIndexRecord {
  return { hmac: hmac, userId: userId };
}
