import assert from "node:assert/strict";
import test from "node:test";
import { SendGridEmailProvider } from "../src/email/sendgrid";
import { MemoryEmailProvider } from "../src/email/memory";
import { renderEmail } from "../src/email/templates";

const message = renderEmail({
  to: "player@example.com",
  templateId: "verify_email",
  code: "ABCD-EFGH-IJKM-NPQR",
  confirmUrl: "https://auth.example/v1/confirm",
  expiresAt: new Date("2026-08-19T00:00:00.000Z"),
  supportEmail: "support@example.com",
});

test("in-memory email provider records success", async () => {
  const provider = new MemoryEmailProvider();
  const sent = await provider.send(message);
  assert.equal(sent.ok, true);
  assert.equal(provider.sent.length, 1);
});

test("in-memory email provider can fail the next send", async () => {
  const provider = new MemoryEmailProvider();
  provider.failNext = true;
  const sent = await provider.send(message);
  assert.equal(sent.ok, false);
  assert.equal(provider.sent.length, 0);
});

test("SendGrid adapter treats HTTP failure as a provider error", async () => {
  const provider = new SendGridEmailProvider("sg-test", "Vibecode <no-reply@example.com>", async () => new Response("nope", { status: 500 }));
  const sent = await provider.send(message);
  assert.equal(sent.ok, false);
});

test("SendGrid adapter treats HTTP 202 as success", async () => {
  const provider = new SendGridEmailProvider("sg-test", "Vibecode <no-reply@example.com>", async () => new Response("", { status: 202 }));
  const sent = await provider.send(message);
  assert.equal(sent.ok, true);
});
