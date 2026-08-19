import {
  GATEWAY_ASSERTION_NONCE_MAX,
  isGatewayHttpInvocation,
  parseGatewayAssertion,
  verifyGatewayAssertion,
} from "../domain/gateway_assertion";
import { constantTimeEqual } from "../domain/hmac";
import {
  consumeAuthChallenge,
  createAuthChallenge,
  invalidateAuthChallenge,
  isAuthChallengePurpose,
  type AuthChallengePurpose,
  type AuthChallengeRecord,
} from "../domain/auth_challenge";
import { listAuthChallengesByHash, readAuthChallenge, writeAuthChallenge } from "../nakama/auth_challenge_store";
import { deleteAccountProfile, lookupAccountProfileByHmac, readAccountProfile, writeAccountProfile } from "../nakama/account_profile_store";
import { ACCOUNT_STATUS_ACTIVE, ACCOUNT_STATUS_PENDING_VERIFICATION } from "../domain/account_status";
import { evaluateUnverifiedCleanup, DEFAULT_UNVERIFIED_RETENTION_MS } from "../domain/unverified_cleanup";
import { rpcFailurePayload } from "../domain/rpc_error";
import { isDeleted } from "../domain/character_roster";
import { readRoster } from "../nakama/roster_store";
import { readCharacter } from "../nakama/character_store";
import { readActiveLocation } from "../nakama/location_store";

export const AUTH_GATEWAY_RPC_ID = "auth_gateway";

const AUTH_GATEWAY_OPS = [
  "ping",
  "put_email_index",
  "lookup_email",
  "get_profile",
  "mark_verified",
  "purge_unverified",
  "challenge_put",
  "challenge_get",
  "challenge_find",
  "challenge_consume",
  "replace_password",
  "replace_email",
  "delete_account",
] as const;

type AuthGatewayOp = (typeof AUTH_GATEWAY_OPS)[number];

const ALLOWED_KEYS = [
  "assertion",
  "op",
  "hmac",
  "user_id",
  "verified_at",
  "challenge_id",
  "secret_hash",
  "purpose",
  "password",
  "account_user_id",
  "request_id",
  "ttl_ms",
  "new_email",
  "status",
  "terms_version",
  "privacy_version",
  "created_at",
  "accepted_at",
  "retention_ms",
];

interface NonceEntry {
  expiresAt: number;
}

function createNonceEngine(): {
  seen(nonce: string, nowMs: number): boolean;
  remember(nonce: string, nowMs: number): void;
} {
  let cache: { [nonce: string]: NonceEntry } = {};

  function prune(nowMs: number): { [nonce: string]: NonceEntry } {
    const next: { [nonce: string]: NonceEntry } = {};
    const keys = Object.keys(cache);
    for (let i = 0; i < keys.length; i++) {
      if (cache[keys[i]].expiresAt > nowMs) {
        next[keys[i]] = { expiresAt: cache[keys[i]].expiresAt };
      }
    }
    return next;
  }

  return {
    seen: function (nonce: string, nowMs: number): boolean {
      cache = prune(nowMs);
      return cache[nonce] !== undefined;
    },
    remember: function (nonce: string, nowMs: number): void {
      const next = prune(nowMs);
      const keys = Object.keys(next);
      if (keys.length >= GATEWAY_ASSERTION_NONCE_MAX) {
        return;
      }
      next[nonce] = { expiresAt: nowMs + 120000 };
      cache = next;
    },
  };
}

const nonceEngine = createNonceEngine();

interface ParsedRequest {
  assertion: ReturnType<typeof parseGatewayAssertion>;
  op: AuthGatewayOp;
  hmac: string;
  userId: string;
  verifiedAt: number;
  challengeId: string;
  secretHash: string;
  purpose: string;
  password: string;
  newEmail: string;
  accountUserId: string;
  requestId: string;
  ttlMs: number;
  status: string;
  termsVersion: string;
  privacyVersion: string;
  createdAt: number;
  acceptedAt: number;
  retentionMs: number;
  payloadJson: string;
}

function runtimeHmacHex(nk: nkruntime.Nakama, key: string, message: string): string {
  const digest = nk.hmacSha256Hash(message, key);
  return nk.base16Encode(digest).toLowerCase();
}

