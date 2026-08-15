import assert from "node:assert/strict";
import test from "node:test";
import { parseFindOrCreatePayload, FIND_OR_CREATE_STARTER_ZONE_RPC_ID } from "../src/rpcs/find_or_create_starter_zone";
import { resolveStarterMatchId, selectCanonicalMatchId } from "../src/domain/starter_zone_registry";
import { SYSTEM_USER_ID } from "../src/nakama/starter_zone_registry";
import { requireAuthenticatedUserId } from "../src/domain/character";

test("find_or_create rpc id is the documented string", () => {
  assert.equal(FIND_OR_CREATE_STARTER_ZONE_RPC_ID, "find_or_create_starter_zone");
  assert.equal(SYSTEM_USER_ID, "00000000-0000-0000-0000-000000000000");
});

test("find_or_create requires authentication", () => {
  assert.throws(() => requireAuthenticatedUserId(undefined), /unauthenticated/);
  assert.throws(() => requireAuthenticatedUserId(""), /unauthenticated/);
  assert.equal(requireAuthenticatedUserId("user-alice"), "user-alice");
});

test("find_or_create payload is empty or an empty object", () => {
  parseFindOrCreatePayload("");
  parseFindOrCreatePayload("{}");
  assert.throws(() => parseFindOrCreatePayload("{"), /malformed_json/);
  assert.throws(() => parseFindOrCreatePayload('{"extra":true}'), /unknown_field:extra/);
});

test("concurrent listed matches collapse to one canonical id", () => {
  assert.equal(selectCanonicalMatchId(["match-b", "match-a"]), "match-a");
  assert.equal(
    resolveStarterMatchId(["match-b", "match-a"], "match-stored", false, "match-created"),
    "match-a",
  );
});

test("a running stored match wins over a newly created extra", () => {
  assert.equal(
    resolveStarterMatchId(["match-extra"], "match-canonical", true, "match-extra"),
    "match-canonical",
  );
});

test("created id is used when nothing is listed or stored", () => {
  assert.equal(resolveStarterMatchId([], null, false, "match-new"), "match-new");
});
