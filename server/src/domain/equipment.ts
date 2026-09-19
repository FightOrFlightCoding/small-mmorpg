import {
  findItem,
  firstEmptySlotIndex,
  isItemLocked,
  itemSlotTags,
  cloneInventory,
  cloneItem,
  emptyInventory,
  occupiedSlots,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { cloneTickMap, dict } from "./maps";
import { cloneExtras, envelopeFromRecord } from "./save_schema";

export const MAIN_HAND_SLOT = "main_hand";
export const TEMPORARY_EQUIPMENT_SLOT_TAGS = ["main_hand", "off_hand", "head", "chest", "legs", "feet"] as const;

export interface EquipmentSlotContent {
  id: string;
  tag: string;
  displayName: string;
  allowedCategories: string[];
}

export interface EquipRecord {
  ok: boolean;
  code: string;
  slot: string;
  instanceId: string;
}

export interface PlayerEquipment {
  slots: { [slot: string]: string };
  items: ItemInstance[];
  revision: number;
  equipByRequestId: { [requestId: string]: EquipRecord };
  equipRequestTicks?: { [requestId: string]: number };
  schemaVersion?: number;
  createdAt?: number;
  updatedAt?: number;
  extras?: { [key: string]: unknown };
}

export interface InventoryOwner {
  userId: string;
  inventory: PlayerInventory | undefined;
  equipment?: PlayerEquipment;
}

export interface EquipInput {
  playerHealth: number;
  userId: string;
  instanceId: string;
  slot: string;
  requestId: string;
  equipment: PlayerEquipment;
  inventory: PlayerInventory | undefined;
  itemsById: { [id: string]: ItemDefinition };
  baseAttack: number;
  owners: ReadonlyArray<InventoryOwner>;
  unequip: boolean;
  tick?: number;
  classId?: string;
  playerLevel?: number;
  classEquipmentTags?: ReadonlyArray<string>;
  equipmentSlotsByTag?: { [tag: string]: EquipmentSlotContent };
}

export interface EquipDecision {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  persistInventory: boolean;
  equipment: PlayerEquipment;
  inventory: PlayerInventory;
  derivedAttack: number;
}

export interface LoadEquipmentResult {
  equipment: PlayerEquipment;
  persist: boolean;
}

export function emptySlotMap(tags: readonly string[] = TEMPORARY_EQUIPMENT_SLOT_TAGS): { [slot: string]: string } {
  const slots: { [slot: string]: string } = {};
  for (let i = 0; i < tags.length; i++) {
    slots[tags[i]] = "";
  }
  if (slots[MAIN_HAND_SLOT] === undefined) {
    slots[MAIN_HAND_SLOT] = "";
  }
  return slots;
}

export function emptyEquipment(tags: readonly string[] = TEMPORARY_EQUIPMENT_SLOT_TAGS): PlayerEquipment {
  return {
    slots: emptySlotMap(tags),
    items: [],
    revision: 0,
    equipByRequestId: {},
  };
}

export function equipmentSlotsFromContent(slots: {
  [id: string]: { id: string; tag: string; displayName: string; allowedCategories: readonly string[] };
}): { [tag: string]: EquipmentSlotContent } {
  const map: { [tag: string]: EquipmentSlotContent } = {};
  const ids = Object.keys(slots);
  for (let i = 0; i < ids.length; i++) {
    const def = slots[ids[i]];
    const allowed: string[] = [];
    for (let c = 0; c < def.allowedCategories.length; c++) {
      allowed.push(def.allowedCategories[c]);
    }
    map[def.tag] = {
      id: def.id,
      tag: def.tag,
      displayName: def.displayName,
      allowedCategories: allowed,
    };
  }
  return map;
}

export function cloneEquipment(equipment: PlayerEquipment): PlayerEquipment {
  if (equipment == null) {
    return emptyEquipment();
  }
  const equipByRequestId: { [requestId: string]: EquipRecord } = {};
  const equipSource = dict(equipment.equipByRequestId);
  const keys = Object.keys(equipSource);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const record = equipSource[key];
    if (record == null) {
      continue;
    }
    equipByRequestId[key] = {
      ok: record.ok,
      code: record.code,
      slot: record.slot,
      instanceId: record.instanceId,
    };
  }
  const envelope = envelopeFromRecord(equipment);
  const items: ItemInstance[] = [];
  const sourceItems = Array.isArray(equipment.items) ? equipment.items : [];
  for (let i = 0; i < sourceItems.length; i++) {
    items.push(cloneItem(sourceItems[i]));
  }
  return {
    slots: copySlots(equipment.slots),
    items: items,
    revision: typeof equipment.revision === "number" && isFinite(equipment.revision) ? equipment.revision : 0,
    equipByRequestId: equipByRequestId,
    equipRequestTicks: cloneTickMap(equipment.equipRequestTicks),
    schemaVersion: envelope.schemaVersion,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt,
    extras: cloneExtras(equipment.extras),
  };
}

