import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayApp } from "../src/app/server";
import { loadGatewayConfig, validateGatewayConfig, ConfigError } from "../src/config/env";
import { MemoryEmailProvider } from "../src/email/memory";
import { renderEmail } from "../src/email/templates";
import { createGatewayLogger } from "../src/logging/redact";
import { GatewayRateLimits } from "../src/rate_limits/memory";
import { createChallengeRecord, consumeChallenge } from "../src/challenges/state";
import { generateChallengeCode, hashChallengeSecret, normalizeChallengeCode, emailLookupHash } from "../src/challenges/codes";
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
    AUTH_RESET_UNIFORM_MS: "0",
    AUTH_SUPPORT_LOOKUP_SECRET: "local-support-lookup-secret",
  });
}

function extractCode(text: string): string {
  const match = text.match(/Enter this code: ([A-Z0-9-]+)/);
  assert.ok(match);
  return match[1];
}

function latestTemplate(email: MemoryEmailProvider, templateId: string) {
  for (let i = email.sent.length - 1; i >= 0; i--) {
    if (email.sent[i].templateId === templateId) {
      return email.sent[i];
    }
  }
  return null;
}

async function verifyRegistered(
  app: Awaited<ReturnType<typeof build>>["app"],
  nakama: FakeNakama,
  email: MemoryEmailProvider,
  address: string,
) {
  const registered = await app.inject({ method: "POST", url: "/v1/auth/register", payload: registerPayload(address) });
  assert.equal(registered.statusCode, 200);
  const mailed = latestTemplate(email, "verify_email");
  assert.ok(mailed);
  const code = extractCode(mailed.text);
  const challenge = Array.from(nakama.challenges.records.values()).find((record) => record.purpose === "EMAIL_VERIFICATION" && record.consumed_at === 0);
  assert.ok(challenge);
  const confirmed = await app.inject({
    method: "POST",
    url: "/v1/auth/verify/confirm",
    payload: { challenge_id: challenge.challenge_id, code: code },
  });
  assert.equal(confirmed.statusCode, 200);
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload(address) });
  assert.equal(login.statusCode, 200);
  return JSON.parse(login.body) as { token: string; refresh_token: string; user_id: string };
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
  const { app, nakama, email } = await build();
  await verifyRegistered(app, nakama, email, "known@example.com");
  const missing = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "nobody@example.com", client_version: CLIENT_VERSION },
  });
  const present = await app.inject({
    method: "POST",
    url: "/v1/auth/password-reset/request",
    payload: { email: "known@example.com", client_version: CLIENT_VERSION },
  });
  const missingBody = JSON.parse(missing.body);
  const presentBody = JSON.parse(present.body);
  assert.equal(missing.statusCode, 200);
  assert.equal(present.statusCode, 200);
  assert.equal(missingBody.ok, true);
  assert.equal(presentBody.ok, true);
  assert.equal(missingBody.message, presentBody.message);
  assert.equal(missingBody.message_key, presentBody.message_key);
  assert.equal(Object.keys(missingBody).sort().join(","), Object.keys(presentBody).sort().join(","));
  assert.ok(latestTemplate(email, "password_reset"));
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
  assert.ok(message.text.toLowerCase().indexOf("ignore this message") !== -1);
  assert.ok(message.text.indexOf("https://auth.example/v1/confirm") !== -1);
  assert.ok(message.text.indexOf("ABCD-EFGH-IJKM-NPQR") !== -1);
  assert.ok(message.text.indexOf("support@example.com") !== -1);
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

const NEW_PASSWORD = "correct horse staple 2";

