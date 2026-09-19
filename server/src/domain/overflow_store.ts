import { attachEnvelope, envelopeFromRecord } from "./save_schema";
import { cloneItem, type ItemInstance } from "./inventory";
import {
  OVERFLOW_SCHEMA_VERSION,
  cloneOverflow,
  emptyOverflow,
  type MigrationOverflow,
  type OverflowMutationRecord,
} from "./overflow";

export const OVERFLOW_SAVE_KEYS = [
  "schemaVersion",
  "createdAt",
  "updatedAt",
  "items",
  "revision",
  "mutationByRequestId",
];

export function storedOverflowWriteValue(overflow: MigrationOverflow): { [key: string]: unknown } {
  const items: { [key: string]: unknown }[] = [];
  for (let i = 0; i < overflow.items.length; i++) {
    const item = overflow.items[i];
    items.push({
      instanceId: item.instanceId,
      itemId: item.itemId,
      quantity: item.quantity,
      createdAt: item.createdAt,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      metadata: item.metadata,
      stackKey: item.stackKey,
      lockReason: item.lockReason,
      lockId: item.lockId,
      lockType: item.lockType,
      lockQuantity: item.lockQuantity,
      lockOwnerOperation: item.lockOwnerOperation,
      lockCreatedAt: item.lockCreatedAt,
      lockExpiresAt: item.lockExpiresAt,
      version: item.version,
      schemaVersion: item.schemaVersion,
      slotIndex: item.slotIndex,
    });
  }
  const gameplay: { [key: string]: unknown } = {
    items: items,
    revision: overflow.revision,
    mutationByRequestId: overflow.mutationByRequestId !== undefined ? overflow.mutationByRequestId : {},
  };
  return attachEnvelope(
    gameplay,
    envelopeFromRecord({
      schemaVersion: overflow.schemaVersion !== undefined ? overflow.schemaVersion : OVERFLOW_SCHEMA_VERSION,
      createdAt: overflow.createdAt,
      updatedAt: overflow.updatedAt,
    }),
    undefined,
  );
}

export function storedOverflowFromValue(value: unknown): MigrationOverflow | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (!Array.isArray(data.items)) {
    return null;
  }
  const overflow = emptyOverflow();
  if (typeof data.schemaVersion === "number") {
    overflow.schemaVersion = data.schemaVersion;
  }
  if (typeof data.createdAt === "number") {
    overflow.createdAt = data.createdAt;
  }
  if (typeof data.updatedAt === "number") {
    overflow.updatedAt = data.updatedAt;
  }
  if (typeof data.revision === "number" && isFinite(data.revision)) {
    overflow.revision = data.revision;
  }
  for (let i = 0; i < data.items.length; i++) {
    const parsed = parseOverflowItem(data.items[i]);
    if (parsed !== null) {
      overflow.items.push(parsed);
    }
  }
  if (data.mutationByRequestId !== null && typeof data.mutationByRequestId === "object" && !Array.isArray(data.mutationByRequestId)) {
    const map = data.mutationByRequestId as { [key: string]: unknown };
    const keys = Object.keys(map);
    const mutationByRequestId: { [requestId: string]: OverflowMutationRecord } = {};
    for (let m = 0; m < keys.length; m++) {
      const parsed = parseOverflowMutation(map[keys[m]]);
      if (parsed !== null) {
        mutationByRequestId[keys[m]] = parsed;
      }
    }
    overflow.mutationByRequestId = mutationByRequestId;
  }
  return cloneOverflow(overflow);
}

function parseOverflowItem(value: unknown): ItemInstance | null {
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
    lockQuantity: typeof data.lockQuantity === "number" ? data.lockQuantity : 0,
    lockOwnerOperation: typeof data.lockOwnerOperation === "string" ? data.lockOwnerOperation : "",
    lockCreatedAt: typeof data.lockCreatedAt === "number" ? data.lockCreatedAt : 0,
    lockExpiresAt: typeof data.lockExpiresAt === "number" ? data.lockExpiresAt : 0,
    version: typeof data.version === "number" ? data.version : 1,
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : 1,
    slotIndex: typeof data.slotIndex === "number" ? data.slotIndex : -1,
  });
}

function parseOverflowMutation(value: unknown): OverflowMutationRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.code !== "string" || typeof data.instanceId !== "string") {
    return null;
  }
  const record: OverflowMutationRecord = {
    ok: data.ok === true,
    code: data.code,
    instanceId: data.instanceId,
  };
  if (typeof data.toSlotIndex === "number" && isFinite(data.toSlotIndex)) {
    record.toSlotIndex = data.toSlotIndex;
  }
  return record;
}
