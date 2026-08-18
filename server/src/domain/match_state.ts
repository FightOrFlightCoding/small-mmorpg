import { PROTOCOL_VERSION, ServerOpcode } from "./protocol";
import { PLAYER_HALF_EXTENT, SNAPSHOT_RATE_HZ, type Aabb } from "./movement";
import {
  cloneQuestLog,
  emptyQuestLog,
  publicQuestPayloads,
  type QuestDefinition,
  type QuestLog,
} from "./quest";
import { cloneInventory, emptyInventory, publicInventory, INVENTORY_CAPACITY, type ItemDefinition, type PlayerInventory } from "./inventory";
import {
  cloneEquipment,
  derivedAttack,
  emptyEquipment,
  publicDerived,
  publicEquipment,
  type EquipmentSlotContent,
  type PlayerEquipment,
} from "./equipment";
import { cloneLoot, publicLoot, type LootDrop, type MatchLoot } from "./loot";
import type { NpcDefinition } from "./npc";
import type { VendorDefinition } from "./vendor";
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
import {
  cloneActiveCast,
  cloneCooldownMap,
  cloneResourceMap,
  publicAbilityState,
  type AbilityDefinition,
  type ActiveCast,
} from "./ability";
import { cloneActiveEffects, effectModifiersFrom, hasControlTag, type ActiveEffect, type EffectDefinition } from "./effects";
import { buildInitialCombatants, cloneEnemyCombatFields, cloneSpawns } from "./spawn_controller";
import type { AiProfileContent } from "./threat";
import type { LootTableDefinition } from "./loot_table";
import { MAX_PARTY_SIZE, type GroupCreditRules } from "./party";
import { type MatchPartyCache } from "./party_credit";
import { cloneTrades, type TradeRecord } from "./trade";

export type { MatchLoot };

export const STARTER_ZONE_ID = "zone.starter";
export const STARTER_ZONE_LABEL = "zone.starter";
export const STARTER_ZONE_MODULE = "starter_zone";
export const MATCH_TICK_RATE = 10;
export const MATCH_SNAPSHOT_RATE_HZ = SNAPSHOT_RATE_HZ;
export const MATCH_MAX_PLAYERS = 8;
export const EMPTY_MATCH_TIMEOUT_SEC = 30;
export const EMPTY_MATCH_TIMEOUT_TICKS = MATCH_TICK_RATE * EMPTY_MATCH_TIMEOUT_SEC;
export const CAVE_ZONE_ID = "zone.cave";
export const PARTY_CAVE_LABEL = "party.cave";
export const CAVE_MATCH_MAX_PLAYERS = 5;
export const CAVE_EMPTY_TIMEOUT_SEC = 60;
export const CAVE_EMPTY_TIMEOUT_TICKS = MATCH_TICK_RATE * CAVE_EMPTY_TIMEOUT_SEC;
export const CAVE_RECONNECT_GRACE_SEC = 60;
export const CAVE_RECONNECT_GRACE_TICKS = MATCH_TICK_RATE * CAVE_RECONNECT_GRACE_SEC;
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
  resources?: { [id: string]: number };
  effects?: ActiveEffect[];
  activeCast?: ActiveCast;
  abilityCooldowns?: { [abilityId: string]: number };
  globalCooldownUntilTick?: number;
  abilityUseByRequestId?: { [requestId: string]: { ok: boolean; code: string } };
  abilityUseTicks?: { [requestId: string]: number };
  inCombat?: boolean;
  lastHostileActionTick?: number;
  lastDamageReceivedTick?: number;
  hostileTargetId?: string;
  friendlyTargetId?: string;
  bindX?: number;
  bindY?: number;
  bindZoneId?: string;
  innByRequestId?: { [requestId: string]: string };
  lastSetTargetRequestId?: string;
  lastSetTargetResultCode?: string;
  lastSetTargetResultOk?: boolean;
  lastReleaseRequestId?: string;
  lastReleaseResultCode?: string;
  lastReleaseResultOk?: boolean;
  lastDeathTick?: number;
  transferState?: "idle" | "issued" | "pending";
  transferIssuedAtTick?: number;
  caveEnterByRequestId?: { [requestId: string]: string };
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
  zoneId?: string;
  interactionRange?: number;
  dialogueId?: string;
}

