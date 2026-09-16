import { SAVE_SCHEMA_VERSION } from "./save_schema";
import {
  ACCOUNT_STATUS_ACTIVE,
  ACCOUNT_STATUS_DELETED,
  ACCOUNT_STATUS_DELETING,
  ACCOUNT_STATUS_DISABLED,
  ACCOUNT_STATUS_PENDING_VERIFICATION,
  type AccountStatus,
} from "./account_status";
import { liveGameplayLease, type GameplayLease } from "./gameplay_lease";

export const ACCOUNT_DELETION_COLLECTION = "account_deletion";
export const ACCOUNT_DELETION_KEY = "d";
export const ACCOUNT_DELETION_PERMISSION_READ: 0 = 0;
export const ACCOUNT_DELETION_PERMISSION_WRITE: 0 = 0;
export const ACCOUNT_DELETION_SCHEMA_VERSION = 1;
export const ACCOUNT_DELETE_PHRASE = "DELETE ACCOUNT";
export const ACCOUNT_DELETION_CONFIRM_TTL_MS = 15 * 60 * 1000;

export const ACCOUNT_DELETION_PHASES = [
  "freeze",
  "cancel_transient",
  "remove_game_data",
  "remove_account_indexes",
  "revoke_sessions",
  "delete_nakama",
  "complete",
] as const;

export type AccountDeletionPhase = (typeof ACCOUNT_DELETION_PHASES)[number];

export const AUTH_ACCOUNT_BUSY = "account_busy";
export const AUTH_ACCOUNT_TRADING = "account_trading";
export const AUTH_ACCOUNT_TRANSFERRING = "account_transferring";
export const AUTH_DELETE_ACTIVE = "delete_already_active";
export const AUTH_DELETE_PHRASE = "delete_phrase";
export const AUTH_DELETE_PASSWORD = "invalid_credentials";
export const AUTH_CHALLENGE_EXPIRED = "challenge_expired";
export const AUTH_INVALID_CHALLENGE = "invalid_challenge";
export const AUTH_CHALLENGE_LOCKED = "challenge_locked";

export interface AccountDeletionJob {
  schemaVersion: number;
  deletionJobId: string;
  accountUserId: string;
  idempotencyKey: string;
  statusToken: string;
  emailHeld: string;
  emailLookupHash: string;
  completedPhases: string[];
  createdAt: number;
  updatedAt: number;
  completedAt: number;
}

export interface AccountDeletionFenceInput {
  accountStatus: string;
  liveLease: boolean;
  liveTrade: boolean;
  inFlightTransfer: boolean;
  deletionJob: AccountDeletionJob | null;
  idempotencyKey: string;
}

export type AccountDeletionFenceResult =
  | { ok: true; resume: boolean }
  | { ok: false; code: string };

export interface AccountDeletionConfirmInput {
  phrase: string;
  passwordOk: boolean;
  codeOk: boolean;
  codeExpired: boolean;
  codeLocked: boolean;
}

export interface AccountDeletionDeps {
  nowMs: () => number;
  readJob: (accountUserId: string) => AccountDeletionJob | null;
  writeJob: (job: AccountDeletionJob) => void;
  writeAccountStatus: (userId: string, status: AccountStatus) => void;
  invalidateChallenges: (userId: string) => void;
  cancelTrades: (userId: string) => void;
  leaveParties: (userId: string) => void;
  clearCaves: (userId: string) => void;
  clearTransfers: (userId: string) => void;
  clearSelection: (userId: string) => void;
  clearLease: (userId: string) => void;
  listCharacterIds: (userId: string) => string[];
  purgeCharacter: (userId: string, characterId: string) => void;
  wipeGold: (userId: string) => void;
  removeEmailIndex: (userId: string) => void;
  removePendingEmailChange: (userId: string) => void;
  removeVerificationRecords: (userId: string) => void;
  removePasswordResetRecords: (userId: string) => void;
  removeSupportRecovery: (userId: string) => void;
  removeAccountSettings: (userId: string) => void;
  removeInviteBindings: (userId: string) => void;
  revokeSessions: (userId: string) => void;
  disconnectSockets: (userId: string) => void;
  deleteNakamaAccount: (userId: string) => void;
  sendDeletedEmail: (email: string, jobId: string) => void;
}

