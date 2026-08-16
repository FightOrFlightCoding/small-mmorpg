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
    if (SAVE_VERSION_METADATA_KEYS.indexOf(key) !== -1) {
      return { accept: false, rejectMessage: "stat_injection:" + key };
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
  return { accept: true };
}