export type EnemyAiState =
  | "idle"
  | "acquiring"
  | "chasing"
  | "positioning"
  | "casting"
  | "attacking"
  | "returning"
  | "stunned"
  | "dead";

export interface BossPhaseContent {
  id: string;
  healthPercentAtOrBelow?: number;
  combatTimeSecAtOrAbove?: number;
  addDeathsAtOrAbove?: number;
  requireFlag?: string;
  setFlag?: string;
  addAbilityIds?: ReadonlyArray<string>;
  removeAbilityIds?: ReadonlyArray<string>;
  moveSpeed?: number;
  aggroRadius?: number;
  attackRange?: number;
  triggerSpawnId?: string;
  combatMessage?: string;
  applyEffect?: EffectDefinition;
}

export interface MatchSpawn {
  spawnId: string;
  enemyId: string;
  x: number;
  y: number;
  spawnCount: number;
  respawnDelaySec: number;
  activationPolicy: "always" | "manual";
  groupId: string;
  active: boolean;
  pendingRespawns: Array<{ slot: number; readyTick: number }>;
  deaths: number;
  aliveSlots: number;
}

export interface SpawnContent {
  id: string;
  zoneId: string;
  enemyId: string;
  x: number;
  y: number;
  spawnCount: number;
  respawnDelay: number;
  activationPolicy: "always" | "manual";
  groupId: string;
}

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
  effects?: ActiveEffect[];
  spawnId?: string;
  slotIndex?: number;
  aiProfileId?: string;
  abilityLoadout?: string[];
  baseAbilityLoadout?: string[];
  threatByPlayerId?: { [userId: string]: number };
  combatEnteredTick?: number;
  phaseId?: string;
  phaseFlags?: { [flag: string]: boolean };
  addDeaths?: number;
  lootTableId?: string;
  tags?: string[];
  resources?: { [id: string]: number };
  abilityCooldowns?: { [abilityId: string]: number };
  globalCooldownUntilTick?: number;
  activeCast?: ActiveCast;
  phases?: ReadonlyArray<BossPhaseContent>;
  baseMoveSpeed?: number;
  baseAggroRadius?: number;
  baseAttackRange?: number;
}

export interface StarterZoneState {
  zoneId: string;
  contentHash: string;
  emptyTicks: number;
  players: { [userId: string]: MatchPlayer };
  disconnected: { [userId: string]: DisconnectedPlayer };
  npcs: MatchNpc[];
  enemies: MatchEnemy[];
  spawns: MatchSpawn[];
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
  enemiesById?: { [id: string]: EnemyContent };
  aiProfilesById?: { [id: string]: AiProfileContent };
  lootTablesById?: { [id: string]: LootTableDefinition };
  npcsById?: { [id: string]: NpcDefinition };
  vendorsById?: { [id: string]: VendorDefinition };
  processedDeathEventIds?: { [eventId: string]: boolean };
  actionRates: { [userId: string]: PlayerActionRate };
  progressionCatalog?: ProgressionCatalog;
  equipmentSlotsByTag?: { [tag: string]: EquipmentSlotContent };
  classEquipmentTags?: { [classId: string]: string[] };
  inventoryCapacity?: number;
  abilitiesById?: { [id: string]: AbilityDefinition };
  basicAbilityId?: string;
  classTags?: { [classId: string]: string[] };
  combatApplyByEventId?: { [eventId: string]: CombatApplyRecord };
  partyByCharacterId?: { [characterId: string]: MatchPartyCache };
  pendingInvitesByCharacterId?: {
    [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number };
  };
  groupCreditRules?: GroupCreditRules;
  instanceType?: "public_world" | "party_cave";
  instanceId?: string;
  ownerPartyId?: string;
  ownerCharacterId?: string;
  completionState?: "none" | "in_progress" | "boss_defeated";
  maxPlayers?: number;
  emptyTimeoutTicks?: number;
  reconnectGraceTicks?: number;
  wipeResetAtTick?: number;
  matchId?: string;
  trades: { [tradeId: string]: TradeRecord };
  tradeByCharacterId: { [characterId: string]: string };
}

