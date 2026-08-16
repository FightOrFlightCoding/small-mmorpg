import { PROTOCOL_VERSION, ServerOpcode } from "./protocol";
import { PLAYER_HALF_EXTENT, SNAPSHOT_RATE_HZ, type Aabb } from "./movement";
import {
  cloneQuestLog,
  emptyQuestLog,
  publicQuestPayloads,
  type QuestDefinition,
  type QuestLog,
} from "./quest";

export const STARTER_ZONE_ID = "zone.starter";
export const STARTER_ZONE_LABEL = "zone.starter";
export const STARTER_ZONE_MODULE = "starter_zone";
export const MATCH_TICK_RATE = 10;
export const MATCH_SNAPSHOT_RATE_HZ = SNAPSHOT_RATE_HZ;
export const MATCH_MAX_PLAYERS = 8;
export const EMPTY_MATCH_TIMEOUT_SEC = 30;
export const EMPTY_MATCH_TIMEOUT_TICKS = MATCH_TICK_RATE * EMPTY_MATCH_TIMEOUT_SEC;
export { PLAYER_HALF_EXTENT };

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
  lastProcessedSeq: number;
  axisX: number;
  axisY: number;
  questLog: QuestLog;
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
  walkableBounds: Aabb;
  collisions: Aabb[];
  moveSpeed: number;
  playerHalfExtent: number;
  interactionRange: number;
  questsById: { [id: string]: QuestDefinition };
}

export interface ZoneSpawnContent {
  id: string;
  playerSpawn: Vec2;
  npcs: ReadonlyArray<{ npcId: string; x: number; y: number }>;
  enemies: ReadonlyArray<{ enemyId: string; x: number; y: number }>;
  walkableBounds: Aabb;
  collisions: ReadonlyArray<Aabb>;
}

export interface EnemyContent {
  id: string;
  maxHealth: number;
}

export interface PlayerContent {
  id: string;
  maxHealth: number;
  moveSpeed: number;
  interactionRange: number;
}

export function createStarterZoneState(
  contentHash: string,
  zone: ZoneSpawnContent,
  enemiesById: { [id: string]: EnemyContent },
  playerContent: PlayerContent,
  questsById: { [id: string]: QuestDefinition },
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
  const collisions: Aabb[] = [];
  for (let i = 0; i < zone.collisions.length; i++) {
    const box = zone.collisions[i];
    collisions.push({ x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return {
    zoneId: zone.id,
    contentHash: contentHash,
    emptyTicks: 0,
    players: {},
    npcs: npcs,
    enemies: enemies,
    loot: [],
    walkableBounds: {
      x: zone.walkableBounds.x,
      y: zone.walkableBounds.y,
      width: zone.walkableBounds.width,
      height: zone.walkableBounds.height,
    },
    collisions: collisions,
    moveSpeed: playerContent.moveSpeed,
    playerHalfExtent: PLAYER_HALF_EXTENT,
    interactionRange: playerContent.interactionRange,
    questsById: questsById,
  };
}

export function playerCount(state: StarterZoneState): number {
  return Object.keys(state.players).length;
}

export function addPlayer(
  state: StarterZoneState,
  player: MatchPlayer,
): StarterZoneState {
  const next = cloneStarterZoneState(state);
  next.players[player.userId] = player;
  next.emptyTicks = 0;
  return next;
}

export function removePlayer(state: StarterZoneState, userId: string): StarterZoneState {
  const next = cloneStarterZoneState(state);
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
    quests: questsFor(state, selfId),
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

function publicPlayer(player: MatchPlayer): { [key: string]: unknown } {
  return {
    userId: player.userId,
    sessionId: player.sessionId,
    username: player.username,
    characterId: player.characterId,
    name: player.name,
    x: player.x,
    y: player.y,
    maxHealth: player.maxHealth,
    health: player.health,
    lastProcessedSeq: player.lastProcessedSeq,
  };
}

function playersList(state: StarterZoneState): { [key: string]: unknown }[] {
  const ids = Object.keys(state.players);
  ids.sort();
  const list: { [key: string]: unknown }[] = [];
  for (let i = 0; i < ids.length; i++) {
    list.push(publicPlayer(state.players[ids[i]]));
  }
  return list;
}

export function cloneStarterZoneState(state: StarterZoneState): StarterZoneState {
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
      lastProcessedSeq: p.lastProcessedSeq,
      axisX: p.axisX,
      axisY: p.axisY,
      questLog: cloneQuestLog(p.questLog !== undefined ? p.questLog : emptyQuestLog()),
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
    walkableBounds: state.walkableBounds,
    collisions: state.collisions,
    moveSpeed: state.moveSpeed,
    playerHalfExtent: state.playerHalfExtent,
    interactionRange: state.interactionRange,
    questsById: state.questsById,
  };
}

function questsFor(state: StarterZoneState, selfId: string): { [key: string]: unknown }[] {
  const player = state.players[selfId];
  if (player === undefined) {
    return [];
  }
  return publicQuestPayloads(player.questLog, state.questsById);
}
