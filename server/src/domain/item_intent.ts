import { cloneItem, type ItemInstance } from "./inventory";

export const INTENT_SCHEMA_VERSION = 1;

export const INTENT_KIND_ACQUISITION = "acquisition";
export const INTENT_KIND_DROP = "drop";

export const INTENT_PENDING = "pending";
export const INTENT_COMMITTED = "committed";
export const INTENT_COMPENSATED = "compensated";
export const INTENT_FAILED = "failed";

export type ItemIntentKind = typeof INTENT_KIND_ACQUISITION | typeof INTENT_KIND_DROP;
export type ItemIntentState =
  | typeof INTENT_PENDING
  | typeof INTENT_COMMITTED
  | typeof INTENT_COMPENSATED
  | typeof INTENT_FAILED;

export interface ItemIntent {
  intentId: string;
  requestId: string;
  kind: ItemIntentKind;
  characterId: string;
  definitionId: string;
  instanceId: string;
  quantity: number;
  sourceId: string;
  state: ItemIntentState;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  itemSnapshot?: ItemInstance;
  groundEntityId?: string;
  failureCode?: string;
}

export interface TransientGroundItem {
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
}

export function cloneItemIntent(intent: ItemIntent): ItemIntent {
  const next: ItemIntent = {
    intentId: intent.intentId,
    requestId: intent.requestId,
    kind: intent.kind,
    characterId: intent.characterId,
    definitionId: intent.definitionId,
    instanceId: intent.instanceId,
    quantity: intent.quantity,
    sourceId: intent.sourceId,
    state: intent.state,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    schemaVersion: intent.schemaVersion,
  };
  if (intent.itemSnapshot !== undefined) {
    next.itemSnapshot = cloneItem(intent.itemSnapshot);
  }
  if (intent.groundEntityId !== undefined) {
    next.groundEntityId = intent.groundEntityId;
  }
  if (intent.failureCode !== undefined) {
    next.failureCode = intent.failureCode;
  }
  return next;
}

export function createAcquisitionIntent(input: {
  intentId: string;
  requestId: string;
  characterId: string;
  definitionId: string;
  instanceId: string;
  quantity: number;
  sourceId: string;
  nowMs: number;
}): ItemIntent {
  return {
    intentId: input.intentId,
    requestId: input.requestId,
    kind: INTENT_KIND_ACQUISITION,
    characterId: input.characterId,
    definitionId: input.definitionId,
    instanceId: input.instanceId,
    quantity: input.quantity,
    sourceId: input.sourceId,
    state: INTENT_PENDING,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
    schemaVersion: INTENT_SCHEMA_VERSION,
  };
}

export function createDropIntent(input: {
  intentId: string;
  requestId: string;
  characterId: string;
  item: ItemInstance;
  quantity: number;
  nowMs: number;
}): ItemIntent {
  return {
    intentId: input.intentId,
    requestId: input.requestId,
    kind: INTENT_KIND_DROP,
    characterId: input.characterId,
    definitionId: input.item.itemId,
    instanceId: input.item.instanceId,
    quantity: input.quantity,
    sourceId: "character_bag",
    state: INTENT_PENDING,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
    schemaVersion: INTENT_SCHEMA_VERSION,
    itemSnapshot: cloneItem(input.item),
  };
}

export function markIntentCommitted(intent: ItemIntent, nowMs: number, groundEntityId?: string): ItemIntent {
  const next = cloneItemIntent(intent);
  next.state = INTENT_COMMITTED;
  next.updatedAt = nowMs;
  if (groundEntityId !== undefined) {
    next.groundEntityId = groundEntityId;
  }
  return next;
}

export function markIntentFailed(intent: ItemIntent, nowMs: number, code: string): ItemIntent {
  const next = cloneItemIntent(intent);
  next.state = INTENT_FAILED;
  next.updatedAt = nowMs;
  next.failureCode = code;
  return next;
}

export function markIntentCompensated(intent: ItemIntent, nowMs: number): ItemIntent {
  const next = cloneItemIntent(intent);
  next.state = INTENT_COMPENSATED;
  next.updatedAt = nowMs;
  return next;
}
