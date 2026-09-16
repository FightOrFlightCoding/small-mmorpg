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

export function forgotEmailHelpPage(supportEmail: string): string {
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>Forgot which email you used?</title>" +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'\"></head>" +
    "<body><h1>Forgot which email you used?</h1>" +
    "<p>We cannot show or guess your sign-in email from a character name or other public information.</p>" +
    "<ul><li>Check likely inboxes for verification or account emails.</li>" +
    "<li>Search for the game’s official sender address.</li>" +
    "<li>Contact support at " +
    escapeHtml(supportEmail) +
    ".</li>" +
    "<li>Provide non-secret identifying information such as known character names.</li>" +
    "<li>Provide a private recovery/support ID when one is available (your account user id if you saved it).</li>" +
    "<li>Support will require additional verification and will not reset a password without it.</li></ul>" +
    "</body></html>"
  );
}

export function supportLookupPage(requestId: string, error?: string, result?: string): string {
  const errorHtml = error !== undefined ? "<p>" + escapeHtml(error) + "</p>" : "";
  const resultHtml = result !== undefined ? "<pre>" + escapeHtml(result) + "</pre>" : "";
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>Support lookup</title>" +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'\"></head>" +
    "<body><h1>Internal support lookup</h1>" +
    errorHtml +
    resultHtml +
    "<form method=\"post\" action=\"/v1/support/lookup\">" +
    "<label>Support key <input type=\"password\" name=\"support_key\" autocomplete=\"off\"></label>" +
    "<label>Support ID <input name=\"support_id\" autocomplete=\"off\"></label>" +
    "<label>Character name <input name=\"character_name\" autocomplete=\"off\"></label>" +
    "<input type=\"hidden\" name=\"request_id\" value=\"" +
    escapeHtml(requestId) +
    "\">" +
    "<button type=\"submit\">Look up</button></form>" +
    "<p>This tool never returns an email address. Every lookup is logged.</p></body></html>"
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
