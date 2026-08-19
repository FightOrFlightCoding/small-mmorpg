import { evaluateCompatibility } from "./compatibility";
import { emptyMaintenance, type MaintenanceState } from "./maintenance";
import { CLIENT_VERSION } from "./environment";
import { PROTOCOL_VERSION } from "./protocol";
import { MATCH_MAX_PLAYERS, playerCount, type StarterZoneState } from "./match_state";

const SAVE_VERSION_METADATA_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "migrationId",
  "schema_version",
  "created_at",
  "updated_at",
];

const JOIN_INJECTION_KEYS = SAVE_VERSION_METADATA_KEYS.concat([
  "characterId",
  "classId",
  "health",
  "maxHealth",
  "attack",
  "damage",
  "position",
  "x",
  "y",
]);
const JOIN_ALLOWED_KEYS = ["protocolVersion", "contentHash", "clientVersion", "selectionTicket", "transferTicket"];

export interface JoinCompatibilityOptions {
  minClientVersion?: string;
  maxClientVersion?: string;
  expectedContentVersion?: string;
  maintenance?: MaintenanceState;
}

export function validateJoinAttempt(
  state: StarterZoneState,
  expectedContentHash: string,
  metadata: { [key: string]: string },
  alreadyJoined: boolean,
  joiningSessionId: string = "",
  existingSessionId: string = "",
  options: JoinCompatibilityOptions = {},
): { accept: boolean; rejectMessage?: string } {
  const metaKeys = Object.keys(metadata);
  for (let i = 0; i < metaKeys.length; i++) {
    const key = metaKeys[i];
    if (JOIN_INJECTION_KEYS.indexOf(key) !== -1) {
      return { accept: false, rejectMessage: "stat_injection:" + key };
    }
    if (JOIN_ALLOWED_KEYS.indexOf(key) === -1) {
      return { accept: false, rejectMessage: "unknown_field:" + key };
    }
  }
  const versionRaw = metadata.protocolVersion;
  const version = versionRaw !== undefined ? parseInt(versionRaw, 10) : NaN;
  const compatibility = evaluateCompatibility({
    clientVersion: typeof metadata.clientVersion === "string" ? metadata.clientVersion : "",
    protocolVersion: version,
    contentHash: typeof metadata.contentHash === "string" ? metadata.contentHash : "",
    expectedProtocol: PROTOCOL_VERSION,
    expectedContentHash: expectedContentHash,
    expectedContentVersion: options.expectedContentVersion !== undefined ? options.expectedContentVersion : "",
    minClientVersion: options.minClientVersion !== undefined ? options.minClientVersion : CLIENT_VERSION,
    maxClientVersion: options.maxClientVersion !== undefined ? options.maxClientVersion : CLIENT_VERSION,
    maintenance: options.maintenance !== undefined ? options.maintenance : emptyMaintenance(),
    alreadyJoined: alreadyJoined,
  });
  if (!compatibility.ok) {
    return { accept: false, rejectMessage: compatibility.code };
  }
  if (alreadyJoined) {
    if (existingSessionId === "" || joiningSessionId === existingSessionId) {
      return { accept: true };
    }
    return { accept: false, rejectMessage: "already_in_match" };
  }
  const cap = typeof state.maxPlayers === "number" ? state.maxPlayers : MATCH_MAX_PLAYERS;
  if (playerCount(state) >= cap) {
    return { accept: false, rejectMessage: "match_full" };
  }
  const transfer = metadata.transferTicket;
  const ticket = metadata.selectionTicket;
  const hasTransfer = typeof transfer === "string" && transfer.length > 0;
  const hasSelection = typeof ticket === "string" && ticket.length > 0;
  if (!hasTransfer && !hasSelection) {
    return { accept: false, rejectMessage: "selection_required" };
  }
  return { accept: true };
}