export interface CombatApplyRecord {
  ok: boolean;
  code: string;
  amount: number;
  remainingHealth: number;
  died: boolean;
  tick: number;
  steps: string[];
  stages: {
    base: number;
    afterSource: number;
    afterTarget: number;
    afterMitigation: number;
    afterShields: number;
    finalAmount: number;
  };
}

export interface ZoneSpawnContent {
  id: string;
  playerSpawn: Vec2;
  npcs: ReadonlyArray<{ npcId: string; x: number; y: number }>;
  enemies: ReadonlyArray<{
    enemyId: string;
    x: number;
    y: number;
    spawnId?: string;
    spawnCount?: number;
    respawnDelay?: number;
    activationPolicy?: "always" | "manual";
    groupId?: string;
  }>;
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
  displayNameKey?: string;
  level?: number;
  defense?: number;
  abilityLoadout?: ReadonlyArray<string>;
  aiProfileId?: string;
  lootTableId?: string;
  collisionProfileId?: string;
  tags?: ReadonlyArray<string>;
  resources?: ReadonlyArray<{ resourceId: string; max: number }>;
  phases?: ReadonlyArray<BossPhaseContent>;
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
  inventoryCapacity?: number;
  basicAbilityId?: string;
}

export interface StarterZoneCatalogExtras {
  equipmentSlotsByTag?: { [tag: string]: EquipmentSlotContent };
  classEquipmentTags?: { [classId: string]: string[] };
  inventoryCapacity?: number;
  abilitiesById?: { [id: string]: AbilityDefinition };
  basicAbilityId?: string;
  classTags?: { [classId: string]: string[] };
  spawnsById?: { [id: string]: SpawnContent };
  aiProfilesById?: { [id: string]: AiProfileContent };
  lootTablesById?: { [id: string]: LootTableDefinition };
  npcsById?: { [id: string]: NpcDefinition };
  vendorsById?: { [id: string]: VendorDefinition };
  groupCreditRules?: GroupCreditRules;
  instanceType?: "public_world" | "party_cave";
  instanceId?: string;
  ownerPartyId?: string;
  ownerCharacterId?: string;
  completionState?: "none" | "in_progress" | "boss_defeated";
  maxPlayers?: number;
  emptyTimeoutTicks?: number;
  reconnectGraceTicks?: number;
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
      abilityLoadout: def.abilityLoadout !== undefined ? def.abilityLoadout.slice() : undefined,
      aiProfileId: def.aiProfileId,
      lootTableId: def.lootTableId,
      collisionProfileId: def.collisionProfileId,
      tags: def.tags !== undefined ? def.tags.slice() : undefined,
      resources: def.resources !== undefined ? def.resources.slice() : undefined,
      phases: def.phases,
      level: def.level,
      defense: def.defense,
      displayNameKey: def.displayNameKey,
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
  extras: StarterZoneCatalogExtras = {},
): StarterZoneState {
  const npcs: MatchNpc[] = [];
  for (let i = 0; i < zone.npcs.length; i++) {
    const spawn = zone.npcs[i];
    npcs.push({
      id: spawn.npcId,
      npcId: spawn.npcId,
      x: spawn.x,
      y: spawn.y,
      zoneId: zone.id,
      interactionRange:
        extras.npcsById !== undefined && extras.npcsById[spawn.npcId] !== undefined
          ? extras.npcsById[spawn.npcId].interactionRange
          : playerContent.interactionRange,
      dialogueId:
        extras.npcsById !== undefined && extras.npcsById[spawn.npcId] !== undefined
          ? extras.npcsById[spawn.npcId].dialogueId
          : "",
    });
  }
  const enemyLootById: { [id: string]: LootDrop[] } = {};
  const built = buildInitialCombatants(zone, enemiesById, extras.spawnsById);
  const enemies = built.enemies;
  const spawns = built.spawns;
  const enemyIds = Object.keys(enemiesById);
  for (let i = 0; i < enemyIds.length; i++) {
    const def = enemiesById[enemyIds[i]];
    if (def !== undefined && def.loot !== undefined && enemyLootById[def.id] === undefined) {
      enemyLootById[def.id] = copyLootDrops(def.loot);
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
    spawns: spawns,
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
    enemiesById: enemiesById,
    aiProfilesById: extras.aiProfilesById,
    lootTablesById: extras.lootTablesById,
    npcsById: extras.npcsById,
    vendorsById: extras.vendorsById,
    processedDeathEventIds: {},
    actionRates: emptyActionRates(),
    equipmentSlotsByTag: extras.equipmentSlotsByTag,
    classEquipmentTags: extras.classEquipmentTags,
    inventoryCapacity: numberOr(
      extras.inventoryCapacity !== undefined ? extras.inventoryCapacity : playerContent.inventoryCapacity,
      INVENTORY_CAPACITY,
    ),
    abilitiesById: extras.abilitiesById,
    basicAbilityId: extras.basicAbilityId !== undefined ? extras.basicAbilityId : playerContent.basicAbilityId,
    classTags: extras.classTags,
    combatApplyByEventId: {},
    partyByCharacterId: {},
    pendingInvitesByCharacterId: {},
    groupCreditRules: extras.groupCreditRules,
    instanceType: extras.instanceType !== undefined ? extras.instanceType : "public_world",
    instanceId: extras.instanceId !== undefined ? extras.instanceId : "world.public",
    ownerPartyId: extras.ownerPartyId,
    ownerCharacterId: extras.ownerCharacterId,
    completionState: extras.completionState !== undefined ? extras.completionState : "none",
    maxPlayers: numberOr(extras.maxPlayers, MATCH_MAX_PLAYERS),
    emptyTimeoutTicks: numberOr(extras.emptyTimeoutTicks, EMPTY_MATCH_TIMEOUT_TICKS),
    reconnectGraceTicks: numberOr(extras.reconnectGraceTicks, MATCH_TICK_RATE * 5),
    wipeResetAtTick: 0,
    matchId: "",
    trades: {},
    tradeByCharacterId: {},
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
    abilities: abilitiesFor(state, selfId, tick),
    party: partyFor(state, selfId),
    instance: instancePublic(state),
  });
}

