# Account threat model

ACCT-01 documents risks. It does not add verification mail, password policy UI, or HMAC production wiring.

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

## Gaps the later lifecycle must close

| Risk | Gap today |
| --- | --- |
| Unverified play | No `PENDING_VERIFICATION` gate on character/match/RPCs |
| Weak passwords | No 15–128 policy, no common-password list; Nakama minimum still applies |
| Email enumeration via reset | No player reset; console recovery. Future reset must not reveal existence |
| Refresh token on disk | `user://session_cache.json` is not an OS credential store |
| Compiled server key | Godot debug client contains `defaultkey` |
| Logout-all | Not in the UI; HTTP `POST /v2/session/logout` with empty token strings is proven. Callers must wait until the next Unix second after issuing tokens |
| 10 s link-dead | 5 s / 60 s grace; snapshots omit disconnected players immediately |
| Active-character lease | Match-local only |
| Account delete | No product UI, no `DELETING` resume state, no typed `DELETE ACCOUNT` |
| HMAC pepper | Compat tests use a local non-production string; production must use env |
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
