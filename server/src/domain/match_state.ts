import { PROTOCOL_VERSION, ServerOpcode } from "./protocol";

export const STARTER_ZONE_ID = "zone.starter";
export const STARTER_ZONE_LABEL = "zone.starter";
export const STARTER_ZONE_MODULE = "starter_zone";
export const MATCH_TICK_RATE = 10;
export const MATCH_MAX_PLAYERS = 8;
export const EMPTY_MATCH_TIMEOUT_SEC = 30;
export const EMPTY_MATCH_TIMEOUT_TICKS = MATCH_TICK_RATE * EMPTY_MATCH_TIMEOUT_SEC;

export interface Vec2 {
  x: number;
  y: number;
}

export interface MatchPlayer {
  userId: string;
  sessionId: string;
  username: string;
  characterId: string;
  name: string;
  x: number;
  y: number;
  maxHealth: number;
  health: number;
}

export interface MatchNpc {
  id: string;
  npcId: string;
  x: number;
  y: number;
}

export interface MatchEnemy {
  id: string;
  enemyId: string;
  x: number;
  y: number;
  maxHealth: number;
  health: number;
}

export interface MatchLoot {
  id: string;
  itemId: string;
  x: number;
  y: number;
}

export interface StarterZoneState {
  zoneId: string;
  contentHash: string;
  emptyTicks: number;
  players: { [userId: string]: MatchPlayer };
  npcs: MatchNpc[];
  enemies: MatchEnemy[];
  loot: MatchLoot[];
}

export interface ZoneSpawnContent {
  id: string;
  playerSpawn: Vec2;
  npcs: ReadonlyArray<{ npcId: string; x: number; y: number }>;
  enemies: ReadonlyArray<{ enemyId: string; x: number; y: number }>;
}

export interface EnemyContent {
  id: string;
  maxHealth: number;
}

export interface PlayerContent {
  id: string;
  maxHealth: number;
}

export function createStarterZoneState(
  contentHash: string,
  zone: ZoneSpawnContent,
  enemiesById: { [id: string]: EnemyContent },
): StarterZoneState {
  const npcs: MatchNpc[] = [];
  for (let i = 0; i < zone.npcs.length; i++) {
    const spawn = zone.npcs[i];
    npcs.push({
      id: spawn.npcId,
      npcId: spawn.npcId,
      x: spawn.x,
      y: spawn.y,
    });
  }
  const enemies: MatchEnemy[] = [];
  for (let i = 0; i < zone.enemies.length; i++) {
    const spawn = zone.enemies[i];
    const def = enemiesById[spawn.enemyId];
    const maxHealth = def !== undefined ? def.maxHealth : 1;
    enemies.push({
      id: spawn.enemyId + ":" + String(i),
      enemyId: spawn.enemyId,
      x: spawn.x,
      y: spawn.y,
      maxHealth: maxHealth,
      health: maxHealth,
    });
  }
  return {
    zoneId: zone.id,
    contentHash: contentHash,
    emptyTicks: 0,
    players: {},
    npcs: npcs,
    enemies: enemies,
    loot: [],
  };
}

export function playerCount(state: StarterZoneState): number {
  return Object.keys(state.players).length;
}

export function addPlayer(
  state: StarterZoneState,
  player: MatchPlayer,
): StarterZoneState {
  const next = cloneState(state);
  next.players[player.userId] = player;
  next.emptyTicks = 0;
  return next;
}

export function removePlayer(state: StarterZoneState, userId: string): StarterZoneState {
  const next = cloneState(state);
  delete next.players[userId];
  if (playerCount(next) === 0) {
    next.emptyTicks = 0;
  }
  return next;
}

export function buildFullState(state: StarterZoneState, tick: number, selfId: string): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    contentHash: state.contentHash,
    tick: tick,
    zoneId: state.zoneId,
    selfId: selfId,
    players: playersList(state),
    npcs: state.npcs,
    enemies: state.enemies,
    loot: state.loot,
  });
}

export function buildSnapshot(state: StarterZoneState, tick: number): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    contentHash: state.contentHash,
    tick: tick,
    zoneId: state.zoneId,
    players: playersList(state),
  });
}

export function fullStateOpcode(): number {
  return ServerOpcode.FULL_STATE;
}

export function snapshotOpcode(): number {
  return ServerOpcode.SNAPSHOT;
}

function playersList(state: StarterZoneState): MatchPlayer[] {
  const ids = Object.keys(state.players);
  ids.sort();
  const list: MatchPlayer[] = [];
  for (let i = 0; i < ids.length; i++) {
    list.push(state.players[ids[i]]);
  }
  return list;
}

function cloneState(state: StarterZoneState): StarterZoneState {
  const players: { [userId: string]: MatchPlayer } = {};
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const p = state.players[id];
    players[id] = {
      userId: p.userId,
      sessionId: p.sessionId,
      username: p.username,
      characterId: p.characterId,
      name: p.name,
      x: p.x,
      y: p.y,
      maxHealth: p.maxHealth,
      health: p.health,
    };
  }
  return {
    zoneId: state.zoneId,
    contentHash: state.contentHash,
    emptyTicks: state.emptyTicks,
    players: players,
    npcs: state.npcs,
    enemies: state.enemies,
    loot: state.loot,
  };
}
