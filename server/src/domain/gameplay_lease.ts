import { type ActiveLocation } from "./instance";
import { MATCH_TICK_RATE } from "./match_state";
import { SAVE_SCHEMA_VERSION } from "./save_schema";

export const GAMEPLAY_LEASE_COLLECTION = "player";
export const GAMEPLAY_LEASE_KEY = "gameplay_lease";
export const GAMEPLAY_LEASE_PERMISSION_READ: 1 = 1;
export const GAMEPLAY_LEASE_PERMISSION_WRITE: 0 = 0;
export const GAMEPLAY_LEASE_SCHEMA_VERSION = 2;
export const LINK_DEAD_SEC = 10;
export const LINK_DEAD_MS = LINK_DEAD_SEC * 1000;
export const LINK_DEAD_TICKS = MATCH_TICK_RATE * LINK_DEAD_SEC;
export const ENTERING_TIMEOUT_MS = 15000;
/** Nakama 3.40.0 socket defaults. Not overridden in `infra/nakama/*.yml`. */
export const NAKAMA_SOCKET_PING_PERIOD_MS = 15000;
export const NAKAMA_SOCKET_PONG_WAIT_MS = 25000;

export type LeaseState = "ENTERING" | "ONLINE" | "LEAVING" | "LINK_DEAD" | "DESPAWNING";
export type PresenceState = "OFFLINE" | LeaseState | "DISCONNECTING";

export interface GameplayLease {
  accountUserId: string;
  characterId: string;
  sessionId: string;
  socketOrPresenceId: string;
  matchId: string;
  zoneOrInstanceId: string;
  state: LeaseState;
  createdAt: number;
  updatedAt: number;
  disconnectDetectedAt: number;
  despawnAt: number;
  leaseVersion: number;
  serverInstanceIdentifier: string;
  schemaVersion: number;
  /** @deprecated ACCT-05 field kept on parse only */
  presenceState?: PresenceState;
  playAvailableAt?: number;
  acquiredAt?: number;
  lastSeenAt?: number;
}

export interface LeaseAcquireInput {
  accountUserId: string;
  characterId: string;
  sessionId: string;
  socketOrPresenceId: string;
  matchId: string;
  zoneOrInstanceId: string;
  nowMs: number;
  serverInstanceIdentifier: string;
}

export type LeaseAcquireResult =
  | { ok: true; lease: GameplayLease; replacedStale: boolean }
  | { ok: false; code: "account_busy" | "lease_conflict" };

function playAvailableAtOf(lease: GameplayLease): number {
  if (lease.state === "LINK_DEAD" || lease.state === "DESPAWNING") {
    return lease.despawnAt;
  }
  if (lease.state === "ENTERING") {
    return lease.createdAt + ENTERING_TIMEOUT_MS;
  }
  return 0;
}

export function leasePlayAvailableAt(lease: GameplayLease): number {
  return playAvailableAtOf(lease);
}

export function acquireGameplayLease(input: {
  accountUserId: string;
  characterId: string;
  matchId: string;
  nowMs: number;
  sessionId?: string;
  socketOrPresenceId?: string;
  zoneOrInstanceId?: string;
  serverInstanceIdentifier?: string;
}): GameplayLease {
  return markLeaseOnline(
    enteringLease({
      accountUserId: input.accountUserId,
      characterId: input.characterId,
      sessionId: input.sessionId !== undefined ? input.sessionId : "",
      socketOrPresenceId: input.socketOrPresenceId !== undefined ? input.socketOrPresenceId : "",
      matchId: input.matchId,
      zoneOrInstanceId: input.zoneOrInstanceId !== undefined ? input.zoneOrInstanceId : "",
      nowMs: input.nowMs,
      serverInstanceIdentifier:
        input.serverInstanceIdentifier !== undefined ? input.serverInstanceIdentifier : input.matchId,
    }),
    {
      sessionId: input.sessionId !== undefined ? input.sessionId : "",
      socketOrPresenceId: input.socketOrPresenceId !== undefined ? input.socketOrPresenceId : "",
      nowMs: input.nowMs,
    },
  );
}

