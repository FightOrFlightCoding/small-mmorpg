import { resolveStarterMatchId, selectCanonicalMatchId } from "../domain/starter_zone_registry";
import {
  MATCH_MAX_PLAYERS,
  STARTER_ZONE_LABEL,
  STARTER_ZONE_MODULE,
} from "../domain/match_state";

export const MATCH_COLLECTION = "match";
export const MATCH_KEY = "starter_zone";

interface StoredMatch {
  matchId: string;
}

export function findOrCreateStarterZoneMatch(nk: nkruntime.Nakama, logger: nkruntime.Logger): string {
  const stored = readStoredMatchId(nk);
  const storedRunning = stored !== null && nk.matchGet(stored) !== null;
  if (storedRunning && stored !== null) {
    return stored;
  }

  const listed = listStarterMatchIds(nk);
  if (listed.length > 0) {
    const canonical = selectCanonicalMatchId(listed);
    persistMatchIdIfAbsentOrDead(nk, canonical);
    const storedAfter = readStoredMatchId(nk);
    const storedAfterRunning = storedAfter !== null && nk.matchGet(storedAfter) !== null;
    return resolveStarterMatchId(listed, storedAfter, storedAfterRunning, canonical);
  }

  const created = nk.matchCreate(STARTER_ZONE_MODULE);
  persistMatchIdIfAbsentOrDead(nk, created);
  const listedAfter = listStarterMatchIds(nk);
  if (listedAfter.indexOf(created) === -1) {
    listedAfter.push(created);
  }
  const storedAfter = readStoredMatchId(nk);
  const storedAfterRunning = storedAfter !== null && nk.matchGet(storedAfter) !== null;
  const canonical = resolveStarterMatchId(listedAfter, storedAfter, storedAfterRunning, created);
  if (canonical !== created) {
    logger.info("starter_zone converged match_id=%s discarded=%s", canonical, created);
  }
  return canonical;
}

function listStarterMatchIds(nk: nkruntime.Nakama): string[] {
  const matches = nk.matchList(16, true, STARTER_ZONE_LABEL, 0, MATCH_MAX_PLAYERS);
  const ids: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    ids.push(matches[i].matchId);
  }
  return ids;
}

function readStoredMatchId(nk: nkruntime.Nakama): string | null {
  const objects = nk.storageRead([
    {
      collection: MATCH_COLLECTION,
      key: MATCH_KEY,
      userId: nkruntime.SystemUserId,
    },
  ]);
  if (objects.length === 0) {
    return null;
  }
  const value = objects[0].value as StoredMatch;
  if (typeof value.matchId !== "string" || value.matchId.length === 0) {
    return null;
  }
  return value.matchId;
}

function persistMatchIdIfAbsentOrDead(nk: nkruntime.Nakama, matchId: string): void {
  nk.storageWriteRetry(
    [
      {
        collection: MATCH_COLLECTION,
        key: MATCH_KEY,
        userId: nkruntime.SystemUserId,
      },
    ],
    function (objects: nkruntime.StorageObject[]): nkruntime.StorageWriteRequest[] {
      if (objects.length > 0) {
        const existing = objects[0].value as StoredMatch;
        if (typeof existing.matchId === "string" && existing.matchId.length > 0) {
          const running = nk.matchGet(existing.matchId);
          if (running !== null) {
            return [];
          }
        }
        return [writeRequest(matchId, objects[0].version)];
      }
      return [writeRequest(matchId, undefined)];
    },
    5,
  );
}

function writeRequest(matchId: string, version: string | undefined): nkruntime.StorageWriteRequest {
  const write: nkruntime.StorageWriteRequest = {
    collection: MATCH_COLLECTION,
    key: MATCH_KEY,
    userId: nkruntime.SystemUserId,
    value: { matchId: matchId },
    permissionRead: 0,
    permissionWrite: 0,
  };
  if (version !== undefined) {
    write.version = version;
  }
  return write;
}