export function partyViewForPlayer(state: StarterZoneState, selfId: string): { [key: string]: unknown } | null {
  return partyFor(state, selfId);
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
    resources: cloneResourceMap(player.resources),
    effects: publicEntityEffects(player.effects),
    activeCast: player.activeCast !== undefined ? cloneActiveCast(player.activeCast) : null,
    inCombat: player.inCombat === true,
    hostileTargetId: player.hostileTargetId !== undefined ? player.hostileTargetId : "",
    friendlyTargetId: player.friendlyTargetId !== undefined ? player.friendlyTargetId : "",
    deadUntilTick: player.deadUntilTick != null ? player.deadUntilTick : 0,
    stunned: hasControlTag(player.effects, "stun"),
    rooted: hasControlTag(player.effects, "root"),
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
    phaseId: enemy.phaseId !== undefined ? enemy.phaseId : "",
    aiProfileId: enemy.aiProfileId !== undefined ? enemy.aiProfileId : "",
    effects: publicEntityEffects(enemy.effects),
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
  const extra = cloneEnemyCombatFields(enemy);
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
    effects: cloneActiveEffects(enemy.effects),
    spawnId: extra.spawnId,
    slotIndex: extra.slotIndex,
    aiProfileId: extra.aiProfileId,
    abilityLoadout: extra.abilityLoadout,
    baseAbilityLoadout: extra.baseAbilityLoadout,
    threatByPlayerId: extra.threatByPlayerId,
    combatEnteredTick: extra.combatEnteredTick,
    phaseId: extra.phaseId,
    phaseFlags: extra.phaseFlags,
    addDeaths: extra.addDeaths,
    lootTableId: extra.lootTableId,
    tags: extra.tags,
    resources: extra.resources,
    abilityCooldowns: extra.abilityCooldowns,
    globalCooldownUntilTick: extra.globalCooldownUntilTick,
    activeCast: extra.activeCast,
    phases: extra.phases,
    baseMoveSpeed: extra.baseMoveSpeed,
    baseAggroRadius: extra.baseAggroRadius,
    baseAttackRange: extra.baseAttackRange,
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
    resources: cloneResourceMap(p.resources),
    effects: cloneActiveEffects(p.effects),
    activeCast: cloneActiveCast(p.activeCast),
    abilityCooldowns: cloneCooldownMap(p.abilityCooldowns),
    globalCooldownUntilTick: p.globalCooldownUntilTick != null ? p.globalCooldownUntilTick : 0,
    abilityUseByRequestId: cloneAbilityUseMap(p.abilityUseByRequestId),
    abilityUseTicks: cloneCooldownMap(p.abilityUseTicks),
    inCombat: p.inCombat === true,
    lastHostileActionTick: p.lastHostileActionTick != null ? p.lastHostileActionTick : -1,
    lastDamageReceivedTick: p.lastDamageReceivedTick != null ? p.lastDamageReceivedTick : -1,
    hostileTargetId: p.hostileTargetId != null ? String(p.hostileTargetId) : "",
    friendlyTargetId: p.friendlyTargetId != null ? String(p.friendlyTargetId) : "",
    bindX: typeof p.bindX === "number" && isFinite(p.bindX) ? p.bindX : undefined,
    bindY: typeof p.bindY === "number" && isFinite(p.bindY) ? p.bindY : undefined,
    bindZoneId: p.bindZoneId != null ? String(p.bindZoneId) : undefined,
    innByRequestId: dict(p.innByRequestId),
    lastSetTargetRequestId: p.lastSetTargetRequestId != null ? String(p.lastSetTargetRequestId) : "",
    lastSetTargetResultCode: p.lastSetTargetResultCode != null ? String(p.lastSetTargetResultCode) : "",
    lastSetTargetResultOk: p.lastSetTargetResultOk === true,
    lastReleaseRequestId: p.lastReleaseRequestId != null ? String(p.lastReleaseRequestId) : "",
    lastReleaseResultCode: p.lastReleaseResultCode != null ? String(p.lastReleaseResultCode) : "",
    lastReleaseResultOk: p.lastReleaseResultOk === true,
    lastDeathTick: p.lastDeathTick != null ? p.lastDeathTick : undefined,
    transferState: p.transferState !== undefined ? p.transferState : "idle",
    transferIssuedAtTick: typeof p.transferIssuedAtTick === "number" ? p.transferIssuedAtTick : undefined,
    caveEnterByRequestId: dict(p.caveEnterByRequestId),
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
    spawns: cloneSpawns(state.spawns),
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
    enemiesById: state.enemiesById,
    aiProfilesById: state.aiProfilesById,
    lootTablesById: state.lootTablesById,
    npcsById: state.npcsById,
    vendorsById: state.vendorsById,
    processedDeathEventIds: dict(state.processedDeathEventIds),
    actionRates: cloneActionRates(state.actionRates),
    progressionCatalog: state.progressionCatalog,
    equipmentSlotsByTag: state.equipmentSlotsByTag,
    classEquipmentTags: state.classEquipmentTags,
    inventoryCapacity: state.inventoryCapacity,
    abilitiesById: state.abilitiesById,
    basicAbilityId: state.basicAbilityId,
    classTags: state.classTags,
    combatApplyByEventId: cloneCombatApplyMap(state.combatApplyByEventId),
    partyByCharacterId: clonePartyCache(state.partyByCharacterId),
    pendingInvitesByCharacterId: clonePendingInvites(state.pendingInvitesByCharacterId),
    groupCreditRules: state.groupCreditRules,
    instanceType: state.instanceType !== undefined ? state.instanceType : "public_world",
    instanceId: state.instanceId !== undefined ? state.instanceId : "world.public",
    ownerPartyId: state.ownerPartyId,
    ownerCharacterId: state.ownerCharacterId,
    completionState: state.completionState !== undefined ? state.completionState : "none",
    maxPlayers: typeof state.maxPlayers === "number" ? state.maxPlayers : MATCH_MAX_PLAYERS,
    emptyTimeoutTicks: typeof state.emptyTimeoutTicks === "number" ? state.emptyTimeoutTicks : EMPTY_MATCH_TIMEOUT_TICKS,
    reconnectGraceTicks: typeof state.reconnectGraceTicks === "number" ? state.reconnectGraceTicks : MATCH_TICK_RATE * 5,
    wipeResetAtTick: typeof state.wipeResetAtTick === "number" ? state.wipeResetAtTick : 0,
    matchId: state.matchId !== undefined ? state.matchId : "",
    trades: cloneTrades(state.trades),
    tradeByCharacterId: dict(state.tradeByCharacterId),
  };
}

