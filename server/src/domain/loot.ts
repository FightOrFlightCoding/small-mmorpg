import { distance } from "./movement";
import {
  addOrStackItem,
  acceptItemFailureCode,
  cloneInventory,
  emptyInventory,
  rememberPickup,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { staleRevisionCode } from "./item_errors";
import { beginAcquisitionIntent, completeAcquisitionIntent } from "./item_txn";

export interface MatchLoot {
  id: string;
  itemId: string;
  quantity: number;
  instanceId: string;
  x: number;
  y: number;
  expiresAtTick: number;
  corpseId?: string;
  corpseEntryId?: string;
}

export const LOOT_TTL_SEC = 30;

export interface LootDrop {
  itemId: string;
  quantity: number;
  guaranteed?: boolean;
  kind?: "item" | "gold";
}

export interface PickupInput {
  playerHealth: number;
  playerX: number;
  playerY: number;
  inventory: PlayerInventory | undefined;
  lootId: string;
  requestId: string;
  loot: MatchLoot[];
  pickupRange: number;
  itemsById: { [id: string]: ItemDefinition };
  tick?: number;
  equippedItems?: ReadonlyArray<ItemInstance>;
  expectedRevision?: number;
  characterId?: string;
  nowMs?: number;
}

export interface PickupDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventory: PlayerInventory;
  loot: MatchLoot[];
}

export function lootExpireTicks(tickRate: number): number {
  return Math.round(LOOT_TTL_SEC * tickRate);
}

export function spawnGuaranteedLoot(
  loot: MatchLoot[],
  drops: ReadonlyArray<LootDrop> | undefined,
  x: number,
  y: number,
  tick: number,
  expireTicks: number,
  newId: () => string,
): MatchLoot[] {
  const guaranteed: LootDrop[] = [];
  if (drops !== undefined) {
    for (let i = 0; i < drops.length; i++) {
      if (drops[i].guaranteed === true) {
        guaranteed.push(drops[i]);
      }
    }
  }
  return spawnRolledLoot(loot, guaranteed, x, y, tick, expireTicks, newId);
}

export function spawnRolledLoot(
  loot: MatchLoot[],
  drops: ReadonlyArray<LootDrop> | undefined,
  x: number,
  y: number,
  tick: number,
  expireTicks: number,
  newId: () => string,
): MatchLoot[] {
  const next = cloneLoot(loot);
  if (drops === undefined) {
    return next;
  }
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    if (typeof drop.itemId !== "string" || drop.itemId.length === 0) {
      continue;
    }
    const quantity = drop.quantity > 0 ? drop.quantity : 1;
    next.push({
      id: newId(),
      itemId: drop.itemId,
      quantity: quantity,
      instanceId: newId(),
      x: x,
      y: y,
      expiresAtTick: tick + expireTicks,
    });
  }
  return next;
}

export function spawnCorpseSparkles(
  loot: MatchLoot[],
  corpseId: string,
  items: ReadonlyArray<{ entryId: string; itemId: string; quantity: number; instanceId: string; state: string }>,
  x: number,
  y: number,
  tick: number,
  expireTicks: number,
  newId: () => string,
): MatchLoot[] {
  const next = cloneLoot(loot);
  for (let i = 0; i < items.length; i++) {
    const entry = items[i];
    if (entry.state === "CLAIMED" || entry.state === "EXPIRED" || entry.itemId.length === 0) {
      continue;
    }
    next.push({
      id: newId(),
      itemId: entry.itemId,
      quantity: entry.quantity,
      instanceId: entry.instanceId,
      x: x,
      y: y,
      expiresAtTick: tick + expireTicks,
      corpseId: corpseId,
      corpseEntryId: entry.entryId,
    });
  }
  return next;
}

export function findMatchLoot(loot: ReadonlyArray<MatchLoot>, lootId: string): MatchLoot | null {
  return findLoot(loot, lootId);
}

export function removeCorpseLinkedLoot(loot: ReadonlyArray<MatchLoot>, corpseId: string, entryId?: string): MatchLoot[] {
  const next: MatchLoot[] = [];
  for (let i = 0; i < loot.length; i++) {
    const entity = loot[i];
    const linked = entity.corpseId !== undefined ? entity.corpseId : "";
    if (linked !== corpseId) {
      next.push(cloneLootEntity(entity));
      continue;
    }
    if (entryId !== undefined && entryId.length > 0) {
      const linkedEntry = entity.corpseEntryId !== undefined ? entity.corpseEntryId : "";
      if (linkedEntry !== entryId) {
        next.push(cloneLootEntity(entity));
      }
    }
  }
  return next;
}