export function loadEquipment(
  existing: PlayerEquipment | null,
  inventory: PlayerInventory | undefined,
): LoadEquipmentResult {
  if (existing === null) {
    return { equipment: emptyEquipment(), persist: false };
  }
  return reconcileEquipment(existing, inventory);
}

export function reconcileEquipment(
  equipment: PlayerEquipment,
  inventory: PlayerInventory | undefined,
): LoadEquipmentResult {
  const next = cloneEquipment(equipment);
  let persist = false;
  const present: { [id: string]: boolean } = {};
  for (let i = 0; i < next.items.length; i++) {
    present[next.items[i].instanceId] = true;
  }
  const tags = Object.keys(next.slots);
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const equipped = next.slots[tag];
    if (equipped.length === 0) {
      continue;
    }
    if (present[equipped] === true) {
      continue;
    }
    if (findItem(inventory, equipped) !== null) {
      continue;
    }
    next.slots[tag] = "";
    persist = true;
  }
  const kept: ItemInstance[] = [];
  for (let k = 0; k < next.items.length; k++) {
    const id = next.items[k].instanceId;
    let referenced = false;
    for (let t = 0; t < tags.length; t++) {
      if (next.slots[tags[t]] === id) {
        referenced = true;
        break;
      }
    }
    if (referenced) {
      kept.push(next.items[k]);
    } else {
      persist = true;
    }
  }
  next.items = kept;
  return { equipment: next, persist: persist };
}

export function findEquippedItem(equipment: PlayerEquipment | undefined, instanceId: string): ItemInstance | null {
  if (equipment === undefined || instanceId.length === 0 || equipment.items === undefined) {
    return null;
  }
  for (let i = 0; i < equipment.items.length; i++) {
    if (equipment.items[i].instanceId === instanceId) {
      return equipment.items[i];
    }
  }
  return null;
}

export function equippedInstanceIds(equipment: PlayerEquipment | undefined): string[] {
  const ids: string[] = [];
  if (equipment === undefined) {
    return ids;
  }
  const tags = Object.keys(equipment.slots);
  for (let i = 0; i < tags.length; i++) {
    const instanceId = equipment.slots[tags[i]];
    if (instanceId.length > 0) {
      ids.push(instanceId);
    }
  }
  return ids;
}

export function derivedAttack(
  baseAttack: number,
  equipment: PlayerEquipment,
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
): number {
  let bonus = 0;
  const tags = Object.keys(equipment.slots);
  for (let i = 0; i < tags.length; i++) {
    bonus += attackBonusForInstance(equipment.slots[tags[i]], equipment, inventory, itemsById);
  }
  return baseAttack + bonus;
}