test("password reset success revokes sessions and does not auto-login", async () => {
  const { app, nakama, email } = await build();
  const session = await verifyRegistered(app, nakama, email, "resetok@example.com");
  const second = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("resetok@example.com") });
  assert.equal(second.statusCode, 200);
  await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "resetok@example.com", client_version: CLIENT_VERSION },
  });
  const mailed = latestTemplate(email, "password_reset");
  assert.ok(mailed);
  const code = extractCode(mailed.text);
  const confirm = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/confirm",
    payload: {
      email: "resetok@example.com",
      reset_challenge: code,
      new_password: NEW_PASSWORD,
      new_password_confirmation: NEW_PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "reset-ok-1",
    },
  });
  const body = JSON.parse(confirm.body);
  assert.equal(confirm.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.require_login, true);
  assert.equal(body.token, undefined);
  assert.equal(body.refresh_token, undefined);
  const oldLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("resetok@example.com") });
  assert.equal(oldLogin.statusCode, 401);
  const newLogin = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: loginPayload("resetok@example.com", NEW_PASSWORD),
  });
  assert.equal(newLogin.statusCode, 200);
  const refresh = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refresh_token: session.refresh_token, client_version: CLIENT_VERSION },
  });
  assert.equal(refresh.statusCode, 401);
  const replay = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/confirm",
    payload: {
      email: "resetok@example.com",
      reset_challenge: code,
      new_password: NEW_PASSWORD,
      new_password_confirmation: NEW_PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "reset-ok-replay",
    },
  });
  assert.equal(replay.statusCode, 200);
  await app.close();
});

test("password reset expiry, wrong code, and attempt limit are enforced over HTTP", async () => {
  const { app, nakama, email } = await build();
  await verifyRegistered(app, nakama, email, "resetfail@example.com");
  await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "resetfail@example.com", client_version: CLIENT_VERSION },
  });
  const mailed = latestTemplate(email, "password_reset");
  assert.ok(mailed);
  const code = extractCode(mailed.text);
  const challenge = Array.from(nakama.challenges.records.values()).find((record) => record.purpose === "PASSWORD_RESET");
  assert.ok(challenge);
  const stored = nakama.challenges.get(challenge.challenge_id);
  assert.ok(stored);
  assert.equal(JSON.stringify(stored).indexOf(code), -1);
  const expiredCopy = { ...stored, expires_at: 1 };
  nakama.challenges.records.set(challenge.challenge_id, expiredCopy);
  const expired = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/confirm",
    payload: {
      email: "resetfail@example.com",
      reset_challenge: code,
      new_password: NEW_PASSWORD,
      new_password_confirmation: NEW_PASSWORD,
      client_version: CLIENT_VERSION,
    },
  });
  assert.equal(expired.statusCode, 401);
  assert.equal(JSON.parse(expired.body).code, "AUTH_CHALLENGE_EXPIRED");
  nakama.challenges.records.set(challenge.challenge_id, { ...stored, expires_at: stored.expires_at, attempt_count: 0, consumed_at: 0 });
  for (let i = 0; i < 5; i++) {
    const wrong = await app.inject({
      method: "POST",
      url: "/v1/auth/password/reset/confirm",
      payload: {
        email: "resetfail@example.com",
        reset_challenge: "AAAA-BBBB-CCCC-DDDD",
        new_password: NEW_PASSWORD,
        new_password_confirmation: NEW_PASSWORD,
        client_version: CLIENT_VERSION,
      },
    });
    assert.equal(wrong.statusCode, 401);
  }
  const locked = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/confirm",
    payload: {
      email: "resetfail@example.com",
      reset_challenge: code,
      new_password: NEW_PASSWORD,
      new_password_confirmation: NEW_PASSWORD,
      client_version: CLIENT_VERSION,
    },
  });
  assert.equal(locked.statusCode, 401);
  assert.equal(JSON.parse(locked.body).code, "AUTH_CHALLENGE_LOCKED");
  await app.close();
});

test("password reset rate limits apply per email hash", async () => {
  const { app } = await build();
  let limited = 0;
  for (let i = 0; i < 6; i++) {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/password/reset/request",
      payload: { email: "ratelimit-reset@example.com", client_version: CLIENT_VERSION },
    });
    if (response.statusCode === 429) {
      limited += 1;
    }
  }
  assert.ok(limited > 0);
  await app.close();
});

test("email provider failure does not change the generic reset response", async () => {
  const { app, email } = await build();
  email.failNext = true;
  const missing = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "provider-miss@example.com", client_version: CLIENT_VERSION },
  });
  email.failNext = true;
  const present = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "provider-hit@example.com", client_version: CLIENT_VERSION },
  });
  assert.equal(missing.statusCode, 200);
  assert.equal(present.statusCode, 200);
  assert.equal(JSON.parse(missing.body).message, JSON.parse(present.body).message);
  await app.close();
});

