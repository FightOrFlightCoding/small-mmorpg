import type { EmailMessage, EmailProvider } from "./templates";

export class MemoryEmailProvider implements EmailProvider {
  readonly name = "memory";
  readonly sent: EmailMessage[] = [];
  failNext = false;
  healthy = true;

  async send(message: EmailMessage): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, reason: "provider_failure" };
    }
    this.sent.push(message);
    return { ok: true };
  }

  async health(): Promise<boolean> {
    return this.healthy;
  }
}
