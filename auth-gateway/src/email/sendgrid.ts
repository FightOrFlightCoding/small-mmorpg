import type { EmailMessage, EmailProvider } from "./templates";

export class SendGridEmailProvider implements EmailProvider {
  readonly name = "sendgrid";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async send(message: EmailMessage): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      const response = await this.fetchImpl("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: extractAddress(message.to) }] }],
          from: { email: extractAddress(this.from) },
          subject: message.subject,
          content: [
            { type: "text/plain", value: message.text },
            { type: "text/html", value: message.html },
          ],
        }),
      });
      if (response.ok || response.status === 202) {
        return { ok: true };
      }
      return { ok: false, reason: "sendgrid_status" };
    } catch {
      return { ok: false, reason: "sendgrid_error" };
    }
  }
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match !== null ? match[1] : value;
}
