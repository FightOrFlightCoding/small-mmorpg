export const SERVER_VERSION = "1.0.0";
export const CLIENT_VERSION = "1.0.0";

export type EnvironmentName = "local" | "automated_test" | "staging" | "production";
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type RegistrationPolicy = "open" | "closed";
export type DataResetPolicy = "allowed" | "forbidden";

export interface EnvironmentDatabase {
  name: string;
  volume: string;
  host: string;
  port: number;
}

export interface EnvironmentConfig {
  name: EnvironmentName;
  database: EnvironmentDatabase;
  secretsFile: string;
  contentVersion: string;
  serverVersion: string;
  minClientVersion: string;
  maxClientVersion: string;
  logLevel: LogLevel;
  developmentToolsEnabled: boolean;
  deviceAuthEnabled: boolean;
  accountRegistration: RegistrationPolicy;
  dataReset: DataResetPolicy;
}

const LOCAL: EnvironmentConfig = {
  name: "local",
  database: { name: "nakama", volume: "vibecode_postgres_data", host: "postgres", port: 5432 },
  secretsFile: "infra/.env.local",
  contentVersion: "1.0.0",
  serverVersion: SERVER_VERSION,
  minClientVersion: CLIENT_VERSION,
  maxClientVersion: CLIENT_VERSION,
  logLevel: "DEBUG",
  developmentToolsEnabled: true,
  deviceAuthEnabled: true,
  accountRegistration: "open",
  dataReset: "allowed",
};

const AUTOMATED_TEST: EnvironmentConfig = {
  name: "automated_test",
  database: { name: "nakama_test", volume: "vibecode_test_postgres_data", host: "postgres", port: 5432 },
  secretsFile: "infra/.env.automated_test",
  contentVersion: "1.0.0",
  serverVersion: SERVER_VERSION,
  minClientVersion: CLIENT_VERSION,
  maxClientVersion: CLIENT_VERSION,
  logLevel: "INFO",
  developmentToolsEnabled: true,
  deviceAuthEnabled: true,
  accountRegistration: "open",
  dataReset: "allowed",
};

const STAGING: EnvironmentConfig = {
  name: "staging",
  database: { name: "nakama_staging", volume: "vibecode_staging_postgres_data", host: "postgres", port: 5432 },
  secretsFile: "infra/.env.staging",
  contentVersion: "1.0.0",
  serverVersion: SERVER_VERSION,
  minClientVersion: CLIENT_VERSION,
  maxClientVersion: CLIENT_VERSION,
  logLevel: "INFO",
  developmentToolsEnabled: false,
  deviceAuthEnabled: false,
  accountRegistration: "open",
  dataReset: "forbidden",
};

const PRODUCTION: EnvironmentConfig = {
  name: "production",
  database: { name: "nakama_production", volume: "vibecode_production_postgres_data", host: "postgres", port: 5432 },
  secretsFile: "infra/.env.production",
  contentVersion: "1.0.0",
  serverVersion: SERVER_VERSION,
  minClientVersion: CLIENT_VERSION,
  maxClientVersion: CLIENT_VERSION,
  logLevel: "WARN",
  developmentToolsEnabled: false,
  deviceAuthEnabled: false,
  accountRegistration: "closed",
  dataReset: "forbidden",
};

export const ENVIRONMENT_PRESETS: { [name in EnvironmentName]: EnvironmentConfig } = {
  local: LOCAL,
  automated_test: AUTOMATED_TEST,
  staging: STAGING,
  production: PRODUCTION,
};

export const ENVIRONMENT_NAMES: EnvironmentName[] = ["local", "automated_test", "staging", "production"];

export function isEnvironmentName(value: string): value is EnvironmentName {
  return ENVIRONMENT_NAMES.indexOf(value as EnvironmentName) !== -1;
}

export function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const lower = raw.toLowerCase();
  if (lower === "1" || lower === "true" || lower === "yes") {
    return true;
  }
  if (lower === "0" || lower === "false" || lower === "no") {
    return false;
  }
  return fallback;
}

export function environmentFromRuntime(env: { [key: string]: string } | undefined): EnvironmentConfig {
  const rawName = env !== undefined && typeof env["VIBECODE_ENV"] === "string" ? env["VIBECODE_ENV"] : "local";
  const name: EnvironmentName = isEnvironmentName(rawName) ? rawName : "local";
  const base = ENVIRONMENT_PRESETS[name];
  const overlay: EnvironmentConfig = {
    name: name,
    database: {
      name: envString(env, "VIBECODE_DATABASE_NAME", base.database.name),
      volume: envString(env, "VIBECODE_DATABASE_VOLUME", base.database.volume),
      host: envString(env, "VIBECODE_DATABASE_HOST", base.database.host),
      port: envInt(env, "VIBECODE_DATABASE_PORT", base.database.port),
    },
    secretsFile: envString(env, "VIBECODE_SECRETS_FILE", base.secretsFile),
    contentVersion: envString(env, "VIBECODE_CONTENT_VERSION", base.contentVersion),
    serverVersion: envString(env, "VIBECODE_SERVER_VERSION", base.serverVersion),
    minClientVersion: envString(env, "VIBECODE_MIN_CLIENT_VERSION", base.minClientVersion),
    maxClientVersion: envString(env, "VIBECODE_MAX_CLIENT_VERSION", base.maxClientVersion),
    logLevel: parseLogLevel(envString(env, "VIBECODE_LOG_LEVEL", base.logLevel), base.logLevel),
    developmentToolsEnabled: parseBoolEnv(
      env !== undefined ? env["VIBECODE_DEV_TOOLS"] : undefined,
      base.developmentToolsEnabled,
    ),
    deviceAuthEnabled: parseBoolEnv(
      env !== undefined ? env["VIBECODE_DEVICE_AUTH"] : undefined,
      base.deviceAuthEnabled,
    ),
    accountRegistration: parseRegistration(
      envString(env, "VIBECODE_REGISTRATION", base.accountRegistration),
      base.accountRegistration,
    ),
    dataReset: parseDataReset(envString(env, "VIBECODE_DATA_RESET", base.dataReset), base.dataReset),
  };
  return overlay;
}

export function dataResetAllowed(config: EnvironmentConfig): boolean {
  return config.dataReset === "allowed";
}

function envString(env: { [key: string]: string } | undefined, key: string, fallback: string): string {
  if (env === undefined) {
    return fallback;
  }
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  return value;
}

function envInt(env: { [key: string]: string } | undefined, key: string, fallback: number): number {
  const raw = envString(env, key, "");
  if (raw.length === 0) {
    return fallback;
  }
  const parsed = parseInt(raw, 10);
  if (!isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseLogLevel(value: string, fallback: LogLevel): LogLevel {
  if (value === "DEBUG" || value === "INFO" || value === "WARN" || value === "ERROR") {
    return value;
  }
  return fallback;
}

function parseRegistration(value: string, fallback: RegistrationPolicy): RegistrationPolicy {
  if (value === "open" || value === "closed") {
    return value;
  }
  if (value === "1" || value === "true") {
    return "open";
  }
  if (value === "0" || value === "false") {
    return "closed";
  }
  return fallback;
}

function parseDataReset(value: string, fallback: DataResetPolicy): DataResetPolicy {
  if (value === "allowed" || value === "forbidden") {
    return value;
  }
  if (value === "1" || value === "true") {
    return "allowed";
  }
  if (value === "0" || value === "false") {
    return "forbidden";
  }
  return fallback;
}