function parseRequest(payload: string): ParsedRequest {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    throw new Error("malformed_json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("malformed_json");
  }
  const data = parsed as { [key: string]: unknown };
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (ALLOWED_KEYS.indexOf(keys[i]) === -1) {
      throw new Error("unknown_field:" + keys[i]);
    }
  }
  if (typeof data.op !== "string" || AUTH_GATEWAY_OPS.indexOf(data.op as AuthGatewayOp) === -1) {
    throw new Error("invalid_payload");
  }
  const assertion = parseGatewayAssertion(data.assertion);
  const body: { [key: string]: unknown } = {};
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== "assertion") {
      body[keys[i]] = data[keys[i]];
    }
  }
  return {
    assertion: assertion,
    op: data.op as AuthGatewayOp,
    hmac: typeof data.hmac === "string" ? data.hmac : "",
    userId: typeof data.user_id === "string" ? data.user_id : "",
    verifiedAt: typeof data.verified_at === "number" ? data.verified_at : 0,
    challengeId: typeof data.challenge_id === "string" ? data.challenge_id : "",
    secretHash: typeof data.secret_hash === "string" ? data.secret_hash.toLowerCase() : "",
    purpose: typeof data.purpose === "string" ? data.purpose : "",
    password: typeof data.password === "string" ? data.password : "",
    newEmail: typeof data.new_email === "string" ? data.new_email : "",
    accountUserId: typeof data.account_user_id === "string" ? data.account_user_id : "",
    requestId: typeof data.request_id === "string" ? data.request_id : "",
    ttlMs: typeof data.ttl_ms === "number" ? data.ttl_ms : 0,
    status: typeof data.status === "string" ? data.status : "",
    termsVersion: typeof data.terms_version === "string" ? data.terms_version : "",
    privacyVersion: typeof data.privacy_version === "string" ? data.privacy_version : "",
    createdAt: typeof data.created_at === "number" ? data.created_at : 0,
    acceptedAt: typeof data.accepted_at === "number" ? data.accepted_at : 0,
    retentionMs: typeof data.retention_ms === "number" ? data.retention_ms : 0,
    payloadJson: JSON.stringify(body),
  };
}

function requireSecret(env: { [key: string]: string } | undefined): string {
  if (env === undefined) {
    return "";
  }
  const value = env["VIBECODE_GATEWAY_HMAC_SECRET"];
  return typeof value === "string" ? value : "";
}

