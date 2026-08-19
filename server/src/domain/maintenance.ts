export const OPS_COLLECTION = "ops";
export const OPS_MAINTENANCE_KEY = "maintenance";
export const OPS_METRICS_KEY = "metrics";
export const OPS_PERMISSION_READ = 0;
export const OPS_PERMISSION_WRITE = 0;
export const OPS_SCHEMA_VERSION = 1;

export const DEFAULT_MAINTENANCE_MESSAGE = "The server is in maintenance. Gameplay joins are paused.";

export interface MaintenanceState {
  schemaVersion: number;
  enabled: boolean;
  message: string;
  rejectJoins: boolean;
  blockTransactions: boolean;
  shutdownAt: number;
  warnAt: number;
  updatedAt: number;
}

export function emptyMaintenance(): MaintenanceState {
  return {
    schemaVersion: OPS_SCHEMA_VERSION,
    enabled: false,
    message: "",
    rejectJoins: false,
    blockTransactions: false,
    shutdownAt: 0,
    warnAt: 0,
    updatedAt: 0,
  };
}

export function parseMaintenance(value: unknown): MaintenanceState {
  const fallback = emptyMaintenance();
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }
  const data = value as { [key: string]: unknown };
  return {
    schemaVersion: OPS_SCHEMA_VERSION,
    enabled: data.enabled === true,
    message: typeof data.message === "string" ? data.message : "",
    rejectJoins: data.rejectJoins === true,
    blockTransactions: data.blockTransactions === true,
    shutdownAt: finiteInt(data.shutdownAt, 0),
    warnAt: finiteInt(data.warnAt, 0),
    updatedAt: finiteInt(data.updatedAt, 0),
  };
}

export function applyMaintenancePatch(
  current: MaintenanceState,
  patch: MaintenancePatch,
  nowMs: number,
): MaintenanceState {
  const next: MaintenanceState = {
    schemaVersion: OPS_SCHEMA_VERSION,
    enabled: patch.enabled,
    message: patch.message !== undefined ? patch.message : current.message,
    rejectJoins: patch.rejectJoins !== undefined ? patch.rejectJoins : patch.enabled,
    blockTransactions: patch.blockTransactions !== undefined ? patch.blockTransactions : false,
    shutdownAt: patch.shutdownAt !== undefined ? patch.shutdownAt : 0,
    warnAt: patch.warnAt !== undefined ? patch.warnAt : 0,
    updatedAt: nowMs,
  };
  if (next.enabled && next.message.length === 0) {
    next.message = DEFAULT_MAINTENANCE_MESSAGE;
  }
  if (!next.enabled) {
    next.rejectJoins = false;
    next.blockTransactions = false;
    next.shutdownAt = 0;
    next.warnAt = 0;
    next.message = "";
  }
  return next;
}

export interface MaintenancePatch {
  enabled: boolean;
  message?: string;
  rejectJoins?: boolean;
  blockTransactions?: boolean;
  shutdownAt?: number;
  warnAt?: number;
}

export function parseMaintenancePayload(payload: string): MaintenancePatch {
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
  const allowed = ["enabled", "message", "rejectJoins", "blockTransactions", "shutdownAt", "warnAt", "reason"];
  const keys = Object.keys(data);
  for (let i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) === -1) {
      throw new Error("unknown_field:" + keys[i]);
    }
  }
  if (typeof data.enabled !== "boolean") {
    throw new Error("malformed_json");
  }
  if (data.message !== undefined && typeof data.message !== "string") {
    throw new Error("malformed_json");
  }
  if (data.message !== undefined && data.message.length > 240) {
    throw new Error("malformed_json");
  }
  if (data.rejectJoins !== undefined && typeof data.rejectJoins !== "boolean") {
    throw new Error("malformed_json");
  }
  if (data.blockTransactions !== undefined && typeof data.blockTransactions !== "boolean") {
    throw new Error("malformed_json");
  }
  const patch: MaintenancePatch = { enabled: data.enabled };
  if (typeof data.message === "string") {
    patch.message = data.message;
  }
  if (typeof data.rejectJoins === "boolean") {
    patch.rejectJoins = data.rejectJoins;
  }
  if (typeof data.blockTransactions === "boolean") {
    patch.blockTransactions = data.blockTransactions;
  }
  if (data.shutdownAt !== undefined) {
    patch.shutdownAt = finiteInt(data.shutdownAt, -1);
    if (patch.shutdownAt < 0) {
      throw new Error("malformed_json");
    }
  }
  if (data.warnAt !== undefined) {
    patch.warnAt = finiteInt(data.warnAt, -1);
    if (patch.warnAt < 0) {
      throw new Error("malformed_json");
    }
  }
  return patch;
}

export function forceMaintenanceFromEnv(envFlag: boolean, current: MaintenanceState, nowMs: number): MaintenanceState {
  if (!envFlag) {
    return current;
  }
  return applyMaintenancePatch(current, {
    enabled: true,
    message: current.message.length > 0 ? current.message : DEFAULT_MAINTENANCE_MESSAGE,
    rejectJoins: true,
    blockTransactions: current.blockTransactions,
  }, nowMs);
}

export function shouldRejectGameplayJoin(state: MaintenanceState, alreadyJoined: boolean): boolean {
  if (alreadyJoined) {
    return false;
  }
  return state.enabled && state.rejectJoins;
}

export function transactionsBlocked(state: MaintenanceState): boolean {
  return state.enabled && state.blockTransactions;
}

export function shouldWarnShutdown(state: MaintenanceState, nowMs: number): boolean {
  if (!state.enabled || state.shutdownAt <= 0) {
    return false;
  }
  const warnAt = state.warnAt > 0 ? state.warnAt : state.shutdownAt - 60000;
  return nowMs >= warnAt && nowMs < state.shutdownAt;
}

export function shutdownWarningMessage(state: MaintenanceState, nowMs: number): string {
  if (state.message.length > 0) {
    return state.message;
  }
  if (state.shutdownAt > nowMs) {
    const seconds = Math.max(1, Math.ceil((state.shutdownAt - nowMs) / 1000));
    return "The server will shut down in " + String(seconds) + " seconds.";
  }
  return DEFAULT_MAINTENANCE_MESSAGE;
}

function finiteInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !isFinite(value) || value !== Math.floor(value)) {
    return fallback;
  }
  return value;
}
