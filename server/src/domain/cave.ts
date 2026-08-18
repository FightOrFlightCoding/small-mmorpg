import { distance, findNpc, type InteractionNpc } from "./interaction";
import {
  CAVE_EMPTY_TIMEOUT_SEC,
  CAVE_SCHEMA_VERSION,
  CAVE_WIPE_DELAY_SEC,
  CAVE_ZONE_ID,
  emptyCaveRecord,
  type CaveCharacterAssociation,
  type CaveCompletionState,
  type CaveLifecycleState,
  type CaveOwnerIndex,
  type CaveRecord,
} from "./instance";
import { dict } from "./maps";
import type { MatchPlayer, StarterZoneState } from "./match_state";
import { findNpcService, type NpcDefinition } from "./npc";
import type { PartyIndex, PartyRecord } from "./party";
import { resetBoss } from "./boss";
import { resetSpawnGroup } from "./spawn_controller";

export const CAVE_COLLECTION = "cave";
export const CAVE_KEY = "c";
export const CAVE_OWNER_COLLECTION = "cave_index";
export const CAVE_OWNER_KEY = "owner";
export const PLAYER_CAVE_KEY = "cave";
export const PLAYER_LOCATION_KEY = "location";
export const TRANSFER_COLLECTION = "transfer";
export const TRANSFER_KEY = "t";
export const CAVE_PERMISSION_READ = 0;
export const CAVE_PERMISSION_WRITE = 0;

export interface CaveRepository {
  getCave(instanceId: string): CaveRecord | null;
  putCave(record: CaveRecord): void;
  getOwnerIndex(ownerKind: "party" | "character", ownerId: string): CaveOwnerIndex | null;
  putOwnerIndexIfAbsent(index: CaveOwnerIndex): CaveOwnerIndex;
  deleteOwnerIndex(ownerKind: "party" | "character", ownerId: string): void;
  getCharacterAssociation(characterId: string): CaveCharacterAssociation | null;
  putCharacterAssociation(association: CaveCharacterAssociation): void;
  deleteCharacterAssociation(characterId: string): void;
}

export interface CaveMatchFactory {
  create(params: {
    instanceId: string;
    ownerPartyId?: string;
    ownerCharacterId?: string;
    completionState: CaveCompletionState;
  }): string;
  isRunning(matchId: string): boolean;
  contentHash: string;
  nowMs: number;
  newId: () => string;
  emptyTimeoutMs: number;
}

export interface CavePartyLookup {
  getIndex(accountUserId: string, characterId: string): PartyIndex | null;
  getParty(partyId: string): PartyRecord | null;
}

export interface CaveEntryContext {
  accountUserId: string;
  characterId: string;
  health: number;
  x: number;
  y: number;
  npcId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  npcById: { [id: string]: NpcDefinition };
  transferring: boolean;
  originInstanceType: string;
  contentHash: string;
  expectedContentHash: string;
  party: PartyRecord | null;
}

export interface CaveEntryGate {
  ok: boolean;
  code: string;
  message: string;
  ownerKind?: "party" | "character";
  ownerId?: string;
  party?: PartyRecord | null;
}

export interface AllocateCaveResult {
  ok: boolean;
  code: string;
  created?: boolean;
  recovered?: boolean;
  record?: CaveRecord;
}

export interface CaveTransferIntent {
  userId: string;
  characterId: string;
  requestId: string;
  direction: "enter" | "exit";
  npcId: string;
}

