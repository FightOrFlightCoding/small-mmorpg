import { buildInventoryWrite } from "./inventory_store";
import { INVENTORY_COLLECTION, INVENTORY_KEY, storedInventoryFromValue } from "../domain/inventory_store";
import { goldFromWallet } from "../domain/wallet";
import { storageKey } from "../domain/storage_scope";
import { walletChangeset } from "../domain/quest_reward";
import { SYSTEM_USER_ID } from "./starter_zone_registry";
import {
  TRADE_AUDIT_KEY,
  TRADE_COLLECTION,
  TRADE_KEY,
  TRADE_PERMISSION_READ,
  TRADE_PERMISSION_WRITE,
  TRADE_SCHEMA_VERSION,
  PLAYER_TRADE_KEY,
  cloneTradeRecord,
  markTradeCompleted,
  type TradeCommitRequest,
  type TradeCommitResult,
  type TradeRecord,
} from "../domain/trade";
import { cloneInventory, type PlayerInventory } from "../domain/inventory";
import { TX_REASON_TRADE, type TransactionAuditEvent } from "../domain/transaction";
import { readGold } from "./transaction_store";

const MAX_TRADE_RETRIES = 5;

export function writeTrade(nk: nkruntime.Nakama, trade: TradeRecord): void {
  nk.storageWrite([tradeWrite(trade)]);
  writeTradeIndex(nk, trade.participantA.accountUserId, trade.participantA.characterId, trade);
  writeTradeIndex(nk, trade.participantB.accountUserId, trade.participantB.characterId, trade);
}

