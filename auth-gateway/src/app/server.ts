import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { parse as parseForm } from "node:querystring";
import type { GatewayConfig } from "../config/env";
import type { GatewayLogger } from "../logging/redact";
import { errorEnvelope, httpStatusForCode } from "../http/errors";
import { confirmPage, forgotEmailHelpPage, parsePurpose, resultPage, supportLookupPage } from "../http/pages";
import { GatewayRateLimits } from "../rate_limits/memory";
import { canonicalizeEmail } from "../validation/email";
import { validatePassword } from "../validation/password";
import { evaluateClientVersion } from "../validation/client_version";
import { generateChallengeCode, generateChallengeId, hashChallengeSecret, emailLookupHash } from "../challenges/codes";
import type { AuthChallengePurpose } from "../challenges/types";
import type { EmailProvider, EmailTemplateId } from "../email/templates";
import { renderEmail } from "../email/templates";
import { accessTokenIssuedAt, type GatewayRpcResult, type NakamaBridge } from "../nakama/client";
import {
  evaluateLegalAcceptance,
  evaluateRegistrationAccess,
  generateInternalUsername,
} from "../domain/registration";

const RESET_REQUEST_MESSAGE = "If an account exists for that email, password-reset instructions have been sent.";

export interface GatewayDeps {
  config: GatewayConfig;
  logger: GatewayLogger;
  email: EmailProvider;
  nakama: NakamaBridge;
  rates: GatewayRateLimits;
  now: () => number;
  delay?: (ms: number) => Promise<void>;
}

interface IdempotencyEntry {
  status: number;
  body: unknown;
  expiresAt: number;
}

function clientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.ip;
}

function requestIdOf(request: FastifyRequest): string {
  const header = request.headers["x-request-id"];
  if (typeof header === "string" && header.length > 0 && header.length <= 128) {
    return header;
  }
  return randomUUID();
}

