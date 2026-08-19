import type { AuthChallengePurpose } from "../challenges/types";

export function confirmPage(input: {
  purpose: AuthChallengePurpose;
  requestId: string;
  challengeId?: string;
  code?: string;
  error?: string;
}): string {
  const extra =
    input.purpose === "PASSWORD_RESET"
      ? "<label>New password <input type=\"password\" name=\"password\" minlength=\"15\" autocomplete=\"new-password\"></label>"
      : input.purpose === "EMAIL_CHANGE"
        ? "<label>New email <input name=\"new_email\" type=\"email\" autocomplete=\"email\"></label><label>Current password <input type=\"password\" name=\"password\" autocomplete=\"current-password\"></label>"
        : "";
  const error = input.error !== undefined ? "<p>" + escapeHtml(input.error) + "</p>" : "";
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>Vibecode account</title>" +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'\"></head>" +
    "<body><h1>Confirm account action</h1>" +
    error +
    "<form method=\"post\" action=\"/v1/confirm\"><input type=\"hidden\" name=\"purpose\" value=\"" +
    escapeHtml(input.purpose) +
    "\"><input type=\"hidden\" name=\"challenge_id\" value=\"" +
    escapeHtml(input.challengeId !== undefined ? input.challengeId : "") +
    "\"><input type=\"hidden\" name=\"code\" value=\"" +
    escapeHtml(input.code !== undefined ? input.code : "") +
    "\">" +
    (input.code !== undefined && input.code.length > 0
      ? ""
      : "<label>Code <input name=\"code\" autocomplete=\"one-time-code\"></label>") +
    extra +
    "<button type=\"submit\">Confirm</button></form>" +
    "<p>You can also enter this code in the game client.</p></body></html>"
  );
}

export function resultPage(ok: boolean): string {
  const copy = ok ? "This request was processed." : "This request could not be completed.";
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>Vibecode account</title>" +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'\"></head>" +
    "<body><p>" +
    copy +
    "</p></body></html>"
  );
}

export function parsePurpose(raw: string): AuthChallengePurpose | null {
  if (
    raw === "EMAIL_VERIFICATION" ||
    raw === "PASSWORD_RESET" ||
    raw === "EMAIL_CHANGE" ||
    raw === "ACCOUNT_DELETION"
  ) {
    return raw;
  }
  if (raw === "verify") {
    return "EMAIL_VERIFICATION";
  }
  if (raw === "reset") {
    return "PASSWORD_RESET";
  }
  if (raw === "email") {
    return "EMAIL_CHANGE";
  }
  if (raw === "delete") {
    return "ACCOUNT_DELETION";
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