export function enteringLease(input: LeaseAcquireInput): GameplayLease {
  return {
    accountUserId: input.accountUserId,
    characterId: input.characterId,
    sessionId: input.sessionId,
    socketOrPresenceId: input.socketOrPresenceId,
    matchId: input.matchId,
    zoneOrInstanceId: input.zoneOrInstanceId,
    state: "ENTERING",
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
    disconnectDetectedAt: 0,
    despawnAt: 0,
    leaseVersion: 1,
    serverInstanceIdentifier: input.serverInstanceIdentifier,
    schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
  };
}

export function markLeaseOnline(
  lease: GameplayLease,
  input: { sessionId: string; socketOrPresenceId: string; nowMs: number },
): GameplayLease {
  return {
    accountUserId: lease.accountUserId,
    characterId: lease.characterId,
    sessionId: input.sessionId,
    socketOrPresenceId: input.socketOrPresenceId,
    matchId: lease.matchId,
    zoneOrInstanceId: lease.zoneOrInstanceId,
    state: "ONLINE",
    createdAt: lease.createdAt,
    updatedAt: input.nowMs,
    disconnectDetectedAt: 0,
    despawnAt: 0,
    leaseVersion: lease.leaseVersion + 1,
    serverInstanceIdentifier: lease.serverInstanceIdentifier,
    schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
  };
}

export function markLeaseLeaving(lease: GameplayLease, nowMs: number): GameplayLease {
  return {
    accountUserId: lease.accountUserId,
    characterId: lease.characterId,
    sessionId: lease.sessionId,
    socketOrPresenceId: lease.socketOrPresenceId,
    matchId: lease.matchId,
    zoneOrInstanceId: lease.zoneOrInstanceId,
    state: "LEAVING",
    createdAt: lease.createdAt,
    updatedAt: nowMs,
    disconnectDetectedAt: 0,
    despawnAt: 0,
    leaseVersion: lease.leaseVersion + 1,
    serverInstanceIdentifier: lease.serverInstanceIdentifier,
    schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
  };
}

export function markLeaseLinkDead(lease: GameplayLease, nowMs: number): GameplayLease {
  return {
    accountUserId: lease.accountUserId,
    characterId: lease.characterId,
    sessionId: lease.sessionId,
    socketOrPresenceId: lease.socketOrPresenceId,
    matchId: lease.matchId,
    zoneOrInstanceId: lease.zoneOrInstanceId,
    state: "LINK_DEAD",
    createdAt: lease.createdAt,
    updatedAt: nowMs,
    disconnectDetectedAt: nowMs,
    despawnAt: nowMs + LINK_DEAD_MS,
    leaseVersion: lease.leaseVersion + 1,
    serverInstanceIdentifier: lease.serverInstanceIdentifier,
    schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
  };
}

export function markLeaseDespawning(lease: GameplayLease, nowMs: number): GameplayLease {
  return {
    accountUserId: lease.accountUserId,
    characterId: lease.characterId,
    sessionId: lease.sessionId,
    socketOrPresenceId: lease.socketOrPresenceId,
    matchId: lease.matchId,
    zoneOrInstanceId: lease.zoneOrInstanceId,
    state: "DESPAWNING",
    createdAt: lease.createdAt,
    updatedAt: nowMs,
    disconnectDetectedAt: lease.disconnectDetectedAt,
    despawnAt: lease.despawnAt > 0 ? lease.despawnAt : nowMs,
    leaseVersion: lease.leaseVersion + 1,
    serverInstanceIdentifier: lease.serverInstanceIdentifier,
    schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
  };
}

