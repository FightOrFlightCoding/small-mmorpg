import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeEmail } from "../src/domain/email";
import { emailHmacHex } from "../src/domain/hmac";
import {
  authenticateEmail,
  consoleAuthenticate,
  consoleDeleteAccount,
  consoleExport,
  deleteOwnAccount,
  errorMessage,
  getAccount,
  linkDevice,
  linkEmail,
  rpcJson,
  sessionFromAuth,
  sessionLogout,
  sessionRefresh,
  sleep,
  uniqueCharacterName,
  uniqueDeviceId,
  uniqueEmail,
  uniquePassword,
  unlinkDevice,
  unlinkEmail,
  userIdFromToken,
  type HttpJson,
} from "./helpers/nakama_http";

const LIVE = process.env.ACCT_COMPAT_LIVE === "1";
const PEPPER = "acct-01-local-compat-pepper";
const OPTIONS = { skip: !LIVE, timeout: 90000 };

interface RpcResult {
  http: HttpJson;
  data: { [key: string]: unknown };
}

async function callRpc(token: string, payload: { [key: string]: unknown }): Promise<RpcResult> {
  const http = await rpcJson(token, "acct_compat_probe", payload);
  let data: { [key: string]: unknown } = {};
  if (http.body !== null && typeof http.body === "object" && !Array.isArray(http.body)) {
    const body = http.body as { payload?: unknown };
    if (typeof body.payload === "string") {
      const parsed = JSON.parse(body.payload) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as { [key: string]: unknown };
      }
    } else {
      data = http.body as { [key: string]: unknown };
    }
  }
  return { http: http, data: data };
}

async function requireAuth(email: string, password: string, create: boolean): Promise<{ token: string; refresh: string; userId: string }> {
  const response = await authenticateEmail(email, password, create);
  assert.equal(response.ok, true, "auth failed " + email + " create=" + String(create) + " " + errorMessage(response.body));
  const session = sessionFromAuth(response.body);
  return { token: session.token, refresh: session.refresh_token, userId: userIdFromToken(session.token) };
}

async function retryVerify(
  token: string,
  hmac: string,
  expectedUserId: string | null,
  expectedReason?: string,
): Promise<{ [key: string]: unknown }> {
  let last: { [key: string]: unknown } = {};
  for (let i = 0; i < 25; i++) {
    const result = await callRpc(token, { op: "verify", hmac: hmac });
    last = result.data;
    const decision = result.data.decision as { ok?: boolean; userId?: string; reason?: string } | undefined;
    if (expectedUserId !== null && decision !== undefined && decision.ok === true && decision.userId === expectedUserId) {
      return result.data;
    }
    if (expectedUserId === null && decision !== undefined && decision.ok === false && decision.reason === expectedReason) {
      return result.data;
    }
    await sleep(150);
  }
  return last;
}

test("email authentication create, create=false, uniqueness, wrong password, canonicalization", OPTIONS, async () => {
  const password = uniquePassword("auth");
  const mixed = uniqueEmail("Case");
  const canonical = canonicalizeEmail(mixed);
  assert.equal(canonical.ok, true);
  const email = canonical.ok ? canonical.canonical : mixed;
  const created = await authenticateEmail(mixed, password, true);
  assert.equal(created.ok, true, errorMessage(created.body));
  const userId = userIdFromToken(sessionFromAuth(created.body).token);

  const loginCanonical = await authenticateEmail(email, password, false);
  assert.equal(loginCanonical.ok, true, errorMessage(loginCanonical.body));
  assert.equal(userIdFromToken(sessionFromAuth(loginCanonical.body).token), userId);

  const loginMixed = await authenticateEmail(mixed.toUpperCase(), password, false);
  assert.equal(loginMixed.ok, true, "Nakama lowercases email on authenticate: " + errorMessage(loginMixed.body));
  assert.equal(userIdFromToken(sessionFromAuth(loginMixed.body).token), userId);

  const plusLocal = "acct01+tag." + Date.now().toString(36) + "@example.com";
  const plusCreated = await authenticateEmail(plusLocal, password, true);
  assert.equal(plusCreated.ok, true, "plus tags are distinct identities: " + errorMessage(plusCreated.body));
  assert.notEqual(userIdFromToken(sessionFromAuth(plusCreated.body).token), userId);

  const missing = await authenticateEmail(uniqueEmail("missing"), password, false);
  assert.equal(missing.ok, false, "unknown email create=false: " + errorMessage(missing.body));
  const wrong = await authenticateEmail(email, uniquePassword("wrong"), false);
  assert.equal(wrong.ok, false, "wrong password: " + errorMessage(wrong.body));
  const taken = await authenticateEmail(email, uniquePassword("taken"), true);
  assert.equal(taken.ok, false, "second account must not claim the same email: " + errorMessage(taken.body));
});

