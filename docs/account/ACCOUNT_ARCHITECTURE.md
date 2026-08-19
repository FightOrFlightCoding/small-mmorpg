# Account architecture

ACCT-01 catalogued the existing account and character path. ACCT-03 implements public register, verify, login, refresh, and logout on that path. ACCT-04 adds password recovery, logged-in password change, email change, and forgotten-email support without a second identity or character model. ACCT-05 is the five-slot character catalog, production classes, selection tickets, and soft-delete/restore/purge.

Related: [ACCOUNT_STATE_MACHINE.md](ACCOUNT_STATE_MACHINE.md), [CHARACTER_STATE_MACHINE.md](CHARACTER_STATE_MACHINE.md), [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md), [ACCOUNT_STORAGE_CATALOG.md](ACCOUNT_STORAGE_CATALOG.md), [ACCOUNT_THREAT_MODEL.md](ACCOUNT_THREAT_MODEL.md), [ACCOUNT_UI_FLOWS.md](ACCOUNT_UI_FLOWS.md), [EMAIL_DELIVERY_ARCHITECTURE.md](EMAIL_DELIVERY_ARCHITECTURE.md), [NAKAMA_COMPATIBILITY_RESULTS.md](NAKAMA_COMPATIBILITY_RESULTS.md), [../STORAGE_CATALOG.md](../STORAGE_CATALOG.md), [../SECURITY_MODEL.md](../SECURITY_MODEL.md).

Pinned versions: Nakama server **3.40.0**, `nakama-runtime` **1.47.0**, Nakama Godot SDK **3.4.0**, Godot **4.7.1**.

## Current implementation (as shipped)

Accounts are Nakama built-in email/password identities plus a project `account_profile`. Public email register/login/verify/refresh/logout/reset/password-change/email-change go through `auth-gateway/`. Debug builds also use device authentication (`DevIdentity` Alice/Bob/machine) which remains playable without an email profile. Email accounts must be `ACTIVE` and verified before character or match operations. Credential changes preserve the Nakama user id and all `player/*` character records.

A player session is a Nakama JWT plus refresh token returned by the gateway. The Godot `AccountService` keeps those tokens in memory. Device-debug sessions may still use `user://session_cache.json` (never a password). Email Stay Signed In is not enabled. Gameplay requires a character selection ticket (TTL 300 s) and then a `starter_zone` match join. An account may have **five** live characters. Production class IDs are `class.warrior`, `class.marksman`, and `class.mage`.

## Godot authentication services

| Module | Path | Role |
| --- | --- | --- |
| `GameService` | `client/scripts/game/game_service.gd` | Orchestrates register/login/verify/reset/password-change/email-change/logout onto AccountService and device auth onto NetworkService |
| `AccountService` | `client/scripts/account/account_service.gd` | Public gateway HTTP, account status, access/refresh tokens, bounded refresh, logout/logout-all. Does not own character gameplay |
| `NetworkService` | `client/scripts/network/network_service.gd` | Nakama session import, socket, RPCs, reconnect, current-session logout |
| `NakamaNetworkBackend` | `client/scripts/network/nakama_network_backend.gd` | Thin SDK: device auth, `import_session` from gateway tokens, socket, RPCs. Email product login does not call `authenticate_email_async` |
| `SessionCache` | `client/scripts/network/session_cache.gd` | Device-debug token cache only. Email refresh tokens are not written to `user://` |
| `RememberEmailStore` | `client/scripts/account/remember_email_store.gd` | Optional remembered email only |
| `CredentialStore` | `client/scripts/account/credential_store.gd` | Stay Signed In interface; unavailable until OS stores are certified. Hidden in UI |
| `AuthPrivacy` / `AccountErrors` | `client/scripts/network/auth_privacy.gd`, `client/scripts/account/account_errors.gd` | Login sanitization and gateway/gameplay account error copy |
| `DevIdentity` | `client/scripts/network/dev_identity.gd` | Debug Alice/Bob/machine device ids; gated by `OS.is_debug_build()` |
| `LocalSettingsStore` | `client/scripts/ui/local_settings_store.gd` | UI preferences; refuses credential/token keys |

There is no second character model. E2E drivers still call `NakamaNetworkBackend` device auth so they can open two identities. Product email login uses the gateway, then `import_session`.

## Nakama client creation

