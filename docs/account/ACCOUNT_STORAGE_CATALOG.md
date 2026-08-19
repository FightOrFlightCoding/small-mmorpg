# Account storage catalog

Project-owned and Nakama-owned records that touch accounts, sessions, and characters. Canonical game collections remain as in [../STORAGE_CATALOG.md](../STORAGE_CATALOG.md). All listed project writes use `permissionWrite: 0`.

## Nakama-owned (not custom SQL)

| Record | Contents | Notes |
| --- | --- | --- |
| Users / accounts | user id, username, email/password hash, devices, verify/disable times | Built-in. Do not UPDATE hashes via SQL. |
| Sessions | access + refresh JWTs | Logout current vs all |
| Wallet | `{ gold: number }` | Account-scoped currency |
| Friends / groups / notifications | unused by the product | Export may still include empty sets |
| Deletion tombstone | when `accountDeleteId(..., true)` | Enables audit + email reuse; do not store raw email in a project tombstone |

## Project player saves (per character unless noted)

| Collection | Key | Owner | Write | Purpose |
| --- | --- | --- | --- | --- |
| `player` | `roster` | account | 0 | Character id list (max 3 live) |
| `player` | `character` / `character_<id>` | account | 0 | Identity, class, pose checkpoint, `deletedAt` |
| `player` | `selection` | account | 0 | One selection ticket, TTL 300 s |
| `player` | `inventory` / `equipment` / `quests` / `progression` / `wallet_ref` | character | 0 | Canonical gameplay |
| `player` | `party` / `cave` / `location` / `trade` / `trade_audit` | character/account | 0 | Social / instance / trade |
| `names` | `n_<canonical>` | system user | 0 | Case-insensitive name reservation |
| `party` / `cave` / `cave_index` / `transfer` / `trade` | see storage catalog | server | 0 | Shared objects |
| `match` | `starter_zone` | system | 0 | Public match locator |
| `gm` / `gm_audit` / `ops` | allowlist, audits, maintenance | system | 0 | Operators |

Soft-deleted characters keep their gameplay objects. There is no `PURGED` anonymization pass.

## ACCT-01 compatibility only

| Collection | Key | Index | Value | Write |
| --- | --- | --- | --- | --- |
| `account_compat` | `email_index` | `acct_compat_email_hmac` on field `hmac` | `{ hmac, userId }` | 0 |

Never put raw email in this object. Lookup: `storageIndexList(name, "+value.hmac:<hex>", limit)` (three arguments; quoted query and `*` are fallbacks), then `storageRead` and compare hmac + userId. Missing, multiple, stale, or mismatched hits are rejected (`account_compat.ts` `decideEmailLookup`).

Later phases should store the HMAC on a server-only account profile and keep the same verify-after-index rule. Prefer env pepper `VIBECODE_EMAIL_HMAC_PEPPER` in production; do not ship a production pepper in git.

## Client local files

| Path | Allowed | Forbidden |
| --- | --- | --- |
| `user://session_cache.json` | access token, refresh token, user id, username, auth mode, device id | password, codes, server keys |
| `user://client_settings.json` | keybinds, volume, scale, window | email/password/tokens/tickets |

Secure OS credential storage for refresh tokens is **not** implemented. Refresh tokens currently persist in `user://` on every platform. Later phases must hide “Stay Signed In” when a platform store is unverified.

## Client-writable Nakama fields

Godot does not write them. HTTP `PUT /v2/account` can still change username, display name, avatar, location, timezone, language. Treat as a threat until hooks exist.

## Indexing

`registerStorageIndex("acct_compat_email_hmac", "account_compat", "email_index", ["hmac"], ["hmac"], 10000, false)` in `InitModule`. `indexOnly=false` so list results can include storage objects; tests still refuse to trust the index alone.
