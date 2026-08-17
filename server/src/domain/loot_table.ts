import type { LootDrop } from "./loot";
import { lootExpireTicks, spawnRolledLoot } from "./loot";
import type { CombatEvent } from "./combat";
import type { StarterZoneState } from "./match_state";
import { dict } from "./maps";
import { noopPartyCredit, partyCreditFromThreat, type PartyCreditSink } from "./party_credit";

export interface LootTableEntry {
  itemDefinitionId: string;
  minimumQuantity: number;
  maximumQuantity: number;
  chance: number;
  weight?: number;
  groupId?: string;
  guaranteed?: boolean;
  ownershipPolicy?: string;
}

export interface LootTableDefinition {
  id: string;
  ownershipPolicy: string;
  entries: ReadonlyArray<LootTableEntry>;
}

export function deathEventId(instanceId: string, deathCount: number): string {
  return "kill:" + instanceId + ":" + String(deathCount);
}

export function applyEnemyDeathSideEffects(
  state: StarterZoneState,
  events: CombatEvent[],
  tick: number,
  tickRate: number,
  newId: () => string,
  partyCredit: PartyCreditSink = noopPartyCredit,
): void {
  const expireTicks = lootExpireTicks(tickRate);
  const processed = dict(state.processedDeathEventIds);
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== "death" || event.targetKind !== "enemy") {
      continue;
    }
    const enemy = findEnemyInState(state, event.targetId);
    if (enemy === null) {
      continue;
    }
    const eventId = deathEventId(enemy.id, enemy.deathCount);
    if (processed[eventId] === true) {
      continue;
    }
    processed[eventId] = true;
    state.processedDeathEventIds = processed;
    partyCredit(
      partyCreditFromThreat(eventId, enemy.enemyId, enemy.id, enemy.threatByPlayerId, event.sourceId),
    );
    const tableId = enemy.lootTableId !== undefined ? enemy.lootTableId : "";
    const catalog = state.lootTablesById;
    let table = catalog !== undefined && tableId.length > 0 ? catalog[tableId] : undefined;
    if (table == null || !Array.isArray(table.entries)) {
      table = inlineLootAsTable(enemy.enemyId, state.enemyLootById[enemy.enemyId]);
    }
    const drops = rollLootTable(table, lcgRng(hashSeed(eventId)));
    state.loot = spawnRolledLoot(
      state.loot,
      drops,
      event.x !== undefined ? event.x : enemy.x,
      event.y !== undefined ? event.y : enemy.y,
      tick,
      expireTicks,
      newId,
    );
  }
}

function findEnemyInState(state: StarterZoneState, enemyId: string) {
  for (let i = 0; i < state.enemies.length; i++) {
    if (state.enemies[i].id === enemyId) {
      return state.enemies[i];
    }
  }
  return null;
}

export function lootTablesFromContent(tables: {
  [id: string]: LootTableDefinition;
}): { [id: string]: LootTableDefinition } {
  const map: { [id: string]: LootTableDefinition } = {};
  const ids = Object.keys(tables);
  for (let i = 0; i < ids.length; i++) {
    map[ids[i]] = copyTable(tables[ids[i]]);
  }
  return map;
}

export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = mul32(hash, 16777619);
  }
  return hash >>> 0;
}

export function lcgRng(seed: number): () => number {
  let state = seed === 0 ? 1 : seed >>> 0;
  return function () {
    state = (mul32(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function rollLootTable(
  table: LootTableDefinition | undefined,
  rng: () => number,
): LootDrop[] {
  const drops: LootDrop[] = [];
  if (table == null || !Array.isArray(table.entries)) {
    return drops;
  }
  const grouped: { [groupId: string]: LootTableEntry[] } = {};
  for (let i = 0; i < table.entries.length; i++) {
    const entry: LootTableEntry | undefined = table.entries[i];
    if (entry == null) {
      continue;
    }
    const groupId = typeof entry.groupId === "string" ? entry.groupId : "";
    if (groupId.length > 0) {
      if (grouped[groupId] === undefined) {
        grouped[groupId] = [];
      }
      grouped[groupId].push(entry);
      continue;
    }
    if (entry.guaranteed === true || entry.chance >= 1) {
      pushRolled(drops, entry, rng);
      continue;
    }
    if (entry.chance > 0 && rng() < entry.chance) {
      pushRolled(drops, entry, rng);
    }
  }
  const groupIds = Object.keys(grouped);
  groupIds.sort();
  for (let g = 0; g < groupIds.length; g++) {
    const picked = pickWeighted(grouped[groupIds[g]], rng);
    if (picked !== null) {
      pushRolled(drops, picked, rng);
    }
  }
  return drops;
}

export function inlineLootAsTable(enemyId: string, drops: ReadonlyArray<LootDrop> | undefined): LootTableDefinition | undefined {
  if (drops == null || !Array.isArray(drops) || drops.length === 0) {
    return undefined;
  }
  const entries: LootTableEntry[] = [];
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    entries.push({
      itemDefinitionId: drop.itemId,
      minimumQuantity: drop.quantity,
      maximumQuantity: drop.quantity,
      chance: drop.guaranteed === true ? 1 : 0,
      guaranteed: drop.guaranteed === true,
    });
  }
  return {
    id: "inline." + enemyId,
    ownershipPolicy: "ground_free",
    entries: entries,
  };
}

function pushRolled(drops: LootDrop[], entry: LootTableEntry, rng: () => number): void {
  const min = entry.minimumQuantity > 0 ? entry.minimumQuantity : 1;
  const max = entry.maximumQuantity >= min ? entry.maximumQuantity : min;
  const span = max - min + 1;
  const quantity = min + Math.floor(rng() * span);
  drops.push({
    itemId: entry.itemDefinitionId,
    quantity: quantity,
    guaranteed: entry.guaranteed === true,
  });
}

function pickWeighted(entries: ReadonlyArray<LootTableEntry>, rng: () => number): LootTableEntry | null {
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i].weight;
    const weight = typeof raw === "number" ? raw : 0;
    if (weight > 0) {
      total += weight;
    }
  }
  if (total <= 0) {
    return null;
  }
  let cursor = rng() * total;
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i].weight;
    const weight = typeof raw === "number" ? raw : 0;
    if (weight <= 0) {
      continue;
    }
    if (cursor < weight) {
      return entries[i];
    }
    cursor -= weight;
  }
  return entries[entries.length - 1];
}

function mul32(a: number, b: number): number {
  return (a * b) >>> 0;
}

function copyTable(table: LootTableDefinition): LootTableDefinition {
  const entries: LootTableEntry[] = [];
  const source = Array.isArray(table.entries) ? table.entries : [];
  for (let i = 0; i < source.length; i++) {
    const entry = source[i];
    if (entry == null) {
      continue;
    }
    entries.push({
      itemDefinitionId: entry.itemDefinitionId,
      minimumQuantity: entry.minimumQuantity,
      maximumQuantity: entry.maximumQuantity,
      chance: entry.chance,
      weight: entry.weight,
      groupId: entry.groupId,
      guaranteed: entry.guaranteed,
      ownershipPolicy: entry.ownershipPolicy,
    });
  }
  return {
    id: table.id,
    ownershipPolicy: table.ownershipPolicy,
    entries: entries,
  };
}
