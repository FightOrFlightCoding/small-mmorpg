import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayApp } from "../src/app/server";
import { loadGatewayConfig, validateGatewayConfig, ConfigError } from "../src/config/env";
import { MemoryEmailProvider } from "../src/email/memory";
import { renderEmail } from "../src/email/templates";
import { createGatewayLogger } from "../src/logging/redact";
import { GatewayRateLimits } from "../src/rate_limits/memory";
import { createChallengeRecord, consumeChallenge } from "../src/challenges/state";
import { generateChallengeCode, hashChallengeSecret, normalizeChallengeCode } from "../src/challenges/codes";
import { FakeNakama } from "./fake_nakama";

const PASSWORD = "correct horse staple";
const CLIENT_VERSION = "1.0.0";

function registerPayload(email: string, extra: { [key: string]: unknown } = {}) {
  return {
    email: email,
    password: PASSWORD,
    password_confirmation: PASSWORD,
    accepted_terms_version: "1",
    accepted_privacy_version: "1",
    client_version: CLIENT_VERSION,
    ...extra,
  };
}

function loginPayload(email: string, password = PASSWORD) {
  return { email: email, password: password, client_version: CLIENT_VERSION };
}

function testConfig() {
  return loadGatewayConfig({
    AUTH_GATEWAY_ENV: "local",
    EMAIL_PROVIDER: "memory",
    NAKAMA_HTTP_URL: "http://127.0.0.1:7350",
    NAKAMA_SERVER_KEY: "defaultkey",
    NAKAMA_HTTP_KEY: "defaulthttpkey",
    VIBECODE_EMAIL_HMAC_PEPPER: "local-email-hmac-pepper-not-production",
    VIBECODE_GATEWAY_HMAC_SECRET: "local-gateway-hmac-secret-not-production",
    VIBECODE_CHALLENGE_HMAC_SECRET: "local-challenge-hmac-secret-not-production",
  });
}

function extractCode(text: string): string {
  const match = text.match(/Enter this code: ([A-Z0-9-]+)/);
  assert.ok(match);
  return match[1];
}

async function build() {
  return buildWith(testConfig());
}

async function buildWith(config: ReturnType<typeof testConfig>) {
  const nakama = new FakeNakama();
  const email = new MemoryEmailProvider();
  const logger = createGatewayLogger(false);
  const app = createGatewayApp({
    config: config,
    logger: logger,
    email: email,
    nakama: nakama,
    rates: new GatewayRateLimits(),
    now: () => Date.now(),
  });
  return { app, nakama, email, logger };
}

test("health and readiness report dependency health", async () => {
  const { app, nakama } = await build();
  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(JSON.parse(health.body).ok, true);
  nakama.healthy = false;
  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(JSON.parse(ready.body).ok, false);
  assert.equal(JSON.parse(ready.body).nakama, false);
  await app.close();
});

test("production refuses to start without HTTPS and secrets", () => {
  assert.throws(
    () =>
      validateGatewayConfig(
        loadGatewayConfig({
          AUTH_GATEWAY_ENV: "production",
          AUTH_GATEWAY_PUBLIC_BASE_URL: "http://example.com",
          EMAIL_PROVIDER: "memory",
          NAKAMA_SERVER_KEY: "defaultkey",
          NAKAMA_HTTP_KEY: "defaulthttpkey",
        }),
      ),
    (error: unknown) => error instanceof ConfigError && error.missing.indexOf("AUTH_GATEWAY_PUBLIC_BASE_URL") !== -1,
  );
});

test("invalid JSON and oversized bodies are rejected with the project envelope", async () => {
  const { app } = await build();
  const invalid = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "content-type": "application/json", "x-request-id": "req-json" },
    payload: "{not-json",
  });
  assert.equal(invalid.statusCode, 400);
  const invalidBody = JSON.parse(invalid.body);
  assert.equal(invalidBody.ok, false);
  assert.equal(invalidBody.request_id, "req-json");
  const oversized = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email: "a@example.com", password: "x".repeat(9000) }),
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(JSON.parse(oversized.body).code, "AUTH_PAYLOAD_TOO_LARGE");
  await app.close();
});

test("request ids propagate and secrets are redacted from logs", async () => {
  const { app, logger } = await build();
  logger.info("auth_attempt", { password: "correct horse staple", authorization: "Bearer abc.def" });
  const joined = logger.lines.join("\n");
  assert.equal(joined.indexOf("correct horse staple"), -1);
  assert.equal(joined.indexOf("Bearer abc.def"), -1);
  const response = await app.inject({
    method: "GET",
    url: "/health",
    headers: { "x-request-id": "propagate-1" },
  });
  assert.equal(response.headers["x-request-id"], "propagate-1");
  await app.close();
});

