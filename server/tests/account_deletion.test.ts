import assert from "node:assert/strict";
import test from "node:test";
import { decideEmailLookup, decideEmailLookupWithRereads } from "../src/domain/account_compat";
import {
  ACCOUNT_DELETE_PHRASE,
  ACCOUNT_DELETION_PHASES,
  AUTH_ACCOUNT_BUSY,
  AUTH_ACCOUNT_TRADING,
  AUTH_ACCOUNT_TRANSFERRING,
  AUTH_DELETE_ACTIVE,
  AUTH_DELETE_PHRASE,
  accountDeletionCompleted,
  deletionTombstoneValue,
  emptyDeletionJob,
  evaluateAccountDeleteConfirm,
  evaluateAccountDeleteFence,
  leaseBlocksAccountDeletion,
  nextDeletionPhase,
  runAccountDeletionSaga,
  shouldReplayDeletion,
  type AccountDeletionDeps,
  type AccountDeletionJob,
  type AccountDeletionPhase,
} from "../src/domain/account_deletion";
import { ACCOUNT_STATUS_ACTIVE, ACCOUNT_STATUS_DELETING } from "../src/domain/account_status";
import { acquireGameplayLease, markLeaseLinkDead } from "../src/domain/gameplay_lease";

interface MemoryWorld {
  nowMs: number;
  status: string;
  gold: number;
  characters: string[];
  purged: string[];
  emailIndex: string;
  itemLocks: number;
  sessions: number;
  sockets: number;
  nakamaDeleted: boolean;
  emails: string[];
  restored: boolean;
  challenges: number;
  trades: number;
  parties: number;
  caves: number;
  transfers: number;
  selection: boolean;
  lease: boolean;
  pendingEmailChange: boolean;
  verification: boolean;
  passwordReset: boolean;
  supportRecovery: boolean;
  settings: boolean;
  inviteBindings: boolean;
  job: AccountDeletionJob | null;
}

function seedWorld(): MemoryWorld {
  return {
    nowMs: 1_000_000,
    status: ACCOUNT_STATUS_ACTIVE,
    gold: 50,
    characters: ["char-live", "char-deleted"],
    purged: [],
    emailIndex: "user-old",
    itemLocks: 2,
    sessions: 3,
    sockets: 1,
    nakamaDeleted: false,
    emails: [],
    restored: false,
    challenges: 2,
    trades: 1,
    parties: 1,
    caves: 1,
    transfers: 1,
    selection: true,
    lease: false,
    pendingEmailChange: true,
    verification: true,
    passwordReset: true,
    supportRecovery: true,
    settings: true,
    inviteBindings: true,
    job: null,
  };
}

function memoryDeps(world: MemoryWorld): AccountDeletionDeps {
  return {
    nowMs: function () {
      return world.nowMs;
    },
    readJob: function () {
      return world.job;
    },
    writeJob: function (job) {
      world.job = job;
    },
    writeAccountStatus: function (_userId, status) {
      world.status = status;
    },
    invalidateChallenges: function () {
      world.challenges = 0;
    },
    cancelTrades: function () {
      world.trades = 0;
      world.itemLocks = 0;
    },
    leaveParties: function () {
      world.parties = 0;
    },
    clearCaves: function () {
      world.caves = 0;
    },
    clearTransfers: function () {
      world.transfers = 0;
    },
    clearSelection: function () {
      world.selection = false;
    },
    clearLease: function () {
      world.lease = false;
    },
    listCharacterIds: function () {
      return world.characters.slice();
    },
    purgeCharacter: function (_userId, characterId) {
      if (world.purged.indexOf(characterId) === -1) {
        world.purged.push(characterId);
      }
    },
    wipeGold: function () {
      world.gold = 0;
    },
    removeEmailIndex: function () {
      world.emailIndex = "";
    },
    removePendingEmailChange: function () {
      world.pendingEmailChange = false;
    },
    removeVerificationRecords: function () {
      world.verification = false;
    },
    removePasswordResetRecords: function () {
      world.passwordReset = false;
    },
    removeSupportRecovery: function () {
      world.supportRecovery = false;
    },
    removeAccountSettings: function () {
      world.settings = false;
    },
    removeInviteBindings: function () {
      world.inviteBindings = false;
    },
    revokeSessions: function () {
      world.sessions = 0;
    },
    disconnectSockets: function () {
      world.sockets = 0;
    },
    deleteNakamaAccount: function () {
      world.nakamaDeleted = true;
    },
    sendDeletedEmail: function (email) {
      world.emails.push(email);
    },
  };
}

