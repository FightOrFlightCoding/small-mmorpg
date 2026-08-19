import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { parse as parseForm } from "node:querystring";
import type { GatewayConfig } from "../config/env";
import type { GatewayLogger } from "../logging/redact";
import { errorEnvelope, httpStatusForCode } from "../http/errors";
import { confirmPage, parsePurpose, resultPage } from "../http/pages";
import { GatewayRateLimits } from "../rate_limits/memory";
import { canonicalizeEmail } from "../validation/email";
import { validatePassword } from "../validation/password";
import { generateChallengeCode, generateChallengeId, hashChallengeSecret, emailLookupHash } from "../challenges/codes";
import type { AuthChallengePurpose } from "../challenges/types";
import type { EmailProvider, EmailTemplateId } from "../email/templates";
import { renderEmail } from "../email/templates";
import type { GatewayRpcResult, NakamaBridge } from "../nakama/client";

export interface GatewayDeps {
  config: GatewayConfig;
  logger: GatewayLogger;
  email: EmailProvider;
  nakama: NakamaBridge;
  rates: GatewayRateLimits;
  now: () => number;
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

  async function sendNotice(to: string, templateId: EmailTemplateId, requestId: string): Promise<void> {
    if (to.length === 0) {
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
  }): Promise<{ ok: true; challengeId: string; expiresAt: number } | { ok: false }> {
    const hmac = emailLookupHash(deps.config.emailHmacPepper, input.email);
    const challengeId = generateChallengeId();
    const code = generateChallengeCode();
    const secretHash = hashChallengeSecret(deps.config.challengeHmacSecret, challengeId, code);
    const created = await deps.nakama.rpc(
      "challenge_put",
      {
        challenge_id: challengeId,
        hmac: hmac,
        secret_hash: secretHash,
        purpose: input.purpose,
        account_user_id: input.userId,
        request_id: input.requestId,
      },
      input.requestId,
      deps.now(),
    );
    if (!created.ok) {
      deps.logger.error("challenge_put_failed", { request_id: input.requestId, purpose: input.purpose });
      return { ok: false };
    }
    const expiresAt = typeof created.data.expires_at === "number" ? created.data.expires_at : deps.now() + 30 * 60 * 1000;
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
      return { ok: false, idempotent: false, reason: "invalid_challenge" };
    }
    const userId = typeof consumed.data.account_user_id === "string" ? consumed.data.account_user_id : "";
    if (input.purpose === "EMAIL_VERIFICATION" && userId.length > 0) {
      await deps.nakama.rpc("mark_verified", { user_id: userId }, input.requestId, deps.now());
    }
    if (input.purpose === "PASSWORD_RESET" && userId.length > 0 && input.password !== undefined) {
      const replaced = await deps.nakama.rpc(
        "replace_password",
        { user_id: userId, password: input.password },
        input.requestId,
        deps.now(),
      );
      if (!replaced.ok) {
        return { ok: false, idempotent: consumed.data.idempotent === true, reason: "unavailable" };
      }
      const email = typeof replaced.data.email === "string" ? replaced.data.email : "";
      await sendNotice(email, "password_changed", input.requestId);
    }
    if (input.purpose === "EMAIL_CHANGE" && userId.length > 0 && input.newEmail !== undefined && input.password !== undefined) {
      const replaced = await deps.nakama.rpc(
        "replace_email",
        { user_id: userId, new_email: input.newEmail, password: input.password },
        input.requestId,
        deps.now(),
      );
      if (!replaced.ok) {
        return { ok: false, idempotent: consumed.data.idempotent === true, reason: "unavailable" };
      }
      const hash = emailLookupHash(deps.config.emailHmacPepper, input.newEmail);
      await deps.nakama.rpc("put_email_index", { user_id: userId, hmac: hash }, input.requestId, deps.now());
    }
    if (input.purpose === "ACCOUNT_DELETION" && userId.length > 0) {
      const deleted = await deps.nakama.rpc("delete_account", { user_id: userId }, input.requestId, deps.now());
      const email = typeof deleted.data.email === "string" ? deleted.data.email : "";
      await sendNotice(email, "account_deleted", input.requestId);
    }
    return { ok: true, idempotent: consumed.data.idempotent === true, reason: "" };
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
    const email = canonicalizeEmail(body.email);
    const password = validatePassword(body.password);
    if (!email.ok || !password.ok) {
      return sendError(reply, requestId, "AUTH_VALIDATION", "auth.error.validation", 0, {
        email: email.ok ? "" : "invalid",
        password: password.ok ? "" : "invalid",
      });
    }
    const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
    const emailLimit = deps.rates.emailHash.consume("register:" + hash, deps.now());
    if (!emailLimit.allowed) {
      return sendError(reply, requestId, "AUTH_RATE_LIMITED", "auth.error.rate_limited", emailLimit.retryAfterSeconds);
    }
    const created = await deps.nakama.authenticateEmail(email.canonical, String(body.password), true);
    if (!created.ok) {
      const taken = created.message.toLowerCase().indexOf("exists") !== -1 || created.message.toLowerCase().indexOf("already") !== -1;
      return sendError(
        reply,
        requestId,
        taken ? "AUTH_EMAIL_TAKEN" : "AUTH_INVALID_CREDENTIALS",
        taken ? "auth.error.email_taken" : "auth.error.invalid_credentials",
      );
    }
    await deps.nakama.rpc("put_email_index", { user_id: created.userId, hmac: hash }, requestId, deps.now());
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
    const email = canonicalizeEmail(body.email);
    if (!email.ok || typeof body.password !== "string") {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
    }
    const result = await deps.nakama.authenticateEmail(email.canonical, body.password, false);
    if (!result.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CREDENTIALS", "auth.error.invalid_credentials");
    }
    return reply.send({ ok: true, request_id: requestId, user_id: result.userId, token: result.token, refresh_token: result.refreshToken });
  });

  app.post("/v1/auth/verify-email", async (request, reply) => {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    if (typeof body.challenge_id !== "string" || typeof body.code !== "string") {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const finished = await finishChallenge({
      purpose: "EMAIL_VERIFICATION",
      challengeId: body.challenge_id,
      code: body.code,
      requestId: requestId,
    });
    if (!finished.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    return reply.send({ ok: true, request_id: requestId, verified: true, idempotent: finished.idempotent });
  });

  app.post("/v1/auth/resend-verification", async (request, reply) => {
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
      await issueChallenge({
        purpose: "EMAIL_VERIFICATION",
        email: email.canonical,
        userId: decision.userId,
        requestId: requestId,
        templateId: "verify_email",
      });
    }
    return reply.send({ ok: true, request_id: requestId });
  });

  app.post("/v1/auth/password-reset/request", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const body = asObject(request.body);
    const email = canonicalizeEmail(body.email);
    if (email.ok) {
      const hash = emailLookupHash(deps.config.emailHmacPepper, email.canonical);
      const emailLimit = deps.rates.emailHash.consume("reset:" + hash, deps.now());
      if (!emailLimit.allowed) {
        return reply.send({ ok: true, request_id: requestId });
      }
      const lookup = await deps.nakama.rpc("lookup_email", { hmac: hash }, requestId, deps.now());
      const decision = lookup.data.decision as { ok?: boolean; userId?: string } | undefined;
      if (decision !== undefined && decision.ok === true && typeof decision.userId === "string") {
        await issueChallenge({
          purpose: "PASSWORD_RESET",
          email: email.canonical,
          userId: decision.userId,
          requestId: requestId,
          templateId: "password_reset",
        });
      }
    }
    return reply.send({ ok: true, request_id: requestId });
  });

  app.post("/v1/auth/password-reset/confirm", async (request, reply) => {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    const password = validatePassword(body.password);
    if (typeof body.challenge_id !== "string" || typeof body.code !== "string" || !password.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const finished = await finishChallenge({
      purpose: "PASSWORD_RESET",
      challengeId: body.challenge_id,
      code: body.code,
      requestId: requestId,
      password: String(body.password),
    });
    if (!finished.ok) {
      return sendError(
        reply,
        requestId,
        finished.reason === "unavailable" ? "AUTH_UNAVAILABLE" : "AUTH_INVALID_CHALLENGE",
        finished.reason === "unavailable" ? "auth.error.unavailable" : "auth.error.invalid_challenge",
      );
    }
    return reply.send({ ok: true, request_id: requestId });
  });

  app.post("/v1/auth/email-change/request", async (request, reply) => {
    const requestId = requestIdOf(request);
    if (!enforceIp(request, reply, requestId)) {
      return;
    }
    const token = bearer(request);
    if (token.length === 0) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    const account = await deps.nakama.getAccount(token);
    const body = asObject(request.body);
    const next = canonicalizeEmail(body.new_email);
    if (!account.ok || account.email.length === 0 || !next.ok) {
      return sendError(reply, requestId, "AUTH_FORBIDDEN", "auth.error.forbidden");
    }
    await issueChallenge({
      purpose: "EMAIL_CHANGE",
      email: next.canonical,
      userId: account.userId,
      requestId: requestId,
      templateId: "email_change_confirmation",
    });
    await sendNotice(account.email, "email_change_old_notice", requestId);
    return reply.send({ ok: true, request_id: requestId });
  });

  app.post("/v1/auth/email-change/confirm", async (request, reply) => {
    const requestId = requestIdOf(request);
    const body = asObject(request.body);
    const next = canonicalizeEmail(body.new_email);
    if (typeof body.challenge_id !== "string" || typeof body.code !== "string" || !next.ok || typeof body.password !== "string") {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    const finished = await finishChallenge({
      purpose: "EMAIL_CHANGE",
      challengeId: body.challenge_id,
      code: body.code,
      requestId: requestId,
      password: body.password,
      newEmail: next.canonical,
    });
    if (!finished.ok) {
      return sendError(reply, requestId, "AUTH_INVALID_CHALLENGE", "auth.error.invalid_challenge");
    }
    return reply.send({ ok: true, request_id: requestId });
  });

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
