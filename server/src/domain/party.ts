import { releaseCaveOwnershipForDisbandedParty } from "./cave_ownership";
import { REQUEST_ID_PATTERN } from "./protocol";

export const MAX_PARTY_SIZE = 5;
export const PARTY_SCHEMA_VERSION = 1;
export const INVITE_TTL_MS = 60000;
export const PARTY_DISCONNECT_GRACE_MS = 60000;
export const PARTY_IDLE_TTL_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_CREDIT_RANGE_PX = 512;
export const RECENTLY_ACTIVE_AFTER_DEATH_MS = 15000;
export const DEFAULT_XP_FORMULA = "full";
export const DEFAULT_LOOT_POLICY = "personal";
export const PARTY_CHAT_PREFIX = "party.";
export const PARTY_COLLECTION = "party";
export const PARTY_KEY = "p";
export const PLAYER_PARTY_KEY = "party";
export const PARTY_PERMISSION_READ = 1;
export const PARTY_PERMISSION_WRITE = 0;

export type PartyConnectionState = "online" | "disconnect_grace" | "offline";
export type PartyLootPolicy = "personal" | "server_assigned";
export type PartyXpFormula = "full" | "split";

export interface PartyMember {
  accountUserId: string;
  characterId: string;
  displayName: string;
  joinedAt: number;
  connectionState: PartyConnectionState;
  lastSeenAt: number;
}

export interface PartyInvite {
  targetCharacterId: string;
  targetAccountUserId: string;
  targetDisplayName: string;
  invitedByCharacterId: string;
  createdAt: number;
  expiresAt: number;
  requestId: string;
}

export interface PartyRecord {
  partyId: string;
  leaderCharacterId: string;
  members: PartyMember[];
  invites: PartyInvite[];
  revision: number;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
  schemaVersion: number;
  byRequestId: { [requestId: string]: { op: string; code: string } };
  lootPolicy: PartyLootPolicy;
  allAbsentSince?: number;
}

export interface PartyIndex {
  schemaVersion: number;
  characterId: string;
  partyId: string;
  pendingPartyId: string;
}

export interface PartyActor {
  accountUserId: string;
  characterId: string;
  displayName: string;
}

export interface PartyOpResult {
  ok: boolean;
  code: string;
  replay?: boolean;
  party?: PartyRecord;
  partyId?: string;
  deleted?: boolean;
  systemMessage?: string;
  eventType?: string;
}

export interface PartyRepository {
  getParty(partyId: string): PartyRecord | null;
  putParty(party: PartyRecord): void;
  deleteParty(partyId: string): void;
  getIndex(accountUserId: string, characterId: string): PartyIndex | null;
  putIndex(accountUserId: string, index: PartyIndex): void;
  deleteIndex(accountUserId: string, characterId: string): void;
}

export interface GroupCreditRules {
  rangePx: number;
  recentlyActiveAfterDeathMs: number;
  xpFormula: PartyXpFormula;
  defaultLootPolicy: PartyLootPolicy;
}

export function defaultGroupCreditRules(): GroupCreditRules {
  return {
    rangePx: DEFAULT_CREDIT_RANGE_PX,
    recentlyActiveAfterDeathMs: RECENTLY_ACTIVE_AFTER_DEATH_MS,
    xpFormula: DEFAULT_XP_FORMULA,
    defaultLootPolicy: DEFAULT_LOOT_POLICY,
  };
}

export function groupCreditRulesFromPlayer(player: {
  groupCredit?: {
    rangePx?: number;
    recentlyActiveAfterDeathSec?: number;
    xpFormula?: string;
    defaultLootPolicy?: string;
  };
}): GroupCreditRules {
  const rules = defaultGroupCreditRules();
  const source = player.groupCredit;
  if (source === undefined) {
    return rules;
  }
  if (typeof source.rangePx === "number" && isFinite(source.rangePx) && source.rangePx > 0) {
    rules.rangePx = source.rangePx;
  }
  if (
    typeof source.recentlyActiveAfterDeathSec === "number" &&
    isFinite(source.recentlyActiveAfterDeathSec) &&
    source.recentlyActiveAfterDeathSec >= 0
  ) {
    rules.recentlyActiveAfterDeathMs = Math.floor(source.recentlyActiveAfterDeathSec * 1000);
  }
  if (source.xpFormula === "split" || source.xpFormula === "full") {
    rules.xpFormula = source.xpFormula;
  }
  if (source.defaultLootPolicy === "personal" || source.defaultLootPolicy === "server_assigned") {
    rules.defaultLootPolicy = source.defaultLootPolicy;
  }
  return rules;
}

export function partyChatRoom(partyId: string): string {
  return PARTY_CHAT_PREFIX + partyId;
}

export function partyIdFromChatRoom(target: string): string {
  if (target.indexOf(PARTY_CHAT_PREFIX) !== 0) {
    return "";
  }
  return target.substring(PARTY_CHAT_PREFIX.length);
}

export function emptyPartyIndex(characterId: string): PartyIndex {
  return {
    schemaVersion: PARTY_SCHEMA_VERSION,
    characterId: characterId,
    partyId: "",
    pendingPartyId: "",
  };
}

