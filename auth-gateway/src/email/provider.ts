import type { GatewayConfig } from "../config/env";
import { MemoryEmailProvider } from "./memory";
import { SendGridEmailProvider } from "./sendgrid";
import { SmtpEmailProvider } from "./smtp";
import type { EmailProvider } from "./templates";

export function createEmailProvider(config: GatewayConfig): EmailProvider {
  if (config.emailProvider === "memory") {
    return new MemoryEmailProvider();
  }
  if (config.emailProvider === "sendgrid") {
    return new SendGridEmailProvider(config.sendgridApiKey, config.emailFrom);
  }
  return new SmtpEmailProvider(config.smtpHost, config.smtpPort, config.emailFrom, config.emailHealthUrl);
}