export function createGatewayApp(deps: GatewayDeps): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: deps.config.requestBodyLimit,
    requestTimeout: deps.config.requestTimeoutMs,
    connectionTimeout: deps.config.requestTimeoutMs,
    trustProxy: false,
  });
  const idempotency = new Map<string, IdempotencyEntry>();
  const delayFn =
    deps.delay !== undefined ? deps.delay : (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, parseForm(typeof body === "string" ? body : ""));
    } catch (error) {
      done(error as Error);
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    const id = requestIdOf(request);
    request.headers["x-request-id"] = id;
    reply.header("x-request-id", id);
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-content-type-options", "nosniff");
    const key = request.headers["idempotency-key"];
    if (typeof key === "string" && key.length > 0) {
      const cached = idempotency.get(request.method + ":" + request.url + ":" + key);
      if (cached !== undefined && cached.expiresAt > deps.now()) {
        reply.status(cached.status);
        return reply.send(cached.body);
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = requestIdOf(request);
    const code =
      error.code === "FST_ERR_CTP_BODY_TOO_LARGE"
        ? "AUTH_PAYLOAD_TOO_LARGE"
        : error.code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
            error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ||
            error.statusCode === 400
          ? "AUTH_INVALID_JSON"
          : "AUTH_UNAVAILABLE";
    const messageKey =
      code === "AUTH_PAYLOAD_TOO_LARGE"
        ? "auth.error.payload_too_large"
        : code === "AUTH_INVALID_JSON"
          ? "auth.error.invalid_json"
          : "auth.error.unavailable";
    deps.logger.warn("request_error", { request_id: requestId, code: code });
    return reply.status(httpStatusForCode(code)).send(errorEnvelope({ code: code, messageKey: messageKey, requestId: requestId }));
  });

  function sendError(
    reply: FastifyReply,
    requestId: string,
    code: string,
    messageKey: string,
    retryAfterSeconds = 0,
    fieldErrors?: { [field: string]: string },
  ) {
    return reply
      .status(httpStatusForCode(code))
      .send(errorEnvelope({ code: code, messageKey: messageKey, requestId: requestId, retryAfterSeconds: retryAfterSeconds, fieldErrors: fieldErrors }));
  }

  function enforceIp(request: FastifyRequest, reply: FastifyReply, requestId: string): boolean {
    const limited = deps.rates.ip.consume("ip:" + clientIp(request), deps.now());
    if (!limited.allowed) {
      sendError(reply, requestId, "AUTH_RATE_LIMITED", "auth.error.rate_limited", limited.retryAfterSeconds);
      return false;
    }
    return true;
  }

  function applyIdempotency(request: FastifyRequest, body: { [key: string]: unknown }): void {
    const existing = request.headers["idempotency-key"];
    if (typeof existing === "string" && existing.length > 0) {
      return;
    }
    if (typeof body.idempotency_key === "string" && body.idempotency_key.length > 0) {
      request.headers["idempotency-key"] = body.idempotency_key;
    }
  }

  function replayIdempotency(request: FastifyRequest, reply: FastifyReply): boolean {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) {
      return false;
    }
    const cached = idempotency.get(request.method + ":" + request.url + ":" + key);
    if (cached !== undefined && cached.expiresAt > deps.now()) {
      reply.status(cached.status);
      reply.send(cached.body);
      return true;
    }
    return false;
  }

  async function padUntil(started: number): Promise<void> {
    const target = deps.config.resetUniformMs;
    if (!Number.isFinite(target) || target <= 0) {
      return;
    }
    const elapsed = deps.now() - started;
    await delayFn(Math.max(0, target - elapsed));
  }

  function challengeError(reason: string): { code: string; messageKey: string } {
    if (reason === "expired") {
      return { code: "AUTH_CHALLENGE_EXPIRED", messageKey: "auth.error.challenge_expired" };
    }
    if (reason === "locked") {
      return { code: "AUTH_CHALLENGE_LOCKED", messageKey: "auth.error.challenge_locked" };
    }
    return { code: "AUTH_INVALID_CHALLENGE", messageKey: "auth.error.invalid_challenge" };
  }

  async function providerAllowed(requestId: string): Promise<boolean> {
    const limited = deps.rates.provider.consume("provider:send", deps.now());
    if (!limited.allowed) {
      deps.logger.warn("email_provider_limited", { request_id: requestId });
      return false;
    }
    return true;
  }

  async function sendNotice(to: string, templateId: EmailTemplateId, requestId: string): Promise<void> {
    if (to.length === 0) {
      return;
    }
    if (!(await providerAllowed(requestId))) {
      return;
    }
    const rendered = renderEmail({
      to: to,
      templateId: templateId,
      expiresAt: new Date(deps.now() + 30 * 60 * 1000),
      supportEmail: deps.config.supportEmail,
    });
    const sent = await deps.email.send(rendered);
    if (!sent.ok) {
      deps.logger.error("email_send_failed", { request_id: requestId, template: templateId });
    }
  }

  async function issueChallenge(input: {
    purpose: AuthChallengePurpose;
    email: string;
    userId: string;
    requestId: string;
    templateId: EmailTemplateId;
    ttlMs?: number;
  }): Promise<{ ok: true; challengeId: string; expiresAt: number } | { ok: false }> {
    const hmac = emailLookupHash(deps.config.emailHmacPepper, input.email);
    const challengeId = generateChallengeId();
    const code = generateChallengeCode();
    const secretHash = hashChallengeSecret(deps.config.challengeHmacSecret, challengeId, code);
    const ttlMs =
      input.ttlMs !== undefined
        ? input.ttlMs
        : input.purpose === "PASSWORD_RESET"
          ? deps.config.passwordResetTtlMs
          : input.purpose === "EMAIL_CHANGE"
            ? deps.config.emailChangeTtlMs
            : deps.config.verificationTtlMs;
    const created = await deps.nakama.rpc(
      "challenge_put",
      {
        challenge_id: challengeId,
        hmac: hmac,
        secret_hash: secretHash,
        purpose: input.purpose,
        account_user_id: input.userId,
        request_id: input.requestId,
        ttl_ms: ttlMs,
      },
      input.requestId,
      deps.now(),
    );
    if (!created.ok) {
      deps.logger.error("challenge_put_failed", { request_id: input.requestId, purpose: input.purpose });
      return { ok: false };
    }
    const expiresAt = typeof created.data.expires_at === "number" ? created.data.expires_at : deps.now() + ttlMs;
    if (!(await providerAllowed(input.requestId))) {
      return { ok: true, challengeId: challengeId, expiresAt: expiresAt };
    }
    const confirmUrl =
      deps.config.publicBaseUrl +
      "/v1/confirm?purpose=" +
      encodeURIComponent(input.purpose) +
      "&challenge_id=" +
      encodeURIComponent(challengeId) +
      "&code=" +
      encodeURIComponent(code);
    const rendered = renderEmail({
      to: input.email,
      templateId: input.templateId,
      code: code,
      confirmUrl: confirmUrl,
      expiresAt: new Date(expiresAt),
      supportEmail: deps.config.supportEmail,
    });
    const sent = await deps.email.send(rendered);
    if (!sent.ok) {
      deps.logger.error("email_send_failed", { request_id: input.requestId, template: input.templateId });
    }
    return { ok: true, challengeId: challengeId, expiresAt: expiresAt };
  }

  async function consumeCode(
    purpose: AuthChallengePurpose,
    challengeId: string,
    code: string,
    requestId: string,
    hmac = "",
  ): Promise<GatewayRpcResult> {
    const fields: { [key: string]: unknown } = {
      challenge_id: challengeId,
      secret_hash: hashChallengeSecret(deps.config.challengeHmacSecret, challengeId, code),
      purpose: purpose,
    };
    if (hmac.length > 0) {
      fields.hmac = hmac;
    }
    return deps.nakama.rpc("challenge_consume", fields, requestId, deps.now());
  }

  async function revokeAllWithPassword(email: string, password: string, requestId: string): Promise<void> {
    if (email.length === 0 || password.length === 0) {
      return;
    }
    const auth = await deps.nakama.authenticateEmail(email, password, false);
    if (!auth.ok) {
      deps.logger.warn("logout_all_after_credential_change_failed", { request_id: requestId });
      return;
    }
    await deps.nakama.logoutAll(auth.token);
  }

  function readNewPassword(body: { [key: string]: unknown }): { password: string; confirmation: string } {
    const password = typeof body.new_password === "string" ? body.new_password : typeof body.password === "string" ? body.password : "";
    const confirmation =
      typeof body.new_password_confirmation === "string"
        ? body.new_password_confirmation
        : typeof body.password_confirmation === "string"
          ? body.password_confirmation
          : password;
    return { password: password, confirmation: confirmation };
  }

  async function resolveTypedChallenge(
    purpose: AuthChallengePurpose,
    body: { [key: string]: unknown },
    requestId: string,
  ): Promise<{ challengeId: string; code: string } | null> {
    let challengeId = typeof body.challenge_id === "string" ? body.challenge_id : "";
    let code = typeof body.code === "string" ? body.code : "";
    const typed =
      typeof body.reset_challenge === "string"
        ? body.reset_challenge
        : typeof body.email_change_challenge === "string"
          ? body.email_change_challenge
          : "";
    if (code.length === 0 && typed.length > 0) {
      if (typed.indexOf("-") !== -1) {
        code = typed;
      } else if (challengeId.length === 0) {
        challengeId = typed;
      } else {
        code = typed;
      }
    }
    if (challengeId.length === 0) {
      const lookupEmail =
        purpose === "EMAIL_CHANGE" && typeof body.new_email === "string"
          ? body.new_email
          : typeof body.email === "string"
            ? body.email
            : "";
      const parsed = canonicalizeEmail(lookupEmail);
      if (parsed.ok) {
        const hash = emailLookupHash(deps.config.emailHmacPepper, parsed.canonical);
        const found = await deps.nakama.rpc("challenge_find", { hmac: hash, purpose: purpose }, requestId, deps.now());
        if (typeof found.data.challenge_id === "string") {
          challengeId = found.data.challenge_id;
        }
      }
    }
    if (challengeId.length === 0 || code.length === 0) {
      return null;
    }
    return { challengeId: challengeId, code: code };
  }

  async function emailAddressTaken(canonical: string, requestId: string, exceptUserId = ""): Promise<boolean> {
    const hash = emailLookupHash(deps.config.emailHmacPepper, canonical);
    const lookup = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
    const decision = lookup.data.decision as { ok?: boolean; userId?: string } | undefined;
    if (decision !== undefined && decision.ok === true && typeof decision.userId === "string" && decision.userId !== exceptUserId) {
      return true;
    }
    const probe = await deps.nakama.authenticateEmail(canonical, randomBytes(24).toString("hex") + " extra-pass", false);
    if (probe.ok) {
      await deps.nakama.logoutAll(probe.token);
      return probe.userId !== exceptUserId;
    }
    return probe.message.toLowerCase().indexOf("not found") === -1;
  }

  async function requireActiveBearer(
    request: FastifyRequest,
    reply: FastifyReply,
    requestId: string,
  ): Promise<{ token: string; userId: string; email: string } | null> {
    const token = bearer(request);
    if (token.length === 0) {
      sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
      return null;
    }
    const account = await deps.nakama.getAccount(token);
    if (!account.ok) {
      sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
      return null;
    }
    const issuedAt = accessTokenIssuedAt(token);
    if (!(issuedAt > 0 && deps.now() - issuedAt <= deps.config.sensitiveRecentMs)) {
      sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.session_stale");
      return null;
    }
    if (account.disableTime > 0) {
      sendError(reply, requestId, "AUTH_ACCOUNT_DISABLED", "auth.error.account_disabled");
      return null;
    }
    const profile = await deps.nakama.rpc("get_profile", { user_id: account.userId }, requestId, deps.now());
    const status = typeof profile.data.status === "string" ? profile.data.status : "";
    if (status === "DISABLED") {
      sendError(reply, requestId, "AUTH_ACCOUNT_DISABLED", "auth.error.account_disabled");
      return null;
    }
    if (status === "DELETION_PENDING" || status === "DELETING" || status === "DELETED") {
      sendError(reply, requestId, "AUTH_ACCOUNT_DELETING", "auth.error.account_deleting");
      return null;
    }
    if (status !== "ACTIVE") {
      sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
      return null;
    }
    return { token: token, userId: account.userId, email: account.email };
  }

  async function finishChallenge(input: {
    purpose: AuthChallengePurpose;
    challengeId: string;
    code: string;
    requestId: string;
    password?: string;
    newEmail?: string;
  }): Promise<{ ok: boolean; idempotent: boolean; reason: string }> {
    const hmac =
      input.purpose === "EMAIL_CHANGE" && input.newEmail !== undefined
        ? emailLookupHash(deps.config.emailHmacPepper, input.newEmail)
        : "";
    const consumed = await consumeCode(input.purpose, input.challengeId, input.code, input.requestId, hmac);
    if (!consumed.ok || consumed.data.ok !== true) {
      const reason = typeof consumed.data.reason === "string" ? consumed.data.reason : "invalid_challenge";
      return { ok: false, idempotent: false, reason: reason };
    }
    const userId = typeof consumed.data.account_user_id === "string" ? consumed.data.account_user_id : "";
    if (input.purpose === "EMAIL_VERIFICATION" && userId.length > 0) {
      const marked = await deps.nakama.rpc("mark_verified", { user_id: userId }, input.requestId, deps.now());
      const email = typeof marked.data.email === "string" ? marked.data.email : "";
      await sendNotice(email, "email_verified", input.requestId);
    }
    if (input.purpose === "PASSWORD_RESET" && userId.length > 0 && input.password !== undefined) {
      if (consumed.data.idempotent !== true) {
        const got = await deps.nakama.rpc("challenge_get", { challenge_id: input.challengeId }, input.requestId, deps.now());
        const record = got.data.record as { email_lookup_hash?: string } | null | undefined;
        const hash = record !== undefined && record !== null && typeof record.email_lookup_hash === "string" ? record.email_lookup_hash : "";
        if (hash.length > 0) {
          const lookup = await deps.nakama.rpc("lookup_email", { hmac: hash }, input.requestId, deps.now());
          const decision = lookup.data.decision as { ok?: boolean; userId?: string } | undefined;
          if (decision === undefined || decision.ok !== true || decision.userId !== userId) {
            return { ok: false, idempotent: false, reason: "invalid_challenge" };
          }
        }
        const replaced = await deps.nakama.rpc(
          "replace_password",
          { user_id: userId, password: input.password },
          input.requestId,
          deps.now(),
        );
        if (!replaced.ok) {
          return { ok: false, idempotent: false, reason: "unavailable" };
        }
        const email = typeof replaced.data.email === "string" ? replaced.data.email : "";
        await sendNotice(email, "password_changed", input.requestId);
        await revokeAllWithPassword(email, input.password, input.requestId);
      }
    }
    if (input.purpose === "EMAIL_CHANGE" && userId.length > 0 && input.newEmail !== undefined && input.password !== undefined) {
      if (consumed.data.idempotent !== true) {
        const replaced = await deps.nakama.rpc(
          "replace_email",
          {
            user_id: userId,
            new_email: input.newEmail,
            password: input.password,
            hmac: emailLookupHash(deps.config.emailHmacPepper, input.newEmail),
          },
          input.requestId,
          deps.now(),
        );
        if (!replaced.ok) {
          return { ok: false, idempotent: false, reason: "unavailable" };
        }
        const oldEmail = typeof replaced.data.old_email === "string" ? replaced.data.old_email : "";
        await sendNotice(oldEmail, "email_changed_old", input.requestId);
        await sendNotice(input.newEmail, "email_changed_new", input.requestId);
        await revokeAllWithPassword(input.newEmail, input.password, input.requestId);
      }
    }
    if (input.purpose === "ACCOUNT_DELETION" && userId.length > 0) {
      const deleted = await deps.nakama.rpc("delete_account", { user_id: userId }, input.requestId, deps.now());
      const email = typeof deleted.data.email === "string" ? deleted.data.email : "";
      await sendNotice(email, "account_deleted", input.requestId);
    }
    return { ok: true, idempotent: consumed.data.idempotent === true, reason: "" };
  }

  function clientVersionError(requestId: string, reply: FastifyReply, body: { [key: string]: unknown }): boolean {
    const version = evaluateClientVersion(body.client_version, deps.config.minClientVersion, deps.config.maxClientVersion);
    if (!version.ok) {
      sendError(reply, requestId, "AUTH_CLIENT_VERSION", "auth.error.client_version");
      return false;
    }
    return true;
  }

  async function maybeResendVerification(email: string, userId: string, requestId: string): Promise<void> {
    const hash = emailLookupHash(deps.config.emailHmacPepper, email);
    const limited = deps.rates.emailHash.consume("verify:" + hash, deps.now());
    if (!limited.allowed) {
      return;
    }
    await issueChallenge({
      purpose: "EMAIL_VERIFICATION",
      email: email,
      userId: userId,
      requestId: requestId,
      templateId: "verify_email",
    });
  }

  async function handleVerifyConfirm(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    let challengeId = typeof body.challenge_id === "string" ? body.challenge_id : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (challengeId.length === 0 && typeof body.email === "string") {
      const email = canonicalizeEmail(body.email);
      if (email.ok) {
        const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
        const found = await deps.nakama.rpc(
          "challenge_find",
          { hmac: hash, purpose: "EMAIL_VERIFICATION" },
          requestId,
          deps.now(),
        );
        if (typeof found.data.challenge_id === "string") {
          challengeId = found.data.challenge_id;
        }
      }
    }
    if (challengeId.length === 0 || code.length === 0) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const finished = await finishChallenge({
      purpose: "EMAIL_VERIFICATION",
      challengeId: challengeId,
      code: code,
      requestId: requestId,
    });
    if (!finished.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    return reply.send({ ok: true, request_id: requestId, verified: true, idempotent: finished.idempotent });
  }

  async function handleVerifyRequest(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    const email = canonicalizeEmail(body.email);
    if (!email.ok) {
      return reply.send({ ok: true, request_id: requestId });
    }
    const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
    const lookup = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
    const decision = lookup.data.decision as { ok?: boolean; userId?: string } | undefined;
    if (decision !== undefined && decision.ok === true && typeof decision.userId === "string") {
      await maybeResendVerification(email.canonical, decision.userId, requestId);
    }
    return reply.send({ ok: true, request_id: requestId });
  }

  app.get("/health", async () => ({ ok: true, service: "auth-gateway" }));
  app.get("/ready", async () => {
    const nakama = await deps.nakama.health();
    const email = await deps.email.health();
    return { ok: nakama && email, service: "auth-gateway", nakama: nakama, email: email };
  });

  app.post("/v1/auth/register", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    if (!clientVersionError(requestId, reply, body)) {
      return;
    }
    const email = canonicalizeEmail(body.email);
    const password = validatePassword(body.password);
    const confirmation = typeof body.password_confirmation === "string" ? body.password_confirmation : "";
    const fieldErrors: { [field: string]: string } = {};
    if (!email.ok) {
      fieldErrors.email = "invalid";
    }
    if (!password.ok) {
      fieldErrors.password = password.ok ? "" : "invalid";
    }
    if (password.ok && confirmation !== String(body.password)) {
      fieldErrors.password_confirmation = "mismatch";
    }
    const legal = evaluateLegalAcceptance({
      acceptedTermsVersion: body.accepted_terms_version,
      acceptedPrivacyVersion: body.accepted_privacy_version,
      currentTermsVersion: deps.config.termsVersion,
      currentPrivacyVersion: deps.config.privacyVersion,
    });
    if (!legal.ok) {
      const keys = Object.keys(legal.fieldErrors);
      for (let i = 0; i < keys.length; i++) {
        fieldErrors[keys[i]] = legal.fieldErrors[keys[i]];
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, fieldErrors);
    }
    if (!email.ok) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, { email: "invalid" });
    }
    const access = evaluateRegistrationAccess(deps.config.registrationMode, email.canonical, deps.config.registrationAllowlist);
    if (!access.ok) {
      return sendError(reply, requestId, access.code, "auth.error.registration_closed");
    }
    const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
    const emailLimit = deps.rates.emailHash.consume("register:" + hash, deps.now());
    if (!emailLimit.allowed) {
      return sendError(reply, requestId, "AUTH_RATE_LIMITED", "auth.error.rate_limited", emailLimit.retryAfterSeconds);
    }
    const existing = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
    let existingDecision = existing.data.decision as { ok?: boolean; userId?: string } | undefined;
    if (existingDecision !== undefined && existingDecision.ok === true) {
      await deps.nakama.rpc(
        "purge_unverified",
        { hmac: hash, retention_ms: deps.config.unverifiedRetentionMs },
        requestId,
        deps.now(),
      );
      const again = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
      existingDecision = again.data.decision as { ok?: boolean; userId?: string } | undefined;
      const profile = again.data.profile as { status?: string } | null | undefined;
      if (existingDecision !== undefined && existingDecision.ok === true && typeof existingDecision.userId === "string") {
        if (profile !== undefined && profile !== null && profile.status === "PENDING_VERIFICATION") {
          await maybeResendVerification(email.canonical, existingDecision.userId, requestId);
        }
        return sendError(reply, requestId, "AUTH_REGISTRATION_FAILED", "auth.error.registration_failed");
      }
    }
    let created = await deps.nakama.authenticateEmail(
      email.canonical,
      String(body.password),
      true,
      generateInternalUsername(() => randomBytes(16).toString("hex")),
    );
    if (!created.ok && created.message.toLowerCase().indexOf("username") !== -1) {
      created = await deps.nakama.authenticateEmail(
        email.canonical,
        String(body.password),
        true,
        generateInternalUsername(() => randomBytes(16).toString("hex")),
      );
    }
    if (!created.ok) {
      const taken = created.message.toLowerCase().indexOf("exists") !== -1 || created.message.toLowerCase().indexOf("already") !== -1;
      if (taken) {
        await deps.nakama.rpc(
          "purge_unverified",
          { hmac: hash, retention_ms: deps.config.unverifiedRetentionMs },
          requestId,
          deps.now(),
        );
        const again = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
        const decision = again.data.decision as { ok?: boolean; userId?: string } | undefined;
        const profile = again.data.profile as { status?: string } | null | undefined;
        if (decision !== undefined && decision.ok === true && typeof decision.userId === "string") {
          if (profile !== undefined && profile !== null && profile.status === "PENDING_VERIFICATION") {
            await maybeResendVerification(email.canonical, decision.userId, requestId);
          }
          return sendError(reply, requestId, "AUTH_REGISTRATION_FAILED", "auth.error.registration_failed");
        }
        created = await deps.nakama.authenticateEmail(
          email.canonical,
          String(body.password),
          true,
          generateInternalUsername(() => randomBytes(16).toString("hex")),
        );
        if (!created.ok) {
          return sendError(reply, requestId, "AUTH_REGISTRATION_FAILED", "auth.error.registration_failed");
        }
      } else {
        return sendError(reply, requestId, "AUTH_UNAVAILABLE", "auth.error.unavailable");
      }
    }
    await deps.nakama.rpc(
      "put_email_index",
      {
        user_id: created.userId,
        hmac: hash,
        status: "PENDING_VERIFICATION",
        terms_version: deps.config.termsVersion,
        privacy_version: deps.config.privacyVersion,
        created_at: deps.now(),
        accepted_at: deps.now(),
      },
      requestId,
      deps.now(),
    );
    const challenge = await issueChallenge({
      purpose: "EMAIL_VERIFICATION",
      email: email.canonical,
      userId: created.userId,
      requestId: requestId,
      templateId: "verify_email",
    });
    if (!challenge.ok) {
      deps.logger.error("register_email_failed", { request_id: requestId });
    }
    return reply.send({ ok: true, request_id: requestId, verification_required: true });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    if (!clientVersionError(requestId, reply, body)) {
      return;
    }
    const email = canonicalizeEmail(body.email);
    if (!email.ok || typeof body.password !== "string") {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
    }
    const result = await deps.nakama.authenticateEmail(email.canonical, body.password, false);
    if (!result.ok) {
      const lowered = result.message.toLowerCase();
      if (lowered.indexOf("disabled") !== -1) {
        return sendError(reply, requestId, "AUTH_ACCOUNT_DISABLED", "auth.error.account_disabled");
      }
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
    }
    const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
    const lookup = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
    const profile = lookup.data.profile as { status?: string; verifiedAt?: number } | null | undefined;
    const account = await deps.nakama.getAccount(result.token);
    if (account.disableTime > 0) {
      return sendError(reply, requestId, "AUTH_ACCOUNT_DISABLED", "auth.error.account_disabled");
    }
    const status = profile !== undefined && profile !== null && typeof profile.status === "string" ? profile.status : "PENDING_VERIFICATION";
    if (status === "DISABLED") {
      return sendError(reply, requestId, "AUTH_ACCOUNT_DISABLED", "auth.error.account_disabled");
    }
    if (status === "DELETION_PENDING" || status === "DELETING" || status === "DELETED") {
      return sendError(reply, requestId, "AUTH_ACCOUNT_DELETING", "auth.error.account_deleting");
    }
    if (status !== "ACTIVE" || profile === undefined || profile === null || !(profile.verifiedAt !== undefined && profile.verifiedAt > 0)) {
      return sendError(reply, requestId, "EMAIL_VERIFICATION_REQUIRED", "auth.error.verification_required");
    }
    return reply.send({
      ok: true,
      request_id: requestId,
      user_id: result.userId,
      username: result.username,
      token: result.token,
      refresh_token: result.refreshToken,
      account_status: "ACTIVE",
      verified: true,
    });
  });

  app.post("/v1/auth/verify/confirm", handleVerifyConfirm);
  app.post("/v1/auth/verify-email", handleVerifyConfirm);
  app.post("/v1/auth/verify/request", handleVerifyRequest);
  app.post("/v1/auth/resend-verification", handleVerifyRequest);

  app.post("/v1/auth/refresh", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    if (!clientVersionError(requestId, reply, body)) {
      return;
    }
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
    if (refreshToken.length === 0) {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.session_expired");
    }
    const refreshed = await deps.nakama.refreshSession(refreshToken);
    if (!refreshed.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.session_expired");
    }
    return reply.send({
      ok: true,
      request_id: requestId,
      user_id: refreshed.userId,
      username: refreshed.username,
      token: refreshed.token,
      refresh_token: refreshed.refreshToken,
      account_status: "ACTIVE",
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    const access = bearer(request);
    const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
    if (access.length === 0) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    await deps.nakama.logout(access, refreshToken);
    return reply.send({ ok: true, request_id: requestId });
  });

  app.post("/v1/auth/logout-all", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const access = bearer(request);
    if (access.length === 0) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const account = await deps.nakama.getAccount(access);
    if (!account.ok) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const body = asObject(request.body);
    const issuedAt = accessTokenIssuedAt(access);
    const recent = issuedAt > 0 && deps.now() - issuedAt <= deps.config.logoutAllRecentAuthMs;
    if (!recent) {
      if (typeof body.password !== "string" || account.email.length === 0) {
        return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
      }
      const proved = await deps.nakama.authenticateEmail(account.email, body.password, false);
      if (!proved.ok) {
        return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
      }
    }
    await deps.nakama.logoutAll(access);
    await sendNotice(account.email, "suspicious_session_invalidation", requestId);
    return reply.send({ ok: true, request_id: requestId, logged_out_all: true });
  });

  app.get("/v1/account/status", async (request, reply) => {
    const requestId = requestIdOf(request);
    const access = bearer(request);
    if (access.length === 0) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const account = await deps.nakama.getAccount(access);
    if (!account.ok) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const profile = await deps.nakama.rpc("get_profile", { user_id: account.userId }, requestId, deps.now());
    const status = typeof profile.data.status === "string" ? profile.data.status : "PENDING_VERIFICATION";
    const verifiedAt = typeof profile.data.verifiedAt === "number" ? profile.data.verifiedAt : 0;
    return reply.send({
      ok: true,
      request_id: requestId,
      user_id: account.userId,
      username: account.username,
      account_status: account.disableTime > 0 ? "DISABLED" : status,
      verified: verifiedAt > 0 && status === "ACTIVE",
    });
  });

  async function handlePasswordResetRequest(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    const started = deps.now();
    const generic = {
      ok: true,
      request_id: requestId,
      message: RESET_REQUEST_MESSAGE,
      message_key: "auth.password_reset.requested",
    };
    const finish = async () => {
      await padUntil(started);
      return reply.send(generic);
    };
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    if (!clientVersionError(requestId, reply, body)) {
      return;
    }
    const email = canonicalizeEmail(body.email);
    if (!email.ok) {
      return finish();
    }
    const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
    const emailLimit = deps.rates.emailHash.consume("reset:" + hash, deps.now());
    if (!emailLimit.allowed) {
      return reply.status(429).send(
        errorEnvelope({
          code: "AUTH_RATE_LIMITED",
          messageKey: "auth.error.rate_limited",
          requestId: requestId,
          retryAfterSeconds: emailLimit.retryAfterSeconds,
        }),
      );
    }
    const lookup = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
    const decision = lookup.data.decision as { ok?: boolean; userId?: string } | undefined;
    const profile = lookup.data.profile as { status?: string } | null | undefined;
    const status = profile !== undefined && profile !== null && typeof profile.status === "string" ? profile.status : "";
    const live =
      decision !== undefined &&
      decision.ok === true &&
      typeof decision.userId === "string" &&
      status !== "DELETED" &&
      status !== "DELETING" &&
      status !== "DELETION_PENDING";
    if (live) {
      await issueChallenge({
        purpose: "PASSWORD_RESET",
        email: email.canonical,
        userId: decision.userId as string,
        requestId: requestId,
        templateId: "password_reset",
        ttlMs: deps.config.passwordResetTtlMs,
      });
    }
    return finish();
  }

  async function handlePasswordResetConfirm(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    applyIdempotency(request, body);
    if (replayIdempotency(request, reply)) {
      return;
    }
    const passwords = readNewPassword(body);
    const policy = validatePassword(passwords.password);
    if (!policy.ok || passwords.password !== passwords.confirmation) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, {
        new_password: policy.ok ? "" : "invalid",
        new_password_confirmation: passwords.password === passwords.confirmation ? "" : "mismatch",
      });
    }
    const resolved = await resolveTypedChallenge("PASSWORD_RESET", body, requestId);
    if (resolved === null) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const finished = await finishChallenge({
      purpose: "PASSWORD_RESET",
      challengeId: resolved.challengeId,
      code: resolved.code,
      requestId: requestId,
      password: passwords.password,
    });
    if (!finished.ok) {
      if (finished.reason === "unavailable") {
        return sendError(reply, requestId, "AUTH_UNAVAILABLE", "auth.error.unavailable");
      }
      const mapped = challengeError(finished.reason);
      return sendError(reply, requestId, mapped.code, mapped.messageKey);
    }
    return reply.send({ ok: true, request_id: requestId, require_login: true });
  }

  async function handlePasswordChange(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    applyIdempotency(request, body);
    if (replayIdempotency(request, reply)) {
      return;
    }
    const session = await requireActiveBearer(request, reply, requestId);
    if (session === null) {
      return;
    }
    const current = typeof body.current_password === "string" ? body.current_password : typeof body.password === "string" ? body.password : "";
    const passwords = readNewPassword(body);
    const policy = validatePassword(passwords.password);
    if (current.length === 0 || !policy.ok || passwords.password !== passwords.confirmation) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, {
        current_password: current.length === 0 ? "required" : "",
        new_password: policy.ok ? "" : "invalid",
        new_password_confirmation: passwords.password === passwords.confirmation ? "" : "mismatch",
      });
    }
    if (current === passwords.password) {
      return sendError(reply, requestId, "AUTH_PASSWORD_REUSE", "auth.error.password_reuse");
    }
    const proved = await deps.nakama.authenticateEmail(session.email, current, false);
    if (!proved.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
    }
    const replaced = await deps.nakama.rpc(
      "replace_password",
      { user_id: session.userId, password: passwords.password },
      requestId,
      deps.now(),
    );
    if (!replaced.ok) {
      return sendError(reply, requestId, "AUTH_UNAVAILABLE", "auth.error.unavailable");
    }
    await revokeAllWithPassword(session.email, passwords.password, requestId);
    await sendNotice(session.email, "password_changed", requestId);
    return reply.send({ ok: true, request_id: requestId, require_login: true });
  }

  async function handleEmailChangeRequest(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    applyIdempotency(request, body);
    if (replayIdempotency(request, reply)) {
      return;
    }
    const session = await requireActiveBearer(request, reply, requestId);
    if (session === null) {
      return;
    }
    const current = typeof body.current_password === "string" ? body.current_password : typeof body.password === "string" ? body.password : "";
    const next = canonicalizeEmail(body.new_email);
    if (current.length === 0 || !next.ok) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, {
        current_password: current.length === 0 ? "required" : "",
        new_email: next.ok ? "" : "invalid",
      });
    }
    if (next.canonical === session.email) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, { new_email: "unchanged" });
    }
    const proved = await deps.nakama.authenticateEmail(session.email, current, false);
    if (!proved.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
    }
    if (await emailAddressTaken(next.canonical, requestId, session.userId)) {
      return sendError(reply, requestId, "AUTH_EMAIL_TAKEN", "auth.error.email_taken");
    }
    await issueChallenge({
      purpose: "EMAIL_CHANGE",
      email: next.canonical,
      userId: session.userId,
      requestId: requestId,
      templateId: "email_change_confirmation",
      ttlMs: deps.config.emailChangeTtlMs,
    });
    await sendNotice(session.email, "email_change_old_notice", requestId);
    return reply.send({ ok: true, request_id: requestId });
  }

  async function handleEmailChangeConfirm(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    applyIdempotency(request, body);
    if (replayIdempotency(request, reply)) {
      return;
    }
    const next = canonicalizeEmail(body.new_email);
    const password = typeof body.password === "string" ? body.password : typeof body.current_password === "string" ? body.current_password : "";
    if (!next.ok || password.length === 0) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, {
        new_email: next.ok ? "" : "invalid",
        password: password.length === 0 ? "required" : "",
      });
    }
    const resolved = await resolveTypedChallenge("EMAIL_CHANGE", body, requestId);
    if (resolved === null) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const proved = await deps.nakama.authenticateEmail(next.canonical, password, false);
    let userId = "";
    if (proved.ok) {
      userId = proved.userId;
    } else {
      const oldLookup = await deps.nakama.rpc(
        "challenge_get",
        { challenge_id: resolved.challengeId },
        requestId,
        deps.now(),
      );
      const record = oldLookup.data.record as { account_user_id?: string } | null | undefined;
      userId = record !== undefined && record !== null && typeof record.account_user_id === "string" ? record.account_user_id : "";
    }
    if (await emailAddressTaken(next.canonical, requestId, userId)) {
      return sendError(reply, requestId, "AUTH_EMAIL_TAKEN", "auth.error.email_taken");
    }
    const finished = await finishChallenge({
      purpose: "EMAIL_CHANGE",
      challengeId: resolved.challengeId,
      code: resolved.code,
      requestId: requestId,
      password: password,
      newEmail: next.canonical,
    });
    if (!finished.ok) {
      if (finished.reason === "unavailable") {
        return sendError(reply, requestId, "AUTH_UNAVAILABLE", "auth.error.unavailable");
      }
      const mapped = challengeError(finished.reason);
      return sendError(reply, requestId, mapped.code, mapped.messageKey);
    }
    return reply.send({ ok: true, request_id: requestId, require_login: true });
  }

  function supportKeyFrom(request: FastifyRequest, body: { [key: string]: unknown }): string {
    const header = request.headers["x-support-key"];
    if (typeof header === "string" && header.length > 0) {
      return header;
    }
    return typeof body.support_key === "string" ? body.support_key : "";
  }

  function supportAuthorized(provided: string): boolean {
    const expected = deps.config.supportLookupSecret;
    if (expected.length < 16) {
      return false;
    }
    const left = Buffer.from(provided, "utf8");
    const right = Buffer.from(expected, "utf8");
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  async function handleSupportLookup(request: FastifyRequest, reply: FastifyReply) {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    const html = request.headers.accept !== undefined && String(request.headers.accept).indexOf("text/html") !== -1;
    if (!supportAuthorized(supportKeyFrom(request, body))) {
      deps.logger.warn("support_lookup_denied", { request_id: requestId });
      if (html || request.headers["content-type"] === "application/x-www-form-urlencoded") {
        return reply.status(403).type("text/html").send(supportLookupPage(requestId, "This request could not be completed."));
      }
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const supportId = typeof body.support_id === "string" ? body.support_id.trim() : "";
    const characterName = typeof body.character_name === "string" ? body.character_name.trim() : "";
    const queryKind = supportId.length > 0 ? "support_id" : characterName.length > 0 ? "character_name" : "empty";
    const queryHash = createHash("sha256")
      .update(queryKind + ":" + (supportId.length > 0 ? supportId : characterName), "utf8")
      .digest("hex");
    if (supportId.length === 0 && characterName.length === 0) {
      deps.logger.info("support_lookup", { request_id: requestId, query_kind: queryKind, query_hash: queryHash, hit: false });
      if (html || request.headers["content-type"] === "application/x-www-form-urlencoded") {
        return reply.type("text/html").send(supportLookupPage(requestId, undefined, JSON.stringify({ ok: false, reason: "missing" })));
      }
      return reply.send({ ok: false, request_id: requestId, reason: "missing" });
    }
    const snapshot = await deps.nakama.rpc(
      "support_snapshot",
      { user_id: supportId, character_name: characterName },
      requestId,
      deps.now(),
    );
    const hit = snapshot.data.ok === true;
    const userId = typeof snapshot.data.user_id === "string" ? snapshot.data.user_id : "";
    deps.logger.info("support_lookup", {
      request_id: requestId,
      query_kind: queryKind,
      query_hash: queryHash,
      hit: hit,
      user_id: hit ? userId : "",
    });
    const safe = {
      ok: hit,
      request_id: requestId,
      user_id: hit ? userId : "",
      account_status: hit && typeof snapshot.data.status === "string" ? snapshot.data.status : "",
      verified: hit === true && snapshot.data.verified === true,
      character_names: hit && Array.isArray(snapshot.data.character_names) ? snapshot.data.character_names : [],
    };
    if (html || request.headers["content-type"] === "application/x-www-form-urlencoded") {
      return reply.type("text/html").send(supportLookupPage(requestId, undefined, JSON.stringify(safe)));
    }
    return reply.send(safe);
  }

  app.post("/v1/auth/password/reset/request", handlePasswordResetRequest);
  app.post("/v1/auth/password-reset/request", handlePasswordResetRequest);
  app.post("/v1/auth/password/reset/confirm", handlePasswordResetConfirm);
  app.post("/v1/auth/password-reset/confirm", handlePasswordResetConfirm);
  app.post("/v1/account/password/change", handlePasswordChange);
  app.post("/v1/account/email/change/request", handleEmailChangeRequest);
  app.post("/v1/auth/email-change/request", handleEmailChangeRequest);
  app.post("/v1/account/email/change/confirm", handleEmailChangeConfirm);
  app.post("/v1/auth/email-change/confirm", handleEmailChangeConfirm);
  app.get("/v1/account/forgot-email", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    return reply.type("text/html").send(forgotEmailHelpPage(deps.config.supportEmail));
  });
  app.get("/v1/support/lookup", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (deps.config.supportLookupSecret.length < 16) {
      return reply.status(404).send({ ok: false });
    }
    return reply.type("text/html").send(supportLookupPage(requestIdOf(request)));
  });
  app.post("/v1/support/lookup", handleSupportLookup);

  app.post("/v1/auth/account-deletion/request", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const token = bearer(request);
    if (token.length === 0) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const account = await deps.nakama.getAccount(token);
    if (!account.ok || account.email.length === 0) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    await issueChallenge({
      purpose: "ACCOUNT_DELETION",
      email: account.email,
      userId: account.userId,
      requestId: requestId,
      templateId: "account_deletion_confirmation",
    });
    return reply.send({ ok: true, request_id: requestId });
  });

  app.post("/v1/auth/account-deletion/confirm", async (request, reply) => {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    if (typeof body.challenge_id !== "string" || typeof body.code !== "string") {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const finished = await finishChallenge({
      purpose: "ACCOUNT_DELETION",
      challengeId: body.challenge_id,
      code: body.code,
      requestId: requestId,
    });
    if (!finished.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    return reply.send({ ok: true, request_id: requestId, deleted: true });
  });

  app.get("/v1/confirm", async (request, reply) => {
    const requestId = requestIdOf(request);
    reply.header("cache-control", "no-store");
    const query = request.query as { purpose?: string; code?: string; challenge_id?: string };
    const purpose = parsePurpose(typeof query.purpose === "string" ? query.purpose : "");
    if (purpose === null) {
      return reply.type("text/html").send(confirmPage({ purpose: "EMAIL_VERIFICATION", requestId: requestId, error: "This request could not be completed." }));
    }
    return reply.type("text/html").send(
      confirmPage({
        purpose: purpose,
        requestId: requestId,
        challengeId: typeof query.challenge_id === "string" ? query.challenge_id : "",
        code: typeof query.code === "string" ? query.code : "",
      }),
    );
  });

  app.post("/v1/confirm", async (request, reply) => {
    const requestId = requestIdOf(request);
    reply.header("cache-control", "no-store");
    const body = asObject(request.body);
    const purpose = parsePurpose(typeof body.purpose === "string" ? body.purpose : "");
    const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (purpose === null || challengeId.length === 0 || code.length === 0) {
      return reply.redirect("/v1/confirm/done?ok=0");
    }
    if (purpose === "PASSWORD_RESET") {
      const password = validatePassword(body.password);
      if (!password.ok) {
        return reply.type("text/html").send(confirmPage({ purpose: purpose, requestId: requestId, challengeId: challengeId, error: "This request could not be completed." }));
      }
    }
    let newEmail: string | undefined;
    if (purpose === "EMAIL_CHANGE") {
      const next = canonicalizeEmail(body.new_email);
      if (!next.ok || typeof body.password !== "string") {
        return reply.type("text/html").send(confirmPage({ purpose: purpose, requestId: requestId, challengeId: challengeId, error: "This request could not be completed." }));
      }
      newEmail = next.canonical;
      const got = await deps.nakama.rpc("challenge_get", { challenge_id: challengeId }, requestId, deps.now());
      const record = got.data.record as { account_user_id?: string } | null | undefined;
      const userId = record !== undefined && record !== null && typeof record.account_user_id === "string" ? record.account_user_id : "";
      if (await emailAddressTaken(newEmail, requestId, userId)) {
        return reply.type("text/html").send(confirmPage({ purpose: purpose, requestId: requestId, challengeId: challengeId, error: "This request could not be completed." }));
      }
    }
    const finished = await finishChallenge({
      purpose: purpose,
      challengeId: challengeId,
      code: code,
      requestId: requestId,
      password: typeof body.password === "string" ? body.password : undefined,
      newEmail: newEmail,
    });
    return reply.redirect("/v1/confirm/done?ok=" + (finished.ok ? "1" : "0"));
  });

  app.get("/v1/confirm/done", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const query = request.query as { ok?: string };
    return reply.type("text/html").send(resultPage(query.ok === "1"));
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const key = request.headers["idempotency-key"];
    if (typeof key === "string" && key.length > 0) {
      idempotency.set(request.method + ":" + request.url + ":" + key, {
        status: reply.statusCode,
        body: payload,
        expiresAt: deps.now() + 10 * 60 * 1000,
      });
    }
    return payload;
  });

  return app;
}

function asObject(body: unknown): { [key: string]: unknown } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const input = body as { [key: string]: unknown };
  const out: { [key: string]: unknown } = {};
  const keys = Object.keys(input);
  for (let i = 0; i < keys.length; i++) {
    const value = input[keys[i]];
    out[keys[i]] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (typeof header !== "string" || header.indexOf("Bearer ") !== 0) {
    return "";
  }
  return header.slice("Bearer ".length);
}
