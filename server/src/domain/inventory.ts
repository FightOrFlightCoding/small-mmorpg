import { cloneTickMap, dict } from "./maps";
import { cloneExtras, envelopeFromRecord } from "./save_schema";
import { planCapacity } from "./item_capacity";
import { isTerminalItemFailure, staleRevisionCode } from "./item_errors";
import type { ItemMutationAudit } from "./item_audit";
import type { ItemIntent } from "./item_intent";
import type { ItemJournalRecord } from "./item_journal";

export const INVENTORY_CAPACITY = 30;
export const ITEM_MAX_STACK = 99;
export const ITEM_INSTANCE_SCHEMA_VERSION = 1;
export const STARTER_ITEM_ID = "item.training_sword";

export type ItemCategory = "weapon" | "armor" | "consumable" | "quest" | "material" | "miscellaneous";
export type UniquePolicy = "none" | "character" | "equipped";
export type ItemRarity =
  | "rarity.poor"
  | "rarity.common"
  | "rarity.uncommon"
  | "rarity.rare"
  | "rarity.epic"
  | "rarity.legendary";

export interface ItemStatModifier {
  statId: string;
  amount: number;
}

export interface ItemDefinition {
  id: string;
  maxStack: number;
  category?: ItemCategory;
  rarity?: ItemRarity;
  questItem?: boolean;
  equippable?: boolean;
  droppable?: boolean;
  tags?: readonly string[];
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
  schemaVersion?: number;
}

export interface ItemGrantOptions {
  sourceType?: string;
  sourceId?: string;
  createdAt?: number;
  stackKey?: string;
  metadata?: { [key: string]: unknown };
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  quantity: number;
  createdAt: number;
  sourceType: string;
  sourceId: string;
  metadata: { [key: string]: unknown };
  stackKey: string;
  lockReason: string;
  lockId: string;
  lockType: string;
  lockQuantity: number;
  lockOwnerOperation: string;
  lockCreatedAt: number;
  lockExpiresAt: number;
  version: number;
  schemaVersion: number;
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
  revision: number;
  pickupByRequestId: { [requestId: string]: PickupRecord };
  pickupRequestTicks?: { [requestId: string]: number };
  mutationByRequestId?: { [requestId: string]: InventoryMutationRecord };
  mutationRequestTicks?: { [requestId: string]: number };
  journalByRequestId?: { [requestId: string]: ItemJournalRecord };
  intentsByRequestId?: { [requestId: string]: ItemIntent };
  itemAudits?: ItemMutationAudit[];
  persistReason?: string;
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
    capacity: capacity > 0 ? capacity : INVENTORY_CAPACITY,
    items: [],
    revision: 0,
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
    capacity:
      typeof inventory.capacity === "number" && inventory.capacity > 0 ? inventory.capacity : INVENTORY_CAPACITY,
    items: items,
    revision: typeof inventory.revision === "number" && isFinite(inventory.revision) ? inventory.revision : 0,
    pickupByRequestId: pickupByRequestId,
    pickupRequestTicks: cloneTickMap(inventory.pickupRequestTicks),
    mutationByRequestId: mutationByRequestId,
    mutationRequestTicks: cloneTickMap(inventory.mutationRequestTicks),
    journalByRequestId: cloneJournalMap(inventory.journalByRequestId),
    intentsByRequestId: cloneIntentMap(inventory.intentsByRequestId),
    itemAudits: cloneAuditList(inventory.itemAudits),
    schemaVersion: envelope.schemaVersion,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    extras: cloneExtras(inventory.extras),
  };
  if (inventory.persistReason !== undefined && inventory.persistReason.length > 0) {
    next.persistReason = inventory.persistReason;
  }
  ensureSlotIndices(next);
  return next;
}

