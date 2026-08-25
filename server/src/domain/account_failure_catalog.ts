export interface AccountFailureControl {
  id: string;
  failure: string;
  expectedState: string;
  tests: string[];
}

function row(id: string, failure: string, expectedState: string, tests: string[]): AccountFailureControl {
  return { id: id, failure: failure, expectedState: expectedState, tests: tests };
}

const GW = "gateway.test.ts";
const UX = "account_ux_test.gd";
const FLOW = "auth_flow_test.gd";
const SVC = "account_service_test.gd";
const FAIL = "cert_failure.test.ts";
const DEL = "account_deletion.test.ts";
const LEASE = "gameplay_lease.test.ts";
const JOIN = "zone_join_test.gd";
const REC = "reconnect_test.gd";
const EMAIL = "email.test.ts";
const CH = "character_lifecycle.test.ts";

export const ACCOUNT_FAILURE_CONTROLS: AccountFailureControl[] = [
  row("auth_gateway_unavailable", "Auth gateway process down", "Server Unavailable / AUTH_UNAVAILABLE; no hang", [UX, SVC, FLOW]),
  row("nakama_unavailable", "Nakama HTTP down", "/ready nakama=false; AUTH_UNAVAILABLE; login remains possible after recovery", [GW, UX, FAIL]),
  row("postgres_unavailable", "PostgreSQL down", "Nakama unhealthy; controlled restart restores health", [FAIL, "test-failure.ps1"]),
  row("email_provider_unavailable", "Mail adapter error after create", "Account kept; verification_required; resend later", [GW, EMAIL, UX]),
  row("email_delayed", "Provider slow or inbox lag", "EMAIL_DELIVERY_DELAYED copy; code still works", [UX, GW]),
  row("gateway_restart", "Gateway process restart", "In-memory export/idempotency cache lost; login still works; new export required", [GW, SVC]),
  row("nakama_restart", "Nakama container restart", "Public-world fallback; stale lease repair; sessions refresh or re-login", [FAIL, LEASE, REC, "cave.test.ts"]),
  row("database_restart", "Postgres restart in disposable stack", "Stack becomes healthy; no silent wipe", [FAIL, "test-failure.ps1"]),
  row("client_crash_registration", "Client dies after register HTTP", "Account exists PENDING_VERIFICATION; resume Verify", [FLOW, GW, UX]),
  row("client_crash_verification", "Client dies after code submit", "Idempotent verify; next login ACTIVE", [GW, FLOW]),
  row("client_crash_password_reset", "Client dies after confirm", "Password already replaced; require_login; no tokens", [GW, FLOW]),
  row("client_crash_character_creation", "Client dies after create RPC", "Idempotent replay returns same characterId", [CH, UX]),
  row("client_crash_world_entry", "Client dies during ENTERING", "Lease timeout/stale repair; no duplicate avatar", [LEASE, JOIN]),
  row("client_crash_safe_departure", "Client dies after opcode 32 send", "Failed leave stays in-world until ack; then Character Select", [JOIN, LEASE]),
  row(
    "deletion_interrupted_every_phase",
    "Confirm/resume stops after freeze, cancel, wipe, indexes, revoke, delete_nakama, or complete",
    "Next confirm/status resumes completedPhases; DELETING until complete",
    [DEL, GW],
  ),
];

export const REQUIRED_ACCOUNT_FAILURE_IDS: string[] = ACCOUNT_FAILURE_CONTROLS.map(function (row) {
  return row.id;
});