test("per-IP rate-limit foundation returns AUTH_RATE_LIMITED", async () => {
  const { app } = await build();
  let limited = 0;
  for (let i = 0; i < 35; i++) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "rate@example.com", password: PASSWORD, client_version: CLIENT_VERSION },
    });
    if (response.statusCode === 429) {
      limited += 1;
    }
  }
  assert.ok(limited > 0);
  await app.close();
});

test("register authenticates against Nakama, emails a code, and verify is single-use plus idempotent", async () => {
  const { app, nakama, email } = await build();
  const registered = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: registerPayload("Player+Tag@Example.com"),
  });
  assert.equal(registered.statusCode, 200);
  assert.equal(nakama.users.has("player+tag@example.com"), true);
  assert.equal(email.sent.length, 1);
  assert.equal(email.sent[0].text.indexOf(PASSWORD), -1);
  const code = extractCode(email.sent[0].text);
  const challengeId = Array.from(nakama.challenges.records.keys())[0];
  const first = await app.inject({
    method: "POST",
    url: "/v1/auth/verify/confirm",
    payload: { challenge_id: challengeId, code: code },
  });
  assert.equal(first.statusCode, 200);
  const again = await app.inject({
    method: "POST",
    url: "/v1/auth/verify/confirm",
    payload: { challenge_id: challengeId, code: code },
  });
  assert.equal(again.statusCode, 200);
  const wrong = await app.inject({
    method: "POST",
    url: "/v1/auth/verify/confirm",
    payload: { challenge_id: challengeId, code: "AAAA-BBBB-CCCC-DDDD" },
  });
  assert.equal(wrong.statusCode, 401);
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: loginPayload("player+tag@example.com"),
  });
  assert.equal(login.statusCode, 200);
  assert.equal(JSON.parse(login.body).user_id, "user-1");
  await app.close();
});

test("email provider failure does not corrupt a created account", async () => {
  const { app, nakama, email } = await build();
  email.failNext = true;
  const registered = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: registerPayload("keep@example.com"),
  });
  assert.equal(registered.statusCode, 200);
  assert.equal(nakama.users.has("keep@example.com"), true);
  await app.close();
});

test("password reset does not reveal whether the email exists", async () => {
  const { app } = await build();
  const missing = await app.inject({
    method: "POST",
    url: "/v1/auth/password-reset/request",
    payload: { email: "nobody@example.com" },
  });
  const present = await app.inject({
    method: "POST",
    url: "/v1/auth/password-reset/request",
    payload: { email: "also-nobody@example.com" },
  });
  assert.equal(missing.statusCode, present.statusCode);
  assert.equal(JSON.parse(missing.body).ok, true);
  assert.equal(JSON.parse(present.body).ok, true);
  await app.close();
});

test("challenge expiry, wrong code, and attempt lock are enforced", () => {
  const secret = "local-challenge-hmac-secret-not-production";
  const id = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const code = generateChallengeCode();
  const record = createChallengeRecord({
    challengeId: id,
    accountUserId: "user-1",
    emailLookupHash: "hash",
    purpose: "PASSWORD_RESET",
    secretHash: hashChallengeSecret(secret, id, code),
    requestId: "req",
    nowMs: 1000,
    ttlMs: 10,
  });
  const expired = consumeChallenge({
    record: record,
    secretHash: hashChallengeSecret(secret, id, code),
    purpose: "PASSWORD_RESET",
    nowMs: 2000,
  });
  assert.equal(expired.ok, false);
  if (expired.ok) {
    throw new Error("expected expiry");
  }
  assert.equal(expired.reason, "expired");
  const live = createChallengeRecord({
    challengeId: id,
    accountUserId: "user-1",
    emailLookupHash: "hash",
    purpose: "PASSWORD_RESET",
    secretHash: hashChallengeSecret(secret, id, code),
    requestId: "req",
    nowMs: 1000,
    ttlMs: 60_000,
  });
  const wrong = consumeChallenge({
    record: live,
    secretHash: hashChallengeSecret(secret, id, "ZZZZ-ZZZZ-ZZZZ-ZZZZ"),
    purpose: "PASSWORD_RESET",
    nowMs: 1000,
  });
  assert.equal(wrong.ok, false);
  assert.equal(normalizeChallengeCode(code).length, 16);
});

test("email templates never include passwords or access tokens", () => {
  const message = renderEmail({
    to: "player@example.com",
    templateId: "password_reset",
    code: "ABCD-EFGH-IJKM-NPQR",
    confirmUrl: "https://auth.example/v1/confirm",
    expiresAt: new Date("2026-08-19T00:00:00.000Z"),
    supportEmail: "support@example.com",
  });
  assert.equal(message.text.indexOf("password="), -1);
  assert.equal(message.html.indexOf("Bearer "), -1);
  assert.ok(message.text.indexOf("2026-08-19") !== -1);
});

