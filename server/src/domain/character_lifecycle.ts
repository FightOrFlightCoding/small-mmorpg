import {
  cloneStoredCharacter,
  createStoredCharacter,
  parseCharacterBootstrapRequest,
  requireAuthenticatedUserId,
  resolveCreateName,
  toBootstrapResponse,
  type CharacterBootstrapResponse,
  type PlayerStatsSource,
  type StoredCharacter,
  type ZoneSpawnSource,
} from "./character";
import {
  confirmNameReservation,
  nameReservationConflict,
  reservationWrite,
  validateCharacterName,
  type NameReservation,
} from "./character_name";
import {
  addCharacterId,
  canCreateCharacter,
  canRestoreCharacter,
  CHARACTER_SLOT_LIMIT,
  emptyRoster,
  isDeleted,
  liveCharacterCount,
  rosterFromLegacy,
  type CharacterRoster,
} from "./character_roster";
import {
  issueSelectionTicket,
  SELECTION_TICKET_TTL_MS,
  type SelectionTicket,
} from "./character_ticket";
import { classExists, migrationDefaultClassId, type ClassDefinition } from "./class_catalog";

const CREATE_ALLOWED_KEYS = ["name", "classId"];
const ID_REQUEST_ALLOWED_KEYS = ["characterId"];
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
  "canonicalName",
  "accountUserId",
  "deletedAt",
  "lastPlayedAt",
  "ticketId",
  "expiresAt",
  "xp",
  "currentXp",
  "lifetimeXp",
  "level",
  "unspentAttributePoints",
  "unspentSkillPoints",
  "allocatedAttributes",
];

export interface CharacterCreateRequest {
  name: string;
  classId: string;
}

export interface CharacterIdRequest {
  characterId: string;
}

export interface CharacterListEntry {
  characterId: string;
  accountUserId: string;
  name: string;
  canonicalName: string;
  classId: string;
  createdAt: number;
  lastPlayedAt: number;
  deletedAt: number;
  schemaVersion: number;
}

export interface CharacterListResponse {
  slotLimit: number;
  liveCount: number;
  characters: CharacterListEntry[];
}

export interface CharacterCreateResponse {
  characterId: string;
  name: string;
  canonicalName: string;
  classId: string;
  created: true;
}

export interface CharacterSelectResponse {
  ticketId: string;
  characterId: string;
  accountUserId: string;
  expiresAt: number;
  name: string;
  classId: string;
}

export interface CharacterLifecycleDeps {
  nowMs: () => number;
  newId: () => string;
  newReservationToken: () => string;
  player: PlayerStatsSource;
  zone: ZoneSpawnSource;
  classes: { [id: string]: ClassDefinition };
  readRoster: (userId: string) => CharacterRoster | null;
  writeRoster: (userId: string, roster: CharacterRoster) => void;
  readLegacyCharacter: (userId: string) => StoredCharacter | null;
  readCharacter: (userId: string, characterId: string) => StoredCharacter | null;
  writeCharacter: (userId: string, record: StoredCharacter) => void;
  readReservation: (canonicalName: string) => NameReservation | null;
  writeReservation: (reservation: NameReservation) => void;
  confirmReservation: (canonicalName: string) => NameReservation | null;
  readSelection: (userId: string) => SelectionTicket | null;
  writeSelection: (userId: string, ticket: SelectionTicket) => void;
  copyGameplayFromLegacy?: (userId: string, characterId: string) => void;
  initializeNewCharacterGameplay?: (userId: string, record: StoredCharacter) => void;
}

export function characterListEntry(record: StoredCharacter, accountUserId: string): CharacterListEntry {
  return {
    characterId: record.characterId,
    accountUserId: record.accountUserId !== undefined && record.accountUserId.length > 0 ? record.accountUserId : accountUserId,
    name: record.name,
    canonicalName: record.canonicalName !== undefined ? record.canonicalName : record.name.toLowerCase(),
    classId: record.classId !== undefined ? record.classId : "",
    createdAt: record.createdAt,
    lastPlayedAt: record.lastPlayedAt !== undefined ? record.lastPlayedAt : record.updatedAt,
    deletedAt: record.deletedAt !== undefined ? record.deletedAt : 0,
    schemaVersion: record.schemaVersion,
  };
}

