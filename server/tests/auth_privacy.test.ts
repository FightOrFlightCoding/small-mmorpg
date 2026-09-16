import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAuthFailure } from "../src/domain/auth_privacy";
import { beforeAuthenticateEmail } from "../src/nakama/auth_hooks";
import { AUTH_RATE_MAX } from "../src/domain/rate_limit";

test("login failures do not leak whether the email exists", () => {
  const unknown = sanitizeAuthFailure(false, "user not found");
  const exists = sanitizeAuthFailure(false, "user already exists");
  const badPassword = sanitizeAuthFailure(false, "invalid credentials");
  assert.equal(unknown.code, "invalid_credentials");
  assert.equal(exists.code, "invalid_credentials");
  assert.equal(badPassword.code, "invalid_credentials");
  assert.equal(unknown.message, exists.message);
});

test("registration still reports email_taken when the account exists", () => {
  const taken = sanitizeAuthFailure(true, "user already exists");
  assert.equal(taken.code, "email_taken");
});

test("authentication identity is rate-limited", () => {
  const logger = { info() {}, warn() {}, error() {}, debug() {} } as unknown as nkruntime.Logger;
  const ctx = { env: { VIBECODE_ENV: "local" } } as unknown as nkruntime.Context;
  const email: nkruntime.AuthenticateEmailRequest = {
    account: { email: "auth-privacy-rate@example.test", password: "x" },
    create: true,
    username: "r",
  };
  for (let i = 0; i < AUTH_RATE_MAX; i++) {
    const allowed = beforeAuthenticateEmail(ctx, logger, {} as nkruntime.Nakama, email);
    assert.equal(allowed.create, true);
  }
  assert.throws(
    () => beforeAuthenticateEmail(ctx, logger, {} as nkruntime.Nakama, email),
    /rate_limited/,
  );
});