export function bumpInventoryRevision(inventory: PlayerInventory): PlayerInventory {
  const next = cloneInventory(inventory);
  next.revision = (typeof next.revision === "number" && isFinite(next.revision) ? next.revision : 0) + 1;
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
      capacity: capacity > 0 ? capacity : INVENTORY_CAPACITY,
      items: items,
      revision: 0,
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
    rarity?: ItemRarity;
    questItem?: boolean;
    equippable?: boolean;
    droppable?: boolean;
    tags?: readonly string[];
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
    schemaVersion?: number;
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
    if (item.rarity !== undefined) {
      definition.rarity = item.rarity;
    }
    if (item.questItem !== undefined) {
      definition.questItem = item.questItem;
    }
    if (item.equippable !== undefined) {
      definition.equippable = item.equippable;
    }
    if (item.droppable !== undefined) {
      definition.droppable = item.droppable;
    }
    if (item.tags !== undefined) {
      definition.tags = copyStrings(item.tags);
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
    if (item.schemaVersion !== undefined) {
      definition.schemaVersion = item.schemaVersion;
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

export function itemIsEquippable(definition: ItemDefinition): boolean {
  if (definition.equippable === true) {
    return true;
  }
  return itemSlotTags(definition).length > 0;
}

export function itemIsDestroyable(definition: ItemDefinition): boolean {
  return definition.destroyable !== false;
}

export function itemIsTradeable(definition: ItemDefinition): boolean {
  return definition.tradeable !== false;
}

export function itemIsDroppable(definition: ItemDefinition): boolean {
  return definition.droppable !== false;
}

export function itemUniquePolicy(definition: ItemDefinition): UniquePolicy {
  return definition.uniquePolicy !== undefined ? definition.uniquePolicy : "none";
}

export function effectiveMaxStack(definition: ItemDefinition): number {
  if (itemIsEquippable(definition)) {
    return 1;
  }
  if (definition.maxStack < 1) {
    return 1;
  }
  if (definition.maxStack > ITEM_MAX_STACK) {
    return ITEM_MAX_STACK;
  }
  return definition.maxStack;
}

export function itemDefinitionId(item: ItemInstance): string {
  return item.itemId;
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

export function countOwnedItem(
  inventory: PlayerInventory | undefined,
  equippedItems: ReadonlyArray<ItemInstance> | undefined,
  itemId: string,
): number {
  let total = countItem(inventory, itemId);
  if (equippedItems === undefined || itemId.length === 0) {
    return total;
  }
  for (let i = 0; i < equippedItems.length; i++) {
    if (equippedItems[i].itemId === itemId) {
      total += equippedItems[i].quantity;
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
      stack.version += 1;
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
  next.revision += 1;
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
  return item.lockType.length > 0 || item.lockReason.length > 0;
}

export function setItemLock(
  inventory: PlayerInventory,
  instanceId: string,
  lockReason: string,
  lockId: string,
  extras?: {
    lockType?: string;
    quantity?: number;
    ownerOperation?: string;
    createdAt?: number;
    expiresAt?: number;
  },
): PlayerInventory {
  const next = cloneInventory(inventory);
  const item = findItem(next, instanceId);
  if (item === null) {
    return next;
  }
  item.lockReason = lockReason;
  item.lockType = extras !== undefined && extras.lockType !== undefined && extras.lockType.length > 0 ? extras.lockType : lockReason;
  item.lockId = lockId;
  item.lockQuantity = extras !== undefined && extras.quantity !== undefined ? extras.quantity : item.quantity;
  item.lockOwnerOperation = extras !== undefined && extras.ownerOperation !== undefined ? extras.ownerOperation : "";
  item.lockCreatedAt = extras !== undefined && extras.createdAt !== undefined ? extras.createdAt : 0;
  item.lockExpiresAt = extras !== undefined && extras.expiresAt !== undefined ? extras.expiresAt : 0;
  item.version += 1;
  next.revision += 1;
  return next;
}

export function clearLocksByLockId(inventory: PlayerInventory, lockId: string): PlayerInventory {
  const next = cloneInventory(inventory);
  if (lockId.length === 0) {
    return next;
  }
  let changed = false;
  for (let i = 0; i < next.items.length; i++) {
    if (next.items[i].lockId === lockId) {
      next.items[i].lockReason = "";
      next.items[i].lockType = "";
      next.items[i].lockId = "";
      next.items[i].lockQuantity = 0;
      next.items[i].lockOwnerOperation = "";
      next.items[i].lockCreatedAt = 0;
      next.items[i].lockExpiresAt = 0;
      next.items[i].version += 1;
      changed = true;
    }
  }
  if (changed) {
    next.revision += 1;
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
    next.revision += 1;
    return next;
  }
  item.quantity -= quantity;
  item.lockReason = "";
  item.lockType = "";
  item.lockId = "";
  item.lockQuantity = 0;
  item.lockOwnerOperation = "";
  item.lockCreatedAt = 0;
  item.lockExpiresAt = 0;
  item.version += 1;
  next.revision += 1;
  return next;
}

export function canonicalMetadataEqual(
  left: { [key: string]: unknown } | undefined,
  right: { [key: string]: unknown } | undefined,
): boolean {
  return stableMetadata(left) === stableMetadata(right);
}

export function stackIdentitiesMatch(a: ItemInstance, b: ItemInstance): boolean {
  if (a.itemId !== b.itemId) {
    return false;
  }
  if ((a.stackKey !== undefined ? a.stackKey : "") !== (b.stackKey !== undefined ? b.stackKey : "")) {
    return false;
  }
  if (!canonicalMetadataEqual(a.metadata, b.metadata)) {
    return false;
  }
  if (isItemLocked(a) || isItemLocked(b)) {
    return false;
  }
  return true;
}

export function stacksAreCompatible(a: ItemInstance, b: ItemInstance, definition: ItemDefinition): boolean {
  if (definition.id !== a.itemId || definition.id !== b.itemId) {
    return false;
  }
  if (!stackIdentitiesMatch(a, b)) {
    return false;
  }
  return a.quantity + b.quantity <= effectiveMaxStack(definition);
}

export function canAcceptItem(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
  equippedItems?: ReadonlyArray<ItemInstance>,
): boolean {
  return acceptItemFailureCode(inventory, itemId, quantity, definition, equippedItems).length === 0;
}

export function acceptItemFailureCode(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
  equippedItems?: ReadonlyArray<ItemInstance>,
): string {
  if (quantity <= 0) {
    return "invalid_id";
  }
  const definitions: { [id: string]: ItemDefinition } = {};
  definitions[definition.id] = definition;
  const plan = planCapacity({
    inventory: inventory,
    incoming: [{ itemId: itemId, quantity: quantity }],
    definitions: definitions,
    equippedItems: equippedItems,
    operationMode: "grant",
  });
  if (plan.fits) {
    return "";
  }
  return plan.failureCode.length > 0 ? plan.failureCode : "inventory_full";
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
  const maxStack = effectiveMaxStack(definition);
  const incoming = grantIdentity(itemId, definition, grant);
  let remaining = quantity;
  for (let i = 0; i < next.items.length; i++) {
    const stack = next.items[i];
    if (!stackIdentitiesMatch(stack, incoming)) {
      continue;
    }
    const free = maxStack - stack.quantity;
    if (free <= 0) {
      continue;
    }
    const added = Math.min(free, remaining);
    stack.quantity += added;
    stack.version += 1;
    remaining -= added;
    if (remaining <= 0) {
      next.revision += 1;
      return next;
    }
  }
  let usedStarterId = false;
  while (remaining > 0) {
    const take = Math.min(maxStack, remaining);
    const slotIndex = firstEmptySlotIndex(next);
    if (slotIndex < 0 || slotIndex >= next.capacity) {
      break;
    }
    next.items.push(
      makeInstance(usedStarterId ? instanceId + "-" + String(next.items.length) : instanceId, itemId, take, slotIndex, grant),
    );
    usedStarterId = true;
    remaining -= take;
  }
  next.revision += 1;
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
  expectedRevision?: number;
}): InventoryMutationDecision {
  const current = cloneInventory(input.inventory);
  const previous = mutationRecord(current, input.requestId);
  if (previous !== undefined) {
    return { ok: previous.ok, code: previous.code, replay: true, persist: false, inventory: current };
  }
  const stale = staleRevisionCode(current.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failMutation(stale, current);
  }
  if (input.playerHealth <= 0) {
    return failMutation("player_dead", current);
  }
  const item = findItem(current, input.instanceId);
  if (item === null) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (isItemLocked(item)) {
    return rememberFailedMutation("item_locked", current, input.requestId, input.tick);
  }
  if (input.equippedInstanceIds.indexOf(item.instanceId) !== -1) {
    return rememberFailedMutation("item_equipped", current, input.requestId, input.tick);
  }
  const definition = input.itemsById[item.itemId];
  if (definition === undefined) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (!itemIsDestroyable(definition)) {
    return rememberFailedMutation("not_destroyable", current, input.requestId, input.tick);
  }
  const quantity = input.quantity !== undefined ? input.quantity : item.quantity;
  if (quantity < 1 || quantity !== Math.floor(quantity)) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (quantity >= item.quantity) {
    current.items = current.items.filter((entry) => entry.instanceId !== item.instanceId);
  } else {
    item.quantity -= quantity;
    item.version += 1;
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
  expectedRevision?: number;
}): InventoryMutationDecision {
  const current = cloneInventory(input.inventory);
  const previous = mutationRecord(current, input.requestId);
  if (previous !== undefined) {
    return {
      ok: previous.ok,
      code: previous.code,
      replay: true,
      persist: false,
      inventory: current,
      newInstanceId: previous.newInstanceId,
    };
  }
  const stale = staleRevisionCode(current.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failMutation(stale, current);
  }
  if (input.playerHealth <= 0) {
    return failMutation("player_dead", current);
  }
  if (input.quantity < 1 || input.quantity !== Math.floor(input.quantity)) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  const item = findItem(current, input.instanceId);
  if (item === null) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (isItemLocked(item)) {
    return rememberFailedMutation("item_locked", current, input.requestId, input.tick);
  }
  if (input.equippedInstanceIds.indexOf(item.instanceId) !== -1) {
    return rememberFailedMutation("item_equipped", current, input.requestId, input.tick);
  }
  const definition = input.itemsById[item.itemId];
  if (definition === undefined) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (input.quantity >= item.quantity) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (occupiedSlots(current) >= current.capacity) {
    return rememberFailedMutation("inventory_full", current, input.requestId, input.tick);
  }
  const destSlot = firstEmptySlotIndex(current);
  if (destSlot < 0 || destSlot >= current.capacity) {
    return rememberFailedMutation("inventory_full", current, input.requestId, input.tick);
  }
  const newInstanceId = input.newId();
  item.quantity -= input.quantity;
  item.version += 1;
  current.items.push(
    makeInstance(newInstanceId, item.itemId, input.quantity, destSlot, {
      sourceType: "split",
      sourceId: item.instanceId,
      createdAt: item.createdAt,
      stackKey: item.stackKey,
      metadata: cloneMetadata(item.metadata),
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
  expectedRevision?: number;
}): InventoryMutationDecision {
  const current = cloneInventory(input.inventory);
  const previous = mutationRecord(current, input.requestId);
  if (previous !== undefined) {
    return { ok: previous.ok, code: previous.code, replay: true, persist: false, inventory: current };
  }
  const stale = staleRevisionCode(current.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failMutation(stale, current);
  }
  if (input.playerHealth <= 0) {
    return failMutation("player_dead", current);
  }
  if (
    input.toSlotIndex < 0 ||
    input.toSlotIndex !== Math.floor(input.toSlotIndex) ||
    input.toSlotIndex >= current.capacity
  ) {
    return rememberFailedMutation("invalid_slot", current, input.requestId, input.tick);
  }
  const item = findItem(current, input.instanceId);
  if (item === null) {
    return rememberFailedMutation("invalid_id", current, input.requestId, input.tick);
  }
  if (isItemLocked(item)) {
    return rememberFailedMutation("item_locked", current, input.requestId, input.tick);
  }
  const dest = findItemBySlot(current, input.toSlotIndex);
  if (dest === null || dest.instanceId === item.instanceId) {
    item.slotIndex = input.toSlotIndex;
    item.version += 1;
    return succeedMutation(current, input.requestId, {
      ok: true,
      code: "ok",
      instanceId: input.instanceId,
      quantity: item.quantity,
      toSlotIndex: input.toSlotIndex,
    }, input.tick);
  }
  const definition = input.itemsById[item.itemId];
  if (definition !== undefined && stackIdentitiesMatch(item, dest)) {
    if (isItemLocked(dest)) {
      return rememberFailedMutation("item_locked", current, input.requestId, input.tick);
    }
    const maxStack = effectiveMaxStack(definition);
    const free = maxStack - dest.quantity;
    if (free <= 0) {
      return rememberFailedMutation("stack_full", current, input.requestId, input.tick);
    }
    const moved = Math.min(free, item.quantity);
    dest.quantity += moved;
    dest.version += 1;
    item.quantity -= moved;
    item.version += 1;
    if (item.quantity <= 0) {
      current.items = current.items.filter((entry) => entry.instanceId !== item.instanceId);
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
  item.version += 1;
  dest.version += 1;
  return succeedMutation(current, input.requestId, {
    ok: true,
    code: "ok",
    instanceId: input.instanceId,
    quantity: item.quantity,
    toSlotIndex: input.toSlotIndex,
  }, input.tick);
}

export function publicItemInstance(item: ItemInstance): { [key: string]: unknown } {
  return {
    instanceId: item.instanceId,
    itemId: item.itemId,
    definitionId: item.itemId,
    quantity: item.quantity,
    createdAt: item.createdAt,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    metadata: cloneMetadata(item.metadata),
    stackKey: item.stackKey,
    lockReason: item.lockReason.length > 0 ? item.lockReason : null,
    lockId: item.lockId.length > 0 ? item.lockId : null,
    lockType: item.lockType.length > 0 ? item.lockType : null,
    version: item.version,
    schemaVersion: item.schemaVersion,
    slotIndex: item.slotIndex,
  };
}

export function publicInventory(
  inventory: PlayerInventory,
  overflow?: { items: ItemInstance[]; revision: number; schemaVersion?: number },
): { [key: string]: unknown } {
  const items: { [key: string]: unknown }[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    items.push(publicItemInstance(inventory.items[i]));
  }
  const payload: { [key: string]: unknown } = {
    capacity: inventory.capacity,
    items: items,
    revision: inventory.revision,
    schemaVersion: inventory.schemaVersion !== undefined ? inventory.schemaVersion : 1,
  };
  if (overflow !== undefined) {
    const overflowItems: { [key: string]: unknown }[] = [];
    for (let o = 0; o < overflow.items.length; o++) {
      overflowItems.push(publicItemInstance(overflow.items[o]));
    }
    payload.overflow = {
      items: overflowItems,
      revision: overflow.revision,
      schemaVersion: overflow.schemaVersion !== undefined ? overflow.schemaVersion : 1,
    };
  }
  return payload;
}

export function firstEmptySlotIndex(inventory: PlayerInventory): number {
  const used: { [index: number]: boolean } = {};
  for (let i = 0; i < inventory.items.length; i++) {
    const slot = inventory.items[i].slotIndex;
    if (slot >= 0 && slot < inventory.capacity) {
      used[slot] = true;
    }
  }
  for (let slot = 0; slot < inventory.capacity; slot++) {
    if (used[slot] !== true) {
      return slot;
    }
  }
  return -1;
}

export function makeInstance(
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
    metadata: grant !== undefined && grant.metadata !== undefined ? cloneMetadata(grant.metadata) : {},
    stackKey: grant !== undefined && grant.stackKey !== undefined ? grant.stackKey : "",
    lockReason: "",
    lockId: "",
    lockType: "",
    lockQuantity: 0,
    lockOwnerOperation: "",
    lockCreatedAt: 0,
    lockExpiresAt: 0,
    version: 1,
    schemaVersion: ITEM_INSTANCE_SCHEMA_VERSION,
    slotIndex: slotIndex,
  };
}

export function cloneItem(item: ItemInstance): ItemInstance {
  const lockReason = typeof item.lockReason === "string" ? item.lockReason : "";
  const lockTypeRaw = typeof item.lockType === "string" ? item.lockType : "";
  const lockType = lockTypeRaw.length > 0 ? lockTypeRaw : lockReason;
  const itemId =
    typeof item.itemId === "string" && item.itemId.length > 0
      ? item.itemId
      : typeof (item as unknown as { definitionId?: string }).definitionId === "string"
        ? ((item as unknown as { definitionId: string }).definitionId)
        : "";
  return {
    instanceId: item.instanceId,
    itemId: itemId,
    quantity: item.quantity,
    createdAt: typeof item.createdAt === "number" && isFinite(item.createdAt) ? item.createdAt : 0,
    sourceType: typeof item.sourceType === "string" && item.sourceType.length > 0 ? item.sourceType : "migration",
    sourceId: typeof item.sourceId === "string" ? item.sourceId : "",
    metadata: cloneMetadata(item.metadata),
    stackKey: typeof item.stackKey === "string" ? item.stackKey : "",
    lockReason: lockReason,
    lockId: typeof item.lockId === "string" ? item.lockId : "",
    lockType: lockType,
    lockQuantity: typeof item.lockQuantity === "number" && isFinite(item.lockQuantity) ? item.lockQuantity : 0,
    lockOwnerOperation: typeof item.lockOwnerOperation === "string" ? item.lockOwnerOperation : "",
    lockCreatedAt: typeof item.lockCreatedAt === "number" && isFinite(item.lockCreatedAt) ? item.lockCreatedAt : 0,
    lockExpiresAt: typeof item.lockExpiresAt === "number" && isFinite(item.lockExpiresAt) ? item.lockExpiresAt : 0,
    version: typeof item.version === "number" && item.version >= 1 ? Math.floor(item.version) : 1,
    schemaVersion:
      typeof item.schemaVersion === "number" && item.schemaVersion >= 1
        ? Math.floor(item.schemaVersion)
        : ITEM_INSTANCE_SCHEMA_VERSION,
    slotIndex: typeof item.slotIndex === "number" && isFinite(item.slotIndex) ? item.slotIndex : -1,
  };
}

function grantIdentity(itemId: string, _definition: ItemDefinition, grant?: ItemGrantOptions): ItemInstance {
  return {
    instanceId: "",
    itemId: itemId,
    quantity: 0,
    createdAt: 0,
    sourceType: "",
    sourceId: "",
    metadata: grant !== undefined && grant.metadata !== undefined ? cloneMetadata(grant.metadata) : {},
    stackKey: grant !== undefined && grant.stackKey !== undefined ? grant.stackKey : "",
    lockReason: "",
    lockId: "",
    lockType: "",
    lockQuantity: 0,
    lockOwnerOperation: "",
    lockCreatedAt: 0,
    lockExpiresAt: 0,
    version: 1,
    schemaVersion: ITEM_INSTANCE_SCHEMA_VERSION,
    slotIndex: -1,
  };
}

export function uniqueGrantFailure(
  inventory: PlayerInventory,
  itemId: string,
  quantity: number,
  definition: ItemDefinition,
  equippedItems?: ReadonlyArray<ItemInstance>,
): string {
  if (itemUniquePolicy(definition) !== "character") {
    return "";
  }
  const maxStack = effectiveMaxStack(definition);
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
  if (equippedItems !== undefined) {
    for (let e = 0; e < equippedItems.length; e++) {
      if (equippedItems[e].itemId === itemId) {
        instances += 1;
      }
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
  next.revision += 1;
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

function rememberFailedMutation(
  code: string,
  inventory: PlayerInventory,
  requestId: string,
  tick?: number,
): InventoryMutationDecision {
  if (!isTerminalItemFailure(code)) {
    return failMutation(code, inventory);
  }
  const next = cloneInventory(inventory);
  if (next.mutationByRequestId === undefined) {
    next.mutationByRequestId = {};
  }
  next.mutationByRequestId[requestId] = {
    ok: false,
    code: code,
    instanceId: "",
    quantity: 0,
  };
  if (tick !== undefined) {
    next.mutationRequestTicks = stampTicks(next.mutationRequestTicks, requestId, tick);
  }
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    inventory: next,
  };
}

function cloneJournalMap(
  source: PlayerInventory["journalByRequestId"],
): PlayerInventory["journalByRequestId"] {
  if (source === undefined) {
    return undefined;
  }
  const copy: { [requestId: string]: ItemJournalRecord } = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function cloneIntentMap(source: PlayerInventory["intentsByRequestId"]): PlayerInventory["intentsByRequestId"] {
  if (source === undefined) {
    return undefined;
  }
  const copy: { [requestId: string]: ItemIntent } = {};
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function cloneAuditList(source: PlayerInventory["itemAudits"]): PlayerInventory["itemAudits"] {
  if (source === undefined) {
    return undefined;
  }
  const list: ItemMutationAudit[] = [];
  for (let i = 0; i < source.length; i++) {
    list.push(source[i]);
  }
  return list;
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

function ensureSlotIndices(inventory: PlayerInventory): void {
  const used: { [index: number]: boolean } = {};
  const reassign: ItemInstance[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    const slot = item.slotIndex;
    if (
      typeof slot === "number" &&
      slot === Math.floor(slot) &&
      slot >= 0 &&
      slot < inventory.capacity &&
      used[slot] !== true
    ) {
      used[slot] = true;
      continue;
    }
    reassign.push(item);
  }
  for (let r = 0; r < reassign.length; r++) {
    let nextSlot = -1;
    for (let slot = 0; slot < inventory.capacity; slot++) {
      if (used[slot] !== true) {
        nextSlot = slot;
        break;
      }
    }
    if (nextSlot < 0) {
      reassign[r].slotIndex = -1;
      continue;
    }
    reassign[r].slotIndex = nextSlot;
    used[nextSlot] = true;
  }
}

function cloneMetadata(metadata: { [key: string]: unknown } | undefined): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  const source = dict(metadata);
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = source[keys[i]];
  }
  return copy;
}

function stableMetadata(metadata: { [key: string]: unknown } | undefined): string {
  const source = dict(metadata);
  const keys = Object.keys(source);
  keys.sort();
  const parts: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    parts.push(keys[i] + ":" + stableValue(source[keys[i]]));
  }
  return parts.join("|");
}

function stableValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      parts.push(stableValue(value[i]));
    }
    return "[" + parts.join(",") + "]";
  }
  if (typeof value === "object") {
    return "{" + stableMetadata(value as { [key: string]: unknown }) + "}";
  }
  return "";
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
