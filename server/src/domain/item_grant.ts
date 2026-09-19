import { planCapacity } from "./item_capacity";
import { appendItemAudits, itemAuditFromChange } from "./item_audit";
import {
  ITEM_ERROR_INVALID_QUANTITY,
  ITEM_ERROR_INVENTORY_FULL,
  staleRevisionCode,
} from "./item_errors";
import {
  JOURNAL_COMMITTED,
  cloneJournalRecord,
  journalIsTerminal,
  memoryJournalStore,
  type ItemJournalRecord,
} from "./item_journal";
import { runItemTransaction } from "./item_txn";
import {
  cloneInventory,
  occupiedSlots,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";

export const GRANT_SOURCE_FORAGE_NODE = "forage_node";
export const GRANT_SOURCE_HERB_BUSH = "herb_bush";
export const GRANT_SOURCE_MINING_NODE = "mining_node";
export const GRANT_SOURCE_FISHING = "fishing";
export const GRANT_SOURCE_CRAFTING = "crafting";
export const GRANT_SOURCE_WORLD_INTERACTION = "world_interaction";
export const GRANT_SOURCE_QUEST_REWARD = "quest_reward";
export const GRANT_SOURCE_ADMIN = "admin_grant";

export const GRANT_SOURCE_TYPES = [
  GRANT_SOURCE_FORAGE_NODE,
  GRANT_SOURCE_HERB_BUSH,
  GRANT_SOURCE_MINING_NODE,
  GRANT_SOURCE_FISHING,
  GRANT_SOURCE_CRAFTING,
  GRANT_SOURCE_WORLD_INTERACTION,
  GRANT_SOURCE_QUEST_REWARD,
  GRANT_SOURCE_ADMIN,
] as const;

export type GrantSourceType = (typeof GRANT_SOURCE_TYPES)[number];

export interface GrantItemFromSourceInput {
  characterId: string;
  sourceType: string;
  sourceId: string;
  itemDefinitionId: string;
  quantity: number;
  eventId: string;
  metadata?: { [key: string]: unknown };
  inventory: PlayerInventory;
  definitions: { [id: string]: ItemDefinition };
  equippedItems?: ReadonlyArray<ItemInstance>;
  newIds: () => string;
  nowMs: number;
  expectedRevision?: number;
}

export interface GrantItemFromSourceResult {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  consumedSource: boolean;
  inventory: PlayerInventory;
  message: string;
}

export function isGrantSourceType(value: string): value is GrantSourceType {
  return GRANT_SOURCE_TYPES.indexOf(value as GrantSourceType) !== -1;
}

export function grantItemFromSource(input: GrantItemFromSourceInput): GrantItemFromSourceResult {
  const inventory = cloneInventory(input.inventory);
  if (input.eventId.length === 0) {
    return failGrant("invalid_id", inventory, "Grant eventId is required.");
  }
  const prior = priorGrant(inventory, input.eventId);
  if (prior !== null) {
    return {
      ok: prior.state === JOURNAL_COMMITTED,
      code: prior.state === JOURNAL_COMMITTED ? "ok" : prior.failureCode,
      replay: true,
      persist: false,
      consumedSource: prior.state === JOURNAL_COMMITTED,
      inventory: inventory,
      message: "",
    };
  }
  if (!isGrantSourceType(input.sourceType)) {
    return failGrant("invalid_id", inventory, "Unsupported grant sourceType.");
  }
  if (input.quantity < 1 || input.quantity !== Math.floor(input.quantity)) {
    return failGrant(ITEM_ERROR_INVALID_QUANTITY, inventory, "Quantity must be a positive integer.");
  }
  const definition = input.definitions[input.itemDefinitionId];
  if (definition === undefined) {
    return failGrant("invalid_id", inventory, "Unknown item definition.");
  }
  const stale = staleRevisionCode(inventory.revision, input.expectedRevision);
  if (stale.length > 0) {
    return failGrant(stale, inventory, "Inventory revision is stale.");
  }
  const plan = planCapacity({
    inventory: inventory,
    incoming: [
      {
        itemId: input.itemDefinitionId,
        quantity: input.quantity,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdAt: input.nowMs,
        metadata: input.metadata !== undefined ? input.metadata : {},
      },
    ],
    definitions: input.definitions,
    equippedItems: input.equippedItems,
    operationMode: "grant",
    nowMs: input.nowMs,
  });
  if (!plan.fits) {
    const code = plan.failureCode.length > 0 ? plan.failureCode : ITEM_ERROR_INVENTORY_FULL;
    const needed = plan.requiredNewInstanceIds > 0 ? plan.requiredNewInstanceIds : 1;
    return failGrant(code, inventory, grantCapacityMessage(inventory, occupiedSlots(inventory), needed));
  }
  const journal = memoryJournalStore(journalRecords(inventory));
  const txn = runItemTransaction({
    requestId: input.eventId,
    operationType: "item_grant",
    nowMs: input.nowMs,
    sides: [
      {
        characterId: input.characterId,
        inventory: inventory,
        expectedRevision: input.expectedRevision,
        incoming: [
          {
            itemId: input.itemDefinitionId,
            quantity: input.quantity,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            createdAt: input.nowMs,
            metadata: input.metadata !== undefined ? input.metadata : {},
          },
        ],
        equippedItems: input.equippedItems,
      },
    ],
    definitions: input.definitions,
    newIds: input.newIds,
    journal: journal,
  });
  const next = txn.inventories[input.characterId] !== undefined ? txn.inventories[input.characterId] : inventory;
  if (!txn.ok) {
    return {
      ok: false,
      code: txn.code,
      replay: txn.replay,
      persist: false,
      consumedSource: false,
      inventory: cloneInventory(input.inventory),
      message: txn.code === ITEM_ERROR_INVENTORY_FULL ? grantCapacityMessage(inventory, occupiedSlots(inventory), 1) : "",
    };
  }
  next.persistReason = "item_grant";
  next.itemAudits = appendItemAudits(next.itemAudits, [
    itemAuditFromChange({
      transactionId: txn.journal.transactionId,
      requestId: input.eventId,
      characterId: input.characterId,
      operationType: "item_grant",
      definitionId: input.itemDefinitionId,
      instanceId: firstNewInstanceId(cloneInventory(input.inventory), next, input.itemDefinitionId),
      quantityBefore: 0,
      quantityAfter: input.quantity,
      sourceContainer: input.sourceType,
      destinationContainer: "character_bag",
      goldDelta: 0,
      timestamp: input.nowMs,
      result: "ok",
    }),
  ]);
  return {
    ok: true,
    code: "ok",
    replay: txn.replay,
    persist: true,
    consumedSource: true,
    inventory: next,
    message: "",
  };
}

export function grantCapacityMessage(inventory: PlayerInventory, occupied: number, neededSlots: number = 1): string {
  const free = inventory.capacity - occupied;
  const needed = neededSlots > 0 ? neededSlots : 1;
  return "Need " + String(needed) + " free bag slot(s); " + String(free < 0 ? 0 : free) + " available.";
}

function failGrant(code: string, inventory: PlayerInventory, message: string): GrantItemFromSourceResult {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: false,
    consumedSource: false,
    inventory: inventory,
    message: message,
  };
}

function priorGrant(inventory: PlayerInventory, eventId: string): ItemJournalRecord | null {
  const map = inventory.journalByRequestId;
  if (map === undefined) {
    return null;
  }
  const record = map[eventId];
  if (record === undefined || !journalIsTerminal(record.state)) {
    return null;
  }
  return cloneJournalRecord(record);
}

function journalRecords(inventory: PlayerInventory): ItemJournalRecord[] {
  const seed: ItemJournalRecord[] = [];
  const map = inventory.journalByRequestId;
  if (map === undefined) {
    return seed;
  }
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) {
    seed.push(map[keys[i]]);
  }
  return seed;
}

function firstNewInstanceId(before: PlayerInventory, after: PlayerInventory, itemId: string): string {
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < before.items.length; i++) {
    seen[before.items[i].instanceId] = true;
  }
  for (let j = 0; j < after.items.length; j++) {
    const item = after.items[j];
    if (item.itemId === itemId && seen[item.instanceId] !== true) {
      return item.instanceId;
    }
  }
  for (let k = 0; k < after.items.length; k++) {
    if (after.items[k].itemId === itemId) {
      return after.items[k].instanceId;
    }
  }
  return "";
}
