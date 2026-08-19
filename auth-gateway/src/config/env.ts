export type GatewayEnvironment = "local" | "automated_test" | "staging" | "production";
export type EmailProviderName = "memory" | "mailpit" | "sendgrid";

export interface GatewayConfig {
  env: GatewayEnvironment;
  host: string;
  port: number;
  publicBaseUrl: string;
  requestBodyLimit: number;
  requestTimeoutMs: number;
  nakamaHttpUrl: string;
  nakamaServerKey: string;
  nakamaHttpKey: string;
  emailProvider: EmailProviderName;
  smtpHost: string;
  smtpPort: number;
  sendgridApiKey: string;
  emailHealthUrl: string;
  emailFrom: string;
  supportEmail: string;
  emailHmacPepper: string;
  gatewayHmacSecret: string;
  challengeHmacSecret: string;
}

export class ConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super("missing_configuration");
    this.name = "ConfigError";
    this.missing = missing;
  }
}

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return typeof value === "string" ? value : fallback;
}

function parseEnvName(raw: string): GatewayEnvironment {
  if (raw === "local" || raw === "automated_test" || raw === "staging" || raw === "production") {
    return raw;
  }
  return "local";
}

function parseProvider(raw: string, env: GatewayEnvironment): EmailProviderName {
  if (raw === "memory" || raw === "mailpit" || raw === "sendgrid") {
    return raw;
  }
  return env === "local" || env === "automated_test" ? "mailpit" : "sendgrid";
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const name = parseEnvName(env.AUTH_GATEWAY_ENV !== undefined ? env.AUTH_GATEWAY_ENV : "local");
  const publicBaseUrl = env.AUTH_GATEWAY_PUBLIC_BASE_URL !== undefined ? env.AUTH_GATEWAY_PUBLIC_BASE_URL : "http://127.0.0.1:8787";
  const provider = parseProvider(env.EMAIL_PROVIDER !== undefined ? env.EMAIL_PROVIDER : "", name);
  const config: GatewayConfig = {
    env: name,
    host: env.AUTH_GATEWAY_LISTEN_HOST !== undefined ? env.AUTH_GATEWAY_LISTEN_HOST : "0.0.0.0",
    port: parseInt(env.AUTH_GATEWAY_LISTEN_PORT !== undefined ? env.AUTH_GATEWAY_LISTEN_PORT : "8787", 10),
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    requestBodyLimit: 8192,
    requestTimeoutMs: 10000,
    nakamaHttpUrl: env.NAKAMA_HTTP_URL !== undefined ? env.NAKAMA_HTTP_URL : "http://127.0.0.1:7350",
    nakamaServerKey: read("NAKAMA_SERVER_KEY", "defaultkey"),
    nakamaHttpKey: read("NAKAMA_HTTP_KEY", "defaulthttpkey"),
    emailProvider: provider,
    smtpHost: env.SMTP_HOST !== undefined ? env.SMTP_HOST : "127.0.0.1",
    smtpPort: parseInt(env.SMTP_PORT !== undefined ? env.SMTP_PORT : "1025", 10),
    sendgridApiKey: read("SENDGRID_API_KEY"),
    emailHealthUrl:
      env.EMAIL_HEALTH_URL !== undefined
        ? env.EMAIL_HEALTH_URL
        : provider === "mailpit"
          ? "http://" + (env.SMTP_HOST !== undefined ? env.SMTP_HOST : "127.0.0.1") + ":8025/api/v1/info"
          : "",
    emailFrom: env.EMAIL_FROM !== undefined ? env.EMAIL_FROM : "Vibecode <no-reply@localhost>",
    supportEmail: env.EMAIL_SUPPORT_ADDRESS !== undefined ? env.EMAIL_SUPPORT_ADDRESS : "support@localhost",
    emailHmacPepper: read("VIBECODE_EMAIL_HMAC_PEPPER", "local-email-hmac-pepper-not-production"),
    gatewayHmacSecret: read("VIBECODE_GATEWAY_HMAC_SECRET", "local-gateway-hmac-secret-not-production"),
    challengeHmacSecret: read("VIBECODE_CHALLENGE_HMAC_SECRET", "local-challenge-hmac-secret-not-production"),
  };
  validateGatewayConfig(config);
  return config;
}

export function validateGatewayConfig(config: GatewayConfig): void {
  const missing: string[] = [];
  const secure = config.env === "staging" || config.env === "production";
  if (!Number.isFinite(config.port) || config.port <= 0) {
    missing.push("AUTH_GATEWAY_LISTEN_PORT");
  }
  if (config.nakamaHttpUrl.length === 0) {
    missing.push("NAKAMA_HTTP_URL");
  }
  if (config.nakamaServerKey.length === 0) {
    missing.push("NAKAMA_SERVER_KEY");
  }
  if (config.nakamaHttpKey.length === 0) {
    missing.push("NAKAMA_HTTP_KEY");
  }
  if (config.emailHmacPepper.length < 16) {
    missing.push("VIBECODE_EMAIL_HMAC_PEPPER");
  }
  if (config.gatewayHmacSecret.length < 16) {
    missing.push("VIBECODE_GATEWAY_HMAC_SECRET");
  }
  if (config.challengeHmacSecret.length < 16) {
    missing.push("VIBECODE_CHALLENGE_HMAC_SECRET");
  }
  if (secure) {
    if (!config.publicBaseUrl.startsWith("https://")) {
      missing.push("AUTH_GATEWAY_PUBLIC_BASE_URL");
    }
    if (config.nakamaServerKey === "defaultkey" || config.nakamaHttpKey === "defaulthttpkey") {
      missing.push("NAKAMA_SERVER_KEY");
    }
    if (config.emailProvider !== "sendgrid") {
      missing.push("EMAIL_PROVIDER");
    }
    if (config.sendgridApiKey.length === 0) {
      missing.push("SENDGRID_API_KEY");
    }
    if (config.emailHmacPepper.indexOf("not-production") !== -1) {
      missing.push("VIBECODE_EMAIL_HMAC_PEPPER");
    }
    if (config.gatewayHmacSecret.indexOf("not-production") !== -1) {
      missing.push("VIBECODE_GATEWAY_HMAC_SECRET");
    }
    if (config.challengeHmacSecret.indexOf("not-production") !== -1) {
      missing.push("VIBECODE_CHALLENGE_HMAC_SECRET");
    }
  }
  if (missing.length > 0) {
    throw new ConfigError(missing);
  }
}
