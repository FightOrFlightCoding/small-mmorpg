import { SYSTEM_USER_ID } from "./starter_zone_registry";
import {
  ENVIRONMENT_PRESETS,
  environmentFromRuntime,
  parseBoolEnv,
  type EnvironmentConfig,
} from "../domain/environment";
import {
  OPS_COLLECTION,
  OPS_MAINTENANCE_KEY,
  OPS_METRICS_KEY,
  OPS_PERMISSION_READ,
  OPS_PERMISSION_WRITE,
  OPS_SCHEMA_VERSION,
  applyMaintenancePatch,
  emptyMaintenance,
  forceMaintenanceFromEnv,
  parseMaintenance,
  type MaintenancePatch,
  type MaintenanceState,
} from "../domain/maintenance";
import { snapshotCounters, type OpsCounters } from "../domain/ops_metrics";

export function readEnvironment(ctx: nkruntime.Context): EnvironmentConfig {
  return environmentFromRuntime(ctx.env);
}

export function readMaintenance(nk: nkruntime.Nakama): MaintenanceState {
  const objects = nk.storageRead([
    { collection: OPS_COLLECTION, key: OPS_MAINTENANCE_KEY, userId: SYSTEM_USER_ID },
  ]);
  if (objects.length === 0) {
    return emptyMaintenance();
  }
  return parseMaintenance(objects[0].value);
}

export function readEffectiveMaintenance(nk: nkruntime.Nakama, _env: EnvironmentConfig, ctxEnv?: { [key: string]: string }): MaintenanceState {
  const stored = readMaintenance(nk);
  const forced = parseBoolEnv(ctxEnv !== undefined ? ctxEnv["VIBECODE_MAINTENANCE"] : undefined, false);
  return forceMaintenanceFromEnv(forced, stored, Date.now());
}

export function writeMaintenance(nk: nkruntime.Nakama, state: MaintenanceState): void {
  nk.storageWrite([
    {
      collection: OPS_COLLECTION,
      key: OPS_MAINTENANCE_KEY,
      userId: SYSTEM_USER_ID,
      value: {
        schemaVersion: OPS_SCHEMA_VERSION,
        enabled: state.enabled,
        message: state.message,
        rejectJoins: state.rejectJoins,
        blockTransactions: state.blockTransactions,
        shutdownAt: state.shutdownAt,
        warnAt: state.warnAt,
        updatedAt: state.updatedAt,
      },
      permissionRead: OPS_PERMISSION_READ,
      permissionWrite: OPS_PERMISSION_WRITE,
    },
  ]);
}

export function applyAndStoreMaintenance(nk: nkruntime.Nakama, patch: MaintenancePatch, nowMs: number): MaintenanceState {
  const next = applyMaintenancePatch(readMaintenance(nk), patch, nowMs);
  writeMaintenance(nk, next);
  return next;
}

export function writeMetricsSnapshot(nk: nkruntime.Nakama, counters: OpsCounters = snapshotCounters()): void {
  nk.storageWrite([
    {
      collection: OPS_COLLECTION,
      key: OPS_METRICS_KEY,
      userId: SYSTEM_USER_ID,
      value: {
        schemaVersion: OPS_SCHEMA_VERSION,
        connectedPlayers: counters.connectedPlayers,
        activePublicMatches: counters.activePublicMatches,
        activeCaveMatches: counters.activeCaveMatches,
        transactionFailures: counters.transactionFailures,
        rejectedActions: counters.rejectedActions,
        transferFailures: counters.transferFailures,
        reconnects: counters.reconnects,
        matchLoopErrors: counters.matchLoopErrors,
        updatedAt: Date.now(),
      },
      permissionRead: OPS_PERMISSION_READ,
      permissionWrite: OPS_PERMISSION_WRITE,
    },
  ]);
}

export function defaultEnvironment(): EnvironmentConfig {
  return ENVIRONMENT_PRESETS.local;
}

export function rejectIfGameplayClosed(
  nk: nkruntime.Nakama,
  env: EnvironmentConfig,
  runtimeEnv: { [key: string]: string } | undefined,
  reconnecting: boolean,
): void {
  const maintenance = readEffectiveMaintenance(nk, env, runtimeEnv);
  if (!reconnecting && maintenance.enabled && maintenance.rejectJoins) {
    throw new Error("server_maintenance");
  }
}
