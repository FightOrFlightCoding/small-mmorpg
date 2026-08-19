# Auth API catalog

Every authentication, session, account, and character lifecycle endpoint the project uses. HTTP paths are Nakama 3.40.0. RPCs are registered in `server/src/main.ts`.

Player-visible error copy is a domain `code` plus message. The auth gateway returns `{ ok, code, message_key, request_id, retry_after_seconds, field_errors }`. Gameplay RPCs still use Nakama's RPC channel. Domain failures are returned as `{ ok: false, code }` JSON (HTTP 200) because Nakama attaches a stack to every thrown JavaScript value. Godot maps that envelope through `AccountErrors` without leaking stack traces, SQL, RPC names, storage collections, tokens, or whether a reset email exists.

## Nakama HTTP (client / tests)

Authorization: `Basic base64(server_key:)` for authenticate/refresh; `Bearer <access>` for session APIs.

| Operation | Method | Path | Body | Notes |
| --- | --- | --- | --- | --- |
| Register / login email | POST | `/v2/account/authenticate/email?create=true\|false` | `{ email, password, username? }` | `create=false` must not create. Duplicate email on create fails. |
| Device auth (debug) | POST | `/v2/account/authenticate/device?create=true` | `{ id }` | Disabled when `deviceAuthEnabled` is false |
| Refresh | POST | `/v2/account/session/refresh` | `{ token: refresh_token }` | Basic auth |
| Logout current | POST | `/v2/session/logout` | `{ token, refresh_token }` | Invalidates that pair |
| Logout all | POST | `/v2/session/logout` | `{ token: "", refresh_token: "" }` or `{}` | Invalidates all sessions. Wait until the next Unix second after issuing the tokens (Nakama blacklist uses strict `<`). |
| Get account | GET | `/v2/account` | | Client-visible account + wallet; not a full export |
| Update account | PUT | `/v2/account` | username/display/etc. | **Not called by Godot.** Client-writable Nakama fields |
| Link email | POST | `/v2/account/link/email` | `{ email, password }` | Password replace / email replace |
| Unlink email | POST | `/v2/account/unlink/email` | `{ email, password }` | Must not leave zero auth methods |
| Link/unlink device | POST | `/v2/account/link/device`, `/unlink/device` | `{ id }` | Temporary link during credential rotation |
| Delete own account | DELETE | `/v2/account` | | Client self-delete; recorded flag is runtime/console |
| RPC | POST | `/v2/rpc/{id}?unwrap=true` | JSON payload | Session required except `vibecode_health` |

Godot SDK 3.4.0 wraps these. `session_logout_async` always sends the current token pair.

## Console (operators, local `admin` / `password` on `7351`)

| Operation | Method | Path |
| --- | --- | --- |
| Authenticate | POST | `/v2/console/authenticate` `{ username, password }` |
| Export | GET | `/v2/console/account/{id}/export` |
| Recorded delete | DELETE | `/v2/console/account/{id}?record=true` |

Password recovery in Foundation v1 is the auth-gateway reset APIs. The Nakama console remains an operator fallback. Reset HTTP responses do not reveal whether an address exists.

## Runtime (Nakama JS, `nakama-runtime` 1.47.0)

| API | Use in later phases |
| --- | --- |
| `nk.linkEmail(userId, email, password)` | Same-email password replace; new-email link in the temp-device sequence |
| `nk.unlinkEmail(userId, email?)` | Email replace; must not leave zero auth methods |
| `nk.linkDevice` / `nk.unlinkDevice` | Temporary auth method |
| `nk.accountExportId(userId)` | Product export |
| `nk.accountDeleteId(userId, recorded?)` | Product delete **must** pass `recorded=true` |
| `nk.accountGetId(userId)` | Server-side account, wallet, `verifyTime`, `disableTime` |
| `nk.accountUpdateId` | Metadata only if needed; do not store raw email in public indexes |
| `initializer.registerStorageIndex` | HMAC lookup index |
| `nk.storageIndexList` | Three arguments only (`name`, `+value.hmac:<hex>`, `limit`). Empty-string caller id panics. Then **re-read** storage |

Do not use `nk.sqlExec` / `sqlQuery` to change credentials. Do not use Node `crypto` in the runtime; use `hmac.ts`. HTTP-key RPC context on Nakama 3.40.0 has empty `userId` and `sessionId`, which is distinct from a session JWT, but a leaked `http_key` would still invoke the RPC. Product internal RPCs therefore also require a gateway HMAC assertion (`request_id`, `timestamp`, `nonce`, `operation`, `payload_hash`, `signature`) verified with `nk.hmacSha256Hash` + `nk.base16Encode`.