function dispatch(nk: nkruntime.Nakama, request: ParsedRequest, nowMs: number): { [key: string]: unknown } {
  if (request.op === "ping") {
    return { ok: true, op: request.op };
  }
  if (request.op === "put_email_index") {
    if (request.userId.length === 0 || request.hmac.length === 0) {
      throw new Error("invalid_payload");
    }
    const existing = readAccountProfile(nk, request.userId);
    if (existing !== null && existing.hmac !== request.hmac) {
      throw new Error("invalid_payload");
    }
    const extras: {
      status?: typeof ACCOUNT_STATUS_PENDING_VERIFICATION;
      createdAt?: number;
      acceptedTermsVersion?: string;
      acceptedPrivacyVersion?: string;
      acceptedAt?: number;
    } = {};
    if (existing === null) {
      extras.status = ACCOUNT_STATUS_PENDING_VERIFICATION;
      extras.createdAt = request.createdAt > 0 ? request.createdAt : nowMs;
      extras.acceptedTermsVersion = request.termsVersion;
      extras.acceptedPrivacyVersion = request.privacyVersion;
      extras.acceptedAt = request.acceptedAt > 0 ? request.acceptedAt : nowMs;
    }
    const verifiedAt = existing !== null ? existing.verifiedAt : 0;
    const record = writeAccountProfile(nk, request.userId, request.hmac, verifiedAt, extras);
    return { ok: true, op: request.op, userId: record.userId, status: record.status, createdAt: record.createdAt };
  }
  if (request.op === "lookup_email") {
    if (request.hmac.length === 0) {
      throw new Error("invalid_payload");
    }
    const result = lookupAccountProfileByHmac(nk, request.hmac);
    const profile =
      result.decision.ok && typeof result.decision.userId === "string" ? readAccountProfile(nk, result.decision.userId) : null;
    return {
      ok: result.decision.ok,
      op: request.op,
      decision: result.decision,
      profile:
        profile === null
          ? null
          : {
              userId: profile.userId,
              status: profile.status,
              verifiedAt: profile.verifiedAt,
              createdAt: profile.createdAt,
            },
    };
  }
  if (request.op === "get_profile") {
    if (request.userId.length === 0) {
      throw new Error("invalid_payload");
    }
    const profile = readAccountProfile(nk, request.userId);
    if (profile === null) {
      return { ok: false, op: request.op, reason: "missing" };
    }
    let disableTime = 0;
    try {
      const account = nk.accountGetId(request.userId);
      disableTime = typeof account.disableTime === "number" ? account.disableTime : 0;
    } catch {
      disableTime = 0;
    }
    return {
      ok: true,
      op: request.op,
      userId: profile.userId,
      status: profile.status,
      verifiedAt: profile.verifiedAt,
      createdAt: profile.createdAt,
      disableTime: disableTime,
    };
  }
  if (request.op === "mark_verified") {
    if (request.userId.length === 0) {
      throw new Error("invalid_payload");
    }
    const existing = readAccountProfile(nk, request.userId);
    if (existing === null) {
      throw new Error("profile_missing");
    }
    const verifiedAt = existing.verifiedAt > 0 ? existing.verifiedAt : nowMs;
    writeAccountProfile(nk, request.userId, existing.hmac, verifiedAt, { status: ACCOUNT_STATUS_ACTIVE });
    const siblings = listAuthChallengesByHash(nk, existing.hmac, "EMAIL_VERIFICATION");
    for (let i = 0; i < siblings.length; i++) {
      writeAuthChallenge(nk, invalidateAuthChallenge(siblings[i], nowMs));
    }
    let email = "";
    try {
      const account = nk.accountGetId(request.userId);
      email = typeof account.email === "string" ? account.email : "";
    } catch {
      email = "";
    }
    return { ok: true, op: request.op, userId: request.userId, verifiedAt: verifiedAt, status: ACCOUNT_STATUS_ACTIVE, email: email };
  }
  if (request.op === "purge_unverified") {
    const userId = request.userId.length > 0 ? request.userId : lookupUserId(nk, request.hmac);
    if (userId.length === 0) {
      return { ok: true, op: request.op, purged: false, reason: "missing", idempotent: true };
    }
    return purgeUnverifiedAccount(nk, userId, nowMs, request.retentionMs);
  }
  if (request.op === "challenge_put") {
    if (
      request.challengeId.length === 0 ||
      request.hmac.length === 0 ||
      request.secretHash.length !== 64 ||
      !isAuthChallengePurpose(request.purpose)
    ) {
      throw new Error("invalid_payload");
    }
    const purpose = request.purpose as AuthChallengePurpose;
    const siblings = listAuthChallengesByHash(nk, request.hmac, purpose);
    for (let i = 0; i < siblings.length; i++) {
      writeAuthChallenge(nk, invalidateAuthChallenge(siblings[i], nowMs));
    }
    const record = createAuthChallenge({
      challengeId: request.challengeId,
      accountUserId: request.accountUserId,
      emailLookupHash: request.hmac,
      purpose: purpose,
      secretHash: request.secretHash,
      requestId: request.requestId,
      nowMs: nowMs,
      ttlMs: request.ttlMs > 0 ? request.ttlMs : undefined,
    });
    writeAuthChallenge(nk, record);
    return { ok: true, op: request.op, challenge_id: record.challenge_id, expires_at: record.expires_at };
  }
  if (request.op === "challenge_get") {
    if (request.challengeId.length === 0) {
      throw new Error("invalid_payload");
    }
    const record = readAuthChallenge(nk, request.challengeId);
    return { ok: record !== null, op: request.op, record: redactChallenge(record) };
  }
  if (request.op === "challenge_find") {
    if (request.hmac.length === 0 || !isAuthChallengePurpose(request.purpose)) {
      throw new Error("invalid_payload");
    }
    const records = listAuthChallengesByHash(nk, request.hmac, request.purpose as AuthChallengePurpose);
    const open = firstOpenChallenge(records, nowMs);
    return {
      ok: open !== null,
      op: request.op,
      challenge_id: open !== null ? open.challenge_id : "",
      expires_at: open !== null ? open.expires_at : 0,
    };
  }
  if (request.op === "challenge_consume") {
    if (request.challengeId.length === 0 || request.secretHash.length !== 64 || !isAuthChallengePurpose(request.purpose)) {
      throw new Error("invalid_payload");
    }
    const existing = readAuthChallenge(nk, request.challengeId);
    if (request.hmac.length > 0 && existing !== null && existing.email_lookup_hash !== request.hmac) {
      return { ok: false, op: request.op, reason: "wrong_code" };
    }
    const result = consumeAuthChallenge({
      record: existing,
      secretHash: request.secretHash,
      purpose: request.purpose as AuthChallengePurpose,
      nowMs: nowMs,
    });
    if (result.record !== null) {
      writeAuthChallenge(nk, result.record);
    }
    if (!result.ok) {
      return { ok: false, op: request.op, reason: result.reason };
    }
    return {
      ok: true,
      op: request.op,
      idempotent: result.idempotent,
      account_user_id: result.record.account_user_id,
      challenge_id: result.record.challenge_id,
    };
  }
  if (request.op === "replace_password") {
    if (request.userId.length === 0 || request.password.length === 0) {
      throw new Error("invalid_payload");
    }
    const account = nk.accountGetId(request.userId);
    if (typeof account.email !== "string" || account.email.length === 0) {
      throw new Error("email_missing");
    }
    nk.linkEmail(request.userId, account.email, request.password);
    return { ok: true, op: request.op, userId: request.userId, email: account.email };
  }
  if (request.op === "replace_email") {
    if (request.userId.length === 0 || request.password.length === 0 || request.newEmail.length === 0) {
      throw new Error("invalid_payload");
    }
    return replaceEmail(nk, request.userId, request.newEmail, request.password);
  }
  if (request.op === "delete_account") {
    if (request.userId.length === 0) {
      throw new Error("invalid_payload");
    }
    const deleted = nk.accountGetId(request.userId);
    const deletedEmail = typeof deleted.email === "string" ? deleted.email : "";
    nk.accountDeleteId(request.userId, true);
    return { ok: true, op: request.op, userId: request.userId, recorded: true, email: deletedEmail };
  }
  throw new Error("invalid_payload");
}