/** @deprecated ACCT-05 name; unexpected disconnect is LINK_DEAD for 10s. */
export function disconnectGameplayLease(lease: GameplayLease, nowMs: number, _graceMs?: number): GameplayLease {
  return markLeaseLinkDead(lease, nowMs);
}

export function leaseGraceMs(_instanceType?: string): number {
  return LINK_DEAD_MS;
}

export function enteringLeaseExpired(lease: GameplayLease, nowMs: number): boolean {
  return lease.state === "ENTERING" && nowMs - lease.createdAt >= ENTERING_TIMEOUT_MS;
}

export function linkDeadElapsed(lease: GameplayLease, nowMs: number): boolean {
  return (lease.state === "LINK_DEAD" || lease.state === "DESPAWNING") && lease.despawnAt > 0 && nowMs >= lease.despawnAt;
}

export function leaseIsStale(lease: GameplayLease, nowMs: number, matchExists: boolean): boolean {
  return staleLeaseReason(lease, nowMs, matchExists).length > 0;
}

export function staleLeaseReason(lease: GameplayLease, nowMs: number, matchExists: boolean): string {
  if (lease.state === "DESPAWNING") {
    return "despawning";
  }
  if (enteringLeaseExpired(lease, nowMs)) {
    return "entering_timeout";
  }
  if (!matchExists && lease.matchId.length > 0) {
    return "match_missing";
  }
  return "";
}

export function serverInstanceIdentifier(matchId: string, matchNode?: string): string {
  const node = matchNode !== undefined && matchNode.length > 0 ? matchNode : "nakama";
  return node + "|" + matchId;
}

export function leaseBlocksPartyMutation(lease: GameplayLease | null, characterId: string, nowMs: number): boolean {
  const live = liveGameplayLease(lease, nowMs);
  if (live === null) {
    return false;
  }
  if (live.characterId !== characterId) {
    return true;
  }
  return live.state === "LINK_DEAD" || live.state === "LEAVING" || live.state === "DESPAWNING" || live.state === "ENTERING";
}

export function liveGameplayLease(lease: GameplayLease | null, nowMs: number): GameplayLease | null {
  if (lease === null) {
    return null;
  }
  if (enteringLeaseExpired(lease, nowMs)) {
    return null;
  }
  if (linkDeadElapsed(lease, nowMs)) {
    return null;
  }
  if (lease.state === "DESPAWNING") {
    return null;
  }
  return lease;
}

export function decideLeaseAcquire(
  existing: GameplayLease | null,
  candidate: GameplayLease,
  nowMs: number,
  matchExists: boolean,
): LeaseAcquireResult {
  if (existing === null) {
    return { ok: true, lease: candidate, replacedStale: false };
  }
  if (leaseIsStale(existing, nowMs, matchExists) || liveGameplayLease(existing, nowMs) === null) {
    return {
      ok: true,
      lease: {
        accountUserId: candidate.accountUserId,
        characterId: candidate.characterId,
        sessionId: candidate.sessionId,
        socketOrPresenceId: candidate.socketOrPresenceId,
        matchId: candidate.matchId,
        zoneOrInstanceId: candidate.zoneOrInstanceId,
        state: "ENTERING",
        createdAt: nowMs,
        updatedAt: nowMs,
        disconnectDetectedAt: 0,
        despawnAt: 0,
        leaseVersion: existing.leaseVersion + 1,
        serverInstanceIdentifier: candidate.serverInstanceIdentifier,
        schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
      },
      replacedStale: true,
    };
  }
  return { ok: false, code: "account_busy" };
}

export function accountLeaseBlocksOtherCharacter(
  lease: GameplayLease | null,
  characterId: string,
  nowMs: number,
): boolean {
  const live = liveGameplayLease(lease, nowMs);
  if (live === null) {
    return false;
  }
  return live.characterId !== characterId;
}

export function accountLeaseBlocksDelete(lease: GameplayLease | null, nowMs: number): boolean {
  return liveGameplayLease(lease, nowMs) !== null;
}

