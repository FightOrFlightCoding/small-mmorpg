export const PUBLIC_WORLD_INSTANCE_TYPE = "public_world";
export const PARTY_CAVE_INSTANCE_TYPE = "party_cave";
export const PUBLIC_WORLD_INSTANCE_ID = "world.public";
export const CAVE_ZONE_ID = "zone.cave";
export const PARTY_CAVE_LABEL = "party.cave";
export const CAVE_SCHEMA_VERSION = 1;
export const LOCATION_SCHEMA_VERSION = 1;
export const TRANSFER_SCHEMA_VERSION = 1;
export const CAVE_MATCH_MAX_PLAYERS = 5;
export const CAVE_EMPTY_TIMEOUT_SEC = 60;
export const CAVE_RECONNECT_GRACE_SEC = 60;
export const TRANSFER_TICKET_TTL_MS = 25000;
export const CAVE_WIPE_DELAY_SEC = 3;

export type InstanceType = "public_world" | "party_cave";
export type CaveLifecycleState = "active" | "empty_grace" | "expired" | "terminated";
export type CaveCompletionState = "none" | "in_progress" | "boss_defeated";
export type LocationTransferState = "idle" | "issued" | "in_flight";

export interface CaveRecord {
  instanceId: string;
  zoneTemplateId: string;
  matchId: string;
  ownerPartyId?: string;
  ownerCharacterId?: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  lifecycleState: CaveLifecycleState;
  contentVersion: string;
  completionState: CaveCompletionState;
  schemaVersion: number;
}

export interface CaveOwnerIndex {
  schemaVersion: number;
  ownerKind: "party" | "character";
  ownerId: string;
  instanceId: string;
}

export interface CaveCharacterAssociation {
  schemaVersion: number;
  characterId: string;
  instanceId: string;
}

export interface TransferTicket {
  ticketId: string;
  characterId: string;
  accountUserId: string;
  originMatchId: string;
  destinationMatchId: string;
  destinationInstanceId: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number;
  schemaVersion: number;
}

export interface ActiveLocation {
  instanceType: InstanceType;
  zoneTemplateId: string;
  instanceId: string;
  matchId: string;
  position: { x: number; y: number };
  characterId: string;
  accountUserId: string;
  selectionTicketId?: string;
  lastCheckpointAt: number;
  transferState: LocationTransferState;
  schemaVersion: number;
}

export function isInstanceType(value: string): value is InstanceType {
  return value === PUBLIC_WORLD_INSTANCE_TYPE || value === PARTY_CAVE_INSTANCE_TYPE;
}

export function publicWorldLocation(
  matchId: string,
  characterId: string,
  accountUserId: string,
  x: number,
  y: number,
  nowMs: number,
  selectionTicketId?: string,
): ActiveLocation {
  return {
    instanceType: PUBLIC_WORLD_INSTANCE_TYPE,
    zoneTemplateId: "zone.starter",
    instanceId: PUBLIC_WORLD_INSTANCE_ID,
    matchId: matchId,
    position: { x: x, y: y },
    characterId: characterId,
    accountUserId: accountUserId,
    selectionTicketId: selectionTicketId,
    lastCheckpointAt: nowMs,
    transferState: "idle",
    schemaVersion: LOCATION_SCHEMA_VERSION,
  };
}

export function caveLocation(
  record: CaveRecord,
  characterId: string,
  accountUserId: string,
  x: number,
  y: number,
  nowMs: number,
  selectionTicketId?: string,
): ActiveLocation {
  return {
    instanceType: PARTY_CAVE_INSTANCE_TYPE,
    zoneTemplateId: record.zoneTemplateId,
    instanceId: record.instanceId,
    matchId: record.matchId,
    position: { x: x, y: y },
    characterId: characterId,
    accountUserId: accountUserId,
    selectionTicketId: selectionTicketId,
    lastCheckpointAt: nowMs,
    transferState: "idle",
    schemaVersion: LOCATION_SCHEMA_VERSION,
  };
}

export function emptyCaveRecord(params: {
  instanceId: string;
  matchId: string;
  ownerPartyId?: string;
  ownerCharacterId?: string;
  contentVersion: string;
  nowMs: number;
  emptyTimeoutMs: number;
  completionState?: CaveCompletionState;
}): CaveRecord {
  const record: CaveRecord = {
    instanceId: params.instanceId,
    zoneTemplateId: CAVE_ZONE_ID,
    matchId: params.matchId,
    createdAt: params.nowMs,
    lastActiveAt: params.nowMs,
    expiresAt: params.nowMs + params.emptyTimeoutMs,
    lifecycleState: "active",
    contentVersion: params.contentVersion,
    completionState: params.completionState !== undefined ? params.completionState : "none",
    schemaVersion: CAVE_SCHEMA_VERSION,
  };
  if (params.ownerPartyId !== undefined && params.ownerPartyId.length > 0) {
    record.ownerPartyId = params.ownerPartyId;
  } else {
    record.ownerCharacterId = params.ownerCharacterId;
  }
  return record;
}
