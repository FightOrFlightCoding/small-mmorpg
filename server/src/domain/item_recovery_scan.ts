import { cloneItemAudit, itemAuditFromChange, type ItemMutationAudit } from "./item_audit";
import { emptyEquipment, type PlayerEquipment } from "./equipment";
import {
  INVENTORY_CAPACITY,
  ITEM_MAX_STACK,
  cloneInventory,
  cloneItem,
  effectiveMaxStack,
  emptyInventory,
  firstEmptySlotIndex,
  isItemLocked,
  type ItemDefinition,
  type ItemInstance,
  type PlayerInventory,
} from "./inventory";
import { journalNeedsRecovery } from "./item_journal";
import { LOCK_TYPE_ADMIN_REPAIR, expireOrphanLocks } from "./item_lock";
import { cloneOverflow, emptyOverflow, isOverflowEmpty, type MigrationOverflow } from "./overflow";
import type { CorpseLootContainer } from "./corpse";
import { GROUND_CLAIMING, type GroundItem } from "./ground_item";
import type { TradeRecord } from "./trade";

export const ITEM_RECOVERY_SCAN_VERSION = 1;

export type ItemRecoveryKind =
  | "orphaned_lock"
  | "incomplete_transaction"
  | "incomplete_gold_distribution"
  | "incomplete_drop"
  | "incomplete_trade"
  | "invalid_container_ref"
  | "duplicate_slot"
  | "quantity_above_max"
  | "missing_definition"
  | "overflow_migration";

export type ItemRecoverySeverity = "info" | "repairable" | "report_only";

export interface ItemRecoveryFinding {
  kind: ItemRecoveryKind;
  severity: ItemRecoverySeverity;
  instanceId: string;
  itemId: string;
  detail: string;
  suggestedAction: string;
}

export interface ItemRecoveryScanInput {
  characterId: string;
  inventory: PlayerInventory;
  equipment?: PlayerEquipment;
  overflow?: MigrationOverflow;
  definitions: { [id: string]: ItemDefinition };
  liveLockIds: ReadonlyArray<string>;
  trades?: { [tradeId: string]: TradeRecord };
  corpses?: ReadonlyArray<CorpseLootContainer>;
  groundItems?: ReadonlyArray<GroundItem>;
  nowMs?: number;
}

export interface ItemRecoveryReport {
  characterId: string;
  schemaVersion: number;
  findings: ItemRecoveryFinding[];
  unresolvedCount: number;
}

export interface ItemRecoveryRepairResult {
  report: ItemRecoveryReport;
  inventory: PlayerInventory;
  overflow: MigrationOverflow;
  persist: boolean;
  deletedUnexplained: boolean;
  repairs: string[];
}

function finding(
  kind: ItemRecoveryKind,
  severity: ItemRecoverySeverity,
  instanceId: string,
  itemId: string,
  detail: string,
  suggestedAction: string,
): ItemRecoveryFinding {
  return {
    kind: kind,
    severity: severity,
    instanceId: instanceId,
    itemId: itemId,
    detail: detail,
    suggestedAction: suggestedAction,
  };
}

export function liveLockIdsForCharacter(
  characterId: string,
  trades: { [tradeId: string]: TradeRecord } | undefined,
  inventory: PlayerInventory,
): string[] {
  const ids: string[] = [];
  const seen: { [id: string]: boolean } = {};
  function add(id: string): void {
    if (id.length === 0 || seen[id] === true) {
      return;
    }
    seen[id] = true;
    ids.push(id);
  }
  if (trades !== undefined) {
    const keys = Object.keys(trades);
    for (let i = 0; i < keys.length; i++) {
      const trade = trades[keys[i]];
      if (trade == null || trade.state === "completed" || trade.state === "cancelled") {
        continue;
      }
      if (trade.participantA.characterId === characterId || trade.participantB.characterId === characterId) {
        add(trade.tradeId);
      }
    }
  }
  const journal = inventory.journalByRequestId !== undefined ? inventory.journalByRequestId : {};
  const journalIds = Object.keys(journal);
  for (let j = 0; j < journalIds.length; j++) {
    const record = journal[journalIds[j]];
    if (record != null && journalNeedsRecovery(record.state)) {
      add(record.requestId);
      add(record.transactionId);
    }
  }
  return ids;
}

