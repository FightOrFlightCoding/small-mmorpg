import { NEVER_ATTACKED_TICK, cooldownTicks, type CombatEvent } from "./combat";
import { dict } from "./maps";
import type {
  EnemyContent,
  MatchEnemy,
  MatchSpawn,
  SpawnContent,
  StarterZoneState,
  ZoneSpawnContent,
} from "./match_state";

export function spawnDefinitionsFromContent(spawns: { [id: string]: SpawnContent }): { [id: string]: SpawnContent } {
  const map: { [id: string]: SpawnContent } = {};
  const ids = Object.keys(spawns);
  for (let i = 0; i < ids.length; i++) {
    const def = spawns[ids[i]];
    map[ids[i]] = {
      id: def.id,
      zoneId: def.zoneId,
      enemyId: def.enemyId,
      x: def.x,
      y: def.y,
      spawnCount: def.spawnCount,
      respawnDelay: def.respawnDelay,
      activationPolicy: def.activationPolicy,
      groupId: def.groupId,
    };
  }
  return map;
}

export function collectZoneSpawns(
  zone: ZoneSpawnContent,
  catalog: { [id: string]: SpawnContent } | undefined,
): SpawnContent[] {
  const list: SpawnContent[] = [];
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < zone.enemies.length; i++) {
    const placed = zone.enemies[i];
    const spawnId = placed.spawnId !== undefined && placed.spawnId.length > 0 ? placed.spawnId : "spawn.inline." + zone.id + "." + String(i);
    if (seen[spawnId] === true) {
      continue;
    }
    seen[spawnId] = true;
    const fromCatalog = catalog !== undefined ? catalog[spawnId] : undefined;
    if (fromCatalog !== undefined) {
      list.push(fromCatalog);
      continue;
    }
    list.push({
      id: spawnId,
      zoneId: zone.id,
      enemyId: placed.enemyId,
      x: placed.x,
      y: placed.y,
      spawnCount: placed.spawnCount !== undefined ? placed.spawnCount : 1,
      respawnDelay: placed.respawnDelay !== undefined ? placed.respawnDelay : 10,
      activationPolicy: placed.activationPolicy !== undefined ? placed.activationPolicy : "always",
      groupId: placed.groupId !== undefined ? placed.groupId : "group." + zone.id,
    });
  }
  const catalogIds = catalog !== undefined ? Object.keys(catalog) : [];
  catalogIds.sort();
  for (let i = 0; i < catalogIds.length; i++) {
    const source = catalog;
    if (source === undefined) {
      break;
    }
    const def = source[catalogIds[i]];
    if (def.zoneId !== zone.id || seen[def.id] === true) {
      continue;
    }
    seen[def.id] = true;
    list.push(def);
  }
  return list;
}

export function buildInitialCombatants(
  zone: ZoneSpawnContent,
  enemiesById: { [id: string]: EnemyContent },
  spawnCatalog: { [id: string]: SpawnContent } | undefined,
): { enemies: MatchEnemy[]; spawns: MatchSpawn[] } {
  const spawnDefs = collectZoneSpawns(zone, spawnCatalog);
  const enemies: MatchEnemy[] = [];
  const spawns: MatchSpawn[] = [];
  const instanceCount: { [enemyId: string]: number } = {};
  for (let i = 0; i < spawnDefs.length; i++) {
    const def = spawnDefs[i];
    const spawn = matchSpawnFrom(def);
    spawns.push(spawn);
    if (def.activationPolicy !== "always") {
      continue;
    }
    spawn.active = true;
    const created = spawnSlots(enemies, enemiesById, spawn, instanceCount);
    spawn.aliveSlots = created.length;
  }
  return { enemies: enemies, spawns: spawns };
}

export function activateSpawn(
  state: StarterZoneState,
  spawnId: string,
  enemiesById: { [id: string]: EnemyContent },
): MatchEnemy[] {
  const spawn = findSpawn(state, spawnId);
  if (spawn === null) {
    return [];
  }
  if (spawn.active === true && livingOrPendingForSpawn(state, spawn) >= spawn.spawnCount) {
    return [];
  }
  spawn.active = true;
  const instanceCount = countByEnemyId(state.enemies);
  const created = spawnSlots(state.enemies, enemiesById, spawn, instanceCount);
  spawn.aliveSlots = livingOrPendingForSpawn(state, spawn);
  return created;
}

