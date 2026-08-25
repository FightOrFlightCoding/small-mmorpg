import assert from "node:assert/strict";
import test from "node:test";
import { createGatewayApp } from "../src/app/server";
import { loadGatewayConfig } from "../src/config/env";
import { MemoryEmailProvider } from "../src/email/memory";
import { createGatewayLogger } from "../src/logging/redact";
import { GatewayRateLimits } from "../src/rate_limits/memory";
import { FakeNakama } from "./fake_nakama";

const PASSWORD = "correct horse staple";
const NEXT_PASSWORD = "correct horse battery";
const CLIENT_VERSION = "1.0.0";

function registerPayload(email: string) {
  return {
    email: email,
    password: PASSWORD,
    password_confirmation: PASSWORD,
    accepted_terms_version: "1",
    accepted_privacy_version: "1",
    client_version: CLIENT_VERSION,
  };
}

function headers(ip: string, extra: { [key: string]: string } = {}) {
  return { "x-forwarded-for": ip, ...extra };
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

async function build() {
  const nakama = new FakeNakama();
  const email = new MemoryEmailProvider();
  const logger = createGatewayLogger(false);
  const app = createGatewayApp({
    config: testConfig(),
    logger: logger,
    email: email,
    nakama: nakama,
    rates: new GatewayRateLimits(),
    now: () => Date.now(),
  });
  return { app, nakama, email, logger };
}

async function registerVerifyLogin(
  app: Awaited<ReturnType<typeof build>>["app"],
  nakama: FakeNakama,
  mail: MemoryEmailProvider,
  address: string,
  ip: string,
) {
  const registered = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: headers(ip),
    payload: registerPayload(address),
  });
  assert.equal(registered.statusCode, 200, registered.body);
  const mailed = latestTemplate(mail, "verify_email");
  assert.ok(mailed);
  const code = extractCode(mailed.text);
  const challenge = Array.from(nakama.challenges.records.values()).find(
    (record) => record.purpose === "EMAIL_VERIFICATION" && record.consumed_at === 0 && record.email_lookup_hash.length > 0,
  );
  assert.ok(challenge);
  const confirmed = await app.inject({
    method: "POST",
    url: "/v1/auth/verify/confirm",
    headers: headers(ip),
    payload: { challenge_id: challenge.challenge_id, code: code },
  });
  assert.equal(confirmed.statusCode, 200, confirmed.body);
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers(ip),
    payload: { email: address, password: PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.equal(login.statusCode, 200, login.body);
  return JSON.parse(login.body) as { token: string; refresh_token: string; user_id: string };
}

test("five independent accounts register, verify, login, and reject a duplicate email", async () => {
  const { app, nakama, email, logger } = await build();
  const sessions = [];
  for (let i = 0; i < 5; i++) {
    sessions.push(await registerVerifyLogin(app, nakama, email, "player" + i + "@example.com", "10.0.0." + (i + 1)));
  }
  const ids = sessions.map((row) => row.user_id);
  assert.equal(new Set(ids).size, 5);
  const duplicate = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: headers("10.0.0.9"),
    payload: registerPayload("player0@example.com"),
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(JSON.parse(duplicate.body).code, "AUTH_REGISTRATION_FAILED");
  const joined = logger.lines.join("\n");
  assert.ok(joined.indexOf("account_created") >= 0);
  assert.ok(joined.indexOf("email_verified") >= 0);
  assert.ok(joined.indexOf("login_success") >= 0);
  assert.equal(joined.indexOf(PASSWORD), -1);
  await app.close();
});

