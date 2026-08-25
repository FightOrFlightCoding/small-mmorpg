import { ACCOUNT_STATUS_DELETING, type AccountStatus } from "../domain/account_status";
import { AUTH_CHALLENGE_PURPOSES, invalidateAuthChallenge } from "../domain/auth_challenge";
import {
  ACCOUNT_DELETION_PHASES,
  emptyDeletionJob,
  evaluateAccountDeleteFence,
  leaseBlocksAccountDeletion,
  runAccountDeletionSaga,
  type AccountDeletionDeps,
  type AccountDeletionJob,
  type AccountDeletionPhase,
} from "../domain/account_deletion";
import { ACCOUNT_COMPAT_COLLECTION, ACCOUNT_COMPAT_KEY } from "../domain/account_compat";
import { compactCharacterId } from "../domain/storage_scope";
import { cancelTrade, unlockTradeInventories } from "../domain/trade";
import { expireCave } from "../domain/cave";
import { leaveParty } from "../domain/party";
import { walletChangeset } from "../domain/quest_reward";
import { runCharacterPurge } from "../domain/character_lifecycle";
import { readAccountProfile, writeAccountProfile, deleteAccountProfile } from "./account_profile_store";
import { readAccountDeletionJob, writeAccountDeletionJob } from "./account_deletion_store";
import { listAuthChallengesByHash, writeAuthChallenge, deleteAuthChallenge } from "./auth_challenge_store";
import { characterLifecycleDeps } from "./character_lifecycle_deps";
import { readRoster } from "./roster_store";
import { readCharacter } from "./character_store";
import { readGameplayLease, deleteGameplayLease } from "./gameplay_lease_store";
import { deleteSelection } from "./selection_store";
import { readActiveLocation, writeActiveLocation } from "./location_store";
import { readTrade, readTradeIndex, writeTrade } from "./trade_store";
import { readInventory, writeInventory } from "./inventory_store";
import { accountCaveRepository, readCharacterCaveAssociation, clearCharacterCaveAssociation } from "./cave_store";
import { nakamaPartyRepository } from "./party_store";
import { readGold } from "./transaction_store";
import { deletePlayerObject } from "./player_storage";
import { PLAYER_PARTY_KEY } from "../domain/party";
import { PLAYER_CAVE_KEY } from "../domain/cave";

function rosterIds(nk: nkruntime.Nakama, userId: string): string[] {
  const roster = readRoster(nk, userId);
  return roster !== null ? roster.characterIds.slice() : [];
}

function profileHmac(nk: nkruntime.Nakama, userId: string): string {
  const profile = readAccountProfile(nk, userId);
  return profile !== null ? profile.hmac : "";
}

function invalidatePurpose(nk: nkruntime.Nakama, hmac: string, purpose: (typeof AUTH_CHALLENGE_PURPOSES)[number], nowMs: number): void {
  if (hmac.length === 0) {
    return;
  }
  const records = listAuthChallengesByHash(nk, hmac, purpose);
  for (let i = 0; i < records.length; i++) {
    writeAuthChallenge(nk, invalidateAuthChallenge(records[i], nowMs));
  }
}

function deletePurpose(nk: nkruntime.Nakama, hmac: string, purpose: (typeof AUTH_CHALLENGE_PURPOSES)[number]): void {
  if (hmac.length === 0) {
    return;
  }
  const records = listAuthChallengesByHash(nk, hmac, purpose);
  for (let i = 0; i < records.length; i++) {
    deleteAuthChallenge(nk, records[i].challenge_id);
  }
}

export function accountHasLiveTrade(nk: nkruntime.Nakama, userId: string): boolean {
  const ids = rosterIds(nk, userId);
  for (let i = 0; i < ids.length; i++) {
    const tradeId = readTradeIndex(nk, userId, ids[i]);
    if (tradeId.length === 0) {
      continue;
    }
    const trade = readTrade(nk, tradeId);
    if (trade !== null && trade.state !== "completed" && trade.state !== "cancelled") {
      return true;
    }
  }
  return false;
}

export function accountHasInFlightTransfer(nk: nkruntime.Nakama, userId: string): boolean {
  const ids = rosterIds(nk, userId);
  for (let i = 0; i < ids.length; i++) {
    const location = readActiveLocation(nk, userId, ids[i]);
    if (location !== null && location.transferState !== "idle") {
      return true;
    }
  }
  return false;
}