const PARTY_DOMAIN_FAILURE_CODES = [
  "already_in_party",
  "character_missing",
  "duplicate_invite",
  "duplicate_request",
  "invite_expired",
  "invite_missing",
  "invite_pending",
  "invalid_id",
  "invalid_request_id",
  "invalid_target",
  "malformed_json",
  "not_in_party",
  "not_leader",
  "not_member",
  "party_failed",
  "party_full",
  "party_missing",
  "rate_limited",
  "revision_mismatch",
  "selection_foreign",
  "stale_revision",
  "unauthenticated",
];

export function partyDomainFailureCode(message: string): string {
  if (message.indexOf("unknown_field:") === 0 || message.indexOf("stat_injection:") === 0) {
    return message;
  }
  if (PARTY_DOMAIN_FAILURE_CODES.indexOf(message) !== -1) {
    return message;
  }
  return "";
}

export function partyRecordFromStorage(value: unknown): PartyRecord | null {
  let data: unknown = value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const row = data as { [key: string]: unknown };
  if (row.expired === true) {
    return null;
  }
  if (typeof row.partyId !== "string" || row.partyId.length === 0) {
    return null;
  }
  if (typeof row.leaderCharacterId !== "string" || row.leaderCharacterId.length === 0) {
    return null;
  }
  const members = parseStoredMembers(row.members);
  if (members.length === 0) {
    return null;
  }
  const invites = parseStoredInvites(row.invites);
  const createdAt = finiteNumber(row.createdAt, 0);
  const lastActiveAt = finiteNumber(row.lastActiveAt, createdAt);
  const parsed: PartyRecord = {
    partyId: row.partyId,
    leaderCharacterId: row.leaderCharacterId,
    members: members,
    invites: invites,
    revision: Math.max(1, Math.floor(finiteNumber(row.revision, 1))),
    createdAt: createdAt,
    lastActiveAt: lastActiveAt,
    expiresAt: finiteNumber(row.expiresAt, lastActiveAt + PARTY_IDLE_TTL_MS),
    schemaVersion: finiteNumber(row.schemaVersion, PARTY_SCHEMA_VERSION),
    byRequestId: parseStoredByRequestId(row.byRequestId),
    lootPolicy: row.lootPolicy === "server_assigned" ? "server_assigned" : DEFAULT_LOOT_POLICY,
  };
  const absentSince = positiveNumber(row.allAbsentSince);
  if (absentSince !== undefined) {
    parsed.allAbsentSince = absentSince;
  }
  return parsed;
}

export function memoryPartyRepository(): PartyRepository {
  const parties: { [partyId: string]: PartyRecord } = {};
  const indexes: { [key: string]: PartyIndex } = {};
  return {
    getParty: function (partyId: string): PartyRecord | null {
      const row = parties[partyId];
      return row !== undefined ? cloneParty(row) : null;
    },
    putParty: function (party: PartyRecord): void {
      parties[party.partyId] = cloneParty(party);
    },
    deleteParty: function (partyId: string): void {
      delete parties[partyId];
    },
    getIndex: function (accountUserId: string, characterId: string): PartyIndex | null {
      const row = indexes[indexKey(accountUserId, characterId)];
      return row !== undefined ? cloneIndex(row) : null;
    },
    putIndex: function (accountUserId: string, index: PartyIndex): void {
      indexes[indexKey(accountUserId, index.characterId)] = cloneIndex(index);
    },
    deleteIndex: function (accountUserId: string, characterId: string): void {
      delete indexes[indexKey(accountUserId, characterId)];
    },
  };
}

export function createParty(
  repo: PartyRepository,
  actor: PartyActor,
  nowMs: number,
  partyId: string,
  requestId: string,
  lootPolicy: PartyLootPolicy = DEFAULT_LOOT_POLICY,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  const existing = loadMembershipParty(repo, actor);
  if (existing !== null) {
    const replay = replayRequest(existing, requestId, "create");
    if (replay !== null) {
      return replay;
    }
    return fail("already_in_party");
  }
  abandonPendingInvite(repo, actor, nowMs);
  const party: PartyRecord = {
    partyId: partyId,
    leaderCharacterId: actor.characterId,
    members: [memberFromActor(actor, nowMs, "online")],
    invites: [],
    revision: 1,
    createdAt: nowMs,
    lastActiveAt: nowMs,
    expiresAt: nowMs + PARTY_IDLE_TTL_MS,
    schemaVersion: PARTY_SCHEMA_VERSION,
    byRequestId: {},
    lootPolicy: lootPolicy,
  };
  rememberRequest(party, requestId, "create", "ok");
  saveParty(repo, party, false);
  writeMemberIndex(repo, actor.accountUserId, actor.characterId, party.partyId, "");
  return ok(party, "ok", false, actor.displayName + " formed a party.");
}

