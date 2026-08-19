import { loadGatewayConfig, ConfigError } from "./config/env";
import { createGatewayLogger } from "./logging/redact";
import { createEmailProvider } from "./email/provider";
import { NakamaGatewayClient } from "./nakama/client";
import { GatewayRateLimits } from "./rate_limits/memory";
import { createGatewayApp } from "./app/server";

async function main(): Promise<void> {
  const config = loadGatewayConfig();
  const logger = createGatewayLogger(true);
  const email = createEmailProvider(config);
  const nakama = new NakamaGatewayClient(config, logger);
  const app = createGatewayApp({
    config: config,
    logger: logger,
    email: email,
    nakama: nakama,
    rates: new GatewayRateLimits(),
    now: () => Date.now(),
  });
  const close = async () => {
    logger.info("shutdown");
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    void close();
  });
  process.on("SIGINT", () => {
    void close();
  });
  await app.listen({ host: config.host, port: config.port });
  logger.info("listening", { env: config.env, port: config.port });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "startup_failed";
  const missing = error instanceof ConfigError ? error.missing : [];
  process.stderr.write(JSON.stringify({ level: "error", event: "startup_failed", reason: message, missing: missing }) + "\n");
  process.exit(1);
});
