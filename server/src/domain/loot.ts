import { distance } from "./movement";
import {
  addOrStackItem,
  canAcceptItem,
  cloneInventory,
  emptyInventory,
  rememberPickup,
  type ItemDefinition,
  type PlayerInventory,
} from "./inventory";

export interface MatchLoot {
  id: string;
  itemId: string;
  quantity: number;
  instanceId: string;
  x: number;
  y: number;
  expiresAtTick: number;
}

export const LOOT_TTL_SEC = 30;

export interface LootDrop {
  itemId: string;
  quantity: number;
  guaranteed?: boolean;
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
  const next = cloneLoot(loot);
  if (drops === undefined) {
    return next;
  }
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    if (drop.guaranteed !== true) {
      continue;
    }
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
  if (previous !== undefined && previous.ok) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: inventory,
      loot: cloneLoot(input.loot),
    };
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
  if (!canAcceptItem(inventory, entity.itemId, entity.quantity, definition)) {
    return fail("inventory_full", inventory, input.loot);
  }
  const granted = addOrStackItem(inventory, entity.itemId, entity.quantity, entity.instanceId, definition);
  const remembered = rememberPickup(granted, input.requestId, {
    ok: true,
    code: "ok",
    lootId: entity.id,
  });
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
  return {
    id: entity.id,
    itemId: entity.itemId,
    quantity: entity.quantity,
    instanceId: entity.instanceId,
    x: entity.x,
    y: entity.y,
    expiresAtTick: entity.expiresAtTick,
  };
}