export function evaluateCaveEntry(input: CaveEntryContext): CaveEntryGate {
  if (input.contentHash !== input.expectedContentHash) {
    return failGate("content_mismatch", "Content versions do not match.");
  }
  if (input.originInstanceType !== "public_world") {
    return failGate("invalid_origin", "Enter the cave from the public world.");
  }
  if (input.transferring) {
    return failGate("already_transferring", "A transfer is already in progress.");
  }
  if (input.health <= 0) {
    return failGate("player_dead", "You cannot enter while dead.");
  }
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return failGate("invalid_target", "That entrance does not exist.");
  }
  const range = npc.interactionRange !== undefined ? npc.interactionRange : input.interactionRange;
  if (distance(input.x, input.y, npc.x, npc.y) > range) {
    return failGate("out_of_range", "Move closer to the entrance.");
  }
  const service = findNpcService(input.npcById[npc.npcId], "cave_entrance");
  if (service === null) {
    return failGate("invalid_service", "This NPC does not offer cave entry.");
  }
  if (input.party !== null) {
    if (!partyContains(input.party, input.characterId)) {
      return failGate("not_party_member", "You are not in that party.");
    }
    return {
      ok: true,
      code: "ok",
      message: "",
      ownerKind: "party",
      ownerId: input.party.partyId,
      party: input.party,
    };
  }
  return {
    ok: true,
    code: "ok",
    message: "",
    ownerKind: "character",
    ownerId: input.characterId,
    party: null,
  };
}

export function evaluateCaveExit(input: {
  health: number;
  x: number;
  y: number;
  npcId: string;
  npcs: ReadonlyArray<InteractionNpc>;
  interactionRange: number;
  npcById: { [id: string]: NpcDefinition };
  transferring: boolean;
  originInstanceType: string;
}): CaveEntryGate {
  if (input.originInstanceType !== "party_cave") {
    return failGate("invalid_origin", "Leave through the cave exit.");
  }
  if (input.transferring) {
    return failGate("already_transferring", "A transfer is already in progress.");
  }
  if (input.health <= 0) {
    return failGate("player_dead", "You cannot leave while dead.");
  }
  const npc = findNpc(input.npcs, input.npcId);
  if (npc === null) {
    return failGate("invalid_target", "That exit does not exist.");
  }
  const range = npc.interactionRange !== undefined ? npc.interactionRange : input.interactionRange;
  if (distance(input.x, input.y, npc.x, npc.y) > range) {
    return failGate("out_of_range", "Move closer to the exit.");
  }
  const service = findNpcService(input.npcById[npc.npcId], "cave_exit");
  if (service === null) {
    return failGate("invalid_service", "This NPC does not offer cave exit.");
  }
  return { ok: true, code: "ok", message: "" };
}

export function canJoinOwnedCave(input: {
  characterId: string;
  record: CaveRecord;
  party: PartyRecord | null;
}): { ok: boolean; code: string } {
  if (input.record.lifecycleState === "expired" || input.record.lifecycleState === "terminated") {
    return { ok: false, code: "cave_expired" };
  }
  if (input.record.ownerCharacterId !== undefined && input.record.ownerCharacterId.length > 0) {
    if (input.record.ownerCharacterId !== input.characterId) {
      return { ok: false, code: "not_cave_owner" };
    }
    return { ok: true, code: "ok" };
  }
  if (input.record.ownerPartyId !== undefined && input.record.ownerPartyId.length > 0) {
    if (input.party === null || input.party.partyId !== input.record.ownerPartyId) {
      return { ok: false, code: "not_party_member" };
    }
    if (!partyContains(input.party, input.characterId)) {
      return { ok: false, code: "not_party_member" };
    }
    return { ok: true, code: "ok" };
  }
  return { ok: false, code: "not_cave_owner" };
}