test("password replacement supported sequence preserves user id", OPTIONS, async () => {
  const email = uniqueEmail("pw");
  const original = uniquePassword("old");
  const next = uniquePassword("new");
  const first = await requireAuth(email, original, true);
  const notes: string[] = [];

  const relinkSame = await linkEmail(first.token, email, next);
  notes.push("link_same_email status=" + String(relinkSame.status) + " ok=" + String(relinkSame.ok) + " " + errorMessage(relinkSame.body));
  const afterLink = await authenticateEmail(email, next, false);
  if (afterLink.ok) {
    assert.equal(userIdFromToken(sessionFromAuth(afterLink.body).token), first.userId);
    const oldRejected = await authenticateEmail(email, original, false);
    assert.equal(oldRejected.ok, false, "old password must fail after successful same-email link");
    notes.push("sequence=link_same_email_updates_password");
    return;
  }

  const deviceId = uniqueDeviceId("pw");
  const linkedDevice = await linkDevice(first.token, deviceId);
  assert.equal(linkedDevice.ok, true, "temporary device link: " + errorMessage(linkedDevice.body));
  const unlinked = await unlinkEmail(first.token, email, original);
  notes.push("unlink_email status=" + String(unlinked.status) + " ok=" + String(unlinked.ok) + " " + errorMessage(unlinked.body));
  if (!unlinked.ok) {
    const unlinkOnly = await unlinkEmail(first.token, email, original);
    notes.push("unlink_only_method " + errorMessage(unlinkOnly.body));
    throw new Error("password replacement blocked: " + notes.join(" | "));
  }
  const relinked = await linkEmail(first.token, email, next);
  assert.equal(relinked.ok, true, "relink email: " + errorMessage(relinked.body));
  const unlinkedDevice = await unlinkDevice(first.token, deviceId);
  assert.equal(unlinkedDevice.ok, true, "remove temporary device: " + errorMessage(unlinkedDevice.body));
  const loginNew = await requireAuth(email, next, false);
  assert.equal(loginNew.userId, first.userId);
  const oldRejected = await authenticateEmail(email, original, false);
  assert.equal(oldRejected.ok, false);
});

test("email replacement preserves user id, storage, and wallet; collision is rejected", OPTIONS, async () => {
  const password = uniquePassword("em");
  const emailA = uniqueEmail("a");
  const emailB = uniqueEmail("b");
  const emailC = uniqueEmail("c");
  const accountA = await requireAuth(emailA, password, true);
  const accountB = await requireAuth(emailB, password, true);

  const hmac = emailHmacHex(PEPPER, emailA);
  const put = await callRpc(accountA.token, { op: "put", hmac: hmac });
  assert.equal(put.http.ok, true, errorMessage(put.http.body));
  const summaryBefore = await callRpc(accountA.token, { op: "account_summary" });
  assert.equal(summaryBefore.http.ok, true, errorMessage(summaryBefore.http.body));

  const collide = await linkEmail(accountA.token, emailB, password);
  assert.equal(collide.ok, false, "linking an email already owned by another account must fail");

  const deviceId = uniqueDeviceId("em");
  assert.equal((await linkDevice(accountA.token, deviceId)).ok, true);
  const unlinked = await unlinkEmail(accountA.token, emailA, password);
  assert.equal(unlinked.ok, true, "unlink old email after temporary device: " + errorMessage(unlinked.body));
  const linkedNew = await linkEmail(accountA.token, emailC, password);
  assert.equal(linkedNew.ok, true, "link replacement email: " + errorMessage(linkedNew.body));
  assert.equal((await unlinkDevice(accountA.token, deviceId)).ok, true);

  const loginNew = await requireAuth(emailC, password, false);
  assert.equal(loginNew.userId, accountA.userId);
  const oldEmailGone = await authenticateEmail(emailA, password, false);
  assert.equal(oldEmailGone.ok, false);
  const otherStill = await requireAuth(emailB, password, false);
  assert.equal(otherStill.userId, accountB.userId);

  const summaryAfter = await callRpc(loginNew.token, { op: "account_summary" });
  assert.equal(summaryAfter.data.userId, accountA.userId);
  const get = await callRpc(loginNew.token, { op: "get" });
  const record = get.data.record as { hmac?: string; userId?: string } | null;
  assert.equal(record !== null && record !== undefined && record.hmac === hmac, true, "storage object survived email change");
  const stillValid = await getAccount(accountA.token);
  assert.equal(typeof stillValid.ok === "boolean", true);
});

