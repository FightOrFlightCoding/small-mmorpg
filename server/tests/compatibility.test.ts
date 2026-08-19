import assert from "node:assert/strict";
import test from "node:test";
import { contentHash, packageVersion } from "../src/generated/content";
import {
  COMPAT_CLIENT_TOO_NEW,
  COMPAT_CLIENT_TOO_OLD,
  COMPAT_CONTENT_MISMATCH,
  COMPAT_PROTOCOL_MISMATCH,
  COMPAT_SERVER_MAINTENANCE,
  compareSemver,
  evaluateCompatibility,
} from "../src/domain/compatibility";
import { evaluateHandshake, handshakeOkResponse, parseHandshakePayload } from "../src/domain/handshake";
import { emptyMaintenance } from "../src/domain/maintenance";
import { PROTOCOL_VERSION } from "../src/domain/protocol";
import { CLIENT_VERSION } from "../src/domain/environment";

test("semver compare is numeric without a package", () => {
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.ok(compareSemver("1.0.0", "1.0.1") < 0);
  assert.ok(compareSemver("1.2.0", "1.10.0") < 0);
  assert.ok(Number.isNaN(compareSemver("nope", "1.0.0")));
});

test("handshake rejects protocol, content, and client version mismatches", () => {
  const expected = {
    contentHash: contentHash,
    contentVersion: packageVersion,
    serverVersion: "1.0.0",
    minClientVersion: CLIENT_VERSION,
    maxClientVersion: CLIENT_VERSION,
    environment: "local",
    maintenance: emptyMaintenance(),
  };
  const proto = evaluateHandshake(
    { clientVersion: "1.0.0", protocolVersion: 2, contentHash: contentHash, contentVersion: packageVersion },
    expected,
  );
  assert.equal(proto.ok, false);
  if (!proto.ok) {
    assert.equal(proto.code, COMPAT_PROTOCOL_MISMATCH);
  }
  const hash = evaluateHandshake(
    {
      clientVersion: "1.0.0",
      protocolVersion: PROTOCOL_VERSION,
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      contentVersion: packageVersion,
    },
    expected,
  );
  assert.equal(hash.ok, false);
  if (!hash.ok) {
    assert.equal(hash.code, COMPAT_CONTENT_MISMATCH);
  }
  const old = evaluateHandshake(
    { clientVersion: "0.9.0", protocolVersion: PROTOCOL_VERSION, contentHash: contentHash, contentVersion: "" },
    expected,
  );
  assert.equal(old.ok, false);
  if (!old.ok) {
    assert.equal(old.code, COMPAT_CLIENT_TOO_OLD);
  }
  const newer = evaluateHandshake(
    { clientVersion: "1.0.1", protocolVersion: PROTOCOL_VERSION, contentHash: contentHash, contentVersion: "" },
    expected,
  );
  assert.equal(newer.ok, false);
  if (!newer.ok) {
    assert.equal(newer.code, COMPAT_CLIENT_TOO_NEW);
  }
  const ok = evaluateHandshake(
    { clientVersion: "1.0.0", protocolVersion: PROTOCOL_VERSION, contentHash: contentHash, contentVersion: packageVersion },
    expected,
  );
  assert.equal(ok.ok, true);
});

test("handshake payload is strict and does not throw for maintenance", () => {
  assert.throws(() => parseHandshakePayload(""), /malformed_json/);
  assert.throws(() => parseHandshakePayload('{"clientVersion":"1.0.0","protocolVersion":1,"contentHash":"aa","extra":true}'), /unknown_field:extra/);
  const parsed = parseHandshakePayload(
    JSON.stringify({ clientVersion: "1.0.0", protocolVersion: 1, contentHash: contentHash }),
  );
  assert.equal(parsed.clientVersion, "1.0.0");
  const maintenance = emptyMaintenance();
  maintenance.enabled = true;
  maintenance.rejectJoins = true;
  maintenance.message = "Scheduled maintenance.";
  const body = handshakeOkResponse({
    serverVersion: "1.0.0",
    contentHash: contentHash,
    contentVersion: packageVersion,
    minClientVersion: "1.0.0",
    maxClientVersion: "1.0.0",
    environment: "local",
    maintenance: maintenance,
  });
  assert.equal(body.ok, true);
  assert.equal(body.code, "server_maintenance");
  assert.equal(body.maintenance, true);
});

test("new gameplay joins reject during maintenance; reconnects do not", () => {
  const maintenance = emptyMaintenance();
  maintenance.enabled = true;
  maintenance.rejectJoins = true;
  const fresh = evaluateCompatibility({
    clientVersion: "1.0.0",
    protocolVersion: 1,
    contentHash: contentHash,
    expectedProtocol: 1,
    expectedContentHash: contentHash,
    expectedContentVersion: packageVersion,
    minClientVersion: "1.0.0",
    maxClientVersion: "1.0.0",
    maintenance: maintenance,
    alreadyJoined: false,
  });
  assert.equal(fresh.ok, false);
  if (!fresh.ok) {
    assert.equal(fresh.code, COMPAT_SERVER_MAINTENANCE);
  }
  const resume = evaluateCompatibility({
    clientVersion: "1.0.0",
    protocolVersion: 1,
    contentHash: contentHash,
    expectedProtocol: 1,
    expectedContentHash: contentHash,
    expectedContentVersion: packageVersion,
    minClientVersion: "1.0.0",
    maxClientVersion: "1.0.0",
    maintenance: maintenance,
    alreadyJoined: true,
  });
  assert.equal(resume.ok, true);
});
