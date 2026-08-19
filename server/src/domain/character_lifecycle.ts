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
  catalogLevel,
  characterCatalogEntry,
  CHARACTER_STATUS_ACTIVE,
  CHARACTER_STATUS_PURGED,
  CHARACTER_STATUS_SOFT_DELETED,
  type CharacterCatalogEntry,
} from "./character_catalog";
import {
  confirmNameReservation,
  nameReservationConflict,
  nameReservationHeldByCharacter,
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
  SOFT_DELETE_RETENTION_MS,
  type CharacterRoster,
} from "./character_roster";
import {
  issueSelectionTicket,
  SELECTION_TICKET_TTL_MS,
  type SelectionTicket,
} from "./character_ticket";
import { classExists, migrationDefaultClassId, type ClassDefinition } from "./class_catalog";
import {
  accountLeaseBlocksDelete,
  accountLeaseBlocksOtherCharacter,
  liveGameplayLease,
  type GameplayLease,
} from "./gameplay_lease";
import type { ActiveLocation } from "./instance";
import type { CharacterProgression } from "./progression";
import {
  emptyPurgeJob,
  PURGE_STEPS,
  withCompletedPurgeStep,
  type CharacterPurgeJob,
  type PurgeStep,
} from "./character_purge";

const CREATE_ALLOWED_KEYS = [
  "name",
  "displayName",
  "display_name",
  "classId",
  "class_id",
  "idempotencyKey",
  "idempotency_key",
];
const ID_REQUEST_ALLOWED_KEYS = ["characterId", "character_id"];
const DELETE_ALLOWED_KEYS = [
  "characterId",
  "character_id",
  "confirmationName",
  "confirmation_name",
  "idempotencyKey",
  "idempotency_key",
];
const NAME_CHECK_ALLOWED_KEYS = ["displayName", "display_name", "name"];
const STAT_INJECTION_KEYS = [
  "attack",
  "attackCooldown",
  "attackRange",
  "baseStats",
  "characterId",
  "contentId",
  "damage",
  "gold",
  "health",
  "interactionRange",
  "items",
  "maxHealth",
  "moveSpeed",
  "pickupRange",
  "position",
  "quests",
  "skills",
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
  idempotencyKey: string;
}

export interface CharacterIdRequest {
  characterId: string;
}

export interface CharacterDeleteRequest {
  characterId: string;
  confirmationName: string;
  idempotencyKey: string;
}

export type CharacterListEntry = CharacterCatalogEntry;

export interface CharacterListResponse {
  slotLimit: number;
  liveCount: number;
  characters: CharacterCatalogEntry[];
  serverTimeMs: number;
  maintenance: boolean;
}

