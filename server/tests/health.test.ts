import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "../src/generated/content";
import {
  HEALTH_RPC_ID,
  PROTOCOL_VERSION,
  REGISTERED_RPC_IDS,
  SERVICE_NAME,
  buildHealthResponse,
  handleHealthRpc,
} from "../src/rpcs/health";

test("health response has the required shape", () => {
  const body = buildHealthResponse();
  assert.equal(body.ok, true);
  assert.equal(body.service, "vibecode-server");
  assert.equal(body.protocol_version, 1);
  assert.equal(body.content_version, contentHash);
  assert.equal(body.service, SERVICE_NAME);
  assert.equal(body.protocol_version, PROTOCOL_VERSION);
  assert.equal(HEALTH_RPC_ID, "vibecode_health");
  assert.deepEqual(body.rpcs, REGISTERED_RPC_IDS);
  assert.ok(body.rpcs.includes("character_bootstrap"));
  assert.ok(body.rpcs.includes("find_or_create_starter_zone"));
  assert.match(body.content_version, /^[a-f0-9]{64}$/);
});

test("health accepts an empty payload", () => {
  assert.deepEqual(handleHealthRpc(""), buildHealthResponse());
});

test("health accepts an empty JSON object", () => {
  assert.deepEqual(handleHealthRpc("{}"), buildHealthResponse());
});

test("health accepts whitespace-only payload", () => {
  assert.deepEqual(handleHealthRpc("  \n"), buildHealthResponse());
});

test("health rejects malformed JSON", () => {
  assert.throws(() => handleHealthRpc("{"), /malformed_json/);
});

test("health rejects a JSON array", () => {
  assert.throws(() => handleHealthRpc("[]"), /malformed_json/);
});

test("health rejects unknown fields", () => {
  assert.throws(() => handleHealthRpc('{"extra":true}'), /unknown_field:extra/);
});
