# Nakama 3.40.0 compatibility results

Proofs for ACCT-01 against pinned **heroiclabs/nakama:3.40.0** and **nakama-runtime 1.47.0**. No dependency upgrades. Custom SQL was not used to mutate authentication tables or password hashes.

Hermetic helpers: `server/tests/email.test.ts`, `hmac.test.ts`, `account_compat.test.ts`.
Live: `ACCT_COMPAT_LIVE=1` via `scripts/test-account-compat.ps1` (`server/tests/account_compat.live.test.ts`).

Live suite on this machine: **10/10 passed** (2026-08-19) after `scripts/backend-up.ps1`. No blocker. Email verification **delivery** is implemented in ACCT-02 (`auth-gateway/` + Mailpit/SendGrid); it is still not a gameplay join gate.

## Supported sequences for later phases

| Product operation | Supported sequence |
| --- | --- |
| register | `POST /v2/account/authenticate/email?create=true` after `canonicalizeEmail`. Before-hook may throw `registration_disabled` / `rate_limited`. Nakama lowercases the address; plus-tags and dots are distinct identities. |
| authenticate | Same path with `create=false`. Never creates. Nakama returns **404** `User account not found.` for an unknown address and **401** `Invalid credentials.` for a wrong password. The Godot client already collapses `create=false` failures to `invalid_credentials`. Password-reset and forgotten-email APIs must do the same. |
| verify email | Gateway issues an `EMAIL_VERIFICATION` challenge and Mailpit/SendGrid delivers the code. Nakama `verifyTime` is still not a gameplay gate. Do not fake verification. |
| reset password | Gateway HMAC lookup + re-read (never reveal hit/miss), then same-email `linkEmail`. Console remains an operator path. |
| change password | `POST /v2/account/link/email` with the **same** canonical email and the **new** password. This updates credentials, preserves the Nakama user id, and rejects the old password. Unlink/relink is **not** required. It is a single call: if it fails, the old password still works. Do not SQL-update hashes. |
| change email | Link a temporary device, unlink the old email, `linkEmail` the new email/password, unlink the device. Collision with an email already on another account is rejected. User id, storage objects, and wallet survive. Existing sessions remain valid until logout. Later phases must `logout all` if policy requires revocation. |
| logout current | `POST /v2/session/logout` with `{ token, refresh_token }` for **that** session. Sibling sessions stay valid. Godot already does this. |
| logout all | `POST /v2/session/logout` with `{ "token": "", "refresh_token": "" }` (empty `{}` is equivalent in Nakama). Nakama’s session cache is a **blacklist**: a token is invalid only when `exp - tokenExpirySec < lastInvalidation` (strict `<`). Tokens issued in the **same Unix second** as logout-all can remain valid. Later phases must wait until the next second after issuing the sessions being revoked (live proof used 1500 ms). Account can authenticate again afterward. |
| export account | `nk.accountExportId(userId)` returns JSON with `account` (user, wallet, email) and `objects` (project storage). Console `GET /v2/console/account/{id}/export` also includes empty `friends`, `groups`, `messages`, `leaderboard_records`, `notifications`, `wallet_ledgers`. Client `GET /v2/account` is **not** a full export. Product export must add account status, challenges, and leases the Nakama dump does not know, and must not copy raw email onto a deletion tombstone. |
| delete account | `nk.accountDeleteId(userId, true)` only for the product path. Console `DELETE /v2/console/account/{id}?record=true` is the operator twin. Client `DELETE /v2/account` also prevents login and frees the email but is **not** recorded deletion. After recorded delete: credentials fail, sessions fail, the email can register a **new** user id with empty roster/wallet/compat index. |
| lookup account by email hash | Store `{ hmac, userId }` (`permissionRead`/`Write` 0). Index `acct_compat_email_hmac` on field `hmac`. From JS call `nk.storageIndexList(name, query, limit)` with **three arguments only** (an empty-string caller id panics `uuid.FromString`). Query `+value.hmac:<hex>` (unquoted) works; quoted form and `*` plus hmac filter are fallbacks. Iterate `objects.length` (Goja objects are array-like, not always `Array.isArray`). Re-read the storage object. `decideEmailLookup` rejects missing, multiple, stale, and mismatch. Never put raw email in the index. Nakama JS HMAC is `hmac.ts` (no Node `crypto`). Compat pepper is test-only. |

## Live proof status

| Proof | Result |
| --- | --- |
| Email create | Pass. `create=true` returns tokens. Passwords containing spaces authenticate. |
| `create=false` never creates | Pass. Unknown email does not create an account. |
| Unique canonical email | Pass. A second `create=true` for the same address fails. |
| Incorrect password vs unknown email | Pass, and **distinct at the HTTP layer**: unknown email **404** `User account not found.`; wrong password **401** `Invalid credentials.` Do not expose that distinction in player copy. |
| Canonicalization vs Nakama lowercase / plus-tags | Pass. Mixed-case and uppercased login hit the same user. `user+tag@…` is a different user. Dots in the local part are **not** stripped. Project `canonicalizeEmail` (trim, max 254, lowercase) does not conflict. |
| Password replacement sequence | Pass. **`linkEmail` with the same email and a new password** updates credentials and preserves user id. Old password fails. Unlink is not part of this sequence. |
| Unlink-only auth method | Pass. `POST /v2/account/unlink/email` on the only identifier returns **403** `Cannot unlink last account identifier. Check profile exists and is not last link.` Email login still works. Email replacement **must** attach a temporary device (or other second identifier) first. |
| Email replacement + collision | Pass. Linking another account’s email fails. Temp device + unlink old + link new + unlink device preserves user id, `account_compat` storage, and wallet. Old email no longer authenticates. Old access tokens are **not** revoked by the email change itself. |
| Logout current vs all | Pass. Current-session logout kills that access and refresh pair and leaves sibling sessions alive. Logout-all with empty token strings after a 1500 ms delay kills remaining access **and** refresh tokens. A new authenticate succeeds. |
| Export (`accountExportId` + console) | Pass. Runtime export includes `account` and project `objects` (compat index, roster/character after create). Console export adds social/notification/ledger arrays (empty in this product). |
| Recorded delete + email reuse + new user id + empty roster/wallet | Pass. `nk.accountDeleteId(userId, true)` then `create=true` with the same email yields a **new** user id, no characters, gold 0, no inherited compat object. |
| HMAC lookup current/changed/missing/multiple/stale/deleted/reused | Pass. Current hmac verifies to the owner after re-read. Missing hmac is `missing`. Two owners writing the same hmac is `multiple`. Overwriting hmac is a changed-email proof. Deleted object is `stale` or `missing` (index lag). Recorded delete then email reuse is `missing` for the old hmac on the new account. |
| Client self-delete + console recorded delete | Pass. `DELETE /v2/account` and console `?record=true` both stop authentication and allow email reuse with a new user id. Product deletion still uses recorded runtime delete. |

## Runtime notes later phases must keep

- `acct_compat_probe` is development-gated. Production `developmentToolsEnabled` is false.
- Do not pass `""` as `storageIndexList` caller id.
- Do not unlink the only authentication method.
- Do not treat window-close as a successful logout-all or recorded delete.
- Friends/groups are unused; they are preserved only in the sense that the Nakama user id stays the same across password/email replacement.

## Blockers

None. Every required operation is available through supported Nakama HTTP or runtime APIs on 3.40.0.