export function tickRespawns(
  state: StarterZoneState,
  tick: number,
  events: CombatEvent[],
  enemiesById: { [id: string]: EnemyContent },
): void {
  if (state.spawns === undefined) {
    state.spawns = [];
  }
  for (let i = 0; i < state.spawns.length; i++) {
    const spawn = state.spawns[i];
    const pending = spawn.pendingRespawns !== undefined ? spawn.pendingRespawns : [];
    const kept: Array<{ slot: number; readyTick: number }> = [];
    for (let p = 0; p < pending.length; p++) {
      if (tick < pending[p].readyTick) {
        kept.push(pending[p]);
        continue;
      }
      if (slotOccupied(state, spawn.spawnId, pending[p].slot)) {
        kept.push(pending[p]);
        continue;
      }
      const instanceCount = countByEnemyId(state.enemies);
      const created = createEnemyAtSlot(state.enemies, enemiesById, spawn, pending[p].slot, instanceCount);
      if (created !== null) {
        events.push({
          type: "respawn",
          sourceId: "",
          sourceKind: "enemy",
          targetId: created.id,
          targetKind: "enemy",
          remainingHealth: created.health,
          x: created.x,
          y: created.y,
        });
      }
    }
    spawn.pendingRespawns = kept;
  }
}

export function respawnExistingIfDue(enemy: MatchEnemy, tick: number, events: CombatEvent[]): boolean {
  if (enemy.aiState !== "dead" && enemy.health > 0) {
    return false;
  }
  const until = enemy.deadUntilTick !== undefined ? enemy.deadUntilTick : 0;
  if (until <= 0 || tick < until) {
    return false;
  }
  respawnExisting(enemy, events);
  return true;
}

export function scheduleEnemyRespawn(state: StarterZoneState, enemy: MatchEnemy, tick: number, tickRate: number): void {
  const spawn = findSpawn(state, enemy.spawnId !== undefined ? enemy.spawnId : "");
  if (spawn === null) {
    return;
  }
  const slot = enemy.slotIndex !== undefined ? enemy.slotIndex : 0;
  const pending = spawn.pendingRespawns !== undefined ? spawn.pendingRespawns : [];
  for (let i = 0; i < pending.length; i++) {
    if (pending[i].slot === slot) {
      return;
    }
  }
  pending.push({
    slot: slot,
    readyTick: tick + cooldownTicks(spawn.respawnDelaySec, tickRate),
  });
  spawn.pendingRespawns = pending;
  spawn.deaths = (spawn.deaths !== undefined ? spawn.deaths : 0) + 1;
}

export function despawnSpawn(state: StarterZoneState, spawnId: string): void {
  const kept: MatchEnemy[] = [];
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].spawnId !== spawnId) {
      kept.push(state.enemies[i]);
    }
  }
  state.enemies = kept;
  const spawn = findSpawn(state, spawnId);
  if (spawn === null) {
    return;
  }
  spawn.pendingRespawns = [];
  spawn.active = false;
  spawn.aliveSlots = 0;
}

export function resetSpawnGroup(state: StarterZoneState, groupId: string, enemiesById: { [id: string]: EnemyContent }): void {
  const remaining: MatchEnemy[] = [];
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    const spawn = findSpawn(state, enemy.spawnId !== undefined ? enemy.spawnId : "");
    if (spawn !== null && spawn.groupId === groupId) {
      continue;
    }
    remaining.push(enemy);
  }
  state.enemies = remaining;
  for (let s = 0; s < state.spawns.length; s++) {
    const spawn = state.spawns[s];
    if (spawn.groupId !== groupId) {
      continue;
    }
    spawn.pendingRespawns = [];
    spawn.deaths = 0;
    spawn.aliveSlots = 0;
    if (spawn.activationPolicy === "always") {
      spawn.active = true;
      const instanceCount = countByEnemyId(state.enemies);
      spawnSlots(state.enemies, enemiesById, spawn, instanceCount);
      spawn.aliveSlots = spawn.spawnCount;
    } else {
      spawn.active = false;
    }
  }
}

