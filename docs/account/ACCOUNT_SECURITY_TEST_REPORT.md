# Account security test report

ACCT-09 results. Binding matrix: `server/src/domain/account_security_catalog.ts` (**85** threats). Failure map: `server/src/domain/account_failure_catalog.ts` (**15**). Rate limits: `auth-gateway/src/rate_limits/catalog.ts` and `server/src/domain/account_rate_catalog.ts`. Readiness: [ACCOUNT_LIFECYCLE_READY.md](ACCOUNT_LIFECYCLE_READY.md).

Gate date: **2026-08-25**. Suggested tag (not created): **`account-character-lifecycle-v1`**.

## Commands run

Hermetic (this certification):

```powershell
# auth-gateway
Set-Location auth-gateway
npm test
# 49/49

# Nakama domain
Set-Location server
npm test
# 532 passed, 13 skipped live, 0 failed

# Godot
powershell -File scripts/test-client.ps1
# SHELL_LOGIN; GdUnit 273/273; 0 orphans
```

Clean-checkout sequence (documented; Docker and export are optional flags):

```powershell
powershell -File scripts/setup.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/server-build.ps1
Set-Location auth-gateway; npm ci; npm run build; Set-Location ..
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-auth-gateway.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/export-client-release.ps1
```

One-shot hermetic wrapper: `powershell -File scripts/test-account-lifecycle.ps1`

Live optional: `powershell -File scripts/test-account-lifecycle.ps1 -StartStack -ExportRelease -LiveFailure`

## Rate-limit catalog

Retry copy is always “Too many attempts. Wait and try again.” plus `retry_after_seconds`. Responses do not say whether an account exists. **No permanent lockout** from failed public requests.

| Action | Window | Max | Key |
| --- | --- | --- | --- |
| registration | 10 min | 5 | email hash |
| verification_request | 10 min | 5 | email hash (generic 200 if unknown) |
| verification_attempt | 10 min | 20 | challenge |
| login | 60 s | 20 | email hash |
| password_reset_request | 10 min | 5 | email hash |
| password_reset_attempt | 10 min | 20 | challenge |
| email_change_request | 10 min | 5 | user |
| email_change_attempt | 10 min | 20 | challenge |
| account_deletion_request | 10 min | 5 | user |
| account_deletion_attempt | 10 min | 20 | user |
| session_refresh | 60 s | 30 | IP |
| character_create | 10 s | 20 | user (Nakama) |
| character_name | 10 s | 30 | user (Nakama) |
| character_select | 10 s | 20 | user (Nakama) |
| Supporting | IP 30/60s; provider 20/60s; Nakama auth 5/10s | | |

## Audit events

Recorded (no password, code, token, gateway secret, or raw provider payload): `registration_requested`, `account_created`, `email_verified`, `login_success`, `login_failure` (reason category only), `session_refreshed`, `session_revoked`, `logout_current`, `logout_all`, `password_reset_requested`, `password_reset_completed`, `password_changed`, `email_change_requested`, `email_changed`, `character_created`, `character_selected`, `character_soft_deleted`, `character_restored`, `character_purged`, `lease_acquired`, `lease_link_dead`, `lease_released`, `stale_lease_repaired`, `account_export_generated`, `account_deletion_requested`, `account_deletion_completed`.

Login failure categories: `invalid_credentials`, `disabled`, `deleting`, `unverified`. Unknown email and bad password share `invalid_credentials`.

## Threat matrix

Every id below is a row in `ACCOUNT_SECURITY_CONTROLS` with validation, rate limit, idempotency, expected error, tests, and audit. Tests listed are the catalog’s primary files.

### Registration

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| duplicate_email | AUTH_REGISTRATION_FAILED | gateway, lifecycle_cert | registration_requested |
| email_case_variation | same canonical | gateway, email.test.ts | account_created |
| concurrent_registration | AUTH_REGISTRATION_FAILED | gateway | registration_requested |
| oversized_email | AUTH_VALIDATION / PAYLOAD_TOO_LARGE | gateway | none |
| oversized_password | AUTH_VALIDATION / AUTH_PASSWORD_WEAK | gateway | none |
| common_password | AUTH_PASSWORD_WEAK | gateway | none |
| registration_spam | AUTH_RATE_LIMITED / closed | gateway, auth_hooks | registration_requested |
| registration_replay | 200 replay | gateway, lifecycle_cert | account_created |
| terms_version_bypass | AUTH_VALIDATION | gateway | none |
| development_auth_in_release | development_auth_blocked | account_release_audit, auth_flow, auth_hooks | none |

### Verification

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| code_guessing | AUTH_CHALLENGE_LOCKED / INVALID | gateway, auth_challenge | none |
| expired_code | AUTH_CHALLENGE_EXPIRED | gateway, auth_challenge | none |
| replayed_code | 200 idempotent or INVALID | gateway, auth_challenge | email_verified |
| multiple_simultaneous_codes | INVALID for stale | gateway, auth_challenge | none |
| resend_spam | 200 generic or RATE_LIMITED | gateway | none |
| verify_another_account | AUTH_INVALID_CHALLENGE | gateway, auth_challenge | none |
| stale_email_index | lookup reject | account_compat, gateway | none |
| email_delivery_failure | 200 verification_required | gateway, email, account_ux | account_created |