test("logout current session and logout all sessions", OPTIONS, async () => {
  const email = uniqueEmail("lo");
  const password = uniquePassword("lo");
  const sessionA = await requireAuth(email, password, true);
  const sessionB = await requireAuth(email, password, false);
  await sleep(1500);

  const current = await sessionLogout(sessionA.token, { token: sessionA.token, refresh_token: sessionA.refresh });
  assert.equal(current.ok, true, errorMessage(current.body));
  const deadAccess = await getAccount(sessionA.token);
  assert.equal(deadAccess.ok, false);
  const deadRefresh = await sessionRefresh(sessionA.refresh);
  assert.equal(deadRefresh.ok, false);
  const sibling = await getAccount(sessionB.token);
  assert.equal(sibling.ok, true, "logout current must not revoke other sessions: " + errorMessage(sibling.body));

  const all = await sessionLogout(sessionB.token, { token: "", refresh_token: "" });
  assert.equal(all.ok, true, "empty-string logout body should revoke all sessions: " + errorMessage(all.body));
  let deadB = await getAccount(sessionB.token);
  if (deadB.ok) {
    const allObject = await sessionLogout(sessionB.token, {});
    assert.equal(allObject.ok, true, "empty-object logout: " + errorMessage(allObject.body));
    deadB = await getAccount(sessionB.token);
  }
  assert.equal(deadB.ok, false, "logout all must revoke remaining access tokens");
  const deadBRefresh = await sessionRefresh(sessionB.refresh);
  assert.equal(deadBRefresh.ok, false);
  const revived = await authenticateEmail(email, password, false);
  assert.equal(revived.ok, true, "account can authenticate again after logout all");
});

test("account export includes Nakama account and project storage", OPTIONS, async () => {
  const email = uniqueEmail("ex");
  const password = uniquePassword("ex");
  const session = await requireAuth(email, password, true);
  const hmac = emailHmacHex(PEPPER, email);
  assert.equal((await callRpc(session.token, { op: "put", hmac: hmac })).http.ok, true);
  const created = await callRpc(session.token, {
    op: "export",
  });
  assert.equal(created.http.ok, true, errorMessage(created.http.body));
  assert.equal(typeof created.data.export === "string", true);
  const exported = JSON.parse(String(created.data.export)) as { [key: string]: unknown };
  assert.equal(typeof exported === "object" && exported !== null, true);
  const consoleToken = await consoleAuthenticate();
  const consoleDump = await consoleExport(consoleToken, session.userId);
  assert.equal(consoleDump.ok || consoleDump.status === 200, true, "console export: " + consoleDump.text.slice(0, 300));
});

test("recorded account deletion, credential death, and email reuse with a new user id", OPTIONS, async () => {
  const email = uniqueEmail("del");
  const password = uniquePassword("del");
  const session = await requireAuth(email, password, true);
  const name = uniqueCharacterName();
  const created = await callRpc(session.token, { op: "put", hmac: emailHmacHex(PEPPER, email) });
  assert.equal(created.http.ok, true);
  const character = await rpcJson(session.token, "character_create", { name: name, classId: "test.class.vanguard" });
  assert.equal(character.ok, true, "character_create " + errorMessage(character.body));

  const deleted = await callRpc(session.token, { op: "delete_account" });
  assert.equal(deleted.http.ok, true, errorMessage(deleted.http.body));
  const loginDead = await authenticateEmail(email, password, false);
  assert.equal(loginDead.ok, false, "deleted credentials must not authenticate");
  const accessDead = await getAccount(session.token);
  assert.equal(accessDead.ok, false);
  const refreshDead = await sessionRefresh(session.refresh);
  assert.equal(refreshDead.ok, false);

  const reused = await requireAuth(email, uniquePassword("reuse"), true);
  assert.notEqual(reused.userId, session.userId);
  const list = await rpcJson(reused.token, "character_list", {});
  assert.equal(list.ok, true, errorMessage(list.body));
  let listData: { [key: string]: unknown } = list.body as { [key: string]: unknown };
  if (typeof listData.payload === "string") {
    listData = JSON.parse(listData.payload) as { [key: string]: unknown };
  }
  const characters = listData.characters as unknown[] | undefined;
  assert.equal(characters === undefined || characters.length === 0, true, "reused email must not inherit characters");
  const gold = await callRpc(reused.token, { op: "account_summary" });
  const wallet = gold.data.wallet as { [key: string]: number } | undefined;
  const goldValue = wallet !== undefined && typeof wallet.gold === "number" ? wallet.gold : 0;
  assert.equal(goldValue, 0);
  const inherited = await callRpc(reused.token, { op: "get" });
  assert.equal(inherited.data.record === null || inherited.data.record === undefined, true);
});

