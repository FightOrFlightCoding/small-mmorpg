import { cloneTickMap, dict } from "./maps";
import { cloneExtras, envelopeFromRecord } from "./save_schema";

export const INVENTORY_CAPACITY = 20;
export const STARTER_ITEM_ID = "item.training_sword";

export type ItemCategory = "weapon" | "armor" | "consumable" | "quest" | "material" | "miscellaneous";
export type UniquePolicy = "none" | "character" | "equipped";

export interface ItemStatModifier {
  statId: string;
  amount: number;
}

export interface ItemDefinition {
  id: string;
  maxStack: number;
  category?: ItemCategory;
  tradeable?: boolean;
  destroyable?: boolean;
  uniquePolicy?: UniquePolicy;
  equipSlot?: string;
  equipmentSlotTags?: readonly string[];
  classRequirements?: readonly string[];
  levelRequirement?: number;
  attackBonus?: number;
  statModifiers?: readonly ItemStatModifier[];
  sellValue?: number;
  displayNameKey?: string;
  descriptionKey?: string;
  iconAssetId?: string;
  worldAssetId?: string;
}

export interface ItemGrantOptions {
  sourceType?: string;
  sourceId?: string;
  createdAt?: number;
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  quantity: number;
  createdAt: number;
  sourceType: string;
  sourceId: string;
  metadata: { [key: string]: unknown };
  lockReason: string;
  lockId: string;
  slotIndex: number;
}

export interface PickupRecord {
  ok: boolean;
  code: string;
  lootId: string;
}

export interface InventoryMutationRecord {
  ok: boolean;
  code: string;
  instanceId: string;
  quantity: number;
  toSlotIndex?: number;
  newInstanceId?: string;
}

export interface PlayerInventory {
  capacity: number;
  items: ItemInstance[];
  pickupByRequestId: { [requestId: string]: PickupRecord };
  pickupRequestTicks?: { [requestId: string]: number };
  mutationByRequestId?: { [requestId: string]: InventoryMutationRecord };
  mutationRequestTicks?: { [requestId: string]: number };
  schemaVersion?: number;
  createdAt?: number;
  updatedAt?: number;
  extras?: { [key: string]: unknown };
}

export interface InitializeInventoryResult {
  inventory: PlayerInventory;
  created: boolean;
}

export interface InventoryMutationDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventory: PlayerInventory;
  newInstanceId?: string;
}

export function emptyInventory(capacity: number = INVENTORY_CAPACITY): PlayerInventory {
  return {
    capacity: capacity,
    items: [],
    pickupByRequestId: {},
    mutationByRequestId: {},
  };
}

export function cloneInventory(inventory: PlayerInventory): PlayerInventory {
  if (inventory == null) {
    return emptyInventory();
  }
  const items: ItemInstance[] = [];
  const sourceItems = Array.isArray(inventory.items) ? inventory.items : [];
  for (let i = 0; i < sourceItems.length; i++) {
    items.push(cloneItem(sourceItems[i]));
  }
  const pickupByRequestId: { [requestId: string]: PickupRecord } = {};
  const pickupSource = dict(inventory.pickupByRequestId);
  const keys = Object.keys(pickupSource);
  for (let j = 0; j < keys.length; j++) {
    const key = keys[j];
    const record = pickupSource[key];
    if (record == null) {
      continue;
    }
    pickupByRequestId[key] = {
      ok: record.ok,
      code: record.code,
      lootId: record.lootId,
    };
  }
  const mutationByRequestId: { [requestId: string]: InventoryMutationRecord } = {};
  const mutationSource = dict(inventory.mutationByRequestId);
  const mutationKeys = Object.keys(mutationSource);
  for (let m = 0; m < mutationKeys.length; m++) {
    const key = mutationKeys[m];
    const record = mutationSource[key];
    if (record == null) {
      continue;
    }
    const copied: InventoryMutationRecord = {
      ok: record.ok,
      code: record.code,
      instanceId: record.instanceId,
      quantity: record.quantity,
    };
    if (record.toSlotIndex !== undefined) {
      copied.toSlotIndex = record.toSlotIndex;
    }
    if (record.newInstanceId !== undefined) {
      copied.newInstanceId = record.newInstanceId;
    }
    mutationByRequestId[key] = copied;
  }
  const envelope = envelopeFromRecord(inventory);
  const next: PlayerInventory = {
    capacity: inventory.capacity > 0 ? inventory.capacity : INVENTORY_CAPACITY,
    items: items,
    pickupByRequestId: pickupByRequestId,
    pickupRequestTicks: cloneTickMap(inventory.pickupRequestTicks),
    mutationByRequestId: mutationByRequestId,
    mutationRequestTicks: cloneTickMap(inventory.mutationRequestTicks),
    schemaVersion: envelope.schemaVersion,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    extras: cloneExtras(inventory.extras),
  };
  ensureSlotIndices(next);
  return next;
}

