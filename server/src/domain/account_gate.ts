import {
  ACCOUNT_GATE_DELETED,
  ACCOUNT_GATE_DELETING,
  ACCOUNT_GATE_DISABLED,
  ACCOUNT_GATE_UNVERIFIED,
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETED,
  ACCOUNT_STATUS_DELETING,
  ACCOUNT_STATUS_DELETION_PENDING,
  ACCOUNT_STATUS_DISABLED,
  ACCOUNT_STATUS_PENDING_VERIFICATION,
  type AccountGateCode,
  type AccountStatus,
} from "./account_status";

export interface AccountGateSnapshot {
  userId: string;
  hasEmail: boolean;
  disableTime: number;
  profile: {
    status: AccountStatus;
    verifiedAt: number;
  } | null;
}

export type AccountGateResult = { ok: true } | { ok: false; code: AccountGateCode };

export function evaluatePlayableAccount(snapshot: AccountGateSnapshot): AccountGateResult {
  if (snapshot.userId.length === 0) {
    return { ok: false, code: ACCOUNT_GATE_DELETED };
  }
  if (snapshot.disableTime > 0) {
    return { ok: false, code: ACCOUNT_GATE_DISABLED };
  }
  const profile = snapshot.profile;
  if (profile === null) {
    if (snapshot.hasEmail) {
      return { ok: false, code: ACCOUNT_GATE_UNVERIFIED };
    }
    return { ok: true };
  }
  if (profile.status === ACCOUNT_STATUS_DISABLED) {
    return { ok: false, code: ACCOUNT_GATE_DISABLED };
  }
  if (profile.status === ACCOUNT_STATUS_DELETION_PENDING || profile.status === ACCOUNT_STATUS_DELETING) {
    return { ok: false, code: ACCOUNT_GATE_DELETING };
  }
  if (profile.status === ACCOUNT_STATUS_DELETED) {
    return { ok: false, code: ACCOUNT_GATE_DELETED };
  }
  if (profile.status === ACCOUNT_STATUS_PENDING_VERIFICATION || profile.verifiedAt <= 0) {
    return { ok: false, code: ACCOUNT_GATE_UNVERIFIED };
  }
  if (profile.status !== ACCOUNT_STATUS_ACTIVE || profile.verifiedAt <= 0) {
    return { ok: false, code: ACCOUNT_GATE_UNVERIFIED };
  }
  return { ok: true };
}

export type LoginAccountDecision =
  | { ok: true; status: AccountStatus }
  | { ok: false; code: AccountGateCode | "invalid_credentials" };

export function evaluateLoginAccount(snapshot: AccountGateSnapshot, credentialsValid: boolean): LoginAccountDecision {
  if (!credentialsValid) {
    return { ok: false, code: "invalid_credentials" };
  }
  const playable = evaluatePlayableAccount(snapshot);
  if (playable.ok) {
    return { ok: true, status: ACCOUNT_STATUS_ACTIVE };
  }
  if (playable.code === ACCOUNT_GATE_UNVERIFIED) {
    return { ok: false, code: ACCOUNT_GATE_UNVERIFIED };
  }
  return { ok: false, code: playable.code };
}
