export const ACCOUNT_STATUS_PENDING_VERIFICATION = "PENDING_VERIFICATION";
export const ACCOUNT_STATUS_ACTIVE = "ACTIVE";
export const ACCOUNT_STATUS_DISABLED = "DISABLED";
export const ACCOUNT_STATUS_DELETION_PENDING = "DELETION_PENDING";
export const ACCOUNT_STATUS_DELETING = "DELETING";
export const ACCOUNT_STATUS_DELETED = "DELETED";

export const ACCOUNT_STATUSES = [
  ACCOUNT_STATUS_PENDING_VERIFICATION,
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DISABLED,
  ACCOUNT_STATUS_DELETION_PENDING,
  ACCOUNT_STATUS_DELETING,
  ACCOUNT_STATUS_DELETED,
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_GATE_UNVERIFIED = "email_verification_required";
export const ACCOUNT_GATE_DISABLED = "account_disabled";
export const ACCOUNT_GATE_DELETING = "account_deleting";
export const ACCOUNT_GATE_DELETED = "account_deleted";

export const ACCOUNT_GATE_CODES = [
  ACCOUNT_GATE_UNVERIFIED,
  ACCOUNT_GATE_DISABLED,
  ACCOUNT_GATE_DELETING,
  ACCOUNT_GATE_DELETED,
] as const;

export type AccountGateCode = (typeof ACCOUNT_GATE_CODES)[number];

export function isAccountStatus(value: string): value is AccountStatus {
  return ACCOUNT_STATUSES.indexOf(value as AccountStatus) !== -1;
}

export function isAccountGateCode(value: string): value is AccountGateCode {
  return ACCOUNT_GATE_CODES.indexOf(value as AccountGateCode) !== -1;
}

export function inferAccountStatus(verifiedAt: number, rawStatus?: string): AccountStatus {
  if (typeof rawStatus === "string" && isAccountStatus(rawStatus)) {
    return rawStatus;
  }
  if (verifiedAt > 0) {
    return ACCOUNT_STATUS_ACTIVE;
  }
  return ACCOUNT_STATUS_PENDING_VERIFICATION;
}