export function evaluateStoredDeleteFence(
  nk: nkruntime.Nakama,
  userId: string,
  idempotencyKey: string,
  nowMs: number,
): ReturnType<typeof evaluateAccountDeleteFence> {
  const profile = readAccountProfile(nk, userId);
  const lease = readGameplayLease(nk, userId);
  return evaluateAccountDeleteFence({
    accountStatus: profile !== null ? profile.status : "ACTIVE",
    liveLease: leaseBlocksAccountDeletion(lease, nowMs),
    liveTrade: accountHasLiveTrade(nk, userId),
    inFlightTransfer: accountHasInFlightTransfer(nk, userId),
    deletionJob: readAccountDeletionJob(nk, userId),
    idempotencyKey: idempotencyKey,
  });
}

export function nakamaAccountDeletionDeps(nk: nkruntime.Nakama, logger?: nkruntime.Logger): AccountDeletionDeps {
  const lifecycle = characterLifecycleDeps(nk, undefined, logger);
  return {
    nowMs: function () {
      return Date.now();
    },
    readJob: function (accountUserId) {
      return readAccountDeletionJob(nk, accountUserId);
    },
    writeJob: function (job) {
      writeAccountDeletionJob(nk, job);
    },
    writeAccountStatus: function (userId, status: AccountStatus) {
      const profile = readAccountProfile(nk, userId);
      if (profile === null) {
        return;
      }
      writeAccountProfile(nk, userId, profile.hmac, profile.verifiedAt, { status: status });
    },
    invalidateChallenges: function (userId) {
      const hmac = profileHmac(nk, userId);
      const nowMs = Date.now();
      for (let i = 0; i < AUTH_CHALLENGE_PURPOSES.length; i++) {
        if (AUTH_CHALLENGE_PURPOSES[i] === "ACCOUNT_DELETION") {
          continue;
        }
        invalidatePurpose(nk, hmac, AUTH_CHALLENGE_PURPOSES[i], nowMs);
      }
    },
    cancelTrades: function (userId) {
      const ids = rosterIds(nk, userId);
      for (let i = 0; i < ids.length; i++) {
        const tradeId = readTradeIndex(nk, userId, ids[i]);
        if (tradeId.length === 0) {
          continue;
        }
        const trade = readTrade(nk, tradeId);
        if (trade === null || trade.state === "completed" || trade.state === "cancelled") {
          continue;
        }
        const cancelled = cancelTrade(trade, "cancelled", "adelete_" + compactCharacterId(ids[i]).slice(0, 24));
        const inventoryA = readInventory(nk, trade.participantA.accountUserId, trade.participantA.characterId);
        const inventoryB = readInventory(nk, trade.participantB.accountUserId, trade.participantB.characterId);
        if (inventoryA !== null && inventoryB !== null) {
          const unlocked = unlockTradeInventories(cancelled.trade, inventoryA, inventoryB);
          writeInventory(nk, trade.participantA.accountUserId, unlocked.inventoryA, trade.participantA.characterId);
          writeInventory(nk, trade.participantB.accountUserId, unlocked.inventoryB, trade.participantB.characterId);
        }
        writeTrade(nk, cancelled.trade);
      }
    },
    leaveParties: function (userId) {
      const repo = nakamaPartyRepository(nk);
      const ids = rosterIds(nk, userId);
      const nowMs = Date.now();
      for (let i = 0; i < ids.length; i++) {
        const character = readCharacter(nk, userId, ids[i]);
        const displayName = character !== null ? character.name : ids[i];
        leaveParty(
          repo,
          { accountUserId: userId, characterId: ids[i], displayName: displayName },
          nowMs,
          "adelete_" + compactCharacterId(ids[i]).slice(0, 24),
        );
        deletePlayerObject(nk, "player", PLAYER_PARTY_KEY, userId, ids[i]);
      }
    },
    clearCaves: function (userId) {
      const repo = accountCaveRepository(nk, userId);
      const ids = rosterIds(nk, userId);
      const nowMs = Date.now();
      for (let i = 0; i < ids.length; i++) {
        const association = readCharacterCaveAssociation(nk, userId, ids[i]);
        if (association !== null) {
          const cave = repo.getCave(association.instanceId);
          if (cave !== null && cave.lifecycleState !== "expired" && cave.lifecycleState !== "terminated") {
            expireCave(repo, cave, nowMs);
          }
          clearCharacterCaveAssociation(nk, userId, ids[i]);
        }
        const owned = repo.getOwnerIndex("character", ids[i]);
        if (owned !== null) {
          const cave = repo.getCave(owned.instanceId);
          if (cave !== null && cave.lifecycleState !== "expired" && cave.lifecycleState !== "terminated") {
            expireCave(repo, cave, nowMs);
          }
        }
        deletePlayerObject(nk, "player", PLAYER_CAVE_KEY, userId, ids[i]);
      }
    },
    clearTransfers: function (userId) {
      const ids = rosterIds(nk, userId);
      for (let i = 0; i < ids.length; i++) {
        const location = readActiveLocation(nk, userId, ids[i]);
        if (location !== null && location.transferState !== "idle") {
          location.transferState = "idle";
          writeActiveLocation(nk, location);
        }
      }
    },
    clearSelection: function (userId) {
      deleteSelection(nk, userId);
    },
    clearLease: function (userId) {
      deleteGameplayLease(nk, userId);
    },
    listCharacterIds: function (userId) {
      return rosterIds(nk, userId);
    },
    purgeCharacter: function (userId, characterId) {
      const record = readCharacter(nk, userId, characterId);
      if (record === null) {
        return;
      }
      runCharacterPurge(userId, record, lifecycle);
    },
    wipeGold: function (userId) {
      try {
        const gold = readGold(nk, userId);
        if (gold > 0) {
          nk.walletUpdate(userId, walletChangeset(-gold), { reason: "account_deletion" }, true);
        }
      } catch {
        return;
      }
      deletePlayerObject(nk, "player", "wallet_ref", userId);
    },
    removeEmailIndex: function (userId) {
      deleteAccountProfile(nk, userId);
      nk.storageDelete([{ collection: ACCOUNT_COMPAT_COLLECTION, key: ACCOUNT_COMPAT_KEY, userId: userId }]);
    },
    removePendingEmailChange: function (userId) {
      deletePurpose(nk, profileHmac(nk, userId), "EMAIL_CHANGE");
    },
    removeVerificationRecords: function (userId) {
      deletePurpose(nk, profileHmac(nk, userId), "EMAIL_VERIFICATION");
    },
    removePasswordResetRecords: function (userId) {
      deletePurpose(nk, profileHmac(nk, userId), "PASSWORD_RESET");
    },
    removeSupportRecovery: function () {
      return;
    },
    removeAccountSettings: function (userId) {
      deletePlayerObject(nk, "player", "settings", userId);
    },
    removeInviteBindings: function () {
      return;
    },
    revokeSessions: function (userId) {
      const lease = readGameplayLease(nk, userId);
      if (lease !== null && lease.sessionId.length > 0) {
        try {
          nk.sessionDisconnect(lease.sessionId);
        } catch {
          return;
        }
      }
    },
    disconnectSockets: function (userId) {
      const lease = readGameplayLease(nk, userId);
      if (lease !== null && lease.sessionId.length > 0) {
        try {
          nk.sessionDisconnect(lease.sessionId);
        } catch {
          return;
        }
      }
    },
    deleteNakamaAccount: function (userId) {
      try {
        nk.accountDeleteId(userId, true);
      } catch {
        return;
      }
    },
    sendDeletedEmail: function () {
      return;
    },
  };
}