function startJob(world: MemoryWorld): AccountDeletionJob {
  const job = emptyDeletionJob({
    deletionJobId: "job-1",
    accountUserId: "user-old",
    idempotencyKey: "idem-1",
    statusToken: "status-1",
    emailHeld: "player@example.com",
    emailLookupHash: "abc123",
    nowMs: world.nowMs,
  });
  world.job = job;
  return job;
}

function assertComplete(world: MemoryWorld): void {
  assert.equal(world.status, ACCOUNT_STATUS_DELETING);
  assert.equal(world.challenges, 0);
  assert.equal(world.trades, 0);
  assert.equal(world.itemLocks, 0);
  assert.equal(world.parties, 0);
  assert.equal(world.caves, 0);
  assert.equal(world.transfers, 0);
  assert.equal(world.selection, false);
  assert.equal(world.lease, false);
  assert.deepEqual(world.purged, ["char-live", "char-deleted"]);
  assert.equal(world.gold, 0);
  assert.equal(world.emailIndex, "");
  assert.equal(world.pendingEmailChange, false);
  assert.equal(world.verification, false);
  assert.equal(world.passwordReset, false);
  assert.equal(world.supportRecovery, false);
  assert.equal(world.settings, false);
  assert.equal(world.inviteBindings, false);
  assert.equal(world.sessions, 0);
  assert.equal(world.sockets, 0);
  assert.equal(world.nakamaDeleted, true);
  assert.deepEqual(world.emails, ["player@example.com"]);
  assert.ok(world.job !== null);
  assert.equal(world.job.emailHeld, "");
  assert.equal(accountDeletionCompleted(world.job), true);
  const tombstone = deletionTombstoneValue(world.job);
  assert.equal(tombstone.emailHeld, "");
  assert.equal(tombstone.accountUserId, "user-old");
}

test("delete fence rejects live lease, link-dead, trade, transfer, and a second job", () => {
  const nowMs = 1_000_000;
  const online = acquireGameplayLease({
    accountUserId: "user-old",
    characterId: "char-live",
    matchId: "match-1",
    nowMs: nowMs,
  });
  assert.equal(leaseBlocksAccountDeletion(online, nowMs), true);
  const linkDead = markLeaseLinkDead(online, nowMs);
  assert.equal(leaseBlocksAccountDeletion(linkDead, nowMs), true);
  assert.equal(leaseBlocksAccountDeletion(linkDead, nowMs + 11_000), false);
  assert.equal(leaseBlocksAccountDeletion(null, nowMs), false);

  const base = {
    accountStatus: ACCOUNT_STATUS_ACTIVE,
    liveLease: false,
    liveTrade: false,
    inFlightTransfer: false,
    deletionJob: null,
    idempotencyKey: "idem-1",
  };
  assert.equal(evaluateAccountDeleteFence({ ...base, liveLease: true }).ok, false);
  assert.equal((evaluateAccountDeleteFence({ ...base, liveLease: true }) as { code: string }).code, AUTH_ACCOUNT_BUSY);
  assert.equal((evaluateAccountDeleteFence({ ...base, liveTrade: true }) as { code: string }).code, AUTH_ACCOUNT_TRADING);
  assert.equal(
    (evaluateAccountDeleteFence({ ...base, inFlightTransfer: true }) as { code: string }).code,
    AUTH_ACCOUNT_TRANSFERRING,
  );
  const job = emptyDeletionJob({
    deletionJobId: "job-1",
    accountUserId: "user-old",
    idempotencyKey: "idem-1",
    statusToken: "t",
    emailHeld: "a@b.c",
    emailLookupHash: "h",
    nowMs: nowMs,
  });
  const resume = evaluateAccountDeleteFence({ ...base, deletionJob: job, idempotencyKey: "idem-1" });
  assert.equal(resume.ok, true);
  if (resume.ok) {
    assert.equal(resume.resume, true);
  }
  assert.equal((evaluateAccountDeleteFence({ ...base, deletionJob: job, idempotencyKey: "idem-2" }) as { code: string }).code, AUTH_DELETE_ACTIVE);
});

test("delete confirm requires password, live code, and the exact phrase", () => {
  assert.equal(evaluateAccountDeleteConfirm({ phrase: ACCOUNT_DELETE_PHRASE, passwordOk: false, codeOk: true, codeExpired: false, codeLocked: false }).ok, false);
  assert.equal(evaluateAccountDeleteConfirm({ phrase: ACCOUNT_DELETE_PHRASE, passwordOk: true, codeOk: false, codeExpired: false, codeLocked: false }).ok, false);
  assert.equal(
    (evaluateAccountDeleteConfirm({
      phrase: ACCOUNT_DELETE_PHRASE,
      passwordOk: true,
      codeOk: false,
      codeExpired: true,
      codeLocked: false,
    }) as { code: string }).code,
    "challenge_expired",
  );
  assert.equal(
    (evaluateAccountDeleteConfirm({
      phrase: "delete account",
      passwordOk: true,
      codeOk: true,
      codeExpired: false,
      codeLocked: false,
    }) as { code: string }).code,
    AUTH_DELETE_PHRASE,
  );
  assert.equal(
    evaluateAccountDeleteConfirm({
      phrase: ACCOUNT_DELETE_PHRASE,
      passwordOk: true,
      codeOk: true,
      codeExpired: false,
      codeLocked: false,
    }).ok,
    true,
  );
});

