import {
  cloneInventory,
  effectiveMaxStack,
  findItem,
  findItemBySlot,
  firstEmptySlotIndex,
  makeInstance,
  stackIdentitiesMatch,
  uniqueGrantFailure,
  type ItemDefinition,
  type ItemGrantOptions,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import {
  ITEM_ERROR_INVENTORY_FULL,
  ITEM_ERROR_INVALID_QUANTITY,
  ITEM_ERROR_INVALID_SLOT,
  ITEM_ERROR_ITEM_NOT_FOUND,
  ITEM_ERROR_STACK_FULL,
  ITEM_ERROR_STACK_INCOMPATIBLE,
} from "./item_errors";
import { expireInventoryLocks, stackIsImmovable } from "./item_lock";

export type CapacityOperationMode =
  | "grant"
  | "trade"
  | "unequip"
  | "equip"
  | "move"
  | "split"
  | "drop"
  | "consume"
  | "recover"
  | "acquire";

export interface IncomingStack {
  itemId: string;
  quantity: number;
  instanceId?: string;
  stackKey?: string;
  metadata?: { [key: string]: unknown };
  preferredSlot?: number;
  sourceType?: string;
  sourceId?: string;
  createdAt?: number;
}

export interface OutgoingQuantity {
  instanceId: string;
  quantity: number;
}

export interface CapacityPlanInput {
  inventory: PlayerInventory;
  incoming: IncomingStack[];
  outgoing?: OutgoingQuantity[];
  definitions: { [id: string]: ItemDefinition };
  equippedItems?: ReadonlyArray<ItemInstance>;
  operationMode: CapacityOperationMode;
  preferredSlots?: Array<number | undefined>;
  nowMs?: number;
  preferredStrict?: boolean;
}

export interface PlannedMerge {
  instanceId: string;
  slotIndex: number;
  itemId: string;
  quantityAdded: number;
  quantityAfter: number;
}

export interface PlannedNewStack {
  slotIndex: number;
  itemId: string;
  quantity: number;
  instanceId?: string;
  needsNewId: boolean;
  stackKey: string;
  metadata: { [key: string]: unknown };
  sourceType: string;
  sourceId: string;
  createdAt: number;
}

export interface PlannedSlotPlacement {
  instanceId: string;
  fromSlotIndex: number;
  toSlotIndex: number;
}

export interface PlannedRetirement {
  instanceId: string;
  quantityRemoved: number;
  retired: boolean;
  quantityAfter: number;
}

export interface RemainingQuantity {
  itemId: string;
  quantity: number;
}

export interface CapacityPlan {
  fits: boolean;
  plannedMerges: PlannedMerge[];
  plannedNewStacks: PlannedNewStack[];
  plannedSlotPlacements: PlannedSlotPlacement[];
  plannedInstanceRetirements: PlannedRetirement[];
  requiredNewInstanceIds: number;
  remainingQuantities: RemainingQuantity[];
  failureCode: string;
}

export function emptyCapacityPlan(failureCode: string = ""): CapacityPlan {
  return {
    fits: failureCode.length === 0,
    plannedMerges: [],
    plannedNewStacks: [],
    plannedSlotPlacements: [],
    plannedInstanceRetirements: [],
    requiredNewInstanceIds: 0,
    remainingQuantities: [],
    failureCode: failureCode,
  };
}

export function planCapacity(input: CapacityPlanInput): CapacityPlan {
  let working = cloneInventory(input.inventory);
  if (input.nowMs !== undefined) {
    working = expireInventoryLocks(working, input.nowMs).inventory;
  }
  const plan = emptyCapacityPlan();
  const outgoing = input.outgoing !== undefined ? input.outgoing : [];
  for (let o = 0; o < outgoing.length; o++) {
    const line = outgoing[o];
    if (line.quantity < 1 || line.quantity !== Math.floor(line.quantity)) {
      plan.fits = false;
      plan.failureCode = ITEM_ERROR_INVALID_QUANTITY;
      return plan;
    }
    const item = findItem(working, line.instanceId);
    if (item === null) {
      plan.fits = false;
      plan.failureCode = ITEM_ERROR_ITEM_NOT_FOUND;
      return plan;
    }
    if (line.quantity > item.quantity) {
      plan.fits = false;
      plan.failureCode = ITEM_ERROR_INVALID_QUANTITY;
      return plan;
    }
    const retired = line.quantity >= item.quantity;
    const quantityAfter = retired ? 0 : item.quantity - line.quantity;
    plan.plannedInstanceRetirements.push({
      instanceId: item.instanceId,
      quantityRemoved: line.quantity,
      retired: retired,
      quantityAfter: quantityAfter,
    });
    if (retired) {
      working.items = working.items.filter(function (entry) {
        return entry.instanceId !== item.instanceId;
      });
    } else {
      item.quantity = quantityAfter;
    }
  }

  const preferredStrict =
    input.preferredStrict !== undefined
      ? input.preferredStrict
      : input.operationMode === "move" || input.operationMode === "recover";

  const totals: { [itemId: string]: { quantity: number; definition: ItemDefinition } } = {};
  for (let i = 0; i < input.incoming.length; i++) {
    const incoming = input.incoming[i];
    if (incoming.quantity < 1 || incoming.quantity !== Math.floor(incoming.quantity)) {
      plan.fits = false;
      plan.failureCode = ITEM_ERROR_INVALID_QUANTITY;
      return plan;
    }
    const definition = input.definitions[incoming.itemId];
    if (definition === undefined) {
      plan.fits = false;
      plan.failureCode = "invalid_id";
      return plan;
    }
    const current = totals[incoming.itemId];
    if (current === undefined) {
      totals[incoming.itemId] = { quantity: incoming.quantity, definition: definition };
    } else {
      current.quantity += incoming.quantity;
    }
  }
  const uniqueIds = Object.keys(totals);
  for (let u = 0; u < uniqueIds.length; u++) {
    const row = totals[uniqueIds[u]];
    const uniqueCode = uniqueGrantFailure(working, uniqueIds[u], row.quantity, row.definition, input.equippedItems);
    if (uniqueCode.length > 0) {
      plan.fits = false;
      plan.failureCode = uniqueCode;
      return plan;
    }
  }

  for (let i = 0; i < input.incoming.length; i++) {
    const incoming = input.incoming[i];
    const definition = input.definitions[incoming.itemId];
    const preferred =
      incoming.preferredSlot !== undefined
        ? incoming.preferredSlot
        : input.preferredSlots !== undefined
          ? input.preferredSlots[i]
          : undefined;
    const placed = placeIncoming(working, incoming, definition, preferred, preferredStrict, plan);
    if (!placed.ok) {
      plan.fits = false;
      plan.failureCode = placed.code;
      plan.remainingQuantities.push({ itemId: incoming.itemId, quantity: placed.remaining });
      return plan;
    }
    if (placed.remaining > 0) {
      plan.fits = false;
      plan.failureCode = ITEM_ERROR_INVENTORY_FULL;
      plan.remainingQuantities.push({ itemId: incoming.itemId, quantity: placed.remaining });
      return plan;
    }
  }
  plan.requiredNewInstanceIds = countRequiredIds(plan);
  plan.fits = true;
  plan.failureCode = "";
  return plan;
}

export function planTwoWayTrade(input: {
  left: PlayerInventory;
  right: PlayerInventory;
  leftOffers: OutgoingQuantity[];
  rightOffers: OutgoingQuantity[];
  definitions: { [id: string]: ItemDefinition };
  leftEquipped?: ReadonlyArray<ItemInstance>;
  rightEquipped?: ReadonlyArray<ItemInstance>;
  nowMs?: number;
}): { left: CapacityPlan; right: CapacityPlan; fits: boolean; failureCode: string } {
  const leftIncoming = offersToIncoming(input.right, input.rightOffers);
  const rightIncoming = offersToIncoming(input.left, input.leftOffers);
  if (leftIncoming.code.length > 0) {
    const failed = emptyCapacityPlan(leftIncoming.code);
    return { left: failed, right: emptyCapacityPlan(leftIncoming.code), fits: false, failureCode: leftIncoming.code };
  }
  if (rightIncoming.code.length > 0) {
    const failed = emptyCapacityPlan(rightIncoming.code);
    return { left: failed, right: emptyCapacityPlan(rightIncoming.code), fits: false, failureCode: rightIncoming.code };
  }
  const left = planCapacity({
    inventory: input.left,
    incoming: leftIncoming.incoming,
    outgoing: input.leftOffers,
    definitions: input.definitions,
    equippedItems: input.leftEquipped,
    operationMode: "trade",
    nowMs: input.nowMs,
  });
  const right = planCapacity({
    inventory: input.right,
    incoming: rightIncoming.incoming,
    outgoing: input.rightOffers,
    definitions: input.definitions,
    equippedItems: input.rightEquipped,
    operationMode: "trade",
    nowMs: input.nowMs,
  });
  if (!left.fits) {
    return { left: left, right: right, fits: false, failureCode: left.failureCode };
  }
  if (!right.fits) {
    return { left: left, right: right, fits: false, failureCode: right.failureCode };
  }
  return { left: left, right: right, fits: true, failureCode: "" };
}

export function applyCapacityPlan(
  inventory: PlayerInventory,
  plan: CapacityPlan,
  newIds: string[],
): PlayerInventory {
  const next = cloneInventory(inventory);
  for (let r = 0; r < plan.plannedInstanceRetirements.length; r++) {
    const retirement = plan.plannedInstanceRetirements[r];
    const item = findItem(next, retirement.instanceId);
    if (item === null) {
      continue;
    }
    if (retirement.retired) {
      next.items = next.items.filter(function (entry) {
        return entry.instanceId !== retirement.instanceId;
      });
    } else {
      item.quantity = retirement.quantityAfter;
      item.version += 1;
    }
  }
  for (let m = 0; m < plan.plannedMerges.length; m++) {
    const merge = plan.plannedMerges[m];
    const item = findItem(next, merge.instanceId);
    if (item === null) {
      continue;
    }
    item.quantity = merge.quantityAfter;
    item.version += 1;
  }
  let idIndex = 0;
  for (let n = 0; n < plan.plannedNewStacks.length; n++) {
    const stack = plan.plannedNewStacks[n];
    let instanceId = stack.instanceId !== undefined ? stack.instanceId : "";
    if (stack.needsNewId) {
      instanceId = idIndex < newIds.length ? newIds[idIndex] : instanceId + "-missing";
      idIndex += 1;
    }
    next.items.push(
      makeInstance(instanceId, stack.itemId, stack.quantity, stack.slotIndex, {
        sourceType: stack.sourceType,
        sourceId: stack.sourceId,
        createdAt: stack.createdAt,
        stackKey: stack.stackKey,
        metadata: cloneMetadata(stack.metadata),
      }),
    );
  }
  for (let p = 0; p < plan.plannedSlotPlacements.length; p++) {
    const placement = plan.plannedSlotPlacements[p];
    const item = findItem(next, placement.instanceId);
    if (item === null) {
      continue;
    }
    item.slotIndex = placement.toSlotIndex;
    item.version += 1;
  }
  next.revision += 1;
  return next;
}

function placeIncoming(
  working: PlayerInventory,
  incoming: IncomingStack,
  definition: ItemDefinition,
  preferredSlot: number | undefined,
  preferredStrict: boolean,
  plan: CapacityPlan,
): { ok: boolean; code: string; remaining: number } {
  const maxStack = effectiveMaxStack(definition);
  let remaining = incoming.quantity;
  const identity = incomingIdentity(incoming);
  const grant = grantOptions(incoming);

  if (preferredSlot !== undefined) {
    if (preferredSlot < 0 || preferredSlot !== Math.floor(preferredSlot) || preferredSlot >= working.capacity) {
      if (preferredStrict) {
        return { ok: false, code: ITEM_ERROR_INVALID_SLOT, remaining: remaining };
      }
    } else {
      const occupant = findItemBySlot(working, preferredSlot);
      if (occupant === null) {
        const take = Math.min(maxStack, remaining);
        addNewStack(working, plan, incoming, grant, preferredSlot, take, identity);
        remaining -= take;
      } else if (!stackIsImmovable(occupant) && stackIdentitiesMatch(occupant, identity)) {
        const free = maxStack - occupant.quantity;
        if (free > 0) {
          const added = Math.min(free, remaining);
          occupant.quantity += added;
          recordMerge(plan, occupant, added);
          remaining -= added;
        } else if (preferredStrict) {
          return { ok: false, code: ITEM_ERROR_STACK_FULL, remaining: remaining };
        }
      } else if (preferredStrict) {
        return { ok: false, code: ITEM_ERROR_STACK_INCOMPATIBLE, remaining: remaining };
      }
    }
  }

  if (remaining > 0) {
    const ordered = itemsByLowestSlot(working);
    for (let i = 0; i < ordered.length; i++) {
      if (remaining <= 0) {
        break;
      }
      const stack = ordered[i];
      if (stackIsImmovable(stack)) {
        continue;
      }
      if (!stackIdentitiesMatch(stack, identity)) {
        continue;
      }
      const free = maxStack - stack.quantity;
      if (free <= 0) {
        continue;
      }
      const added = Math.min(free, remaining);
      stack.quantity += added;
      recordMerge(plan, stack, added);
      remaining -= added;
    }
  }

  while (remaining > 0) {
    const slotIndex = firstEmptySlotIndex(working);
    if (slotIndex < 0 || slotIndex >= working.capacity) {
      return { ok: true, code: ITEM_ERROR_INVENTORY_FULL, remaining: remaining };
    }
    const take = Math.min(maxStack, remaining);
    addNewStack(working, plan, incoming, grant, slotIndex, take, identity);
    remaining -= take;
  }
  return { ok: true, code: "", remaining: 0 };
}

function addNewStack(
  working: PlayerInventory,
  plan: CapacityPlan,
  incoming: IncomingStack,
  grant: ItemGrantOptions,
  slotIndex: number,
  quantity: number,
  _identity: ItemInstance,
): void {
  const preserve = incoming.instanceId !== undefined && incoming.instanceId.length > 0 && !alreadyUsedInstance(plan, incoming.instanceId);
  const instanceId = preserve ? incoming.instanceId : "";
  const created = makeInstance(instanceId !== undefined ? instanceId : "", incoming.itemId, quantity, slotIndex, grant);
  working.items.push(created);
  plan.plannedNewStacks.push({
    slotIndex: slotIndex,
    itemId: incoming.itemId,
    quantity: quantity,
    instanceId: preserve ? incoming.instanceId : undefined,
    needsNewId: !preserve,
    stackKey: created.stackKey,
    metadata: cloneMetadata(created.metadata),
    sourceType: created.sourceType,
    sourceId: created.sourceId,
    createdAt: created.createdAt,
  });
  if (preserve && incoming.instanceId !== undefined) {
    plan.plannedSlotPlacements.push({
      instanceId: incoming.instanceId,
      fromSlotIndex: -1,
      toSlotIndex: slotIndex,
    });
  }
}

function alreadyUsedInstance(plan: CapacityPlan, instanceId: string): boolean {
  for (let i = 0; i < plan.plannedNewStacks.length; i++) {
    if (plan.plannedNewStacks[i].instanceId === instanceId) {
      return true;
    }
  }
  return false;
}

function recordMerge(plan: CapacityPlan, stack: ItemInstance, added: number): void {
  for (let i = 0; i < plan.plannedMerges.length; i++) {
    if (plan.plannedMerges[i].instanceId === stack.instanceId) {
      plan.plannedMerges[i].quantityAdded += added;
      plan.plannedMerges[i].quantityAfter = stack.quantity;
      return;
    }
  }
  plan.plannedMerges.push({
    instanceId: stack.instanceId,
    slotIndex: stack.slotIndex,
    itemId: stack.itemId,
    quantityAdded: added,
    quantityAfter: stack.quantity,
  });
}

function itemsByLowestSlot(inventory: PlayerInventory): ItemInstance[] {
  const list: ItemInstance[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    list.push(inventory.items[i]);
  }
  list.sort(function (a, b) {
    return a.slotIndex - b.slotIndex;
  });
  return list;
}

function incomingIdentity(incoming: IncomingStack): ItemInstance {
  return makeInstance(incoming.instanceId !== undefined ? incoming.instanceId : "", incoming.itemId, 0, -1, grantOptions(incoming));
}

function grantOptions(incoming: IncomingStack): ItemGrantOptions {
  const grant: ItemGrantOptions = {};
  if (incoming.sourceType !== undefined) {
    grant.sourceType = incoming.sourceType;
  }
  if (incoming.sourceId !== undefined) {
    grant.sourceId = incoming.sourceId;
  }
  if (incoming.createdAt !== undefined) {
    grant.createdAt = incoming.createdAt;
  }
  if (incoming.stackKey !== undefined) {
    grant.stackKey = incoming.stackKey;
  }
  if (incoming.metadata !== undefined) {
    grant.metadata = incoming.metadata;
  }
  return grant;
}

function countRequiredIds(plan: CapacityPlan): number {
  let count = 0;
  for (let i = 0; i < plan.plannedNewStacks.length; i++) {
    if (plan.plannedNewStacks[i].needsNewId) {
      count += 1;
    }
  }
  return count;
}

function offersToIncoming(
  source: PlayerInventory,
  offers: OutgoingQuantity[],
): { incoming: IncomingStack[]; code: string } {
  const incoming: IncomingStack[] = [];
  for (let i = 0; i < offers.length; i++) {
    const item = findItem(source, offers[i].instanceId);
    if (item === null) {
      return { incoming: incoming, code: ITEM_ERROR_ITEM_NOT_FOUND };
    }
    incoming.push({
      itemId: item.itemId,
      quantity: offers[i].quantity,
      stackKey: item.stackKey,
      metadata: cloneMetadata(item.metadata),
      sourceType: "trade",
      sourceId: item.instanceId,
      createdAt: item.createdAt,
    });
  }
  return { incoming: incoming, code: "" };
}

function cloneMetadata(metadata: { [key: string]: unknown } | undefined): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  if (metadata === undefined) {
    return copy;
  }
  const keys = Object.keys(metadata);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = metadata[keys[i]];
  }
  return copy;
}
