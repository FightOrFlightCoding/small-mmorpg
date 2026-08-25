import { sha256Hex } from "./hmac";

export const ACCOUNT_EXPORT_SCHEMA_VERSION = 1;
export const ACCOUNT_EXPORT_TTL_MS = 5 * 60 * 1000;

const SECRET_KEY_TOKENS = [
  "password",
  "passwordhash",
  "hashedpassword",
  "secret",
  "secrethash",
  "hmac",
  "pepper",
  "challengehash",
  "httpkey",
  "serverkey",
  "gatewayhmac",
  "emaillookuphash",
];

export function supportRecoveryId(userId: string): string {
  const hex = sha256Hex("vibe.support-recovery:" + userId)
    .slice(0, 12)
    .toUpperCase();
  return "VIBE-" + hex.slice(0, 4) + "-" + hex.slice(4, 8) + "-" + hex.slice(8, 12);
}

export function isSecretExportKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let i = 0; i < SECRET_KEY_TOKENS.length; i++) {
    if (normalized.indexOf(SECRET_KEY_TOKENS[i]) !== -1) {
      return true;
    }
  }
  return false;
}

export function filterExportValue(value: unknown, ownerUserId: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (isForeignOwnedObject(item, ownerUserId)) {
        continue;
      }
      next.push(filterExportValue(item, ownerUserId));
    }
    return next;
  }
  if (typeof value !== "object") {
    return value;
  }
  const record = value as { [key: string]: unknown };
  const keys = Object.keys(record);
  const next: { [key: string]: unknown } = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (isSecretExportKey(key)) {
      continue;
    }
    if (key === "friends" || key === "groups" || key === "messages" || key === "notifications") {
      next[key] = [];
      continue;
    }
    next[key] = filterExportValue(record[key], ownerUserId);
  }
  return next;
}

function isForeignOwnedObject(value: unknown, ownerUserId: string): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as { [key: string]: unknown };
  const objectUser =
    typeof record.userId === "string"
      ? record.userId
      : typeof record.user_id === "string"
        ? record.user_id
        : typeof record.accountUserId === "string"
          ? record.accountUserId
          : "";
  return objectUser.length > 0 && objectUser !== ownerUserId;
}

export interface AccountExportSnapshot {
  accountUserId: string;
  exportedAt: number;
  nakamaExport?: unknown;
  profile?: {
    status: string;
    createdAt: number;
    verifiedAt: number;
    acceptedTermsVersion: string;
    acceptedPrivacyVersion: string;
    acceptedAt: number;
    registrationMode?: string;
    hmac?: string;
  };
  characters?: unknown[];
  gold?: number;
  settings?: unknown;
  legal?: unknown;
  transactions?: unknown[];
  partyHistory?: unknown[];
  tradeHistory?: unknown[];
  sessionMetadata?: unknown;
  lease?: unknown;
  boundLocations?: unknown[];
}

export function assembleAccountExport(snapshot: AccountExportSnapshot): { [key: string]: unknown } {
  const profile = snapshot.profile;
  const publicProfile =
    profile === undefined
      ? null
      : {
          status: profile.status,
          createdAt: profile.createdAt,
          verifiedAt: profile.verifiedAt,
          acceptedTermsVersion: profile.acceptedTermsVersion,
          acceptedPrivacyVersion: profile.acceptedPrivacyVersion,
          acceptedAt: profile.acceptedAt,
          registrationMode: profile.registrationMode !== undefined ? profile.registrationMode : "",
        };
  return {
    schemaVersion: ACCOUNT_EXPORT_SCHEMA_VERSION,
    exportedAt: snapshot.exportedAt,
    supportRecoveryId: supportRecoveryId(snapshot.accountUserId),
    accountProfile: publicProfile,
    nakama: filterExportValue(snapshot.nakamaExport !== undefined ? snapshot.nakamaExport : {}, snapshot.accountUserId),
    characters: filterExportValue(snapshot.characters !== undefined ? snapshot.characters : [], snapshot.accountUserId),
    gold: typeof snapshot.gold === "number" ? snapshot.gold : 0,
    settings: filterExportValue(snapshot.settings !== undefined ? snapshot.settings : {}, snapshot.accountUserId),
    legal: snapshot.legal !== undefined ? snapshot.legal : publicProfile,
    transactions: filterExportValue(snapshot.transactions !== undefined ? snapshot.transactions : [], snapshot.accountUserId),
    partyHistory: filterExportValue(snapshot.partyHistory !== undefined ? snapshot.partyHistory : [], snapshot.accountUserId),
    tradeHistory: filterExportValue(snapshot.tradeHistory !== undefined ? snapshot.tradeHistory : [], snapshot.accountUserId),
    sessionMetadata: filterExportValue(
      snapshot.sessionMetadata !== undefined ? snapshot.sessionMetadata : {},
      snapshot.accountUserId,
    ),
    lease: filterExportValue(snapshot.lease !== undefined ? snapshot.lease : null, snapshot.accountUserId),
    boundLocations: filterExportValue(
      snapshot.boundLocations !== undefined ? snapshot.boundLocations : [],
      snapshot.accountUserId,
    ),
  };
}

export function exportContainsSecrets(payload: unknown): boolean {
  if (payload === null || payload === undefined) {
    return false;
  }
  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      if (exportContainsSecrets(payload[i])) {
        return true;
      }
    }
    return false;
  }
  if (typeof payload !== "object") {
    return false;
  }
  const record = payload as { [key: string]: unknown };
  const keys = Object.keys(record);
  for (let i = 0; i < keys.length; i++) {
    if (isSecretExportKey(keys[i])) {
      return true;
    }
    if (exportContainsSecrets(record[keys[i]])) {
      return true;
    }
  }
  return false;
}
