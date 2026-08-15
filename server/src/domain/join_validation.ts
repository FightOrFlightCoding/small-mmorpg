import { PROTOCOL_VERSION } from "./protocol";
import { MATCH_MAX_PLAYERS, playerCount, type StarterZoneState } from "./match_state";

export function validateJoinAttempt(
  state: StarterZoneState,
  expectedContentHash: string,
  metadata: { [key: string]: string },
  alreadyJoined: boolean,
): { accept: boolean; rejectMessage?: string } {
  const versionRaw = metadata.protocolVersion;
  const version = versionRaw !== undefined ? parseInt(versionRaw, 10) : NaN;
  if (version !== PROTOCOL_VERSION) {
    return { accept: false, rejectMessage: "protocol_mismatch" };
  }
  const hash = metadata.contentHash;
  if (typeof hash !== "string" || hash !== expectedContentHash) {
    return { accept: false, rejectMessage: "content_mismatch" };
  }
  if (!alreadyJoined && playerCount(state) >= MATCH_MAX_PLAYERS) {
    return { accept: false, rejectMessage: "match_full" };
  }
  return { accept: true };
}