export function initializeInventory(
  existing: PlayerInventory | null,
  newId: () => string,
  starterItemId: string = STARTER_ITEM_ID,
  capacity: number = INVENTORY_CAPACITY,
): InitializeInventoryResult {
  if (starterItemId.length === 0) {
    return initializeInventoryFromStacks(existing, newId, [], capacity);
  }
  return initializeInventoryFromStacks(existing, newId, [{ itemId: starterItemId, quantity: 1 }], capacity);
}

export function initializeInventoryFromStacks(
  existing: PlayerInventory | null,
  newId: () => string,
  stacks: Array<{ itemId: string; quantity: number }>,
  capacity: number = INVENTORY_CAPACITY,
): InitializeInventoryResult {
  if (existing !== null) {
    return { inventory: cloneInventory(existing), created: false };
  }
  const items: PlayerInventory["items"] = [];
  for (let i = 0; i < stacks.length; i++) {
    const stack = stacks[i];
    if (stack.quantity <= 0) {
      continue;
    }
    items.push(
      makeInstance(newId(), stack.itemId, stack.quantity, i, {
        sourceType: "starter",
        sourceId: stack.itemId,
        createdAt: 0,
      }),
    );
  }
  return {
    inventory: {
      capacity: capacity,
      items: items,
      pickupByRequestId: {},
      mutationByRequestId: {},
    },
    created: true,
  };
}

export function itemDefinitionsFromContent(items: {
  [id: string]: {
    id: string;
    maxStack: number;
    category?: ItemCategory;
    tradeable?: boolean;
    destroyable?: boolean;
    uniquePolicy?: UniquePolicy;
    equipSlot?: string;
    equipmentSlotTags?: readonly string[];
    classRequirements?: readonly string[];
    levelRequirement?: number;
    attackBonus?: number;
    statModifiers?: ReadonlyArray<ItemStatModifier>;
    sellValue?: number;
    displayNameKey?: string;
    descriptionKey?: string;
    iconAssetId?: string;
    worldAssetId?: string;
  };
}): { [id: string]: ItemDefinition } {
  const map: { [id: string]: ItemDefinition } = {};
  const ids = Object.keys(items);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const item = items[id];
    const definition: ItemDefinition = { id: item.id, maxStack: item.maxStack };
    if (item.category !== undefined) {
      definition.category = item.category;
    }
    if (item.tradeable !== undefined) {
      definition.tradeable = item.tradeable;
    }
    if (item.destroyable !== undefined) {
      definition.destroyable = item.destroyable;
    }
    if (item.uniquePolicy !== undefined) {
      definition.uniquePolicy = item.uniquePolicy;
    }
    if (item.equipSlot !== undefined) {
      definition.equipSlot = item.equipSlot;
    }
    if (item.equipmentSlotTags !== undefined) {
      definition.equipmentSlotTags = copyStrings(item.equipmentSlotTags);
    }
    if (item.classRequirements !== undefined) {
      definition.classRequirements = copyStrings(item.classRequirements);
    }
    if (item.levelRequirement !== undefined) {
      definition.levelRequirement = item.levelRequirement;
    }
    if (item.attackBonus !== undefined) {
      definition.attackBonus = item.attackBonus;
    }
    if (item.statModifiers !== undefined) {
      definition.statModifiers = copyModifiers(item.statModifiers);
    }
    if (item.sellValue !== undefined) {
      definition.sellValue = item.sellValue;
    }
    if (item.displayNameKey !== undefined) {
      definition.displayNameKey = item.displayNameKey;
    }
    if (item.descriptionKey !== undefined) {
      definition.descriptionKey = item.descriptionKey;
    }
    if (item.iconAssetId !== undefined) {
      definition.iconAssetId = item.iconAssetId;
    }
    if (item.worldAssetId !== undefined) {
      definition.worldAssetId = item.worldAssetId;
    }
    map[id] = definition;
  }
  return map;
}