## Auth gateway HTTP (public boundary)

Godot `AccountService` uses these routes for product email entry. Staging/production must use HTTPS. Local Compose publishes `http://127.0.0.1:8787`. Secrets (Nakama server key, HTTP key, SendGrid key, HMAC peppers) stay in the gateway process.

Canonical ACCT-04 routes; ACCT-02 kebab aliases remain:

| Operation | Method | Path | Notes |
| --- | --- | --- | --- |
| Health | GET | `/health` | Process liveness |
| Ready | GET | `/ready` | `{ ok, nakama, email }` |
| Register | POST | `/v1/auth/register` | Canonicalize email, password policy, legal versions, registration mode, Nakama `create=true` with a random username, HMAC index, `PENDING_VERIFICATION`, verification challenge. Duplicate email is generic `AUTH_REGISTRATION_FAILED`. Email failure does not delete the account |
| Request verification | POST | `/v1/auth/verify/request` | Alias: `/v1/auth/resend-verification`. Generic success; rate-limited |
| Confirm verification | POST | `/v1/auth/verify/confirm` | Alias: `/v1/auth/verify-email`. `{ challenge_id, code }` or `{ email, code }`. Sets `ACTIVE`, `verified_at`, confirmation email |
| Login | POST | `/v1/auth/login` | Nakama `create=false`; unknown/wrong password collapsed; `EMAIL_VERIFICATION_REQUIRED` only after valid credentials (no tokens); client-version gate |
| Refresh | POST | `/v1/auth/refresh` | `{ refresh_token }`; revoked/expired → 401 |
| Logout current | POST | `/v1/auth/logout` | Bearer + optional refresh; revokes that pair |
| Logout all | POST | `/v1/auth/logout-all` | Bearer; password unless JWT `iat` is within `AUTH_LOGOUT_ALL_RECENT_MS`; security email |
| Account status | GET | `/v1/account/status` | Bearer; safe status, no internal metadata dump |
| Password reset request | POST | `/v1/auth/password/reset/request` | Alias: `/v1/auth/password-reset/request`. `{ email, client_version }`. Always the same success copy: *If an account exists for that email, password-reset instructions have been sent.* Missing, existing, disabled, unverified, and deleted addresses share that shape. Per-IP, per-email-hash, and global provider limits. Uniform timing pad (`AUTH_RESET_UNIFORM_MS`). Body limit 8192 |
| Password reset confirm | POST | `/v1/auth/password/reset/confirm` | Alias: `/v1/auth/password-reset/confirm`. `{ reset_challenge, new_password, new_password_confirmation, idempotency_key }`. Consume hashed challenge, re-read HMAC index, same-email `nk.linkEmail`, revoke all sessions, `password_changed` mail. **No tokens.** Ordinary login required |
| Change password | POST | `/v1/account/password/change` | Bearer `ACTIVE` session with recent JWT `iat` (`AUTH_SENSITIVE_RECENT_MS`), current password, new/confirm, idempotency. Rejects detectable reuse (`new === current`). Same-email `linkEmail`, revoke all, `password_changed` mail. Client returns to Login |
| Email-change request | POST | `/v1/account/email/change/request` | Alias: `/v1/auth/email-change/request`. Bearer `ACTIVE` + recent session, current password, proposed email, idempotency. Rejects unchanged and taken addresses. Challenge goes to the **new** address; `email_change_old_notice` to the current address. Old email stays active |
| Email-change confirm | POST | `/v1/account/email/change/confirm` | Alias: `/v1/auth/email-change/confirm`. `{ email_change_challenge, new_email, password, idempotency_key }`. Revalidate uniqueness, ACCT-01 temp-device sequence, update HMAC index, revoke all, notify old and new. Failed replace after consume does not lock both addresses; the player requests a new challenge. **No tokens.** Login with the new email |
| Forgotten-email help | GET | `/v1/account/forgot-email` | Copy-only page. No lookup form, no masked email, no character-name reveal |
| Support lookup | GET/POST | `/v1/support/lookup` | Administrator only (`x-support-key` / `AUTH_SUPPORT_LOOKUP_SECRET`). Logs every lookup (`query_kind`, `query_hash`, `hit`, `user_id`). Returns status, verified, character names, and user id. **Never returns an email.** Not a public API |
| Account deletion request | POST | `/v1/auth/account-deletion/request` | Bearer session |
| Account deletion confirm | POST | `/v1/auth/account-deletion/confirm` | `nk.accountDeleteId(id, true)` |
| Hosted confirm | GET/POST | `/v1/confirm` | No analytics; `referrer-policy: no-referrer`; POST then redirect to `/v1/confirm/done` |

