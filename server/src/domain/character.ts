import {
  CHARACTER_SAVE_KEYS,
  SAVE_SCHEMA_VERSION,
  attachEnvelope,
  cloneExtras,
  envelopeFromRecord,
  optionalExtras,
} from "./save_schema";
import {
  CHARACTER_NAME_MAX,
  CHARACTER_NAME_MIN,
  canonicalCharacterName,
  validateCharacterName as validateNamePolicy,
} from "./character_name";

export const CHARACTER_COLLECTION = "player";
export const CHARACTER_KEY = "character";
export const CHARACTER_PERMISSION_READ: 1 = 1;
export const CHARACTER_PERMISSION_WRITE: 0 = 0;

export { CHARACTER_NAME_MAX, CHARACTER_NAME_MIN };
export const DEFAULT_CHARACTER_NAME = "Adventurer";

const ALLOWED_REQUEST_KEYS = ["name"];
const STAT_INJECTION_KEYS = [
  "attack",
  "attackCooldown",
  "attackRange",
  "baseStats",
  "characterId",
  "contentId",
  "damage",
  "health",
  "interactionRange",
  "maxHealth",
  "moveSpeed",
  "pickupRange",
  "position",
  "stats",
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "storageVersion",
  "x",
  "y",
  "zoneId",
];

export interface PlayerStatsSource {
  id: string;
  maxHealth: number;
  attack: number;
  moveSpeed: number;
  attackRange: number;
  attackCooldown: number;
  interactionRange: number;
  pickupRange: number;
}

export interface ZoneSpawnSource {
  id: string;
  playerSpawn: { x: number; y: number };
}

export interface CharacterPosition {
  x: number;
  y: number;
}

export interface CharacterBaseStats {
  maxHealth: number;
  attack: number;
  moveSpeed: number;
  attackRange: number;
  attackCooldown: number;
  interactionRange: number;
  pickupRange: number;
}

export interface StoredCharacter {
  characterId: string;
  accountUserId?: string;
  name: string;
  canonicalName?: string;
  classId?: string;
  contentId: string;
  zoneId: string;
  position: CharacterPosition;
  storageVersion: string;
  schemaVersion: number;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt?: number;
  deletedAt?: number;
  extras?: { [key: string]: unknown };
}

export interface CharacterBootstrapRequest {
  name?: string;
}

export interface CharacterBootstrapResponse {
  characterId: string;
  name: string;
  created: boolean;
  storageVersion: string;
  contentId: string;
  zoneId: string;
  baseStats: CharacterBaseStats;
  position: CharacterPosition;
}

export interface CharacterStore {
  read(userId: string): StoredCharacter | null;
  write(userId: string, record: StoredCharacter): void;
}

export interface CharacterBootstrapDeps {
  store: CharacterStore;
  newId: () => string;
  nowMs: () => number;
  player: PlayerStatsSource;
  zone: ZoneSpawnSource;
}

export function requireAuthenticatedUserId(userId: string | undefined): string {
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("unauthenticated");
  }
  return userId;
}

export function parseCharacterBootstrapRequest(payload: string): CharacterBootstrapRequest {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return {};
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

  const data = parsed as { [key: string]: unknown };
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (STAT_INJECTION_KEYS.indexOf(key) !== -1) {
      throw new Error("stat_injection:" + key);
    }
    if (ALLOWED_REQUEST_KEYS.indexOf(key) === -1) {
      throw new Error("unknown_field:" + key);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(data, "name")) {
    return {};
  }
  if (typeof data.name !== "string") {
    throw new Error("invalid_name");
  }
  return { name: data.name };
}

export function validateCharacterName(name: string): string {
  const result = validateNamePolicy(name);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.name;
}

export function resolveCreateName(request: CharacterBootstrapRequest, username: string | undefined): string {
  if (typeof request.name === "string") {
    return validateCharacterName(request.name);
  }
  if (typeof username === "string" && username.length > 0) {
    try {
      return validateCharacterName(username);
    } catch {
      return DEFAULT_CHARACTER_NAME;
    }
  }
  return DEFAULT_CHARACTER_NAME;
}

export function baseStatsFromContent(player: PlayerStatsSource): CharacterBaseStats {
  return {
    maxHealth: player.maxHealth,
    attack: player.attack,
    moveSpeed: player.moveSpeed,
    attackRange: player.attackRange,
    attackCooldown: player.attackCooldown,
    interactionRange: player.interactionRange,
    pickupRange: player.pickupRange,
  };
}

export function createStoredCharacter(
  characterId: string,
  name: string,
  player: PlayerStatsSource,
  zone: ZoneSpawnSource,
  storageVersion: string,
  nowMs: number = 0,
  accountUserId: string = "",
  classId: string = "",
): StoredCharacter {
  const displayName = validateCharacterName(name);
  return {
    characterId: characterId,
    accountUserId: accountUserId,
    name: displayName,
    canonicalName: canonicalCharacterName(displayName),
    classId: classId,
    contentId: player.id,
    zoneId: zone.id,
    position: { x: zone.playerSpawn.x, y: zone.playerSpawn.y },
    storageVersion: storageVersion,
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: nowMs,
    updatedAt: nowMs,
    lastPlayedAt: nowMs,
    deletedAt: 0,
  };
}