test("deletion saga completes and does not keep raw email on the tombstone", () => {
  const world = seedWorld();
  const job = startJob(world);
  const finished = runAccountDeletionSaga({ job: job, deps: memoryDeps(world) });
  world.job = finished;
  assertComplete(world);
});

test("duplicate confirm resumes without restoring deleted data", () => {
  const world = seedWorld();
  const first = runAccountDeletionSaga({ job: startJob(world), deps: memoryDeps(world) });
  world.characters = ["char-new"];
  world.gold = 99;
  world.restored = true;
  const second = runAccountDeletionSaga({ job: first, deps: memoryDeps(world) });
  assert.equal(accountDeletionCompleted(second), true);
  assert.deepEqual(world.purged, ["char-live", "char-deleted"]);
  assert.equal(world.gold, 99);
  assert.equal(world.emails.length, 1);
});

test("partial-failure recovery after each phase converges to one deletion", () => {
  for (let i = 0; i < ACCOUNT_DELETION_PHASES.length; i++) {
    const stopAfter = ACCOUNT_DELETION_PHASES[i];
    const world = seedWorld();
    const interrupted = runAccountDeletionSaga({
      job: startJob(world),
      deps: memoryDeps(world),
      stopAfter: stopAfter,
    });
    assert.equal(nextDeletionPhase(interrupted) === null, stopAfter === "complete");
    const finished = runAccountDeletionSaga({ job: interrupted, deps: memoryDeps(world) });
    world.job = finished;
    assertComplete(world);
    assert.equal(world.emails.length, 1);
  }
});

test("backup replay uses the original user id and ignores a later email reuse", () => {
  const world = seedWorld();
  const finished = runAccountDeletionSaga({ job: startJob(world), deps: memoryDeps(world) });
  const tombstone = finished;
  assert.equal(shouldReplayDeletion(tombstone, "user-old"), true);
  assert.equal(shouldReplayDeletion(tombstone, "user-new"), false);
  const replayWorld = seedWorld();
  replayWorld.characters = ["char-replacement"];
  replayWorld.gold = 12;
  replayWorld.emailIndex = "user-new";
  const skipped = shouldReplayDeletion(tombstone, "user-new");
  assert.equal(skipped, false);
  assert.equal(replayWorld.emailIndex, "user-new");
  assert.deepEqual(replayWorld.characters, ["char-replacement"]);
  const restoredOld = seedWorld();
  restoredOld.job = tombstone;
  runAccountDeletionSaga({ job: tombstone, deps: memoryDeps(restoredOld) });
  assert.equal(restoredOld.nakamaDeleted, true);
});

test("stale email index hits are ignored after the profile is gone", () => {
  const decision = decideEmailLookup([{ hmac: "abc123", userId: "user-old" }], null, "abc123");
  assert.equal(decision.ok, false);
  if (!decision.ok) {
    assert.equal(decision.reason, "stale");
  }
  const replacement = decideEmailLookup(
    [{ hmac: "abc123", userId: "user-new" }],
    { hmac: "abc123", userId: "user-new" },
    "abc123",
  );
  assert.equal(replacement.ok, true);
  if (replacement.ok) {
    assert.equal(replacement.userId, "user-new");
  }
  const mixed = decideEmailLookupWithRereads(
    [
      { hmac: "abc123", userId: "user-old" },
      { hmac: "abc123", userId: "user-new" },
    ],
    {
      "user-old": null,
      "user-new": { hmac: "abc123", userId: "user-new" },
    },
    "abc123",
  );
  assert.equal(mixed.ok, true);
  if (mixed.ok) {
    assert.equal(mixed.userId, "user-new");
  }
});

test("each deletion phase is recorded independently", () => {
  const world = seedWorld();
  let job = startJob(world);
  const seen: AccountDeletionPhase[] = [];
  for (let i = 0; i < ACCOUNT_DELETION_PHASES.length; i++) {
    job = runAccountDeletionSaga({ job: job, deps: memoryDeps(world), stopAfter: ACCOUNT_DELETION_PHASES[i] });
    seen.push(ACCOUNT_DELETION_PHASES[i]);
    assert.deepEqual(job.completedPhases, seen);
  }
});