export function resetEnemyToSpawn(enemy: MatchEnemy, restoreHealth: boolean): void {
  enemy.x = enemy.spawnX;
  enemy.y = enemy.spawnY;
  if (restoreHealth) {
    enemy.health = enemy.maxHealth;
  }
  enemy.aiState = "idle";
  enemy.aggroTarget = "";
  enemy.lastAttackTick = NEVER_ATTACKED_TICK;
  enemy.deadUntilTick = 0;
  enemy.threatByPlayerId = {};
  enemy.combatEnteredTick = 0;
  enemy.phaseId = firstPhaseId(enemy);
  enemy.phaseFlags = {};
  enemy.addDeaths = 0;
  enemy.abilityLoadout = copyIds(enemy.baseAbilityLoadout);
  enemy.activeCast = undefined;
  enemy.effects = [];
  enemy.abilityCooldowns = {};
  enemy.globalCooldownUntilTick = 0;
  enemy.moveSpeed = numberOr(enemy.baseMoveSpeed, enemy.moveSpeed);
  enemy.aggroRadius = numberOr(enemy.baseAggroRadius, enemy.aggroRadius);
  enemy.attackRange = numberOr(enemy.baseAttackRange, enemy.attackRange);
}

export function createEnemyFromDefinition(
  def: EnemyContent | undefined,
  spawn: MatchSpawn,
  slot: number,
  instanceId: string,
): MatchEnemy {
  const maxHealth = def !== undefined ? def.maxHealth : 1;
  const resources: { [id: string]: number } = {};
  const sourceResources = def !== undefined && def.resources !== undefined ? def.resources : [];
  for (let i = 0; i < sourceResources.length; i++) {
    resources[sourceResources[i].resourceId] = sourceResources[i].max;
  }
  const loadout = def !== undefined && def.abilityLoadout !== undefined ? copyIds(def.abilityLoadout) : [];
  return {
    id: instanceId,
    enemyId: spawn.enemyId,
    spawnId: spawn.spawnId,
    slotIndex: slot,
    spawnX: spawn.x,
    spawnY: spawn.y,
    x: spawn.x,
    y: spawn.y,
    maxHealth: maxHealth,
    health: maxHealth,
    aiState: "idle",
    aggroTarget: "",
    lastAttackTick: NEVER_ATTACKED_TICK,
    deadUntilTick: 0,
    damage: numberOr(def !== undefined ? def.damage : undefined, 2),
    moveSpeed: numberOr(def !== undefined ? def.moveSpeed : undefined, 45),
    aggroRadius: numberOr(def !== undefined ? def.aggroRadius : undefined, 128),
    attackRange: numberOr(def !== undefined ? def.attackRange : undefined, 28),
    attackCooldownSec: numberOr(def !== undefined ? def.attackCooldown : undefined, 1.4),
    leashRadius: numberOr(def !== undefined ? def.leashRadius : undefined, 256),
    respawnDelaySec: spawn.respawnDelaySec,
    xpReward: numberOr(def !== undefined ? def.xpReward : undefined, 0),
    deathCount: 0,
    effects: [],
    aiProfileId: def !== undefined && def.aiProfileId !== undefined ? def.aiProfileId : "",
    abilityLoadout: loadout,
    baseAbilityLoadout: copyIds(loadout),
    threatByPlayerId: {},
    combatEnteredTick: 0,
    phaseId: firstPhaseFromDef(def),
    phaseFlags: {},
    addDeaths: 0,
    lootTableId: def !== undefined && def.lootTableId !== undefined ? def.lootTableId : "",
    tags: def !== undefined && def.tags !== undefined ? copyIds(def.tags) : [],
    resources: resources,
    abilityCooldowns: {},
    globalCooldownUntilTick: 0,
    phases: def !== undefined && Array.isArray(def.phases) ? def.phases : [],
    baseMoveSpeed: numberOr(def !== undefined ? def.moveSpeed : undefined, 45),
    baseAggroRadius: numberOr(def !== undefined ? def.aggroRadius : undefined, 128),
    baseAttackRange: numberOr(def !== undefined ? def.attackRange : undefined, 28),
  };
}

export function cloneSpawn(spawn: MatchSpawn): MatchSpawn {
  const pending: Array<{ slot: number; readyTick: number }> = [];
  const source = spawn.pendingRespawns !== undefined ? spawn.pendingRespawns : [];
  for (let i = 0; i < source.length; i++) {
    pending.push({ slot: source[i].slot, readyTick: source[i].readyTick });
  }
  return {
    spawnId: spawn.spawnId,
    enemyId: spawn.enemyId,
    x: spawn.x,
    y: spawn.y,
    spawnCount: spawn.spawnCount,
    respawnDelaySec: spawn.respawnDelaySec,
    activationPolicy: spawn.activationPolicy,
    groupId: spawn.groupId,
    active: spawn.active === true,
    pendingRespawns: pending,
    deaths: spawn.deaths !== undefined ? spawn.deaths : 0,
    aliveSlots: spawn.aliveSlots !== undefined ? spawn.aliveSlots : 0,
  };
}