export function emptyDeletionJob(input: {
  deletionJobId: string;
  accountUserId: string;
  idempotencyKey: string;
  statusToken: string;
  emailHeld: string;
  emailLookupHash: string;
  nowMs: number;
}): AccountDeletionJob {
  return {
    schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
    deletionJobId: input.deletionJobId,
    accountUserId: input.accountUserId,
    idempotencyKey: input.idempotencyKey,
    statusToken: input.statusToken,
    emailHeld: input.emailHeld,
    emailLookupHash: input.emailLookupHash,
    completedPhases: [],
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
    completedAt: 0,
  };
}

export function deletionJobFromStorage(value: { [key: string]: unknown } | null | undefined): AccountDeletionJob | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  if (typeof value.deletionJobId !== "string" || typeof value.accountUserId !== "string") {
    return null;
  }
  const completed: string[] = [];
  if (Array.isArray(value.completedPhases)) {
    for (let i = 0; i < value.completedPhases.length; i++) {
      if (typeof value.completedPhases[i] === "string") {
        completed.push(value.completedPhases[i] as string);
      }
    }
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : SAVE_SCHEMA_VERSION,
    deletionJobId: value.deletionJobId,
    accountUserId: value.accountUserId,
    idempotencyKey: typeof value.idempotencyKey === "string" ? value.idempotencyKey : "",
    statusToken: typeof value.statusToken === "string" ? value.statusToken : "",
    emailHeld: typeof value.emailHeld === "string" ? value.emailHeld : "",
    emailLookupHash: typeof value.emailLookupHash === "string" ? value.emailLookupHash : "",
    completedPhases: completed,
    createdAt: typeof value.createdAt === "number" ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    completedAt: typeof value.completedAt === "number" ? value.completedAt : 0,
  };
}