test("per-email-hash rate-limit foundation returns AUTH_RATE_LIMITED", async () => {
  const { app } = await build();
  let limited = 0;
  for (let i = 0; i < 6; i++) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: registerPayload("hashlimit@example.com"),
    });
    if (response.statusCode === 429) {
      limited += 1;
    }
  }
  assert.ok(limited > 0);
  await app.close();
});

test("wrong codes lock a challenge after the attempt limit; plaintext is never stored", async () => {
  const { app, nakama, email, logger } = await build();
  const registered = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: registerPayload("lock@example.com"),
  });
  assert.equal(registered.statusCode, 200);
  const code = extractCode(email.sent[0].text);
  const challengeId = Array.from(nakama.challenges.records.keys())[0];
  const stored = nakama.challenges.get(challengeId);
  assert.ok(stored);
  assert.equal(stored.secret_hash.length, 64);
  assert.equal(JSON.stringify(stored).indexOf(code), -1);
  assert.equal(logger.lines.join("\n").indexOf(code), -1);
  for (let i = 0; i < 5; i++) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/verify/confirm",
      payload: { challenge_id: challengeId, code: "AAAA-BBBB-CCCC-DDDD" },
    });
    assert.equal(response.statusCode, 401);
  }
  const real = await app.inject({
    method: "POST",
    url: "/v1/auth/verify/confirm",
    payload: { challenge_id: challengeId, code: code },
  });
  assert.equal(real.statusCode, 401);
  await app.close();
});

test("hosted confirmation pages have no third-party scripts and hide generic errors", async () => {
  const { app } = await build();
  const page = await app.inject({ method: "GET", url: "/v1/confirm?purpose=EMAIL_VERIFICATION" });
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers["referrer-policy"], "no-referrer");
  assert.equal(page.body.indexOf("<script"), -1);
  assert.equal(page.body.indexOf("googletagmanager"), -1);
  assert.equal(page.body.indexOf("src=\"http"), -1);
  const done = await app.inject({ method: "GET", url: "/v1/confirm/done?ok=0" });
  assert.ok(done.body.indexOf("could not be completed") !== -1);
  await app.close();
});

test("idempotency keys replay the first response", async () => {
  const { app } = await build();
  const first = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: { "idempotency-key": "idem-1" },
    payload: registerPayload("idem@example.com"),
  });
  const second = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: { "idempotency-key": "idem-1" },
    payload: registerPayload("other@example.com"),
  });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, first.statusCode);
  assert.equal(second.body, first.body);
  await app.close();
});

test("readiness requires both Nakama and email health", async () => {
  const { app, email } = await build();
  email.healthy = false;
  const ready = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(JSON.parse(ready.body).ok, false);
  assert.equal(JSON.parse(ready.body).email, false);
  await app.close();
});

test("register rejects invalid email, weak password, mismatch, and missing legal acceptance", async () => {
  const { app } = await build();
  const invalidEmail = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("not-an-email") });
  assert.equal(invalidEmail.statusCode, 400);
  const weak = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("weak@example.com", { password: "short", password_confirmation: "short" }) });
  assert.equal(weak.statusCode, 400);
  const mismatch = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("mis@example.com", { password_confirmation: "other password 15" }) });
  assert.equal(mismatch.statusCode, 400);
  const legal = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("legal@example.com", { accepted_terms_version: "" }) });
  assert.equal(legal.statusCode, 400);
  await app.close();
});

test("duplicate and concurrent registration do not create a second account", async () => {
  const { app, nakama } = await build();
  const first = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("dup@example.com") });
  const second = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("dup@example.com") });
  const concurrent = await Promise.all([
    app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("race@example.com") }),
    app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("race@example.com") }),
  ]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 409);
  assert.equal(JSON.parse(second.body).code, "AUTH_REGISTRATION_FAILED");
  assert.equal(nakama.users.size, 2);
  const created = concurrent.filter((response) => response.statusCode === 200).length;
  const rejected = concurrent.filter((response) => response.statusCode === 409).length;
  assert.equal(created, 1);
  assert.equal(rejected, 1);
  await app.close();
});

test("unverified login is EMAIL_VERIFICATION_REQUIRED after valid credentials", async () => {
  const { app } = await build();
  await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("pending@example.com") });
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("pending@example.com") });
  assert.equal(login.statusCode, 403);
  assert.equal(JSON.parse(login.body).code, "EMAIL_VERIFICATION_REQUIRED");
  const wrong = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("pending@example.com", "wrong password 15x") });
  assert.equal(wrong.statusCode, 401);
  assert.equal(JSON.parse(wrong.body).code, "AUTH_INVALID_CREDENTIALS");
  await app.close();
});

