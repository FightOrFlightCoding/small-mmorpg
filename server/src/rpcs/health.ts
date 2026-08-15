import { PROTOCOL_VERSION } from "../domain/protocol";
import { contentHash } from "../generated/content";

export const HEALTH_RPC_ID = "vibecode_health";
export const REGISTERED_RPC_IDS = [
  "vibecode_health",
  "character_bootstrap",
  "find_or_create_starter_zone",
] as const;

export { PROTOCOL_VERSION };
export const SERVICE_NAME = "vibecode-server";

export interface HealthResponse {
  ok: true;
  service: typeof SERVICE_NAME;
  protocol_version: typeof PROTOCOL_VERSION;
  content_version: string;
  rpcs: typeof REGISTERED_RPC_IDS;
}

export function buildHealthResponse(): HealthResponse {
  return {
    ok: true,
    service: SERVICE_NAME,
    protocol_version: PROTOCOL_VERSION,
    content_version: contentHash,
    rpcs: REGISTERED_RPC_IDS,
  };
}

export function handleHealthRpc(payload: string): HealthResponse {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return buildHealthResponse();
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

  return buildHealthResponse();
}
