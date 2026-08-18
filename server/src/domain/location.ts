import {
  LOCATION_SCHEMA_VERSION,
  type ActiveLocation,
  type InstanceType,
  type LocationTransferState,
  isInstanceType,
} from "./instance";

export function locationFromStorage(value: { [key: string]: unknown } | null | undefined): ActiveLocation | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.instanceType !== "string" || !isInstanceType(value.instanceType)) {
    return null;
  }
  if (typeof value.zoneTemplateId !== "string" || typeof value.instanceId !== "string") {
    return null;
  }
  if (typeof value.matchId !== "string" || typeof value.characterId !== "string") {
    return null;
  }
  if (typeof value.accountUserId !== "string") {
    return null;
  }
  const positionValue = value.position;
  if (positionValue === null || typeof positionValue !== "object" || Array.isArray(positionValue)) {
    return null;
  }
  const position = positionValue as { [key: string]: unknown };
  if (typeof position.x !== "number" || typeof position.y !== "number") {
    return null;
  }
  const transferState = parseTransferState(value.transferState);
  return {
    instanceType: value.instanceType,
    zoneTemplateId: value.zoneTemplateId,
    instanceId: value.instanceId,
    matchId: value.matchId,
    position: { x: position.x, y: position.y },
    characterId: value.characterId,
    accountUserId: value.accountUserId,
    selectionTicketId: typeof value.selectionTicketId === "string" ? value.selectionTicketId : undefined,
    lastCheckpointAt: typeof value.lastCheckpointAt === "number" ? value.lastCheckpointAt : 0,
    transferState: transferState,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : LOCATION_SCHEMA_VERSION,
  };
}

export function withTransferState(location: ActiveLocation, transferState: LocationTransferState, nowMs: number): ActiveLocation {
  return {
    instanceType: location.instanceType,
    zoneTemplateId: location.zoneTemplateId,
    instanceId: location.instanceId,
    matchId: location.matchId,
    position: { x: location.position.x, y: location.position.y },
    characterId: location.characterId,
    accountUserId: location.accountUserId,
    selectionTicketId: location.selectionTicketId,
    lastCheckpointAt: nowMs,
    transferState: transferState,
    schemaVersion: location.schemaVersion,
  };
}

export function withCheckpoint(location: ActiveLocation, x: number, y: number, nowMs: number): ActiveLocation {
  return {
    instanceType: location.instanceType,
    zoneTemplateId: location.zoneTemplateId,
    instanceId: location.instanceId,
    matchId: location.matchId,
    position: { x: x, y: y },
    characterId: location.characterId,
    accountUserId: location.accountUserId,
    selectionTicketId: location.selectionTicketId,
    lastCheckpointAt: nowMs,
    transferState: location.transferState,
    schemaVersion: location.schemaVersion,
  };
}

export function evaluateJoinPresence(input: {
  location: ActiveLocation | null;
  joiningMatchId: string;
  joiningInstanceType: InstanceType;
  hasTransferTicket: boolean;
  originPresenceLive: boolean;
  destinationCaveAlive: boolean;
}): { accept: boolean; rejectMessage?: string } {
  const location = input.location;
  if (location === null) {
    return { accept: true };
  }
  if (input.hasTransferTicket) {
    if (location.transferState === "issued" && input.originPresenceLive) {
      return { accept: false, rejectMessage: "still_in_origin" };
    }
    if (location.matchId === input.joiningMatchId) {
      return { accept: false, rejectMessage: "already_in_match" };
    }
    return { accept: true };
  }
  if (location.matchId === input.joiningMatchId) {
    return { accept: true };
  }
  if (location.instanceType === "party_cave" && input.joiningInstanceType === "public_world") {
    if (!input.destinationCaveAlive) {
      return { accept: true };
    }
    if (location.transferState === "in_flight") {
      return { accept: true };
    }
    return { accept: false, rejectMessage: "already_elsewhere" };
  }
  if (input.originPresenceLive) {
    return { accept: false, rejectMessage: "already_elsewhere" };
  }
  if (location.transferState === "idle" && location.matchId.length > 0 && location.matchId !== input.joiningMatchId) {
    if (location.instanceType === "party_cave" && !input.destinationCaveAlive) {
      return { accept: true };
    }
    if (location.instanceType === "public_world" && input.joiningInstanceType === "party_cave") {
      return { accept: false, rejectMessage: "already_elsewhere" };
    }
  }
  return { accept: true };
}

function parseTransferState(value: unknown): LocationTransferState {
  if (value === "issued" || value === "in_flight" || value === "idle") {
    return value;
  }
  return "idle";
}
