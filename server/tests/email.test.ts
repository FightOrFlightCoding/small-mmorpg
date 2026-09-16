import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeEmail, EMAIL_MAX_LENGTH } from "../src/domain/email";

test("canonicalize trims, lowercases, and keeps plus tags and dots", () => {
  const tagged = canonicalizeEmail("  Alex.O'Reilly+quest@Example.COM  ");
  assert.equal(tagged.ok, true);
  if (tagged.ok) {
    assert.equal(tagged.canonical, "alex.o'reilly+quest@example.com");
    assert.equal(tagged.display, "Alex.O'Reilly+quest@Example.COM");
  }
  const dotted = canonicalizeEmail("a.b.c@gmail.com");
  assert.equal(dotted.ok, true);
  if (dotted.ok) {
    assert.equal(dotted.canonical, "a.b.c@gmail.com");
  }
});

test("canonicalize rejects empty, oversized, and malformed addresses", () => {
  assert.equal(canonicalizeEmail("").ok, false);
  assert.equal(canonicalizeEmail("not-an-email").ok, false);
  assert.equal(canonicalizeEmail("a@b").ok, false);
  assert.equal(canonicalizeEmail("@example.com").ok, false);
  assert.equal(canonicalizeEmail("user@").ok, false);
  assert.equal(canonicalizeEmail("user@exam ple.com").ok, false);
  assert.equal(canonicalizeEmail("a".repeat(EMAIL_MAX_LENGTH) + "@x.com").ok, false);
  assert.equal(canonicalizeEmail(null).ok, false);
});