function replaceEmail(
  nk: nkruntime.Nakama,
  userId: string,
  newEmail: string,
  password: string,
): { [key: string]: unknown } {
  const account = nk.accountGetId(userId);
  const oldEmail = typeof account.email === "string" ? account.email : "";
  if (oldEmail.length === 0) {
    throw new Error("email_missing");
  }
  const deviceId = "gw" + nk.uuidv4().split("-").join("");
  nk.linkDevice(userId, deviceId);
  let keepDevice = false;
  try {
    nk.unlinkEmail(userId, oldEmail);
    try {
      nk.linkEmail(userId, newEmail, password);
    } catch (error) {
      try {
        nk.linkEmail(userId, oldEmail, password);
      } catch {
        keepDevice = true;
      }
      throw error;
    }
  } finally {
    if (!keepDevice) {
      nk.unlinkDevice(userId, deviceId);
    }
  }
  return { ok: true, op: "replace_email", userId: userId, email: newEmail };
}

function firstOpenChallenge(records: AuthChallengeRecord[], nowMs: number): AuthChallengeRecord | null {
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.consumed_at > 0 || record.invalidated_at > 0 || record.expires_at <= nowMs) {
      continue;
    }
    return record;
  }
  return null;
}

function lookupUserId(nk: nkruntime.Nakama, hmac: string): string {
  if (hmac.length === 0) {
    return "";
  }
  const result = lookupAccountProfileByHmac(nk, hmac);
  return result.decision.ok && typeof result.decision.userId === "string" ? result.decision.userId : "";
}

