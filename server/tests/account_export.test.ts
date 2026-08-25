import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_EXPORT_TTL_MS,
  assembleAccountExport,
  exportContainsSecrets,
  filterExportValue,
  isSecretExportKey,
  supportRecoveryId,
} from "../src/domain/account_export";

test("support recovery id is stable and is not the Nakama user id", () => {
  const first = supportRecoveryId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  const second = supportRecoveryId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  assert.equal(first, second);
  assert.match(first, /^VIBE-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(first.indexOf("aaaaaaaa"), -1);
});

test("export filter drops secrets, hashes, and other players' objects", () => {
  const filtered = filterExportValue(
    {
      account: { user: { id: "user-old", email: "a@b.c" }, passwordHash: "nope", wallet: { gold: 3 } },
      objects: [
        { userId: "user-old", collection: "player", key: "roster", value: { characterIds: ["c1"] } },
        { userId: "user-other", collection: "player", key: "inventory", value: { secret: "x" } },
      ],
      friends: [{ userId: "user-other", email: "other@b.c" }],
      auth: { hmac: "deadbeef", secret_hash: "ffff", email_lookup_hash: "eeee" },
    },
    "user-old",
  ) as { [key: string]: unknown };
  const account = filtered.account as { [key: string]: unknown };
  assert.equal((account.user as { email: string }).email, "a@b.c");
  assert.equal(account.passwordHash, undefined);
  const objects = filtered.objects as { userId: string }[];
  assert.equal(objects.length, 1);
  assert.equal(objects[0].userId, "user-old");
  assert.deepEqual(filtered.friends, []);
  const auth = filtered.auth as { [key: string]: unknown };
  assert.equal(auth.hmac, undefined);
  assert.equal(auth.secret_hash, undefined);
  assert.equal(exportContainsSecrets(filtered), false);
});

test("assembled export includes project records and excludes hmac", () => {
  const payload = assembleAccountExport({
    accountUserId: "user-old",
    exportedAt: 50,
    nakamaExport: { account: { custom: { password: "x" } }, objects: [] },
    profile: {
      status: "ACTIVE",
      createdAt: 1,
      verifiedAt: 2,
      acceptedTermsVersion: "1",
      acceptedPrivacyVersion: "1",
      acceptedAt: 2,
      registrationMode: "OPEN",
      hmac: "should-not-leak",
    },
    characters: [{ characterId: "c1", name: "Scout", status: "SOFT_DELETED" }],
    gold: 12,
    settings: { locale: "en" },
    transactions: [{ requestId: "tx-1", goldDelta: 5 }],
    partyHistory: [{ partyId: "p1" }],
    tradeHistory: [{ tradeId: "t1", state: "completed" }],
    sessionMetadata: { sessionCount: 2, lastIssuedAt: 40 },
    lease: null,
    boundLocations: [{ zoneId: "zone.starter" }],
  });
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.gold, 12);
  const profile = payload.accountProfile as { hmac?: string; status: string };
  assert.equal(profile.status, "ACTIVE");
  assert.equal(profile.hmac, undefined);
  assert.equal(typeof payload.supportRecoveryId, "string");
  assert.equal(exportContainsSecrets(payload), false);
  assert.equal(isSecretExportKey("passwordHash"), true);
  assert.equal(ACCOUNT_EXPORT_TTL_MS, 300000);
});
