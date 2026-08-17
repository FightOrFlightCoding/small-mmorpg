import { dict } from "./maps";
import type { MatchEnemy, MatchPlayer, StarterZoneState } from "./match_state";
import { distance } from "./movement";

export interface AiProfileContent {
  id: string;
  style: "melee" | "ranged" | "caster" | "boss";
  acquireMode: "nearest";
  damageThreatWeight: number;
  healThreatWeight: number;
  generateHealThreat: boolean;
  threatSwitchRatio: number;
  preferredRange: number;
  kiteRange: number;
  resetHealthOnReturn: boolean;
  resetThreatOnReturn: boolean;
}

export const DEFAULT_AI_PROFILE: AiProfileContent = {
  id: "test.ai.melee",
  style: "melee",
  acquireMode: "nearest",
  damageThreatWeight: 1,
  healThreatWeight: 0,
  generateHealThreat: false,
  threatSwitchRatio: 1.1,
  preferredRange: 0,
  kiteRange: 0,
  resetHealthOnReturn: false,
  resetThreatOnReturn: true,
};

export function aiProfilesFromContent(profiles: {
  [id: string]: AiProfileContent;
}): { [id: string]: AiProfileContent } {
  const map: { [id: string]: AiProfileContent } = {};
  const ids = Object.keys(profiles);
  for (let i = 0; i < ids.length; i++) {
    map[ids[i]] = copyProfile(profiles[ids[i]]);
  }
  return map;
}

export function profileForEnemy(state: StarterZoneState, enemy: MatchEnemy): AiProfileContent {
  const id = enemy.aiProfileId !== undefined ? enemy.aiProfileId : "";
  const catalog = state.aiProfilesById;
  if (catalog !== undefined && id.length > 0 && catalog[id] !== undefined) {
    return catalog[id];
  }
  return DEFAULT_AI_PROFILE;
}

export function addDamageThreat(enemy: MatchEnemy, playerId: string, amount: number, profile: AiProfileContent): void {
  if (amount <= 0 || playerId.length === 0) {
    return;
  }
  const table = dict(enemy.threatByPlayerId);
  const current = table[playerId] !== undefined ? table[playerId] : 0;
  table[playerId] = current + Math.floor(amount * profile.damageThreatWeight);
  enemy.threatByPlayerId = table;
}

export function addHealThreat(enemy: MatchEnemy, healerId: string, amount: number, profile: AiProfileContent): void {
  if (amount <= 0 || healerId.length === 0 || profile.generateHealThreat !== true) {
    return;
  }
  const table = dict(enemy.threatByPlayerId);
  const current = table[healerId] !== undefined ? table[healerId] : 0;
  table[healerId] = current + Math.floor(amount * profile.healThreatWeight);
  enemy.threatByPlayerId = table;
}

export function applyHealThreatToEnemies(
  state: StarterZoneState,
  healerId: string,
  healedPlayerId: string,
  amount: number,
): void {
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy.health <= 0) {
      continue;
    }
    const profile = profileForEnemy(state, enemy);
    if (profile.generateHealThreat !== true) {
      continue;
    }
    const table = dict(enemy.threatByPlayerId);
    const hasHealed = table[healedPlayerId] !== undefined && table[healedPlayerId] > 0;
    if (enemy.aggroTarget === healedPlayerId || hasHealed) {
      addHealThreat(enemy, healerId, amount, profile);
    }
  }
}

export function selectThreatTarget(state: StarterZoneState, enemy: MatchEnemy, profile: AiProfileContent): string {
  const table = dict(enemy.threatByPlayerId);
  const current = enemy.aggroTarget !== undefined ? enemy.aggroTarget : "";
  if (current.length > 0 && isValidThreatTarget(state, enemy, current)) {
    const currentThreat = table[current] !== undefined ? table[current] : 0;
    const best = highestThreat(state, enemy, table);
    if (best.id.length > 0 && best.id !== current && best.threat > currentThreat * profile.threatSwitchRatio) {
      return best.id;
    }
    if (currentThreat > 0) {
      return current;
    }
  }
  const best = highestThreat(state, enemy, table);
  if (best.id.length > 0) {
    return best.id;
  }
  return nearestPlayerInAggro(state, enemy);
}

export function clearThreat(enemy: MatchEnemy): void {
  enemy.threatByPlayerId = {};
  enemy.aggroTarget = "";
  enemy.combatEnteredTick = 0;
}

export function isValidThreatTarget(state: StarterZoneState, _enemy: MatchEnemy, playerId: string): boolean {
  const player = dict(state.players)[playerId];
  if (player === undefined || player.health <= 0) {
    return false;
  }
  return true;
}

function highestThreat(
  state: StarterZoneState,
  enemy: MatchEnemy,
  table: { [userId: string]: number },
): { id: string; threat: number } {
  const ids = Object.keys(table);
  ids.sort();
  let bestId = "";
  let bestThreat = 0;
  for (let i = 0; i < ids.length; i++) {
    if (!isValidThreatTarget(state, enemy, ids[i])) {
      continue;
    }
    const value = table[ids[i]];
    if (value > bestThreat || (value === bestThreat && (bestId === "" || ids[i] < bestId))) {
      bestThreat = value;
      bestId = ids[i];
    }
  }
  return { id: bestId, threat: bestThreat };
}

function nearestPlayerInAggro(state: StarterZoneState, enemy: MatchEnemy): string {
  const ids = Object.keys(dict(state.players));
  ids.sort();
  let bestId = "";
  let bestDistance = 0;
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player.health <= 0) {
      continue;
    }
    const range = distance(enemy.x, enemy.y, player.x, player.y);
    if (range > enemy.aggroRadius) {
      continue;
    }
    if (bestId === "" || range < bestDistance || (range === bestDistance && ids[i] < bestId)) {
      bestDistance = range;
      bestId = ids[i];
    }
  }
  return bestId;
}

function copyProfile(profile: AiProfileContent): AiProfileContent {
  return {
    id: profile.id,
    style: profile.style,
    acquireMode: profile.acquireMode,
    damageThreatWeight: profile.damageThreatWeight,
    healThreatWeight: profile.healThreatWeight,
    generateHealThreat: profile.generateHealThreat === true,
    threatSwitchRatio: profile.threatSwitchRatio,
    preferredRange: profile.preferredRange,
    kiteRange: profile.kiteRange,
    resetHealthOnReturn: profile.resetHealthOnReturn === true,
    resetThreatOnReturn: profile.resetThreatOnReturn === true,
  };
}

export function livingPlayersExist(players: { [userId: string]: MatchPlayer }): boolean {
  const ids = Object.keys(dict(players));
  for (let i = 0; i < ids.length; i++) {
    if (players[ids[i]].health > 0) {
      return true;
    }
  }
  return false;
}
