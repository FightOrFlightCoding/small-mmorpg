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
const JOIN_ALLOWED_KEYS = ["protocolVersion", "contentHash", "selectionTicket"];

export function validateJoinAttempt(
  state: StarterZoneState,
  expectedContentHash: string,
  metadata: { [key: string]: string },
  alreadyJoined: boolean,
  joiningSessionId: string = "",
  existingSessionId: string = "",
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
  if (version !== PROTOCOL_VERSION) {
    return { accept: false, rejectMessage: "protocol_mismatch" };
  }
  const hash = metadata.contentHash;
  if (typeof hash !== "string" || hash !== expectedContentHash) {
    return { accept: false, rejectMessage: "content_mismatch" };
  }
  if (alreadyJoined) {
    if (existingSessionId === "" || joiningSessionId === existingSessionId) {
      return { accept: true };
    }
    return { accept: false, rejectMessage: "already_in_match" };
  }
  if (playerCount(state) >= MATCH_MAX_PLAYERS) {
    return { accept: false, rejectMessage: "match_full" };
  }
  const ticket = metadata.selectionTicket;
  if (typeof ticket !== "string" || ticket.length === 0) {
    return { accept: false, rejectMessage: "selection_required" };
  }
  return { accept: true };
}