export function findOrCreateOwnedCave(
  repo: CaveRepository,
  factory: CaveMatchFactory,
  input: {
    characterId: string;
    ownerKind: "party" | "character";
    ownerId: string;
    party: PartyRecord | null;
  },
): AllocateCaveResult {
  const association = repo.getCharacterAssociation(input.characterId);
  if (association !== null) {
    const associated = repo.getCave(association.instanceId);
    if (associated !== null && associated.lifecycleState !== "expired" && associated.lifecycleState !== "terminated") {
      const allowed = canJoinOwnedCave({ characterId: input.characterId, record: associated, party: input.party });
      if (!allowed.ok) {
        return { ok: false, code: allowed.code };
      }
      return recoverOrReturn(repo, factory, associated);
    }
    repo.deleteCharacterAssociation(input.characterId);
  }
  const existingIndex = repo.getOwnerIndex(input.ownerKind, input.ownerId);
  if (existingIndex !== null) {
    const existing = repo.getCave(existingIndex.instanceId);
    if (existing !== null && existing.lifecycleState !== "expired" && existing.lifecycleState !== "terminated") {
      const allowed = canJoinOwnedCave({ characterId: input.characterId, record: existing, party: input.party });
      if (!allowed.ok) {
        return { ok: false, code: allowed.code };
      }
      return recoverOrReturn(repo, factory, existing);
    }
    repo.deleteOwnerIndex(input.ownerKind, input.ownerId);
  }
  const instanceId = factory.newId();
  const claimed = repo.putOwnerIndexIfAbsent({
    schemaVersion: CAVE_SCHEMA_VERSION,
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
    instanceId: instanceId,
  });
  if (claimed.instanceId !== instanceId) {
    const winner = repo.getCave(claimed.instanceId);
    if (winner !== null) {
      const allowed = canJoinOwnedCave({ characterId: input.characterId, record: winner, party: input.party });
      if (!allowed.ok) {
        return { ok: false, code: allowed.code };
      }
      return recoverOrReturn(repo, factory, winner);
    }
    return { ok: false, code: "instance_not_ready" };
  }
  const matchId = factory.create({
    instanceId: claimed.instanceId,
    ownerPartyId: input.ownerKind === "party" ? input.ownerId : undefined,
    ownerCharacterId: input.ownerKind === "character" ? input.ownerId : undefined,
    completionState: "none",
  });
  const record = emptyCaveRecord({
    instanceId: claimed.instanceId,
    matchId: matchId,
    ownerPartyId: input.ownerKind === "party" ? input.ownerId : undefined,
    ownerCharacterId: input.ownerKind === "character" ? input.ownerId : undefined,
    contentVersion: factory.contentHash,
    nowMs: factory.nowMs,
    emptyTimeoutMs: factory.emptyTimeoutMs,
  });
  repo.putCave(record);
  repo.putCharacterAssociation({
    schemaVersion: CAVE_SCHEMA_VERSION,
    characterId: input.characterId,
    instanceId: record.instanceId,
  });
  return { ok: true, code: "ok", created: true, record: record };
}

export function associateCharacterWithCave(repo: CaveRepository, characterId: string, instanceId: string): { ok: boolean; code: string } {
  const existing = repo.getCharacterAssociation(characterId);
  if (existing !== null && existing.instanceId !== instanceId) {
    const other = repo.getCave(existing.instanceId);
    if (other !== null && other.lifecycleState !== "expired" && other.lifecycleState !== "terminated") {
      return { ok: false, code: "cave_already_associated" };
    }
  }
  repo.putCharacterAssociation({
    schemaVersion: CAVE_SCHEMA_VERSION,
    characterId: characterId,
    instanceId: instanceId,
  });
  return { ok: true, code: "ok" };
}

export function clearCharacterCaveAssociation(repo: CaveRepository, characterId: string, instanceId: string): void {
  const existing = repo.getCharacterAssociation(characterId);
  if (existing !== null && existing.instanceId === instanceId) {
    repo.deleteCharacterAssociation(characterId);
  }
}

export function expireCave(repo: CaveRepository, record: CaveRecord, nowMs: number): CaveRecord {
  const next: CaveRecord = {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: record.matchId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt,
    expiresAt: nowMs,
    lifecycleState: "expired",
    contentVersion: record.contentVersion,
    completionState: record.completionState,
    schemaVersion: record.schemaVersion,
  };
  repo.putCave(next);
  if (record.ownerPartyId !== undefined && record.ownerPartyId.length > 0) {
    repo.deleteOwnerIndex("party", record.ownerPartyId);
  }
  if (record.ownerCharacterId !== undefined && record.ownerCharacterId.length > 0) {
    repo.deleteOwnerIndex("character", record.ownerCharacterId);
    repo.deleteCharacterAssociation(record.ownerCharacterId);
  }
  return next;
}

