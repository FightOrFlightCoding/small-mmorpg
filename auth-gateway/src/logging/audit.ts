export const ACCOUNT_AUDIT_EVENTS = [
  "registration_requested",
  "account_created",
  "email_verified",
  "login_success",
  "login_failure",
  "session_refreshed",
  "session_revoked",
  "logout_current",
  "logout_all",
  "password_reset_requested",
  "password_reset_completed",
  "password_changed",
  "email_change_requested",
  "email_changed",
  "character_created",
  "character_selected",
  "character_soft_deleted",
  "character_restored",
  "character_purged",
  "lease_acquired",
  "lease_link_dead",
  "lease_released",
  "stale_lease_repaired",
  "account_export_generated",
  "account_deletion_requested",
  "account_deletion_completed",
] as const;

export type AccountAuditEvent = (typeof ACCOUNT_AUDIT_EVENTS)[number];

const FORBIDDEN_SUBSTRINGS = [
  "password",
  "verification_code",
  "reset_code",
  "deletion_code",
  "access_token",
  "refresh_token",
  "gateway_secret",
  "sendgrid",
  "api_key",
  "pepper",
  "code",
];

export function isAccountAuditEvent(event: string): event is AccountAuditEvent {
  for (let i = 0; i < ACCOUNT_AUDIT_EVENTS.length; i++) {
    if (ACCOUNT_AUDIT_EVENTS[i] === event) {
      return true;
    }
  }
  return false;
}

export function sanitizeAuditFields(fields: { [key: string]: unknown } | undefined): { [key: string]: unknown } {
  const out: { [key: string]: unknown } = {};
  if (fields === undefined) {
    return out;
  }
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const lowered = key.toLowerCase();
    let forbidden = false;
    for (let f = 0; f < FORBIDDEN_SUBSTRINGS.length; f++) {
      if (lowered.indexOf(FORBIDDEN_SUBSTRINGS[f]) !== -1) {
        forbidden = true;
        break;
      }
    }
    if (!forbidden) {
      out[key] = fields[key];
    }
  }
  return out;
}
