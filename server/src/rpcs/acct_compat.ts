import { requireAuthenticatedUserId } from "../domain/character";
import {
  ACCOUNT_COMPAT_COLLECTION,
  ACCOUNT_COMPAT_INDEX,
  ACCOUNT_COMPAT_KEY,
  ACCOUNT_COMPAT_OPS,
  ACCOUNT_COMPAT_PERMISSION_READ,
  ACCOUNT_COMPAT_PERMISSION_WRITE,
  ACCOUNT_COMPAT_RPC_ID,
  decideEmailLookup,
  emailIndexWriteValue,
  hmacIndexQuery,
  hmacIndexQueryQuoted,
  parseEmailIndexValue,
  type AccountCompatOp,
  type EmailIndexRecord,
} from "../domain/account_compat";
import { environmentFromRuntime } from "../domain/environment";

const ALLOWED_KEYS = ["op", "hmac"];

export { ACCOUNT_COMPAT_RPC_ID };

interface AcctCompatRequest {
  op: AccountCompatOp;
  hmac: string;
}

function parseRequest(payload: string): AcctCompatRequest {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    throw new Error("malformed_json");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("malformed_json");
  }
  const data = parsed as { [key: string]: unknown };
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (ALLOWED_KEYS.indexOf(keys[i]) === -1) {
      throw new Error("unknown_field:" + keys[i]);
    }
  }
  if (typeof data.op !== "string" || ACCOUNT_COMPAT_OPS.indexOf(data.op as AccountCompatOp) === -1) {
    throw new Error("invalid_payload");
  }
  const hmac = typeof data.hmac === "string" ? data.hmac : "";
  if ((data.op === "put" || data.op === "list" || data.op === "verify") && hmac.length === 0) {
    throw new Error("invalid_payload");
  }
  return { op: data.op as AccountCompatOp, hmac: hmac };
}

function indexObjects(listed: unknown): nkruntime.StorageObject[] {
  if (listed === null || listed === undefined || typeof listed !== "object") {
    return [];
  }
  const data = listed as { objects?: { length?: number } };
  const raw = data.objects;
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return [];
  }
  const len = typeof raw.length === "number" ? raw.length : 0;
  const objects: nkruntime.StorageObject[] = [];
  for (let i = 0; i < len; i++) {
    const row = (raw as { [index: number]: nkruntime.StorageObject })[i];
    if (row !== undefined) {
      objects.push(row);
    }
  }
  return objects;
}

function recordsFromIndex(nk: nkruntime.Nakama, hmac: string): { hits: EmailIndexRecord[]; query: string; listedCount: number } {
  const queries = [hmacIndexQuery(hmac), hmacIndexQueryQuoted(hmac), "*"];
  let lastCount = 0;
  for (let i = 0; i < queries.length; i++) {
    const listed = nk.storageIndexList(ACCOUNT_COMPAT_INDEX, queries[i], 10);
    let hits = recordsFromListed(listed);
    lastCount = indexObjects(listed).length;
    if (queries[i] === "*") {
      const filtered: EmailIndexRecord[] = [];
      for (let h = 0; h < hits.length; h++) {
        if (hits[h].hmac === hmac) {
          filtered.push(hits[h]);
        }
      }
      hits = filtered;
    }
    if (hits.length > 0) {
      return { hits: hits, query: queries[i], listedCount: lastCount };
    }
  }
  return { hits: [], query: queries[0], listedCount: lastCount };
}

function recordsFromListed(listed: unknown): EmailIndexRecord[] {
  const objects = indexObjects(listed);
  const records: EmailIndexRecord[] = [];
  for (let i = 0; i < objects.length; i++) {
    const parsed = parseEmailIndexValue(objects[i].value, objects[i].userId);
    if (parsed !== null) {
      records.push(parsed);
    }
  }
  return records;
}

function readIndexRecord(nk: nkruntime.Nakama, userId: string): EmailIndexRecord | null {
  const objects = nk.storageRead([
    { collection: ACCOUNT_COMPAT_COLLECTION, key: ACCOUNT_COMPAT_KEY, userId: userId },
  ]);
  if (objects.length === 0) {
    return null;
  }
  return parseEmailIndexValue(objects[0].value, objects[0].userId);
}

export function rpcAcctCompatProbe(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const env = environmentFromRuntime(ctx.env);
  if (!env.developmentToolsEnabled) {
    throw new Error("dev_tools_disabled");
  }
  const userId = requireAuthenticatedUserId(ctx.userId);
  const request = parseRequest(payload);
  if (request.op === "put") {
    nk.storageWrite([
      {
        collection: ACCOUNT_COMPAT_COLLECTION,
        key: ACCOUNT_COMPAT_KEY,
        userId: userId,
        value: emailIndexWriteValue(userId, request.hmac),
        permissionRead: ACCOUNT_COMPAT_PERMISSION_READ,
        permissionWrite: ACCOUNT_COMPAT_PERMISSION_WRITE,
      },
    ]);
    return JSON.stringify({ ok: true, op: request.op, userId: userId });
  }
  if (request.op === "get") {
    const record = readIndexRecord(nk, userId);
    return JSON.stringify({ ok: true, op: request.op, userId: userId, record: record });
  }
  if (request.op === "list") {
    const listed = recordsFromIndex(nk, request.hmac);
    return JSON.stringify({ ok: true, op: request.op, hits: listed.hits, query: listed.query });
  }
  if (request.op === "delete_object") {
    nk.storageDelete([{ collection: ACCOUNT_COMPAT_COLLECTION, key: ACCOUNT_COMPAT_KEY, userId: userId }]);
    return JSON.stringify({ ok: true, op: request.op, userId: userId });
  }
  if (request.op === "verify") {
    const listed = recordsFromIndex(nk, request.hmac);
    const hits = listed.hits;
    const primary = hits.length === 1 ? readIndexRecord(nk, hits[0].userId) : null;
    const decision = decideEmailLookup(hits, primary, request.hmac);
    return JSON.stringify({
      ok: true,
      op: request.op,
      hits: hits,
      query: listed.query,
      listedCount: listed.listedCount,
      ownerRecord: readIndexRecord(nk, userId),
      decision: decision,
    });
  }
  if (request.op === "export") {
    const exported = nk.accountExportId(userId);
    return JSON.stringify({ ok: true, op: request.op, userId: userId, export: exported });
  }
  if (request.op === "account_summary") {
    const account = nk.accountGetId(userId);
    const wallet = account.wallet !== undefined ? account.wallet : {};
    return JSON.stringify({
      ok: true,
      op: request.op,
      userId: userId,
      email: account.email,
      username: account.user.username,
      verifyTime: account.verifyTime,
      disableTime: account.disableTime,
      wallet: wallet,
      customId: account.customId,
      deviceCount: account.devices !== undefined ? account.devices.length : 0,
    });
  }
  nk.accountDeleteId(userId, true);
  logger.info("acct_compat_probe recorded delete user_id=%s", userId);
  return JSON.stringify({ ok: true, op: request.op, userId: userId, recorded: true });
}