function instancePublic(state: StarterZoneState): { [key: string]: unknown } {
  const instanceType = state.instanceType !== undefined ? state.instanceType : "public_world";
  let bossAlive = false;
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    if (enemy === undefined) {
      continue;
    }
    const tags = enemy.tags !== undefined ? enemy.tags : [];
    if (tags.indexOf("boss") !== -1 && enemy.health > 0) {
      bossAlive = true;
      break;
    }
  }
  return {
    type: instanceType,
    instanceId: state.instanceId !== undefined ? state.instanceId : "world.public",
    zoneTemplateId: state.zoneId,
    completionState: state.completionState !== undefined ? state.completionState : "none",
    bossAlive: bossAlive,
    ownerPartyId: state.ownerPartyId !== undefined ? state.ownerPartyId : "",
    ownerCharacterId: state.ownerCharacterId !== undefined ? state.ownerCharacterId : "",
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
    effectModifiers: effectModifiersFrom(player.effects),
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

function abilitiesFor(state: StarterZoneState, selfId: string, tick: number): { [key: string]: unknown } {
  const player = state.players[selfId];
  if (player === undefined) {
    return {};
  }
  return publicAbilityState(player, tick);
}

function partyFor(state: StarterZoneState, selfId: string): { [key: string]: unknown } | null {
  const player = state.players[selfId];
  if (player === undefined || player.characterId.length === 0) {
    return pendingInviteFor(state, "");
  }
  const cache = state.partyByCharacterId !== undefined ? state.partyByCharacterId[player.characterId] : undefined;
  if (cache === undefined) {
    return pendingInviteFor(state, player.characterId);
  }
  const members: { [key: string]: unknown }[] = [];
  for (let i = 0; i < cache.members.length; i++) {
    const member = cache.members[i];
    const live = playerByCharacterId(state, member.characterId);
    const row: { [key: string]: unknown } = {
      accountUserId: member.accountUserId,
      characterId: member.characterId,
      displayName: member.displayName,
      connectionState: member.connectionState,
      isLeader: member.characterId === cache.leaderCharacterId,
      inMatch: live !== null,
    };
    if (live !== null) {
      row.health = live.health;
      row.maxHealth = live.maxHealth;
      row.resources = cloneResourceMap(live.resources);
    }
    members.push(row);
  }
  return {
    partyId: cache.partyId,
    leaderCharacterId: cache.leaderCharacterId,
    revision: cache.revision,
    lootPolicy: cache.lootPolicy,
    maxSize: MAX_PARTY_SIZE,
    members: members,
    pendingInvite: pendingInvitePayload(state, player.characterId),
  };
}

function pendingInviteFor(state: StarterZoneState, characterId: string): { [key: string]: unknown } | null {
  const pending = pendingInvitePayload(state, characterId);
  if (pending === null) {
    return null;
  }
  return { partyId: "", members: [], pendingInvite: pending };
}

function pendingInvitePayload(
  state: StarterZoneState,
  characterId: string,
): { partyId: string; fromDisplayName: string; expiresAt: number } | null {
  if (characterId.length === 0 || state.pendingInvitesByCharacterId === undefined) {
    return null;
  }
  const row = state.pendingInvitesByCharacterId[characterId];
  return row !== undefined ? row : null;
}

function playerByCharacterId(state: StarterZoneState, characterId: string): MatchPlayer | null {
  const ids = Object.keys(state.players);
  for (let i = 0; i < ids.length; i++) {
    const player = state.players[ids[i]];
    if (player !== undefined && player.characterId === characterId) {
      return player;
    }
  }
  return null;
}

function clonePartyCache(
  source: { [characterId: string]: MatchPartyCache } | undefined,
): { [characterId: string]: MatchPartyCache } {
  const out: { [characterId: string]: MatchPartyCache } = {};
  const map = dict(source);
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    const members = [];
    for (let m = 0; m < row.members.length; m++) {
      members.push({
        accountUserId: row.members[m].accountUserId,
        characterId: row.members[m].characterId,
        displayName: row.members[m].displayName,
        connectionState: row.members[m].connectionState,
      });
    }
    out[keys[i]] = {
      partyId: row.partyId,
      revision: row.revision,
      leaderCharacterId: row.leaderCharacterId,
      lootPolicy: row.lootPolicy,
      members: members,
    };
  }
  return out;
}