export function itemSlotTags(definition: ItemDefinition): string[] {
  if (definition.equipmentSlotTags !== undefined && definition.equipmentSlotTags.length > 0) {
    return copyStrings(definition.equipmentSlotTags);
  }
  if (definition.equipSlot !== undefined && definition.equipSlot.length > 0) {
    return [definition.equipSlot];
  }
  return [];
}

export function itemIsDestroyable(definition: ItemDefinition): boolean {
  return definition.destroyable !== false;
}

export function itemIsTradeable(definition: ItemDefinition): boolean {
  return definition.tradeable !== false;
}

export function itemUniquePolicy(definition: ItemDefinition): UniquePolicy {
  return definition.uniquePolicy !== undefined ? definition.uniquePolicy : "none";
}

export function countItem(inventory: PlayerInventory | undefined, itemId: string): number {
  if (inventory === undefined || itemId.length === 0) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId === itemId) {
      total += inventory.items[i].quantity;
    }
  }
  return total;
}

export function consumeItem(inventory: PlayerInventory, itemId: string, quantity: number): PlayerInventory | null {
  if (quantity <= 0) {
    return cloneInventory(inventory);
  }
  if (countItem(inventory, itemId) < quantity) {
    return null;
  }
  const next = cloneInventory(inventory);
  let remaining = quantity;
  const kept: ItemInstance[] = [];
  for (let i = 0; i < next.items.length; i++) {
    const stack = next.items[i];
    if (stack.itemId !== itemId || remaining <= 0 || isItemLocked(stack)) {
      kept.push(stack);
      continue;
    }
    if (stack.quantity > remaining) {
      stack.quantity -= remaining;
      remaining = 0;
      kept.push(stack);
      continue;
    }
    remaining -= stack.quantity;
  }
  next.items = kept;
  if (remaining > 0) {
    return null;
  }
  return next;
}

export function findItem(inventory: PlayerInventory | undefined, instanceId: string): ItemInstance | null {
  if (inventory === undefined || instanceId.length === 0) {
    return null;
  }
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].instanceId === instanceId) {
      return inventory.items[i];
    }
  }
  return null;
}

export function findItemBySlot(inventory: PlayerInventory, slotIndex: number): ItemInstance | null {
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].slotIndex === slotIndex) {
      return inventory.items[i];
    }
  }
  return null;
}

export function occupiedSlots(inventory: PlayerInventory): number {
  return inventory.items.length;
}

export function isItemLocked(item: ItemInstance): boolean {
  return item.lockReason.length > 0;
}

export function setItemLock(
  inventory: PlayerInventory,
  instanceId: string,
  lockReason: string,
  lockId: string,
): PlayerInventory {
  const next = cloneInventory(inventory);
  const item = findItem(next, instanceId);
  if (item === null) {
    return next;
  }
  item.lockReason = lockReason;
  item.lockId = lockId;
  return next;
}

export function clearLocksByLockId(inventory: PlayerInventory, lockId: string): PlayerInventory {
  const next = cloneInventory(inventory);
  if (lockId.length === 0) {
    return next;
  }
  for (let i = 0; i < next.items.length; i++) {
    if (next.items[i].lockId === lockId) {
      next.items[i].lockReason = "";
      next.items[i].lockId = "";
    }
  }
  return next;
}

