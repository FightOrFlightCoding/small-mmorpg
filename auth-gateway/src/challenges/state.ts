import { hashesEqual } from "./codes";
import type { AuthChallengePurpose, AuthChallengeRecord } from "./types";

export const AUTH_CHALLENGE_MAX_ATTEMPTS = 5;
export const AUTH_CHALLENGE_TTL_MS = 30 * 60 * 1000;
export const AUTH_CHALLENGE_SCHEMA_VERSION = 1;

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

export function createChallengeRecord(input: {
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

export function consumeChallenge(input: {
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
    if (hashesEqual(record.secret_hash, input.secretHash)) {
      return { ok: true, record: record, idempotent: true };
    }
    return { ok: false, reason: "wrong_code", record: record };
  }
  if (record.attempt_count >= record.maximum_attempts) {
    return { ok: false, reason: "locked", record: record };
  }
  if (!hashesEqual(record.secret_hash, input.secretHash)) {
    const attempts = record.attempt_count + 1;
    const updated = { ...record, attempt_count: attempts };
    if (attempts >= record.maximum_attempts) {
      return { ok: false, reason: "locked", record: updated };
    }
    return { ok: false, reason: "wrong_code", record: updated };
  }
  return { ok: true, record: { ...record, consumed_at: input.nowMs }, idempotent: false };
}

export class MemoryChallengeStore {
  readonly records: Map<string, AuthChallengeRecord> = new Map();

  put(record: AuthChallengeRecord): void {
    this.records.forEach((existing, id) => {
      if (
        existing.email_lookup_hash === record.email_lookup_hash &&
        existing.purpose === record.purpose &&
        existing.challenge_id !== record.challenge_id &&
        existing.consumed_at === 0 &&
        existing.invalidated_at === 0
      ) {
        this.records.set(id, { ...existing, invalidated_at: record.created_at });
      }
    });
    this.records.set(record.challenge_id, record);
  }

  get(challengeId: string): AuthChallengeRecord | null {
    const record = this.records.get(challengeId);
    return record !== undefined ? record : null;
  }

  consume(challengeId: string, secretHash: string, purpose: AuthChallengePurpose, nowMs: number): ChallengeConsumeResult {
    const result = consumeChallenge({ record: this.get(challengeId), secretHash: secretHash, purpose: purpose, nowMs: nowMs });
    if (result.record !== null) {
      this.records.set(result.record.challenge_id, result.record);
    }
    return result;
  }
}