export function inviteToParty(
  repo: PartyRepository,
  actor: PartyActor,
  target: PartyActor,
  nowMs: number,
  requestId: string,
  expectedRevision?: number,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  if (target.characterId === actor.characterId) {
    return fail("invalid_target");
  }
  const loaded = requireLeaderParty(repo, actor, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "invite");
  if (replay !== null) {
    return replay;
  }
  if (livingMemberCount(party) >= MAX_PARTY_SIZE) {
    return fail("party_full");
  }
  if (findMember(party, target.characterId) !== null) {
    return fail("already_in_party");
  }
  const targetParty = loadMembershipParty(repo, target);
  const existingInvite = findInvite(party, target.characterId);
  if (existingInvite !== null && existingInvite.expiresAt > nowMs) {
    return fail("duplicate_invite");
  }
  const targetIndex = repo.getIndex(target.accountUserId, target.characterId);
  if (targetIndex !== null && targetIndex.pendingPartyId.length > 0 && targetIndex.pendingPartyId !== party.partyId) {
    const pending = repo.getParty(targetIndex.pendingPartyId);
    if (pending !== null && findInvite(pending, target.characterId) !== null) {
      expireInvites(pending, nowMs);
      if (findInvite(pending, target.characterId) !== null) {
        return fail("invite_pending");
      }
    }
  }
  party.invites = party.invites.filter(function (row) {
    return row.targetCharacterId !== target.characterId;
  });
  party.invites.push({
    targetCharacterId: target.characterId,
    targetAccountUserId: target.accountUserId,
    targetDisplayName: target.displayName,
    invitedByCharacterId: actor.characterId,
    createdAt: nowMs,
    expiresAt: nowMs + INVITE_TTL_MS,
    requestId: requestId,
  });
  bumpActivity(party, nowMs);
  rememberRequest(party, requestId, "invite", "ok");
  saveParty(repo, party, true);
  writeMemberIndex(
    repo,
    target.accountUserId,
    target.characterId,
    targetParty !== null ? targetParty.partyId : "",
    party.partyId,
  );
  return ok(party, "ok", false, undefined, "invite");
}

export function acceptPartyInvite(
  repo: PartyRepository,
  actor: PartyActor,
  partyId: string,
  nowMs: number,
  requestId: string,
  expectedRevision?: number,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  const current = loadMembershipParty(repo, actor);
  if (current !== null && current.partyId === partyId) {
    const replay = replayRequest(current, requestId, "accept");
    if (replay !== null) {
      return replay;
    }
    return ok(current, "ok");
  }
  if (current !== null) {
    detachActorFromParty(repo, current, actor, nowMs);
  }
  const snapshot = repo.getParty(partyId);
  if (snapshot === null) {
    return fail("party_missing");
  }
  const pending = findInvite(snapshot, actor.characterId);
  if (pending !== null && pending.expiresAt <= nowMs) {
    expireParty(repo, snapshot, nowMs);
    clearPendingIndex(repo, actor);
    return fail("invite_expired");
  }
  const loaded = loadPartyForMutation(repo, partyId, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "accept");
  if (replay !== null) {
    return replay;
  }
  const invite = findInvite(party, actor.characterId);
  if (invite === null) {
    return fail("invite_missing");
  }
  if (invite.expiresAt <= nowMs) {
    party.invites = party.invites.filter(function (row) {
      return row.targetCharacterId !== actor.characterId;
    });
    saveParty(repo, party, true);
    clearPendingIndex(repo, actor);
    return fail("invite_expired");
  }
  if (livingMemberCount(party) >= MAX_PARTY_SIZE) {
    return fail("party_full");
  }
  party.invites = party.invites.filter(function (row) {
    return row.targetCharacterId !== actor.characterId;
  });
  party.members.push(memberFromActor(actor, nowMs, "online"));
  bumpActivity(party, nowMs);
  rememberRequest(party, requestId, "accept", "ok");
  saveParty(repo, party, true);
  writeMemberIndex(repo, actor.accountUserId, actor.characterId, party.partyId, "");
  return ok(party, "ok", false, actor.displayName + " joined the party.", "member_joined");
}

export function declinePartyInvite(
  repo: PartyRepository,
  actor: PartyActor,
  partyId: string,
  nowMs: number,
  requestId: string,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  const snapshot = repo.getParty(partyId);
  if (snapshot === null) {
    clearPendingIndex(repo, actor);
    return fail("party_missing");
  }
  const pending = findInvite(snapshot, actor.characterId);
  if (pending !== null && pending.expiresAt <= nowMs) {
    expireParty(repo, snapshot, nowMs);
    clearPendingIndex(repo, actor);
    return fail("invite_expired");
  }
  const loaded = loadPartyForMutation(repo, partyId, nowMs);
  if (!loaded.ok || loaded.party === undefined) {
    clearPendingIndex(repo, actor);
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "decline");
  if (replay !== null) {
    return replay;
  }
  const invite = findInvite(party, actor.characterId);
  if (invite === null) {
    clearPendingIndex(repo, actor);
    return fail("invite_missing");
  }
  if (invite.expiresAt <= nowMs) {
    party.invites = party.invites.filter(function (row) {
      return row.targetCharacterId !== actor.characterId;
    });
    saveParty(repo, party, true);
    clearPendingIndex(repo, actor);
    return fail("invite_expired");
  }
  party.invites = party.invites.filter(function (row) {
    return row.targetCharacterId !== actor.characterId;
  });
  bumpActivity(party, nowMs);
  rememberRequest(party, requestId, "decline", "ok");
  saveParty(repo, party, true);
  clearPendingIndex(repo, actor);
  return ok(party, "ok", false, undefined, "invite_declined");
}