export function cloneSpawns(spawns: MatchSpawn[] | undefined): MatchSpawn[] {
  const list: MatchSpawn[] = [];
  const source = spawns !== undefined ? spawns : [];
  for (let i = 0; i < source.length; i++) {
    list.push(cloneSpawn(source[i]));
  }
  return list;
}

export function cloneEnemyCombatFields(enemy: MatchEnemy): Pick<
  MatchEnemy,
  | "spawnId"
  | "slotIndex"
  | "aiProfileId"
  | "abilityLoadout"
  | "baseAbilityLoadout"
  | "threatByPlayerId"
  | "combatEnteredTick"
  | "phaseId"
  | "phaseFlags"
  | "addDeaths"
  | "lootTableId"
  | "tags"
  | "resources"
  | "abilityCooldowns"
  | "globalCooldownUntilTick"
  | "activeCast"
  | "phases"
  | "baseMoveSpeed"
  | "baseAggroRadius"
  | "baseAttackRange"
> {
  return {
    spawnId: enemy.spawnId !== undefined ? enemy.spawnId : "",
    slotIndex: enemy.slotIndex !== undefined ? enemy.slotIndex : 0,
    aiProfileId: enemy.aiProfileId !== undefined ? enemy.aiProfileId : "",
    abilityLoadout: copyIds(enemy.abilityLoadout),
    baseAbilityLoadout: copyIds(enemy.baseAbilityLoadout),
    threatByPlayerId: copyNumberMap(enemy.threatByPlayerId),
    combatEnteredTick: enemy.combatEnteredTick !== undefined ? enemy.combatEnteredTick : 0,
    phaseId: enemy.phaseId !== undefined ? enemy.phaseId : "",
    phaseFlags: copyFlagMap(enemy.phaseFlags),
    addDeaths: enemy.addDeaths !== undefined ? enemy.addDeaths : 0,
    lootTableId: enemy.lootTableId !== undefined ? enemy.lootTableId : "",
    tags: copyIds(enemy.tags),
    resources: copyNumberMap(enemy.resources),
    abilityCooldowns: copyNumberMap(enemy.abilityCooldowns),
    globalCooldownUntilTick: enemy.globalCooldownUntilTick !== undefined ? enemy.globalCooldownUntilTick : 0,
    activeCast: cloneEnemyCast(enemy.activeCast),
    phases: Array.isArray(enemy.phases) ? enemy.phases : [],
    baseMoveSpeed: numberOr(enemy.baseMoveSpeed, enemy.moveSpeed),
    baseAggroRadius: numberOr(enemy.baseAggroRadius, enemy.aggroRadius),
    baseAttackRange: numberOr(enemy.baseAttackRange, enemy.attackRange),
  };
}

export function noteAddDeath(state: StarterZoneState, dead: MatchEnemy): void {
  const spawnId = dead.spawnId !== undefined ? dead.spawnId : "";
  if (spawnId.length === 0) {
    return;
  }
  for (let i = 0; i < state.enemies.length; i++) {
    const enemy = state.enemies[i];
    const phases = Array.isArray(enemy.phases) ? enemy.phases : [];
    for (let p = 0; p < phases.length; p++) {
      if (phases[p].triggerSpawnId === spawnId) {
        enemy.addDeaths = (enemy.addDeaths !== undefined ? enemy.addDeaths : 0) + 1;
      }
    }
  }
}

function matchSpawnFrom(def: SpawnContent): MatchSpawn {
  return {
    spawnId: def.id,
    enemyId: def.enemyId,
    x: def.x,
    y: def.y,
    spawnCount: def.spawnCount > 0 ? def.spawnCount : 1,
    respawnDelaySec: def.respawnDelay,
    activationPolicy: def.activationPolicy,
    groupId: def.groupId,
    active: false,
    pendingRespawns: [],
    deaths: 0,
    aliveSlots: 0,
  };
}

function spawnSlots(
  enemies: MatchEnemy[],
  enemiesById: { [id: string]: EnemyContent },
  spawn: MatchSpawn,
  instanceCount: { [enemyId: string]: number },
): MatchEnemy[] {
  const created: MatchEnemy[] = [];
  for (let slot = 0; slot < spawn.spawnCount; slot++) {
    if (slotOccupiedList(enemies, spawn.spawnId, slot)) {
      continue;
    }
    const enemy = createEnemyAtSlot(enemies, enemiesById, spawn, slot, instanceCount);
    if (enemy !== null) {
      created.push(enemy);
    }
  }
  return created;
}

