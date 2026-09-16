import { PROTOCOL_VERSION } from "./protocol";
import { CLIENT_VERSION } from "./environment";
import { shouldRejectGameplayJoin, type MaintenanceState } from "./maintenance";

export const COMPAT_CLIENT_TOO_OLD = "client_too_old";
export const COMPAT_CLIENT_TOO_NEW = "client_too_new";
export const COMPAT_PROTOCOL_MISMATCH = "protocol_mismatch";
export const COMPAT_CONTENT_MISMATCH = "content_mismatch";
export const COMPAT_SERVER_MAINTENANCE = "server_maintenance";
export const COMPAT_MIGRATION_REQUIRED = "migration_required";
export const COMPAT_UNSUPPORTED_SAVE_VERSION = "unsupported_save_version";

const SEMVER = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;

export interface CompatibilityInput {
  clientVersion: string;
  protocolVersion: number;
  contentHash: string;
  contentVersion?: string;
  expectedProtocol: number;
  expectedContentHash: string;
  expectedContentVersion: string;
  minClientVersion: string;
  maxClientVersion: string;
  maintenance: MaintenanceState;
  alreadyJoined: boolean;
}

export interface CompatibilityOk {
  ok: true;
}

export interface CompatibilityReject {
  ok: false;
  code: string;
  message: string;
}

export type CompatibilityResult = CompatibilityOk | CompatibilityReject;

export function parseSemver(value: string): [number, number, number] | null {
  const match = SEMVER.exec(value);
  if (match === null) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareSemver(left: string, right: string): number {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (a === null || b === null) {
    return NaN;
  }
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  if (a[1] !== b[1]) {
    return a[1] - b[1];
  }
  return a[2] - b[2];
}

export function evaluateCompatibility(input: CompatibilityInput): CompatibilityResult {
  if (input.protocolVersion !== input.expectedProtocol) {
    return reject(
      COMPAT_PROTOCOL_MISMATCH,
      "Protocol version " +
        String(input.protocolVersion) +
        " is not supported (expected " +
        String(input.expectedProtocol) +
        ").",
    );
  }
  if (typeof input.contentHash !== "string" || input.contentHash !== input.expectedContentHash) {
    return reject(COMPAT_CONTENT_MISMATCH, "The client content catalog does not match the server.");
  }
  if (input.contentVersion !== undefined && input.contentVersion.length > 0) {
    if (input.contentVersion !== input.expectedContentVersion) {
      return reject(COMPAT_CONTENT_MISMATCH, "The client content version does not match the server.");
    }
  }
  const client = parseSemver(input.clientVersion);
  if (client === null) {
    return reject(COMPAT_CLIENT_TOO_OLD, "Client version " + input.clientVersion + " is not supported.");
  }
  const minCmp = compareSemver(input.clientVersion, input.minClientVersion);
  if (minCmp < 0) {
    return reject(
      COMPAT_CLIENT_TOO_OLD,
      "Client version " + input.clientVersion + " is too old. Minimum is " + input.minClientVersion + ".",
    );
  }
  const maxCmp = compareSemver(input.clientVersion, input.maxClientVersion);
  if (maxCmp > 0) {
    return reject(
      COMPAT_CLIENT_TOO_NEW,
      "Client version " + input.clientVersion + " is too new. Maximum is " + input.maxClientVersion + ".",
    );
  }
  if (shouldRejectGameplayJoin(input.maintenance, input.alreadyJoined)) {
    return reject(
      COMPAT_SERVER_MAINTENANCE,
      input.maintenance.message.length > 0
        ? input.maintenance.message
        : "The server is in maintenance. Gameplay joins are paused.",
    );
  }
  return { ok: true };
}

export function defaultCompatibilityContext(): {
  expectedProtocol: number;
  minClientVersion: string;
  maxClientVersion: string;
} {
  return {
    expectedProtocol: PROTOCOL_VERSION,
    minClientVersion: CLIENT_VERSION,
    maxClientVersion: CLIENT_VERSION,
  };
}

function reject(code: string, message: string): CompatibilityReject {
  return { ok: false, code: code, message: message };
}
