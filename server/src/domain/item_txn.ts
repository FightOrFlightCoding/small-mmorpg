import { applyCapacityPlan, planCapacity, type CapacityPlan, type CapacityPlanInput, type IncomingStack, type OutgoingQuantity } from "./item_capacity";
import {
  ITEM_ERROR_DESTINATION_UNAVAILABLE,
  ITEM_ERROR_ITEM_NOT_FOUND,
  ITEM_ERROR_TRANSACTION_CONFLICT,
  ITEM_ERROR_TRANSACTION_RECOVERY_PENDING,
  staleRevisionCode,
} from "./item_errors";
import {
  JOURNAL_COMMITTED,
  JOURNAL_COMMITTING,
  JOURNAL_COMPENSATED,
  JOURNAL_COMPENSATING,
  JOURNAL_FAILED,
  JOURNAL_PREPARING,
  JOURNAL_RESERVED,
  cloneJournalRecord,
  emptyJournalRecord,
  journalIsTerminal,
  journalNeedsRecovery,
  memoryJournalStore,
  type ItemJournalRecord,
  type ItemJournalStore,
} from "./item_journal";
import { appendItemAudits, itemAuditFromChange, type ItemMutationAudit } from "./item_audit";
import {
  INTENT_COMMITTED,
  cloneItemIntent,
  createAcquisitionIntent,
  createDropIntent,
  markIntentCommitted,
  markIntentCompensated,
  markIntentFailed,
  type ItemIntent,
  type TransientGroundItem,
} from "./item_intent";
import { LOCK_TYPE_DROP_INTENT, acquireItemLock, releaseItemLock } from "./item_lock";
import {
  addOrStackItem,
  cloneInventory,
  findItem,
  makeInstance,
  occupiedSlots,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { cloneOverflow, emptyOverflow, type MigrationOverflow } from "./overflow";
import { applyGoldMutation, type GoldLedger } from "./wallet";

export const ITEM_TXN_SCHEMA_VERSION = 1;

export interface CharacterSerial {
  acquire(characterIds: readonly string[], operationId: string): { ok: boolean; code: string; ordered: string[] };
  release(characterIds: readonly string[], operationId: string): void;
}

export interface ItemTransactionSide {
  characterId: string;
  inventory: PlayerInventory;
  expectedRevision?: number;
  incoming?: IncomingStack[];
  outgoing?: OutgoingQuantity[];
  equippedItems?: ReadonlyArray<ItemInstance>;
  gold?: number;
  goldDelta?: number;
}

export interface ItemTransactionInput {
  requestId: string;
  transactionId?: string;
  operationType: string;
  nowMs: number;
  sides: ItemTransactionSide[];
  definitions: { [id: string]: ItemDefinition };
  newIds: () => string;
  journal?: ItemJournalStore;
  serial?: CharacterSerial;
  goldLedger?: GoldLedger;
  interruptAfter?: "reserved" | "committing";
}

export interface ItemTransactionResult {
  ok: boolean;
  code: string;
  replay: boolean;
  persist: boolean;
  inventories: { [characterId: string]: PlayerInventory };
  gold: { [characterId: string]: number };
  journal: ItemJournalRecord;
  audits: ItemMutationAudit[];
  intents: ItemIntent[];
  plans: { [characterId: string]: CapacityPlan };
}

export function sortCharacterIds(characterIds: readonly string[]): string[] {
  const unique: string[] = [];
  const seen: { [id: string]: boolean } = {};
  for (let i = 0; i < characterIds.length; i++) {
    const id = characterIds[i];
    if (id.length === 0 || seen[id] === true) {
      continue;
    }
    seen[id] = true;
    unique.push(id);
  }
  unique.sort();
  return unique;
}

export function createCharacterSerial(): CharacterSerial {
  const held: { [characterId: string]: string } = {};
  return {
    acquire: function (characterIds: readonly string[], operationId: string): { ok: boolean; code: string; ordered: string[] } {
      const ordered = sortCharacterIds(characterIds);
      for (let i = 0; i < ordered.length; i++) {
        const owner = held[ordered[i]];
        if (owner !== undefined && owner !== operationId) {
          return { ok: false, code: ITEM_ERROR_TRANSACTION_CONFLICT, ordered: ordered };
        }
      }
      for (let a = 0; a < ordered.length; a++) {
        held[ordered[a]] = operationId;
      }
      return { ok: true, code: "ok", ordered: ordered };
    },
    release: function (characterIds: readonly string[], operationId: string): void {
      const ordered = sortCharacterIds(characterIds);
      for (let i = ordered.length - 1; i >= 0; i--) {
        if (held[ordered[i]] === operationId) {
          delete held[ordered[i]];
        }
      }
    },
  };
}

export function runItemTransaction(input: ItemTransactionInput): ItemTransactionResult {
  const journal = input.journal !== undefined ? input.journal : memoryJournalStore();
  const serial = input.serial !== undefined ? input.serial : createCharacterSerial();
  const participants: string[] = [];
  for (let s = 0; s < input.sides.length; s++) {
    participants.push(input.sides[s].characterId);
  }
  const ordered = sortCharacterIds(participants);
  const existing = journal.getByRequestId(input.requestId);
  if (existing !== undefined && journalIsTerminal(existing.state)) {
    return replayTerminal(existing, input);
  }
  if (existing !== undefined && journalNeedsRecovery(existing.state)) {
    return recoverItemTransaction(input, existing, journal, serial);
  }

  const inventories: { [characterId: string]: PlayerInventory } = {};
  const gold: { [characterId: string]: number } = {};
  const snapshots: { [characterId: string]: PlayerInventory } = {};
  for (let i = 0; i < input.sides.length; i++) {
    const side = input.sides[i];
    inventories[side.characterId] = cloneInventory(side.inventory);
    snapshots[side.characterId] = cloneInventory(side.inventory);
    gold[side.characterId] = side.gold !== undefined ? side.gold : 0;
    const stale = staleRevisionCode(side.inventory.revision, side.expectedRevision);
    if (stale.length > 0) {
      const record = emptyJournalRecord(
        input.transactionId !== undefined ? input.transactionId : input.newIds(),
        input.requestId,
        input.operationType,
        ordered,
        input.nowMs,
      );
      record.state = JOURNAL_FAILED;
      record.failureCode = stale;
      record.updatedAt = input.nowMs;
      return {
        ok: false,
        code: stale,
        replay: false,
        persist: false,
        inventories: inventories,
        gold: gold,
        journal: record,
        audits: [
          itemAuditFromChange({
            transactionId: record.transactionId,
            requestId: input.requestId,
            characterId: side.characterId,
            operationType: input.operationType,
            definitionId: "",
            instanceId: "",
            quantityBefore: occupiedSlots(side.inventory),
            quantityAfter: occupiedSlots(side.inventory),
            sourceContainer: "character_bag",
            destinationContainer: "character_bag",
            goldDelta: 0,
            timestamp: input.nowMs,
            result: stale,
          }),
        ],
        intents: [],
        plans: {},
      };
    }
  }

  const acquired = serial.acquire(ordered, input.requestId);
  if (!acquired.ok) {
    const record = emptyJournalRecord(
      input.transactionId !== undefined ? input.transactionId : input.newIds(),
      input.requestId,
      input.operationType,
      ordered,
      input.nowMs,
    );
    record.state = JOURNAL_FAILED;
    record.failureCode = acquired.code;
    record.updatedAt = input.nowMs;
    journal.put(record);
    return failResult(record, inventories, gold, acquired.code, false);
  }

  const record = emptyJournalRecord(
    input.transactionId !== undefined ? input.transactionId : input.newIds(),
    input.requestId,
    input.operationType,
    ordered,
    input.nowMs,
  );
  for (let p = 0; p < ordered.length; p++) {
    record.sourceSnapshots[ordered[p]] = snapshotSummary(snapshots[ordered[p]]);
  }
  journal.put(record);

  const plans: { [characterId: string]: CapacityPlan } = {};
  for (let i = 0; i < input.sides.length; i++) {
    const side = input.sides[i];
    const planInput: CapacityPlanInput = {
      inventory: inventories[side.characterId],
      incoming: side.incoming !== undefined ? side.incoming : [],
      outgoing: side.outgoing,
      definitions: input.definitions,
      equippedItems: side.equippedItems,
      operationMode: operationModeFor(input.operationType),
      nowMs: input.nowMs,
    };
    const plan = planCapacity(planInput);
    plans[side.characterId] = plan;
    record.destinationPlans[side.characterId] = { fits: plan.fits, failureCode: plan.failureCode, requiredNewInstanceIds: plan.requiredNewInstanceIds };
    if (!plan.fits) {
      record.state = JOURNAL_FAILED;
      record.failureCode = plan.failureCode;
      record.updatedAt = input.nowMs;
      journal.put(record);
      serial.release(ordered, input.requestId);
      const audits = auditsForPlans(record, input, plans, plan.failureCode);
      return {
        ok: false,
        code: plan.failureCode,
        replay: false,
        persist: false,
        inventories: inventories,
        gold: gold,
        journal: cloneJournalRecord(record),
        audits: audits,
        intents: [],
        plans: plans,
      };
    }
  }

  record.state = JOURNAL_RESERVED;
  record.updatedAt = input.nowMs;
  journal.put(record);
  if (input.interruptAfter === "reserved") {
    serial.release(ordered, input.requestId);
    return {
      ok: false,
      code: ITEM_ERROR_TRANSACTION_RECOVERY_PENDING,
      replay: false,
      persist: true,
      inventories: inventories,
      gold: gold,
      journal: cloneJournalRecord(record),
      audits: [],
      intents: [],
      plans: plans,
    };
  }

  record.state = JOURNAL_COMMITTING;
  record.updatedAt = input.nowMs;
  journal.put(record);
  if (input.interruptAfter === "committing") {
    serial.release(ordered, input.requestId);
    return {
      ok: false,
      code: ITEM_ERROR_TRANSACTION_RECOVERY_PENDING,
      replay: false,
      persist: true,
      inventories: inventories,
      gold: gold,
      journal: cloneJournalRecord(record),
      audits: [],
      intents: [],
      plans: plans,
    };
  }

  try {
    for (let i = 0; i < input.sides.length; i++) {
      const side = input.sides[i];
      const plan = plans[side.characterId];
      const ids: string[] = [];
      for (let n = 0; n < plan.requiredNewInstanceIds; n++) {
        ids.push(input.newIds());
      }
      inventories[side.characterId] = applyCapacityPlan(inventories[side.characterId], plan, ids);
      rememberJournal(inventories[side.characterId], record);
      const delta = side.goldDelta !== undefined ? side.goldDelta : 0;
      if (delta !== 0) {
        const goldResult = applyGoldMutation(
          {
            characterId: side.characterId,
            currentGold: gold[side.characterId],
            delta: delta,
            reasonType: input.operationType,
            reasonId: input.requestId,
            requestId: input.requestId,
          },
          input.goldLedger,
        );
        if (!goldResult.ok) {
          throw new Error(goldResult.code);
        }
        gold[side.characterId] = goldResult.resultingBalance;
      }
    }
  } catch (err) {
    record.state = JOURNAL_COMPENSATING;
    record.failureCode = err instanceof Error ? err.message : JOURNAL_FAILED;
    record.recoveryStatus = "compensating";
    record.updatedAt = input.nowMs;
    journal.put(record);
    for (let c = 0; c < ordered.length; c++) {
      inventories[ordered[c]] = cloneInventory(snapshots[ordered[c]]);
      rememberJournal(inventories[ordered[c]], record);
    }
    record.state = JOURNAL_COMPENSATED;
    record.updatedAt = input.nowMs;
    journal.put(record);
    serial.release(ordered, input.requestId);
    return {
      ok: false,
      code: record.failureCode,
      replay: false,
      persist: true,
      inventories: inventories,
      gold: gold,
      journal: cloneJournalRecord(record),
      audits: auditsForPlans(record, input, plans, record.failureCode),
      intents: [],
      plans: plans,
    };
  }

  record.state = JOURNAL_COMMITTED;
  record.updatedAt = input.nowMs;
  journal.put(record);
  for (let c = 0; c < ordered.length; c++) {
    rememberJournal(inventories[ordered[c]], record);
    inventories[ordered[c]].itemAudits = appendItemAudits(
      inventories[ordered[c]].itemAudits,
      auditsForPlans(record, input, plans, "ok"),
    );
  }
  serial.release(ordered, input.requestId);
  return {
    ok: true,
    code: "ok",
    replay: false,
    persist: true,
    inventories: inventories,
    gold: gold,
    journal: cloneJournalRecord(record),
    audits: auditsForPlans(record, input, plans, "ok"),
    intents: [],
    plans: plans,
  };
}

export function recoverItemTransaction(
  input: ItemTransactionInput,
  existing: ItemJournalRecord,
  journal: ItemJournalStore,
  serial: CharacterSerial,
): ItemTransactionResult {
  if (existing.state === JOURNAL_COMMITTING || existing.state === JOURNAL_RESERVED) {
    const retry: ItemTransactionInput = {
      requestId: input.requestId,
      transactionId: existing.transactionId,
      operationType: input.operationType,
      nowMs: input.nowMs,
      sides: input.sides,
      definitions: input.definitions,
      newIds: input.newIds,
      journal: journal,
      serial: serial,
      goldLedger: input.goldLedger,
    };
    journal.put({
      ...cloneJournalRecord(existing),
      state: JOURNAL_PREPARING,
      updatedAt: input.nowMs,
      recoveryStatus: "retry",
    });
    return runItemTransaction(retry);
  }
  if (existing.state === JOURNAL_COMPENSATING) {
    const inventories: { [characterId: string]: PlayerInventory } = {};
    const gold: { [characterId: string]: number } = {};
    for (let i = 0; i < input.sides.length; i++) {
      inventories[input.sides[i].characterId] = cloneInventory(input.sides[i].inventory);
      const sideGold = input.sides[i].gold;
      gold[input.sides[i].characterId] = sideGold !== undefined ? sideGold : 0;
    }
    const record = cloneJournalRecord(existing);
    record.state = JOURNAL_COMPENSATED;
    record.updatedAt = input.nowMs;
    record.recoveryStatus = "compensated";
    journal.put(record);
    return {
      ok: false,
      code: record.failureCode.length > 0 ? record.failureCode : ITEM_ERROR_TRANSACTION_RECOVERY_PENDING,
      replay: true,
      persist: true,
      inventories: inventories,
      gold: gold,
      journal: record,
      audits: [],
      intents: [],
      plans: {},
    };
  }
  return replayTerminal(existing, input);
}

export function executeDropIntent(input: {
  inventory: PlayerInventory;
  overflow?: MigrationOverflow;
  instanceId: string;
  quantity: number;
  requestId: string;
  characterId: string;
  nowMs: number;
  x: number;
  y: number;
  definitions: { [id: string]: ItemDefinition };
  newIds: () => string;
  failBeforeEntity?: boolean;
  journal?: ItemJournalStore;
}): {
  ok: boolean;
  code: string;
  inventory: PlayerInventory;
  overflow: MigrationOverflow;
  ground: TransientGroundItem | null;
  intent: ItemIntent;
  journal: ItemJournalRecord;
  audits: ItemMutationAudit[];
} {
  const journal = input.journal !== undefined ? input.journal : memoryJournalStore();
  const previous = journal.getByRequestId(input.requestId);
  if (previous !== undefined && previous.state === JOURNAL_COMMITTED) {
    const intent = intentFromInventory(input.inventory, input.requestId);
    return {
      ok: true,
      code: "ok",
      inventory: cloneInventory(input.inventory),
      overflow: cloneOverflow(input.overflow),
      ground: null,
      intent: intent !== undefined ? intent : createDropIntent({
        intentId: previous.transactionId,
        requestId: input.requestId,
        characterId: input.characterId,
        item: makeInstance(input.instanceId, "", input.quantity, -1),
        quantity: input.quantity,
        nowMs: input.nowMs,
      }),
      journal: previous,
      audits: [],
    };
  }
  let inventory = cloneInventory(input.inventory);
  const item = findItem(inventory, input.instanceId);
  if (item === null) {
    const failedIntent = createDropIntent({
      intentId: input.newIds(),
      requestId: input.requestId,
      characterId: input.characterId,
      item: makeInstance(input.instanceId, "", input.quantity, -1),
      quantity: input.quantity,
      nowMs: input.nowMs,
    });
    return {
      ok: false,
      code: ITEM_ERROR_ITEM_NOT_FOUND,
      inventory: inventory,
      overflow: cloneOverflow(input.overflow),
      ground: null,
      intent: markIntentFailed(failedIntent, input.nowMs, ITEM_ERROR_ITEM_NOT_FOUND),
      journal: emptyJournalRecord(input.newIds(), input.requestId, "item_drop", [input.characterId], input.nowMs),
      audits: [],
    };
  }
  const quantity = input.quantity > 0 ? input.quantity : item.quantity;
  const locked = acquireItemLock({
    inventory: inventory,
    instanceId: item.instanceId,
    lockId: input.requestId,
    lockType: LOCK_TYPE_DROP_INTENT,
    quantity: quantity,
    ownerOperation: "item_drop",
    nowMs: input.nowMs,
  });
  if (!locked.ok) {
    return {
      ok: false,
      code: locked.code,
      inventory: locked.inventory,
      overflow: cloneOverflow(input.overflow),
      ground: null,
      intent: markIntentFailed(
        createDropIntent({
          intentId: input.newIds(),
          requestId: input.requestId,
          characterId: input.characterId,
          item: item,
          quantity: quantity,
          nowMs: input.nowMs,
        }),
        input.nowMs,
        locked.code,
      ),
      journal: emptyJournalRecord(input.newIds(), input.requestId, "item_drop", [input.characterId], input.nowMs),
      audits: [],
    };
  }
  inventory = locked.inventory;
  let intent = createDropIntent({
    intentId: input.newIds(),
    requestId: input.requestId,
    characterId: input.characterId,
    item: item,
    quantity: quantity,
    nowMs: input.nowMs,
  });
  const record = emptyJournalRecord(intent.intentId, input.requestId, "item_drop", [input.characterId], input.nowMs);
  record.state = JOURNAL_RESERVED;
  journal.put(record);
  const removed = planCapacity({
    inventory: inventory,
    incoming: [],
    outgoing: [{ instanceId: item.instanceId, quantity: quantity }],
    definitions: input.definitions,
    operationMode: "drop",
    nowMs: input.nowMs,
  });
  inventory = applyCapacityPlan(inventory, removed, []);
  inventory = releaseItemLock(inventory, input.requestId);
  rememberIntent(inventory, intent);
  record.state = JOURNAL_COMMITTING;
  journal.put(record);
  if (input.failBeforeEntity === true) {
    const restored = compensateDropToBagOrOverflow(inventory, input.overflow, intent, input.definitions, input.nowMs);
    intent = markIntentCompensated(intent, input.nowMs);
    rememberIntent(restored.inventory, intent);
    record.state = JOURNAL_COMPENSATED;
    record.failureCode = ITEM_ERROR_DESTINATION_UNAVAILABLE;
    record.recoveryStatus = restored.usedOverflow ? "overflow" : "restored";
    record.updatedAt = input.nowMs;
    journal.put(record);
    rememberJournal(restored.inventory, record);
    return {
      ok: false,
      code: ITEM_ERROR_DESTINATION_UNAVAILABLE,
      inventory: restored.inventory,
      overflow: restored.overflow,
      ground: null,
      intent: intent,
      journal: record,
      audits: [
        itemAuditFromChange({
          transactionId: record.transactionId,
          requestId: input.requestId,
          characterId: input.characterId,
          operationType: "item_drop",
          definitionId: intent.definitionId,
          instanceId: intent.instanceId,
          quantityBefore: quantity,
          quantityAfter: restored.usedOverflow ? 0 : quantity,
          sourceContainer: "character_bag",
          destinationContainer: restored.usedOverflow ? "migration_overflow" : "character_bag",
          goldDelta: 0,
          timestamp: input.nowMs,
          result: ITEM_ERROR_DESTINATION_UNAVAILABLE,
        }),
      ],
    };
  }
  const ground: TransientGroundItem = {
    id: input.newIds(),
    instanceId: input.newIds(),
    itemId: item.itemId,
    quantity: quantity,
    x: input.x,
    y: input.y,
  };
  intent = markIntentCommitted(intent, input.nowMs, ground.id);
  rememberIntent(inventory, intent);
  record.state = JOURNAL_COMMITTED;
  record.updatedAt = input.nowMs;
  journal.put(record);
  rememberJournal(inventory, record);
  inventory.itemAudits = appendItemAudits(inventory.itemAudits, [
    itemAuditFromChange({
      transactionId: record.transactionId,
      requestId: input.requestId,
      characterId: input.characterId,
      operationType: "item_drop",
      definitionId: item.itemId,
      instanceId: item.instanceId,
      quantityBefore: item.quantity,
      quantityAfter: item.quantity - quantity,
      sourceContainer: "character_bag",
      destinationContainer: "ground_item",
      goldDelta: 0,
      timestamp: input.nowMs,
      result: "ok",
    }),
  ]);
  return {
    ok: true,
    code: "ok",
    inventory: inventory,
    overflow: cloneOverflow(input.overflow),
    ground: ground,
    intent: intent,
    journal: record,
    audits: inventory.itemAudits !== undefined ? inventory.itemAudits : [],
  };
}

export function beginAcquisitionIntent(input: {
  inventory: PlayerInventory;
  requestId: string;
  characterId: string;
  definitionId: string;
  instanceId: string;
  quantity: number;
  sourceId: string;
  nowMs: number;
  newIds: () => string;
}): { inventory: PlayerInventory; intent: ItemIntent; replay: boolean } {
  const existing = intentFromInventory(input.inventory, input.requestId);
  if (existing !== undefined && existing.kind === "acquisition" && existing.state === INTENT_COMMITTED) {
    return { inventory: cloneInventory(input.inventory), intent: existing, replay: true };
  }
  const intent = createAcquisitionIntent({
    intentId: input.newIds(),
    requestId: input.requestId,
    characterId: input.characterId,
    definitionId: input.definitionId,
    instanceId: input.instanceId,
    quantity: input.quantity,
    sourceId: input.sourceId,
    nowMs: input.nowMs,
  });
  const next = cloneInventory(input.inventory);
  rememberIntent(next, intent);
  return { inventory: next, intent: intent, replay: false };
}

export function completeAcquisitionIntent(
  inventory: PlayerInventory,
  intent: ItemIntent,
  nowMs: number,
): PlayerInventory {
  const next = cloneInventory(inventory);
  rememberIntent(next, markIntentCommitted(intent, nowMs));
  return next;
}

export function compensateDropToBagOrOverflow(
  inventory: PlayerInventory,
  overflow: MigrationOverflow | undefined,
  intent: ItemIntent,
  definitions: { [id: string]: ItemDefinition },
  nowMs: number,
): { inventory: PlayerInventory; overflow: MigrationOverflow; usedOverflow: boolean } {
  const next = cloneInventory(inventory);
  const snapshot = intent.itemSnapshot;
  const definition = snapshot !== undefined ? definitions[snapshot.itemId] : undefined;
  if (snapshot !== undefined && definition !== undefined) {
    const plan = planCapacity({
      inventory: next,
      incoming: [
        {
          itemId: snapshot.itemId,
          quantity: intent.quantity,
          instanceId: snapshot.instanceId,
          stackKey: snapshot.stackKey,
          metadata: snapshot.metadata,
          sourceType: snapshot.sourceType,
          sourceId: snapshot.sourceId,
          createdAt: snapshot.createdAt,
        },
      ],
      definitions: definitions,
      operationMode: "grant",
      nowMs: nowMs,
    });
    if (plan.fits) {
      return {
        inventory: applyCapacityPlan(next, plan, []),
        overflow: cloneOverflow(overflow),
        usedOverflow: false,
      };
    }
    const restored = addOrStackItem(next, snapshot.itemId, intent.quantity, snapshot.instanceId, definition, {
      sourceType: snapshot.sourceType,
      sourceId: snapshot.sourceId,
      createdAt: snapshot.createdAt,
      stackKey: snapshot.stackKey,
      metadata: snapshot.metadata,
    });
    if (occupiedSlots(restored) <= restored.capacity && findItem(restored, snapshot.instanceId) !== null) {
      return { inventory: restored, overflow: cloneOverflow(overflow), usedOverflow: false };
    }
  }
  const dest = cloneOverflow(overflow !== undefined ? overflow : emptyOverflow());
  if (snapshot !== undefined) {
    const moved = cloneInventoryItem(snapshot);
    moved.slotIndex = dest.items.length;
    dest.items.push(moved);
    dest.revision += 1;
  }
  return { inventory: next, overflow: dest, usedOverflow: true };
}

function cloneInventoryItem(item: ItemInstance): ItemInstance {
  return makeInstance(item.instanceId, item.itemId, item.quantity, item.slotIndex, {
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    createdAt: item.createdAt,
    stackKey: item.stackKey,
    metadata: item.metadata,
  });
}

function rememberJournal(inventory: PlayerInventory, record: ItemJournalRecord): void {
  if (inventory.journalByRequestId === undefined) {
    inventory.journalByRequestId = {};
  }
  inventory.journalByRequestId[record.requestId] = cloneJournalRecord(record);
}

function rememberIntent(inventory: PlayerInventory, intent: ItemIntent): void {
  if (inventory.intentsByRequestId === undefined) {
    inventory.intentsByRequestId = {};
  }
  inventory.intentsByRequestId[intent.requestId] = cloneItemIntent(intent);
}

function intentFromInventory(inventory: PlayerInventory, requestId: string): ItemIntent | undefined {
  if (inventory.intentsByRequestId === undefined) {
    return undefined;
  }
  const intent = inventory.intentsByRequestId[requestId];
  return intent !== undefined ? cloneItemIntent(intent) : undefined;
}

function snapshotSummary(inventory: PlayerInventory): { revision: number; occupied: number } {
  return { revision: inventory.revision, occupied: occupiedSlots(inventory) };
}

function operationModeFor(operationType: string): CapacityPlanInput["operationMode"] {
  if (operationType === "trade") {
    return "trade";
  }
  if (operationType === "equipment" || operationType === "unequip") {
    return "unequip";
  }
  if (operationType === "item_drop") {
    return "drop";
  }
  if (operationType === "loot" || operationType === "item_acquire") {
    return "acquire";
  }
  return "grant";
}

function replayTerminal(existing: ItemJournalRecord, input: ItemTransactionInput): ItemTransactionResult {
  const inventories: { [characterId: string]: PlayerInventory } = {};
  const gold: { [characterId: string]: number } = {};
  for (let i = 0; i < input.sides.length; i++) {
    inventories[input.sides[i].characterId] = cloneInventory(input.sides[i].inventory);
    const sideGold = input.sides[i].gold;
    gold[input.sides[i].characterId] = sideGold !== undefined ? sideGold : 0;
  }
  const ok = existing.state === JOURNAL_COMMITTED;
  return {
    ok: ok,
    code: ok ? "ok" : existing.failureCode,
    replay: true,
    persist: false,
    inventories: inventories,
    gold: gold,
    journal: cloneJournalRecord(existing),
    audits: [],
    intents: [],
    plans: {},
  };
}

function failResult(
  record: ItemJournalRecord,
  inventories: { [characterId: string]: PlayerInventory },
  gold: { [characterId: string]: number },
  code: string,
  persist: boolean,
): ItemTransactionResult {
  return {
    ok: false,
    code: code,
    replay: false,
    persist: persist,
    inventories: inventories,
    gold: gold,
    journal: cloneJournalRecord(record),
    audits: [],
    intents: [],
    plans: {},
  };
}

function auditsForPlans(
  record: ItemJournalRecord,
  input: ItemTransactionInput,
  plans: { [characterId: string]: CapacityPlan },
  result: string,
): ItemMutationAudit[] {
  const audits: ItemMutationAudit[] = [];
  const counterparty = input.sides.length > 1 ? input.sides[1].characterId : "";
  for (let i = 0; i < input.sides.length; i++) {
    const side = input.sides[i];
    const plan = plans[side.characterId];
    if (plan === undefined) {
      continue;
    }
    for (let m = 0; m < plan.plannedMerges.length; m++) {
      const merge = plan.plannedMerges[m];
      audits.push(
        itemAuditFromChange({
          transactionId: record.transactionId,
          requestId: input.requestId,
          characterId: side.characterId,
          counterparty: counterparty,
          operationType: input.operationType,
          definitionId: merge.itemId,
          instanceId: merge.instanceId,
          quantityBefore: merge.quantityAfter - merge.quantityAdded,
          quantityAfter: merge.quantityAfter,
          sourceContainer: "incoming",
          destinationContainer: "character_bag",
          goldDelta: side.goldDelta !== undefined ? side.goldDelta : 0,
          timestamp: input.nowMs,
          result: result,
        }),
      );
    }
    for (let n = 0; n < plan.plannedNewStacks.length; n++) {
      const stack = plan.plannedNewStacks[n];
      audits.push(
        itemAuditFromChange({
          transactionId: record.transactionId,
          requestId: input.requestId,
          characterId: side.characterId,
          counterparty: counterparty,
          operationType: input.operationType,
          definitionId: stack.itemId,
          instanceId: stack.instanceId !== undefined ? stack.instanceId : "",
          quantityBefore: 0,
          quantityAfter: stack.quantity,
          sourceContainer: "incoming",
          destinationContainer: "character_bag",
          goldDelta: side.goldDelta !== undefined ? side.goldDelta : 0,
          timestamp: input.nowMs,
          result: result,
        }),
      );
    }
    if (audits.length === 0) {
      audits.push(
        itemAuditFromChange({
          transactionId: record.transactionId,
          requestId: input.requestId,
          characterId: side.characterId,
          counterparty: counterparty,
          operationType: input.operationType,
          definitionId: "",
          instanceId: "",
          quantityBefore: occupiedSlots(side.inventory),
          quantityAfter: occupiedSlots(side.inventory),
          sourceContainer: "character_bag",
          destinationContainer: "character_bag",
          goldDelta: side.goldDelta !== undefined ? side.goldDelta : 0,
          timestamp: input.nowMs,
          result: result,
        }),
      );
    }
  }
  return audits;
}