export function takeItemQuantity(
  inventory: PlayerInventory,
  instanceId: string,
  quantity: number,
): PlayerInventory | null {
  if (quantity < 1 || quantity !== Math.floor(quantity)) {
    return null;
  }
  const next = cloneInventory(inventory);
  const item = findItem(next, instanceId);
  if (item === null || item.quantity < quantity) {
    return null;
  }
  if (quantity >= item.quantity) {
    next.items = next.items.filter((entry) => entry.instanceId !== instanceId);
    return next;
  }
  item.quantity -= quantity;
  item.lockReason = "";
  item.lockId = "";
  return next;
}

export function canAcceptItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
): boolean {
  return acceptItemFailureCode(inventory, itemId, quantity, definition).length === 0;
}

export function acceptItemFailureCode(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
): string {
  if (quantity <= 0) {
    return "invalid_id";
  }
  const uniqueCode = uniqueGrantFailure(inventory, itemId, quantity, definition);
  if (uniqueCode.length > 0) {
    return uniqueCode;
  }
  const maxStack = definition.maxStack < 1 ? 1 : definition.maxStack;
  let remaining = quantity;
  for (let i = 0; i < inventory.items.length; i++) {
    const stack = inventory.items[i];
    if (stack.itemId !== itemId) {
      continue;
    }
    const free = maxStack - stack.quantity;
    if (free > 0) {
      remaining -= Math.min(free, remaining);
      if (remaining <= 0) {
        return "";
      }
    }
  }
  const extraSlots = Math.ceil(remaining / maxStack);
  if (occupiedSlots(inventory) + extraSlots > inventory.capacity) {
    return "inventory_full";
  }
  return "";
}

export function addOrStackItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  instanceId: string,
  definition: ItemDefinition,
  grant?: ItemGrantOptions,
): PlayerInventory {
  const next = cloneInventory(inventory);
  const maxStack = definition.maxStack < 1 ? 1 : definition.maxStack;
  let remaining = quantity;
  for (let i = 0; i < next.items.length; i++) {
    const stack = next.items[i];
    if (stack.itemId !== itemId) {
      continue;
    }
    const free = maxStack - stack.quantity;
    if (free <= 0) {
      continue;
    }
    const added = Math.min(free, remaining);
    stack.quantity += added;
    remaining -= added;
    if (remaining <= 0) {
      return next;
    }
  }
  let usedStarterId = false;
  while (remaining > 0) {
    const take = Math.min(maxStack, remaining);
    const slotIndex = firstEmptySlotIndex(next);
    next.items.push(
      makeInstance(usedStarterId ? instanceId + "-" + String(next.items.length) : instanceId, itemId, take, slotIndex, grant),
    );
    usedStarterId = true;
    remaining -= take;
  }
  return next;
}

export function rememberPickup(
  inventory: PlayerInventory,
  requestId: string,
  record: PickupRecord,
  tick?: number,
): PlayerInventory {
  const next = cloneInventory(inventory);
  next.pickupByRequestId[requestId] = {
    ok: record.ok,
    code: record.code,
    lootId: record.lootId,
  };
  if (tick !== undefined) {
    next.pickupRequestTicks = stampTicks(next.pickupRequestTicks, requestId, tick);
  }
  return next;
}

