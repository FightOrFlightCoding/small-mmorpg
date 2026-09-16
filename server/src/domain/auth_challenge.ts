import { constantTimeEqual } from "./hmac";

export const AUTH_CHALLENGE_COLLECTION = "auth_challenge";
export const AUTH_CHALLENGE_KEY = "c";
export const AUTH_CHALLENGE_INDEX = "auth_challenge_lookup";
export const AUTH_CHALLENGE_PERMISSION_READ: 0 = 0;
export const AUTH_CHALLENGE_PERMISSION_WRITE: 0 = 0;
export const AUTH_CHALLENGE_SCHEMA_VERSION = 1;
export const AUTH_CHALLENGE_MAX_ATTEMPTS = 5;
export const AUTH_CHALLENGE_TTL_MS = 30 * 60 * 1000;

export const AUTH_CHALLENGE_PURPOSES = [
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "EMAIL_CHANGE",
  "ACCOUNT_DELETION",
] as const;

export type AuthChallengePurpose = (typeof AUTH_CHALLENGE_PURPOSES)[number];

export interface AuthChallengeRecord {
  challenge_id: string;
  account_user_id: string;
  email_lookup_hash: string;
  purpose: AuthChallengePurpose;
  secret_hash: string;
  created_at: number;
  expires_at: number;
  attempt_count: number;
  maximum_attempts: number;
  consumed_at: number;
  invalidated_at: number;
  request_id: string;
  schema_version: number;
}

export type ChallengeConsumeReason =
  | "missing"
  | "invalidated"
  | "expired"
  | "locked"
  | "wrong_code"
  | "purpose_mismatch";

export type ChallengeConsumeResult =
  | { ok: true; record: AuthChallengeRecord; idempotent: boolean }
  | { ok: false; reason: ChallengeConsumeReason; record: AuthChallengeRecord | null };

export function isAuthChallengePurpose(value: string): value is AuthChallengePurpose {
  return AUTH_CHALLENGE_PURPOSES.indexOf(value as AuthChallengePurpose) !== -1;
}

export function createAuthChallenge(input: {
  challengeId: string;
  accountUserId: string;
  emailLookupHash: string;
  purpose: AuthChallengePurpose;
  secretHash: string;
  requestId: string;
  nowMs: number;
  ttlMs?: number;
}): AuthChallengeRecord {
  const ttl = input.ttlMs !== undefined ? input.ttlMs : AUTH_CHALLENGE_TTL_MS;
  return {
    challenge_id: input.challengeId,
    account_user_id: input.accountUserId,
    email_lookup_hash: input.emailLookupHash,
    purpose: input.purpose,
    secret_hash: input.secretHash,
    created_at: input.nowMs,
    expires_at: input.nowMs + ttl,
    attempt_count: 0,
    maximum_attempts: AUTH_CHALLENGE_MAX_ATTEMPTS,
    consumed_at: 0,
    invalidated_at: 0,
    request_id: input.requestId,
    schema_version: AUTH_CHALLENGE_SCHEMA_VERSION,
  };
}

export function invalidateAuthChallenge(record: AuthChallengeRecord, nowMs: number): AuthChallengeRecord {
  if (record.invalidated_at > 0 || record.consumed_at > 0) {
    return record;
  }
  return { ...record, invalidated_at: nowMs };
}

export function consumeAuthChallenge(input: {
  record: AuthChallengeRecord | null;
  secretHash: string;
  purpose: AuthChallengePurpose;
  nowMs: number;
}): ChallengeConsumeResult {
  if (input.record === null) {
    return { ok: false, reason: "missing", record: null };
  }
  const record = input.record;
  if (record.purpose !== input.purpose) {
    return { ok: false, reason: "purpose_mismatch", record: record };
  }
  if (record.invalidated_at > 0) {
    return { ok: false, reason: "invalidated", record: record };
  }
  if (record.expires_at <= input.nowMs) {
    return { ok: false, reason: "expired", record: record };
  }
  if (record.consumed_at > 0) {
    if (constantTimeEqual(record.secret_hash, input.secretHash)) {
      return { ok: true, record: record, idempotent: true };
    }
    return { ok: false, reason: "wrong_code", record: record };
  }
  if (record.attempt_count >= record.maximum_attempts) {
    return { ok: false, reason: "locked", record: record };
  }
  if (!constantTimeEqual(record.secret_hash, input.secretHash)) {
    const attempts = record.attempt_count + 1;
    const updated: AuthChallengeRecord = { ...record, attempt_count: attempts };
    if (attempts >= record.maximum_attempts) {
      return { ok: false, reason: "locked", record: updated };
    }
    return { ok: false, reason: "wrong_code", record: updated };
  }
  return { ok: true, record: { ...record, consumed_at: input.nowMs }, idempotent: false };
}

export function parseAuthChallengeRecord(value: { [key: string]: unknown } | undefined): AuthChallengeRecord | null {
  if (value === undefined) {
    return null;
  }
  if (
    typeof value.challenge_id !== "string" ||
    value.challenge_id.length === 0 ||
    typeof value.email_lookup_hash !== "string" ||
    typeof value.purpose !== "string" ||
    !isAuthChallengePurpose(value.purpose) ||
    typeof value.secret_hash !== "string" ||
    value.secret_hash.length !== 64 ||
    typeof value.created_at !== "number" ||
    typeof value.expires_at !== "number" ||
    typeof value.attempt_count !== "number" ||
    typeof value.maximum_attempts !== "number" ||
    typeof value.consumed_at !== "number" ||
    typeof value.invalidated_at !== "number" ||
    typeof value.request_id !== "string" ||
    typeof value.schema_version !== "number"
  ) {
    return null;
  }
  return {
    challenge_id: value.challenge_id,
    account_user_id: typeof value.account_user_id === "string" ? value.account_user_id : "",
    email_lookup_hash: value.email_lookup_hash,
    purpose: value.purpose,
    secret_hash: value.secret_hash.toLowerCase(),
    created_at: value.created_at,
    expires_at: value.expires_at,
    attempt_count: value.attempt_count,
    maximum_attempts: value.maximum_attempts,
    consumed_at: value.consumed_at,
    invalidated_at: value.invalidated_at,
    request_id: value.request_id,
    schema_version: value.schema_version,
  };
}