export function scanItemRecovery(input: ItemRecoveryScanInput): ItemRecoveryReport {
  const findings: ItemRecoveryFinding[] = [];
  const inventory = input.inventory;
  const equipment = input.equipment !== undefined ? input.equipment : emptyEquipment();
  const overflow = input.overflow !== undefined ? input.overflow : emptyOverflow();
  const live = liveSet(input.liveLockIds);
  const equipped: { [instanceId: string]: boolean } = {};
  for (let e = 0; e < equipment.items.length; e++) {
    equipped[equipment.items[e].instanceId] = true;
  }

  scanLocks(inventory.items, live, findings);
  scanLocks(equipment.items, live, findings);
  scanLocks(overflow.items, live, findings);
  scanBagSlots(inventory, input.definitions, equipped, findings);
  scanEquipmentRefs(equipment, input.definitions, findings);
  scanOverflow(overflow, input.definitions, findings);
  scanJournal(inventory, findings);
  scanTrades(input.characterId, input.trades, findings);
  scanCorpseGold(input.characterId, input.corpses, findings);
  scanGround(input.characterId, input.groundItems, findings);

  let unresolved = 0;
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].severity !== "info") {
      unresolved += 1;
    }
  }
  return {
    characterId: input.characterId,
    schemaVersion: ITEM_RECOVERY_SCAN_VERSION,
    findings: findings,
    unresolvedCount: unresolved,
  };
}

export function repairItemRecovery(input: ItemRecoveryScanInput): ItemRecoveryRepairResult {
  let inventory = cloneInventory(input.inventory, true);
  let overflow = cloneOverflow(input.overflow !== undefined ? input.overflow : emptyOverflow());
  const repairs: string[] = [];
  const defs = input.definitions;
  const live = input.liveLockIds;

  const orphaned = expireOrphanLocks(inventory, live);
  if (orphaned.changed) {
    inventory = orphaned.inventory;
    repairs.push("cleared_orphaned_locks");
  }

  const slotMap: { [slot: string]: ItemInstance[] } = {};
  const kept: ItemInstance[] = [];
  for (let i = 0; i < inventory.items.length; i++) {
    const item = cloneItem(inventory.items[i]);
    const slotKey = String(item.slotIndex);
    if (slotMap[slotKey] === undefined) {
      slotMap[slotKey] = [];
    }
    slotMap[slotKey].push(item);
  }
  const slotKeys = Object.keys(slotMap);
  for (let s = 0; s < slotKeys.length; s++) {
    const group = slotMap[slotKeys[s]];
    kept.push(group[0]);
    for (let extra = 1; extra < group.length; extra++) {
      overflow.items.push(moveToOverflow(group[extra]));
      repairs.push("duplicate_slot_to_overflow:" + group[extra].instanceId);
    }
  }

  const nextItems: ItemInstance[] = [];
  for (let k = 0; k < kept.length; k++) {
    let item = kept[k];
    const def = defs[item.itemId];
    if (def === undefined) {
      nextItems.push(item);
      continue;
    }
    const maxStack = effectiveMaxStack(def);
    if (item.quantity > maxStack) {
      const leftover = item.quantity - maxStack;
      item.quantity = maxStack;
      item.version += 1;
      const extra = cloneItem(item);
      extra.instanceId = item.instanceId + ":split-overflow";
      extra.quantity = leftover;
      extra.slotIndex = -1;
      overflow.items.push(extra);
      repairs.push("overstack_split_to_overflow:" + item.instanceId);
    }
    const cap = inventory.capacity > 0 ? inventory.capacity : INVENTORY_CAPACITY;
    if (item.slotIndex < 0 || item.slotIndex >= cap) {
      const empty = firstEmptySlotIndex(bagWith(nextItems, cap));
      if (empty >= 0) {
        item.slotIndex = empty;
        item.version += 1;
        repairs.push("reassigned_invalid_slot:" + item.instanceId);
        nextItems.push(item);
      } else {
        overflow.items.push(moveToOverflow(item));
        repairs.push("invalid_slot_to_overflow:" + item.instanceId);
      }
      continue;
    }
    nextItems.push(item);
  }
  inventory.items = nextItems;
  if (repairs.length > 0) {
    inventory.revision += 1;
    overflow.revision += 1;
    inventory.itemAudits = appendRecoveryAudit(inventory.itemAudits, input.characterId, repairs, input.nowMs !== undefined ? input.nowMs : 0);
  }

  const after = scanItemRecovery({
    characterId: input.characterId,
    inventory: inventory,
    equipment: input.equipment,
    overflow: overflow,
    definitions: defs,
    liveLockIds: live,
    trades: input.trades,
    corpses: input.corpses,
    groundItems: input.groundItems,
    nowMs: input.nowMs,
  });
  return {
    report: after,
    inventory: inventory,
    overflow: overflow,
    persist: repairs.length > 0,
    deletedUnexplained: false,
    repairs: repairs,
  };
}

export function recoveryScanHasUnresolved(report: ItemRecoveryReport): boolean {
  return report.unresolvedCount > 0;
}