export function applyDestroyItem(input: {
  playerHealth: number;
  inventory: PlayerInventory;
  equippedInstanceIds: ReadonlyArray<string>;
  instanceId: string;
  quantity?: number;
  requestId: string;
  itemsById: { [id: string]: ItemDefinition };
  tick?: number;
}): InventoryMutationDecision {
  const current = cloneInventory(input.inventory);
  const previous = mutationRecord(current, input.requestId);
  if (previous !== undefined && previous.ok) {
    return { ok: true, code: previous.code, replay: true, persist: false, inventory: current };
  }
  if (input.playerHealth <= 0) {
    return failMutation("player_dead", current);
  }
  const item = findItem(current, input.instanceId);
  if (item === null) {
    return failMutation("invalid_id", current);
  }
  if (isItemLocked(item)) {
    return failMutation("item_locked", current);
  }
  if (input.equippedInstanceIds.indexOf(item.instanceId) !== -1) {
    return failMutation("item_equipped", current);
  }
  const definition = input.itemsById[item.itemId];
  if (definition === undefined) {
    return failMutation("invalid_id", current);
  }
  if (!itemIsDestroyable(definition)) {
    return failMutation("not_destroyable", current);
  }
  const quantity = input.quantity !== undefined ? input.quantity : item.quantity;
  if (quantity < 1 || quantity !== Math.floor(quantity)) {
    return failMutation("invalid_id", current);
  }
  if (quantity >= item.quantity) {
    current.items = current.items.filter((entry) => entry.instanceId !== item.instanceId);
  } else {
    item.quantity -= quantity;
  }
  return succeedMutation(current, input.requestId, {
    ok: true,
    code: "ok",
    instanceId: input.instanceId,
    quantity: quantity,
  }, input.tick);
}

export function applySplitStack(input: {
  playerHealth: number;
  inventory: PlayerInventory;
  equippedInstanceIds: ReadonlyArray<string>;
  instanceId: string;
  quantity: number;
  requestId: string;
  itemsById: { [id: string]: ItemDefinition };
  newId: () => string;
  tick?: number;
}): InventoryMutationDecision {
  const current = cloneInventory(input.inventory);
  const previous = mutationRecord(current, input.requestId);
  if (previous !== undefined && previous.ok) {
    return {
      ok: true,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: current,
      newInstanceId: previous.newInstanceId,
    };
  }
  if (input.playerHealth <= 0) {
    return failMutation("player_dead", current);
  }
  if (input.quantity < 1 || input.quantity !== Math.floor(input.quantity)) {
    return failMutation("invalid_id", current);
  }
  const item = findItem(current, input.instanceId);
  if (item === null) {
    return failMutation("invalid_id", current);
  }
  if (isItemLocked(item)) {
    return failMutation("item_locked", current);
  }
  if (input.equippedInstanceIds.indexOf(item.instanceId) !== -1) {
    return failMutation("item_equipped", current);
  }
  const definition = input.itemsById[item.itemId];
  if (definition === undefined) {
    return failMutation("invalid_id", current);
  }
  if (input.quantity >= item.quantity) {
    return failMutation("invalid_id", current);
  }
  if (occupiedSlots(current) >= current.capacity) {
    return failMutation("inventory_full", current);
  }
  const newInstanceId = input.newId();
  item.quantity -= input.quantity;
  current.items.push(
    makeInstance(newInstanceId, item.itemId, input.quantity, firstEmptySlotIndex(current), {
      sourceType: "split",
      sourceId: item.instanceId,
      createdAt: item.createdAt,
    }),
  );
  return succeedMutation(
    current,
    input.requestId,
    {
      ok: true,
      code: "ok",
      instanceId: input.instanceId,
      quantity: input.quantity,
      newInstanceId: newInstanceId,
    },
    input.tick,
    newInstanceId,
  );
}

