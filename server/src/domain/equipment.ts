import { findItem, type ItemDefinition, type PlayerInventory } from "./inventory";

export const MAIN_HAND_SLOT = "main_hand";

export interface EquipRecord {
  ok: boolean;
  code: string;
  slot: string;
  instanceId: string;
}

export interface PlayerEquipment {
  slots: { main_hand: string };
  equipByRequestId: { [requestId: string]: EquipRecord };
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

export function emptyEquipment(): PlayerEquipment {
  return {
    slots: { main_hand: "" },
    equipByRequestId: {},
  };
}

export function cloneEquipment(equipment: PlayerEquipment): PlayerEquipment {
  const equipByRequestId: { [requestId: string]: EquipRecord } = {};
  const keys = Object.keys(equipment.equipByRequestId);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const record = equipment.equipByRequestId[key];
    equipByRequestId[key] = {
      ok: record.ok,
      code: record.code,
      slot: record.slot,
      instanceId: record.instanceId,
    };
  }
  return {
    slots: { main_hand: equipment.slots.main_hand },
    equipByRequestId: equipByRequestId,
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
  const equipped = next.slots.main_hand;
  if (equipped.length === 0) {
    return { equipment: next, persist: false };
  }
  if (findItem(inventory, equipped) !== null) {
    return { equipment: next, persist: false };
  }
  next.slots.main_hand = "";
  return { equipment: next, persist: true };
}

export function derivedAttack(
  baseAttack: number,
  equipment: PlayerEquipment,
  inventory: PlayerInventory | undefined,
  itemsById: { [id: string]: ItemDefinition },
): number {
  const instanceId = equipment.slots.main_hand;
  if (instanceId.length === 0) {
    return baseAttack;
  }
  const item = findItem(inventory, instanceId);
  if (item === null) {
    return baseAttack;
  }
  const definition = itemsById[item.itemId];
  if (definition === undefined) {
    return baseAttack;
  }
  const bonus = definition.attackBonus !== undefined ? definition.attackBonus : 0;
  return baseAttack + bonus;
}

export function publicEquipment(equipment: PlayerEquipment): { [key: string]: unknown } {
  return {
    slots: {
      main_hand: equipment.slots.main_hand.length > 0 ? equipment.slots.main_hand : null,
    },
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
  if (input.slot !== MAIN_HAND_SLOT) {
    return fail("invalid_slot", current, input);
  }
  if (input.unequip) {
    current.slots.main_hand = "";
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
  const definition = input.itemsById[owned.itemId];
  if (definition === undefined) {
    return fail("invalid_id", current, input);
  }
  if (definition.equipSlot === undefined || definition.equipSlot.length === 0) {
    return fail("not_equippable", current, input);
  }
  if (definition.equipSlot !== input.slot) {
    return fail("invalid_slot", current, input);
  }
  current.slots.main_hand = input.instanceId;
  return succeed("ok", current, input, input.instanceId);
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
  });
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

function rememberEquip(equipment: PlayerEquipment, requestId: string, record: EquipRecord): PlayerEquipment {
  const next = cloneEquipment(equipment);
  next.equipByRequestId[requestId] = {
    ok: record.ok,
    code: record.code,
    slot: record.slot,
    instanceId: record.instanceId,
  };
  return next;
}