export function readTrade(nk: nkruntime.Nakama, tradeId: string): TradeRecord | null {
  const objects = nk.storageRead([
    { collection: TRADE_COLLECTION, key: storageKey(TRADE_KEY, tradeId), userId: SYSTEM_USER_ID },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return tradeFromValue(objects[0].value);
}

export function readTradeIndex(nk: nkruntime.Nakama, userId: string, characterId: string): string {
  const objects = nk.storageRead([
    { collection: "player", key: storageKey(PLAYER_TRADE_KEY, characterId), userId: userId },
  ]);
  if (objects.length === 0) {
    return "";
  }
  const value = objects[0].value as { [key: string]: unknown };
  return typeof value.tradeId === "string" ? value.tradeId : "";
}

export function commitTradeTransaction(nk: nkruntime.Nakama, request: TradeCommitRequest): TradeCommitResult {
  const existing = readTrade(nk, request.trade.tradeId);
  if (existing !== null && existing.state === "completed") {
    return replayStored(existing, request);
  }
  writeTrade(nk, request.trade);
  const characterA = request.characterA;
  const characterB = request.characterB;
  const inventoryKeyA = storageKey(INVENTORY_KEY, characterA);
  const inventoryKeyB = storageKey(INVENTORY_KEY, characterB);
  for (let attempt = 0; attempt < MAX_TRADE_RETRIES; attempt++) {
    const objects = nk.storageRead([
      { collection: INVENTORY_COLLECTION, key: inventoryKeyA, userId: request.userA },
      { collection: INVENTORY_COLLECTION, key: inventoryKeyB, userId: request.userB },
    ]);
    let versionA: string | undefined;
    let versionB: string | undefined;
    for (let i = 0; i < objects.length; i++) {
      if (objects[i].key === inventoryKeyA && objects[i].userId === request.userA) {
        versionA = objects[i].version;
      }
      if (objects[i].key === inventoryKeyB && objects[i].userId === request.userB) {
        versionB = objects[i].version;
      }
    }
    const goldA = readGold(nk, request.userA);
    const goldB = readGold(nk, request.userB);
    if (goldA + request.goldDeltaA < 0 || goldB + request.goldDeltaB < 0) {
      return failCommit(request, "insufficient_gold", goldA, goldB);
    }
    const audits = {
      a: auditOf(request, "a", request.goldDeltaA, goldA + request.goldDeltaA),
      b: auditOf(request, "b", request.goldDeltaB, goldB + request.goldDeltaB),
    };
    const completed = markTradeCompleted(request.trade, request.requestId, audits);
    const writes: nkruntime.StorageWriteRequest[] = [
      buildInventoryWrite(request.userA, request.inventoryA, versionA, characterA),
      buildInventoryWrite(request.userB, request.inventoryB, versionB, characterB),
      tradeWrite(completed),
      indexWrite(request.userA, characterA, completed),
      indexWrite(request.userB, characterB, completed),
      auditWrite(request.userA, characterA, audits.a),
      auditWrite(request.userB, characterB, audits.b),
    ];
    const wallets: nkruntime.WalletUpdate[] = [];
    if (request.goldDeltaA !== 0) {
      wallets.push({
        userId: request.userA,
        changeset: walletChangeset(request.goldDeltaA),
        metadata: { source: "trade", tradeId: request.trade.tradeId, requestId: request.requestId, side: "a" },
      });
    }
    if (request.goldDeltaB !== 0) {
      wallets.push({
        userId: request.userB,
        changeset: walletChangeset(request.goldDeltaB),
        metadata: { source: "trade", tradeId: request.trade.tradeId, requestId: request.requestId, side: "b" },
      });
    }
    try {
      const result = nk.multiUpdate(null, writes, null, wallets.length > 0 ? wallets : null, true);
      let nextGoldA = goldA + request.goldDeltaA;
      let nextGoldB = goldB + request.goldDeltaB;
      if (result.walletUpdateAcks !== undefined && result.walletUpdateAcks.length > 0) {
        let ackIndex = 0;
        if (request.goldDeltaA !== 0 && ackIndex < result.walletUpdateAcks.length) {
          nextGoldA = goldFromWallet(result.walletUpdateAcks[ackIndex].updated);
          ackIndex += 1;
        }
        if (request.goldDeltaB !== 0 && ackIndex < result.walletUpdateAcks.length) {
          nextGoldB = goldFromWallet(result.walletUpdateAcks[ackIndex].updated);
        }
      }
      return {
        ok: true,
        code: "ok",
        replay: false,
        goldA: nextGoldA,
        goldB: nextGoldB,
        inventoryA: cloneInventory(request.inventoryA),
        inventoryB: cloneInventory(request.inventoryB),
        trade: completed,
        audits: audits,
      };
    } catch (error) {
      if (!isVersionConflict(error) || attempt === MAX_TRADE_RETRIES - 1) {
        return failCommit(request, "persist_failed", goldA, goldB);
      }
    }
  }
  return failCommit(request, "persist_failed", 0, 0);
}

function tradeWrite(trade: TradeRecord): nkruntime.StorageWriteRequest {
  return {
    collection: TRADE_COLLECTION,
    key: storageKey(TRADE_KEY, trade.tradeId),
    userId: SYSTEM_USER_ID,
    value: tradeWriteValue(trade),
    permissionRead: TRADE_PERMISSION_READ,
    permissionWrite: TRADE_PERMISSION_WRITE,
  };
}

function writeTradeIndex(nk: nkruntime.Nakama, userId: string, characterId: string, trade: TradeRecord): void {
  nk.storageWrite([indexWrite(userId, characterId, trade)]);
}

function indexWrite(userId: string, characterId: string, trade: TradeRecord): nkruntime.StorageWriteRequest {
  return {
    collection: "player",
    key: storageKey(PLAYER_TRADE_KEY, characterId),
    userId: userId,
    value: {
      schemaVersion: TRADE_SCHEMA_VERSION,
      characterId: characterId,
      tradeId: trade.state === "cancelled" || trade.state === "completed" ? "" : trade.tradeId,
      state: trade.state,
    },
    permissionRead: TRADE_PERMISSION_READ,
    permissionWrite: TRADE_PERMISSION_WRITE,
  };
}

function auditWrite(userId: string, characterId: string, audit: TransactionAuditEvent): nkruntime.StorageWriteRequest {
  return {
    collection: "player",
    key: storageKey(TRADE_AUDIT_KEY, characterId),
    userId: userId,
    value: {
      schemaVersion: TRADE_SCHEMA_VERSION,
      characterId: characterId,
      requestId: audit.requestId,
      reasonType: audit.reasonType,
      reasonId: audit.reasonId,
      goldDelta: audit.goldDelta,
      resultingBalance: audit.resultingBalance,
      code: audit.code,
      ok: audit.ok,
      metadata: audit.metadata,
    },
    permissionRead: TRADE_PERMISSION_READ,
    permissionWrite: TRADE_PERMISSION_WRITE,
  };
}

function tradeWriteValue(trade: TradeRecord): { [key: string]: unknown } {
  const value: { [key: string]: unknown } = {
    schemaVersion: TRADE_SCHEMA_VERSION,
    tradeId: trade.tradeId,
    participantA: trade.participantA,
    participantB: trade.participantB,
    state: trade.state,
    revision: trade.revision,
    offers: trade.offers,
    goldOffers: trade.goldOffers,
    acceptanceRevisionByParticipant: trade.acceptanceRevisionByParticipant,
    createdAt: trade.createdAt,
    expiresAt: trade.expiresAt,
    createdAtTick: trade.createdAtTick,
    expiresAtTick: trade.expiresAtTick,
    inviteExpiresAtTick: trade.inviteExpiresAtTick,
    matchId: trade.matchId,
    byRequestId: trade.byRequestId,
  };
  if (trade.commitRequestId !== undefined) {
    value.commitRequestId = trade.commitRequestId;
  }
  if (trade.cancelReason !== undefined) {
    value.cancelReason = trade.cancelReason;
  }
  if (trade.commitSnapshot !== undefined) {
    value.commitSnapshot = {
      inventoryA: trade.commitSnapshot.inventoryA,
      inventoryB: trade.commitSnapshot.inventoryB,
      goldA: trade.commitSnapshot.goldA,
      goldB: trade.commitSnapshot.goldB,
      goldDeltaA: trade.commitSnapshot.goldDeltaA,
      goldDeltaB: trade.commitSnapshot.goldDeltaB,
      requestId: trade.commitSnapshot.requestId,
    };
  }
  if (trade.audits !== undefined) {
    value.audits = trade.audits;
  }
  return value;
}

function tradeFromValue(value: unknown): TradeRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.tradeId !== "string" || data.tradeId.length === 0) {
    return null;
  }
  const participantA = participantFromValue(data.participantA);
  const participantB = participantFromValue(data.participantB);
  if (participantA === null || participantB === null) {
    return null;
  }
  const parsed: TradeRecord = {
    tradeId: data.tradeId,
    participantA: participantA,
    participantB: participantB,
    state: parseState(data.state),
    revision: typeof data.revision === "number" ? data.revision : 0,
    offers: data.offers as TradeRecord["offers"],
    goldOffers: data.goldOffers as TradeRecord["goldOffers"],
    acceptanceRevisionByParticipant: data.acceptanceRevisionByParticipant as TradeRecord["acceptanceRevisionByParticipant"],
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : 0,
    createdAtTick: typeof data.createdAtTick === "number" ? data.createdAtTick : 0,
    expiresAtTick: typeof data.expiresAtTick === "number" ? data.expiresAtTick : 0,
    inviteExpiresAtTick: typeof data.inviteExpiresAtTick === "number" ? data.inviteExpiresAtTick : 0,
    matchId: typeof data.matchId === "string" ? data.matchId : "",
    schemaVersion: TRADE_SCHEMA_VERSION,
    byRequestId: data.byRequestId as TradeRecord["byRequestId"],
  };
  if (typeof data.commitRequestId === "string") {
    parsed.commitRequestId = data.commitRequestId;
  }
  if (typeof data.cancelReason === "string") {
    parsed.cancelReason = data.cancelReason;
  }
  if (data.commitSnapshot !== null && typeof data.commitSnapshot === "object" && !Array.isArray(data.commitSnapshot)) {
    const snap = data.commitSnapshot as { [key: string]: unknown };
    const invA = inventoryFromUnknown(snap.inventoryA);
    const invB = inventoryFromUnknown(snap.inventoryB);
    if (invA !== null && invB !== null && typeof snap.requestId === "string") {
      parsed.commitSnapshot = {
        inventoryA: invA,
        inventoryB: invB,
        goldA: typeof snap.goldA === "number" ? snap.goldA : 0,
        goldB: typeof snap.goldB === "number" ? snap.goldB : 0,
        goldDeltaA: typeof snap.goldDeltaA === "number" ? snap.goldDeltaA : 0,
        goldDeltaB: typeof snap.goldDeltaB === "number" ? snap.goldDeltaB : 0,
        requestId: snap.requestId,
      };
    }
  }
  return parsed;
}