export function migrateLegacyCharacterIntoRoster(userId: string, deps: CharacterLifecycleDeps): CharacterRoster {
  const existingRoster = deps.readRoster(userId);
  if (existingRoster !== null) {
    fillMissingClassIds(userId, existingRoster, deps);
    return existingRoster;
  }
  const legacy = deps.readLegacyCharacter(userId);
  if (legacy === null) {
    const roster = emptyRoster(deps.nowMs());
    deps.writeRoster(userId, roster);
    return roster;
  }
  const nowMs = deps.nowMs();
  const migrated = applyLegacyMigrationFields(legacy, userId, deps);
  deps.writeCharacter(userId, migrated);
  reserveMigratedCanonicalName(migrated, userId, deps);
  if (deps.copyGameplayFromLegacy !== undefined) {
    deps.copyGameplayFromLegacy(userId, migrated.characterId);
  }
  const roster = rosterFromLegacy(migrated.characterId, nowMs);
  deps.writeRoster(userId, roster);
  return roster;
}

function reserveMigratedCanonicalName(record: StoredCharacter, userId: string, deps: CharacterLifecycleDeps): void {
  const canonical =
    record.canonicalName !== undefined && record.canonicalName.length > 0
      ? record.canonicalName
      : record.name.toLowerCase();
  try {
    reserveCanonicalName(canonical, record.characterId, userId, deps.newReservationToken(), deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message !== "name_taken") {
      throw err;
    }
  }
}

function applyLegacyMigrationFields(
  legacy: StoredCharacter,
  userId: string,
  deps: CharacterLifecycleDeps,
): StoredCharacter {
  const next = cloneStoredCharacter(legacy);
  next.accountUserId = userId;
  if (next.canonicalName === undefined || next.canonicalName.length === 0) {
    next.canonicalName = next.name.toLowerCase();
  }
  if (next.classId === undefined || next.classId.length === 0) {
    next.classId = migrationDefaultClassId(deps.classes);
  }
  if (next.deletedAt === undefined) {
    next.deletedAt = 0;
  }
  if (next.lastPlayedAt === undefined) {
    next.lastPlayedAt = next.updatedAt;
  }
  next.updatedAt = deps.nowMs();
  return next;
}

function fillMissingClassIds(userId: string, roster: CharacterRoster, deps: CharacterLifecycleDeps): void {
  const defaultClassId = migrationDefaultClassId(deps.classes);
  for (let i = 0; i < roster.characterIds.length; i++) {
    const characterId = roster.characterIds[i];
    const record = deps.readCharacter(userId, characterId);
    if (record === null) {
      continue;
    }
    if (record.classId !== undefined && record.classId.length > 0) {
      continue;
    }
    const next = cloneStoredCharacter(record);
    next.classId = defaultClassId;
    next.accountUserId = userId;
    if (next.canonicalName === undefined || next.canonicalName.length === 0) {
      next.canonicalName = next.name.toLowerCase();
    }
    deps.writeCharacter(userId, next);
  }
}