test("logged-in password change verifies the current password and revokes sessions", async () => {
  const { app, nakama, email } = await build();
  const session = await verifyRegistered(app, nakama, email, "changepw@example.com");
  const wrong = await app.inject({
    method: "POST",
    url: "/v1/account/password/change",
    headers: { authorization: "Bearer " + session.token },
    payload: {
      current_password: "wrong password 15x",
      new_password: NEW_PASSWORD,
      new_password_confirmation: NEW_PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "pw-change-wrong",
    },
  });
  assert.equal(wrong.statusCode, 401);
  const reuse = await app.inject({
    method: "POST",
    url: "/v1/account/password/change",
    headers: { authorization: "Bearer " + session.token },
    payload: {
      current_password: PASSWORD,
      new_password: PASSWORD,
      new_password_confirmation: PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "pw-change-reuse",
    },
  });
  assert.equal(reuse.statusCode, 400);
  assert.equal(JSON.parse(reuse.body).code, "AUTH_PASSWORD_REUSE");
  const changed = await app.inject({
    method: "POST",
    url: "/v1/account/password/change",
    headers: { authorization: "Bearer " + session.token },
    payload: {
      current_password: PASSWORD,
      new_password: NEW_PASSWORD,
      new_password_confirmation: NEW_PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "pw-change-ok",
    },
  });
  assert.equal(changed.statusCode, 200);
  assert.equal(JSON.parse(changed.body).require_login, true);
  const refresh = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    payload: { refresh_token: session.refresh_token, client_version: CLIENT_VERSION },
  });
  assert.equal(refresh.statusCode, 401);
  const oldLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("changepw@example.com") });
  assert.equal(oldLogin.statusCode, 401);
  const newLogin = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: loginPayload("changepw@example.com", NEW_PASSWORD),
  });
  assert.equal(newLogin.statusCode, 200);
  await app.close();
});

test("email change succeeds, rejects duplicates, and rolls back without locking addresses", async () => {
  const { app, nakama, email } = await build();
  const first = await verifyRegistered(app, nakama, email, "oldmail@example.com");
  await verifyRegistered(app, nakama, email, "taken@example.com");
  const duplicate = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/request",
    headers: { authorization: "Bearer " + first.token },
    payload: {
      current_password: PASSWORD,
      new_email: "taken@example.com",
      client_version: CLIENT_VERSION,
      idempotency_key: "email-dup",
    },
  });
  assert.equal(duplicate.statusCode, 409);
  nakama.failReplaceEmail = true;
  const rollbackRequest = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/request",
    headers: { authorization: "Bearer " + first.token },
    payload: {
      current_password: PASSWORD,
      new_email: "rollback@example.com",
      client_version: CLIENT_VERSION,
      idempotency_key: "email-rollback-req",
    },
  });
  assert.equal(rollbackRequest.statusCode, 200);
  const rollbackMail = latestTemplate(email, "email_change_confirmation");
  assert.ok(rollbackMail);
  const rollbackCode = extractCode(rollbackMail.text);
  const rollbackConfirm = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/confirm",
    payload: {
      new_email: "rollback@example.com",
      email_change_challenge: rollbackCode,
      password: PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "email-rollback-confirm",
    },
  });
  assert.equal(rollbackConfirm.statusCode, 503);
  const oldStillWorks = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("oldmail@example.com") });
  assert.equal(oldStillWorks.statusCode, 200);
  const rollbackLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("rollback@example.com") });
  assert.equal(rollbackLogin.statusCode, 401);
  const fresh = JSON.parse(oldStillWorks.body);
  const request = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/request",
    headers: { authorization: "Bearer " + fresh.token },
    payload: {
      current_password: PASSWORD,
      new_email: "newmail@example.com",
      client_version: CLIENT_VERSION,
      idempotency_key: "email-ok-req",
    },
  });
  assert.equal(request.statusCode, 200);
  const confirmMail = latestTemplate(email, "email_change_confirmation");
  assert.ok(confirmMail);
  const code = extractCode(confirmMail.text);
  const expiredChallenge = Array.from(nakama.challenges.records.values()).find((record) => record.purpose === "EMAIL_CHANGE" && record.consumed_at === 0);
  assert.ok(expiredChallenge);
  nakama.challenges.records.set(expiredChallenge.challenge_id, { ...expiredChallenge, expires_at: 1 });
  const expired = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/confirm",
    payload: {
      new_email: "newmail@example.com",
      email_change_challenge: code,
      password: PASSWORD,
      client_version: CLIENT_VERSION,
    },
  });
  assert.equal(expired.statusCode, 401);
  nakama.challenges.records.set(expiredChallenge.challenge_id, { ...expiredChallenge, expires_at: expiredChallenge.expires_at });
  const confirm = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/confirm",
    payload: {
      new_email: "newmail@example.com",
      email_change_challenge: code,
      password: PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "email-ok-confirm",
    },
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(JSON.parse(confirm.body).require_login, true);
  const oldRejected = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("oldmail@example.com") });
  assert.equal(oldRejected.statusCode, 401);
  const newAccepted = await app.inject({ method: "POST", url: "/v1/auth/login", payload: loginPayload("newmail@example.com") });
  assert.equal(newAccepted.statusCode, 200);
  assert.equal(JSON.parse(newAccepted.body).user_id, first.user_id);
  const config = testConfig();
  const oldHash = emailLookupHash(config.emailHmacPepper, "oldmail@example.com");
  const newHash = emailLookupHash(config.emailHmacPepper, "newmail@example.com");
  const stale = await nakama.rpc("lookup_email", { hmac: oldHash }, "stale", Date.now());
  assert.equal((stale.data.decision as { ok?: boolean }).ok, false);
  const live = await nakama.rpc("lookup_email", { hmac: newHash }, "live", Date.now());
  assert.equal((live.data.decision as { ok?: boolean }).ok, true);
  assert.ok(latestTemplate(email, "email_changed_old"));
  assert.ok(latestTemplate(email, "email_changed_new"));
  await app.close();
});

