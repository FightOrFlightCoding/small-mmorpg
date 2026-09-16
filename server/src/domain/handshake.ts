import { PROTOCOL_VERSION } from "./protocol";
import { evaluateCompatibility, type CompatibilityResult } from "./compatibility";
import { emptyMaintenance, type MaintenanceState } from "./maintenance";
import { CLIENT_VERSION } from "./environment";

export const HANDSHAKE_ALLOWED_KEYS = ["clientVersion", "protocolVersion", "contentHash", "contentVersion"];

export interface HandshakeRequest {
  clientVersion: string;
  protocolVersion: number;
  contentHash: string;
  contentVersion: string;
}

export interface HandshakeOk {
  ok: true;
  code: string;
  serverVersion: string;
  protocolVersion: number;
  contentHash: string;
  contentVersion: string;
  minClientVersion: string;
  maxClientVersion: string;
  environment: string;
  maintenance: boolean;
  rejectJoins: boolean;
  blockTransactions: boolean;
  message: string;
}

export function parseHandshakePayload(payload: string): HandshakeRequest {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    throw new Error("malformed_json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("malformed_json");
  }
  const data = parsed as { [key: string]: unknown };
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (HANDSHAKE_ALLOWED_KEYS.indexOf(keys[i]) === -1) {
      throw new Error("unknown_field:" + keys[i]);
    }
  }
  if (typeof data.clientVersion !== "string" || data.clientVersion.length === 0) {
    throw new Error("malformed_json");
  }
  if (typeof data.protocolVersion !== "number" || !isFinite(data.protocolVersion) || data.protocolVersion !== Math.floor(data.protocolVersion)) {
    throw new Error("malformed_json");
  }
  if (typeof data.contentHash !== "string" || data.contentHash.length === 0) {
    throw new Error("malformed_json");
  }
  const contentVersion = typeof data.contentVersion === "string" ? data.contentVersion : "";
  return {
    clientVersion: data.clientVersion,
    protocolVersion: data.protocolVersion,
    contentHash: data.contentHash,
    contentVersion: contentVersion,
  };
}

export function evaluateHandshake(
  request: HandshakeRequest,
  expected: {
    protocolVersion?: number;
    contentHash: string;
    contentVersion: string;
    serverVersion: string;
    minClientVersion: string;
    maxClientVersion: string;
    environment: string;
    maintenance: MaintenanceState;
  },
): CompatibilityResult {
  return evaluateCompatibility({
    clientVersion: request.clientVersion,
    protocolVersion: request.protocolVersion,
    contentHash: request.contentHash,
    contentVersion: request.contentVersion.length > 0 ? request.contentVersion : undefined,
    expectedProtocol: expected.protocolVersion !== undefined ? expected.protocolVersion : PROTOCOL_VERSION,
    expectedContentHash: expected.contentHash,
    expectedContentVersion: expected.contentVersion,
    minClientVersion: expected.minClientVersion,
    maxClientVersion: expected.maxClientVersion,
    maintenance: emptyMaintenance(),
    alreadyJoined: true,
  });
}

export function handshakeOkResponse(
  expected: {
    serverVersion: string;
    contentHash: string;
    contentVersion: string;
    minClientVersion: string;
    maxClientVersion: string;
    environment: string;
    maintenance: MaintenanceState;
  },
): HandshakeOk {
  const maintenanceOn = expected.maintenance.enabled;
  return {
    ok: true,
    code: maintenanceOn ? "server_maintenance" : "ok",
    serverVersion: expected.serverVersion,
    protocolVersion: PROTOCOL_VERSION,
    contentHash: expected.contentHash,
    contentVersion: expected.contentVersion,
    minClientVersion: expected.minClientVersion.length > 0 ? expected.minClientVersion : CLIENT_VERSION,
    maxClientVersion: expected.maxClientVersion.length > 0 ? expected.maxClientVersion : CLIENT_VERSION,
    environment: expected.environment,
    maintenance: maintenanceOn,
    rejectJoins: expected.maintenance.rejectJoins,
    blockTransactions: expected.maintenance.blockTransactions,
    message: expected.maintenance.message,
  };
}