export function expireLoot(loot: MatchLoot[], tick: number): MatchLoot[] {
  const next: MatchLoot[] = [];
  for (let i = 0; i < loot.length; i++) {
    if (loot[i].expiresAtTick > tick) {
      next.push(cloneLootEntity(loot[i]));
    }
  }
  return next;
}

export function publicLoot(loot: ReadonlyArray<MatchLoot>): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  for (let i = 0; i < loot.length; i++) {
    const entity = loot[i];
    list.push({
      id: entity.id,
      itemId: entity.itemId,
      quantity: entity.quantity,
      x: entity.x,
      y: entity.y,
      expiresAtTick: entity.expiresAtTick,
    });
  }
  return list;
}

export function cloneLoot(loot: ReadonlyArray<MatchLoot>): MatchLoot[] {
  const list: MatchLoot[] = [];
  for (let i = 0; i < loot.length; i++) {
    list.push(cloneLootEntity(loot[i]));
  }
  return list;
}

export function applyPickup(input: PickupInput): PickupDecision {
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const previous = inventory.pickupByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: inventory,
      loot: cloneLoot(input.loot),
    };
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return fail(stale, inventory, input.loot);
  }
  if (input.playerHealth <= 0) {
    return fail("player_dead", inventory, input.loot);
  }
  const entity = findLoot(input.loot, input.lootId);
  if (entity === null) {
    return fail("invalid_target", inventory, input.loot);
  }
  if (distance(input.playerX, input.playerY, entity.x, entity.y) > input.pickupRange) {
    return fail("out_of_range", inventory, input.loot);
  }
  const definition = input.itemsById[entity.itemId];
  if (definition === undefined) {
    return fail("invalid_id", inventory, input.loot);
  }
  const failCode = acceptItemFailureCode(
    inventory,
    entity.itemId,
    entity.quantity,
    definition,
    input.equippedItems,
  );
  if (failCode.length > 0) {
    return fail(failCode, inventory, input.loot);
  }
  const nowMs = input.nowMs !== undefined ? input.nowMs : 0;
  const characterId = input.characterId !== undefined ? input.characterId : "";
  const started = beginAcquisitionIntent({
    inventory: inventory,
    requestId: input.requestId,
    characterId: characterId,
    definitionId: entity.itemId,
    instanceId: entity.instanceId,
    quantity: entity.quantity,
    sourceId: entity.id,
    nowMs: nowMs,
    newIds: function () {
      return entity.instanceId;
    },
  });
  if (started.replay) {
    return {
      ok: true,
      code: "ok",
      replay: true,
      persist: false,
      inventory: started.inventory,
      loot: cloneLoot(input.loot),
    };
  }
  const granted = addOrStackItem(started.inventory, entity.itemId, entity.quantity, entity.instanceId, definition, {
    sourceType: "loot",
    sourceId: entity.id,
    createdAt: 0,
  });
  const completed = completeAcquisitionIntent(granted, started.intent, nowMs);
  const remembered = rememberPickup(completed, input.requestId, {
    ok: true,
    code: "ok",
    lootId: entity.id,
  }, input.tick);
  return {
    ok: true,
    code: "ok",
    replay: false,
    persist: true,
    inventory: remembered,
    loot: removeLoot(input.loot, entity.id),
  };
}

function fail(code: string, inventory: PlayerInventory, loot: ReadonlyArray<MatchLoot>): PickupDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    inventory: inventory,
    loot: cloneLoot(loot),
  };
}

function findLoot(loot: ReadonlyArray<MatchLoot>, lootId: string): MatchLoot | null {
  for (let i = 0; i < loot.length; i++) {
    if (loot[i].id === lootId) {
      return loot[i];
    }
  }
  return null;
}

function removeLoot(loot: ReadonlyArray<MatchLoot>, lootId: string): MatchLoot[] {
  const next: MatchLoot[] = [];
  for (let i = 0; i < loot.length; i++) {
    if (loot[i].id !== lootId) {
      next.push(cloneLootEntity(loot[i]));
    }
  }
  return next;
}

function cloneLootEntity(entity: MatchLoot): MatchLoot {
  const cloned: MatchLoot = {
    id: entity.id,
    itemId: entity.itemId,
    quantity: entity.quantity,
    instanceId: entity.instanceId,
    x: entity.x,
    y: entity.y,
    expiresAtTick: entity.expiresAtTick,
  };
  if (entity.corpseId !== undefined && entity.corpseId.length > 0) {
    cloned.corpseId = entity.corpseId;
  }
  if (entity.corpseEntryId !== undefined && entity.corpseEntryId.length > 0) {
    cloned.corpseEntryId = entity.corpseEntryId;
  }
  return cloned;
}