test("forgotten-email help reveals no email and support lookup is admin-only", async () => {
  const { app, nakama, email, logger } = await build();
  const session = await verifyRegistered(app, nakama, email, "hidden@example.com");
  nakama.characterNames.set(session.user_id, ["HeroName"]);
  nakama.nameReservations.set("heroname", session.user_id);
  const help = await app.inject({ method: "GET", url: "/v1/account/forgot-email" });
  assert.equal(help.statusCode, 200);
  assert.equal(help.body.indexOf("hidden@example.com"), -1);
  assert.ok(help.body.indexOf("Forgot which email you used?") !== -1);
  assert.equal(help.body.indexOf("<form"), -1);
  const denied = await app.inject({
    method: "POST",
    url: "/v1/support/lookup",
    payload: { character_name: "HeroName" },
  });
  assert.equal(denied.statusCode, 403);
  const lookup = await app.inject({
    method: "POST",
    url: "/v1/support/lookup",
    headers: { "x-support-key": "local-support-lookup-secret" },
    payload: { character_name: "HeroName" },
  });
  const body = JSON.parse(lookup.body);
  assert.equal(lookup.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.user_id, session.user_id);
  assert.deepEqual(body.character_names, ["HeroName"]);
  assert.equal(body.email, undefined);
  assert.equal(JSON.stringify(body).indexOf("hidden@example.com"), -1);
  const joined = logger.lines.join("\n");
  assert.equal(joined.indexOf("hidden@example.com"), -1);
  assert.equal(joined.indexOf("HeroName"), -1);
  await app.close();
});

test("reset request timing helper is invoked for hits and misses", async () => {
  const delays: number[] = [];
  const config = testConfig();
  config.resetUniformMs = 150;
  const nakama = new FakeNakama();
  const email = new MemoryEmailProvider();
  const app = createGatewayApp({
    config: config,
    logger: createGatewayLogger(false),
    email: email,
    nakama: nakama,
    rates: new GatewayRateLimits(),
    now: () => 1000,
    delay: async (ms) => {
      delays.push(ms);
    },
  });
  await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "timing-miss@example.com", client_version: CLIENT_VERSION },
  });
  await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    payload: { email: "timing-hit@example.com", client_version: CLIENT_VERSION },
  });
  assert.equal(delays.length, 2);
  assert.equal(delays[0], delays[1]);
  await app.close();
});

