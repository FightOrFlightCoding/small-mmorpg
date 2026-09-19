import { rarityRank } from "./corpse";
import {
  applyCapacityPlan,
  planCapacity,
} from "./item_capacity";
import {
  ITEM_ERROR_INVENTORY_FULL,
  ITEM_ERROR_INVALID_QUANTITY,
  ITEM_ERROR_ITEM_LOCKED,
  staleRevisionCode,
} from "./item_errors";
import { beginAcquisitionIntent, completeAcquisitionIntent, executeDropIntent } from "./item_txn";
import {
  cloneInventory,
  emptyInventory,
  findItem,
  isItemLocked,
  itemIsDroppable,
  rememberPickup,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { equippedInstanceIds, type PlayerEquipment } from "./equipment";
import { cloneOverflow, emptyOverflow, type MigrationOverflow } from "./overflow";
import { depenetrate, distance, pointBlocked, resolveMove, type Aabb, type Vec2 } from "./movement";

export const GROUND_ITEM_TTL_SEC = 300;
export const PLAYER_GROUND_DROP_LIMIT = 20;
export const GROUND_DROP_RADIUS_PX = 24;
export const GROUND_DROP_HALF_EXTENT = 4;
export const GROUND_ITEM_NO_LONGER_AVAILABLE = "ground_item_no_longer_available";
export const GROUND_DROP_LIMIT_CODE = "ground_drop_limit";

export const GROUND_PUBLIC_AVAILABLE = "PUBLIC_AVAILABLE";
export const GROUND_CLAIMING = "CLAIMING";
export const GROUND_CLAIMED = "CLAIMED";
export const GROUND_EXPIRED = "EXPIRED";

export type GroundItemState =
  | typeof GROUND_PUBLIC_AVAILABLE
  | typeof GROUND_CLAIMING
  | typeof GROUND_CLAIMED
  | typeof GROUND_EXPIRED;

export interface GroundItem {
  groundEntityId: string;
  itemInstanceId: string;
  itemId: string;
  quantity: number;
  x: number;
  y: number;
  createdByCharacterId: string;
  createdAtTick: number;
  expiresAtTick: number;
  state: GroundItemState;
  revision: number;
  rarity: string;
}

export function groundExpireTicks(tickRate: number): number {
  return Math.round(GROUND_ITEM_TTL_SEC * tickRate);
}

export function cloneGroundItem(entity: GroundItem): GroundItem {
  return {
    groundEntityId: entity.groundEntityId,
    itemInstanceId: entity.itemInstanceId,
    itemId: entity.itemId,
    quantity: entity.quantity,
    x: entity.x,
    y: entity.y,
    createdByCharacterId: entity.createdByCharacterId,
    createdAtTick: entity.createdAtTick,
    expiresAtTick: entity.expiresAtTick,
    state: entity.state,
    revision: entity.revision,
    rarity: entity.rarity,
  };
}

export function cloneGroundItems(items: ReadonlyArray<GroundItem> | undefined): GroundItem[] {
  const list: GroundItem[] = [];
  if (items === undefined) {
    return list;
  }
  for (let i = 0; i < items.length; i++) {
    list.push(cloneGroundItem(items[i]));
  }
  return list;
}

export function publicGroundItems(items: ReadonlyArray<GroundItem> | undefined): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  const source = items !== undefined ? items : [];
  for (let i = 0; i < source.length; i++) {
    const entity = source[i];
    if (entity.state !== GROUND_PUBLIC_AVAILABLE && entity.state !== GROUND_CLAIMING) {
      continue;
    }
    list.push({
      id: entity.groundEntityId,
      groundEntityId: entity.groundEntityId,
      itemId: entity.itemId,
      quantity: entity.quantity,
      x: entity.x,
      y: entity.y,
      expiresAtTick: entity.expiresAtTick,
      rarity: entity.rarity,
      state: entity.state,
    });
  }
  return list;
}

export function findGroundItem(items: ReadonlyArray<GroundItem> | undefined, groundEntityId: string): GroundItem | null {
  if (items === undefined || groundEntityId.length === 0) {
    return null;
  }
  for (let i = 0; i < items.length; i++) {
    if (items[i].groundEntityId === groundEntityId) {
      return items[i];
    }
  }
  return null;
}