export function applyMoveItem(input: {
  playerHealth: number;
  inventory: PlayerInventory;
  instanceId: string;
  toSlotIndex: number;
  requestId: string;
  itemsById: { [id: string]: ItemDefinition };
  tick?: number;
}): InventoryMutationDecision {
  const current = cloneInventory(input.inventory);
  const previous = mutationRecord(current, input.requestId);
  if (previous !== undefined && previous.ok) {
    return { ok: true, code: previous.code, replay: true, persist: false, inventory: current };
  }
  if (input.playerHealth <= 0) {
    return failMutation("player_dead", current);
  }
  if (
    input.toSlotIndex < 0 ||
    input.toSlotIndex !== Math.floor(input.toSlotIndex) ||
    input.toSlotIndex >= current.capacity
  ) {
    return failMutation("invalid_slot", current);
  }
  const item = findItem(current, input.instanceId);
  if (item === null) {
    return failMutation("invalid_id", current);
  }
  if (isItemLocked(item)) {
    return failMutation("item_locked", current);
  }
  const dest = findItemBySlot(current, input.toSlotIndex);
  if (dest === null || dest.instanceId === item.instanceId) {
    item.slotIndex = input.toSlotIndex;
    return succeedMutation(current, input.requestId, {
      ok: true,
      code: "ok",
      instanceId: input.instanceId,
      quantity: item.quantity,
      toSlotIndex: input.toSlotIndex,
    }, input.tick);
  }
  if (dest.itemId === item.itemId) {
    if (isItemLocked(dest)) {
      return failMutation("item_locked", current);
    }
    const definition = input.itemsById[item.itemId];
    if (definition === undefined) {
      return failMutation("invalid_id", current);
    }
    const maxStack = definition.maxStack < 1 ? 1 : definition.maxStack;
    const free = maxStack - dest.quantity;
    if (free <= 0) {
      const fromSlot = item.slotIndex;
      item.slotIndex = dest.slotIndex;
      dest.slotIndex = fromSlot;
    } else {
      const moved = Math.min(free, item.quantity);
      dest.quantity += moved;
      item.quantity -= moved;
      if (item.quantity <= 0) {
        current.items = current.items.filter((entry) => entry.instanceId !== item.instanceId);
      }
    }
    return succeedMutation(current, input.requestId, {
      ok: true,
      code: "ok",
      instanceId: input.instanceId,
      quantity: dest.quantity,
      toSlotIndex: input.toSlotIndex,
    }, input.tick);
  }
  const fromSlot = item.slotIndex;
  item.slotIndex = dest.slotIndex;
  dest.slotIndex = fromSlot;
  return succeedMutation(current, input.requestId, {
    ok: true,
    code: "ok",
    instanceId: input.instanceId,
    quantity: item.quantity,
    toSlotIndex: input.toSlotIndex,
  }, input.tick);
}

export function publicInventory(inventory: PlayerInventory): { [key: string]: unknown } {
  const items: { [key: string]: unknown }[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    items.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      metadata: cloneMetadata(item.metadata),
      lockReason: item.lockReason.length > 0 ? item.lockReason : null,
      lockId: item.lockId.length > 0 ? item.lockId : null,
      slotIndex: item.slotIndex,
    });
  }
  return {
    capacity: inventory.capacity,
    items: items,
  };
}

function uniqueGrantFailure(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
): string {
  if (itemUniquePolicy(definition) !== "character") {
    return "";
  }
  const maxStack = definition.maxStack < 1 ? 1 : definition.maxStack;
  let remaining = quantity;
  let instances = 0;
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i].itemId !== itemId) {
      continue;
    }
    instances += 1;
    const free = maxStack - inventory.items[i].quantity;
    if (free > 0) {
      remaining -= Math.min(free, remaining);
    }
  }
  if (remaining <= 0) {
    return "";
  }
  if (instances >= 1) {
    return "unique_restricted";
  }
  if (remaining > maxStack) {
    return "unique_restricted";
  }
  return "";
}

function mutationRecord(inventory: PlayerInventory, requestId: string): InventoryMutationRecord | undefined {
  const map = dict(inventory.mutationByRequestId);
  return map[requestId];
}

function succeedMutation(
  inventory: PlayerInventory,
  requestId: string,
  record: InventoryMutationRecord,
  tick?: number,
  newInstanceId?: string,
): InventoryMutationDecision {
  const next = cloneInventory(inventory);
  if (next.mutationByRequestId === undefined) {
    next.mutationByRequestId = {};
  }
  next.mutationByRequestId[requestId] = {
    ok: record.ok,
    code: record.code,
    instanceId: record.instanceId,
    quantity: record.quantity,
  };
  if (record.toSlotIndex !== undefined) {
    next.mutationByRequestId[requestId].toSlotIndex = record.toSlotIndex;
  }
  if (record.newInstanceId !== undefined) {
    next.mutationByRequestId[requestId].newInstanceId = record.newInstanceId;
  }
  if (tick !== undefined) {
    next.mutationRequestTicks = stampTicks(next.mutationRequestTicks, requestId, tick);
  }
  const decision: InventoryMutationDecision = {
    ok: true,
    code: record.code,
    replay: false,
    persist: true,
    inventory: next,
  };
  if (newInstanceId !== undefined) {
    decision.newInstanceId = newInstanceId;
  }
  return decision;
}

