import { requireAuthenticatedUserId } from "../domain/character";
import { isGmAuthorized, type GmAccount } from "../domain/gm";
import { parseMaintenancePayload } from "../domain/maintenance";
import { formatOpsLog, snapshotCounters } from "../domain/ops_metrics";
import { PROTOCOL_VERSION } from "../domain/protocol";
import { contentHash, packageVersion } from "../generated/content";
import { readGmAllowlist } from "../nakama/gm_store";
import {
  applyAndStoreMaintenance,
  readEffectiveMaintenance,
  readEnvironment,
} from "../nakama/ops_store";

export const OPS_STATUS_RPC_ID = "ops_status";
export const OPS_SET_MAINTENANCE_RPC_ID = "ops_set_maintenance";

export function parseEmptyOpsPayload(payload: string): void {
  const trimmed = payload.trim();
  if (trimmed.length === 0) {
    return;
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
  const keys = Object.keys(parsed);
  if (keys.length > 0) {
    throw new Error("unknown_field:" + keys[0]);
  }
}

export function rpcOpsStatus(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const userId = requireAuthenticatedUserId(ctx.userId);
  parseEmptyOpsPayload(payload);
  const env = readEnvironment(ctx);
  const maintenance = readEffectiveMaintenance(nk, env, ctx.env);
  logger.info(formatOpsLog("ops_status", { user_id: userId, environment: env.name }));
  return JSON.stringify({
    ok: true,
    environment: env.name,
    serverVersion: env.serverVersion,
    protocolVersion: PROTOCOL_VERSION,
    contentHash: contentHash,
    contentVersion: env.contentVersion.length > 0 ? env.contentVersion : packageVersion,
    minClientVersion: env.minClientVersion,
    maxClientVersion: env.maxClientVersion,
    logLevel: env.logLevel,
    developmentToolsEnabled: env.developmentToolsEnabled,
    deviceAuthEnabled: env.deviceAuthEnabled,
    accountRegistration: env.accountRegistration,
    dataReset: env.dataReset,
    maintenance: {
      enabled: maintenance.enabled,
      message: maintenance.message,
      rejectJoins: maintenance.rejectJoins,
      blockTransactions: maintenance.blockTransactions,
      shutdownAt: maintenance.shutdownAt,
      warnAt: maintenance.warnAt,
    },
    counters: snapshotCounters(),
  });
}

export function rpcOpsSetMaintenance(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const userId = requireAuthenticatedUserId(ctx.userId);
  const patch = parseMaintenancePayload(payload);
  const allowlist = readGmAllowlist(nk);
  const account = gmAccountFromNakama(userId, nk.accountGetId(userId));
  if (!isGmAuthorized(allowlist, account)) {
    const code = allowlist.enabled === true ? "unauthorized" : "gm_disabled";
    logger.info(formatOpsLog("ops_set_maintenance", { user_id: userId, reason: code }));
    throw new Error(code);
  }
  const next = applyAndStoreMaintenance(nk, patch, Date.now());
  logger.info(
    formatOpsLog("ops_set_maintenance", {
      user_id: userId,
      enabled: next.enabled,
      reject_joins: next.rejectJoins,
      block_transactions: next.blockTransactions,
    }),
  );
  return JSON.stringify({
    ok: true,
    code: "ok",
    maintenance: next,
  });
}

function gmAccountFromNakama(userId: string, account: nkruntime.Account): GmAccount {
  const result: GmAccount = { userId: userId };
  if (account.customId !== undefined && account.customId.length > 0) {
    result.customId = account.customId;
  }
  if (account.email !== undefined && account.email.length > 0) {
    result.email = account.email;
  }
  return result;
}
