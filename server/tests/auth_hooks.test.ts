import assert from "node:assert/strict";
import test from "node:test";
import { beforeAuthenticateDevice, beforeAuthenticateEmail } from "../src/nakama/auth_hooks";

function logger(): nkruntime.Logger {
  return { info() {}, warn() {}, error() {}, debug() {} } as unknown as nkruntime.Logger;
}

function ctx(env: { [key: string]: string }): nkruntime.Context {
  return { env: env } as unknown as nkruntime.Context;
}

test("production registration is closed and device auth is disabled", () => {
  const email: nkruntime.AuthenticateEmailRequest = {
    account: { email: "a@b.c", password: "x" },
    create: true,
    username: "a",
  };
  assert.throws(
    () => beforeAuthenticateEmail(ctx({ VIBECODE_ENV: "production" }), logger(), {} as nkruntime.Nakama, email),
    /registration_disabled/,
  );
  const device: nkruntime.AuthenticateDeviceRequest = { account: { id: "dev-1" }, create: true, username: "d" };
  assert.throws(
    () => beforeAuthenticateDevice(ctx({ VIBECODE_ENV: "production" }), logger(), {} as nkruntime.Nakama, device),
    /device_auth_disabled/,
  );
});

test("local registration and device auth remain open", () => {
  const email: nkruntime.AuthenticateEmailRequest = {
    account: { email: "a@b.c", password: "x" },
    create: true,
    username: "a",
  };
  const allowed = beforeAuthenticateEmail(ctx({ VIBECODE_ENV: "local" }), logger(), {} as nkruntime.Nakama, email);
  assert.equal(allowed.create, true);
  const device: nkruntime.AuthenticateDeviceRequest = { account: { id: "dev-1" }, create: true, username: "d" };
  const deviceAllowed = beforeAuthenticateDevice(ctx({ VIBECODE_ENV: "local" }), logger(), {} as nkruntime.Nakama, device);
  assert.equal(deviceAllowed.account !== undefined ? deviceAllowed.account.id : "", "dev-1");
});
