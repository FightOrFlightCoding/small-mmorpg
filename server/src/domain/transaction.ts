import type { PlayerEquipment } from "./equipment";
import type { PlayerInventory } from "./inventory";
import type { QuestLog } from "./quest";
import { applyGoldMutation, type GoldLedger, type GoldMutationResult } from "./wallet";

export const TX_REASON_LOOT = "loot";
export const TX_REASON_QUEST_REWARD = "quest_reward";
export const TX_REASON_EQUIPMENT = "equipment";
export const TX_REASON_ITEM_DESTROY = "item_destroy";
export const TX_REASON_ITEM_SPLIT = "item_split";
export const TX_REASON_ITEM_MOVE = "item_move";
export const TX_REASON_ADMIN_GRANT = "admin_grant";
export const TX_REASON_VENDOR = "vendor";
export const TX_REASON_INN = "inn";
export const TX_REASON_TRADE = "trade";

export interface TransactionAuditEvent {
  requestId: string;
  characterId: string;
  userId: string;
  reasonType: string;
  reasonId: string;
  goldDelta: number;
  resultingBalance: number;
  code: string;
  ok: boolean;
  metadata: { [key: string]: unknown };
}

export interface TransactionVersions {
  inventory?: string;
  equipment?: string;
  quests?: string;
}

export interface TransactionWrite {
  requestId: string;
  characterId: string;
  userId: string;
  reasonType: string;
  reasonId: string;
  goldDelta: number;
  currentGold: number;
  inventory?: PlayerInventory;
  equipment?: PlayerEquipment;
  questLog?: QuestLog;
  expectedVersions?: TransactionVersions;
  currentVersions?: TransactionVersions;
  metadata?: { [key: string]: unknown };
  ledger?: GoldLedger;
}

export interface TransactionResult {
  ok: boolean;
  code: string;
  replay: boolean;
  gold: number;
  goldDelta: number;
  audit: TransactionAuditEvent;
}

export type TransactionCommitter = (request: TransactionWrite) => TransactionResult;

export function simulateCommit(request: TransactionWrite): TransactionResult {
  const metadata = copyMetadata(request.metadata);
  const versionCode = versionConflict(request.expectedVersions, request.currentVersions);
  if (versionCode.length > 0) {
    return failTransaction(request, versionCode, metadata);
  }
  const gold: GoldMutationResult = applyGoldMutation(
    {
      characterId: request.characterId,
      currentGold: request.currentGold,
      delta: request.goldDelta,
      reasonType: request.reasonType,
      reasonId: request.reasonId,
      requestId: request.requestId,
      metadata: metadata,
    },
    request.ledger,
  );
  if (!gold.ok) {
    return {
      ok: false,
      code: gold.code,
      replay: gold.replay,
      gold: gold.gold,
      goldDelta: 0,
      audit: auditFromGold(request, gold, metadata),
    };
  }
  return {
    ok: true,
    code: gold.replay ? gold.code : "ok",
    replay: gold.replay,
    gold: gold.resultingBalance,
    goldDelta: gold.goldDelta,
    audit: auditFromGold(request, gold, metadata),
  };
}

export function memoryCommitter(ledger?: GoldLedger): TransactionCommitter {
  const shared = ledger !== undefined ? ledger : { mutationByRequestId: {} };
  return function (request: TransactionWrite): TransactionResult {
    request.ledger = shared;
    return simulateCommit(request);
  };
}

function versionConflict(expected?: TransactionVersions, current?: TransactionVersions): string {
  if (expected === undefined) {
    return "";
  }
  const actual = current !== undefined ? current : {};
  if (expected.inventory !== undefined && expected.inventory !== actual.inventory) {
    return "version_conflict";
  }
  if (expected.equipment !== undefined && expected.equipment !== actual.equipment) {
    return "version_conflict";
  }
  if (expected.quests !== undefined && expected.quests !== actual.quests) {
    return "version_conflict";
  }
  return "";
}

function failTransaction(
  request: TransactionWrite,
  code: string,
  metadata: { [key: string]: unknown },
): TransactionResult {
  const gold = request.currentGold < 0 ? 0 : request.currentGold;
  return {
    ok: false,
    code: code,
    replay: false,
    gold: gold,
    goldDelta: 0,
    audit: {
      requestId: request.requestId,
      characterId: request.characterId,
      userId: request.userId,
      reasonType: request.reasonType,
      reasonId: request.reasonId,
      goldDelta: 0,
      resultingBalance: gold,
      code: code,
      ok: false,
      metadata: metadata,
    },
  };
}

function auditFromGold(
  request: TransactionWrite,
  gold: GoldMutationResult,
  metadata: { [key: string]: unknown },
): TransactionAuditEvent {
  return {
    requestId: request.requestId,
    characterId: request.characterId,
    userId: request.userId,
    reasonType: request.reasonType,
    reasonId: request.reasonId,
    goldDelta: gold.goldDelta,
    resultingBalance: gold.resultingBalance,
    code: gold.code,
    ok: gold.ok,
    metadata: metadata,
  };
}

function copyMetadata(metadata: { [key: string]: unknown } | undefined): { [key: string]: unknown } {
  const copy: { [key: string]: unknown } = {};
  if (metadata === undefined) {
    return copy;
  }
  const keys = Object.keys(metadata);
  for (let i = 0; i < keys.length; i++) {
    copy[keys[i]] = metadata[keys[i]];
  }
  return copy;
}