export function leaveParty(
  repo: PartyRepository,
  actor: PartyActor,
  nowMs: number,
  requestId: string,
  expectedRevision?: number,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  const loaded = requireMemberParty(repo, actor, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "leave");
  if (replay !== null) {
    return replay;
  }
  return removeMember(repo, party, actor.characterId, nowMs, requestId, "leave", actor.displayName + " left the party.");
}

export function kickPartyMember(
  repo: PartyRepository,
  actor: PartyActor,
  targetCharacterId: string,
  nowMs: number,
  requestId: string,
  expectedRevision?: number,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  if (targetCharacterId === actor.characterId) {
    return fail("invalid_target");
  }
  const loaded = requireLeaderParty(repo, actor, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "kick");
  if (replay !== null) {
    return replay;
  }
  const target = findMember(party, targetCharacterId);
  if (target === null) {
    return fail("invalid_target");
  }
  return removeMember(repo, party, targetCharacterId, nowMs, requestId, "kick", target.displayName + " was removed from the party.");
}

export function promotePartyLeader(
  repo: PartyRepository,
  actor: PartyActor,
  targetCharacterId: string,
  nowMs: number,
  requestId: string,
  expectedRevision?: number,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  const loaded = requireLeaderParty(repo, actor, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "promote");
  if (replay !== null) {
    return replay;
  }
  const target = findMember(party, targetCharacterId);
  if (target === null || target.characterId === party.leaderCharacterId) {
    return fail("invalid_target");
  }
  party.leaderCharacterId = target.characterId;
  bumpActivity(party, nowMs);
  rememberRequest(party, requestId, "promote", "ok");
  saveParty(repo, party, true);
  return ok(party, "ok", false, target.displayName + " is now the party leader.", "promoted");
}

export function disbandParty(
  repo: PartyRepository,
  actor: PartyActor,
  nowMs: number,
  requestId: string,
  expectedRevision?: number,
): PartyOpResult {
  const requestCode = requireRequestId(requestId);
  if (requestCode.length > 0) {
    return fail(requestCode);
  }
  const loaded = requireLeaderParty(repo, actor, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  const party = loaded.party;
  const replay = replayRequest(party, requestId, "disband");
  if (replay !== null) {
    return replay;
  }
  rememberRequest(party, requestId, "disband", "ok");
  return destroyParty(repo, party, "The party has disbanded.");
}

export function getPartyState(repo: PartyRepository, actor: PartyActor, nowMs: number): PartyOpResult {
  const membership = loadMembershipParty(repo, actor);
  if (membership !== null) {
    const expired = expireParty(repo, membership, nowMs);
    if (expired.deleted === true) {
      return { ok: true, code: "ok", party: undefined, deleted: true };
    }
    return ok(expired.party !== undefined ? expired.party : membership, "ok");
  }
  const index = repo.getIndex(actor.accountUserId, actor.characterId);
  if (index !== null && index.pendingPartyId.length > 0) {
    const pending = repo.getParty(index.pendingPartyId);
    if (pending === null) {
      clearPendingIndex(repo, actor);
      return { ok: true, code: "ok" };
    }
    expireInvites(pending, nowMs);
    const invite = findInvite(pending, actor.characterId);
    if (invite === null) {
      clearPendingIndex(repo, actor);
      return { ok: true, code: "ok" };
    }
    return { ok: true, code: "ok", party: pending };
  }
  return { ok: true, code: "ok" };
}

export function markPartyConnection(
  repo: PartyRepository,
  actor: PartyActor,
  nowMs: number,
  connectionState: PartyConnectionState,
): PartyOpResult {
  const loaded = loadMembershipParty(repo, actor);
  if (loaded === null) {
    return { ok: true, code: "ok" };
  }
  const expired = expireParty(repo, loaded, nowMs);
  if (expired.deleted === true || expired.party === undefined) {
    return expired.deleted === true ? expired : { ok: true, code: "ok" };
  }
  const party = expired.party;
  const member = findMember(party, actor.characterId);
  if (member === null) {
    return { ok: true, code: "ok" };
  }
  member.connectionState = connectionState;
  member.lastSeenAt = nowMs;
  if (connectionState === "online") {
    party.allAbsentSince = undefined;
  }
  updateAbsence(party, nowMs);
  saveParty(repo, party, true);
  return expireParty(repo, party, nowMs);
}

export function expireParty(repo: PartyRepository, party: PartyRecord, nowMs: number): PartyOpResult {
  const beforeInvites = party.invites.length;
  const beforeMembers = party.members.length;
  expireInvites(party, nowMs);
  const dropped = dropExpiredDisconnects(party, nowMs);
  for (let i = 0; i < dropped.length; i++) {
    repo.deleteIndex(dropped[i].accountUserId, dropped[i].characterId);
  }
  reconcileGhostMembers(repo, party);
  updateAbsence(party, nowMs);
  if (party.members.length === 0) {
    return destroyParty(repo, party, "The party has disbanded.");
  }
  const absentSince = positiveNumber(party.allAbsentSince);
  if (absentSince !== undefined && nowMs - absentSince >= PARTY_DISCONNECT_GRACE_MS) {
    return destroyParty(repo, party, "The party has disbanded.");
  }
  if (typeof party.expiresAt === "number" && isFinite(party.expiresAt) && nowMs >= party.expiresAt) {
    return destroyParty(repo, party, "The party has disbanded.");
  }
  if (beforeInvites !== party.invites.length || beforeMembers !== party.members.length) {
    saveParty(repo, party, true);
  }
  return ok(party, "ok");
}

export function publicPartyState(
  party: PartyRecord,
  viewerCharacterId: string,
): { [key: string]: unknown } {
  const members: { [key: string]: unknown }[] = [];
  for (let i = 0; i < party.members.length; i++) {
    const member = party.members[i];
    members.push({
      accountUserId: member.accountUserId,
      characterId: member.characterId,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
      connectionState: member.connectionState,
      isLeader: member.characterId === party.leaderCharacterId,
    });
  }
  const payload: { [key: string]: unknown } = {
    partyId: party.partyId,
    leaderCharacterId: party.leaderCharacterId,
    members: members,
    revision: party.revision,
    createdAt: party.createdAt,
    lastActiveAt: party.lastActiveAt,
    expiresAt: party.expiresAt,
    schemaVersion: party.schemaVersion,
    lootPolicy: party.lootPolicy,
    maxSize: MAX_PARTY_SIZE,
    chatRoom: partyChatRoom(party.partyId),
  };
  const invite = findInvite(party, viewerCharacterId);
  if (invite !== null) {
    payload.pendingInvite = {
      partyId: party.partyId,
      fromCharacterId: invite.invitedByCharacterId,
      fromDisplayName: memberDisplayName(party, invite.invitedByCharacterId),
      expiresAt: invite.expiresAt,
    };
  } else if (viewerCharacterId === party.leaderCharacterId) {
    const invites: { [key: string]: unknown }[] = [];
    for (let i = 0; i < party.invites.length; i++) {
      invites.push({
        targetCharacterId: party.invites[i].targetCharacterId,
        targetDisplayName: party.invites[i].targetDisplayName,
        expiresAt: party.invites[i].expiresAt,
      });
    }
    payload.invites = invites;
  }
  return payload;
}

export function parsePartyRpcPayload(
  payload: string,
  allowedKeys: string[],
  requireRequestId: boolean,
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
    if (PARTY_INJECTION_KEYS.indexOf(key) !== -1 && allowedKeys.indexOf(key) === -1) {
      throw new Error("stat_injection:" + key);
    }
    if (allowedKeys.indexOf(key) === -1) {
      throw new Error("unknown_field:" + key);
    }
  }
  if (typeof data.characterId !== "string" || data.characterId.length === 0) {
    throw new Error("invalid_id");
  }
  if (requireRequestId) {
    if (typeof data.requestId !== "string" || !REQUEST_ID_PATTERN.test(data.requestId)) {
      throw new Error("invalid_request_id");
    }
  }
  return data;
}