export function countActiveGroundDrops(
  items: ReadonlyArray<GroundItem> | undefined,
  characterId: string,
): number {
  if (items === undefined || characterId.length === 0) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    const entity = items[i];
    if (entity.createdByCharacterId !== characterId) {
      continue;
    }
    if (entity.state === GROUND_PUBLIC_AVAILABLE || entity.state === GROUND_CLAIMING) {
      count += 1;
    }
  }
  return count;
}

export function expireGroundItems(
  items: ReadonlyArray<GroundItem> | undefined,
  tick: number,
): { items: GroundItem[]; removed: GroundItem[] } {
  const kept: GroundItem[] = [];
  const removed: GroundItem[] = [];
  const source = items !== undefined ? items : [];
  for (let i = 0; i < source.length; i++) {
    const entity = cloneGroundItem(source[i]);
    if (entity.state === GROUND_CLAIMED) {
      continue;
    }
    if (entity.expiresAtTick <= tick || entity.state === GROUND_EXPIRED) {
      entity.state = GROUND_EXPIRED;
      entity.revision += 1;
      removed.push(entity);
      continue;
    }
    kept.push(entity);
  }
  return { items: kept, removed: removed };
}

export function removeGroundItem(items: ReadonlyArray<GroundItem> | undefined, groundEntityId: string): GroundItem[] {
  const next: GroundItem[] = [];
  const source = items !== undefined ? items : [];
  for (let i = 0; i < source.length; i++) {
    if (source[i].groundEntityId !== groundEntityId) {
      next.push(cloneGroundItem(source[i]));
    }
  }
  return next;
}

export function placeGroundDrop(input: {
  x: number;
  y: number;
  hintDx?: number;
  hintDy?: number;
  facingX?: number;
  facingY?: number;
  collisions: ReadonlyArray<Aabb>;
  walkableBounds: Aabb;
  halfExtent?: number;
  radiusPx?: number;
}): Vec2 {
  const half = input.halfExtent !== undefined ? input.halfExtent : GROUND_DROP_HALF_EXTENT;
  const radius = input.radiusPx !== undefined ? input.radiusPx : GROUND_DROP_RADIUS_PX;
  const origin = depenetrate(input.x, input.y, half, input.collisions, input.walkableBounds);
  const dir = dropDirection(input.hintDx, input.hintDy, input.facingX, input.facingY);
  const candidates: Vec2[] = [
    { x: origin.x + dir.x * radius, y: origin.y + dir.y * radius },
  ];
  const rings = [radius, radius * 0.66, radius * 0.33, 8];
  const steps = 8;
  for (let r = 0; r < rings.length; r++) {
    for (let s = 0; s < steps; s++) {
      const angle = (s * Math.PI * 2) / steps;
      candidates.push({
        x: origin.x + Math.cos(angle) * rings[r],
        y: origin.y + Math.sin(angle) * rings[r],
      });
    }
  }
  candidates.push(origin);
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const moved = resolveMove(
      origin.x,
      origin.y,
      candidate.x - origin.x,
      candidate.y - origin.y,
      half,
      input.collisions,
      input.walkableBounds,
    );
    if (pointBlocked(moved.x, moved.y, half, input.collisions, input.walkableBounds)) {
      continue;
    }
    if (distance(moved.x, moved.y, candidate.x, candidate.y) > 6) {
      continue;
    }
    return moved;
  }
  return origin;
}

export interface PlayerDropInput {
  playerHealth: number;
  linkDead?: boolean;
  transferring?: boolean;
  characterId: string;
  playerX: number;
  playerY: number;
  facingX?: number;
  facingY?: number;
  hintDx?: number;
  hintDy?: number;
  inventory: PlayerInventory | undefined;
  overflow?: MigrationOverflow;
  equipment?: PlayerEquipment;
  instanceId: string;
  quantity?: number;
  requestId: string;
  expectedRevision?: number;
  groundItems: ReadonlyArray<GroundItem>;
  collisions: ReadonlyArray<Aabb>;
  walkableBounds: Aabb;
  itemsById: { [id: string]: ItemDefinition };
  tick: number;
  tickRate: number;
  nowMs: number;
  newIds: () => string;
  dropLimit?: number;
  failBeforeEntity?: boolean;
}

