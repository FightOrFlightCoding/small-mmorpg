# Auth API catalog

Every authentication, session, account, and character lifecycle endpoint the project uses. HTTP paths are Nakama 3.40.0. RPCs are registered in `server/src/main.ts`.

Player-visible error copy today is a domain `code` plus message, not yet the full `{ ok, code, message_key, request_id, retry_after_seconds, field_errors }` envelope on **gameplay** RPCs. The auth gateway already returns that envelope. Later Godot login must adopt it without leaking stack traces, SQL, RPC names, storage collections, tokens, or whether a reset email exists.

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

Password recovery in Foundation v1 is console-assisted **and** the auth-gateway reset APIs. Reset HTTP responses do not reveal whether an address exists.

## Runtime (Nakama JS, `nakama-runtime` 1.47.0)

| API | Use in later phases |
| --- | --- |
| `nk.linkEmail(userId, email, password)` | Password/email replacement after HTTP sequence is proven |
| `nk.unlinkEmail(userId, email?)` | Same |
| `nk.linkDevice` / `nk.unlinkDevice` | Temporary auth method |
| `nk.accountExportId(userId)` | Product export |
| `nk.accountDeleteId(userId, recorded?)` | Product delete **must** pass `recorded=true` |
| `nk.accountGetId(userId)` | Server-side account, wallet, `verifyTime`, `disableTime` |
| `nk.accountUpdateId` | Metadata only if needed; do not store raw email in public indexes |
| `initializer.registerStorageIndex` | HMAC lookup index |
| `nk.storageIndexList` | Three arguments only (`name`, `+value.hmac:<hex>`, `limit`). Empty-string caller id panics. Then **re-read** storage |

Do not use `nk.sqlExec` / `sqlQuery` to change credentials. Do not use Node `crypto` in the runtime; use `hmac.ts`. HTTP-key RPC context on Nakama 3.40.0 has empty `userId` and `sessionId`, which is distinct from a session JWT, but a leaked `http_key` would still invoke the RPC. Product internal RPCs therefore also require a gateway HMAC assertion (`request_id`, `timestamp`, `nonce`, `operation`, `payload_hash`, `signature`) verified with `nk.hmacSha256Hash` + `nk.base16Encode`.

## Auth gateway HTTP (public boundary)

The Godot client is **not** wired to these routes in ACCT-02. Staging/production must use HTTPS. Local Compose publishes `http://127.0.0.1:8787`. Secrets (Nakama server key, HTTP key, SendGrid key, HMAC peppers) stay in the gateway process.

| Operation | Method | Path | Notes |
| --- | --- | --- | --- |
| Health | GET | `/health` | Process liveness |
| Ready | GET | `/ready` | `{ ok, nakama, email }` |
| Register | POST | `/v1/auth/register` | Nakama `create=true`, HMAC index, verification challenge. Email failure does not delete the account |
| Login | POST | `/v1/auth/login` | Nakama `create=false`; collapses unknown/wrong password |
| Verify email | POST | `/v1/auth/verify-email` | `{ challenge_id, code }` |
| Resend verification | POST | `/v1/auth/resend-verification` | Generic success |
| Password reset request | POST | `/v1/auth/password-reset/request` | Generic success; HMAC lookup |
| Password reset confirm | POST | `/v1/auth/password-reset/confirm` | Consume + `linkEmail` same address |
| Email-change request | POST | `/v1/auth/email-change/request` | Bearer session; notice to old address |
| Email-change confirm | POST | `/v1/auth/email-change/confirm` | ACCT-01 temp-device sequence |
| Account deletion request | POST | `/v1/auth/account-deletion/request` | Bearer session |
| Account deletion confirm | POST | `/v1/auth/account-deletion/confirm` | `nk.accountDeleteId(id, true)` |
| Hosted confirm | GET/POST | `/v1/confirm` | No analytics; `referrer-policy: no-referrer`; POST then redirect to `/v1/confirm/done` |

Headers: `x-request-id` (generated if missing), `Idempotency-Key` (optional, 10-minute replay). Body limit 8192 bytes. Per-IP and per-email-hash rate-limit foundations. Error envelope `{ ok: false, code, message_key, request_id, retry_after_seconds, field_errors }`.

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
| `auth_gateway` | HTTP key **and** HMAC assertion | **No.** Ordinary session JWT is `gateway_rpc_forbidden` |

Every gameplay join and privileged RPC today checks `ctx.userId` and match tickets. They do **not** check a project account status. Later phases must add that check without adding a second character model.

## Match join

Metadata allowed: `protocolVersion`, `contentHash`, `clientVersion`, `selectionTicket`, `transferTicket`. Rejects include `already_in_match`, `already_elsewhere`, `character_missing`, version gates. Not a global lease.

## Client methods (not interchangeable)

| User intent | Current client behavior |
| --- | --- |
| Return to Character Select | Not implemented as a distinct server-acked departure |
| Logout current session | `GameService.request_logout` → leave + `session_logout_async` current tokens + Login |
| Logout all sessions | Not exposed |
| Quit Game | Ordinary window close; **not** a proven safe departure |
| Unexpected disconnect | Reconnect overlay; 5s/60s grace; not 10s `LINK_DEAD` |

## Error sanitization

Login `create=false` always maps to `invalid_credentials` (“Email or password is incorrect.”). Registration duplicate email is `email_taken`. Do not distinguish unknown email vs bad password on login or on future password-reset requests.