export interface CharacterCreateResponse extends CharacterCatalogEntry {
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

export interface CharacterNameAvailableResponse {
  available: boolean;
  canonicalName: string;
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
  deleteCharacterRecord?: (userId: string, characterId: string) => void;
  readReservation: (canonicalName: string) => NameReservation | null;
  writeReservation: (reservation: NameReservation) => void;
  confirmReservation: (canonicalName: string) => NameReservation | null;
  deleteReservation?: (canonicalName: string) => void;
  readSelection: (userId: string) => SelectionTicket | null;
  writeSelection: (userId: string, ticket: SelectionTicket) => void;
  copyGameplayFromLegacy?: (userId: string, characterId: string) => void;
  initializeNewCharacterGameplay?: (userId: string, record: StoredCharacter) => void;
  readLease?: (userId: string) => GameplayLease | null;
  writeLease?: (userId: string, lease: GameplayLease | null) => void;
  readProgression?: (userId: string, characterId: string) => CharacterProgression | null;
  readLocation?: (userId: string, characterId: string) => ActiveLocation | null;
  readIdempotency?: (userId: string, operation: string, key: string) => { [key: string]: unknown } | null;
  writeIdempotency?: (userId: string, operation: string, key: string, result: { [key: string]: unknown }) => void;
  readPurgeJob?: (userId: string, characterId: string) => CharacterPurgeJob | null;
  writePurgeJob?: (userId: string, job: CharacterPurgeJob) => void;
  deletePurgeJob?: (userId: string, characterId: string) => void;
  applyPurgeStep?: (userId: string, record: StoredCharacter, step: PurgeStep) => void;
  maintenanceEnabled?: () => boolean;
  contentCompatible?: () => boolean;
}

export function characterListEntry(record: StoredCharacter, accountUserId: string, deps?: CharacterLifecycleDeps): CharacterCatalogEntry {
  const nowMs = deps !== undefined ? deps.nowMs() : 0;
  const lease = deps !== undefined && deps.readLease !== undefined ? deps.readLease(accountUserId) : null;
  const location =
    deps !== undefined && deps.readLocation !== undefined ? deps.readLocation(accountUserId, record.characterId) : null;
  const progression =
    deps !== undefined && deps.readProgression !== undefined ? deps.readProgression(accountUserId, record.characterId) : null;
  const selection = deps !== undefined ? deps.readSelection(accountUserId) : null;
  return characterCatalogEntry({
    record: record,
    accountUserId: accountUserId,
    nowMs: nowMs,
    level: catalogLevel(progression !== undefined ? progression : null),
    location: location !== undefined ? location : null,
    lease: lease !== undefined ? lease : null,
    maintenance: deps !== undefined && deps.maintenanceEnabled !== undefined ? deps.maintenanceEnabled() : false,
    contentCompatible: deps !== undefined && deps.contentCompatible !== undefined ? deps.contentCompatible() : true,
    selectionPendingCharacterId: selection !== null && !selection.invalidated ? selection.characterId : "",
  });
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
  if (next.softDeleteExpiresAt === undefined) {
    next.softDeleteExpiresAt = 0;
  }
  if (next.status === undefined || next.status.length === 0) {
    next.status = isDeleted(next.deletedAt) ? CHARACTER_STATUS_SOFT_DELETED : CHARACTER_STATUS_ACTIVE;
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
  purgeExpiredCharacters(authenticatedUserId, deps);
  const records = loadRosterCharacters(authenticatedUserId, deps);
  const characters: CharacterCatalogEntry[] = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i].status === CHARACTER_STATUS_PURGED) {
      continue;
    }
    characters.push(characterListEntry(records[i], authenticatedUserId, deps));
  }
  return {
    slotLimit: CHARACTER_SLOT_LIMIT,
    liveCount: liveCharacterCount(records),
    characters: characters,
    serverTimeMs: deps.nowMs(),
    maintenance: deps.maintenanceEnabled !== undefined ? deps.maintenanceEnabled() : false,
  };
}

export function parseCharacterCreateRequest(payload: string): CharacterCreateRequest {
  const data = parseObjectPayload(payload, CREATE_ALLOWED_KEYS, ["classId", "class_id"]);
  const name = firstString(data, ["name", "displayName", "display_name"]);
  const classId = firstString(data, ["classId", "class_id"]);
  if (name === null) {
    throw new Error("invalid_name");
  }
  if (classId === null) {
    throw new Error("invalid_class");
  }
  const idempotencyKey = firstString(data, ["idempotencyKey", "idempotency_key"]);
  return {
    name: name,
    classId: classId,
    idempotencyKey: idempotencyKey !== null ? idempotencyKey : "",
  };
}

export function parseCharacterIdRequest(payload: string): CharacterIdRequest {
  const data = parseObjectPayload(payload, ID_REQUEST_ALLOWED_KEYS, ["characterId", "character_id"]);
  const characterId = firstString(data, ["characterId", "character_id"]);
  if (characterId === null || characterId.length === 0) {
    throw new Error("character_missing");
  }
  return { characterId: characterId };
}