export interface PlayerDropDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventory: PlayerInventory;
  overflow: MigrationOverflow;
  groundItems: GroundItem[];
  spawned: GroundItem | null;
}

export function applyPlayerDrop(input: PlayerDropInput): PlayerDropDecision {
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const overflow = cloneOverflow(input.overflow !== undefined ? input.overflow : emptyOverflow());
  const groundItems = cloneGroundItems(input.groundItems);
  const previous =
    inventory.journalByRequestId !== undefined ? inventory.journalByRequestId[input.requestId] : undefined;
  const recovering = previous !== undefined;
  if (!recovering) {
    if (input.playerHealth <= 0) {
      return failDrop("player_dead", inventory, overflow, groundItems);
    }
    if (input.linkDead === true) {
      return failDrop("link_dead", inventory, overflow, groundItems);
    }
    if (input.transferring === true) {
      return failDrop("already_transferring", inventory, overflow, groundItems);
    }
    const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
    if (stale.length > 0) {
      return failDrop(stale, inventory, overflow, groundItems);
    }
    const equipped = equippedInstanceIds(input.equipment);
    if (equipped.indexOf(input.instanceId) !== -1) {
      return failDrop("item_equipped", inventory, overflow, groundItems);
    }
    const present = findItem(inventory, input.instanceId);
    if (present === null) {
      return failDrop("invalid_id", inventory, overflow, groundItems);
    }
    if (isItemLocked(present)) {
      return failDrop(ITEM_ERROR_ITEM_LOCKED, inventory, overflow, groundItems);
    }
    const presentDefinition = input.itemsById[present.itemId];
    if (presentDefinition === undefined) {
      return failDrop("invalid_id", inventory, overflow, groundItems);
    }
    if (!itemIsDroppable(presentDefinition)) {
      return failDrop("not_droppable", inventory, overflow, groundItems);
    }
    const quantity = input.quantity !== undefined ? input.quantity : present.quantity;
    if (quantity < 1 || quantity !== Math.floor(quantity) || quantity > present.quantity) {
      return failDrop(ITEM_ERROR_INVALID_QUANTITY, inventory, overflow, groundItems);
    }
    const limit = input.dropLimit !== undefined ? input.dropLimit : PLAYER_GROUND_DROP_LIMIT;
    if (countActiveGroundDrops(groundItems, input.characterId) >= limit) {
      return failDrop(GROUND_DROP_LIMIT_CODE, inventory, overflow, groundItems);
    }
  }
  const item = findItem(inventory, input.instanceId);
  const definition = item !== null ? input.itemsById[item.itemId] : undefined;
  const rarity =
    definition !== undefined && definition.rarity !== undefined ? definition.rarity : "rarity.common";
  const pose = placeGroundDrop({
    x: input.playerX,
    y: input.playerY,
    hintDx: input.hintDx,
    hintDy: input.hintDy,
    facingX: input.facingX,
    facingY: input.facingY,
    collisions: input.collisions,
    walkableBounds: input.walkableBounds,
  });
  const existing: {
    id: string;
    groundEntityId: string;
    instanceId: string;
    itemId: string;
    quantity: number;
    x: number;
    y: number;
    createdByCharacterId: string;
    createdAtTick: number;
    expiresAtTick: number;
    state: string;
    revision: number;
    rarity: string;
  }[] = [];
  for (let g = 0; g < groundItems.length; g++) {
    const entity = groundItems[g];
    existing.push({
      id: entity.groundEntityId,
      groundEntityId: entity.groundEntityId,
      instanceId: entity.itemInstanceId,
      itemId: entity.itemId,
      quantity: entity.quantity,
      x: entity.x,
      y: entity.y,
      createdByCharacterId: entity.createdByCharacterId,
      createdAtTick: entity.createdAtTick,
      expiresAtTick: entity.expiresAtTick,
      state: entity.state,
      revision: entity.revision,
      rarity: entity.rarity,
    });
  }
  const quantity =
    input.quantity !== undefined && input.quantity > 0
      ? input.quantity
      : item !== null
        ? item.quantity
        : 1;
  const dropped = executeDropIntent({
    inventory: inventory,
    overflow: overflow,
    instanceId: input.instanceId,
    quantity: quantity,
    requestId: input.requestId,
    characterId: input.characterId,
    nowMs: input.nowMs,
    x: pose.x,
    y: pose.y,
    definitions: input.itemsById,
    newIds: input.newIds,
    failBeforeEntity: input.failBeforeEntity,
    existingGroundItems: existing,
    createdAtTick: input.tick,
    expiresAtTick: input.tick + groundExpireTicks(input.tickRate),
    rarity: rarity,
  });
  const nextGround = cloneGroundItems(groundItems);
  let spawned: GroundItem | null = null;
  if (dropped.ok && dropped.ground !== null) {
    const existing = findGroundItem(nextGround, dropped.ground.id);
    if (existing === null) {
      spawned = groundFromTransient(
        dropped.ground,
        input.characterId,
        input.tick,
        input.tick + groundExpireTicks(input.tickRate),
        rarity,
      );
      nextGround.push(spawned);
    } else {
      spawned = cloneGroundItem(existing);
    }
  }
  return {
    ok: dropped.ok,
    code: dropped.code,
    replay: dropped.replay,
    persist: dropped.replay ? false : dropped.ok || dropped.code === "destination_unavailable",
    inventory: dropped.inventory,
    overflow: dropped.overflow,
    groundItems: nextGround,
    spawned: spawned,
  };
}