export function terminateCave(repo: CaveRepository, record: CaveRecord, nowMs: number): CaveRecord {
  const next: CaveRecord = {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: record.matchId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    createdAt: record.createdAt,
    lastActiveAt: record.lastActiveAt,
    expiresAt: nowMs,
    lifecycleState: "terminated",
    contentVersion: record.contentVersion,
    completionState: record.completionState,
    schemaVersion: record.schemaVersion,
  };
  repo.putCave(next);
  if (record.ownerPartyId !== undefined && record.ownerPartyId.length > 0) {
    repo.deleteOwnerIndex("party", record.ownerPartyId);
  }
  if (record.ownerCharacterId !== undefined && record.ownerCharacterId.length > 0) {
    repo.deleteOwnerIndex("character", record.ownerCharacterId);
    repo.deleteCharacterAssociation(record.ownerCharacterId);
  }
  return next;
}

export function markCaveEmptyGrace(record: CaveRecord, nowMs: number, emptyTimeoutMs: number): CaveRecord {
  return {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: record.matchId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    createdAt: record.createdAt,
    lastActiveAt: nowMs,
    expiresAt: nowMs + emptyTimeoutMs,
    lifecycleState: "empty_grace",
    contentVersion: record.contentVersion,
    completionState: record.completionState,
    schemaVersion: record.schemaVersion,
  };
}

export function markCaveActive(record: CaveRecord, nowMs: number, emptyTimeoutMs: number): CaveRecord {
  return {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: record.matchId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    createdAt: record.createdAt,
    lastActiveAt: nowMs,
    expiresAt: nowMs + emptyTimeoutMs,
    lifecycleState: "active",
    contentVersion: record.contentVersion,
    completionState: record.completionState,
    schemaVersion: record.schemaVersion,
  };
}

export function setCaveCompletion(record: CaveRecord, completionState: CaveCompletionState, nowMs: number): CaveRecord {
  return {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: record.matchId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    createdAt: record.createdAt,
    lastActiveAt: nowMs,
    expiresAt: record.expiresAt,
    lifecycleState: record.lifecycleState,
    contentVersion: record.contentVersion,
    completionState: completionState,
    schemaVersion: record.schemaVersion,
  };
}

export function expirePartyOwnedCave(repo: CaveRepository, partyId: string, nowMs: number): { released: boolean } {
  const index = repo.getOwnerIndex("party", partyId);
  if (index === null) {
    return { released: false };
  }
  const record = repo.getCave(index.instanceId);
  if (record === null) {
    repo.deleteOwnerIndex("party", partyId);
    return { released: false };
  }
  expireCave(repo, record, nowMs);
  return { released: true };
}

export function caveRecordFromStorage(value: { [key: string]: unknown } | null | undefined): CaveRecord | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.instanceId !== "string" || typeof value.zoneTemplateId !== "string") {
    return null;
  }
  if (typeof value.matchId !== "string") {
    return null;
  }
  const lifecycleState = parseLifecycle(value.lifecycleState);
  const completionState = parseCompletion(value.completionState);
  const record: CaveRecord = {
    instanceId: value.instanceId,
    zoneTemplateId: value.zoneTemplateId,
    matchId: value.matchId,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    lastActiveAt: typeof value.lastActiveAt === "number" ? value.lastActiveAt : 0,
    expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : 0,
    lifecycleState: lifecycleState,
    contentVersion: typeof value.contentVersion === "string" ? value.contentVersion : "",
    completionState: completionState,
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : CAVE_SCHEMA_VERSION,
  };
  if (typeof value.ownerPartyId === "string" && value.ownerPartyId.length > 0) {
    record.ownerPartyId = value.ownerPartyId;
  }
  if (typeof value.ownerCharacterId === "string" && value.ownerCharacterId.length > 0) {
    record.ownerCharacterId = value.ownerCharacterId;
  }
  return record;
}