test("logout-all, password reset, email change, and deleted-email reuse stay isolated", async () => {
  const { app, nakama, email } = await build();
  const first = await registerVerifyLogin(app, nakama, email, "lifecycle@example.com", "10.1.0.1");
  const secondDevice = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers("10.1.0.2"),
    payload: { email: "lifecycle@example.com", password: PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.equal(secondDevice.statusCode, 200);
  const all = await app.inject({
    method: "POST",
    url: "/v1/auth/logout-all",
    headers: headers("10.1.0.1", { authorization: "Bearer " + first.token }),
    payload: { password: PASSWORD },
  });
  assert.equal(all.statusCode, 200, all.body);
  const staleRefresh = await app.inject({
    method: "POST",
    url: "/v1/auth/refresh",
    headers: headers("10.1.0.2"),
    payload: { refresh_token: JSON.parse(secondDevice.body).refresh_token, client_version: CLIENT_VERSION },
  });
  assert.equal(staleRefresh.statusCode, 401);

  const reset = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/request",
    headers: headers("10.1.0.3"),
    payload: { email: "lifecycle@example.com", client_version: CLIENT_VERSION },
  });
  assert.equal(reset.statusCode, 200);
  const resetMail = latestTemplate(email, "password_reset");
  assert.ok(resetMail);
  const resetCode = extractCode(resetMail.text);
  const resetChallenge = Array.from(nakama.challenges.records.values()).find(
    (record) => record.purpose === "PASSWORD_RESET" && record.consumed_at === 0,
  );
  assert.ok(resetChallenge);
  const confirmReset = await app.inject({
    method: "POST",
    url: "/v1/auth/password/reset/confirm",
    headers: headers("10.1.0.3"),
    payload: {
      email: "lifecycle@example.com",
      reset_challenge: resetCode,
      new_password: NEXT_PASSWORD,
      new_password_confirmation: NEXT_PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "reset-1",
    },
  });
  assert.equal(confirmReset.statusCode, 200, confirmReset.body);
  assert.equal(JSON.parse(confirmReset.body).token, undefined);
  const oldPassword = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers("10.1.0.4"),
    payload: { email: "lifecycle@example.com", password: PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.equal(oldPassword.statusCode, 401);
  const fresh = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers("10.1.0.4"),
    payload: { email: "lifecycle@example.com", password: NEXT_PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.equal(fresh.statusCode, 200, fresh.body);
  const token = JSON.parse(fresh.body).token as string;
  const originalId = JSON.parse(fresh.body).user_id as string;

  const change = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/request",
    headers: headers("10.1.0.5", { authorization: "Bearer " + token, "idempotency-key": "email-1" }),
    payload: { current_password: NEXT_PASSWORD, new_email: "lifecycle-new@example.com" },
  });
  assert.equal(change.statusCode, 200, change.body);
  const changeMail = latestTemplate(email, "email_change_confirmation");
  assert.ok(changeMail);
  const changeCode = extractCode(changeMail.text);
  const changeChallenge = Array.from(nakama.challenges.records.values()).find(
    (record) => record.purpose === "EMAIL_CHANGE" && record.consumed_at === 0,
  );
  assert.ok(changeChallenge);
  const confirmChange = await app.inject({
    method: "POST",
    url: "/v1/account/email/change/confirm",
    headers: headers("10.1.0.5"),
    payload: {
      new_email: "lifecycle-new@example.com",
      email_change_challenge: changeCode,
      password: NEXT_PASSWORD,
      client_version: CLIENT_VERSION,
      idempotency_key: "email-1-confirm",
    },
  });
  assert.equal(confirmChange.statusCode, 200, confirmChange.body);
  const oldEmailLogin = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers("10.1.0.6"),
    payload: { email: "lifecycle@example.com", password: NEXT_PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.equal(oldEmailLogin.statusCode, 401);
  const newEmailLogin = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers("10.1.0.6"),
    payload: { email: "lifecycle-new@example.com", password: NEXT_PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.equal(newEmailLogin.statusCode, 200);
  assert.equal(JSON.parse(newEmailLogin.body).user_id, originalId);

  const live = await registerVerifyLogin(app, nakama, email, "delete-me@example.com", "10.2.0.1");
  const delReq = await app.inject({
    method: "POST",
    url: "/v1/account/delete/request",
    headers: headers("10.2.0.1", { authorization: "Bearer " + live.token, "idempotency-key": "del-1" }),
    payload: { password: PASSWORD },
  });
  assert.equal(delReq.statusCode, 200, delReq.body);
  const delMail = latestTemplate(email, "account_deletion_confirmation");
  assert.ok(delMail);
  const delCode = extractCode(delMail.text);
  const delChallenge = Array.from(nakama.challenges.records.values()).find(
    (record) => record.purpose === "ACCOUNT_DELETION" && record.consumed_at === 0,
  );
  assert.ok(delChallenge);
  const delConfirm = await app.inject({
    method: "POST",
    url: "/v1/account/delete/confirm",
    headers: headers("10.2.0.1", { authorization: "Bearer " + live.token, "idempotency-key": "del-1" }),
    payload: {
      password: PASSWORD,
      phrase: "DELETE ACCOUNT",
      code: delCode,
    },
  });
  assert.equal(delConfirm.statusCode, 200, delConfirm.body);
  const afterDelete = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: headers("10.2.0.2"),
    payload: { email: "delete-me@example.com", password: PASSWORD, client_version: CLIENT_VERSION },
  });
  assert.ok(afterDelete.statusCode === 401 || JSON.parse(afterDelete.body).code === "AUTH_ACCOUNT_DELETING" || JSON.parse(afterDelete.body).code === "AUTH_INVALID_CREDENTIALS");
  const reused = await registerVerifyLogin(app, nakama, email, "delete-me@example.com", "10.2.0.3");
  assert.notEqual(reused.user_id, live.user_id);
  await app.close();
});
