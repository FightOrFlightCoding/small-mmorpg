import { CAVE_RECONNECT_GRACE_SEC, type ActiveLocation } from "./instance";
import { RECONNECT_GRACE_SEC } from "./persistence";
import { SAVE_SCHEMA_VERSION } from "./save_schema";

export const GAMEPLAY_LEASE_COLLECTION = "player";
export const GAMEPLAY_LEASE_KEY = "gameplay_lease";
export const GAMEPLAY_LEASE_PERMISSION_READ: 1 = 1;
export const GAMEPLAY_LEASE_PERMISSION_WRITE: 0 = 0;
export const GAMEPLAY_LEASE_SCHEMA_VERSION = 1;

export type PresenceState = "OFFLINE" | "ENTERING" | "ONLINE" | "LEAVING" | "LINK_DEAD" | "DISCONNECTING";

export interface GameplayLease {
  accountUserId: string;
  characterId: string;
  matchId: string;
  presenceState: PresenceState;
  acquiredAt: number;
  lastSeenAt: number;
  playAvailableAt: number;
  schemaVersion: number;
}

export function publicReconnectGraceMs(): number {
  return RECONNECT_GRACE_SEC * 1000;
}

export function caveReconnectGraceMs(): number {
  return CAVE_RECONNECT_GRACE_SEC * 1000;
}

export function leaseGraceMs(instanceType: string | undefined): number {
  if (instanceType === "party_cave") {
    return caveReconnectGraceMs();
  }
  return publicReconnectGraceMs();
}

export function acquireGameplayLease(input: {
  accountUserId: string;
  characterId: string;
  matchId: string;
  nowMs: number;
}): GameplayLease {
  return {
    accountUserId: input.accountUserId,
    characterId: input.characterId,
    matchId: input.matchId,
    presenceState: "ONLINE",
    acquiredAt: input.nowMs,
    lastSeenAt: input.nowMs,
    playAvailableAt: 0,
    schemaVersion: GAMEPLAY_LEASE_SCHEMA_VERSION,
  };
}

export function disconnectGameplayLease(lease: GameplayLease, nowMs: number, graceMs: number): GameplayLease {
  return {
    accountUserId: lease.accountUserId,
    characterId: lease.characterId,
    matchId: lease.matchId,
    presenceState: "DISCONNECTING",
    acquiredAt: lease.acquiredAt,
    lastSeenAt: nowMs,
    playAvailableAt: nowMs + graceMs,
    schemaVersion: SAVE_SCHEMA_VERSION,
  };
}

export function liveGameplayLease(lease: GameplayLease | null, nowMs: number): GameplayLease | null {
  if (lease === null) {
    return null;
  }
  if (lease.playAvailableAt > 0 && nowMs >= lease.playAvailableAt) {
    return null;
  }
  return lease;
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
  if (live.presenceState === "DISCONNECTING") {
    return "LINK_DEAD";
  }
  return live.presenceState;
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
  const state = value.presenceState;
  if (
    state !== "OFFLINE" &&
    state !== "ENTERING" &&
    state !== "ONLINE" &&
    state !== "LEAVING" &&
    state !== "LINK_DEAD" &&
    state !== "DISCONNECTING"
  ) {
    return null;
  }
  return {
    accountUserId: value.accountUserId,
    characterId: value.characterId,
    matchId: value.matchId,
    presenceState: state,
    acquiredAt: typeof value.acquiredAt === "number" ? value.acquiredAt : 0,
    lastSeenAt: typeof value.lastSeenAt === "number" ? value.lastSeenAt : 0,
    playAvailableAt: typeof value.playAvailableAt === "number" ? value.playAvailableAt : 0,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : GAMEPLAY_LEASE_SCHEMA_VERSION,
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
