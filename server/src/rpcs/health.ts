import { PROTOCOL_VERSION } from "../domain/protocol";
import { contentHash, packageVersion } from "../generated/content";
import { CLIENT_VERSION, SERVER_VERSION } from "../domain/environment";
import { emptyOpsCounters, type OpsCounters } from "../domain/ops_metrics";

export const HEALTH_RPC_ID = "vibecode_health";
export const REGISTERED_RPC_IDS = [
  "vibecode_health",
  "character_bootstrap",
  "character_list",
  "character_create",
  "character_select",
  "character_soft_delete",
  "character_restore",
  "find_or_create_starter_zone",
  "request_cave_entry",
  "find_or_create_owned_cave",
  "request_cave_exit",
  "party_create",
  "party_invite",
  "party_accept",
  "party_decline",
  "party_leave",
  "party_kick",
  "party_promote",
  "party_disband",
  "party_get_state",
  "gm_command",
  "session_handshake",
  "ops_status",
  "ops_set_maintenance",
] as const;

export { PROTOCOL_VERSION };
export const SERVICE_NAME = "vibecode-server";

export interface HealthResponse {
  ok: true;
  service: typeof SERVICE_NAME;
  protocol_version: typeof PROTOCOL_VERSION;
  content_version: string;
  content_package_version: string;
  server_version: string;
  environment: string;
  min_client_version: string;
  max_client_version: string;
  maintenance: boolean;
  rpcs: typeof REGISTERED_RPC_IDS;
  counters: OpsCounters;
}

export interface HealthExtras {
  environment?: string;
  serverVersion?: string;
  minClientVersion?: string;
  maxClientVersion?: string;
  contentPackageVersion?: string;
  maintenance?: boolean;
  counters?: OpsCounters;
}

export function buildHealthResponse(extras: HealthExtras = {}): HealthResponse {
  return {
    ok: true,
    service: SERVICE_NAME,
    protocol_version: PROTOCOL_VERSION,
    content_version: contentHash,
    content_package_version: extras.contentPackageVersion !== undefined ? extras.contentPackageVersion : packageVersion,
    server_version: extras.serverVersion !== undefined ? extras.serverVersion : SERVER_VERSION,
    environment: extras.environment !== undefined ? extras.environment : "local",
    min_client_version: extras.minClientVersion !== undefined ? extras.minClientVersion : CLIENT_VERSION,
    max_client_version: extras.maxClientVersion !== undefined ? extras.maxClientVersion : CLIENT_VERSION,
    maintenance: extras.maintenance === true,
    rpcs: REGISTERED_RPC_IDS,
    counters: extras.counters !== undefined ? extras.counters : emptyOpsCounters(),
  };
}

export function handleHealthRpc(payload: string, extras: HealthExtras = {}): HealthResponse {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return buildHealthResponse(extras);
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

  const keys = Object.keys(parsed);
  if (keys.length > 0) {
    throw new Error("unknown_field:" + keys[0]);
  }

  return buildHealthResponse(extras);
}