function clonePendingInvites(
  source:
    | { [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number } }
    | undefined,
): { [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number } } {
  const out: { [characterId: string]: { partyId: string; fromDisplayName: string; expiresAt: number } } = {};
  const map = dict(source);
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    const row = map[keys[i]];
    out[keys[i]] = {
      partyId: row.partyId,
      fromDisplayName: row.fromDisplayName,
      expiresAt: row.expiresAt,
    };
  }
  return out;
}

function publicEntityEffects(effects: ActiveEffect[] | undefined): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  const source = effects !== undefined ? effects : [];
  for (let i = 0; i < source.length; i++) {
    list.push({
      effectId: source[i].effectId,
      abilityId: source[i].abilityId,
      type: source[i].type,
      stacks: source[i].stacks,
      remainingTicks: source[i].remainingTicks,
      tags: source[i].tags,
    });
  }
  return list;
}

function cloneAbilityUseMap(
  map: { [requestId: string]: { ok: boolean; code: string } } | undefined,
): { [requestId: string]: { ok: boolean; code: string } } {
  const out: { [requestId: string]: { ok: boolean; code: string } } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const row = source[keys[i]];
    if (row == null) {
      continue;
    }
    out[keys[i]] = { ok: row.ok === true, code: row.code };
  }
  return out;
}

