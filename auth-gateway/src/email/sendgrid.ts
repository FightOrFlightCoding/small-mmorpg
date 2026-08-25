import type { EmailMessage, EmailProvider } from "./templates";

export class SendGridEmailProvider implements EmailProvider {
  readonly name = "sendgrid";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async health(): Promise<boolean> {
    return this.apiKey.length > 0 && !sendgridFromUnusable(this.from);
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
          from: parseFromHeader(this.from),
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

export function parseFromHeader(value: string): { email: string; name?: string } {
  const match = value.match(/^(.*?)<([^>]+)>\s*$/);
  if (match !== null) {
    const name = match[1].trim();
    const email = match[2].trim();
    if (name.length > 0) {
      return { email: email, name: name };
    }
    return { email: email };
  }
  return { email: value.trim() };
}

function extractAddress(value: string): string {
  return parseFromHeader(value).email;
}

function sendgridFromUnusable(value: string): boolean {
  const address = extractAddress(value).toLowerCase();
  if (address.length === 0 || address.indexOf("@") <= 0) {
    return true;
  }
  const domain = address.substring(address.indexOf("@") + 1);
  return domain === "localhost" || domain.endsWith(".localhost") || address.indexOf("replace_me") !== -1;
}