export function parseCharacterDeleteRequest(payload: string): CharacterDeleteRequest {
  const data = parseObjectPayload(payload, DELETE_ALLOWED_KEYS, ["characterId", "character_id"]);
  const characterId = firstString(data, ["characterId", "character_id"]);
  const confirmationName = firstString(data, ["confirmationName", "confirmation_name"]);
  if (characterId === null || characterId.length === 0) {
    throw new Error("character_missing");
  }
  if (confirmationName === null) {
    throw new Error("confirmation_required");
  }
  const idempotencyKey = firstString(data, ["idempotencyKey", "idempotency_key"]);
  return {
    characterId: characterId,
    confirmationName: confirmationName,
    idempotencyKey: idempotencyKey !== null ? idempotencyKey : "",
  };
}

export function handleCharacterCreate(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterCreateResponse {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterCreateRequest(payload);
  if (request.idempotencyKey.length > 0 && deps.readIdempotency !== undefined) {
    const replayed = deps.readIdempotency(authenticatedUserId, "create", request.idempotencyKey);
    if (replayed !== null) {
      return replayed as unknown as CharacterCreateResponse;
    }
  }
  const created = createCharacterRecord(authenticatedUserId, request.name, request.classId, deps);
  if (request.idempotencyKey.length > 0 && deps.writeIdempotency !== undefined) {
    deps.writeIdempotency(authenticatedUserId, "create", request.idempotencyKey, created as unknown as { [key: string]: unknown });
  }
  return created;
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
  purgeExpiredCharacters(userId, deps);
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
  const summary = characterListEntry(record, userId, deps);
  return {
    ...summary,
    created: true,
  };
}

export function reserveCanonicalName(
  canonicalName: string,
  characterId: string,
  accountUserId: string,
  token: string,
  deps: Pick<CharacterLifecycleDeps, "readReservation" | "writeReservation" | "confirmReservation" | "nowMs">,
): void {
  const nowMs = deps.nowMs !== undefined ? deps.nowMs() : 0;
  const desired = reservationWrite(canonicalName, characterId, accountUserId, token, nowMs);
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

export function handleCharacterNameAvailable(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterNameAvailableResponse {
  requireAuthenticatedUserId(userId);
  const data = parseObjectPayload(payload, NAME_CHECK_ALLOWED_KEYS, []);
  const name = firstString(data, ["displayName", "display_name", "name"]);
  if (name === null) {
    throw new Error("invalid_name");
  }
  const validated = validateCharacterName(name);
  if (!validated.ok) {
    throw new Error(validated.reason);
  }
  const existing = deps.readReservation(validated.canonicalName);
  const available = existing === null || existing.reservationState === "RELEASED";
  return { available: available, canonicalName: validated.canonicalName };
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
  if (isDeleted(record.deletedAt) || record.status === CHARACTER_STATUS_SOFT_DELETED) {
    throw new Error("character_deleted");
  }
  if (deps.maintenanceEnabled !== undefined && deps.maintenanceEnabled()) {
    throw new Error("server_maintenance");
  }
  if (deps.contentCompatible !== undefined && !deps.contentCompatible()) {
    throw new Error("content_incompatible");
  }
  const nowMs = deps.nowMs();
  const lease = deps.readLease !== undefined ? deps.readLease(authenticatedUserId) : null;
  if (accountLeaseBlocksOtherCharacter(lease, record.characterId, nowMs)) {
    throw new Error("account_busy");
  }
  const liveLease = liveGameplayLease(lease, nowMs);
  if (liveLease !== null && liveLease.characterId === record.characterId) {
    throw new Error(liveLease.presenceState === "DISCONNECTING" ? "link_dead" : "account_busy");
  }
  const existing = deps.readSelection(authenticatedUserId);
  if (
    existing !== null &&
    !existing.invalidated &&
    existing.characterId === record.characterId &&
    nowMs < existing.expiresAt
  ) {
    return {
      ticketId: existing.ticketId,
      characterId: record.characterId,
      accountUserId: authenticatedUserId,
      expiresAt: existing.expiresAt,
      name: record.name,
      classId: record.classId !== undefined ? record.classId : "",
    };
  }
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

export function handleCharacterDeleteRequest(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterCatalogEntry {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterDeleteRequest(payload);
  if (request.idempotencyKey.length > 0 && deps.readIdempotency !== undefined) {
    const replayed = deps.readIdempotency(authenticatedUserId, "delete", request.idempotencyKey);
    if (replayed !== null) {
      return replayed as unknown as CharacterCatalogEntry;
    }
  }
  migrateLegacyCharacterIntoRoster(authenticatedUserId, deps);
  const record = ownedCharacter(authenticatedUserId, request.characterId, deps);
  if (request.confirmationName !== record.name) {
    throw new Error("confirmation_mismatch");
  }
  const nowMs = deps.nowMs();
  const lease = deps.readLease !== undefined ? deps.readLease(authenticatedUserId) : null;
  if (accountLeaseBlocksDelete(lease, nowMs)) {
    throw new Error("gameplay_lease");
  }
  if (isDeleted(record.deletedAt)) {
    const existing = characterListEntry(record, authenticatedUserId, deps);
    if (request.idempotencyKey.length > 0 && deps.writeIdempotency !== undefined) {
      deps.writeIdempotency(authenticatedUserId, "delete", request.idempotencyKey, existing as unknown as { [key: string]: unknown });
    }
    return existing;
  }
  const next = cloneStoredCharacter(record);
  next.deletedAt = nowMs;
  next.softDeleteExpiresAt = nowMs + SOFT_DELETE_RETENTION_MS;
  next.status = CHARACTER_STATUS_SOFT_DELETED;
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
  const summary = characterListEntry(next, authenticatedUserId, deps);
  if (request.idempotencyKey.length > 0 && deps.writeIdempotency !== undefined) {
    deps.writeIdempotency(authenticatedUserId, "delete", request.idempotencyKey, summary as unknown as { [key: string]: unknown });
  }
  return summary;
}

export function handleCharacterSoftDelete(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterCatalogEntry {
  return handleCharacterDeleteRequest(userId, payload, deps);
}

export function handleCharacterRestore(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): CharacterCatalogEntry {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterIdRequest(payload);
  const records = loadRosterCharacters(authenticatedUserId, deps);
  const record = ownedCharacter(authenticatedUserId, request.characterId, deps);
  if (!isDeleted(record.deletedAt)) {
    return characterListEntry(record, authenticatedUserId, deps);
  }
  const nowMs = deps.nowMs();
  const expires = record.softDeleteExpiresAt !== undefined ? record.softDeleteExpiresAt : 0;
  if (expires > 0 && nowMs >= expires) {
    throw new Error("retention_expired");
  }
  if (!canRestoreCharacter(liveCharacterCount(records))) {
    throw new Error("slot_limit");
  }
  const canonical =
    record.canonicalName !== undefined && record.canonicalName.length > 0
      ? record.canonicalName
      : record.name.toLowerCase();
  const reservation = deps.readReservation(canonical);
  if (!nameReservationHeldByCharacter(reservation, record.characterId, authenticatedUserId)) {
    throw new Error("reservation_mismatch");
  }
  const next = cloneStoredCharacter(record);
  next.deletedAt = 0;
  next.softDeleteExpiresAt = 0;
  next.status = CHARACTER_STATUS_ACTIVE;
  next.updatedAt = nowMs;
  const location = deps.readLocation !== undefined ? deps.readLocation(authenticatedUserId, record.characterId) : null;
  if (location === null || location.zoneTemplateId.length === 0) {
    next.zoneId = deps.zone.id;
    next.position = { x: deps.zone.playerSpawn.x, y: deps.zone.playerSpawn.y };
  }
  deps.writeCharacter(authenticatedUserId, next);
  return characterListEntry(next, authenticatedUserId, deps);
}

export function handleCharacterPurge(
  userId: string | undefined,
  payload: string,
  deps: CharacterLifecycleDeps,
): { characterId: string; purged: boolean } {
  const authenticatedUserId = requireAuthenticatedUserId(userId);
  const request = parseCharacterIdRequest(payload);
  migrateLegacyCharacterIntoRoster(authenticatedUserId, deps);
  const record = ownedCharacter(authenticatedUserId, request.characterId, deps);
  const nowMs = deps.nowMs();
  const expires = record.softDeleteExpiresAt !== undefined ? record.softDeleteExpiresAt : 0;
  if (!isDeleted(record.deletedAt) && record.status !== CHARACTER_STATUS_PURGED) {
    throw new Error("character_not_deleted");
  }
  if (record.status !== CHARACTER_STATUS_PURGED && expires > 0 && nowMs < expires) {
    throw new Error("retention_active");
  }
  runCharacterPurge(authenticatedUserId, record, deps);
  return { characterId: record.characterId, purged: true };
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

function purgeExpiredCharacters(userId: string, deps: CharacterLifecycleDeps): void {
  const roster = deps.readRoster(userId);
  if (roster === null) {
    return;
  }
  const nowMs = deps.nowMs();
  for (let i = 0; i < roster.characterIds.length; i++) {
    const record = deps.readCharacter(userId, roster.characterIds[i]);
    if (record === null || !isDeleted(record.deletedAt)) {
      continue;
    }
    const expires = record.softDeleteExpiresAt !== undefined ? record.softDeleteExpiresAt : 0;
    if (expires > 0 && nowMs >= expires) {
      runCharacterPurge(userId, record, deps);
    }
  }
}

export function runCharacterPurge(userId: string, record: StoredCharacter, deps: CharacterLifecycleDeps): void {
  const nowMs = deps.nowMs();
  let job =
    deps.readPurgeJob !== undefined ? deps.readPurgeJob(userId, record.characterId) : null;
  if (job === null) {
    job = emptyPurgeJob(record.characterId, userId, nowMs);
  }
  for (let i = 0; i < PURGE_STEPS.length; i++) {
    const step = PURGE_STEPS[i];
    if (job.completedSteps.indexOf(step) !== -1) {
      continue;
    }
    if (step === "reservation") {
      const canonical =
        record.canonicalName !== undefined && record.canonicalName.length > 0
          ? record.canonicalName
          : record.name.toLowerCase();
      if (deps.deleteReservation !== undefined) {
        deps.deleteReservation(canonical);
      }
    } else if (step === "roster") {
      const roster = deps.readRoster(userId);
      if (roster !== null) {
        const ids: string[] = [];
        for (let r = 0; r < roster.characterIds.length; r++) {
          if (roster.characterIds[r] !== record.characterId) {
            ids.push(roster.characterIds[r]);
          }
        }
        deps.writeRoster(userId, {
          characterIds: ids,
          schemaVersion: roster.schemaVersion,
          createdAt: roster.createdAt,
          updatedAt: nowMs,
        });
      }
    } else if (step === "character") {
      const next = cloneStoredCharacter(record);
      next.status = CHARACTER_STATUS_PURGED;
      next.updatedAt = nowMs;
      deps.writeCharacter(userId, next);
      if (deps.deleteCharacterRecord !== undefined) {
        deps.deleteCharacterRecord(userId, record.characterId);
      }
    } else if (deps.applyPurgeStep !== undefined) {
      deps.applyPurgeStep(userId, record, step);
    }
    job = withCompletedPurgeStep(job, step, nowMs);
    if (deps.writePurgeJob !== undefined) {
      deps.writePurgeJob(userId, job);
    }
  }
  if (deps.deletePurgeJob !== undefined) {
    deps.deletePurgeJob(userId, record.characterId);
  }
}

function firstLive(records: StoredCharacter[]): StoredCharacter | null {
  for (let i = 0; i < records.length; i++) {
    if (!isDeleted(records[i].deletedAt) && records[i].status !== CHARACTER_STATUS_PURGED) {
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

function firstString(data: { [key: string]: unknown }, keys: string[]): string | null {
  for (let i = 0; i < keys.length; i++) {
    const value = data[keys[i]];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
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