### Login and sessions

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| invalid_password | AUTH_INVALID_CREDENTIALS | gateway, auth_privacy, auth_flow | login_failure |
| account_enumeration | AUTH_INVALID_CREDENTIALS | gateway, auth_privacy | login_failure |
| token_theft | refresh fails after logout-all | gateway, auth_flow | session_revoked |
| expired_access_token | AUTH_FORBIDDEN / SESSION_EXPIRED | gateway, auth_flow | none |
| revoked_refresh_token | AUTH_INVALID_CREDENTIALS | gateway, account_service | session_revoked |
| logout_current_replay | 200 | gateway, lifecycle_cert | logout_current |
| logout_all_devices | later refresh 401 | gateway, lifecycle_cert, auth_flow | logout_all |
| multiple_devices | account_busy on second play | gameplay_lease, gateway | login_success |
| disabled_account | AUTH_ACCOUNT_DISABLED | gateway, account_gate | login_failure |
| deleting_account | AUTH_ACCOUNT_DELETING | gateway, account_gate, account_deletion | login_failure |
| deleted_account | AUTH_INVALID_CREDENTIALS | gateway, account_deletion, lifecycle_cert | login_failure |

### Password recovery

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| reset_missing_account | 200 generic | gateway | password_reset_requested |
| reset_existing_account | 200 same copy | gateway, lifecycle_cert | password_reset_requested |
| reset_response_comparison | same message_key | gateway | password_reset_requested |
| reset_timing | elapsed within pad | gateway | password_reset_requested |
| reset_brute_force | AUTH_RESET_INVALID / LOCKED | gateway, auth_challenge | none |
| reset_replay | require_login, no tokens | gateway | password_reset_completed |
| reset_after_email_change | 200 generic; old login fails | gateway | password_reset_requested |
| reset_after_account_deletion | 200 generic | gateway, account_deletion | password_reset_requested |
| old_password_after_reset | AUTH_INVALID_CREDENTIALS | gateway, lifecycle_cert | login_failure |
| reset_session_revocation | refresh fails | gateway | session_revoked |

### Email change

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| email_change_already_used | AUTH_EMAIL_TAKEN | gateway | none |
| email_change_stale_challenge | EXPIRED / INVALID | gateway | none |
| email_change_replay | 200 require_login | gateway | email_changed |
| concurrent_email_changes | INVALID for loser | gateway | email_change_requested |
| email_change_midway_failure | AUTH_UNAVAILABLE; old email stays | gateway | none |
| old_email_login_after_change | AUTH_INVALID_CREDENTIALS | gateway, lifecycle_cert | login_failure |
| new_email_login_after_change | 200 same user id | gateway, lifecycle_cert | login_success |
| email_index_repair | stale HMAC ignored | account_compat, gateway | email_changed |
| email_change_session_revocation | refresh fails | gateway | session_revoked |

### Characters

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| sixth_active_character | slot_limit | character_lifecycle | none |
| foreign_character | CHARACTER_NOT_OWNED | character_lifecycle, match | none |
| forged_character_id | character_missing | character_lifecycle | none |
| forged_class | invalid class | character_lifecycle | none |
| forged_level_or_starter_items | unknown_field / ignored | character_lifecycle | character_created |
| duplicate_character_creation | 200 replay | character_lifecycle | character_created |
| concurrent_same_name | name_taken | character_lifecycle | none |
| deleted_character_selection | character_deleted | character_lifecycle | none |
| restore_with_full_slots | slot_limit | character_lifecycle, account_ux | none |
| purge_replay | already purged | character_lifecycle | character_purged |

### Active character / lease

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| two_sessions_selecting | account_busy | gameplay_lease | lease_acquired |
| two_characters_one_account | account_busy | gameplay_lease, character_select_ui | none |
| selection_ticket_replay | selection_invalidated | character_lifecycle, match | none |
| expired_ticket | selection_expired | character_lifecycle | none |
| interrupted_entry | catalog countdown / repair | gameplay_lease | stale_lease_repaired |
| alt_f4 | CHARACTER_LINK_DEAD | gameplay_lease, persistence, world_render | lease_link_dead |
| forced_process_kill | CHARACTER_LINK_DEAD | gameplay_lease, cert_failure | lease_link_dead |
| network_loss | Connection lost UX | persistence, cert_failure, reconnect | lease_link_dead |
| reconnect_before_ten_seconds | account_busy / countdown | gameplay_lease, persistence | none |
| different_character_before_ten_seconds | account_busy | gameplay_lease | none |
| entry_after_ten_seconds | 200 select | gameplay_lease | lease_released |
| stale_lease | repaired | gameplay_lease | stale_lease_repaired |
| server_restart | public-world fallback | cert_failure, cave | stale_lease_repaired |
| match_crash | stale lease | cert_failure, gameplay_lease | stale_lease_repaired |
| death_while_link_dead | player_dead after death | gameplay_lease, combat_pipeline | lease_link_dead |