function purgeUnverifiedAccount(
  nk: nkruntime.Nakama,
  userId: string,
  nowMs: number,
  retentionMs: number,
): { [key: string]: unknown } {
  const profile = readAccountProfile(nk, userId);
  if (profile === null) {
    try {
      nk.accountGetId(userId);
    } catch {
      return { ok: true, op: "purge_unverified", purged: false, reason: "missing", idempotent: true };
    }
    return { ok: true, op: "purge_unverified", purged: false, reason: "missing_profile", idempotent: true };
  }
  const roster = readRoster(nk, userId);
  let live = 0;
  let hasSession = false;
  if (roster !== null) {
    for (let i = 0; i < roster.characterIds.length; i++) {
      const character = readCharacter(nk, userId, roster.characterIds[i]);
      if (character === null || isDeleted(character.deletedAt)) {
        continue;
      }
      live += 1;
      const location = readActiveLocation(nk, userId, character.characterId);
      if (location !== null && location.matchId.length > 0) {
        hasSession = true;
      }
    }
  }
  const decision = evaluateUnverifiedCleanup({
    status: profile.status,
    verifiedAt: profile.verifiedAt,
    createdAt: profile.createdAt,
    nowMs: nowMs,
    retentionMs: retentionMs > 0 ? retentionMs : DEFAULT_UNVERIFIED_RETENTION_MS,
    liveCharacterCount: live,
    hasActiveGameplaySession: hasSession,
  });
  if (!decision.purge) {
    return { ok: true, op: "purge_unverified", purged: false, reason: decision.reason, idempotent: true };
  }
  const siblings = listAuthChallengesByHash(nk, profile.hmac, "EMAIL_VERIFICATION");
  for (let i = 0; i < siblings.length; i++) {
    writeAuthChallenge(nk, invalidateAuthChallenge(siblings[i], nowMs));
  }
  try {
    nk.accountDeleteId(userId, true);
  } catch {
    deleteAccountProfile(nk, userId);
    return { ok: true, op: "purge_unverified", purged: true, reason: "already_deleted", idempotent: true };
  }
  deleteAccountProfile(nk, userId);
  return { ok: true, op: "purge_unverified", purged: true, userId: userId, idempotent: false };
}

function redactChallenge(record: AuthChallengeRecord | null): { [key: string]: unknown } | null {
  if (record === null) {
    return null;
  }
  return {
    challenge_id: record.challenge_id,
    account_user_id: record.account_user_id,
    email_lookup_hash: record.email_lookup_hash,
    purpose: record.purpose,
    created_at: record.created_at,
    expires_at: record.expires_at,
    attempt_count: record.attempt_count,
    maximum_attempts: record.maximum_attempts,
    consumed_at: record.consumed_at,
    invalidated_at: record.invalidated_at,
    request_id: record.request_id,
    schema_version: record.schema_version,
  };
}

export function rpcAuthGateway(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  try {
    return runAuthGateway(ctx, logger, nk, payload);
  } catch (error) {
    return rpcFailurePayload(error);
  }
}

function runAuthGateway(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (!isGatewayHttpInvocation(ctx.userId, ctx.sessionId)) {
    logger.info("auth_gateway rejected session invocation");
    throw new Error("gateway_rpc_forbidden");
  }
  const request = parseRequest(payload);
  const secret = requireSecret(ctx.env);
  if (request.assertion === null) {
    throw new Error("missing_assertion");
  }
  const nowMs = Date.now();
  const seen = nonceEngine.seen(request.assertion.nonce, nowMs);
  const verified = verifyGatewayAssertion({
    assertion: request.assertion,
    secret: secret,
    operation: request.op,
    payloadJson: request.payloadJson,
    nowMs: nowMs,
    seenNonce: seen,
  });
  if (!verified.ok) {
    throw new Error(verified.reason);
  }
  const message =
    request.assertion.request_id +
    "\n" +
    String(request.assertion.timestamp) +
    "\n" +
    request.assertion.nonce +
    "\n" +
    request.assertion.operation +
    "\n" +
    request.assertion.payload_hash;
  const runtimeSignature = runtimeHmacHex(nk, secret, message);
  if (!constantTimeEqual(runtimeSignature, request.assertion.signature.toLowerCase())) {
    throw new Error("bad_signature");
  }
  nonceEngine.remember(request.assertion.nonce, nowMs);
  try {
    return JSON.stringify(dispatch(nk, request, nowMs));
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "internal_error";
    if (
      messageText === "invalid_payload" ||
      messageText === "profile_missing" ||
      messageText === "email_missing" ||
      messageText.indexOf("unknown_field:") === 0 ||
      messageText === "malformed_json"
    ) {
      throw error;
    }
    logger.error("auth_gateway op=%s failed reason=%s", request.op, messageText);
    throw new Error("internal_error");
  }
}
