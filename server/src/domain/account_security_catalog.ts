import { ACCOUNT_AUDIT_EVENTS, type AccountAuditEvent } from "./account_audit";

export interface AccountSecurityControl {
  id: string;
  category: string;
  threat: string;
  validation: string;
  rateLimit: string;
  idempotency: string;
  expectedError: string;
  tests: string[];
  auditEvent: AccountAuditEvent | "none";
}

function row(
  id: string,
  category: string,
  threat: string,
  validation: string,
  rateLimit: string,
  idempotency: string,
  expectedError: string,
  tests: string[],
  auditEvent: AccountSecurityControl["auditEvent"],
): AccountSecurityControl {
  return {
    id: id,
    category: category,
    threat: threat,
    validation: validation,
    rateLimit: rateLimit,
    idempotency: idempotency,
    expectedError: expectedError,
    tests: tests,
    auditEvent: auditEvent,
  };
}

const GW = "gateway.test.ts";
const LIFE = "lifecycle_cert.test.ts";
const CH = "character_lifecycle.test.ts";
const LEASE = "gameplay_lease.test.ts";
const DEL = "account_deletion.test.ts";
const GATE = "account_gate.test.ts";
const HOOK = "auth_hooks.test.ts";
const PRIV = "auth_privacy.test.ts";
const CHAL = "auth_challenge.test.ts";
const COMPAT = "account_compat.test.ts";
const FLOW = "auth_flow_test.gd";
const REL = "account_release_audit_test.gd";
const FAIL = "cert_failure.test.ts";
const PERS = "persistence.test.ts";
const MATCH = "match.test.ts";

