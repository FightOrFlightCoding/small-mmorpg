import { buildInventoryWrite } from "./inventory_store";
import { buildQuestWrite } from "./quest_store";
import { INVENTORY_COLLECTION, INVENTORY_KEY } from "../domain/inventory_store";
import { QUEST_COLLECTION, QUEST_KEY, storedQuestFromValue } from "../domain/quest_store";
import { QUEST_STATUS_COMPLETED } from "../domain/quest";
import { goldFromWallet } from "../domain/wallet";
import {
  walletChangeset,
  type QuestRewardWrite,
  type RewardCommitResult,
} from "../domain/quest_reward";

const MAX_REWARD_RETRIES = 5;

export function readGold(nk: nkruntime.Nakama, userId: string): number {
  const account = nk.accountGetId(userId);
  return goldFromWallet(account.wallet);
}

export function commitQuestReward(nk: nkruntime.Nakama, request: QuestRewardWrite): RewardCommitResult {
  for (let attempt = 0; attempt < MAX_REWARD_RETRIES; attempt++) {
    const objects = nk.storageRead([
      { collection: QUEST_COLLECTION, key: QUEST_KEY, userId: request.userId },
      { collection: INVENTORY_COLLECTION, key: INVENTORY_KEY, userId: request.userId },
    ]);
    let questVersion: string | undefined;
    let inventoryVersion: string | undefined;
    let storedLog = storedQuestFromValue(null);
    for (let i = 0; i < objects.length; i++) {
      const object = objects[i];
      if (object.collection === QUEST_COLLECTION && object.key === QUEST_KEY) {
        storedLog = storedQuestFromValue(object.value);
        questVersion = object.version;
      }
      if (object.collection === INVENTORY_COLLECTION && object.key === INVENTORY_KEY) {
        inventoryVersion = object.version;
      }
    }
    const prior = storedLog.turnInByRequestId[request.requestId];
    if (prior === "ok") {
      return { ok: true, code: "ok", gold: readGold(nk, request.userId) };
    }
    const storedQuest = storedLog.quests[request.questId];
    if (storedQuest !== undefined && storedQuest.status === QUEST_STATUS_COMPLETED) {
      return { ok: true, code: "already_completed", gold: readGold(nk, request.userId) };
    }
    const writes: nkruntime.StorageWriteRequest[] = [
      buildInventoryWrite(request.userId, request.inventory, inventoryVersion),
      buildQuestWrite(request.userId, request.log, questVersion),
    ];
    const wallets: nkruntime.WalletUpdate[] = [
      {
        userId: request.userId,
        changeset: walletChangeset(request.goldDelta),
        metadata: request.metadata,
      },
    ];
    try {
      const result = nk.multiUpdate(null, writes, null, wallets, true);
      let gold = readGold(nk, request.userId);
      if (result.walletUpdateAcks !== undefined && result.walletUpdateAcks.length > 0) {
        gold = goldFromWallet(result.walletUpdateAcks[0].updated);
      }
      return { ok: true, code: "ok", gold: gold };
    } catch (error) {
      if (!isVersionConflict(error) || attempt === MAX_REWARD_RETRIES - 1) {
        return { ok: false, code: "persist_failed", gold: 0 };
      }
    }
  }
  return { ok: false, code: "persist_failed", gold: 0 };
}

function isVersionConflict(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }
  return String(error).toLowerCase().indexOf("version") !== -1;
}
