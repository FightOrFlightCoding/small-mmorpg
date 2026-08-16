import { PROTOCOL_VERSION, ServerOpcode } from "./protocol";
import { PLAYER_HALF_EXTENT, SNAPSHOT_RATE_HZ, type Aabb } from "./movement";
import {
  cloneQuestLog,
  emptyQuestLog,
  publicQuestPayloads,
  type QuestDefinition,
  type QuestLog,
} from "./quest";
import { cloneInventory, emptyInventory, publicInventory, type ItemDefinition, type PlayerInventory } from "./inventory";
import {
  cloneEquipment,
  derivedAttack,
  emptyEquipment,
  publicDerived,
  publicEquipment,
  type PlayerEquipment,
} from "./equipment";
import { cloneLoot, publicLoot, type LootDrop, type MatchLoot } from "./loot";
import { dict } from "./maps";
import { cloneProgression, publicProgression, type CharacterProgression } from "./progression";
import { cloneActionRates, emptyActionRates, type PlayerActionRate } from "./rate_limit";
import {
  emptyModifierMap,
  equipmentModifiersFromGear,
  evaluateStats,
  type ProgressionCatalog,
} from "./stats";
import { publicWallet } from "./wallet";

export type { MatchLoot };

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
  classId?: string;
  x: number;
  y: number;
  maxHealth: number;
  health: number;
  lastProcessedSeq: number;
  axisX: number;
  axisY: number;
  questLog: QuestLog;
  lastAttackTick?: number;
  deadUntilTick?: number;
  lastAttackRequestId?: string;
  lastAttackResultCode?: string;
  lastAttackResultOk?: boolean;
  inventory?: PlayerInventory;
  equipment?: PlayerEquipment;
  derivedAttack?: number;
  gold?: number;
  progression?: CharacterProgression;
  lastCheckpointTick?: number;
  lastCheckpointX?: number;
  lastCheckpointY?: number;
}

export interface DisconnectedPlayer {
  player: MatchPlayer;
  expiresAtTick: number;
}

export interface MatchNpc {
  id: string;
  npcId: string;
  x: number;
  y: number;
}

export type EnemyAiState = "idle" | "chasing" | "attacking" | "returning" | "dead";

export interface MatchEnemy {
  id: string;
  enemyId: string;
  spawnX: number;
  spawnY: number;
  x: number;
  y: number;
  maxHealth: number;
  health: number;
  aiState: EnemyAiState;
  aggroTarget: string;
  lastAttackTick: number;
  deadUntilTick: number;
  damage: number;
  moveSpeed: number;
  aggroRadius: number;
  attackRange: number;
  attackCooldownSec: number;
  leashRadius: number;
  respawnDelaySec: number;
  xpReward: number;
  deathCount: number;
}

export interface StarterZoneState {
  zoneId: string;
  contentHash: string;
  emptyTicks: number;
  players: { [userId: string]: MatchPlayer };
  disconnected: { [userId: string]: DisconnectedPlayer };
  npcs: MatchNpc[];
  enemies: MatchEnemy[];
  loot: MatchLoot[];
  walkableBounds: Aabb;
  collisions: Aabb[];
  moveSpeed: number;
  playerHalfExtent: number;
  interactionRange: number;
  playerAttack: number;
  playerAttackRange: number;
  playerAttackCooldownSec: number;
  playerSpawnX: number;
  playerSpawnY: number;
  playerRespawnDelaySec: number;
  pickupRange: number;
  questsById: { [id: string]: QuestDefinition };
  itemsById: { [id: string]: ItemDefinition };
  enemyLootById: { [id: string]: LootDrop[] };
  actionRates: { [userId: string]: PlayerActionRate };
  progressionCatalog?: ProgressionCatalog;
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
  damage?: number;
  moveSpeed?: number;
  aggroRadius?: number;
  attackRange?: number;
  attackCooldown?: number;
  leashRadius?: number;
  respawnDelay?: number;
  loot?: ReadonlyArray<LootDrop>;
  xpReward?: number;
}

export interface PlayerContent {
  id: string;
  maxHealth: number;
  moveSpeed: number;
  interactionRange: number;
  attack?: number;
  attackRange?: number;
  attackCooldown?: number;
  respawnDelaySec?: number;
  pickupRange?: number;
}