function inventoryFromUnknown(value: unknown): PlayerInventory | null {
  if (value === null || value === undefined) {
    return null;
  }
  const stored = storedInventoryFromValue(value);
  return stored !== null ? stored : null;
}

function participantFromValue(value: unknown): TradeRecord["participantA"] | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const data = value as { [key: string]: unknown };
  if (typeof data.characterId !== "string" || typeof data.accountUserId !== "string") {
    return null;
  }
  return {
    characterId: data.characterId,
    accountUserId: data.accountUserId,
    displayName: typeof data.displayName === "string" ? data.displayName : "",
  };
}

function parseState(value: unknown): TradeRecord["state"] {
  if (
    value === "inviting" ||
    value === "open" ||
    value === "committing" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "cancelled";
}

function replayStored(trade: TradeRecord, request: TradeCommitRequest): TradeCommitResult {
  const snapshot = trade.commitSnapshot;
  return {
    ok: true,
    code: "ok",
    replay: true,
    goldA: snapshot !== undefined ? snapshot.goldA : request.currentGoldA,
    goldB: snapshot !== undefined ? snapshot.goldB : request.currentGoldB,
    inventoryA: snapshot !== undefined ? cloneInventory(snapshot.inventoryA) : cloneInventory(request.inventoryA),
    inventoryB: snapshot !== undefined ? cloneInventory(snapshot.inventoryB) : cloneInventory(request.inventoryB),
    trade: cloneTradeRecord(trade),
    audits: {
      a: auditOf(request, "a", 0, snapshot !== undefined ? snapshot.goldA : request.currentGoldA),
      b: auditOf(request, "b", 0, snapshot !== undefined ? snapshot.goldB : request.currentGoldB),
    },
  };
}

function failCommit(
  request: TradeCommitRequest,
  code: string,
  goldA: number,
  goldB: number,
): TradeCommitResult {
  return {
    ok: false,
    code: code,
    replay: false,
    goldA: goldA,
    goldB: goldB,
    inventoryA: cloneInventory(request.inventoryA),
    inventoryB: cloneInventory(request.inventoryB),
    trade: cloneTradeRecord(request.trade),
    audits: {
      a: auditOf(request, "a", 0, goldA),
      b: auditOf(request, "b", 0, goldB),
    },
  };
}

function auditOf(
  request: TradeCommitRequest,
  side: "a" | "b",
  goldDelta: number,
  resultingBalance: number,
): TransactionAuditEvent {
  return {
    requestId: request.requestId,
    characterId: side === "a" ? request.characterA : request.characterB,
    userId: side === "a" ? request.userA : request.userB,
    reasonType: TX_REASON_TRADE,
    reasonId: request.trade.tradeId,
    goldDelta: goldDelta,
    resultingBalance: resultingBalance,
    code: "ok",
    ok: true,
    metadata: { source: "trade", side: side },
  };
}

function isVersionConflict(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }
  return String(error).toLowerCase().indexOf("version") !== -1;
}
