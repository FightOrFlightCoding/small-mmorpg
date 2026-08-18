import { DEFAULT_CREDIT_RANGE_PX, defaultGroupCreditRules, type GroupCreditRules } from "./party";

export interface PartyCreditEvent {
  eventId: string;
  enemyId: string;
  instanceId: string;
  contributors: string[];
}

export type PartyCreditSink = (event: PartyCreditEvent) => void;

export function noopPartyCredit(_event: PartyCreditEvent): void {}

export function partyCreditFromThreat(
  eventId: string,
  enemyId: string,
  instanceId: string,
  threatByPlayerId: { [userId: string]: number } | undefined,
  killerId: string,
): PartyCreditEvent {
  const contributors: string[] = [];
  const seen: { [id: string]: boolean } = {};
  if (killerId.length > 0) {
    contributors.push(killerId);
    seen[killerId] = true;
  }
  const threat = threatByPlayerId !== undefined ? threatByPlayerId : {};
  const ids = Object.keys(threat);
  ids.sort();
  for (let i = 0; i < ids.length; i++) {
    if (seen[ids[i]] === true) {
      continue;
    }
    if (threat[ids[i]] <= 0) {
      continue;
    }
    contributors.push(ids[i]);
    seen[ids[i]] = true;
  }
  return {
    eventId: eventId,
    enemyId: enemyId,
    instanceId: instanceId,
    contributors: contributors,
  };
}

export interface CreditParticipant {
  userId: string;
  characterId: string;
  x: number;
  y: number;
  alive: boolean;
  lastDeathTick?: number;
}

export interface MatchPartyCache {
  partyId: string;
  revision: number;
  leaderCharacterId: string;
  lootPolicy: string;
  members: MatchPartyMemberView[];
}

export interface MatchPartyMemberView {
  accountUserId: string;
  characterId: string;
  displayName: string;
  connectionState: string;
}

export interface GroupCreditMember {
  userId: string;
  characterId: string;
}

export function eligibleGroupCreditMembers(input: {
  killerUserId: string;
  enemyX: number;
  enemyY: number;
  tick: number;
  tickRate: number;
  players: { [userId: string]: CreditParticipant };
  partyByCharacterId?: { [characterId: string]: MatchPartyCache };
  rules?: GroupCreditRules;
}): GroupCreditMember[] {
  const rules = input.rules !== undefined ? input.rules : defaultGroupCreditRules();
  const killer = input.players[input.killerUserId];
  if (killer === undefined) {
    return [];
  }
  const party =
    input.partyByCharacterId !== undefined && killer.characterId.length > 0
      ? input.partyByCharacterId[killer.characterId]
      : undefined;
  const candidates: GroupCreditMember[] = [];
  if (party === undefined) {
    if (isEligible(killer, input.enemyX, input.enemyY, input.tick, input.tickRate, rules)) {
      candidates.push({ userId: killer.userId, characterId: killer.characterId });
    }
    return candidates;
  }
  const userIds = Object.keys(input.players);
  for (let i = 0; i < userIds.length; i++) {
    const player = input.players[userIds[i]];
    if (player === undefined || player.characterId.length === 0) {
      continue;
    }
    if (!partyHasCharacter(party, player.characterId)) {
      continue;
    }
    if (!isEligible(player, input.enemyX, input.enemyY, input.tick, input.tickRate, rules)) {
      continue;
    }
    candidates.push({ userId: player.userId, characterId: player.characterId });
  }
  candidates.sort(function (a, b) {
    if (a.characterId < b.characterId) {
      return -1;
    }
    if (a.characterId > b.characterId) {
      return 1;
    }
    return 0;
  });
  return candidates;
}

export function splitKillXp(amount: number, eligibleCount: number, formula: string): number {
  if (amount <= 0 || eligibleCount <= 0) {
    return 0;
  }
  if (formula === "split") {
    return Math.floor(amount / eligibleCount);
  }
  return amount;
}

export function killXpEventId(baseEventId: string, characterId: string, killerCharacterId: string): string {
  if (characterId === killerCharacterId) {
    return baseEventId;
  }
  return baseEventId + ":" + characterId;
}

function isEligible(
  player: CreditParticipant,
  enemyX: number,
  enemyY: number,
  tick: number,
  tickRate: number,
  rules: GroupCreditRules,
): boolean {
  if (!recentlyActive(player, tick, tickRate, rules.recentlyActiveAfterDeathMs)) {
    return false;
  }
  const range = rules.rangePx > 0 ? rules.rangePx : DEFAULT_CREDIT_RANGE_PX;
  const dx = player.x - enemyX;
  const dy = player.y - enemyY;
  return dx * dx + dy * dy <= range * range;
}

function recentlyActive(
  player: CreditParticipant,
  tick: number,
  tickRate: number,
  recentlyActiveMs: number,
): boolean {
  if (player.alive) {
    return true;
  }
  const rate = tickRate > 0 ? tickRate : 10;
  const windowTicks = Math.ceil((recentlyActiveMs / 1000) * rate);
  if (player.lastDeathTick !== undefined && player.lastDeathTick >= 0) {
    return tick - player.lastDeathTick <= windowTicks;
  }
  return false;
}

function partyHasCharacter(party: MatchPartyCache, characterId: string): boolean {
  for (let i = 0; i < party.members.length; i++) {
    if (party.members[i].characterId === characterId) {
      return true;
    }
  }
  return false;
}