export function optionalRevision(data: { [key: string]: unknown }): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, "revision")) {
    return undefined;
  }
  if (typeof data.revision !== "number" || !isFinite(data.revision) || data.revision < 1) {
    throw new Error("stale_revision");
  }
  return data.revision;
}

const PARTY_INJECTION_KEYS = [
  "members",
  "memberIds",
  "partyMembers",
  "creditUserIds",
  "lootRecipients",
  "xpRecipients",
  "xp",
  "gold",
  "health",
  "items",
  "damage",
];

function requireRequestId(requestId: string): string {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    return "invalid_request_id";
  }
  return "";
}

function abandonPendingInvite(repo: PartyRepository, actor: PartyActor, nowMs: number): void {
  const index = repo.getIndex(actor.accountUserId, actor.characterId);
  if (index === null || index.pendingPartyId.length === 0) {
    return;
  }
  const pending = repo.getParty(index.pendingPartyId);
  if (pending !== null) {
    const before = pending.invites.length;
    pending.invites = pending.invites.filter(function (row) {
      return row.targetCharacterId !== actor.characterId;
    });
    if (pending.invites.length !== before) {
      bumpActivity(pending, nowMs);
      saveParty(repo, pending, true);
    }
  }
  clearPendingIndex(repo, actor);
}

function detachActorFromParty(repo: PartyRepository, party: PartyRecord, actor: PartyActor, nowMs: number): void {
  const member = findMember(party, actor.characterId);
  if (member === null) {
    return;
  }
  party.members = party.members.filter(function (row) {
    return row.characterId !== actor.characterId;
  });
  repo.deleteIndex(member.accountUserId, member.characterId);
  if (party.members.length === 0) {
    destroyParty(repo, party, actor.displayName + " left the party.");
    return;
  }
  if (party.leaderCharacterId === actor.characterId) {
    party.leaderCharacterId = longestTenured(party).characterId;
  }
  bumpActivity(party, nowMs);
  saveParty(repo, party, true);
}

