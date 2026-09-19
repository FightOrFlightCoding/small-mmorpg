import { dict } from "./maps";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import type { MatchPartyCache } from "./party_credit";

export interface EncounterRosterMember {
  characterId: string;
  userId: string;
}

export interface EncounterPresence {
  characterId: string;
  userId: string;
  lastPresentTick: number;
  lastDeathTick: number;
  lastX: number;
  lastY: number;
  departedMatch: boolean;
}

export function applyFirstDamagingHitTag(input: {
  enemy: MatchEnemy;
  attackerUserId: string;
  attackerCharacterId: string;
  party?: MatchPartyCache;
  tick: number;
}): boolean {
  if (input.attackerCharacterId.length === 0 || input.attackerUserId.length === 0) {
    return false;
  }
  const current = input.enemy.tagOwnerCharacterId !== undefined ? input.enemy.tagOwnerCharacterId : "";
  if (current.length > 0) {
    return false;
  }
  const roster = snapshotEncounterRoster(input.attackerUserId, input.attackerCharacterId, input.party);
  input.enemy.tagOwnerCharacterId = input.attackerCharacterId;
  input.enemy.tagOwnerUserId = input.attackerUserId;
  input.enemy.tagPartyId = input.party !== undefined ? input.party.partyId : "";
  input.enemy.encounterRoster = roster;
  input.enemy.taggedAtTick = input.tick;
  input.enemy.tagRevision = (input.enemy.tagRevision !== undefined ? input.enemy.tagRevision : 0) + 1;
  input.enemy.encounterPresence = initialPresence(roster, input.tick);
  return true;
}

export function resetEnemyTag(enemy: MatchEnemy): void {
  enemy.tagOwnerCharacterId = "";
  enemy.tagOwnerUserId = "";
  enemy.tagPartyId = "";
  enemy.encounterRoster = [];
  enemy.taggedAtTick = 0;
  enemy.tagRevision = (enemy.tagRevision !== undefined ? enemy.tagRevision : 0) + 1;
  enemy.encounterPresence = {};
}

export function snapshotEncounterRoster(
  ownerUserId: string,
  ownerCharacterId: string,
  party?: MatchPartyCache,
): EncounterRosterMember[] {
  if (party === undefined || !Array.isArray(party.members) || party.members.length === 0) {
    return [{ characterId: ownerCharacterId, userId: ownerUserId }];
  }
  const roster: EncounterRosterMember[] = [];
  const seen: { [characterId: string]: boolean } = {};
  for (let i = 0; i < party.members.length; i++) {
    const member = party.members[i];
    if (member.characterId.length === 0 || seen[member.characterId] === true) {
      continue;
    }
    seen[member.characterId] = true;
    roster.push({
      characterId: member.characterId,
      userId: member.accountUserId,
    });
  }
  if (seen[ownerCharacterId] !== true) {
    roster.push({ characterId: ownerCharacterId, userId: ownerUserId });
  }
  roster.sort(compareRoster);
  return roster;
}

export function resolveOwningCharacter(
  state: StarterZoneState,
  sourceId: string,
  sourceKind: "player" | "enemy",
): { userId: string; characterId: string } | null {
  const players = dict(state.players);
  if (sourceKind === "player" || players[sourceId] !== undefined) {
    const player = players[sourceId];
    if (player === undefined || player.characterId.length === 0) {
      return null;
    }
    return { userId: player.userId, characterId: player.characterId };
  }
  const enemy = findTaggedEnemy(state, sourceId);
  if (enemy === null) {
    return null;
  }
  const controllerUserId = enemy.controllerUserId !== undefined ? enemy.controllerUserId : "";
  if (controllerUserId.length > 0) {
    const controller = players[controllerUserId];
    if (controller !== undefined && controller.characterId.length > 0) {
      return { userId: controller.userId, characterId: controller.characterId };
    }
  }
  const effects = Array.isArray(enemy.effects) ? enemy.effects : [];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    if (effect.sourceKind !== "player" || effect.sourceId.length === 0) {
      continue;
    }
    const tags = Array.isArray(effect.tags) ? effect.tags : [];
    if (tags.indexOf("charm") === -1 && tags.indexOf("control") === -1) {
      continue;
    }
    const owner = players[effect.sourceId];
    if (owner !== undefined && owner.characterId.length > 0) {
      return { userId: owner.userId, characterId: owner.characterId };
    }
  }
  return null;
}