export function enemyDefinitionsFromContent(enemies: {
  [id: string]: EnemyContent;
}): { [id: string]: EnemyContent } {
  const map: { [id: string]: EnemyContent } = {};
  const ids = Object.keys(enemies);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const def = enemies[id];
    map[id] = {
      id: def.id,
      maxHealth: def.maxHealth,
      damage: def.damage,
      moveSpeed: def.moveSpeed,
      aggroRadius: def.aggroRadius,
      attackRange: def.attackRange,
      attackCooldown: def.attackCooldown,
      leashRadius: def.leashRadius,
      respawnDelay: def.respawnDelay,
      loot: def.loot !== undefined ? copyLootDrops(def.loot) : undefined,
      xpReward: def.xpReward,
    };
  }
  return map;
}

export function createStarterZoneState(
  contentHash: string,
  zone: ZoneSpawnContent,
  enemiesById: { [id: string]: EnemyContent },
  playerContent: PlayerContent,
  questsById: { [id: string]: QuestDefinition },
  itemsById: { [id: string]: ItemDefinition } = {},
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
  const enemyLootById: { [id: string]: LootDrop[] } = {};
  const enemies: MatchEnemy[] = [];
  for (let i = 0; i < zone.enemies.length; i++) {
    const spawn = zone.enemies[i];
    const def = enemiesById[spawn.enemyId];
    const maxHealth = def !== undefined ? def.maxHealth : 1;
    enemies.push({
      id: spawn.enemyId + ":" + String(i),
      enemyId: spawn.enemyId,
      spawnX: spawn.x,
      spawnY: spawn.y,
      x: spawn.x,
      y: spawn.y,
      maxHealth: maxHealth,
      health: maxHealth,
      aiState: "idle",
      aggroTarget: "",
      lastAttackTick: -1,
      deadUntilTick: 0,
      damage: numberOr(def !== undefined ? def.damage : undefined, 2),
      moveSpeed: numberOr(def !== undefined ? def.moveSpeed : undefined, 45),
      aggroRadius: numberOr(def !== undefined ? def.aggroRadius : undefined, 128),
      attackRange: numberOr(def !== undefined ? def.attackRange : undefined, 28),
      attackCooldownSec: numberOr(def !== undefined ? def.attackCooldown : undefined, 1.4),
      leashRadius: numberOr(def !== undefined ? def.leashRadius : undefined, 256),
      respawnDelaySec: numberOr(def !== undefined ? def.respawnDelay : undefined, 10),
      xpReward: numberOr(def !== undefined ? def.xpReward : undefined, 0),
      deathCount: 0,
    });
    if (def !== undefined && def.loot !== undefined && enemyLootById[spawn.enemyId] === undefined) {
      enemyLootById[spawn.enemyId] = copyLootDrops(def.loot);
    }
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
    disconnected: {},
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
    playerAttack: numberOr(playerContent.attack, 4),
    playerAttackRange: numberOr(playerContent.attackRange, 40),
    playerAttackCooldownSec: numberOr(playerContent.attackCooldown, 0.7),
    playerSpawnX: zone.playerSpawn.x,
    playerSpawnY: zone.playerSpawn.y,
    playerRespawnDelaySec: numberOr(playerContent.respawnDelaySec, 3),
    pickupRange: numberOr(playerContent.pickupRange, 40),
    questsById: questsById,
    itemsById: itemsById,
    enemyLootById: enemyLootById,
    actionRates: emptyActionRates(),
  };
}

export function playerCount(state: StarterZoneState): number {
  return Object.keys(dict(state.players)).length;
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
    enemies: enemiesList(state),
    loot: publicLoot(state.loot),
    quests: questsFor(state, selfId),
    inventory: inventoryFor(state, selfId),
    equipment: equipmentFor(state, selfId),
    derived: derivedFor(state, selfId),
    wallet: walletFor(state, selfId),
    progression: progressionFor(state, selfId),
  });
}

export function buildSnapshot(state: StarterZoneState, tick: number): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    contentHash: state.contentHash,
    tick: tick,
    zoneId: state.zoneId,
    players: playersList(state),
    enemies: enemiesList(state),
    loot: publicLoot(state.loot),
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
    alive: player.health > 0,
    lastProcessedSeq: player.lastProcessedSeq,
  };
}

