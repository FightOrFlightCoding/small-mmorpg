# Account threat model

ACCT-02 adds the public auth gateway, hashed challenges, and HMAC email lookup on `account_profile`. Verification is **not** yet a gameplay gate. Godot login UI is unchanged.

## Assets

- Nakama credentials (email/password hashes)
- Session access and refresh tokens
- Character names and roster
- Inventory, equipment, gold, quests, progression
- Party, trade, cave ownership, location
- Future verification/reset/deletion codes
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
- Auth rate limit 5 / 10 s
- Production registration closed via env
- Device auth disabled in staging/production presets
- Selection tickets TTL 300 s, consumed on join; never join by `characterId`
- `already_in_match` / `already_elsewhere`
- Session cache refuses password keys; settings store refuses credential keys
- Structured logs without tokens/passwords
- GM allowlist default disabled
- Compatibility HMAC lookup rejects missing, multiple, stale, and mismatched hits

## Controls added in ACCT-02

- Auth gateway holds Nakama and mail secrets; they are not shipped to Godot
- Staging/production gateway requires HTTPS public URLs and non-default secrets
- Internal RPC `auth_gateway` rejects session JWT (`gateway_rpc_forbidden`) and requires a signed assertion
- Challenges store HMAC only; single-use, expiry, attempt limit, sibling invalidation, idempotent consume
- Password-reset and resend HTTP responses do not reveal account existence
- Email provider failure after register does not delete the Nakama user
- Hosted confirm pages: no third-party scripts, `referrer-policy: no-referrer`, generic errors
- Per-IP and per-email-hash rate-limit foundations
- Gateway password policy 15–128 with a small common-password list (gameplay login still uses Nakama minimum until Godot is wired)

## Gaps the later lifecycle must close

| Risk | Gap today |
| --- | --- |
| Unverified play | No `PENDING_VERIFICATION` gate on character/match/RPCs (mail exists; join is not gated) |
| Weak passwords | Gateway enforces 15–128; Godot login is not on the gateway yet |
| Email enumeration via reset | Gateway reset/resend always return the same success envelope |
| Refresh token on disk | `user://session_cache.json` is not an OS credential store |
| Compiled server key | Godot debug client still contains `defaultkey` for gameplay; the gateway also holds it and must not echo it |
| Logout-all | Not in the UI; HTTP `POST /v2/session/logout` with empty token strings is proven. Callers must wait until the next Unix second after issuing tokens |
| 10 s link-dead | 5 s / 60 s grace; snapshots omit disconnected players immediately |
| Active-character lease | Match-local only |
| Account delete | Gateway deletion confirm exists; Godot UI and `DELETING` resume state remain later |
| HMAC pepper | Local Compose uses `local-*-not-production`; staging/production must replace via gitignored env |
| Client `PUT /v2/account` | Unhooked |
| Storage writes from a raw HTTP client | No `beforeStorageWrite`; rely on `permissionWrite: 0` |
| Password in URLs / logs | Client does not put passwords in URLs today; keep that invariant |
| Export over-share | `accountExportId` includes Nakama collections; product export must filter and add project fields |

## Abuse cases mapped to later APIs

- Register: canonicalize email, uniqueness, password policy, verification challenge.
- Login: canonicalize, `create=false`, sanitized errors, rate limit.
- Reset / forgotten email: HMAC lookup + re-read; same response whether missing or present.
- Change password / email: only the proven Nakama link/unlink sequence; logout-all if policy requires.
- Delete: authenticated `ACTIVE`, no lease, password + email one-time + typed confirmation + idempotency; `accountDeleteId(id, true)`.
- Lookup: never store raw email in a publicly readable index.
