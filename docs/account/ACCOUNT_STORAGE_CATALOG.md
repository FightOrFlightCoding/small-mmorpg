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
| `player` | `roster` | account | 0 | Character id list (max 5 live) |
| `player` | `character` / `character_<id>` | account | 0 | Identity, class, pose, `status`, `deletedAt`, `softDeleteExpiresAt` |
| `player` | `selection` | account | 0 | One selection ticket, TTL 300 s |
| `player` | `gameplay_lease` | account | 0 | Active-character lease (`ENTERING`/`ONLINE`/`LEAVING`/`LINK_DEAD`/`DESPAWNING`) |
| `player` | `idem_<op>_<key>` | account | 0 | Create/delete idempotency replay |
| `player` | `purge_<compactId>` | account | 0 | Partial purge job until complete |
| `player` | `inventory` / `equipment` / `quests` / `progression` / `wallet_ref` | character | 0 | Canonical gameplay |
| `player` | `party` / `cave` / `location` / `trade` / `trade_audit` | character/account | 0 | Social / instance / trade |
| `names` | `n_<canonical>` | system user | 0 | Case-insensitive name reservation |
| `character_audit` | `p_<compactId>` | system user | 0 | Minimal purge audit (`characterId`, `purgedAt`) |
| `party` / `cave` / `cave_index` / `transfer` / `trade` | see storage catalog | server | 0 | Shared objects |
| `match` | `starter_zone` | system | 0 | Public match locator |
| `gm` / `gm_audit` / `ops` | allowlist, audits, maintenance | system | 0 | Operators |

Soft-deleted characters keep their gameplay objects until retention elapses or `character_purge` runs. Purge is idempotent and recovers from a partial job. Gold stays the account wallet and is not wiped by character purge.

## ACCT-01 compatibility only

| Collection | Key | Index | Value | Write |
| --- | --- | --- | --- | --- |
| `account_compat` | `email_index` | `acct_compat_email_hmac` on field `hmac` | `{ hmac, userId }` | 0 |

Never put raw email in this object. Lookup: `storageIndexList(name, "+value.hmac:<hex>", limit)` (three arguments; quoted query and `*` are fallbacks), then `storageRead` and compare hmac + userId. Missing, multiple, stale, or mismatched hits are rejected (`account_compat.ts` `decideEmailLookup`).

Later phases should keep the same verify-after-index rule on `account_profile`. Prefer env pepper `VIBECODE_EMAIL_HMAC_PEPPER` in production; do not ship a production pepper in git.

## ACCT-02 production records

| Collection | Key | Index | Value | Write |
| --- | --- | --- | --- | --- |
| `account_profile` | `email_index` | `account_profile_email_hmac` on field `hmac` | `{ hmac, userId, verifiedAt, status, createdAt, acceptedTermsVersion, acceptedPrivacyVersion, acceptedAt }` | 0 |
| `auth_challenge` | `c_<challenge_id>` | `auth_challenge_lookup` on `email_lookup_hash`, `purpose` | Challenge metadata + `secret_hash` only | 0 |

Challenge objects are owned by the system user. Raw codes never appear in storage or logs. Hosted confirm pages and the Godot verification scene consume the same hashed secret.

Unverified cleanup may delete the Nakama account and the `email_index` object so the HMAC is reusable.

Password reset and logged-in password change do not write a password-history collection. Email change overwrites the same `account_profile` / `email_index` HMAC after a successful `replace_email`. Stale index hits fail the re-read compare. A failed replace does not write the new HMAC, so the old address stays the lookup key.

Support lookup does not persist a project record. The gateway logs `support_lookup` with `request_id`, `query_kind`, `query_hash`, `hit`, and `user_id` only.

## Client local files

| Path | Allowed | Forbidden |
| --- | --- | --- |
| `user://session_cache.json` | Device-debug access/refresh tokens, user id, username, auth mode, device id | password, codes, server keys, **email product refresh tokens** |
| `user://remember_email.json` | Remembered email string only | password, tokens, codes |
| `user://client_settings.json` | keybinds, volume, scale, window | email/password/tokens/tickets |

`CredentialStore` is the Stay Signed In interface. It reports unavailable; Stay Signed In is hidden. Plaintext refresh tokens in `user://` for email product sessions are prohibited.

## Client-writable Nakama fields

Godot does not write them. HTTP `PUT /v2/account` can still change username, display name, avatar, location, timezone, language. Treat as a threat until hooks exist.

## Indexing

`registerStorageIndex("acct_compat_email_hmac", "account_compat", "email_index", ["hmac"], ["hmac"], 10000, false)` in `InitModule` (ACCT-01 seam). Production: `account_profile_email_hmac` on `account_profile` / `email_index`, and `auth_challenge_lookup` on `auth_challenge` with an empty key (all challenge keys). `indexOnly=false` so list results can include storage objects; tests still refuse to trust the index alone.