function publicEnemy(enemy: MatchEnemy): { [key: string]: unknown } {
  return {
    id: enemy.id,
    enemyId: enemy.enemyId,
    x: enemy.x,
    y: enemy.y,
    maxHealth: enemy.maxHealth,
    health: enemy.health,
    alive: enemy.health > 0 && enemy.aiState !== "dead",
    state: enemy.aiState,
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

function enemiesList(state: StarterZoneState): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  for (let i = 0; i < state.enemies.length; i++) {
    list.push(publicEnemy(state.enemies[i]));
  }
  return list;
}

function cloneEnemy(enemy: MatchEnemy): MatchEnemy {
  return {
    id: enemy.id,
    enemyId: enemy.enemyId,
    spawnX: enemy.spawnX,
    spawnY: enemy.spawnY,
    x: enemy.x,
    y: enemy.y,
    maxHealth: enemy.maxHealth,
    health: enemy.health,
    aiState: enemy.aiState,
    aggroTarget: enemy.aggroTarget,
    lastAttackTick: enemy.lastAttackTick,
    deadUntilTick: enemy.deadUntilTick,
    damage: enemy.damage,
    moveSpeed: enemy.moveSpeed,
    aggroRadius: enemy.aggroRadius,
    attackRange: enemy.attackRange,
    attackCooldownSec: enemy.attackCooldownSec,
    leashRadius: enemy.leashRadius,
    respawnDelaySec: enemy.respawnDelaySec,
    xpReward: enemy.xpReward !== undefined ? enemy.xpReward : 0,
    deathCount: enemy.deathCount !== undefined ? enemy.deathCount : 0,
  };
}

function cloneEnemies(enemies: MatchEnemy[]): MatchEnemy[] {
  const list: MatchEnemy[] = [];
  for (let i = 0; i < enemies.length; i++) {
    list.push(cloneEnemy(enemies[i]));
  }
  return list;
}

function numberOr(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return value;
}

function cloneMatchPlayer(p: MatchPlayer, state: StarterZoneState): MatchPlayer {
  const equipment = p.equipment != null ? p.equipment : emptyEquipment();
  const inventory = p.inventory != null ? p.inventory : emptyInventory();
  return {
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
    questLog: cloneQuestLog(p.questLog != null ? p.questLog : emptyQuestLog()),
    lastAttackTick: p.lastAttackTick != null ? p.lastAttackTick : -1,
    deadUntilTick: p.deadUntilTick != null ? p.deadUntilTick : 0,
    lastAttackRequestId: p.lastAttackRequestId != null ? p.lastAttackRequestId : "",
    lastAttackResultCode: p.lastAttackResultCode != null ? p.lastAttackResultCode : "",
    lastAttackResultOk: p.lastAttackResultOk === true,
    inventory: cloneInventory(inventory),
    equipment: cloneEquipment(equipment),
    derivedAttack:
      p.derivedAttack != null
        ? p.derivedAttack
        : derivedAttack(state.playerAttack, equipment, inventory, dict(state.itemsById)),
    gold: p.gold != null ? p.gold : 0,
    classId: p.classId,
    progression: p.progression != null ? cloneProgression(p.progression) : undefined,
    lastCheckpointTick: p.lastCheckpointTick,
    lastCheckpointX: p.lastCheckpointX,
    lastCheckpointY: p.lastCheckpointY,
  };
}

export function cloneStarterZoneState(state: StarterZoneState): StarterZoneState {
  const players: { [userId: string]: MatchPlayer } = {};
  const playerSource = dict(state.players);
  const ids = Object.keys(playerSource);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const p = playerSource[id];
    if (p == null) {
      continue;
    }
    players[id] = cloneMatchPlayer(p, state);
  }
  const disconnected: { [userId: string]: DisconnectedPlayer } = {};
  const parkedSource = dict(state.disconnected);
  const parkedIds = Object.keys(parkedSource);
  for (let d = 0; d < parkedIds.length; d++) {
    const parkedId = parkedIds[d];
    const parked = parkedSource[parkedId];
    if (parked == null || parked.player == null) {
      continue;
    }
    disconnected[parkedId] = {
      player: cloneMatchPlayer(parked.player, state),
      expiresAtTick: parked.expiresAtTick,
    };
  }
  return {
    zoneId: state.zoneId,
    contentHash: state.contentHash,
    emptyTicks: state.emptyTicks,
    players: players,
    disconnected: disconnected,
    npcs: Array.isArray(state.npcs) ? state.npcs : [],
    enemies: cloneEnemies(Array.isArray(state.enemies) ? state.enemies : []),
    loot: cloneLoot(Array.isArray(state.loot) ? state.loot : []),
    walkableBounds: state.walkableBounds,
    collisions: Array.isArray(state.collisions) ? state.collisions : [],
    moveSpeed: state.moveSpeed,
    playerHalfExtent: state.playerHalfExtent,
    interactionRange: state.interactionRange,
    playerAttack: state.playerAttack,
    playerAttackRange: state.playerAttackRange,
    playerAttackCooldownSec: state.playerAttackCooldownSec,
    playerSpawnX: state.playerSpawnX,
    playerSpawnY: state.playerSpawnY,
    playerRespawnDelaySec: state.playerRespawnDelaySec,
    pickupRange: state.pickupRange,
    questsById: dict(state.questsById),
    itemsById: dict(state.itemsById),
    enemyLootById: dict(state.enemyLootById),
    actionRates: cloneActionRates(state.actionRates),
    progressionCatalog: state.progressionCatalog,
  };
}

