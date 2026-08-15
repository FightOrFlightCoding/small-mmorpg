import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTENT_VERSION_UNINITIALIZED,
  HEALTH_RPC_ID,
  PROTOCOL_VERSION,
  SERVICE_NAME,
  buildHealthResponse,
  handleHealthRpc,
} from "../src/rpcs/health";

test("health response has the required shape", () => {
  const body = buildHealthResponse();
  assert.equal(body.ok, true);
  assert.equal(body.service, "vibecode-server");
  assert.equal(body.protocol_version, 1);
  assert.equal(body.content_version, "uninitialized");
  assert.equal(body.service, SERVICE_NAME);
  assert.equal(body.protocol_version, PROTOCOL_VERSION);
  assert.equal(body.content_version, CONTENT_VERSION_UNINITIALIZED);
  assert.equal(HEALTH_RPC_ID, "vibecode_health");
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