export function publicEquipment(equipment: PlayerEquipment): { [key: string]: unknown } {
  const slots: { [slot: string]: string | null } = {};
  const tags = Object.keys(equipment.slots);
  tags.sort();
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    slots[tag] = equipment.slots[tag].length > 0 ? equipment.slots[tag] : null;
  }
  const items: { [key: string]: unknown }[] = [];
  const sourceItems = equipment.items !== undefined ? equipment.items : [];
  for (let i = 0; i < sourceItems.length; i++) {
    const item = sourceItems[i];
    items.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      definitionId: item.itemId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      metadata: item.metadata,
      stackKey: item.stackKey,
      version: item.version,
      schemaVersion: item.schemaVersion,
    });
  }
  return {
    slots: slots,
    items: items,
    revision: equipment.revision !== undefined ? equipment.revision : 0,
  };
}

export function publicDerived(attack: number): { [key: string]: unknown } {
  return { attack: attack };
}

export function findInstanceOwner(owners: ReadonlyArray<InventoryOwner>, instanceId: string): string {
  for (let i = 0; i < owners.length; i++) {
    if (findItem(owners[i].inventory, instanceId) !== null) {
      return owners[i].userId;
    }
    if (findEquippedItem(owners[i].equipment, instanceId) !== null) {
      return owners[i].userId;
    }
  }
  return "";
}

export function applyEquip(input: EquipInput): EquipDecision {
  const current = cloneEquipment(input.equipment);
  const bag = cloneInventory(input.inventory !== undefined ? input.inventory : emptyInventory());
  const previous = current.equipByRequestId[input.requestId];
  if (previous !== undefined && previous.ok) {
    return {
      ok: true,
      code: previous.code,
      replay: true,
      persist: false,
      persistInventory: false,
      equipment: current,
      inventory: bag,
      derivedAttack: derivedAttack(input.baseAttack, current, bag, input.itemsById),
    };
  }
  if (input.playerHealth <= 0) {
    return fail("player_dead", current, bag, input);
  }
  if (!isKnownSlot(input.slot, input.equipmentSlotsByTag)) {
    return fail("invalid_slot", current, bag, input);
  }
  if (input.unequip) {
    return applyUnequip(current, bag, input);
  }
  if (input.instanceId.length === 0) {
    return fail("invalid_id", current, bag, input);
  }
  const inBag = findItem(bag, input.instanceId);
  const alreadyEquipped = findEquippedItem(current, input.instanceId);
  if (inBag === null && alreadyEquipped === null) {
    const owner = findInstanceOwner(input.owners, input.instanceId);
    if (owner.length > 0 && owner !== input.userId) {
      return fail("unowned", current, bag, input);
    }
    return fail("invalid_id", current, bag, input);
  }
  const owned = inBag !== null ? inBag : alreadyEquipped;
  if (owned === null) {
    return fail("invalid_id", current, bag, input);
  }
  if (isItemLocked(owned)) {
    return fail("item_locked", current, bag, input);
  }
  const definition = input.itemsById[owned.itemId];
  if (definition === undefined) {
    return fail("invalid_id", current, bag, input);
  }
  const gate = equipValidationCode(input, definition, current, owned);
  if (gate.length > 0) {
    return fail(gate, current, bag, input);
  }
  if (alreadyEquipped !== null && inBag === null) {
    clearInstanceSlots(current, input.instanceId);
    current.slots[input.slot] = input.instanceId;
    current.revision += 1;
    return succeed("ok", current, bag, input, input.instanceId, false);
  }
  const vacatedSlot = owned.slotIndex;
  const outgoingId = current.slots[input.slot] !== undefined ? current.slots[input.slot] : "";
  if (outgoingId.length > 0 && outgoingId !== input.instanceId) {
    const outgoing = takeEquippedInstance(current, outgoingId);
    const legacyOutgoing = outgoing !== null ? outgoing : findItem(bag, outgoingId);
    if (legacyOutgoing === null) {
      current.slots[input.slot] = "";
    } else if (outgoing !== null) {
      legacyOutgoing.slotIndex = vacatedSlot;
      legacyOutgoing.version += 1;
      bag.items.push(legacyOutgoing);
    }
  }
  bag.items = bag.items.filter(function (entry) {
    return entry.instanceId !== input.instanceId;
  });
  const moved = cloneItem(owned);
  moved.slotIndex = -1;
  moved.version += 1;
  current.items = current.items.filter(function (entry) {
    return entry.instanceId !== input.instanceId;
  });
  current.items.push(moved);
  clearInstanceSlots(current, input.instanceId);
  current.slots[input.slot] = input.instanceId;
  bag.revision += 1;
  current.revision += 1;
  return succeed("ok", current, bag, input, input.instanceId, true);
}