export function deletionTombstoneValue(job: AccountDeletionJob): { [key: string]: unknown } {
  return {
    schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
    deletionJobId: job.deletionJobId,
    accountUserId: job.accountUserId,
    idempotencyKey: job.idempotencyKey,
    statusToken: job.statusToken,
    emailHeld: "",
    emailLookupHash: job.emailLookupHash,
    completedPhases: job.completedPhases.slice(),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

export function isDeletionPhase(value: string): value is AccountDeletionPhase {
  return ACCOUNT_DELETION_PHASES.indexOf(value as AccountDeletionPhase) !== -1;
}

export function isPhaseComplete(job: AccountDeletionJob, phase: AccountDeletionPhase): boolean {
  return job.completedPhases.indexOf(phase) !== -1;
}

export function withCompletedPhase(job: AccountDeletionJob, phase: AccountDeletionPhase, nowMs: number): AccountDeletionJob {
  const completed = job.completedPhases.slice();
  if (completed.indexOf(phase) === -1) {
    completed.push(phase);
  }
  return {
    schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
    deletionJobId: job.deletionJobId,
    accountUserId: job.accountUserId,
    idempotencyKey: job.idempotencyKey,
    statusToken: job.statusToken,
    emailHeld: phase === "complete" ? "" : job.emailHeld,
    emailLookupHash: job.emailLookupHash,
    completedPhases: completed,
    createdAt: job.createdAt,
    updatedAt: nowMs,
    completedAt: phase === "complete" ? nowMs : job.completedAt,
  };
}

export function nextDeletionPhase(job: AccountDeletionJob): AccountDeletionPhase | null {
  for (let i = 0; i < ACCOUNT_DELETION_PHASES.length; i++) {
    if (!isPhaseComplete(job, ACCOUNT_DELETION_PHASES[i])) {
      return ACCOUNT_DELETION_PHASES[i];
    }
  }
  return null;
}

export function accountDeletionCompleted(job: AccountDeletionJob): boolean {
  return job.completedAt > 0 && nextDeletionPhase(job) === null;
}

export function leaseBlocksAccountDeletion(lease: GameplayLease | null, nowMs: number): boolean {
  if (lease === null) {
    return false;
  }
  if (lease.state === "DESPAWNING") {
    return true;
  }
  return liveGameplayLease(lease, nowMs) !== null;
}

export function evaluateAccountDeleteFence(input: AccountDeletionFenceInput): AccountDeletionFenceResult {
  if (input.idempotencyKey.length === 0) {
    return { ok: false, code: "invalid_payload" };
  }
  if (input.deletionJob !== null) {
    if (input.deletionJob.idempotencyKey === input.idempotencyKey) {
      return { ok: true, resume: true };
    }
    return { ok: false, code: AUTH_DELETE_ACTIVE };
  }
  if (
    input.accountStatus === ACCOUNT_STATUS_DELETING ||
    input.accountStatus === ACCOUNT_STATUS_DELETED ||
    input.accountStatus === ACCOUNT_STATUS_DISABLED ||
    input.accountStatus === ACCOUNT_STATUS_PENDING_VERIFICATION
  ) {
    return { ok: false, code: input.accountStatus === ACCOUNT_STATUS_DISABLED ? "account_disabled" : "account_deleting" };
  }
  if (input.accountStatus !== ACCOUNT_STATUS_ACTIVE) {
    return { ok: false, code: "account_deleting" };
  }
  if (input.liveLease) {
    return { ok: false, code: AUTH_ACCOUNT_BUSY };
  }
  if (input.liveTrade) {
    return { ok: false, code: AUTH_ACCOUNT_TRADING };
  }
  if (input.inFlightTransfer) {
    return { ok: false, code: AUTH_ACCOUNT_TRANSFERRING };
  }
  return { ok: true, resume: false };
}

export function evaluateAccountDeleteConfirm(input: AccountDeletionConfirmInput): AccountDeletionFenceResult {
  if (!input.passwordOk) {
    return { ok: false, code: AUTH_DELETE_PASSWORD };
  }
  if (input.codeLocked) {
    return { ok: false, code: AUTH_CHALLENGE_LOCKED };
  }
  if (input.codeExpired) {
    return { ok: false, code: AUTH_CHALLENGE_EXPIRED };
  }
  if (!input.codeOk) {
    return { ok: false, code: AUTH_INVALID_CHALLENGE };
  }
  if (input.phrase !== ACCOUNT_DELETE_PHRASE) {
    return { ok: false, code: AUTH_DELETE_PHRASE };
  }
  return { ok: true, resume: false };
}

export function shouldReplayDeletion(tombstone: AccountDeletionJob | null, restoredUserId: string): boolean {
  if (tombstone === null || restoredUserId.length === 0) {
    return false;
  }
  return tombstone.accountUserId === restoredUserId;
}

export function runAccountDeletionSaga(input: {
  job: AccountDeletionJob;
  deps: AccountDeletionDeps;
  stopAfter?: AccountDeletionPhase;
}): AccountDeletionJob {
  let job = input.job;
  if (accountDeletionCompleted(job)) {
    input.deps.deleteNakamaAccount(job.accountUserId);
    return job;
  }
  for (let i = 0; i < ACCOUNT_DELETION_PHASES.length; i++) {
    const phase = ACCOUNT_DELETION_PHASES[i];
    if (isPhaseComplete(job, phase)) {
      continue;
    }
    runDeletionPhase(phase, job, input.deps);
    job = withCompletedPhase(job, phase, input.deps.nowMs());
    input.deps.writeJob(job);
    if (input.stopAfter === phase) {
      return job;
    }
  }
  return job;
}

function runDeletionPhase(phase: AccountDeletionPhase, job: AccountDeletionJob, deps: AccountDeletionDeps): void {
  const userId = job.accountUserId;
  if (phase === "freeze") {
    deps.writeAccountStatus(userId, ACCOUNT_STATUS_DELETING);
    deps.invalidateChallenges(userId);
    return;
  }
  if (phase === "cancel_transient") {
    deps.cancelTrades(userId);
    deps.leaveParties(userId);
    deps.clearCaves(userId);
    deps.clearTransfers(userId);
    deps.clearSelection(userId);
    deps.clearLease(userId);
    return;
  }
  if (phase === "remove_game_data") {
    const ids = deps.listCharacterIds(userId);
    for (let i = 0; i < ids.length; i++) {
      deps.purgeCharacter(userId, ids[i]);
    }
    deps.wipeGold(userId);
    return;
  }
  if (phase === "remove_account_indexes") {
    deps.removePendingEmailChange(userId);
    deps.removeVerificationRecords(userId);
    deps.removePasswordResetRecords(userId);
    deps.removeSupportRecovery(userId);
    deps.removeAccountSettings(userId);
    deps.removeInviteBindings(userId);
    deps.removeEmailIndex(userId);
    return;
  }
  if (phase === "revoke_sessions") {
    deps.revokeSessions(userId);
    deps.disconnectSockets(userId);
    return;
  }
  if (phase === "delete_nakama") {
    deps.deleteNakamaAccount(userId);
    return;
  }
  const email = job.emailHeld;
  if (email.length > 0) {
    deps.sendDeletedEmail(email, job.deletionJobId);
  }
}