function inventoryFor(state: StarterZoneState, selfId: string): { [key: string]: unknown } {
  const player = state.players[selfId];
  if (player === undefined || player.inventory === undefined) {
    return publicInventory(emptyInventory());
  }
  return publicInventory(player.inventory);
}

function equipmentFor(state: StarterZoneState, selfId: string): { [key: string]: unknown } {
  const player = state.players[selfId];
  if (player === undefined || player.equipment === undefined) {
    return publicEquipment(emptyEquipment());
  }
  return publicEquipment(player.equipment);
}

function derivedFor(state: StarterZoneState, selfId: string): { [key: string]: unknown } {
  const player = state.players[selfId];
  if (player === undefined) {
    return publicDerived(state.playerAttack);
  }
  if (player.derivedAttack !== undefined) {
    return publicDerived(player.derivedAttack);
  }
  return publicDerived(
    derivedAttack(
      state.playerAttack,
      player.equipment !== undefined ? player.equipment : emptyEquipment(),
      player.inventory,
      state.itemsById,
    ),
  );
}

function progressionFor(state: StarterZoneState, selfId: string): { [key: string]: unknown } {
  const player = state.players[selfId];
  if (player === undefined || player.progression === undefined || state.progressionCatalog === undefined) {
    return {};
  }
  const classId = player.classId !== undefined ? player.classId : "";
  if (classId.length === 0) {
    return {};
  }
  const evaluated = evaluateStats(state.progressionCatalog, {
    classId: classId,
    level: player.progression.level,
    allocatedAttributes: player.progression.allocatedAttributes,
    equipmentModifiers: equipmentModifiersFromGear(player.equipment, player.inventory, state.itemsById),
    effectModifiers: emptyModifierMap(),
    percentModifiers: emptyModifierMap(),
    multiplyModifiers: emptyModifierMap(),
  });
  return publicProgression(state.progressionCatalog, classId, player.progression, evaluated.values);
}

function walletFor(state: StarterZoneState, selfId: string): { [key: string]: unknown } {
  const player = state.players[selfId];
  if (player === undefined || player.gold === undefined) {
    return publicWallet(0);
  }
  return publicWallet(player.gold);
}

function copyLootDrops(drops: ReadonlyArray<LootDrop>): LootDrop[] {
  const list: LootDrop[] = [];
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    list.push({
      itemId: drop.itemId,
      quantity: drop.quantity,
      guaranteed: drop.guaranteed,
    });
  }
  return list;
}

function questsFor(state: StarterZoneState, selfId: string): { [key: string]: unknown }[] {
  const player = state.players[selfId];
  if (player === undefined) {
    return [];
  }
  return publicQuestPayloads(player.questLog, state.questsById);
}