function applyUnequip(current: PlayerEquipment, bag: PlayerInventory, input: EquipInput): EquipDecision {
  const equippedId = current.slots[input.slot] !== undefined ? current.slots[input.slot] : "";
  if (equippedId.length === 0) {
    current.revision += 1;
    return succeed("ok", current, bag, input, "", false);
  }
  const equipped = takeEquippedInstance(current, equippedId);
  if (equipped === null) {
    current.slots[input.slot] = "";
    current.revision += 1;
    return succeed("ok", current, bag, input, "", false);
  }
  const dest = firstEmptySlotIndex(bag);
  if (dest < 0 || dest >= bag.capacity || occupiedSlots(bag) >= bag.capacity) {
    current.items.push(equipped);
    return fail("inventory_full", current, bag, input);
  }
  equipped.slotIndex = dest;
  equipped.version += 1;
  bag.items.push(equipped);
  current.slots[input.slot] = "";
  bag.revision += 1;
  current.revision += 1;
  return succeed("ok", current, bag, input, "", true);
}

function equipValidationCode(
  input: EquipInput,
  definition: ItemDefinition,
  current: PlayerEquipment,
  owned: ItemInstance,
): string {
  const allowedTags = itemSlotTags(definition);
  if (allowedTags.length === 0) {
    return "not_equippable";
  }
  const slotDef = input.equipmentSlotsByTag !== undefined ? input.equipmentSlotsByTag[input.slot] : undefined;
  if (
    slotDef !== undefined &&
    definition.category !== undefined &&
    slotDef.allowedCategories.indexOf(definition.category) === -1
  ) {
    return "invalid_category";
  }
  if (allowedTags.indexOf(input.slot) === -1) {
    return "invalid_slot";
  }
  if (input.classEquipmentTags !== undefined && input.classEquipmentTags.length > 0) {
    if (input.classEquipmentTags.indexOf(input.slot) === -1) {
      return "class_restricted";
    }
  }
  const classReqs = definition.classRequirements !== undefined ? definition.classRequirements : [];
  if (classReqs.length > 0) {
    const classId = input.classId !== undefined ? input.classId : "";
    if (classId.length === 0 || classReqs.indexOf(classId) === -1) {
      return "class_restricted";
    }
  }
  const levelReq = definition.levelRequirement !== undefined ? definition.levelRequirement : 0;
  const playerLevel = input.playerLevel !== undefined ? input.playerLevel : 1;
  if (levelReq > 0 && playerLevel < levelReq) {
    return "level_restricted";
  }
  if (itemUniquePolicyEquipped(definition)) {
    const tags = Object.keys(current.slots);
    for (let i = 0; i < tags.length; i++) {
      const otherId = current.slots[tags[i]];
      if (otherId.length === 0 || otherId === owned.instanceId) {
        continue;
      }
      const other = resolveOwnedItem(current, input.inventory, otherId);
      if (other !== null && other.itemId === owned.itemId) {
        return "unique_restricted";
      }
    }
  }
  return "";
}

function resolveOwnedItem(
  equipment: PlayerEquipment,
  inventory: PlayerInventory | undefined,
  instanceId: string,
): ItemInstance | null {
  const equipped = findEquippedItem(equipment, instanceId);
  if (equipped !== null) {
    return equipped;
  }
  return findItem(inventory, instanceId);
}

function takeEquippedInstance(equipment: PlayerEquipment, instanceId: string): ItemInstance | null {
  const found = findEquippedItem(equipment, instanceId);
  if (found === null) {
    return null;
  }
  const kept: ItemInstance[] = [];
  for (let i = 0; i < equipment.items.length; i++) {
    if (equipment.items[i].instanceId !== instanceId) {
      kept.push(equipment.items[i]);
    }
  }
  equipment.items = kept;
  return found;
}