Headers: `x-request-id` (generated if missing), `Idempotency-Key` (optional, 10-minute replay), `x-support-key` (support lookup only). Body limit 8192 bytes. Per-IP, per-email-hash, and global email-provider rate-limit foundations. Error envelope `{ ok: false, code, message_key, request_id, retry_after_seconds, field_errors }`. Password-reset request success is `{ ok: true, request_id, message, message_key }` for every address class. Reset/email-change confirm and password/email change success include `require_login: true` and never include access or refresh tokens.

## Authenticate hooks

| Hook | Handler | Effects |
| --- | --- | --- |
| `registerBeforeAuthenticateEmail` | `beforeAuthenticateEmail` | Auth rate 5 / 10 s per email string; `registration_disabled` when env registration is closed |
| `registerBeforeAuthenticateDevice` | `beforeAuthenticateDevice` | Same rate per device id; `device_auth_disabled` when env forbids device auth |

No `registerAfterAuthenticate*`. Unknown authenticate types are not registered.

## Project RPCs (session unless noted)

| RPC | Auth | Player-visible? |
| --- | --- | --- |
| `vibecode_health` | HTTP key | Ops |
| `session_handshake` | session | Yes, after login |
| `character_bootstrap` | session | Debug/compat path |
| `character_list` / `create` / `select` / `soft_delete` / `restore` | session | Yes |
| `find_or_create_starter_zone` | session | Yes |
| Cave / party / trade / GM / ops RPCs | session (+ allowlist for GM/ops write) | Yes / debug |
| `acct_compat_probe` | session + `developmentToolsEnabled` | **No** |
| `auth_gateway` | HTTP key **and** HMAC assertion | **No.** Ordinary session JWT is `gateway_rpc_forbidden`. Ops include `replace_password`, `replace_email` (temp-device sequence + HMAC update), and `support_snapshot` (never returns email) |

Every gameplay join and privileged RPC checks `ctx.userId` and, for email accounts, `requirePlayableUser` (`ACTIVE`, verified, not disabled, not deleting). Handshake, ops, `acct_compat_probe`, and `auth_gateway` are not gated. Device accounts with no email and no profile remain playable.

## Match join

Metadata allowed: `protocolVersion`, `contentHash`, `clientVersion`, `selectionTicket`, `transferTicket`. Rejects include `already_in_match`, `already_elsewhere`, `character_missing`, version gates. Not a global lease.

## Client methods (not interchangeable)

| User intent | Current client behavior |
| --- | --- |
| Return to Character Select | Opcode 32; wait for ack; then Character Select |
| Logout current session | Safe return, then gateway `/v1/auth/logout` when email, Nakama current-token logout, Login. Failed safe leave stays in-world |
| Logout all sessions | Character-select password confirm → `POST /v1/auth/logout-all` → Login. Account and characters preserved |
| Forgot Password | Unauthenticated `POST /v1/auth/password/reset/request` with generic copy, then code + new password. **No auto-login** |
| Change password | Authenticated `POST /v1/account/password/change` → Password Changed → Login |
| Change email | Authenticated request + unauthenticated confirm. Old email stays until confirm. Login with the new address |
| Forgot which email you used? | Copy-only help. No reveal, no automated lookup from the client |
| Quit Game | Quit Safely (opcode 32 then close) or Quit Anyway (unexpected-disconnect lifecycle). Alt+F4 shows the same dialog when the close request is delivered |
| Unexpected disconnect | Connection lost overlay; 10s `LINK_DEAD` after server detection; Character Select countdown; no socket rebind |

## Error sanitization

Login `create=false` always maps to `invalid_credentials` (“Email or password is incorrect.”). Registration duplicate email is generic `AUTH_REGISTRATION_FAILED` (“We could not create this account…”). Do not distinguish unknown email vs bad password on login or on password-reset requests. Do not reveal whether a duplicate-register account is verified. There is no public email-reveal endpoint. Forgotten-email help and support lookup never return an email address.
