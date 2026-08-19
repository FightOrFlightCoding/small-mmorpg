# Account threat model

ACCT-03 puts Godot product email login on the auth gateway and gates gameplay on verified `ACTIVE` accounts. ACCT-04 adds password recovery, logged-in password change, email change, and forgotten-email help. Challenges remain hashed. Email lookup uses `account_profile`. Debug device auth (Alice/Bob) remains playable without an email profile.

## Assets

- Nakama credentials (email/password hashes)
- Session access and refresh tokens
- Character names and roster
- Inventory, equipment, gold, quests, progression
- Party, trade, cave ownership, location
- Verification/reset/deletion codes (hashed at rest)
- Email HMAC pepper

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
- Auth rate limit 5 / 10 s (Nakama hook) plus gateway per-IP and per-email-hash limits
- Production registration closed via Nakama env and gateway `AUTH_REGISTRATION_MODE=CLOSED`
- Device auth disabled in staging/production presets
- Selection tickets TTL 300 s, consumed on join; never join by `characterId`
- `already_in_match` / `already_elsewhere`
- Session cache refuses password keys; Remember Email refuses token/password keys; settings store refuses credential keys
- Structured logs without tokens/passwords
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

## Gaps the later lifecycle must close

| Risk | Gap today |
| --- | --- |
| Refresh token on disk for Stay Signed In | OS credential store is an interface only; Stay Signed In is hidden |
| Compiled server key | Godot debug client still contains `defaultkey` for gameplay/device auth; the gateway also holds it and must not echo it |
| 10 s link-dead | Implemented: entity stays 10 s after **detection**; new socket is not rebound; Play disabled until `despawnAt` |
| Active-character lease | Account-scoped OCC lease; one live character; stale match repair |
| Account delete UI | Gateway deletion confirm exists; Godot delete flow and `DELETING` resume remain later |
| Unverified sweep | Policy + `purge_unverified` + opportunistic duplicate-register purge; no periodic cron of every stale account |
| HMAC pepper | Local Compose uses `local-*-not-production`; staging/production must replace via gitignored env |
| Client `PUT /v2/account` | Unhooked |
| Storage writes from a raw HTTP client | No `beforeStorageWrite`; rely on `permissionWrite: 0` |
| Password in URLs / logs | Client does not put passwords in URLs today; keep that invariant |
| Export over-share | `accountExportId` includes Nakama collections; product export must filter and add project fields |

## Abuse cases mapped to APIs

- Register: canonicalize email, uniqueness, password policy, legal versions, verification challenge, generic duplicate copy.
- Login: canonicalize, `create=false`, sanitized errors, client-version gate, verification required only after proof.
- Reset / forgotten email: HMAC lookup + re-read; same HTTP success whether missing, present, disabled, unverified, or deleted. No public reveal endpoint.
- Change password / email: proven Nakama `linkEmail` / temp-device sequence; logout-all; no password history.
- Delete: authenticated `ACTIVE`, no lease, password + email one-time + typed confirmation + idempotency; `accountDeleteId(id, true)` (Godot UI later).
- Lookup: never store raw email in a publicly readable index. Support snapshot never returns email.
