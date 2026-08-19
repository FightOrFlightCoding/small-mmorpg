import {
  ACCOUNT_STATUS_DELETING,
  ACCOUNT_STATUS_DELETION_PENDING,
  ACCOUNT_STATUS_DISABLED,
  ACCOUNT_STATUS_PENDING_VERIFICATION,
  type AccountStatus,
} from "./account_status";

export const DEFAULT_UNVERIFIED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface UnverifiedCleanupInput {
  status: AccountStatus | null;
  verifiedAt: number;
  createdAt: number;
  nowMs: number;
  retentionMs: number;
  liveCharacterCount: number;
  hasActiveGameplaySession: boolean;
}

export type UnverifiedCleanupDecision =
  | { ok: true; purge: true }
  | { ok: true; purge: false; reason: string };

export function evaluateUnverifiedCleanup(input: UnverifiedCleanupInput): UnverifiedCleanupDecision {
  if (input.status === null) {
    return { ok: true, purge: false, reason: "missing_profile" };
  }
  if (input.status === ACCOUNT_STATUS_DISABLED) {
    return { ok: true, purge: false, reason: "disabled" };
  }
  if (input.status === ACCOUNT_STATUS_DELETION_PENDING || input.status === ACCOUNT_STATUS_DELETING) {
    return { ok: true, purge: false, reason: "deletion_active" };
  }
  if (input.verifiedAt > 0 || input.status !== ACCOUNT_STATUS_PENDING_VERIFICATION) {
    return { ok: true, purge: false, reason: "verified_or_other_status" };
  }
  if (input.liveCharacterCount > 0) {
    return { ok: true, purge: false, reason: "has_characters" };
  }
  if (input.hasActiveGameplaySession) {
    return { ok: true, purge: false, reason: "active_session" };
  }
  if (input.createdAt <= 0 || input.nowMs - input.createdAt < input.retentionMs) {
    return { ok: true, purge: false, reason: "retention" };
  }
  return { ok: true, purge: true };
}