export function toBootstrapResponse(
  record: StoredCharacter,
  player: PlayerStatsSource,
  created: boolean,
): CharacterBootstrapResponse {
  return {
    characterId: record.characterId,
    name: record.name,
    created: created,
    storageVersion: record.storageVersion,
    contentId: player.id,
    zoneId: record.zoneId,
    baseStats: baseStatsFromContent(player),
    position: { x: record.position.x, y: record.position.y },
  };
}

export function handleCharacterBootstrap(
  userId: string | undefined,
  username: string | undefined,
  payload: string,
  deps: CharacterBootstrapDeps,
): CharacterBootstrapResponse {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterBootstrapRequest(payload);
  const existing = deps.store.read(authenticatedUserId);
  if (existing !== null) {
    return toBootstrapResponse(existing, deps.player, false);
  }

  const name = resolveCreateName(request, username);
  const record = createStoredCharacter(
    deps.newId(),
    name,
    deps.player,
    deps.zone,
    "",
    deps.nowMs(),
    authenticatedUserId,
    "",
  );
  deps.store.write(authenticatedUserId, record);
  const stored = deps.store.read(authenticatedUserId);
  if (stored === null) {
    throw new Error("internal_error");
  }
  return toBootstrapResponse(stored, deps.player, stored.characterId === record.characterId);
}

export function storedCharacterFromValue(
  value: { [key: string]: unknown },
  storageVersion: string,
): StoredCharacter | null {
  if (typeof value.characterId !== "string" || value.characterId.length === 0) {
    return null;
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    return null;
  }
  if (typeof value.contentId !== "string" || typeof value.zoneId !== "string") {
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
  const record: StoredCharacter = {
    characterId: value.characterId,
    name: value.name,
    contentId: value.contentId,
    zoneId: value.zoneId,
    position: { x: position.x, y: position.y },
    storageVersion: storageVersion,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_VERSION,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    extras: optionalExtras(value, CHARACTER_SAVE_KEYS),
  };
  if (typeof value.accountUserId === "string") {
    record.accountUserId = value.accountUserId;
  }
  if (typeof value.canonicalName === "string" && value.canonicalName.length > 0) {
    record.canonicalName = value.canonicalName;
  } else {
    record.canonicalName = canonicalCharacterName(value.name);
  }
  if (typeof value.classId === "string") {
    record.classId = value.classId;
  }
  if (typeof value.lastPlayedAt === "number") {
    record.lastPlayedAt = value.lastPlayedAt;
  } else {
    record.lastPlayedAt = record.updatedAt;
  }
  if (typeof value.deletedAt === "number") {
    record.deletedAt = value.deletedAt;
  } else {
    record.deletedAt = 0;
  }
  return record;
}

export function storedCharacterWriteValue(record: StoredCharacter): { [key: string]: unknown } {
  return attachEnvelope(
    {
      characterId: record.characterId,
      accountUserId: record.accountUserId !== undefined ? record.accountUserId : "",
      name: record.name,
      canonicalName: record.canonicalName !== undefined ? record.canonicalName : canonicalCharacterName(record.name),
      classId: record.classId !== undefined ? record.classId : "",
      contentId: record.contentId,
      zoneId: record.zoneId,
      position: { x: record.position.x, y: record.position.y },
      lastPlayedAt: record.lastPlayedAt !== undefined ? record.lastPlayedAt : record.updatedAt,
      deletedAt: record.deletedAt !== undefined ? record.deletedAt : 0,
    },
    envelopeFromRecord(record),
    record.extras,
  );
}

export function cloneStoredCharacter(record: StoredCharacter): StoredCharacter {
  return {
    characterId: record.characterId,
    accountUserId: record.accountUserId,
    name: record.name,
    canonicalName: record.canonicalName,
    classId: record.classId,
    contentId: record.contentId,
    zoneId: record.zoneId,
    position: { x: record.position.x, y: record.position.y },
    storageVersion: record.storageVersion,
    schemaVersion: record.schemaVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastPlayedAt: record.lastPlayedAt,
    deletedAt: record.deletedAt,
    extras: cloneExtras(record.extras),
  };
}

export function checkpointCharacterPosition(
  record: StoredCharacter,
  x: number,
  y: number,
  nowMs: number = record.updatedAt,
): StoredCharacter {
  const next = cloneStoredCharacter(record);
  const envelope = envelopeFromRecord(record);
  next.position = { x: x, y: y };
  next.schemaVersion = envelope.schemaVersion;
  next.createdAt = envelope.createdAt;
  next.updatedAt = nowMs;
  return next;
}
