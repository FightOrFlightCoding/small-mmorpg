import { storageKey } from "../domain/storage_scope";
import {
  GM_ALLOWLIST_KEY,
  GM_AUDIT_COLLECTION,
  GM_AUDIT_KEY,
  GM_COLLECTION,
  GM_PERMISSION_READ,
  GM_PERMISSION_WRITE,
  GM_RECENT_KEY,
  GM_SCHEMA_VERSION,
  GM_SIGNAL_KEY,
  emptyGmAllowlist,
  parseGmAllowlist,
  type GmAllowlist,
  type GmAuditRecord,
} from "../domain/gm";
import { SYSTEM_USER_ID } from "./starter_zone_registry";

const MAX_RECENT = 20;

export function readGmAllowlist(nk: nkruntime.Nakama): GmAllowlist {
  const objects = nk.storageRead([
    { collection: GM_COLLECTION, key: GM_ALLOWLIST_KEY, userId: SYSTEM_USER_ID },
  ]);
  if (objects.length === 0) {
    return emptyGmAllowlist();
  }
  return parseGmAllowlist(objects[0].value as { [key: string]: unknown });
}

export function writeGmAudit(nk: nkruntime.Nakama, audit: GmAuditRecord, auditId: string): void {
  nk.storageWrite([
    {
      collection: GM_AUDIT_COLLECTION,
      key: storageKey(GM_AUDIT_KEY, auditId),
      userId: SYSTEM_USER_ID,
      value: {
        administratorUser: audit.administratorUser,
        targetCharacter: audit.targetCharacter,
        command: audit.command,
        reason: audit.reason,
        timestamp: audit.timestamp,
        result: audit.result,
        requestId: audit.requestId,
        schemaVersion: GM_SCHEMA_VERSION,
      },
      permissionRead: GM_PERMISSION_READ,
      permissionWrite: GM_PERMISSION_WRITE,
    },
  ]);
  const recent = readRecentIds(nk);
  const next = [auditId].concat(recent).slice(0, MAX_RECENT);
  nk.storageWrite([
    {
      collection: GM_COLLECTION,
      key: GM_RECENT_KEY,
      userId: SYSTEM_USER_ID,
      value: { ids: next, schemaVersion: GM_SCHEMA_VERSION },
      permissionRead: GM_PERMISSION_READ,
      permissionWrite: GM_PERMISSION_WRITE,
    },
  ]);
}

export function readRecentGmAudits(nk: nkruntime.Nakama, limit: number): GmAuditRecord[] {
  const ids = readRecentIds(nk).slice(0, limit);
  if (ids.length === 0) {
    return [];
  }
  const reads: nkruntime.StorageReadRequest[] = [];
  for (let i = 0; i < ids.length; i++) {
    reads.push({ collection: GM_AUDIT_COLLECTION, key: storageKey(GM_AUDIT_KEY, ids[i]), userId: SYSTEM_USER_ID });
  }
  const objects = nk.storageRead(reads);
  const out: GmAuditRecord[] = [];
  for (let i = 0; i < objects.length; i++) {
    const value = objects[i].value as { [key: string]: unknown };
    out.push({
      administratorUser: typeof value.administratorUser === "string" ? value.administratorUser : "",
      targetCharacter: typeof value.targetCharacter === "string" ? value.targetCharacter : "",
      command: typeof value.command === "string" ? value.command : "",
      reason: typeof value.reason === "string" ? value.reason : "",
      timestamp: typeof value.timestamp === "number" ? value.timestamp : 0,
      result: typeof value.result === "string" ? value.result : "",
      requestId: typeof value.requestId === "string" ? value.requestId : "",
      schemaVersion: GM_SCHEMA_VERSION,
    });
  }
  return out;
}

export interface GmCommandResult {
  ok: boolean;
  code: string;
  result: { [key: string]: unknown };
}

export function writeGmCommandResult(nk: nkruntime.Nakama, requestId: string, value: GmCommandResult): void {
  nk.storageWrite([
    {
      collection: GM_COLLECTION,
      key: storageKey(GM_SIGNAL_KEY, requestId),
      userId: SYSTEM_USER_ID,
      value: {
        ok: value.ok,
        code: value.code,
        result: value.result,
        schemaVersion: GM_SCHEMA_VERSION,
      },
      permissionRead: GM_PERMISSION_READ,
      permissionWrite: GM_PERMISSION_WRITE,
    },
  ]);
}

export function readGmCommandResult(nk: nkruntime.Nakama, requestId: string): GmCommandResult | null {
  const objects = nk.storageRead([
    { collection: GM_COLLECTION, key: storageKey(GM_SIGNAL_KEY, requestId), userId: SYSTEM_USER_ID },
  ]);
  if (objects.length === 0) {
    return null;
  }
  const value = objects[0].value as { [key: string]: unknown };
  const result = value.result !== null && typeof value.result === "object" && !Array.isArray(value.result)
    ? (value.result as { [key: string]: unknown })
    : {};
  return {
    ok: value.ok === true,
    code: typeof value.code === "string" ? value.code : "internal_error",
    result: result,
  };
}

function readRecentIds(nk: nkruntime.Nakama): string[] {
  const objects = nk.storageRead([{ collection: GM_COLLECTION, key: GM_RECENT_KEY, userId: SYSTEM_USER_ID }]);
  if (objects.length === 0) {
    return [];
  }
  const value = objects[0].value as { [key: string]: unknown };
  if (!Array.isArray(value.ids)) {
    return [];
  }
  const ids: string[] = [];
  for (let i = 0; i < value.ids.length; i++) {
    if (typeof value.ids[i] === "string") {
      ids.push(value.ids[i]);
    }
  }
  return ids;
}