export function tickEncounterPresence(state: StarterZoneState, tick: number): void {
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    const owner = enemy.tagOwnerCharacterId !== undefined ? enemy.tagOwnerCharacterId : "";
    if (owner.length === 0 || enemy.health <= 0) {
      continue;
    }
    const roster = Array.isArray(enemy.encounterRoster) ? enemy.encounterRoster : [];
    const presence = dict(enemy.encounterPresence);
    for (let r = 0; r < roster.length; r++) {
      const member = roster[r];
      const live = findLiveOrDisconnected(state, member.userId, member.characterId);
      const current: EncounterPresence =
        presence[member.characterId] !== undefined
          ? presence[member.characterId]
          : {
              characterId: member.characterId,
              userId: member.userId,
              lastPresentTick: 0,
              lastDeathTick: -1,
              lastX: 0,
              lastY: 0,
              departedMatch: false,
            };
      if (live === null) {
        current.departedMatch = true;
        presence[member.characterId] = current;
        continue;
      }
      current.departedMatch = false;
      current.lastPresentTick = tick;
      current.lastX = live.x;
      current.lastY = live.y;
      if (live.lastDeathTick !== undefined) {
        current.lastDeathTick = live.lastDeathTick;
      }
      presence[member.characterId] = current;
    }
    enemy.encounterPresence = presence;
  }
}

export function cloneEncounterRoster(roster: ReadonlyArray<EncounterRosterMember> | undefined): EncounterRosterMember[] {
  const list: EncounterRosterMember[] = [];
  const source = Array.isArray(roster) ? roster : [];
  for (let i = 0; i < source.length; i++) {
    list.push({ characterId: source[i].characterId, userId: source[i].userId });
  }
  return list;
}

export function cloneEncounterPresence(presence: { [characterId: string]: EncounterPresence } | undefined): {
  [characterId: string]: EncounterPresence;
} {
  const copy: { [characterId: string]: EncounterPresence } = {};
  const source = dict(presence);
  const ids = Object.keys(source);
  for (let i = 0; i < ids.length; i++) {
    const row = source[ids[i]];
    copy[ids[i]] = {
      characterId: row.characterId,
      userId: row.userId,
      lastPresentTick: row.lastPresentTick,
      lastDeathTick: row.lastDeathTick,
      lastX: row.lastX,
      lastY: row.lastY,
      departedMatch: row.departedMatch === true,
    };
  }
  return copy;
}

function initialPresence(roster: EncounterRosterMember[], tick: number): { [characterId: string]: EncounterPresence } {
  const map: { [characterId: string]: EncounterPresence } = {};
  for (let i = 0; i < roster.length; i++) {
    map[roster[i].characterId] = {
      characterId: roster[i].characterId,
      userId: roster[i].userId,
      lastPresentTick: tick,
      lastDeathTick: -1,
      lastX: 0,
      lastY: 0,
      departedMatch: false,
    };
  }
  return map;
}

function findTaggedEnemy(state: StarterZoneState, enemyId: string): MatchEnemy | null {
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === enemyId) {
      return state.enemies[i];
    }
  }
  return null;
}

function findLiveOrDisconnected(
  state: StarterZoneState,
  userId: string,
  characterId: string,
): MatchPlayer | null {
  const live = dict(state.players)[userId];
  if (live !== undefined && live.characterId === characterId) {
    return live;
  }
  const parked = dict(state.disconnected)[userId];
  if (parked !== undefined && parked.player !== undefined && parked.player.characterId === characterId) {
    return parked.player;
  }
  return null;
}

function compareRoster(a: EncounterRosterMember, b: EncounterRosterMember): number {
  if (a.characterId < b.characterId) {
    return -1;
  }
  if (a.characterId > b.characterId) {
    return 1;
  }
  return 0;
}