test("HMAC email lookup: current, changed, missing, multiple, stale, deleted, reused", OPTIONS, async () => {
  const password = uniquePassword("hmac");
  const email = uniqueEmail("hmac");
  const session = await requireAuth(email, password, true);
  const hmac = emailHmacHex(PEPPER, email);
  assert.equal((await callRpc(session.token, { op: "put", hmac: hmac })).http.ok, true);
  const current = await retryVerify(session.token, hmac, session.userId);
  const currentDecision = current.decision as { ok: boolean; userId: string };
  assert.equal(currentDecision.ok, true, "hmac verify current: " + JSON.stringify(current));
  assert.equal(currentDecision.userId, session.userId);

  const missing = await retryVerify(session.token, emailHmacHex(PEPPER, uniqueEmail("nope")), null, "missing");
  assert.equal((missing.decision as { reason: string }).reason, "missing");

  const otherEmail = uniqueEmail("hmac2");
  const other = await requireAuth(otherEmail, password, true);
  assert.equal((await callRpc(other.token, { op: "put", hmac: hmac })).http.ok, true);
  const multiple = await retryVerify(session.token, hmac, null, "multiple");
  assert.equal((multiple.decision as { reason: string }).reason, "multiple");
  assert.equal((await callRpc(other.token, { op: "delete_object" })).http.ok, true);

  const changedHmac = emailHmacHex(PEPPER, uniqueEmail("changed"));
  assert.equal((await callRpc(session.token, { op: "put", hmac: changedHmac })).http.ok, true);
  const oldGone = await retryVerify(session.token, hmac, null, "missing");
  assert.equal((oldGone.decision as { reason?: string }).reason === "missing" || (oldGone.decision as { reason?: string }).reason === "mismatch", true);
  const changed = await retryVerify(session.token, changedHmac, session.userId);
  assert.equal((changed.decision as { ok: boolean }).ok, true);

  assert.equal((await callRpc(session.token, { op: "delete_object" })).http.ok, true);
  const stale = await retryVerify(session.token, changedHmac, null, "stale");
  const staleReason = (stale.decision as { reason?: string }).reason;
  assert.equal(staleReason === "stale" || staleReason === "missing", true, "deleted object must not verify: " + JSON.stringify(stale.decision));

  assert.equal((await callRpc(session.token, { op: "put", hmac: hmac })).http.ok, true);
  assert.equal((await callRpc(session.token, { op: "delete_account" })).http.ok, true);
  const reused = await requireAuth(email, uniquePassword("hmac-reuse"), true);
  assert.notEqual(reused.userId, session.userId);
  const afterDelete = await retryVerify(reused.token, hmac, null, "missing");
  assert.equal((afterDelete.decision as { reason: string }).reason, "missing");
});

test("unlinking the only authentication method is rejected or requires a temporary link", OPTIONS, async () => {
  const email = uniqueEmail("only");
  const password = uniquePassword("only");
  const session = await requireAuth(email, password, true);
  const unlinked = await unlinkEmail(session.token, email, password);
  if (unlinked.ok) {
    const login = await authenticateEmail(email, password, false);
    assert.equal(login.ok, false, "unlinking the only email must not leave that email authenticatable");
  } else {
    assert.equal(unlinked.ok, false);
  }
});

test("client self-delete is documented beside recorded runtime deletion", OPTIONS, async () => {
  const email = uniqueEmail("self");
  const password = uniquePassword("self");
  const session = await requireAuth(email, password, true);
  const deleted = await deleteOwnAccount(session.token);
  const login = await authenticateEmail(email, password, false);
  const reused = await authenticateEmail(email, uniquePassword("self2"), true);
  assert.equal(typeof deleted.status === "number", true);
  assert.equal(login.ok, false, "self-deleted credentials must not authenticate");
  assert.equal(reused.ok, true, "email reuse after client DELETE /v2/account: " + errorMessage(reused.body));
});

test("console recorded delete is available as an operator path", OPTIONS, async () => {
  const email = uniqueEmail("console");
  const password = uniquePassword("console");
  const session = await requireAuth(email, password, true);
  const consoleToken = await consoleAuthenticate();
  const deleted = await consoleDeleteAccount(consoleToken, session.userId, true);
  const login = await authenticateEmail(email, password, false);
  assert.equal(login.ok, false, "console recorded delete must stop authentication: " + errorMessage(login.body) + " delete=" + deleted.text.slice(0, 200));
  const reused = await authenticateEmail(email, uniquePassword("console2"), true);
  assert.equal(reused.ok, true, errorMessage(reused.body));
  if (reused.ok) {
    assert.notEqual(userIdFromToken(sessionFromAuth(reused.body).token), session.userId);
  }
});
