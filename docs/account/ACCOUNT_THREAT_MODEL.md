# Account threat model

ACCT-09 certifies the account and character lifecycle for a small external player group. Public email entry stays on the auth gateway. Gameplay stays on verified `ACTIVE` accounts. Challenges remain hashed. Email lookup uses `account_profile` with HMAC re-read. Debug device auth (Alice/Bob) remains playable without an email profile and is hidden in release.

Machine-readable control matrix: `server/src/domain/account_security_catalog.ts` (**85** threats). Every row maps to validation, rate limit, idempotency, expected error, automated test file, and audit event. Failure mapping: `server/src/domain/account_failure_catalog.ts`. Rate-limit catalog: `auth-gateway/src/rate_limits/catalog.ts` and `server/src/domain/account_rate_catalog.ts`. Certification results: [ACCOUNT_SECURITY_TEST_REPORT.md](ACCOUNT_SECURITY_TEST_REPORT.md).

Related: [ACCOUNT_ARCHITECTURE.md](ACCOUNT_ARCHITECTURE.md), [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md), [../SECURITY_MODEL.md](../SECURITY_MODEL.md).

## Assets

- Nakama credentials (email/password hashes)
- Session access and refresh tokens
- Character names and roster
- Inventory, equipment, gold, quests, progression
- Party, trade, cave ownership, location
- Verification/reset/deletion codes (hashed at rest)
- Email HMAC pepper
- Gateway HMAC secrets and mail-provider keys (process-only)

## Adversaries

| Actor | Goal |
| --- | --- |
| Unauthenticated stranger | Register spam, credential stuffing, user enumeration |
| Stolen password | Play as the player, export, delete |
| Stolen refresh token | Silent re-entry |
| Second device / sibling session | Duplicate presence, steal trade, grief while link-dead |
| Compromised client | Forge tickets, write storage, send gold |
| Operator with console | Disable, delete, export (accepted for local/private ops) |
| Stale search index | Act on the wrong user for recovery |

## Controls in place

- Server-authoritative simulation; client intentions only
- `permissionWrite: 0` on canonical collections
- Login errors collapsed to `invalid_credentials`
- Named gateway limits (registration, verify request/attempt, login, reset request/attempt, email-change request/attempt, deletion request/attempt, session refresh) plus IP 30/60s and provider 20/60s
- Nakama session rates: auth 5/10s, character create 20/10s, name check 30/10s, select 20/10s
- **No permanent lockout** from failed public requests; 429 includes `retry_after_seconds` and generic “Too many attempts. Wait and try again.”
- Production registration closed via Nakama env and gateway `AUTH_REGISTRATION_MODE=CLOSED`
- Device auth disabled in staging/production presets and hidden in release
- Selection tickets TTL 300 s, consumed on join; never join by `characterId`
- Account-scoped OCC gameplay lease; 10 s `LINK_DEAD` after **detection**
- Session cache refuses password keys; Remember Email refuses token/password keys; settings store refuses credential keys
- Structured account audits without passwords, codes, tokens, gateway secrets, or raw provider payloads
- GM allowlist default disabled
- Compatibility HMAC lookup rejects missing, multiple, stale, and mismatched hits
- Auth gateway holds Nakama and mail secrets; they are not shipped to Godot
- Staging/production gateway requires HTTPS public URLs and non-default secrets
- Internal RPC `auth_gateway` rejects session JWT (`gateway_rpc_forbidden`) and requires a signed assertion
- Challenges store HMAC only; single-use, expiry, attempt limit, sibling invalidation, idempotent consume
- Password-reset and resend HTTP responses do not reveal account existence
- Duplicate register does not reveal whether the address is verified
- Email provider failure after register or reset does not delete the Nakama user or change the generic reset response
- Hosted confirm pages: no third-party scripts, `referrer-policy: no-referrer`, generic errors
- Gateway password policy 15–128 with a small common-password list
- `requirePlayableUser` rejects unverified, disabled, and deleting email accounts on character RPCs, match discovery/join, chat, party, and GM
- Login returns `EMAIL_VERIFICATION_REQUIRED` only after valid credentials, without tokens
- Logout-all revokes every session after password or recent `iat` and sends a security email
- Email product refresh tokens are not written to `user://`
- Password-reset and email-change challenges are HMAC-only, 15-minute TTL, five attempts, sibling-invalidated, one-time consume
- Password reset and password/email change revoke all sessions and never return login tokens
- Logged-in password and email change require an `ACTIVE` account, current password, and a recent JWT `iat`
- Email change keeps the old address until confirm; uniqueness is re-checked; failed replace does not lock both addresses
- Forgotten-email UI and `/v1/account/forgot-email` never reveal or mask an email. Internal `/v1/support/lookup` is secret-gated, logged, and email-free
- No public email-reveal endpoint
- Account deletion is a 7-phase saga keyed by user id; backup replay never matches on email
- Release presentation hides Alice/Bob, Mailpit, and local gateway URLs

## Remaining accepted limitations

| Risk | Status |
| --- | --- |
| Refresh token on disk for Stay Signed In | OS credential store is an interface only; Stay Signed In is hidden |
| Compiled server key | Godot debug client still contains Nakama SDK `defaultkey` for gameplay/device auth; packaging must not treat it as a player secret. Release UI does not display local URLs. |
| Nakama ping/pong | Link-dead **10 s** starts at **detection**. Frozen clients and cable pulls can sit `ONLINE` until the 15 s ping / 25 s pong wait expires. |

## ACCT-09 threat matrix (summary)

Full rows are in `ACCOUNT_SECURITY_CONTROLS`. Counts:

| Category | Threats |
| --- | --- |
| Registration | 10 |
| Verification | 8 |
| Login and sessions | 11 |
| Password recovery | 10 |
| Email change | 9 |
| Characters | 10 |
| Active character / lease | 15 |
| Account deletion | 12 |
| **Total** | **85** |

Every threat has: Validation, Rate limit, Idempotency behavior, Expected error, Automated test, Audit event. See [ACCOUNT_SECURITY_TEST_REPORT.md](ACCOUNT_SECURITY_TEST_REPORT.md) for the expanded table and pass mapping.

## Abuse cases mapped to APIs

- Register: canonicalize email, uniqueness, password policy, legal versions, verification challenge, generic duplicate copy, named registration limit.
- Login: canonicalize, `create=false`, sanitized errors, client-version gate, verification required only after proof, named login limit.
- Reset / forgotten email: HMAC lookup + re-read; same HTTP success whether missing, present, disabled, unverified, or deleted. No public reveal endpoint.
- Change password / email: proven Nakama `linkEmail` / temp-device sequence; logout-all; no password history.
- Delete: authenticated `ACTIVE`, no lease/trade/transfer, password + email one-time + typed `DELETE ACCOUNT` + click-only confirm + idempotency; freeze `DELETING`; `accountDeleteId(id, true)` only as saga phase 6.
- Lookup: never store raw email in a publicly readable index. Support snapshot never returns email.
- Characters: five live slots, content class IDs, selection tickets, name OCC, account lease.
- Presence: one live character; 10 s link-dead after detection; stale lease repair by match existence.
