import { createConnection } from "node:net";
import type { EmailMessage, EmailProvider } from "./templates";

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "mailpit";

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly from: string,
    private readonly healthUrl: string,
  ) {}

  async health(): Promise<boolean> {
    if (this.healthUrl.length === 0) {
      return true;
    }
    try {
      const response = await fetch(this.healthUrl, { method: "GET" });
      return response.ok;
    } catch {
      return false;
    }
  }

  send(message: EmailMessage): Promise<{ ok: true } | { ok: false; reason: string }> {
    const host = this.host;
    const port = this.port;
    const from = this.from;
    return new Promise((resolve) => {
      const socket = createConnection({ host: host, port: port });
      let buffer = "";
      const data = mimeMessage(from, message);
      const commands = [
        "EHLO localhost\r\n",
        "MAIL FROM:<" + extractAddress(from) + ">\r\n",
        "RCPT TO:<" + extractAddress(message.to) + ">\r\n",
        "DATA\r\n",
        data + "\r\n.\r\n",
        "QUIT\r\n",
      ];
      let index = 0;
      let settled = false;
      const finish = (result: { ok: true } | { ok: false; reason: string }) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: "smtp_timeout" }), 5000);
      socket.on("error", () => finish({ ok: false, reason: "smtp_error" }));
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        if (buffer.indexOf("\n") === -1) {
          return;
        }
        buffer = "";
        if (index >= commands.length) {
          finish({ ok: true });
          return;
        }
        socket.write(commands[index]);
        index += 1;
      });
    });
  }
}

function mimeMessage(from: string, message: EmailMessage): string {
  const boundary = "vibecode-alt";
  const raw =
    "From: " +
    from +
    "\r\nTo: " +
    message.to +
    "\r\nSubject: " +
    message.subject +
    "\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"" +
    boundary +
    "\"\r\n\r\n--" +
    boundary +
    "\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" +
    message.text +
    "\r\n--" +
    boundary +
    "\r\nContent-Type: text/html; charset=utf-8\r\n\r\n" +
    message.html +
    "\r\n--" +
    boundary +
    "--";
  return dotStuff(raw);
}

function dotStuff(value: string): string {
  return value.replace(/(^|\n)\./g, "$1..");
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match !== null ? match[1] : value;
}