function reconcileGhostMembers(repo: PartyRepository, party: PartyRecord): boolean {
  const kept: PartyMember[] = [];
  let changed = false;
  for (let i = 0; i < party.members.length; i++) {
    const member = party.members[i];
    const index = repo.getIndex(member.accountUserId, member.characterId);
    if (index === null || index.partyId !== party.partyId) {
      changed = true;
      continue;
    }
    kept.push(member);
  }
  if (!changed) {
    return false;
  }
  party.members = kept;
  if (kept.length === 0) {
    return true;
  }
  let leaderPresent = false;
  for (let i = 0; i < kept.length; i++) {
    if (kept[i].characterId === party.leaderCharacterId) {
      leaderPresent = true;
      break;
    }
  }
  if (!leaderPresent) {
    party.leaderCharacterId = longestTenured(party).characterId;
  }
  return true;
}

function loadMembershipParty(repo: PartyRepository, actor: PartyActor): PartyRecord | null {
  const index = repo.getIndex(actor.accountUserId, actor.characterId);
  if (index === null || index.partyId.length === 0) {
    return null;
  }
  const party = repo.getParty(index.partyId);
  if (party === null || findMember(party, actor.characterId) === null) {
    repo.deleteIndex(actor.accountUserId, actor.characterId);
    return null;
  }
  return party;
}

function requireMemberParty(
  repo: PartyRepository,
  actor: PartyActor,
  nowMs: number,
  expectedRevision?: number,
): PartyOpResult {
  const party = loadMembershipParty(repo, actor);
  if (party === null) {
    return fail("not_in_party");
  }
  return loadPartyForMutation(repo, party.partyId, nowMs, expectedRevision);
}

function requireLeaderParty(
  repo: PartyRepository,
  actor: PartyActor,
  nowMs: number,
  expectedRevision?: number,
): PartyOpResult {
  const loaded = requireMemberParty(repo, actor, nowMs, expectedRevision);
  if (!loaded.ok || loaded.party === undefined) {
    return loaded;
  }
  if (loaded.party.leaderCharacterId !== actor.characterId) {
    return fail("not_leader");
  }
  return loaded;
}

function loadPartyForMutation(
  repo: PartyRepository,
  partyId: string,
  nowMs: number,
  expectedRevision?: number,
): PartyOpResult {
  const party = repo.getParty(partyId);
  if (party === null) {
    return fail("party_missing");
  }
  const expired = expireParty(repo, party, nowMs);
  if (expired.deleted === true) {
    return { ok: false, code: "party_missing", deleted: true, partyId: party.partyId };
  }
  if (expired.party === undefined) {
    return expired;
  }
  if (expectedRevision !== undefined && expectedRevision !== expired.party.revision) {
    return fail("stale_revision");
  }
  return ok(expired.party, "ok");
}

function removeMember(
  repo: PartyRepository,
  party: PartyRecord,
  characterId: string,
  nowMs: number,
  requestId: string,
  op: string,
  systemMessage: string,
): PartyOpResult {
  const member = findMember(party, characterId);
  if (member === null) {
    return fail("invalid_target");
  }
  party.members = party.members.filter(function (row) {
    return row.characterId !== characterId;
  });
  repo.deleteIndex(member.accountUserId, member.characterId);
  if (party.members.length === 0) {
    rememberRequest(party, requestId, op, "ok");
    return destroyParty(repo, party, systemMessage);
  }
  if (party.leaderCharacterId === characterId) {
    party.leaderCharacterId = longestTenured(party).characterId;
  }
  bumpActivity(party, nowMs);
  rememberRequest(party, requestId, op, "ok");
  saveParty(repo, party, true);
  return ok(party, "ok", false, systemMessage, op === "kick" ? "kicked" : "member_left");
}

function destroyParty(repo: PartyRepository, party: PartyRecord, systemMessage: string): PartyOpResult {
  for (let i = 0; i < party.members.length; i++) {
    repo.deleteIndex(party.members[i].accountUserId, party.members[i].characterId);
  }
  for (let i = 0; i < party.invites.length; i++) {
    repo.deleteIndex(party.invites[i].targetAccountUserId, party.invites[i].targetCharacterId);
  }
  repo.deleteParty(party.partyId);
  releaseCaveOwnershipForDisbandedParty(party.partyId);
  return {
    ok: true,
    code: "ok",
    party: undefined,
    partyId: party.partyId,
    deleted: true,
    systemMessage: systemMessage,
    eventType: "disbanded",
  };
}

function saveParty(repo: PartyRepository, party: PartyRecord, bumpRevision: boolean): void {
  if (bumpRevision) {
    party.revision += 1;
  }
  repo.putParty(party);
}

function bumpActivity(party: PartyRecord, nowMs: number): void {
  party.lastActiveAt = nowMs;
  party.expiresAt = nowMs + PARTY_IDLE_TTL_MS;
  updateAbsence(party, nowMs);
}

function updateAbsence(party: PartyRecord, nowMs: number): void {
  let anyPresent = false;
  for (let i = 0; i < party.members.length; i++) {
    const state = party.members[i].connectionState;
    if (state === "online" || state === "disconnect_grace") {
      anyPresent = true;
      break;
    }
  }
  if (anyPresent) {
    party.allAbsentSince = undefined;
    return;
  }
  if (positiveNumber(party.allAbsentSince) === undefined) {
    party.allAbsentSince = nowMs;
  }
}