export function applyPartyMatchSignal(
  partyByCharacterId: { [characterId: string]: MatchPartyCache },
  pendingInvitesByCharacterId: {
    [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number };
  },
  data: { [key: string]: unknown },
): void {
  const partyId = typeof data.partyId === "string" ? data.partyId : "";
  if (data.type === "party_disbanded" && partyId.length > 0) {
    clearPartyId(partyByCharacterId, pendingInvitesByCharacterId, partyId);
    return;
  }
  if (partyId.length === 0 || !Array.isArray(data.members)) {
    return;
  }
  const actorId = typeof data.characterId === "string" ? data.characterId : "";
  const raw: MatchPartyMemberView[] = [];
  for (let i = 0; i < data.members.length; i++) {
    const row = data.members[i] as { [key: string]: unknown };
    if (typeof row.characterId !== "string" || row.characterId.length === 0) {
      continue;
    }
    raw.push({
      accountUserId: typeof row.accountUserId === "string" ? row.accountUserId : "",
      characterId: row.characterId,
      displayName: typeof row.displayName === "string" ? row.displayName : "",
      connectionState: typeof row.connectionState === "string" ? row.connectionState : "online",
    });
  }
  if (actorId.length > 0) {
    evictCharacterFromOtherParties(partyByCharacterId, pendingInvitesByCharacterId, actorId, partyId);
  }
  const members: MatchPartyMemberView[] = [];
  for (let i = 0; i < raw.length; i++) {
    const existing = partyByCharacterId[raw[i].characterId];
    if (existing !== undefined && existing.partyId !== partyId && raw[i].characterId !== actorId) {
      continue;
    }
    members.push(raw[i]);
  }
  clearPartyId(partyByCharacterId, pendingInvitesByCharacterId, partyId);
  if (members.length === 0) {
    return;
  }
  let leaderCharacterId = typeof data.leaderCharacterId === "string" ? data.leaderCharacterId : "";
  let leaderPresent = false;
  for (let i = 0; i < members.length; i++) {
    if (members[i].characterId === leaderCharacterId) {
      leaderPresent = true;
      break;
    }
  }
  if (!leaderPresent) {
    leaderCharacterId = members[0].characterId;
  }
  const cache: MatchPartyCache = {
    partyId: partyId,
    revision: typeof data.revision === "number" ? data.revision : 1,
    leaderCharacterId: leaderCharacterId,
    lootPolicy: typeof data.lootPolicy === "string" ? data.lootPolicy : "personal",
    members: members,
  };
  for (let i = 0; i < members.length; i++) {
    partyByCharacterId[members[i].characterId] = cache;
    delete pendingInvitesByCharacterId[members[i].characterId];
  }
  if (Array.isArray(data.pendingInvites)) {
    for (let i = 0; i < data.pendingInvites.length; i++) {
      const invite = data.pendingInvites[i] as { [key: string]: unknown };
      if (typeof invite.characterId !== "string" || invite.characterId.length === 0) {
        continue;
      }
      if (partyByCharacterId[invite.characterId] !== undefined) {
        continue;
      }
      pendingInvitesByCharacterId[invite.characterId] = {
        partyId: partyId,
        fromDisplayName: typeof invite.fromDisplayName === "string" ? invite.fromDisplayName : "",
        expiresAt: typeof invite.expiresAt === "number" ? invite.expiresAt : 0,
      };
    }
  }
}

function evictCharacterFromOtherParties(
  partyByCharacterId: { [characterId: string]: MatchPartyCache },
  pendingInvitesByCharacterId: {
    [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number };
  },
  characterId: string,
  exceptPartyId: string,
): void {
  delete pendingInvitesByCharacterId[characterId];
  const ids = Object.keys(partyByCharacterId);
  for (let i = 0; i < ids.length; i++) {
    const party = partyByCharacterId[ids[i]];
    if (party === undefined || party.partyId === exceptPartyId) {
      continue;
    }
    if (!partyHasCharacter(party, characterId)) {
      continue;
    }
    party.members = party.members.filter(function (row) {
      return row.characterId !== characterId;
    });
    if (party.leaderCharacterId === characterId && party.members.length > 0) {
      party.leaderCharacterId = party.members[0].characterId;
    }
  }
  if (partyByCharacterId[characterId] !== undefined && partyByCharacterId[characterId].partyId !== exceptPartyId) {
    delete partyByCharacterId[characterId];
  }
  const remaining = Object.keys(partyByCharacterId);
  for (let i = 0; i < remaining.length; i++) {
    if (partyByCharacterId[remaining[i]].members.length === 0) {
      delete partyByCharacterId[remaining[i]];
    }
  }
}

function clearPartyId(
  partyByCharacterId: { [characterId: string]: MatchPartyCache },
  pendingInvitesByCharacterId: {
    [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number };
  },
  partyId: string,
): void {
  const ids = Object.keys(partyByCharacterId);
  for (let i = 0; i < ids.length; i++) {
    if (partyByCharacterId[ids[i]].partyId === partyId) {
      delete partyByCharacterId[ids[i]];
    }
  }
  const pendingIds = Object.keys(pendingInvitesByCharacterId);
  for (let i = 0; i < pendingIds.length; i++) {
    if (pendingInvitesByCharacterId[pendingIds[i]].partyId === partyId) {
      delete pendingInvitesByCharacterId[pendingIds[i]];
    }
  }
}