`Nakama.create_client("defaultkey", "127.0.0.1", 7350, "http", 10, ERROR)`. `auto_refresh = true`. The server key is compiled into the debug client; it is not stored in `user://`. Production packaging must not treat that key as a player secret (see threat model).

## Session caching and logout

- Restore: device-debug cache → `session_refresh_async`. Email sessions refresh through `POST /v1/auth/refresh` with bounded retry and jitter; a dead refresh token returns to Login (no infinite loop, no device reauth).
- Device sessions may reauthenticate with the cached device id (debug only).
- Logout current: leave match if needed, gateway `POST /v1/auth/logout` when an email session exists, Nakama `session_logout_async` for the current pair, clear in-memory tokens, return to Login.
- Logout all: character-select password confirmation (or recent JWT `iat`) → gateway `POST /v1/auth/logout-all` → Nakama empty-token logout-all → security email. Account and character data are preserved.
- Stay Signed In is hidden. `CredentialStore` is present but reports unavailable.

## Character bootstrap, storage, and selection

| RPC | Module | Notes |
| --- | --- | --- |
| `character_bootstrap` | `character_lifecycle.ts` | Prompt 18 compatibility wrapper: migrate legacy `player/character` into roster slot 1 or create one character |
| `character_list` | same | Safe catalog summaries only; `slotLimit` **5**; opportunistic purge |
| `character_create` | same | `displayName` / `classId` / `idempotencyKey`; server-generated id; one-time starter init |
| `character_select` | same | Single-use selection ticket; blocked by lease, deletion, maintenance, incompatibility |
| `character_delete_request` / `character_soft_delete` | same | Typed exact name; `SOFT_DELETED`; name stays reserved |
| `character_restore` | same | Free slot + live reservation; no second starter grant |
| `character_name_available` | same | Advisory only; does not reserve |
| `character_purge` | same | Idempotent step machine; releases the name |

Canonical records: `player/character_<id>`, `player/roster`, `player/selection`, plus inventory/equipment/quests/progression/wallet scoped per character. All `permissionWrite: 0`. Names: `names/n_<canonical>` on the system user.

Join metadata may carry `selectionTicket` or `transferTicket`, never `characterId`.

## Active presence and reconnect

- Same account already in **this** match: `already_in_match`.
- Presence in another running match: `already_elsewhere` unless a transfer is in flight.
- Public-world pose grace: **5 seconds** (`RECONNECT_GRACE_SEC`). Cave empty grace: **60 seconds**. Party disconnect grace: **60 seconds**.
- Account gameplay lease: `player` / `gameplay_lease` on join (`ONLINE`), `DISCONNECTING` on leave for the public **5s** / cave **60s** grace. Character Select treats that as link-dead for the leased character and account-busy for every other character on the account.
- Client reconnect: refresh/reauth, backoff, `find_or_create_starter_zone` (live cave only if `canJoinOwnedCave`), wait for `FULL_STATE`. Cancel logs out.

## Account deletion

No product account-deletion UI or project tombstone. Compatibility proofs call `nk.accountDeleteId(userId, true)` through `acct_compat_probe` and also exercise console `DELETE` and client `DELETE /v2/account`.

## Authentication-related RPCs and hooks

See [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md). Hooks: `registerBeforeAuthenticateEmail`, `registerBeforeAuthenticateDevice` (rate limit, `registration_disabled`, `device_auth_disabled`). No after-auth hook.

Development-gated `acct_compat_probe` is an ACCT-01 test seam, not a player API. Internal `auth_gateway` is HTTP-key plus HMAC assertion only.

## Auth gateway (ACCT-02 / ACCT-03 / ACCT-04)

`auth-gateway/` is the trusted public boundary for registration, verification, login, refresh, logout, recovery, email-change, and account deletion. It holds the Nakama server key, runtime HTTP key, email provider key, email HMAC pepper, challenge HMAC secret, and the support-lookup secret. The Godot `AccountService` talks to versioned `/v1` routes; it never receives those secrets.

Challenges live in Nakama storage (`auth_challenge` / `c_<id>` on the system user). Only HMAC hashes of codes are stored. New challenges invalidate older unused challenges for the same email-hash and purpose. Verification TTL is `AUTH_VERIFICATION_TTL_MS` (default 30 minutes). Password-reset and email-change challenges default to 15 minutes, five failed attempts, one-time consume, and idempotent replay of a successful consume.