export function presenceFromLease(
  lease: GameplayLease | null,
  characterId: string,
  nowMs: number,
): PresenceState {
  const live = liveGameplayLease(lease, nowMs);
  if (live === null || live.characterId !== characterId) {
    return "OFFLINE";
  }
  return live.state;
}

function parseState(value: unknown): LeaseState | null {
  if (value === "DISCONNECTING") {
    return "LINK_DEAD";
  }
  if (value === "ENTERING" || value === "ONLINE" || value === "LEAVING" || value === "LINK_DEAD" || value === "DESPAWNING") {
    return value;
  }
  return null;
}

export function leaseFromStorage(value: { [key: string]: unknown } | null | undefined): GameplayLease | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.accountUserId !== "string" || typeof value.characterId !== "string") {
    return null;
  }
  if (typeof value.matchId !== "string") {
    return null;
  }
  const state = parseState(value.state !== undefined ? value.state : value.presenceState);
  if (state === null) {
    return null;
  }
  const createdAt =
    typeof value.createdAt === "number"
      ? value.createdAt
      : typeof value.acquiredAt === "number"
        ? value.acquiredAt
        : 0;
  const updatedAt =
    typeof value.updatedAt === "number"
      ? value.updatedAt
      : typeof value.lastSeenAt === "number"
        ? value.lastSeenAt
        : createdAt;
  const playAvailableAt = typeof value.playAvailableAt === "number" ? value.playAvailableAt : 0;
  const disconnectDetectedAt =
    typeof value.disconnectDetectedAt === "number"
      ? value.disconnectDetectedAt
      : state === "LINK_DEAD"
        ? updatedAt
        : 0;
  const despawnAt =
    typeof value.despawnAt === "number"
      ? value.despawnAt
      : state === "LINK_DEAD"
        ? playAvailableAt
        : 0;
  return {
    accountUserId: value.accountUserId,
    characterId: value.characterId,
    sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
    socketOrPresenceId: typeof value.socketOrPresenceId === "string" ? value.socketOrPresenceId : "",
    matchId: value.matchId,
    zoneOrInstanceId: typeof value.zoneOrInstanceId === "string" ? value.zoneOrInstanceId : "",
    state: state,
    createdAt: createdAt,
    updatedAt: updatedAt,
    disconnectDetectedAt: disconnectDetectedAt,
    despawnAt: despawnAt,
    leaseVersion: typeof value.leaseVersion === "number" ? value.leaseVersion : 1,
    serverInstanceIdentifier:
      typeof value.serverInstanceIdentifier === "string" ? value.serverInstanceIdentifier : value.matchId,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_VERSION,
  };
}

export function leaseStorageValue(lease: GameplayLease): { [key: string]: unknown } {
  return {
    accountUserId: lease.accountUserId,
    characterId: lease.characterId,
    sessionId: lease.sessionId,
    socketOrPresenceId: lease.socketOrPresenceId,
    matchId: lease.matchId,
    zoneOrInstanceId: lease.zoneOrInstanceId,
    state: lease.state,
    presenceState: lease.state,
    createdAt: lease.createdAt,
    updatedAt: lease.updatedAt,
    disconnectDetectedAt: lease.disconnectDetectedAt,
    despawnAt: lease.despawnAt,
    playAvailableAt: playAvailableAtOf(lease),
    acquiredAt: lease.createdAt,
    lastSeenAt: lease.updatedAt,
    leaseVersion: lease.leaseVersion,
    serverInstanceIdentifier: lease.serverInstanceIdentifier,
    schemaVersion: lease.schemaVersion,
  };
}

export function locationNameKey(location: ActiveLocation | null, zoneId: string): string {
  if (location !== null && location.zoneTemplateId.length > 0) {
    return "location." + location.zoneTemplateId;
  }
  if (zoneId.length > 0) {
    return "location." + zoneId;
  }
  return "location.unknown";
}