function liveSet(ids: ReadonlyArray<string>): { [id: string]: boolean } {
  const map: { [id: string]: boolean } = {};
  for (let i = 0; i < ids.length; i++) {
    map[ids[i]] = true;
  }
  return map;
}

function scanLocks(items: ReadonlyArray<ItemInstance>, live: { [id: string]: boolean }, findings: ItemRecoveryFinding[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!isItemLocked(item)) {
      continue;
    }
    if (item.lockId.length > 0 && live[item.lockId] === true) {
      continue;
    }
    findings.push(
      finding(
        "orphaned_lock",
        "repairable",
        item.instanceId,
        item.itemId,
        "lockId " + item.lockId + " is not live",
        "Clear orphan lock; do not delete the stack",
      ),
    );
  }
}

function scanBagSlots(
  inventory: PlayerInventory,
  defs: { [id: string]: ItemDefinition },
  equipped: { [instanceId: string]: boolean },
  findings: ItemRecoveryFinding[],
): void {
  const cap = inventory.capacity > 0 ? inventory.capacity : INVENTORY_CAPACITY;
  const bySlot: { [slot: string]: string[] } = {};
  for (let i = 0; i < inventory.items.length; i++) {
    const item = inventory.items[i];
    const def = defs[item.itemId];
    if (def === undefined) {
      findings.push(
        finding(
          "missing_definition",
          "report_only",
          item.instanceId,
          item.itemId,
          "bag stack has no catalog definition",
          "Report only; do not delete",
        ),
      );
    } else {
      const maxStack = effectiveMaxStack(def);
      if (item.quantity > maxStack || item.quantity > ITEM_MAX_STACK) {
        findings.push(
          finding(
            "quantity_above_max",
            "repairable",
            item.instanceId,
            item.itemId,
            "quantity " + String(item.quantity) + " exceeds maxStack " + String(maxStack),
            "Split remainder into overflow",
          ),
        );
      }
    }
    if (item.slotIndex < 0 || item.slotIndex >= cap) {
      findings.push(
        finding(
          "invalid_container_ref",
          "repairable",
          item.instanceId,
          item.itemId,
          "slotIndex " + String(item.slotIndex) + " outside 0.." + String(cap - 1),
          "Reassign empty slot or overflow",
        ),
      );
    }
    if (equipped[item.instanceId] === true) {
      findings.push(
        finding(
          "invalid_container_ref",
          "repairable",
          item.instanceId,
          item.itemId,
          "instance is equipped and still in the bag",
          "Keep equipment copy; move bag duplicate to overflow",
        ),
      );
    }
    const key = String(item.slotIndex);
    if (bySlot[key] === undefined) {
      bySlot[key] = [];
    }
    bySlot[key].push(item.instanceId);
  }
  const slots = Object.keys(bySlot);
  for (let s = 0; s < slots.length; s++) {
    const group = bySlot[slots[s]];
    if (group.length < 2) {
      continue;
    }
    for (let g = 1; g < group.length; g++) {
      findings.push(
        finding(
          "duplicate_slot",
          "repairable",
          group[g],
          "",
          "slot " + slots[s] + " holds multiple stacks",
          "Move extras to overflow; do not delete",
        ),
      );
    }
  }
}

function scanEquipmentRefs(equipment: PlayerEquipment, defs: { [id: string]: ItemDefinition }, findings: ItemRecoveryFinding[]): void {
  for (let i = 0; i < equipment.items.length; i++) {
    const item = equipment.items[i];
    if (defs[item.itemId] === undefined) {
      findings.push(
        finding(
          "missing_definition",
          "report_only",
          item.instanceId,
          item.itemId,
          "equipped stack has no catalog definition",
          "Report only; do not delete",
        ),
      );
    }
  }
}

function scanOverflow(overflow: MigrationOverflow, defs: { [id: string]: ItemDefinition }, findings: ItemRecoveryFinding[]): void {
  if (isOverflowEmpty(overflow)) {
    return;
  }
  findings.push(
    finding(
      "overflow_migration",
      "info",
      "",
      "",
      String(overflow.items.length) + " stack(s) in migration overflow",
      "Player recover into free bag slots; do not auto-delete",
    ),
  );
  for (let i = 0; i < overflow.items.length; i++) {
    const item = overflow.items[i];
    if (defs[item.itemId] === undefined) {
      findings.push(
        finding(
          "missing_definition",
          "report_only",
          item.instanceId,
          item.itemId,
          "overflow stack has no catalog definition",
          "Report only; do not delete",
        ),
      );
    }
  }
}