function dropExpiredDisconnects(party: PartyRecord, nowMs: number): PartyMember[] {
  const kept: PartyMember[] = [];
  const dropped: PartyMember[] = [];
  for (let i = 0; i < party.members.length; i++) {
    const member = party.members[i];
    const seenAt = positiveNumber(member.lastSeenAt);
    if (
      member.connectionState === "disconnect_grace" &&
      seenAt !== undefined &&
      nowMs - seenAt >= PARTY_DISCONNECT_GRACE_MS
    ) {
      member.connectionState = "offline";
    }
    if (
      member.connectionState === "offline" &&
      seenAt !== undefined &&
      nowMs - seenAt >= PARTY_DISCONNECT_GRACE_MS
    ) {
      dropped.push(member);
      continue;
    }
    kept.push(member);
  }
  let leaderPresent = false;
  for (let i = 0; i < kept.length; i++) {
    if (kept[i].characterId === party.leaderCharacterId) {
      leaderPresent = true;
      break;
    }
  }
  party.members = kept;
  if (party.members.length > 0 && !leaderPresent) {
    party.leaderCharacterId = longestTenured(party).characterId;
  }
  return dropped;
}

function expireInvites(party: PartyRecord, nowMs: number): void {
  party.invites = party.invites.filter(function (invite) {
    return invite.expiresAt > nowMs;
  });
}

function longestTenured(party: PartyRecord): PartyMember {
  let best = party.members[0];
  for (let i = 1; i < party.members.length; i++) {
    if (party.members[i].joinedAt < best.joinedAt) {
      best = party.members[i];
    }
  }
  return best;
}

function livingMemberCount(party: PartyRecord): number {
  return party.members.length;
}

export function accountOwnsPartyMembership(party: PartyRecord, accountUserId: string): boolean {
  for (let i = 0; i < party.members.length; i++) {
    if (party.members[i].accountUserId === accountUserId) {
      return true;
    }
  }
  return false;
}

function findMember(party: PartyRecord, characterId: string): PartyMember | null {
  for (let i = 0; i < party.members.length; i++) {
    if (party.members[i].characterId === characterId) {
      return party.members[i];
    }
  }
  return null;
}

function findInvite(party: PartyRecord, characterId: string): PartyInvite | null {
  for (let i = 0; i < party.invites.length; i++) {
    if (party.invites[i].targetCharacterId === characterId) {
      return party.invites[i];
    }
  }
  return null;
}

function memberFromActor(actor: PartyActor, nowMs: number, connectionState: PartyConnectionState): PartyMember {
  return {
    accountUserId: actor.accountUserId,
    characterId: actor.characterId,
    displayName: actor.displayName,
    joinedAt: nowMs,
    connectionState: connectionState,
    lastSeenAt: nowMs,
  };
}

function rememberRequest(party: PartyRecord, requestId: string, op: string, code: string): void {
  party.byRequestId[requestId] = { op: op, code: code };
}

function replayRequest(party: PartyRecord, requestId: string, op: string): PartyOpResult | null {
  const previous = party.byRequestId[requestId];
  if (previous === undefined) {
    return null;
  }
  if (previous.op !== op) {
    return fail("duplicate_request");
  }
  return {
    ok: previous.code === "ok",
    code: previous.code,
    replay: true,
    party: party,
  };
}

function writeMemberIndex(
  repo: PartyRepository,
  accountUserId: string,
  characterId: string,
  partyId: string,
  pendingPartyId: string,
): void {
  repo.putIndex(accountUserId, {
    schemaVersion: PARTY_SCHEMA_VERSION,
    characterId: characterId,
    partyId: partyId,
    pendingPartyId: pendingPartyId,
  });
}

function clearPendingIndex(repo: PartyRepository, actor: PartyActor): void {
  const index = repo.getIndex(actor.accountUserId, actor.characterId);
  if (index === null) {
    return;
  }
  if (index.partyId.length > 0) {
    repo.putIndex(actor.accountUserId, {
      schemaVersion: PARTY_SCHEMA_VERSION,
      characterId: actor.characterId,
      partyId: index.partyId,
      pendingPartyId: "",
    });
    return;
  }
  repo.deleteIndex(actor.accountUserId, actor.characterId);
}

function ok(
  party: PartyRecord,
  code: string,
  replay?: boolean,
  systemMessage?: string,
  eventType?: string,
): PartyOpResult {
  return {
    ok: true,
    code: code,
    replay: replay === true,
    party: party,
    systemMessage: systemMessage,
    eventType: eventType,
  };
}

function fail(code: string): PartyOpResult {
  return { ok: false, code: code };
}

