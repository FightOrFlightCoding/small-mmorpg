import { cloneEquipment, emptyEquipment, type EquipRecord, type PlayerEquipment } from "./equipment";

export const EQUIPMENT_COLLECTION = "player";
export const EQUIPMENT_KEY = "equipment";
export const EQUIPMENT_PERMISSION_READ: 1 = 1;
export const EQUIPMENT_PERMISSION_WRITE: 0 = 0;

export function storedEquipmentWriteValue(equipment: PlayerEquipment): { [key: string]: unknown } {
  const equipByRequestId: { [requestId: string]: { [key: string]: unknown } } = {};
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
  const value: { [key: string]: unknown } = {
    slots: { main_hand: equipment.slots.main_hand },
    equipByRequestId: equipByRequestId,
  };
  if (equipment.equipRequestTicks !== undefined) {
    value.equipRequestTicks = equipment.equipRequestTicks;
  }
  return value;
}

export function storedEquipmentFromValue(value: unknown): PlayerEquipment | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  const equipment = emptyEquipment();
  if (data.slots !== null && typeof data.slots === "object" && !Array.isArray(data.slots)) {
    const slots = data.slots as { [key: string]: unknown };
    if (typeof slots.main_hand === "string") {
      equipment.slots.main_hand = slots.main_hand;
    }
  }
  if (data.equipByRequestId !== null && typeof data.equipByRequestId === "object" && !Array.isArray(data.equipByRequestId)) {
    const map = data.equipByRequestId as { [key: string]: unknown };
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const parsed = parseEquipRecord(map[key]);
      if (parsed !== null) {
        equipment.equipByRequestId[key] = parsed;
      }
    }
  }
  if (data.equipRequestTicks !== null && typeof data.equipRequestTicks === "object" && !Array.isArray(data.equipRequestTicks)) {
    const map = data.equipRequestTicks as { [key: string]: unknown };
    const ticks: { [requestId: string]: number } = {};
    const tickKeys = Object.keys(map);
    for (let t = 0; t < tickKeys.length; t++) {
      const key = tickKeys[t];
      if (typeof map[key] === "number" && isFinite(map[key])) {
        ticks[key] = map[key];
      }
    }
    equipment.equipRequestTicks = ticks;
  }
  return cloneEquipment(equipment);
}

function parseEquipRecord(value: unknown): EquipRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.code !== "string" || typeof data.slot !== "string" || typeof data.instanceId !== "string") {
    return null;
  }
  return {
    ok: data.ok === true,
    code: data.code,
    slot: data.slot,
    instanceId: data.instanceId,
  };
}