export interface GroundPickupInput {
  playerHealth: number;
  linkDead?: boolean;
  transferring?: boolean;
  characterId: string;
  playerX: number;
  playerY: number;
  inventory: PlayerInventory | undefined;
  equippedItems?: ReadonlyArray<ItemInstance>;
  groundEntityId: string;
  requestId: string;
  expectedRevision?: number;
  groundItems: ReadonlyArray<GroundItem>;
  pickupRange: number;
  itemsById: { [id: string]: ItemDefinition };
  tick?: number;
  nowMs: number;
  newIds: () => string;
}

export interface GroundPickupDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventory: PlayerInventory;
  groundItems: GroundItem[];
  removed: GroundItem | null;
}

export function applyGroundPickup(input: GroundPickupInput): GroundPickupDecision {
  const inventory = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const groundItems = cloneGroundItems(input.groundItems);
  const previous = inventory.pickupByRequestId[input.requestId];
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: inventory,
      groundItems: groundItems,
      removed: null,
    };
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failPickup(stale, inventory, groundItems);
  }
  if (input.playerHealth <= 0) {
    return failPickup("player_dead", inventory, groundItems);
  }
  if (input.linkDead === true) {
    return failPickup("link_dead", inventory, groundItems);
  }
  if (input.transferring === true) {
    return failPickup("already_transferring", inventory, groundItems);
  }
  const entity = findGroundItem(groundItems, input.groundEntityId);
  if (entity === null || entity.state !== GROUND_PUBLIC_AVAILABLE) {
    return failPickup(GROUND_ITEM_NO_LONGER_AVAILABLE, inventory, groundItems);
  }
  if (distance(input.playerX, input.playerY, entity.x, entity.y) > input.pickupRange) {
    return failPickup("out_of_range", inventory, groundItems);
  }
  const definition = input.itemsById[entity.itemId];
  if (definition === undefined) {
    return failPickup("invalid_id", inventory, groundItems);
  }
  const plan = planCapacity({
    inventory: inventory,
    incoming: [
      {
        itemId: entity.itemId,
        quantity: entity.quantity,
        instanceId: entity.itemInstanceId,
      },
    ],
    definitions: input.itemsById,
    equippedItems: input.equippedItems,
    operationMode: "acquire",
    nowMs: input.nowMs,
  });
  if (!plan.fits) {
    return failPickup(plan.failureCode.length > 0 ? plan.failureCode : ITEM_ERROR_INVENTORY_FULL, inventory, groundItems);
  }
  entity.state = GROUND_CLAIMING;
  entity.revision += 1;
  const started = beginAcquisitionIntent({
    inventory: inventory,
    requestId: input.requestId,
    characterId: input.characterId,
    definitionId: entity.itemId,
    instanceId: entity.itemInstanceId,
    quantity: entity.quantity,
    sourceId: entity.groundEntityId,
    nowMs: input.nowMs,
    newIds: input.newIds,
  });
  if (started.replay) {
    return {
      ok: true,
      code: "ok",
      replay: true,
      persist: false,
      inventory: started.inventory,
      groundItems: removeGroundItem(groundItems, entity.groundEntityId),
      removed: cloneGroundItem(entity),
    };
  }
  const granted = applyCapacityPlan(started.inventory, plan, []);
  const completed = completeAcquisitionIntent(granted, started.intent, input.nowMs);
  const remembered = rememberPickup(
    completed,
    input.requestId,
    { ok: true, code: "ok", lootId: entity.groundEntityId },
    input.tick,
  );
  entity.state = GROUND_CLAIMED;
  entity.revision += 1;
  return {
    ok: true,
    code: "ok",
    replay: false,
    persist: true,
    inventory: remembered,
    groundItems: removeGroundItem(groundItems, entity.groundEntityId),
    removed: cloneGroundItem(entity),
  };
}