function clearInstanceSlots(equipment: PlayerEquipment, instanceId: string): void {
  const tags = Object.keys(equipment.slots);
  for (let t = 0; t < tags.length; t++) {
    if (equipment.slots[tags[t]] === instanceId) {
      equipment.slots[tags[t]] = "";
    }
  }
}

function itemUniquePolicyEquipped(definition: ItemDefinition): boolean {
  return definition.uniquePolicy === "equipped";
}

function isKnownSlot(slot: string, catalog: { [tag: string]: EquipmentSlotContent } | undefined): boolean {
  if (catalog !== undefined && Object.keys(catalog).length > 0) {
    return catalog[slot] !== undefined;
  }
  return (TEMPORARY_EQUIPMENT_SLOT_TAGS as readonly string[]).indexOf(slot) !== -1;
}

function succeed(
  code: string,
  equipment: PlayerEquipment,
  inventory: PlayerInventory,
  input: EquipInput,
  instanceId: string,
  persistInventory: boolean,
): EquipDecision {
  const next = rememberEquip(equipment, input.requestId, {
    ok: true,
    code: code,
    slot: input.slot,
    instanceId: instanceId,
  }, input.tick);
  return {
    ok: true,
    code: code,
    replay: false,
    persist: true,
    persistInventory: persistInventory,
    equipment: next,
    inventory: inventory,
    derivedAttack: derivedAttack(input.baseAttack, next, inventory, input.itemsById),
  };
}

function fail(code: string, equipment: PlayerEquipment, inventory: PlayerInventory, input: EquipInput): EquipDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    persistInventory: false,
    equipment: equipment,
    inventory: inventory,
    derivedAttack: derivedAttack(input.baseAttack, equipment, inventory, input.itemsById),
  };
}

function rememberEquip(equipment: PlayerEquipment, requestId: string, record: EquipRecord, tick?: number): PlayerEquipment {
  const next = cloneEquipment(equipment);
  next.equipByRequestId[requestId] = {
    ok: record.ok,
    code: record.code,
    slot: record.slot,
    instanceId: record.instanceId,
  };
  if (tick !== undefined) {
    const ticks: { [requestId: string]: number } = {};
    if (next.equipRequestTicks != null) {
      const keys = Object.keys(next.equipRequestTicks);
      for (let i = 0; i < keys.length; i++) {
        ticks[keys[i]] = next.equipRequestTicks[keys[i]];
      }
    }
    ticks[requestId] = tick;
    next.equipRequestTicks = ticks;
  }
  return next;
}

function copySlots(slots: { [slot: string]: string } | undefined): { [slot: string]: string } {
  const next = emptySlotMap();
  if (slots == null || typeof slots !== "object") {
    return next;
  }
  const keys = Object.keys(slots);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    next[key] = typeof slots[key] === "string" ? slots[key] : "";
  }
  return next;
}

function attackBonusForInstance(
  instanceId: string,
  equipment: PlayerEquipment,
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
): number {
  if (instanceId.length === 0) {
    return 0;
  }
  const item = resolveOwnedItem(equipment, inventory, instanceId);
  if (item === null) {
    return 0;
  }
  const definition = itemsById[item.itemId];
  if (definition === undefined) {
    return 0;
  }
  let fromModifiers = 0;
  const modifiers = definition.statModifiers !== undefined ? definition.statModifiers : [];
  for (let i = 0; i < modifiers.length; i++) {
    if (channelFromStatId(modifiers[i].statId) === "attack") {
      fromModifiers += modifiers[i].amount;
    }
  }
  if (fromModifiers !== 0) {
    return fromModifiers;
  }
  return definition.attackBonus !== undefined ? definition.attackBonus : 0;
}

export function channelFromStatId(statId: string): string {
  const index = statId.lastIndexOf(".");
  return index === -1 ? statId : statId.substring(index + 1);
}