export const ACCOUNT_SECURITY_CONTROLS: AccountSecurityControl[] = [
  row("duplicate_email", "registration", "Register the same email twice", "HMAC lookup + generic AUTH_REGISTRATION_FAILED", "registration 5/10m", "Second create does not insert a second user", "AUTH_REGISTRATION_FAILED", [GW, LIFE], "registration_requested"),
  row("email_case_variation", "registration", "Mix-case or spaced email as a new identity", "canonicalizeEmail trim+lowercase", "registration 5/10m", "Same canonical address", "AUTH_REGISTRATION_FAILED or success on first", [GW, "email.test.ts"], "account_created"),
  row("concurrent_registration", "registration", "Two parallel creates for one address", "Nakama create + index OCC", "registration 5/10m", "Loser is generic failure", "AUTH_REGISTRATION_FAILED", [GW], "registration_requested"),
  row("oversized_email", "registration", "Huge email field", "canonicalize + 8192 body limit", "ip 30/60s", "Rejected before Nakama create", "AUTH_VALIDATION / AUTH_PAYLOAD_TOO_LARGE", [GW], "none"),
  row("oversized_password", "registration", "Password over 128", "validatePassword 15–128", "registration 5/10m", "No account", "AUTH_VALIDATION / AUTH_PASSWORD_WEAK", [GW], "none"),
  row("common_password", "registration", "Common password list", "gateway password policy", "registration 5/10m", "No account", "AUTH_PASSWORD_WEAK", [GW], "none"),
  row("registration_spam", "registration", "Flood register", "per-email-hash + IP + production CLOSED", "registration 5/10m; auth 5/10s", "Extra creates rejected", "AUTH_RATE_LIMITED / registration_disabled", [GW, HOOK], "registration_requested"),
  row("registration_replay", "registration", "Replay Idempotency-Key", "10-minute idempotency cache", "registration 5/10m", "Cached body, no second user", "200 replay", [GW, LIFE], "account_created"),
  row("terms_version_bypass", "registration", "Skip or stale legal versions", "evaluateLegalAcceptance", "registration 5/10m", "No account", "AUTH_VALIDATION", [GW], "none"),
  row("development_auth_in_release", "registration", "Alice/Bob/device in a release export", "OS.is_debug_build / DevIdentity.force_release_config", "n/a", "Buttons hidden; request blocked", "development_auth_blocked", [REL, FLOW, HOOK], "none"),
  row("code_guessing", "verification", "Brute-force email codes", "HMAC compare, five attempts then lock", "verification_attempt 20/10m", "Locked challenge", "AUTH_CHALLENGE_LOCKED / AUTH_INVALID_CHALLENGE", [GW, CHAL], "none"),
  row("expired_code", "verification", "Use a code after TTL", "expires_at check", "verification_attempt 20/10m", "No verify", "AUTH_CHALLENGE_EXPIRED / AUTH_VERIFICATION_EXPIRED", [GW, CHAL], "none"),
  row("replayed_code", "verification", "Reuse a consumed code", "consumed_at + idempotent consume", "verification_attempt 20/10m", "Second success is idempotent; secret not reusable for another user", "200 idempotent or AUTH_INVALID_CHALLENGE", [GW, CHAL], "email_verified"),
  row("multiple_simultaneous_codes", "verification", "Issue overlapping codes", "Sibling invalidation on new issue", "verification_request 5/10m", "Only latest hash verifies", "AUTH_INVALID_CHALLENGE for stale", [GW, CHAL], "none"),
  row("resend_spam", "verification", "Flood resend", "verification_request 5/10m; generic 200", "verification_request 5/10m", "No extra mail after limit; no enumeration", "200 generic or AUTH_RATE_LIMITED", [GW], "none"),
  row("verify_another_account", "verification", "Confirm a foreign challenge", "challenge userId + purpose bind", "verification_attempt 20/10m", "No status change on victim", "AUTH_INVALID_CHALLENGE", [GW, CHAL], "none"),
  row("stale_email_index", "verification", "Act on a reused HMAC hit", "re-read hmac+userId compare", "verification_request 5/10m", "Stale hit ignored", "lookup reject / AUTH_REGISTRATION_FAILED generic", [COMPAT, GW], "none"),
  row("email_delivery_failure", "verification", "Provider down after create", "Account kept; email_send_failed log", "provider 20/60s", "No dummy challenge success delete", "200 verification_required; EMAIL_DELIVERY_DELAYED UX", [GW, "email.test.ts", "account_ux_test.gd"], "account_created"),
  row("invalid_password", "login", "Wrong password", "create=false authenticate", "login 20/60s", "n/a", "AUTH_INVALID_CREDENTIALS", [GW, PRIV, FLOW], "login_failure"),
  row("account_enumeration", "login", "Distinguish unknown email vs bad password", "sanitizeAuthFailure + generic copy", "login 20/60s", "n/a", "AUTH_INVALID_CREDENTIALS", [GW, PRIV, "auth_privacy_test.gd"], "login_failure"),
  row("token_theft", "login", "Use a stolen refresh token after logout-all", "Nakama session blacklist", "session_refresh 30/60s", "Refresh fails", "AUTH_INVALID_CREDENTIALS / AUTH_SESSION_REVOKED", [GW, FLOW], "session_revoked"),
  row("expired_access_token", "login", "Call APIs with expired JWT", "Bearer getAccount / requireActiveBearer", "session_refresh 30/60s", "Refresh or re-login", "AUTH_FORBIDDEN / AUTH_SESSION_EXPIRED", [GW, FLOW], "none"),
  row("revoked_refresh_token", "login", "Refresh after logout current", "refreshSession reject", "session_refresh 30/60s", "No new tokens", "AUTH_INVALID_CREDENTIALS", [GW, "account_service_test.gd"], "session_revoked"),
  row("logout_current_replay", "login", "Replay logout", "Nakama logout is safe to repeat", "ip 30/60s", "Already-revoked pair stays revoked", "200", [GW, LIFE], "logout_current"),
  row("logout_all_devices", "login", "Invalidate sibling sessions", "empty-token logout-all + iat gate", "ip 30/60s", "All refresh tokens die (next Unix second)", "200; later refresh fails", [GW, LIFE, FLOW], "logout_all"),
  row("multiple_devices", "login", "Two live sessions on one account", "Allowed until logout-all; one gameplay lease", "login 20/60s", "Second character blocked by lease", "account_busy on second play", [LEASE, GW], "login_success"),
  row("disabled_account", "login", "Login while DISABLED", "profile + disableTime", "login 20/60s", "No tokens", "AUTH_ACCOUNT_DISABLED", [GW, GATE], "login_failure"),
  row("deleting_account", "login", "Login while DELETING", "status fence", "login 20/60s", "No gameplay tokens", "AUTH_ACCOUNT_DELETING", [GW, GATE, DEL], "login_failure"),
  row("deleted_account", "login", "Login after recorded delete", "missing user / DELETED status", "login 20/60s", "No tokens", "AUTH_INVALID_CREDENTIALS / AUTH_ACCOUNT_DELETING", [GW, DEL, LIFE], "login_failure"),
  row("reset_missing_account", "password_recovery", "Reset unknown email", "HMAC lookup; always same copy", "password_reset_request 5/10m", "No user created", "200 generic message", [GW], "password_reset_requested"),
  row("reset_existing_account", "password_recovery", "Reset a live email", "Challenge only if live profile", "password_reset_request 5/10m", "One hashed challenge", "200 same copy", [GW, LIFE], "password_reset_requested"),
  row("reset_response_comparison", "password_recovery", "Compare missing vs existing HTTP bodies", "Identical success envelope", "password_reset_request 5/10m", "n/a", "same message_key", [GW], "password_reset_requested"),
  row("reset_timing", "password_recovery", "Timing oracle on reset request", "AUTH_RESET_UNIFORM_MS pad", "password_reset_request 5/10m", "n/a", "elapsed within pad tolerance", [GW], "password_reset_requested"),
  row("reset_brute_force", "password_recovery", "Guess reset codes", "five attempts then lock", "password_reset_attempt 20/10m", "Locked", "AUTH_RESET_INVALID / AUTH_CHALLENGE_LOCKED", [GW, CHAL], "none"),
  row("reset_replay", "password_recovery", "Replay confirm", "one-time consume + idempotency", "password_reset_attempt 20/10m", "No second password write", "require_login, no tokens", [GW], "password_reset_completed"),
  row("reset_after_email_change", "password_recovery", "Reset using the old address after change", "Index follows new HMAC", "password_reset_request 5/10m", "Old address is missing-class", "200 generic; old login fails", [GW], "password_reset_requested"),
  row("reset_after_account_deletion", "password_recovery", "Reset a deleted address", "DELETED/DELETING skipped for live challenge", "password_reset_request 5/10m", "No challenge", "200 generic", [GW, DEL], "password_reset_requested"),
  row("old_password_after_reset", "password_recovery", "Sign in with the previous password", "linkEmail replace", "login 20/60s", "Old hash dead", "AUTH_INVALID_CREDENTIALS", [GW, LIFE], "login_failure"),
  row("reset_session_revocation", "password_recovery", "Keep using pre-reset sessions", "revoke all on confirm", "n/a", "Refresh fails", "AUTH_INVALID_CREDENTIALS", [GW], "session_revoked"),
  row("email_change_already_used", "email_change", "Move to an address that is taken", "emailAddressTaken re-check", "email_change_request 5/10m", "Old email stays", "AUTH_EMAIL_TAKEN", [GW], "none"),
  row("email_change_stale_challenge", "email_change", "Confirm after TTL / sibling issue", "expiry + sibling invalidation", "email_change_attempt 20/10m", "No replace", "AUTH_CHALLENGE_EXPIRED / AUTH_INVALID_CHALLENGE", [GW], "none"),
  row("email_change_replay", "email_change", "Replay confirm", "idempotent consume", "email_change_attempt 20/10m", "Second is no-op", "200 require_login", [GW], "email_changed"),
  row("concurrent_email_changes", "email_change", "Two in-flight new addresses", "Latest challenge wins", "email_change_request 5/10m", "One replace", "AUTH_INVALID_CHALLENGE for loser", [GW], "email_change_requested"),
  row("email_change_midway_failure", "email_change", "replace_email fails after consume", "Failed replace does not write new HMAC", "email_change_attempt 20/10m", "Old address remains login", "AUTH_UNAVAILABLE; request a new challenge", [GW], "none"),
  row("old_email_login_after_change", "email_change", "Login with previous email", "Index + Nakama email", "login 20/60s", "n/a", "AUTH_INVALID_CREDENTIALS", [GW, LIFE], "login_failure"),
  row("new_email_login_after_change", "email_change", "Login with the new email", "replace_email success", "login 20/60s", "Same user id", "200 tokens", [GW, LIFE], "login_success"),
  row("email_index_repair", "email_change", "Stale HMAC after replace", "re-read compare", "n/a", "Stale ignored", "lookup reject", [COMPAT, GW], "email_changed"),
  row("email_change_session_revocation", "email_change", "Old sessions after change", "revoke all", "n/a", "Refresh fails", "AUTH_INVALID_CREDENTIALS", [GW], "session_revoked"),
  row("sixth_active_character", "characters", "Create a sixth live slot", "CHARACTER_SLOT_LIMIT 5", "character_create 20/10s", "No sixth record", "slot_limit / CHARACTER_SLOTS_FULL", [CH], "none"),
  row("foreign_character", "characters", "Select another account's id", "roster ownership", "character_select 20/10s", "No ticket", "selection_foreign / CHARACTER_NOT_OWNED", [CH, MATCH], "none"),
  row("forged_character_id", "characters", "Invent a characterId", "roster contains id", "character_select 20/10s", "n/a", "character_missing / CHARACTER_NOT_OWNED", [CH], "none"),
  row("forged_class", "characters", "Unknown or injected classId", "content class catalog", "character_create 20/10s", "No character", "invalid class", [CH], "none"),
  row("forged_level_or_starter_items", "characters", "Send level/items on create", "create body is name+class+idempotency", "character_create 20/10s", "Server starters once", "unknown_field / ignored extras rejected", [CH], "character_created"),
  row("duplicate_character_creation", "characters", "Replay create idempotencyKey", "idem_<op>_<key>", "character_create 20/10s", "Same characterId", "200 replay", [CH], "character_created"),
  row("concurrent_same_name", "characters", "Two accounts claim one display name", "canonical reservation OCC", "character_create 20/10s", "Loser name_taken", "name_taken / CHARACTER_NAME_TAKEN", [CH], "none"),
  row("deleted_character_selection", "characters", "Play a soft-deleted slot", "status SOFT_DELETED", "character_select 20/10s", "n/a", "character_deleted", [CH], "none"),
  row("restore_with_full_slots", "characters", "Restore when five live", "free slot required", "character_create 20/10s", "No restore", "slot_limit / CHARACTER_SLOTS_FULL", [CH, "account_ux_test.gd"], "none"),
  row("purge_replay", "characters", "Run purge twice", "idempotent purge job + audit", "n/a", "Second is no-op", "200 / already purged", [CH], "character_purged"),
  row("two_sessions_selecting", "active_character", "Two sessions select at once", "account OCC lease", "character_select 20/10s", "Second account_busy", "account_busy / ACCOUNT_CHARACTER_ACTIVE", [LEASE], "lease_acquired"),
  row("two_characters_one_account", "active_character", "Second live character while lease held", "one lease per account", "character_select 20/10s", "Play disabled on catalog", "account_busy", [LEASE, "character_select_ui_test.gd"], "none"),
  row("selection_ticket_replay", "active_character", "Reuse a consumed ticket", "consumed on join", "join", "Second join rejected", "selection_invalidated", [CH, MATCH], "none"),
  row("expired_ticket", "active_character", "Join after 300s TTL", "ticket expiry", "join", "n/a", "selection_expired", [CH], "none"),
  row("interrupted_entry", "active_character", "Crash during ENTERING", "ENTERING timeout then stale repair", "n/a", "Lease becomes stale", "catalog countdown / repair", [LEASE], "stale_lease_repaired"),
  row("alt_f4", "active_character", "Close the window", "disconnect → LINK_DEAD 10s", "n/a", "Avatar remains; Play blocked", "CHARACTER_LINK_DEAD", [LEASE, PERS, "world_render_test.gd"], "lease_link_dead"),
  row("forced_process_kill", "active_character", "Kill the client process", "same disconnect detection", "n/a", "10s hold", "CHARACTER_LINK_DEAD", [LEASE, FAIL], "lease_link_dead"),
  row("network_loss", "active_character", "Socket drop", "unbound presence; no session rebind", "n/a", "link-dead entity", "Connection lost UX", [PERS, FAIL, "reconnect_test.gd"], "lease_link_dead"),
  row("reconnect_before_ten_seconds", "active_character", "Rejoin same character early", "new socket not rebound; Play disabled", "character_select 20/10s", "No duplicate avatar", "account_busy / countdown", [LEASE, PERS], "none"),
  row("different_character_before_ten_seconds", "active_character", "Play another character during hold", "account lease", "character_select 20/10s", "Blocked", "account_busy", [LEASE], "none"),
  row("entry_after_ten_seconds", "active_character", "Play after despawnAt", "lease released", "character_select 20/10s", "New ticket required", "200 select", [LEASE], "lease_released"),
  row("stale_lease", "active_character", "Lease whose match is gone", "matchExists + repair", "n/a", "Replaced", "stale lease repaired log", [LEASE], "stale_lease_repaired"),
  row("server_restart", "active_character", "Nakama/Postgres restart", "location + lease repair on next join", "n/a", "No ghost match", "public-world fallback", [FAIL, "cave.test.ts"], "stale_lease_repaired"),
  row("match_crash", "active_character", "Match loop error / empty terminate", "emptyTicks; lease stale", "n/a", "Repair on next select", "stale lease", [FAIL, LEASE], "stale_lease_repaired"),
  row("death_while_link_dead", "active_character", "PvE damages the held avatar", "entity stays; no movement/act; PvE can hit", "n/a", "Death/respawn server-side", "player_dead after death", [LEASE, "combat_pipeline.test.ts"], "lease_link_dead"),
  row("delete_wrong_password", "account_deletion", "Confirm with bad password", "authenticateEmail before saga", "account_deletion_attempt 20/10m", "No freeze", "AUTH_INVALID_CREDENTIALS", [GW], "none"),
  row("delete_wrong_code", "account_deletion", "Wrong email code", "challenge consume", "account_deletion_attempt 20/10m", "No saga", "AUTH_INVALID_CHALLENGE", [GW, CHAL], "none"),
  row("delete_expired_code", "account_deletion", "Expired deletion code", "TTL 15m", "account_deletion_attempt 20/10m", "No saga", "AUTH_CHALLENGE_EXPIRED", [GW], "none"),
  row("delete_missing_phrase", "account_deletion", "Skip DELETE ACCOUNT", "exact phrase", "account_deletion_attempt 20/10m", "No saga", "AUTH_DELETE_PHRASE", [GW, DEL], "none"),
  row("delete_while_active_character", "account_deletion", "Delete during a live lease", "lease fence", "account_deletion_request 5/10m", "No freeze", "AUTH_ACCOUNT_BUSY / AUTH_DELETE_ACTIVE", [GW, DEL], "none"),
  row("deletion_replay", "account_deletion", "Replay confirm idempotency", "same job id continues", "account_deletion_attempt 20/10m", "Phases do not undo", "200 resume", [GW, DEL], "account_deletion_completed"),
  row("partial_deletion", "account_deletion", "Interrupt every saga phase", "resume from completedPhases", "n/a", "Next call continues", "200 / DELETING", [DEL, GW], "account_deletion_requested"),
  row("session_use_during_deletion", "account_deletion", "Play or login during DELETING", "playable-account guard", "login 20/60s", "No match join", "AUTH_ACCOUNT_DELETING / account_deleting", [GATE, GW], "login_failure"),
  row("old_token_after_deletion", "account_deletion", "Bearer after recorded delete", "sessions revoked; user gone", "n/a", "n/a", "AUTH_FORBIDDEN / AUTH_INVALID_CREDENTIALS", [GW, LIFE], "session_revoked"),
  row("email_reuse", "account_deletion", "Register the old email again", "tombstone + new user id", "registration 5/10m", "New Nakama user", "200 new user_id", [GW, DEL, LIFE], "account_created"),
  row("new_account_isolation", "account_deletion", "New user inherits items/gold/quests/names/lease", "saga wipes by user id; names released", "n/a", "Empty catalog, 0 gold", "no old privileges", [GW, DEL, LIFE], "account_deletion_completed"),
  row("backup_replay", "account_deletion", "Restore backup then apply recorded delete", "shouldReplayDeletion uses user id not email", "n/a", "Replacement account with same email survives", "original user id removed", [DEL], "account_deletion_completed"),
];

export const REQUIRED_ACCOUNT_SECURITY_IDS: string[] = ACCOUNT_SECURITY_CONTROLS.map(function (row) {
  return row.id;
});

export function accountSecurityControlById(id: string): AccountSecurityControl | null {
  for (let i = 0; i < ACCOUNT_SECURITY_CONTROLS.length; i++) {
    if (ACCOUNT_SECURITY_CONTROLS[i].id === id) {
      return ACCOUNT_SECURITY_CONTROLS[i];
    }
  }
  return null;
}

export function assertAuditEventKnown(event: AccountSecurityControl["auditEvent"]): boolean {
  if (event === "none") {
    return true;
  }
  for (let i = 0; i < ACCOUNT_AUDIT_EVENTS.length; i++) {
    if (ACCOUNT_AUDIT_EVENTS[i] === event) {
      return true;
    }
  }
  return false;
}