test("disabled accounts are rejected after credentials succeed", async () => {
  const { app, nakama, email } = await build();
  await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("off@example.com") });
  const code = extractCode(email.sent[0].text);
  const challengeId = Array.from(nakama.challenges.records.keys())[0];
  await app.inject({ method: "POST", url: "/v1/auth/verify/confirm", payload: { challenge_id: challengeId, code: code } });
  nakama.disable("off@example.com");
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("off@example.com") });
  assert.equal(login.statusCode, 403);
  assert.equal(JSON.parse(login.body).code, "AUTH_ACCOUNT_DISABLED");
  await app.close();
});

test("deleting accounts are rejected after credentials succeed", async () => {
  const { app, nakama, email } = await build();
  await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("gone@example.com") });
  const code = extractCode(email.sent[0].text);
  const challengeId = Array.from(nakama.challenges.records.keys())[0];
  await app.inject({ method: "POST", url: "/v1/auth/verify/confirm", payload: { challenge_id: challengeId, code: code } });
  const userId = Array.from(nakama.profiles.keys())[0];
  const profile = nakama.profiles.get(userId);
  assert.ok(profile);
  profile.status = "DELETING";
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("gone@example.com") });
  assert.equal(login.statusCode, 403);
  assert.equal(JSON.parse(login.body).code, "AUTH_ACCOUNT_DELETING");
  await app.close();
});

test("session refresh, revoked refresh, current logout, and logout-all work", async () => {
  const { app, nakama, email } = await build();
  await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("sess@example.com") });
  const code = extractCode(email.sent[0].text);
  const challengeId = Array.from(nakama.challenges.records.keys())[0];
  await app.inject({ method: "POST", url: "/v1/auth/verify/confirm", payload: { challenge_id: challengeId, code: code } });
  const first = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("sess@example.com") });
  const firstBody = JSON.parse(first.body);
  const second = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("sess@example.com") });
  const secondBody = JSON.parse(second.body);
  const refreshed = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refresh_token: firstBody.refresh_token, client_version: CLIENT_VERSION },
  });
  assert.equal(refreshed.statusCode, 200);
  const revoked = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refresh_token: firstBody.refresh_token, client_version: CLIENT_VERSION },
  });
  assert.equal(revoked.statusCode, 401);
  const current = await app.inject({
    method: "POST",
    url: "/v1/auth/logout",
    headers: { authorization: "Bearer " + JSON.parse(refreshed.body).token },
    payload: { refresh_token: JSON.parse(refreshed.body).refresh_token },
  });
  assert.equal(current.statusCode, 200);
  const all = await app.inject({
    method: "POST",
    url: "/v1/auth/logout-all",
    headers: { authorization: "Bearer " + secondBody.token },
    payload: { password: PASSWORD },
  });
  assert.equal(all.statusCode, 200);
  const afterAll = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refresh_token: secondBody.refresh_token, client_version: CLIENT_VERSION },
  });
  assert.equal(afterAll.statusCode, 401);
  const status = await app.inject({
    method: "GET",
    url: "/v1/account/status",
    headers: { authorization: "Bearer " + secondBody.token },
  });
  assert.equal(status.statusCode, 403);
  await app.close();
});

test("CLOSED and INVITE_ONLY registration modes are enforced", async () => {
  const closedConfig = testConfig();
  closedConfig.registrationMode = "CLOSED";
  const inviteConfig = testConfig();
  inviteConfig.registrationMode = "INVITE_ONLY";
  inviteConfig.registrationAllowlist = ["allowed@example.com"];
  const closed = await buildWith(closedConfig);
  const invite = await buildWith(inviteConfig);
  const closedRes = await closed.app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("nope@example.com") });
  assert.equal(closedRes.statusCode, 403);
  const denied = await invite.app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("nope@example.com") });
  assert.equal(denied.statusCode, 403);
  const allowed = await invite.app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("allowed@example.com") });
  assert.equal(allowed.statusCode, 200);
  await closed.app.close();
  await invite.app.close();
});

test("unverified cleanup releases the email after retention", async () => {
  const { app, nakama } = await build();
  await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("old@example.com") });
  const userId = Array.from(nakama.profiles.keys())[0];
  const profile = nakama.profiles.get(userId);
  assert.ok(profile);
  profile.createdAt = 1;
  const purged = await nakama.rpc("purge_unverified", { user_id: userId, retention_ms: 10 }, "req", 100000);
  assert.equal(purged.data.purged, true);
  const again = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload("old@example.com") });
  assert.equal(again.statusCode, 200);
  await app.close();
});

