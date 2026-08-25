import { decideEmailLookup, decideEmailLookupWithRereads, type EmailIndexRecord, type EmailLookupDecision } from "./account_compat";
import { inferAccountStatus, type AccountStatus } from "./account_status";

export const ACCOUNT_PROFILE_COLLECTION = "account_profile";
export const ACCOUNT_PROFILE_KEY = "email_index";
export const ACCOUNT_PROFILE_INDEX = "account_profile_email_hmac";
export const ACCOUNT_PROFILE_PERMISSION_READ: 0 = 0;
export const ACCOUNT_PROFILE_PERMISSION_WRITE: 0 = 0;

export interface AccountProfileRecord {
  hmac: string;
  userId: string;
  verifiedAt: number;
  status: AccountStatus;
  createdAt: number;
  acceptedTermsVersion: string;
  acceptedPrivacyVersion: string;
  acceptedAt: number;
  registrationMode: string;
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
  const createdAt = typeof value.createdAt === "number" && isFinite(value.createdAt) ? value.createdAt : 0;
  const acceptedAt = typeof value.acceptedAt === "number" && isFinite(value.acceptedAt) ? value.acceptedAt : 0;
  return {
    hmac: value.hmac,
    userId: storedUserId,
    verifiedAt: verifiedAt,
    status: inferAccountStatus(verifiedAt, typeof value.status === "string" ? value.status : undefined),
    createdAt: createdAt,
    acceptedTermsVersion: typeof value.acceptedTermsVersion === "string" ? value.acceptedTermsVersion : "",
    acceptedPrivacyVersion: typeof value.acceptedPrivacyVersion === "string" ? value.acceptedPrivacyVersion : "",
    acceptedAt: acceptedAt,
    registrationMode: typeof value.registrationMode === "string" ? value.registrationMode : "",
  };
}

export function accountProfileWriteValue(
  userId: string,
  hmac: string,
  verifiedAt: number,
  extras?: {
    status?: AccountStatus;
    createdAt?: number;
    acceptedTermsVersion?: string;
    acceptedPrivacyVersion?: string;
    acceptedAt?: number;
    registrationMode?: string;
  },
): AccountProfileRecord {
  const status = extras !== undefined && extras.status !== undefined ? extras.status : inferAccountStatus(verifiedAt);
  return {
    hmac: hmac,
    userId: userId,
    verifiedAt: verifiedAt,
    status: status,
    createdAt: extras !== undefined && extras.createdAt !== undefined ? extras.createdAt : 0,
    acceptedTermsVersion: extras !== undefined && extras.acceptedTermsVersion !== undefined ? extras.acceptedTermsVersion : "",
    acceptedPrivacyVersion:
      extras !== undefined && extras.acceptedPrivacyVersion !== undefined ? extras.acceptedPrivacyVersion : "",
    acceptedAt: extras !== undefined && extras.acceptedAt !== undefined ? extras.acceptedAt : 0,
    registrationMode: extras !== undefined && extras.registrationMode !== undefined ? extras.registrationMode : "",
  };
}

export function decideProfileEmailLookup(
  indexHits: EmailIndexRecord[],
  reread: AccountProfileRecord | null,
  expectedHmac: string,
): EmailLookupDecision {
  const mapped: EmailIndexRecord | null = reread === null ? null : { hmac: reread.hmac, userId: reread.userId };
  return decideEmailLookup(indexHits, mapped, expectedHmac);
}

export function decideProfileEmailLookupWithRereads(
  indexHits: EmailIndexRecord[],
  profilesByUserId: { [userId: string]: AccountProfileRecord | null },
  expectedHmac: string,
): EmailLookupDecision {
  const rereadByUserId: { [userId: string]: EmailIndexRecord | null } = {};
  const keys = Object.keys(profilesByUserId);
  for (let i = 0; i < keys.length; i++) {
    const profile = profilesByUserId[keys[i]];
    rereadByUserId[keys[i]] = profile === null ? null : { hmac: profile.hmac, userId: profile.userId };
  }
  return decideEmailLookupWithRereads(indexHits, rereadByUserId, expectedHmac);
}
