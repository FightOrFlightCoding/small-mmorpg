import { formatOpsLog } from "./ops_metrics";

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

export function isAccountAuditEvent(event: string): event is AccountAuditEvent {
  for (let i = 0; i < ACCOUNT_AUDIT_EVENTS.length; i++) {
    if (ACCOUNT_AUDIT_EVENTS[i] === event) {
      return true;
    }
  }
  return false;
}

const ACCOUNT_SECRET_KEYS = ["code", "challenge_secret", "secret_hash"];

export function formatAccountAudit(
  event: AccountAuditEvent,
  fields: { [key: string]: string | number | boolean } = {},
): string {
  const safe: { [key: string]: string | number | boolean } = {};
  const keys = Object.keys(fields);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const lowered = key.toLowerCase();
    let skip = false;
    for (let s = 0; s < ACCOUNT_SECRET_KEYS.length; s++) {
      if (lowered.indexOf(ACCOUNT_SECRET_KEYS[s]) !== -1) {
        skip = true;
        break;
      }
    }
    if (!skip) {
      safe[key] = fields[key];
    }
  }
  return formatOpsLog(event, safe);
}