function scanJournal(inventory: PlayerInventory, findings: ItemRecoveryFinding[]): void {
  const journal = inventory.journalByRequestId !== undefined ? inventory.journalByRequestId : {};
  const ids = Object.keys(journal);
  for (let i = 0; i < ids.length; i++) {
    const record = journal[ids[i]];
    if (record == null || !journalNeedsRecovery(record.state)) {
      continue;
    }
    const kind: ItemRecoveryKind = record.operationType === "item_drop" ? "incomplete_drop" : "incomplete_transaction";
    findings.push(
      finding(
        kind,
        "report_only",
        record.transactionId,
        record.operationType,
        "journal " + record.requestId + " state " + record.state,
        "Retry via existing recoverItemTransaction / drop compensate; do not delete items",
      ),
    );
  }
}

function scanTrades(
  characterId: string,
  trades: { [tradeId: string]: TradeRecord } | undefined,
  findings: ItemRecoveryFinding[],
): void {
  if (trades === undefined) {
    return;
  }
  const ids = Object.keys(trades);
  for (let i = 0; i < ids.length; i++) {
    const trade = trades[ids[i]];
    if (trade == null || trade.state !== "committing") {
      continue;
    }
    if (trade.participantA.characterId !== characterId && trade.participantB.characterId !== characterId) {
      continue;
    }
    findings.push(
      finding(
        "incomplete_trade",
        "report_only",
        trade.tradeId,
        "",
        "trade " + trade.tradeId + " is committing",
        "Rejoin retries snapshot; GM cancel_trade if stuck open — do not delete offers",
      ),
    );
  }
}

function scanCorpseGold(
  characterId: string,
  corpses: ReadonlyArray<CorpseLootContainer> | undefined,
  findings: ItemRecoveryFinding[],
): void {
  if (corpses === undefined) {
    return;
  }
  for (let i = 0; i < corpses.length; i++) {
    const corpse = corpses[i];
    const dist = corpse.goldDistribution;
    if (dist === undefined || dist.complete === true) {
      continue;
    }
    let involved = false;
    for (let r = 0; r < dist.recipients.length; r++) {
      if (dist.recipients[r].characterId === characterId) {
        involved = true;
        break;
      }
    }
    if (!involved) {
      continue;
    }
    findings.push(
      finding(
        "incomplete_gold_distribution",
        "report_only",
        corpse.corpseId,
        "gold",
        "corpse gold distribution incomplete",
        "Retry claimCorpseGold; do not wipe shares",
      ),
    );
  }
}

function scanGround(
  characterId: string,
  groundItems: ReadonlyArray<GroundItem> | undefined,
  findings: ItemRecoveryFinding[],
): void {
  if (groundItems === undefined) {
    return;
  }
  for (let i = 0; i < groundItems.length; i++) {
    const item = groundItems[i];
    if (item.createdByCharacterId !== characterId) {
      continue;
    }
    if (item.state === GROUND_CLAIMING) {
      findings.push(
        finding(
          "incomplete_drop",
          "report_only",
          item.groundEntityId,
          item.itemId,
          "ground entity " + item.groundEntityId + " is CLAIMING",
          "Pickup reservation must resolve or expire; do not delete the stack",
        ),
      );
    }
  }
}

function moveToOverflow(item: ItemInstance): ItemInstance {
  const copy = cloneItem(item);
  copy.slotIndex = -1;
  copy.lockReason = "";
  copy.lockType = "";
  copy.lockId = "";
  copy.lockQuantity = 0;
  copy.lockOwnerOperation = "";
  copy.lockCreatedAt = 0;
  copy.lockExpiresAt = 0;
  copy.version += 1;
  return copy;
}

function bagWith(items: ItemInstance[], capacity: number): PlayerInventory {
  const inventory = emptyInventory(capacity);
  inventory.items = items;
  return inventory;
}

function appendRecoveryAudit(
  existing: ItemMutationAudit[] | undefined,
  characterId: string,
  repairs: string[],
  nowMs: number,
): ItemMutationAudit[] {
  const next: ItemMutationAudit[] = [];
  if (existing !== undefined) {
    for (let i = 0; i < existing.length; i++) {
      next.push(cloneItemAudit(existing[i]));
    }
  }
  next.push(
    itemAuditFromChange({
      transactionId: "item-recovery",
      requestId: "item-recovery",
      characterId: characterId,
      operationType: "item_recovery",
      definitionId: "",
      instanceId: "",
      quantityBefore: 0,
      quantityAfter: 0,
      sourceContainer: "bag",
      destinationContainer: "overflow",
      goldDelta: 0,
      timestamp: nowMs,
      result: repairs.join(","),
    }),
  );
  return next;
}

export const ADMIN_REPAIR_LOCK_TYPE = LOCK_TYPE_ADMIN_REPAIR;
