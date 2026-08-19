import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { emailHmacHex, hmacSha256Hex, sha256Hex } from "../src/domain/hmac";

test("pure SHA-256 matches Node crypto", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  const message = "The quick brown fox jumps over the lazy dog";
  assert.equal(sha256Hex(message), createHash("sha256").update(message, "utf8").digest("hex"));
});

test("pure HMAC-SHA256 matches Node crypto", () => {
  const pepper = "acct-01-local-compat-pepper";
  const message = "player+tag@example.com";
  assert.equal(hmacSha256Hex(pepper, message), createHmac("sha256", pepper).update(message, "utf8").digest("hex"));
  assert.equal(
    hmacSha256Hex("key", "The quick brown fox jumps over the lazy dog"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
  assert.equal(emailHmacHex(pepper, message), hmacSha256Hex(pepper, message));
});
