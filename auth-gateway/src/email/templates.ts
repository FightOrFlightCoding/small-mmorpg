export type EmailTemplateId =
  | "verify_email"
  | "password_reset"
  | "password_changed"
  | "email_change_confirmation"
  | "email_change_old_notice"
  | "account_deletion_confirmation"
  | "account_deleted"
  | "suspicious_session_invalidation";

export interface EmailMessage {
  to: string;
  templateId: EmailTemplateId;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSendInput {
  to: string;
  templateId: EmailTemplateId;
  code?: string;
  confirmUrl?: string;
  expiresAt: Date;
  supportEmail: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ ok: true } | { ok: false; reason: string }>;
  health(): Promise<boolean>;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderEmail(input: EmailSendInput): EmailMessage {
  const expiry = input.expiresAt.toISOString();
  const codeLine = input.code !== undefined ? "Enter this code: " + input.code + "\n" : "";
  const linkLine = input.confirmUrl !== undefined ? "Or open: " + input.confirmUrl + "\n" : "";
  const subjects: { [id in EmailTemplateId]: string } = {
    verify_email: "Verify your Vibecode email",
    password_reset: "Reset your Vibecode password",
    password_changed: "Your Vibecode password changed",
    email_change_confirmation: "Confirm your new Vibecode email",
    email_change_old_notice: "Your Vibecode email is changing",
    account_deletion_confirmation: "Confirm Vibecode account deletion",
    account_deleted: "Your Vibecode account was deleted",
    suspicious_session_invalidation: "A Vibecode session was signed out",
  };
  const intro: { [id in EmailTemplateId]: string } = {
    verify_email: "Confirm this email address to continue creating your account.",
    password_reset: "A password reset was requested for this email.",
    password_changed: "The password on this account was changed. If this was not you, contact support.",
    email_change_confirmation: "Confirm the new email address for this account.",
    email_change_old_notice: "An email change was requested for this account.",
    account_deletion_confirmation: "Confirm that you want to permanently delete this account.",
    account_deleted: "This account has been permanently deleted.",
    suspicious_session_invalidation: "All sessions for this account were signed out.",
  };
  const text =
    intro[input.templateId] +
    "\n\n" +
    codeLine +
    linkLine +
    "This request expires at " +
    expiry +
    ".\nSupport: " +
    input.supportEmail +
    "\n";
  const html =
    "<p>" +
    escapeHtml(intro[input.templateId]) +
    "</p>" +
    (input.code !== undefined ? "<p>Enter this code: <strong>" + escapeHtml(input.code) + "</strong></p>" : "") +
    (input.confirmUrl !== undefined ? "<p><a href=\"" + escapeHtml(input.confirmUrl) + "\">Continue</a></p>" : "") +
    "<p>Expires at " +
    escapeHtml(expiry) +
    ".</p><p>Support: " +
    escapeHtml(input.supportEmail) +
    "</p>";
  return {
    to: input.to,
    templateId: input.templateId,
    subject: subjects[input.templateId],
    text: text,
    html: html,
  };
}
