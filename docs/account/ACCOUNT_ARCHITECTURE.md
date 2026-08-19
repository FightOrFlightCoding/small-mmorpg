# Account architecture

ACCT-01 audit of the **existing** account and character path. Player-visible behavior is unchanged. Target distribution lifecycle is mapped here so later phases extend these modules instead of adding a second auth service or character model.

Related: [ACCOUNT_STATE_MACHINE.md](ACCOUNT_STATE_MACHINE.md), [CHARACTER_STATE_MACHINE.md](CHARACTER_STATE_MACHINE.md), [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md), [ACCOUNT_STORAGE_CATALOG.md](ACCOUNT_STORAGE_CATALOG.md), [ACCOUNT_THREAT_MODEL.md](ACCOUNT_THREAT_MODEL.md), [ACCOUNT_UI_FLOWS.md](ACCOUNT_UI_FLOWS.md), [EMAIL_DELIVERY_ARCHITECTURE.md](EMAIL_DELIVERY_ARCHITECTURE.md), [NAKAMA_COMPATIBILITY_RESULTS.md](NAKAMA_COMPATIBILITY_RESULTS.md), [../STORAGE_CATALOG.md](../STORAGE_CATALOG.md), [../SECURITY_MODEL.md](../SECURITY_MODEL.md).

Pinned versions: Nakama server **3.40.0**, `nakama-runtime` **1.47.0**, Nakama Godot SDK **3.4.0**, Godot **4.7.1**.

## Current implementation (as shipped)

Accounts are Nakama built-in email/password identities. Debug builds also use device authentication (`DevIdentity` Alice/Bob/machine). There is no project-owned account row, no email verification gate, and no HMAC email index in production player storage.

A player session is a Nakama JWT plus refresh token. The Godot client keeps those tokens in memory and may write them to `user://session_cache.json` (never a password). Gameplay requires a character selection ticket (TTL 300 s) and then a `starter_zone` match join.

## Godot authentication services

| Module | Path | Role |
| --- | --- | --- |
| `GameService` | `client/scripts/game/game_service.gd` | Register, email login, debug device login, logout, character orchestration |
| `NetworkService` | `client/scripts/network/network_service.gd` | Session, socket, RPCs, reconnect, logout |
| `NakamaNetworkBackend` | `client/scripts/network/nakama_network_backend.gd` | Thin SDK: `authenticate_email_async`, `authenticate_device_async`, `session_refresh_async`, `session_logout_async` |
| `SessionCache` | `client/scripts/network/session_cache.gd` | `user://session_cache.json` tokens only; rejects caches that contain password keys |
| `AuthPrivacy` | `client/scripts/network/auth_privacy.gd` | Maps login failures to `invalid_credentials` / registration `email_taken` |
| `DevIdentity` | `client/scripts/network/dev_identity.gd` | Debug Alice/Bob/machine device ids; gated by `OS.is_debug_build()` |
| `LocalSettingsStore` | `client/scripts/ui/local_settings_store.gd` | UI preferences; refuses credential/token keys |

There is no second client HTTP stack. E2E drivers call `NakamaNetworkBackend` directly so they can open two identities.

## Nakama client creation

`Nakama.create_client("defaultkey", "127.0.0.1", 7350, "http", 10, ERROR)`. `auto_refresh = true`. The server key is compiled into the debug client; it is not stored in `user://`. Production packaging must not treat that key as a player secret (see threat model).

## Session caching and logout

- Restore: load cache → `session_refresh_async`. Email sessions cannot reauthenticate without a stored password; a dead refresh token is `session_expired`.
- Device sessions may reauthenticate with the cached device id (debug only).
- Logout: leave match if needed, `session_logout_async` with **current** access and refresh tokens, clear cache, return to Login.
- The SDK comment allows logout-all when the body is empty. The Godot wrapper always sends the current token pair, so the shipped client does **not** logout-all. Live proof: empty token strings after waiting until the next Unix second.
- There is no distinct “Return to Character Select”, “Logout All Sessions”, or server-acknowledged “Quit Game” operation. Window close is not a proven safe departure.

## Character bootstrap, storage, and selection

| RPC | Module | Notes |
| --- | --- | --- |
| `character_bootstrap` | `character_lifecycle.ts` | Prompt 18 compatibility wrapper: migrate legacy `player/character` into roster slot 1 or create one character |
| `character_list` | same | Live + soft-deleted rows; `slotLimit` **3** |
| `character_create` | same | Name policy + class catalog + reservation |
| `character_select` | same | Issues a selection ticket; one per account |
| `character_soft_delete` / `character_restore` | same | `deletedAt` timestamp; restore if live count < 3 |

Canonical records: `player/character_<id>`, `player/roster`, `player/selection`, plus inventory/equipment/quests/progression/wallet scoped per character. All `permissionWrite: 0`. Names: `names/n_<canonical>` on the system user.

Join metadata may carry `selectionTicket` or `transferTicket`, never `characterId`.

## Active presence and reconnect

- Same account already in **this** match: `already_in_match`.
- Presence in another running match: `already_elsewhere` unless a transfer is in flight.
- Public-world pose grace: **5 seconds** (`RECONNECT_GRACE_SEC`). Cave empty grace: **60 seconds**. Party disconnect grace: **60 seconds**.
- There is no global active-character lease and no `LINK_DEAD` / `ENTERING` / `LEAVING` / `DESPAWNING` persistence.
- Client reconnect: refresh/reauth, backoff, `find_or_create_starter_zone` (live cave only if `canJoinOwnedCave`), wait for `FULL_STATE`. Cancel logs out.

## Account deletion

No product account-deletion UI or project tombstone. Compatibility proofs call `nk.accountDeleteId(userId, true)` through `acct_compat_probe` and also exercise console `DELETE` and client `DELETE /v2/account`.

## Authentication-related RPCs and hooks

See [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md). Hooks: `registerBeforeAuthenticateEmail`, `registerBeforeAuthenticateDevice` (rate limit, `registration_disabled`, `device_auth_disabled`). No after-auth hook.

Development-gated `acct_compat_probe` is an ACCT-01 test seam, not a player API.

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
| Logout vs leave vs reconnect cancel | One client method does leave + current-session logout + Login. Later phases must split the five departure operations |
| Party `connectionState` vs match grace vs online bool | Do not overload; later phases add explicit presence states |
| Content classes `test.class.vanguard` / `arcanist` / `warden` vs target `class.warrior` / `marksman` / `mage` | Data-defined; do not retarget in ACCT-01 |
| Slot limit 3 vs target 5 | `CHARACTER_SLOT_LIMIT` stays 3 until a later phase |
| Client email `strip_edges` only vs project canonical lowercase | Nakama lowercases on authenticate; later phases must use `canonicalizeEmail` everywhere |

## Mapping existing code to the target lifecycle

Later phases must migrate these modules, not replace them:

- Account identity: Nakama email auth + `auth_hooks.ts` + `email.ts`.
- Character: `character_lifecycle.ts`, `character_roster.ts`, `character_name.ts`, `character_ticket.ts`.
- Persistence: existing `player/*` collections and wallet.
- Sessions: `SessionCache` + Nakama session logout/refresh.
- Lookup: `hmac.ts` + storage index pattern proven on `account_compat` (production profile HMAC comes later).