function cloneCombatApplyMap(
  map: { [eventId: string]: CombatApplyRecord } | undefined,
): { [eventId: string]: CombatApplyRecord } {
  const out: { [eventId: string]: CombatApplyRecord } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const row = source[keys[i]];
    if (row == null) {
      continue;
    }
    out[keys[i]] = {
      ok: row.ok === true,
      code: String(row.code),
      amount: typeof row.amount === "number" && isFinite(row.amount) ? row.amount : 0,
      remainingHealth: typeof row.remainingHealth === "number" && isFinite(row.remainingHealth) ? row.remainingHealth : 0,
      died: row.died === true,
      tick: typeof row.tick === "number" && isFinite(row.tick) ? row.tick : 0,
      steps: Array.isArray(row.steps) ? row.steps.slice() : [],
      stages: {
        base: numberOr(row.stages !== undefined ? row.stages.base : undefined, 0),
        afterSource: numberOr(row.stages !== undefined ? row.stages.afterSource : undefined, 0),
        afterTarget: numberOr(row.stages !== undefined ? row.stages.afterTarget : undefined, 0),
        afterMitigation: numberOr(row.stages !== undefined ? row.stages.afterMitigation : undefined, 0),
        afterShields: numberOr(row.stages !== undefined ? row.stages.afterShields : undefined, 0),
        finalAmount: numberOr(row.stages !== undefined ? row.stages.finalAmount : undefined, 0),
      },
    };
  }
  return out;
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
