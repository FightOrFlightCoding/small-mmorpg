import { buildInventoryWrite } from "./inventory_store";
import { buildQuestWrite } from "./quest_store";
import { buildEquipmentWrite } from "./equipment_store";
import { INVENTORY_COLLECTION, INVENTORY_KEY } from "../domain/inventory_store";
import { QUEST_COLLECTION, QUEST_KEY, storedQuestFromValue } from "../domain/quest_store";
import { EQUIPMENT_COLLECTION, EQUIPMENT_KEY } from "../domain/equipment_store";
import { QUEST_STATUS_COMPLETED } from "../domain/quest";
import { goldFromWallet } from "../domain/wallet";
import { storageKey } from "../domain/storage_scope";
import { walletChangeset } from "../domain/quest_reward";
import {
  simulateCommit,
  TX_REASON_QUEST_REWARD,
  type TransactionResult,
  type TransactionWrite,
} from "../domain/transaction";
import type { QuestRewardWrite, RewardCommitResult } from "../domain/quest_reward";

const MAX_TRANSACTION_RETRIES = 5;

export function readGold(nk: nkruntime.Nakama, userId: string): number {
  const account = nk.accountGetId(userId);
  return goldFromWallet(account.wallet);
}

export function commitTransaction(nk: nkruntime.Nakama, request: TransactionWrite): TransactionResult {
  const characterId = request.characterId;
  const questKey = request.questLog !== undefined ? storageKey(QUEST_KEY, characterId) : "";
  const inventoryKey = request.inventory !== undefined ? storageKey(INVENTORY_KEY, characterId) : "";
  const equipmentKey = request.equipment !== undefined ? storageKey(EQUIPMENT_KEY, characterId) : "";
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt++) {
    const reads: nkruntime.StorageReadRequest[] = [];
    if (request.questLog !== undefined) {
      reads.push({ collection: QUEST_COLLECTION, key: questKey, userId: request.userId });
    }
    if (request.inventory !== undefined) {
      reads.push({ collection: INVENTORY_COLLECTION, key: inventoryKey, userId: request.userId });
    }
    if (request.equipment !== undefined) {
      reads.push({ collection: EQUIPMENT_COLLECTION, key: equipmentKey, userId: request.userId });
    }
    const objects = reads.length > 0 ? nk.storageRead(reads) : [];
    let questVersion: string | undefined;
    let inventoryVersion: string | undefined;
    let equipmentVersion: string | undefined;
    let storedLog = request.questLog !== undefined ? storedQuestFromValue(null) : null;
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      if (request.questLog !== undefined && object.collection === QUEST_COLLECTION && object.key === questKey) {
        storedLog = storedQuestFromValue(object.value);
        questVersion = object.version;
      }
      if (request.inventory !== undefined && object.collection === INVENTORY_COLLECTION && object.key === inventoryKey) {
        inventoryVersion = object.version;
      }
      if (request.equipment !== undefined && object.collection === EQUIPMENT_COLLECTION && object.key === equipmentKey) {
        equipmentVersion = object.version;
      }
    }
    request.currentGold = readGold(nk, request.userId);
    request.currentVersions = {
      inventory: inventoryVersion,
      equipment: equipmentVersion,
      quests: questVersion,
    };
    if (request.reasonType === TX_REASON_QUEST_REWARD && storedLog !== null) {
      const prior = storedLog.turnInByRequestId[request.requestId];
      if (prior === "ok") {
        const gold = readGold(nk, request.userId);
        return {
          ok: true,
          code: "ok",
          replay: true,
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
            code: "ok",
            ok: true,
            metadata: request.metadata !== undefined ? request.metadata : {},
          },
        };
      }
      const storedQuest = storedLog.quests[request.reasonId];
      if (storedQuest !== undefined && storedQuest.status === QUEST_STATUS_COMPLETED) {
        const gold = readGold(nk, request.userId);
        return {
          ok: true,
          code: "already_completed",
          replay: true,
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
            code: "already_completed",
            ok: true,
            metadata: request.metadata !== undefined ? request.metadata : {},
          },
        };
      }
    }
    const simulated = simulateCommit(request);
    if (!simulated.ok) {
      return simulated;
    }
    const writes: nkruntime.StorageWriteRequest[] = [];
    if (request.inventory !== undefined) {
      writes.push(buildInventoryWrite(request.userId, request.inventory, inventoryVersion, characterId));
    }
    if (request.questLog !== undefined) {
      writes.push(buildQuestWrite(request.userId, request.questLog, questVersion, characterId));
    }
    if (request.equipment !== undefined) {
      writes.push(buildEquipmentWrite(request.userId, request.equipment, equipmentVersion, characterId));
    }
    const wallets: nkruntime.WalletUpdate[] = [];
    if (request.goldDelta !== 0) {
      wallets.push({
        userId: request.userId,
        changeset: walletChangeset(request.goldDelta),
        metadata: request.metadata !== undefined ? request.metadata : {},
      });
    }
    try {
      const result = nk.multiUpdate(null, writes, null, wallets.length > 0 ? wallets : null, true);
      let gold = readGold(nk, request.userId);
      if (result.walletUpdateAcks !== undefined && result.walletUpdateAcks.length > 0) {
        gold = goldFromWallet(result.walletUpdateAcks[0].updated);
      }
      return {
        ok: true,
        code: "ok",
        replay: false,
        gold: gold,
        goldDelta: request.goldDelta,
        audit: {
          requestId: request.requestId,
          characterId: request.characterId,
          userId: request.userId,
          reasonType: request.reasonType,
          reasonId: request.reasonId,
          goldDelta: request.goldDelta,
          resultingBalance: gold,
          code: "ok",
          ok: true,
          metadata: request.metadata !== undefined ? request.metadata : {},
        },
      };
    } catch (error) {
      if (!isVersionConflict(error) || attempt === MAX_TRANSACTION_RETRIES - 1) {
        return {
          ok: false,
          code: "persist_failed",
          replay: false,
          gold: 0,
          goldDelta: 0,
          audit: {
            requestId: request.requestId,
            characterId: request.characterId,
            userId: request.userId,
            reasonType: request.reasonType,
            reasonId: request.reasonId,
            goldDelta: 0,
            resultingBalance: 0,
            code: "persist_failed",
            ok: false,
            metadata: request.metadata !== undefined ? request.metadata : {},
          },
        };
      }
    }
  }
  return {
    ok: false,
    code: "persist_failed",
    replay: false,
    gold: 0,
    goldDelta: 0,
    audit: {
      requestId: request.requestId,
      characterId: request.characterId,
      userId: request.userId,
      reasonType: request.reasonType,
      reasonId: request.reasonId,
      goldDelta: 0,
      resultingBalance: 0,
      code: "persist_failed",
      ok: false,
      metadata: request.metadata !== undefined ? request.metadata : {},
    },
  };
}

export function commitQuestReward(nk: nkruntime.Nakama, request: QuestRewardWrite): RewardCommitResult {
  const result = commitTransaction(nk, {
    requestId: request.requestId,
    characterId: request.characterId !== undefined ? request.characterId : "",
    userId: request.userId,
    reasonType: TX_REASON_QUEST_REWARD,
    reasonId: request.questId,
    goldDelta: request.goldDelta,
    currentGold: 0,
    inventory: request.inventory,
    questLog: request.log,
    metadata: request.metadata,
  });
  return { ok: result.ok, code: result.code, gold: result.gold };
}

function isVersionConflict(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }
  return String(error).toLowerCase().indexOf("version") !== -1;
}