function cloneParty(party: PartyRecord): PartyRecord {
  const members: PartyMember[] = [];
  for (let i = 0; i < party.members.length; i++) {
    const member = party.members[i];
    members.push({
      accountUserId: member.accountUserId,
      characterId: member.characterId,
      displayName: member.displayName,
      joinedAt: member.joinedAt,
      connectionState: member.connectionState,
      lastSeenAt: member.lastSeenAt,
    });
  }
  const invites: PartyInvite[] = [];
  for (let i = 0; i < party.invites.length; i++) {
    const invite = party.invites[i];
    invites.push({
      targetCharacterId: invite.targetCharacterId,
      targetAccountUserId: invite.targetAccountUserId,
      targetDisplayName: invite.targetDisplayName,
      invitedByCharacterId: invite.invitedByCharacterId,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      requestId: invite.requestId,
    });
  }
  const byRequestId: { [requestId: string]: { op: string; code: string } } = {};
  const requestMap = party.byRequestId !== undefined && party.byRequestId !== null ? party.byRequestId : {};
  const keys = Object.keys(requestMap);
  for (let i = 0; i < keys.length; i++) {
    const row = requestMap[keys[i]];
    if (row !== undefined) {
      byRequestId[keys[i]] = { op: row.op, code: row.code };
    }
  }
  const cloned: PartyRecord = {
    partyId: party.partyId,
    leaderCharacterId: party.leaderCharacterId,
    members: members,
    invites: invites,
    revision: party.revision,
    createdAt: party.createdAt,
    lastActiveAt: party.lastActiveAt,
    expiresAt: party.expiresAt,
    schemaVersion: party.schemaVersion,
    byRequestId: byRequestId,
    lootPolicy: party.lootPolicy,
  };
  const absentSince = positiveNumber(party.allAbsentSince);
  if (absentSince !== undefined) {
    cloned.allAbsentSince = absentSince;
  }
  return cloned;
}

function memberDisplayName(party: PartyRecord, characterId: string): string {
  const member = findMember(party, characterId);
  return member !== null ? member.displayName : characterId;
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && isFinite(value) && value > 0) {
    return value;
  }
  return undefined;
}

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && isFinite(value)) {
    return value;
  }
  return fallback;
}

function asRecordList(value: unknown): { [key: string]: unknown }[] {
  if (Array.isArray(value)) {
    const out: { [key: string]: unknown }[] = [];
    for (let i = 0; i < value.length; i++) {
      const row = value[i];
      if (row !== null && typeof row === "object" && !Array.isArray(row)) {
        out.push(row as { [key: string]: unknown });
      }
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    const data = value as { [key: string]: unknown };
    const out: { [key: string]: unknown }[] = [];
    for (let i = 0; data[String(i)] !== undefined; i++) {
      const row = data[String(i)];
      if (row !== null && typeof row === "object" && !Array.isArray(row)) {
        out.push(row as { [key: string]: unknown });
      }
    }
    return out;
  }
  return [];
}

function parseStoredMembers(value: unknown): PartyMember[] {
  const rows = asRecordList(value);
  const members: PartyMember[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row.accountUserId !== "string" || row.accountUserId.length === 0) {
      continue;
    }
    if (typeof row.characterId !== "string" || row.characterId.length === 0) {
      continue;
    }
    if (typeof row.displayName !== "string" || row.displayName.length === 0) {
      continue;
    }
    const connectionState: PartyConnectionState =
      row.connectionState === "disconnect_grace" || row.connectionState === "offline"
        ? row.connectionState
        : "online";
    const joinedAt = finiteNumber(row.joinedAt, 0);
    members.push({
      accountUserId: row.accountUserId,
      characterId: row.characterId,
      displayName: row.displayName,
      joinedAt: joinedAt,
      connectionState: connectionState,
      lastSeenAt: finiteNumber(row.lastSeenAt, joinedAt),
    });
  }
  return members;
}

function parseStoredInvites(value: unknown): PartyInvite[] {
  const rows = asRecordList(value);
  const invites: PartyInvite[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (typeof row.targetCharacterId !== "string" || row.targetCharacterId.length === 0) {
      continue;
    }
    if (typeof row.targetAccountUserId !== "string" || row.targetAccountUserId.length === 0) {
      continue;
    }
    invites.push({
      targetCharacterId: row.targetCharacterId,
      targetAccountUserId: row.targetAccountUserId,
      targetDisplayName: typeof row.targetDisplayName === "string" ? row.targetDisplayName : row.targetCharacterId,
      invitedByCharacterId: typeof row.invitedByCharacterId === "string" ? row.invitedByCharacterId : "",
      createdAt: finiteNumber(row.createdAt, 0),
      expiresAt: finiteNumber(row.expiresAt, 0),
      requestId: typeof row.requestId === "string" ? row.requestId : "",
    });
  }
  return invites;
}

function parseStoredByRequestId(value: unknown): { [requestId: string]: { op: string; code: string } } {
  const byRequestId: { [requestId: string]: { op: string; code: string } } = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return byRequestId;
  }
  const map = value as { [key: string]: unknown };
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const rec = row as { [key: string]: unknown };
    if (typeof rec.op === "string" && typeof rec.code === "string") {
      byRequestId[keys[i]] = { op: rec.op, code: rec.code };
    }
  }
  return byRequestId;
}

function cloneIndex(index: PartyIndex): PartyIndex {
  return {
    schemaVersion: index.schemaVersion,
    characterId: index.characterId,
    partyId: index.partyId,
    pendingPartyId: index.pendingPartyId,
  };
}

function indexKey(accountUserId: string, characterId: string): string {
  return accountUserId + ":" + characterId;
}