export function loadRosterCharacters(userId: string, deps: CharacterLifecycleDeps): StoredCharacter[] {
  const roster = migrateLegacyCharacterIntoRoster(userId, deps);
  const records: StoredCharacter[] = [];
  for (let i = 0; i < roster.characterIds.length; i++) {
    const record = deps.readCharacter(userId, roster.characterIds[i]);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

export function handleCharacterList(userId: string | undefined, deps: CharacterLifecycleDeps): CharacterListResponse {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const records = loadRosterCharacters(authenticatedUserId, deps);
  const characters: CharacterListEntry[] = [];
  for (let i = 0; i < records.length; i++) {
    characters.push(characterListEntry(records[i], authenticatedUserId));
  }
  return {
    slotLimit: CHARACTER_SLOT_LIMIT,
    liveCount: liveCharacterCount(records),
    characters: characters,
  };
}

export function parseCharacterCreateRequest(payload: string): CharacterCreateRequest {
  const data = parseObjectPayload(payload, CREATE_ALLOWED_KEYS, ["classId"]);
  if (typeof data.name !== "string") {
    throw new Error("invalid_name");
  }
  if (typeof data.classId !== "string") {
    throw new Error("invalid_class");
  }
  return { name: data.name, classId: data.classId };
}

export function parseCharacterIdRequest(payload: string): CharacterIdRequest {
  const data = parseObjectPayload(payload, ID_REQUEST_ALLOWED_KEYS, ["characterId"]);
  if (typeof data.characterId !== "string" || data.characterId.length === 0) {
    throw new Error("character_missing");
  }
  return { characterId: data.characterId };
}

export function handleCharacterCreate(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterCreateResponse {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterCreateRequest(payload);
  return createCharacterRecord(authenticatedUserId, request.name, request.classId, deps);
}

export function createCharacterRecord(
  userId: string,
  rawName: string,
  classId: string,
  deps: CharacterLifecycleDeps,
): CharacterCreateResponse {
  const validated = validateCharacterName(rawName);
  if (!validated.ok) {
    throw new Error(validated.reason);
  }
  if (!classExists(deps.classes, classId)) {
    throw new Error("invalid_class");
  }
  const records = loadRosterCharacters(userId, deps);
  if (!canCreateCharacter(liveCharacterCount(records))) {
    throw new Error("slot_limit");
  }
  const characterId = deps.newId();
  const token = deps.newReservationToken();
  reserveCanonicalName(validated.canonicalName, characterId, userId, token, deps);
  const nowMs = deps.nowMs();
  const record = createStoredCharacter(
    characterId,
    validated.name,
    deps.player,
    deps.zone,
    "",
    nowMs,
    userId,
    classId,
  );
  deps.writeCharacter(userId, record);
  const roster = deps.readRoster(userId);
  deps.writeRoster(userId, addCharacterId(roster !== null ? roster : emptyRoster(nowMs), characterId, nowMs));
  if (deps.initializeNewCharacterGameplay !== undefined) {
    deps.initializeNewCharacterGameplay(userId, record);
  }
  return {
    characterId: record.characterId,
    name: record.name,
    canonicalName: record.canonicalName !== undefined ? record.canonicalName : validated.canonicalName,
    classId: classId,
    created: true,
  };
}

export function reserveCanonicalName(
  canonicalName: string,
  characterId: string,
  accountUserId: string,
  token: string,
  deps: Pick<CharacterLifecycleDeps, "readReservation" | "writeReservation" | "confirmReservation">,
): void {
  const desired = reservationWrite(canonicalName, characterId, accountUserId, token);
  const existing = deps.readReservation(canonicalName);
  if (nameReservationConflict(existing, desired)) {
    throw new Error("name_taken");
  }
  deps.writeReservation(desired);
  const observed = deps.confirmReservation(canonicalName);
  if (!confirmNameReservation(desired, observed)) {
    throw new Error("name_taken");
  }
}

export function handleCharacterSelect(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterSelectResponse {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterIdRequest(payload);
  migrateLegacyCharacterIntoRoster(authenticatedUserId, deps);
  const record = ownedCharacter(authenticatedUserId, request.characterId, deps);
  if (isDeleted(record.deletedAt)) {
    throw new Error("character_deleted");
  }
  const nowMs = deps.nowMs();
  const ticket = issueSelectionTicket(deps.newId(), authenticatedUserId, record.characterId, nowMs, SELECTION_TICKET_TTL_MS);
  deps.writeSelection(authenticatedUserId, ticket);
  const played = cloneStoredCharacter(record);
  played.lastPlayedAt = nowMs;
  played.updatedAt = nowMs;
  deps.writeCharacter(authenticatedUserId, played);
  return {
    ticketId: ticket.ticketId,
    characterId: record.characterId,
    accountUserId: authenticatedUserId,
    expiresAt: ticket.expiresAt,
    name: record.name,
    classId: record.classId !== undefined ? record.classId : "",
  };
}

export function handleCharacterSoftDelete(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterListEntry {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterIdRequest(payload);
  migrateLegacyCharacterIntoRoster(authenticatedUserId, deps);
  const record = ownedCharacter(authenticatedUserId, request.characterId, deps);
  if (isDeleted(record.deletedAt)) {
    return characterListEntry(record, authenticatedUserId);
  }
  const nowMs = deps.nowMs();
  const next = cloneStoredCharacter(record);
  next.deletedAt = nowMs;
  next.updatedAt = nowMs;
  deps.writeCharacter(authenticatedUserId, next);
  const selection = deps.readSelection(authenticatedUserId);
  if (selection !== null && selection.characterId === record.characterId) {
    deps.writeSelection(authenticatedUserId, {
      ticketId: selection.ticketId,
      accountUserId: selection.accountUserId,
      characterId: selection.characterId,
      expiresAt: selection.expiresAt,
      invalidated: true,
      schemaVersion: selection.schemaVersion,
      createdAt: selection.createdAt,
      updatedAt: nowMs,
    });
  }
  return characterListEntry(next, authenticatedUserId);
}

export function handleCharacterRestore(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterListEntry {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterIdRequest(payload);
  const records = loadRosterCharacters(authenticatedUserId, deps);
  const record = ownedCharacter(authenticatedUserId, request.characterId, deps);
  if (!isDeleted(record.deletedAt)) {
    return characterListEntry(record, authenticatedUserId);
  }
  if (!canRestoreCharacter(liveCharacterCount(records))) {
    throw new Error("slot_limit");
  }
  const nowMs = deps.nowMs();
  const next = cloneStoredCharacter(record);
  next.deletedAt = 0;
  next.updatedAt = nowMs;
  deps.writeCharacter(authenticatedUserId, next);
  return characterListEntry(next, authenticatedUserId);
}

export function handleCharacterBootstrapViaRoster(
  userId: string | undefined,
  username: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterBootstrapResponse {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterBootstrapRequest(payload);
  const records = loadRosterCharacters(authenticatedUserId, deps);
  const live = firstLive(records);
  if (live !== null) {
    return toBootstrapResponse(live, deps.player, false);
  }
  const name = resolveCreateName(request, username);
  const created = createCharacterRecord(authenticatedUserId, name, migrationDefaultClassId(deps.classes), deps);
  const stored = deps.readCharacter(authenticatedUserId, created.characterId);
  if (stored === null) {
    throw new Error("internal_error");
  }
  return toBootstrapResponse(stored, deps.player, true);
}

function firstLive(records: StoredCharacter[]): StoredCharacter | null {
  for (let i = 0; i < records.length; i++) {
    if (!isDeleted(records[i].deletedAt)) {
      return records[i];
    }
  }
  return null;
}

function ownedCharacter(userId: string, characterId: string, deps: CharacterLifecycleDeps): StoredCharacter {
  const roster = deps.readRoster(userId);
  if (roster === null || roster.characterIds.indexOf(characterId) === -1) {
    const record = deps.readCharacter(userId, characterId);
    if (record !== null && record.accountUserId !== undefined && record.accountUserId.length > 0 && record.accountUserId !== userId) {
      throw new Error("selection_foreign");
    }
    throw new Error("character_missing");
  }
  const record = deps.readCharacter(userId, characterId);
  if (record === null) {
    throw new Error("character_missing");
  }
  if (record.accountUserId !== undefined && record.accountUserId.length > 0 && record.accountUserId !== userId) {
    throw new Error("selection_foreign");
  }
  return record;
}

function parseObjectPayload(
  payload: string,
  allowedKeys: string[],
  injectionExceptions: string[],
): { [key: string]: unknown } {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    throw new Error("malformed_json");
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
    if (STAT_INJECTION_KEYS.indexOf(key) !== -1 && injectionExceptions.indexOf(key) === -1) {
      throw new Error("stat_injection:" + key);
    }
    if (allowedKeys.indexOf(key) === -1) {
      throw new Error("unknown_field:" + key);
    }
  }
  return data;
}