export function applyCaveWipeIfNeeded(state: StarterZoneState, tick: number, tickRate: number): boolean {
  if (state.instanceType !== "party_cave") {
    return false;
  }
  const players = dict(state.players);
  const ids = Object.keys(players);
  if (ids.length === 0) {
    state.wipeResetAtTick = 0;
    return false;
  }
  let anyAlive = false;
  for (let i = 0; i < ids.length; i++) {
    if (players[ids[i]].health > 0) {
      anyAlive = true;
      break;
    }
  }
  if (anyAlive) {
    state.wipeResetAtTick = 0;
    return false;
  }
  const delay = tickRate * CAVE_WIPE_DELAY_SEC;
  if (state.wipeResetAtTick === undefined || state.wipeResetAtTick === 0) {
    state.wipeResetAtTick = tick + delay;
    return false;
  }
  if (tick < state.wipeResetAtTick) {
    return false;
  }
  resetCaveEncounter(state);
  respawnCavePlayers(state, players, ids);
  state.wipeResetAtTick = 0;
  return true;
}

export function markCaveBossDefeated(state: StarterZoneState): boolean {
  if (state.instanceType !== "party_cave") {
    return false;
  }
  if (state.completionState === "boss_defeated") {
    return false;
  }
  state.completionState = "boss_defeated";
  return true;
}

export function applyPersistedCaveCompletion(state: StarterZoneState): void {
  if (state.instanceType !== "party_cave" || state.completionState !== "boss_defeated") {
    return;
  }
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    const tags = enemy.tags !== undefined ? enemy.tags : [];
    if (tags.indexOf("boss") === -1) {
      continue;
    }
    enemy.health = 0;
    enemy.aiState = "dead";
    enemy.deadUntilTick = 0;
    enemy.aggroTarget = "";
  }
}

export function resolvePartyForActor(
  lookup: CavePartyLookup,
  accountUserId: string,
  characterId: string,
): PartyRecord | null {
  const index = lookup.getIndex(accountUserId, characterId);
  if (index === null || index.partyId.length === 0) {
    return null;
  }
  const party = lookup.getParty(index.partyId);
  if (party === null) {
    return null;
  }
  if (!partyContains(party, characterId)) {
    return null;
  }
  return party;
}

export function emptyTimeoutMs(): number {
  return CAVE_EMPTY_TIMEOUT_SEC * 1000;
}

function recoverOrReturn(repo: CaveRepository, factory: CaveMatchFactory, record: CaveRecord): AllocateCaveResult {
  if (factory.contentHash !== record.contentVersion && record.contentVersion.length > 0) {
    return { ok: false, code: "content_mismatch" };
  }
  if (factory.isRunning(record.matchId)) {
    return { ok: true, code: "ok", created: false, record: record };
  }
  if (factory.nowMs > record.expiresAt || record.lifecycleState === "expired" || record.lifecycleState === "terminated") {
    expireCave(repo, record, factory.nowMs);
    return { ok: false, code: "cave_expired" };
  }
  const matchId = factory.create({
    instanceId: record.instanceId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    completionState: record.completionState,
  });
  const recovered: CaveRecord = {
    instanceId: record.instanceId,
    zoneTemplateId: record.zoneTemplateId,
    matchId: matchId,
    ownerPartyId: record.ownerPartyId,
    ownerCharacterId: record.ownerCharacterId,
    createdAt: record.createdAt,
    lastActiveAt: factory.nowMs,
    expiresAt: factory.nowMs + factory.emptyTimeoutMs,
    lifecycleState: "empty_grace",
    contentVersion: factory.contentHash,
    completionState: record.completionState,
    schemaVersion: record.schemaVersion,
  };
  repo.putCave(recovered);
  return { ok: true, code: "ok", created: false, recovered: true, record: recovered };
}

function resetCaveEncounter(state: StarterZoneState): void {
  const seen: { [groupId: string]: boolean } = {};
  for (let i = 0; i < state.spawns.length; i++) {
    const groupId = state.spawns[i].groupId;
    if (seen[groupId] === true) {
      continue;
    }
    seen[groupId] = true;
    if (state.completionState === "boss_defeated" && isBossGroup(state, groupId)) {
      continue;
    }
    resetSpawnGroup(state, groupId, dict(state.enemiesById));
  }
  if (state.completionState !== "boss_defeated") {
    for (let e = 0; e < state.enemies.length; e++) {
      const enemy = state.enemies[e];
      const tags = enemy.tags !== undefined ? enemy.tags : [];
      if (tags.indexOf("boss") !== -1 && enemy.health > 0) {
        resetBoss(state, enemy, []);
      }
    }
  }
}