export function startOrResumeAccountDeletion(input: {
  nk: nkruntime.Nakama;
  userId: string;
  email: string;
  emailLookupHash: string;
  idempotencyKey: string;
  deletionJobId: string;
  statusToken: string;
  nowMs: number;
  stopAfter?: AccountDeletionPhase;
  logger?: nkruntime.Logger;
}): AccountDeletionJob {
  const existing = readAccountDeletionJob(input.nk, input.userId);
  const job =
    existing !== null
      ? existing
      : emptyDeletionJob({
          deletionJobId: input.deletionJobId,
          accountUserId: input.userId,
          idempotencyKey: input.idempotencyKey,
          statusToken: input.statusToken,
          emailHeld: input.email,
          emailLookupHash: input.emailLookupHash,
          nowMs: input.nowMs,
        });
  writeAccountDeletionJob(input.nk, job);
  const deps = nakamaAccountDeletionDeps(input.nk, input.logger);
  deps.writeAccountStatus(input.userId, ACCOUNT_STATUS_DELETING);
  return runAccountDeletionSaga({ job: job, deps: deps, stopAfter: input.stopAfter });
}

export function resumeAccountDeletion(
  nk: nkruntime.Nakama,
  userId: string,
  stopAfter?: AccountDeletionPhase,
  logger?: nkruntime.Logger,
): AccountDeletionJob | null {
  const job = readAccountDeletionJob(nk, userId);
  if (job === null) {
    return null;
  }
  return runAccountDeletionSaga({ job: job, deps: nakamaAccountDeletionDeps(nk, logger), stopAfter: stopAfter });
}

export function publicDeletionStatus(job: AccountDeletionJob | null): { [key: string]: unknown } {
  if (job === null) {
    return { found: false, completed: false, phase: "", deletionJobId: "" };
  }
  const next = job.completedPhases.length < ACCOUNT_DELETION_PHASES.length ? ACCOUNT_DELETION_PHASES[job.completedPhases.length] : "complete";
  return {
    found: true,
    completed: job.completedAt > 0,
    phase: next,
    deletionJobId: job.deletionJobId,
    completedPhases: job.completedPhases.slice(),
  };
}