function failMutation(code: string, inventory: PlayerInventory): InventoryMutationDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    inventory: inventory,
  };
}

function stampTicks(
  ticks: { [requestId: string]: number } | undefined,
  requestId: string,
  tick: number,
): { [requestId: string]: number } {
  const next: { [requestId: string]: number } = {};
  if (ticks != null) {
    const keys = Object.keys(ticks);
    for (let i = 0; i < keys.length; i++) {
      next[keys[i]] = ticks[keys[i]];
    }
  }
  next[requestId] = tick;
  return next;
}

function firstEmptySlotIndex(inventory: PlayerInventory): number {
  const used: { [index: number]: boolean } = {};
  for (let i = 0; i < inventory.items.length; i++) {
    used[inventory.items[i].slotIndex] = true;
  }
  for (let slot = 0; slot < inventory.capacity; slot++) {
    if (used[slot] !== true) {
      return slot;
    }
  }
  return inventory.items.length;
}

function ensureSlotIndices(inventory: PlayerInventory): void {
  const used: { [index: number]: boolean } = {};
  const reassign: ItemInstance[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    const slot = item.slotIndex;
    if (typeof slot === "number" && slot === Math.floor(slot) && slot >= 0 && slot < inventory.capacity && used[slot] !== true) {
      used[slot] = true;
      continue;
    }
    reassign.push(item);
  }
  for (let r = 0; r < reassign.length; r++) {
    let nextSlot = 0;
    while (used[nextSlot] === true) {
      nextSlot += 1;
    }
    reassign[r].slotIndex = nextSlot;
    used[nextSlot] = true;
  }
}

function makeInstance(
  instanceId: string,
  itemId: string,
  quantity: number,
  slotIndex: number,
  grant?: ItemGrantOptions,
): ItemInstance {
  return {
    instanceId: instanceId,
    itemId: itemId,
    quantity: quantity,
    createdAt: grant !== undefined && grant.createdAt !== undefined ? grant.createdAt : 0,
    sourceType: grant !== undefined && grant.sourceType !== undefined && grant.sourceType.length > 0 ? grant.sourceType : "grant",
    sourceId: grant !== undefined && grant.sourceId !== undefined ? grant.sourceId : "",
    metadata: {},
    lockReason: "",
    lockId: "",
    slotIndex: slotIndex,
  };
}

function cloneItem(item: ItemInstance): ItemInstance {
  return {
    instanceId: item.instanceId,
    itemId: item.itemId,
    quantity: item.quantity,
    createdAt: typeof item.createdAt === "number" && isFinite(item.createdAt) ? item.createdAt : 0,
    sourceType: typeof item.sourceType === "string" && item.sourceType.length > 0 ? item.sourceType : "migration",
    sourceId: typeof item.sourceId === "string" ? item.sourceId : "",
    metadata: cloneMetadata(item.metadata),
    lockReason: typeof item.lockReason === "string" ? item.lockReason : "",
    lockId: typeof item.lockId === "string" ? item.lockId : "",
    slotIndex: typeof item.slotIndex === "number" && isFinite(item.slotIndex) ? item.slotIndex : -1,
  };
}

function cloneMetadata(metadata: { [key: string]: unknown }): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  const source = dict(metadata);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function copyStrings(values: readonly string[]): string[] {
  const list: string[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push(values[i]);
  }
  return list;
}

function copyModifiers(values: ReadonlyArray<ItemStatModifier>): ItemStatModifier[] {
  const list: ItemStatModifier[] = [];
  for (let i = 0; i < values.length; i++) {
    list.push({ statId: values[i].statId, amount: values[i].amount });
  }
  return list;
}