function isBossGroup(state: StarterZoneState, groupId: string): boolean {
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy.spawnId === undefined) {
      continue;
    }
    const tags = enemy.tags !== undefined ? enemy.tags : [];
    if (tags.indexOf("boss") === -1) {
      continue;
    }
    for (let s = 0; s < state.spawns.length; s++) {
      if (state.spawns[s].spawnId === enemy.spawnId && state.spawns[s].groupId === groupId) {
        return true;
      }
    }
  }
  return false;
}

function respawnCavePlayers(state: StarterZoneState, players: { [userId: string]: MatchPlayer }, ids: string[]): void {
  for (let i = 0; i < ids.length; i++) {
    const player = players[ids[i]];
    player.x = state.playerSpawnX;
    player.y = state.playerSpawnY;
    player.health = player.maxHealth;
    player.deadUntilTick = 0;
    player.axisX = 0;
    player.axisY = 0;
    player.inCombat = false;
    player.hostileTargetId = "";
    player.activeCast = undefined;
    player.effects = [];
  }
}

function partyContains(party: PartyRecord, characterId: string): boolean {
  for (let i = 0; i < party.members.length; i++) {
    if (party.members[i].characterId === characterId) {
      return true;
    }
  }
  return false;
}

function failGate(code: string, message: string): CaveEntryGate {
  return { ok: false, code: code, message: message };
}

function parseLifecycle(value: unknown): CaveLifecycleState {
  if (value === "active" || value === "empty_grace" || value === "expired" || value === "terminated") {
    return value;
  }
  return "active";
}

function parseCompletion(value: unknown): CaveCompletionState {
  if (value === "none" || value === "in_progress" || value === "boss_defeated") {
    return value;
  }
  return "none";
}

export function caveZoneId(): string {
  return CAVE_ZONE_ID;
}

export function memoryCaveRepository(): CaveRepository & {
  caves: { [id: string]: CaveRecord };
  owners: { [key: string]: CaveOwnerIndex };
  associations: { [characterId: string]: CaveCharacterAssociation };
} {
  const caves: { [id: string]: CaveRecord } = {};
  const owners: { [key: string]: CaveOwnerIndex } = {};
  const associations: { [characterId: string]: CaveCharacterAssociation } = {};
  return {
    caves: caves,
    owners: owners,
    associations: associations,
    getCave: function (instanceId: string): CaveRecord | null {
      return caves[instanceId] !== undefined ? caves[instanceId] : null;
    },
    putCave: function (record: CaveRecord): void {
      caves[record.instanceId] = record;
    },
    getOwnerIndex: function (ownerKind: "party" | "character", ownerId: string): CaveOwnerIndex | null {
      const key = ownerKind + ":" + ownerId;
      return owners[key] !== undefined ? owners[key] : null;
    },
    putOwnerIndexIfAbsent: function (index: CaveOwnerIndex): CaveOwnerIndex {
      const key = index.ownerKind + ":" + index.ownerId;
      if (owners[key] !== undefined) {
        return owners[key];
      }
      owners[key] = index;
      return index;
    },
    deleteOwnerIndex: function (ownerKind: "party" | "character", ownerId: string): void {
      delete owners[ownerKind + ":" + ownerId];
    },
    getCharacterAssociation: function (characterId: string): CaveCharacterAssociation | null {
      return associations[characterId] !== undefined ? associations[characterId] : null;
    },
    putCharacterAssociation: function (association: CaveCharacterAssociation): void {
      associations[association.characterId] = association;
    },
    deleteCharacterAssociation: function (characterId: string): void {
      delete associations[characterId];
    },
  };
}