export function rarityRequiresDropConfirm(rarity: string): boolean {
  return rarityRank(rarity) >= 2;
}

function dropDirection(hintDx?: number, hintDy?: number, facingX?: number, facingY?: number): Vec2 {
  const hx = hintDx !== undefined ? hintDx : 0;
  const hy = hintDy !== undefined ? hintDy : 0;
  const hintLen = Math.sqrt(hx * hx + hy * hy);
  if (hintLen > 0.001) {
    return { x: hx / hintLen, y: hy / hintLen };
  }
  const fx = facingX !== undefined ? facingX : 0;
  const fy = facingY !== undefined ? facingY : 0;
  const faceLen = Math.sqrt(fx * fx + fy * fy);
  if (faceLen > 0.001) {
    return { x: fx / faceLen, y: fy / faceLen };
  }
  return { x: 0, y: 1 };
}

function groundFromTransient(
  ground: {
    id: string;
    instanceId: string;
    itemId: string;
    quantity: number;
    x: number;
    y: number;
    createdByCharacterId?: string;
    createdAtTick?: number;
    expiresAtTick?: number;
    state?: string;
    revision?: number;
    rarity?: string;
  },
  characterId: string,
  createdAtTick: number,
  expiresAtTick: number,
  rarity: string,
): GroundItem {
  return {
    groundEntityId: ground.id,
    itemInstanceId: ground.instanceId,
    itemId: ground.itemId,
    quantity: ground.quantity,
    x: ground.x,
    y: ground.y,
    createdByCharacterId: ground.createdByCharacterId !== undefined ? ground.createdByCharacterId : characterId,
    createdAtTick: ground.createdAtTick !== undefined ? ground.createdAtTick : createdAtTick,
    expiresAtTick: ground.expiresAtTick !== undefined ? ground.expiresAtTick : expiresAtTick,
    state: ground.state === GROUND_CLAIMING || ground.state === GROUND_CLAIMED || ground.state === GROUND_EXPIRED
      ? ground.state
      : GROUND_PUBLIC_AVAILABLE,
    revision: ground.revision !== undefined ? ground.revision : 1,
    rarity: ground.rarity !== undefined ? ground.rarity : rarity,
  };
}

function failDrop(
  code: string,
  inventory: PlayerInventory,
  overflow: MigrationOverflow,
  groundItems: GroundItem[],
): PlayerDropDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    inventory: inventory,
    overflow: overflow,
    groundItems: groundItems,
    spawned: null,
  };
}

function failPickup(code: string, inventory: PlayerInventory, groundItems: GroundItem[]): GroundPickupDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    inventory: inventory,
    groundItems: groundItems,
    removed: null,
  };
}
