import {
  EQUIPMENT_SAVE_KEYS,
  attachEnvelope,
  envelopeFromRecord,
  optionalExtras,
} from "./save_schema";
import { cloneEquipment, emptyEquipment, type EquipRecord, type PlayerEquipment } from "./equipment";
import { cloneItem, type ItemInstance } from "./inventory";

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
  const gameplay: { [key: string]: unknown } = {
    slots: copySlotRecord(equipment.slots),
    items: storedEquipmentItems(equipment.items),
    revision: equipment.revision !== undefined ? equipment.revision : 0,
    equipByRequestId: equipByRequestId,
  };
  if (equipment.equipRequestTicks !== undefined) {
    gameplay.equipRequestTicks = equipment.equipRequestTicks;
  }
  return attachEnvelope(
    gameplay,
    envelopeFromRecord(equipment),
    equipment.extras,
  );
}

export function storedEquipmentFromValue(value: unknown): PlayerEquipment | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  const equipment = emptyEquipment();
  if (typeof data.revision === "number" && isFinite(data.revision)) {
    equipment.revision = data.revision;
  }
  if (typeof data.schemaVersion === "number") {
    equipment.schemaVersion = data.schemaVersion;
  }
  if (typeof data.createdAt === "number") {
    equipment.createdAt = data.createdAt;
  }
  if (typeof data.updatedAt === "number") {
    equipment.updatedAt = data.updatedAt;
  }
  equipment.extras = optionalExtras(data, EQUIPMENT_SAVE_KEYS);
  if (data.slots !== null && typeof data.slots === "object" && !Array.isArray(data.slots)) {
    const slots = data.slots as { [key: string]: unknown };
    const keys = Object.keys(slots);
    for (let s = 0; s < keys.length; s++) {
      const key = keys[s];
      if (typeof slots[key] === "string") {
        equipment.slots[key] = slots[key];
      }
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
  if (Array.isArray(data.items)) {
    const items: ItemInstance[] = [];
    for (let i = 0; i < data.items.length; i++) {
      const parsed = parseStoredEquipmentItem(data.items[i]);
      if (parsed !== null) {
        items.push(parsed);
      }
    }
    equipment.items = items;
  }
  return cloneEquipment(equipment);
}

function storedEquipmentItems(items: ItemInstance[] | undefined): { [key: string]: unknown }[] {
  const list: { [key: string]: unknown }[] = [];
  const source = items !== undefined ? items : [];
  for (let i = 0; i < source.length; i++) {
    const item = source[i];
    list.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      definitionId: item.itemId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      metadata: item.metadata,
      stackKey: item.stackKey,
      lockReason: item.lockReason,
      lockId: item.lockId,
      lockType: item.lockType,
      version: item.version,
      schemaVersion: item.schemaVersion,
      slotIndex: item.slotIndex,
    });
  }
  return list;
}

function parseStoredEquipmentItem(value: unknown): ItemInstance | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.instanceId !== "string" || data.instanceId.length === 0) {
    return null;
  }
  const itemId =
    typeof data.itemId === "string" && data.itemId.length > 0
      ? data.itemId
      : typeof data.definitionId === "string"
        ? data.definitionId
        : "";
  if (itemId.length === 0) {
    return null;
  }
  if (typeof data.quantity !== "number" || data.quantity < 1) {
    return null;
  }
  return cloneItem({
    instanceId: data.instanceId,
    itemId: itemId,
    quantity: data.quantity,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    sourceType: typeof data.sourceType === "string" ? data.sourceType : "migration",
    sourceId: typeof data.sourceId === "string" ? data.sourceId : "",
    metadata:
      data.metadata !== null && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as { [key: string]: unknown })
        : {},
    stackKey: typeof data.stackKey === "string" ? data.stackKey : "",
    lockReason: typeof data.lockReason === "string" ? data.lockReason : "",
    lockId: typeof data.lockId === "string" ? data.lockId : "",
    lockType: typeof data.lockType === "string" ? data.lockType : "",
    version: typeof data.version === "number" ? data.version : 1,
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    slotIndex: typeof data.slotIndex === "number" ? data.slotIndex : -1,
  });
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

function copySlotRecord(slots: { [slot: string]: string }): { [slot: string]: string } {
  const copy: { [slot: string]: string } = {};
  const keys = Object.keys(slots);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = slots[keys[i]];
  }
  return copy;
}