### Account deletion

| Id | Expected error | Tests | Audit |
| --- | --- | --- | --- |
| delete_wrong_password | AUTH_INVALID_CREDENTIALS | gateway | none |
| delete_wrong_code | AUTH_INVALID_CHALLENGE | gateway, auth_challenge | none |
| delete_expired_code | AUTH_CHALLENGE_EXPIRED | gateway | none |
| delete_missing_phrase | AUTH_DELETE_PHRASE | gateway, account_deletion | none |
| delete_while_active_character | AUTH_ACCOUNT_BUSY / DELETE_ACTIVE | gateway, account_deletion | none |
| deletion_replay | 200 resume | gateway, account_deletion | account_deletion_completed |
| partial_deletion | 200 / DELETING | account_deletion, gateway | account_deletion_requested |
| session_use_during_deletion | AUTH_ACCOUNT_DELETING | account_gate, gateway | login_failure |
| old_token_after_deletion | AUTH_FORBIDDEN / INVALID_CREDENTIALS | gateway, lifecycle_cert | session_revoked |
| email_reuse | 200 new user_id | gateway, account_deletion, lifecycle_cert | account_created |
| new_account_isolation | empty catalog | gateway, account_deletion, lifecycle_cert | account_deletion_completed |
| backup_replay | original user id removed | account_deletion | account_deletion_completed |

## Failure tests

| Id | Recoverable state | Tests |
| --- | --- | --- |
| auth_gateway_unavailable | Server Unavailable | account_ux, account_service, auth_flow |
| nakama_unavailable | /ready nakama=false | gateway, account_ux, cert_failure |
| postgres_unavailable | stack unhealthy then recover | cert_failure, test-failure.ps1 |
| email_provider_unavailable | account kept | gateway, email, account_ux |
| email_delayed | delay copy | account_ux, gateway |
| gateway_restart | export cache lost; login works | gateway, account_service |
| nakama_restart | lease repair | cert_failure, gameplay_lease, reconnect, cave |
| database_restart | disposable `-Live` | cert_failure, test-failure.ps1 |
| client_crash_registration | resume Verify | auth_flow, gateway, account_ux |
| client_crash_verification | idempotent verify | gateway, auth_flow |
| client_crash_password_reset | require_login | gateway, auth_flow |
| client_crash_character_creation | same characterId | character_lifecycle, account_ux |
| client_crash_world_entry | ENTERING repair | gameplay_lease, zone_join |
| client_crash_safe_departure | stay in-world until ack | zone_join, gameplay_lease |
| deletion_interrupted_every_phase | resume completedPhases | account_deletion, gateway |

Live Nakama/Postgres restart is `scripts/test-failure.ps1 -Live` on a disposable stack (not part of `scripts/test-all`).

## Five-account, deletion, backup, release

| Check | Result |
| --- | --- |
| Five unique emails register/verify/login | Pass — `lifecycle_cert.test.ts` |
| Duplicate email rejected | Pass — 409 `AUTH_REGISTRATION_FAILED` |
| Five slots; Warrior/Marksman/Mage; sixth rejected | Pass — `character_lifecycle.test.ts` |
| Foreign name uniqueness | Pass — `character_lifecycle.test.ts` |
| World entry / Character Select / Login | Pass — `auth_flow_test.gd`, `zone_join_test.gd` |
| Logout-all invalidates sibling refresh | Pass — `lifecycle_cert.test.ts` |
| Password reset; old fails; new succeeds | Pass — `lifecycle_cert.test.ts` |
| Email change; old fails; new succeeds | Pass — `lifecycle_cert.test.ts` |
| Soft-delete frees slot; restore | Pass — `character_lifecycle.test.ts` |
| Link-dead 10 s, no move, PvE, blocked re-entry, countdown, no duplicate | Pass — `gameplay_lease.test.ts` (hermetic; not a live two-client Alt+F4 session) |
| Dedicated deletion + email reuse + new user id | Pass — `gateway.test.ts`, `lifecycle_cert.test.ts` |
| Isolation of items/gold/quests/names/lease | Pass — `account_deletion.test.ts` domain saga |
| Backup replay by user id | Pass — `account_deletion.test.ts` |
| Release hides Alice/Bob, Mailpit, local gateway URL | Pass — `account_release_audit_test.gd` |
| Gateway URL override | Pass — `--gateway-url=` / `VIBECODE_AUTH_GATEWAY_URL` |
| No secrets in project files | Pass — production secrets stay in gitignored env; SDK `defaultkey` is vendor debug |
| Release Windows export | Not rebuilt this run (export templates are workstation-local) |

## Honesty

This phase did not add account features. It centralized named limits and audits, hid release operator hints, and certified against existing suites. Graphical five-email Mailpit play, live Alt+F4 with a second observer, and a new release `.exe` remain operator steps listed above.