function createEnemyAtSlot(
  enemies: MatchEnemy[],
  enemiesById: { [id: string]: EnemyContent },
  spawn: MatchSpawn,
  slot: number,
  instanceCount: { [enemyId: string]: number },
): MatchEnemy | null {
  const current = instanceCount[spawn.enemyId] !== undefined ? instanceCount[spawn.enemyId] : 0;
  const instanceId = spawn.enemyId + ":" + String(current);
  instanceCount[spawn.enemyId] = current + 1;
  const enemy = createEnemyFromDefinition(enemiesById[spawn.enemyId], spawn, slot, instanceId);
  enemies.push(enemy);
  return enemy;
}

function respawnExisting(enemy: MatchEnemy, events: CombatEvent[]): void {
  resetEnemyToSpawn(enemy, true);
  events.push({
    type: "respawn",
    sourceId: "",
    sourceKind: "enemy",
    targetId: enemy.id,
    targetKind: "enemy",
    remainingHealth: enemy.health,
    x: enemy.x,
    y: enemy.y,
  });
}

function findSpawn(state: StarterZoneState, spawnId: string): MatchSpawn | null {
  if (spawnId.length === 0) {
    return null;
  }
  for (let i = 0; i < state.spawns.length; i++) {
    if (state.spawns[i].spawnId === spawnId) {
      return state.spawns[i];
    }
  }
  return null;
}

function livingOrPendingForSpawn(state: StarterZoneState, spawn: MatchSpawn): number {
  let count = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].spawnId === spawn.spawnId) {
      count += 1;
    }
  }
  const pending = spawn.pendingRespawns !== undefined ? spawn.pendingRespawns : [];
  return count + pending.length;
}

function slotOccupied(state: StarterZoneState, spawnId: string, slot: number): boolean {
  return slotOccupiedList(state.enemies, spawnId, slot);
}

function slotOccupiedList(enemies: MatchEnemy[], spawnId: string, slot: number): boolean {
  for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].spawnId === spawnId && enemies[i].slotIndex === slot) {
      return true;
    }
  }
  return false;
}

function countByEnemyId(enemies: MatchEnemy[]): { [enemyId: string]: number } {
  const map: { [enemyId: string]: number } = {};
  for (let i = 0; i < enemies.length; i++) {
    const id = enemies[i].enemyId;
    const n = map[id] !== undefined ? map[id] : 0;
    const suffix = enemies[i].id.substring(id.length + 1);
    const parsed = Number(suffix);
    const next = isFinite(parsed) ? parsed + 1 : n + 1;
    map[id] = next > n ? next : n + 1;
  }
  return map;
}

function firstPhaseFromDef(def: EnemyContent | undefined): string {
  if (def === undefined || !Array.isArray(def.phases) || def.phases.length === 0) {
    return "";
  }
  return def.phases[0].id;
}

function firstPhaseId(enemy: MatchEnemy): string {
  if (!Array.isArray(enemy.phases) || enemy.phases.length === 0) {
    return "";
  }
  return enemy.phases[0].id;
}

function copyIds(ids: ReadonlyArray<string> | undefined): string[] {
  const list: string[] = [];
  const source = ids !== undefined ? ids : [];
  for (let i = 0; i < source.length; i++) {
    list.push(source[i]);
  }
  return list;
}

function copyNumberMap(map: { [id: string]: number } | undefined): { [id: string]: number } {
  const out: { [id: string]: number } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = source[keys[i]];
  }
  return out;
}

function cloneEnemyCast(cast: MatchEnemy["activeCast"]): MatchEnemy["activeCast"] {
  if (cast == null) {
    return undefined;
  }
  return {
    abilityId: cast.abilityId,
    casterId: cast.casterId,
    targetId: cast.targetId,
    targetX: cast.targetX,
    targetY: cast.targetY,
    startTick: cast.startTick,
    completionTick: cast.completionTick,
    channelUntilTick: cast.channelUntilTick,
    phase: cast.phase,
    interruptReason: cast.interruptReason,
    requestId: cast.requestId,
  };
}

function copyFlagMap(map: { [id: string]: boolean } | undefined): { [id: string]: boolean } {
  const out: { [id: string]: boolean } = {};
  const source = dict(map);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = source[keys[i]] === true;
  }
  return out;
}

function numberOr(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value)) {
    return fallback;
  }
  return value;
}