Password replace is same-email `nk.linkEmail`. Email replace is the proven temp-device sequence (link device, unlink old email, link new email, unlink device, then update `account_profile` HMAC). The old email stays the login identifier until confirm succeeds. A failed replace after consume does not write a new HMAC, so the old address remains usable and the new address is not permanently reserved. Stale index hits are rejected by re-read (`lookup_email` / `decideEmailLookup`).

There is no public email-reveal endpoint. Internal `POST /v1/support/lookup` is gated by `AUTH_SUPPORT_LOOKUP_SECRET` and `auth_gateway` op `support_snapshot`. Every lookup is logged. Responses never include an email.

Email lookup uses `account_profile` / `email_index` (`hmac`, `userId`, `verifiedAt`, `status`, legal-version fields, `createdAt`, `acceptedAt`; `permissionWrite: 0`) and index `account_profile_email_hmac`. Do not reuse `account_compat`. Unverified cleanup is the HMAC-gated `purge_unverified` op (default seven-day retention), invoked opportunistically on duplicate register.

Public registration policy is `AUTH_REGISTRATION_MODE` (`OPEN` / `INVITE_ONLY` / `CLOSED`) on the gateway. `INVITE_ONLY` is an env allowlist of canonical emails (no invitation-code system). When the gateway is `OPEN`, Nakama email create must also be allowed or register fails at authenticate.

`requirePlayableUser` / `evaluatePlayableAccount` is the single gameplay guard: `ACTIVE`, `verifiedAt > 0`, not disabled, not deleting. Device accounts with no email and no profile remain playable.

## Client-writable account fields

The Godot client does **not** call `update_account`, `write_storage`, or wallet APIs. Nakama still allows HTTP clients to `PUT /v2/account` (username, display name, avatar, location, timezone, lang). There is no `beforeStorageWrite` hook. Canonical game collections use `permissionWrite: 0`.

## Development authentication shortcuts (kept)

- Login buttons Alice / Bob / this machine (`OS.is_debug_build()`).
- `--dev-user=alice|bob`.
- Device auth `create=true`.
- `--e2e-slice`, `--cert-five`, `--cert-five-resume`.
- Local console `admin` / `password` on `7351`.
- `acct_compat_probe` when `developmentToolsEnabled`.

Do not delete these in this phase.

## Duplicated or contradictory implementations

| Topic | Resolution |
| --- | --- |
| [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md) previously said authenticate hooks were not registered | Corrected; hooks are registered |
| Server `auth_privacy.ts` vs client `auth_privacy.gd` | Same sanitization policy, two languages |
| `character_bootstrap` vs `character_create` | Bootstrap is the Prompt 18 wrapper; create is the roster path. Keep both |
| Logout vs leave vs reconnect cancel | Earlier notes disagreed (revoke first vs leave first). Resolved: leave chats/match (`NetworkService.depart_gameplay`) while tokens are still valid, then `AccountService.logout_current` (gateway revoke), then Nakama session logout → Login. Logout-all is a character-select action (password or recent JWT `iat`) that revokes every session only after the password/iat check succeeds; a failed check keeps the local session. Reconnect cancel uses leave + current-session logout. Return to Character Select and Quit Game remain later |
| Party `connectionState` vs match grace vs online bool | Do not overload; later phases add explicit presence states |
| Content classes `test.class.vanguard` / `arcanist` / `warden` vs product `class.warrior` / `marksman` / `mage` | Product Character Select uses `class.*`. Cert/e2e keep `test.class.*`. Empty `classId` migrates to `class.warrior`. |
| Slot limit | `CHARACTER_SLOT_LIMIT` is **5**. |
| Email canonicalization | Gateway `canonicalizeEmail` (trim, lowercase, max 254) is authoritative. Godot trims before POST. Nakama also lowercases on authenticate. Plus-tags and dots stay distinct |

## Mapping existing code to the target lifecycle

Later phases must extend these modules, not replace them:

- Account identity: `auth-gateway` + Nakama email auth + `auth_hooks.ts` + `account_profile`.
- Character: `character_lifecycle.ts`, `character_roster.ts`, `character_name.ts`, `character_ticket.ts`, `character_catalog.ts`, `character_purge.ts`, `gameplay_lease.ts`.
- Persistence: existing `player/*` collections and wallet.
- Sessions: email access/refresh tokens live in `AccountService` memory. Device-debug sessions may use `SessionCache`. Logout current leaves the match before revoking tokens.
- Lookup: production lookup is `account_profile` / `email_index` via `auth_gateway`. `acct_compat` remains a development-gated proof seam.
