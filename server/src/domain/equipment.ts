import {
  findItem,
  isItemLocked,
  itemSlotTags,
  type ItemDefinition,
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
  equipment: PlayerEquipment;
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
  return {
    slots: copySlots(equipment.slots),
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
  const tags = Object.keys(next.slots);
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    const equipped = next.slots[tag];
    if (equipped.length === 0) {
      continue;
    }
    if (findItem(inventory, equipped) !== null) {
      continue;
    }
    next.slots[tag] = "";
    persist = true;
  }
  return { equipment: next, persist: persist };
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
    bonus += attackBonusForInstance(equipment.slots[tags[i]], inventory, itemsById);
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
  return { slots: slots };
}

export function publicDerived(attack: number): { [key: string]: unknown } {
  return { attack: attack };
}

export function findInstanceOwner(owners: ReadonlyArray<InventoryOwner>, instanceId: string): string {
  for (let i = 0; i < owners.length; i++) {
    if (findItem(owners[i].inventory, instanceId) !== null) {
      return owners[i].userId;
    }
  }
  return "";
}

export function applyEquip(input: EquipInput): EquipDecision {
  const current = cloneEquipment(input.equipment);
  const previous = current.equipByRequestId[input.requestId];
  if (previous !== undefined && previous.ok) {
    return {
      ok: true,
      code: previous.code,
      replay: true,
      persist: false,
      equipment: current,
      derivedAttack: derivedAttack(input.baseAttack, current, input.inventory, input.itemsById),
    };
  }
  if (input.playerHealth <= 0) {
    return fail("player_dead", current, input);
  }
  if (!isKnownSlot(input.slot, input.equipmentSlotsByTag)) {
    return fail("invalid_slot", current, input);
  }
  if (input.unequip) {
    current.slots[input.slot] = "";
    return succeed("ok", current, input, "");
  }
  if (input.instanceId.length === 0) {
    return fail("invalid_id", current, input);
  }
  const owned = findItem(input.inventory, input.instanceId);
  if (owned === null) {
    const owner = findInstanceOwner(input.owners, input.instanceId);
    if (owner.length > 0 && owner !== input.userId) {
      return fail("unowned", current, input);
    }
    return fail("invalid_id", current, input);
  }
  if (isItemLocked(owned)) {
    return fail("item_locked", current, input);
  }
  const definition = input.itemsById[owned.itemId];
  if (definition === undefined) {
    return fail("invalid_id", current, input);
  }
  const allowedTags = itemSlotTags(definition);
  if (allowedTags.length === 0) {
    return fail("not_equippable", current, input);
  }
  const slotDef = input.equipmentSlotsByTag !== undefined ? input.equipmentSlotsByTag[input.slot] : undefined;
  if (
    slotDef !== undefined &&
    definition.category !== undefined &&
    slotDef.allowedCategories.indexOf(definition.category) === -1
  ) {
    return fail("invalid_category", current, input);
  }
  if (allowedTags.indexOf(input.slot) === -1) {
    return fail("invalid_slot", current, input);
  }
  if (input.classEquipmentTags !== undefined && input.classEquipmentTags.length > 0) {
    if (input.classEquipmentTags.indexOf(input.slot) === -1) {
      return fail("class_restricted", current, input);
    }
  }
  const classReqs = definition.classRequirements !== undefined ? definition.classRequirements : [];
  if (classReqs.length > 0) {
    const classId = input.classId !== undefined ? input.classId : "";
    if (classId.length === 0 || classReqs.indexOf(classId) === -1) {
      return fail("class_restricted", current, input);
    }
  }
  const levelReq = definition.levelRequirement !== undefined ? definition.levelRequirement : 0;
  const playerLevel = input.playerLevel !== undefined ? input.playerLevel : 1;
  if (levelReq > 0 && playerLevel < levelReq) {
    return fail("level_restricted", current, input);
  }
  if (itemUniquePolicyEquipped(definition)) {
    const tags = Object.keys(current.slots);
    for (let i = 0; i < tags.length; i++) {
      const otherId = current.slots[tags[i]];
      if (otherId.length === 0 || otherId === input.instanceId) {
        continue;
      }
      const other = findItem(input.inventory, otherId);
      if (other !== null && other.itemId === owned.itemId) {
        return fail("unique_restricted", current, input);
      }
    }
  }
  const currentTags = Object.keys(current.slots);
  for (let t = 0; t < currentTags.length; t++) {
    if (current.slots[currentTags[t]] === input.instanceId) {
      current.slots[currentTags[t]] = "";
    }
  }
  current.slots[input.slot] = input.instanceId;
  return succeed("ok", current, input, input.instanceId);
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
  input: EquipInput,
  instanceId: string,
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
    equipment: next,
    derivedAttack: derivedAttack(input.baseAttack, next, input.inventory, input.itemsById),
  };
}

function fail(code: string, equipment: PlayerEquipment, input: EquipInput): EquipDecision {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    equipment: equipment,
    derivedAttack: derivedAttack(input.baseAttack, equipment, input.inventory, input.itemsById),
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
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
): number {
  if (instanceId.length === 0) {
    return 0;
  }
  const item = findItem(inventory, instanceId);
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
