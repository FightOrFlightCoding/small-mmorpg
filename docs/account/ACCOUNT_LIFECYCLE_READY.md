# Account lifecycle ready

ACCT-09 certification that the email-account and character lifecycle is secure, recoverable, and ready for a small external player group. No new player-facing account features were added.

Related: [ACCOUNT_SECURITY_TEST_REPORT.md](ACCOUNT_SECURITY_TEST_REPORT.md), [PLAYER_ACCOUNT_GUIDE.md](PLAYER_ACCOUNT_GUIDE.md), [SUPPORT_RECOVERY_RUNBOOK.md](SUPPORT_RECOVERY_RUNBOOK.md), [EMAIL_DELIVERY_RUNBOOK.md](EMAIL_DELIVERY_RUNBOOK.md), [ACCOUNT_DELETION_RUNBOOK.md](ACCOUNT_DELETION_RUNBOOK.md), [SESSION_AND_LEASE_RUNBOOK.md](SESSION_AND_LEASE_RUNBOOK.md), [ACCOUNT_THREAT_MODEL.md](ACCOUNT_THREAT_MODEL.md), [../PROGRESS.md](../PROGRESS.md).

Suggested release tag (do not create until the working tree is clean and the user approves): **`account-character-lifecycle-v1`**.

## Versions

| Item | Value |
| --- | --- |
| Auth gateway | `vibecode-auth-gateway` **0.1.0** (Fastify **5.6.1**, Node **20.20.2**) |
| Nakama | **3.40.0** (`nakama-runtime` **1.47.0**, Godot SDK **3.4.0**) |
| Protocol | **1** |
| Content package | `vibecode.foundation` **1.0.0**, gameplay `schemaVersion` **1**, hash `42047a6420550c4c815d4affafdefbaaecd446590706ae3e8c95c7e46f773455` |
| Client version | **1.0.0** (`AccountService.CLIENT_VERSION` / `MatchProtocol.CLIENT_VERSION`) |
| Save schema | `SAVE_SCHEMA_VERSION` **1** |
| Gameplay lease | `schemaVersion` **2** |
| Account deletion job | `schemaVersion` **1** |
| Auth challenge | `schemaVersion` **1** |
| API | Gateway `/v1/*`; Nakama HTTP `/v2/*`; **29** RPCs frozen |

Email provider: tests use in-memory; local Compose uses Mailpit `v1.30.7`; staging/production require SendGrid HTTPS (`EMAIL_PROVIDER=sendgrid`).

## Accepted lifecycle features

- Email register, verify, login, refresh, logout current, logout-all
- Password reset (no auto-login) and logged-in password change
- Email change (old address until confirm)
- Forgotten-email help without reveal; secret-gated support lookup
- Five character slots; Warrior, Marksman, Mage
- Selection tickets (300 s, consumed on join)
- Soft-delete / restore / purge
- One account gameplay lease; 10 s link-dead after **detection**
- Account export (5-minute in-memory download)
- Account deletion saga with email reuse on a new user id
- Named rate limits without permanent public lockout
- Safe account audits

## Explicit exclusions

Must not be present: public-world sharding, extra overworlds, guilds, auction houses, crafting, PvP, monetization, procedural generation as a world system, custom SQL tables, client-authoritative rewards, Stay Signed In.

Stay Signed In remains later. A compiled Nakama `defaultkey` remains in the Godot SDK vendor tree for debug/device auth.

## Policies

| Policy | Value |
| --- | --- |
| Password | 15–128 characters; small common-password list; confirmation required |
| Verification | HMAC challenge; default TTL 30 minutes for email verify; five attempts then lock; sibling invalidation; generic resend |
| Reset | Same success copy for missing and existing addresses; 15-minute TTL; five attempts; uniform timing pad; revoke all sessions; no tokens |
| Character slots | Five live; sixth create rejected; soft-delete frees a live slot |
| Character deletion | Exact name; `SOFT_DELETED`; 7-day retention; restore without second starters; idempotent purge releases the name |
| Account deletion | Password + email code (15 min) + exact `DELETE ACCOUNT` + click-only confirm; 7-phase saga; HTML `/v1/confirm` does not delete |
| Link-dead | 10 server seconds after disconnect **detection**; avatar stays, cannot move or act, PvE can hit; Play blocked; no socket rebind |

## Automated test totals

Recorded from the ACCT-09 gate run (2026-08-25).

| Gate | Result |
| --- | --- |
| Auth gateway | **49/49**, `tsc --noEmit` via `npm test` |
| Server domain | **532/532** passed, **13** skipped live (`ACCT_*_LIVE`), `tsc` clean |
| Client GdUnit | **273/273**, 0 orphans, `SHELL_LOGIN` |
| Threat catalog | **85/85** controls with test files |
| Failure catalog | **15/15** recoverable mappings |
| Five-account hermetic | `lifecycle_cert.test.ts` (five emails, duplicate rejected, logout-all, reset, email change, delete+reuse) |
| Character catalog | `character_lifecycle.test.ts` (five slots, three production classes, sixth rejected, name uniqueness, tickets, delete/restore/purge) |
| Link-dead / lease | `gameplay_lease.test.ts`, `persistence.test.ts` |
| Backup deletion replay | `account_deletion.test.ts` (`shouldReplayDeletion` by user id, not email) |
| Release presentation | `account_release_audit_test.gd` (no Alice/Bob, no Mailpit, no local gateway URL) |

## Five-account certification result

**Pass (hermetic).** Five independent gateway accounts register with unique emails, receive verification mail in the memory provider, verify, and log in. Duplicate email is `AUTH_REGISTRATION_FAILED` (409). Character proofs are the existing five-slot / three-class / sixth-rejected / name-uniqueness suite. World entry, Character Select return, and logout/login again are covered by `auth_flow_test.gd`, `zone_join_test.gd`, and `gameplay_lease.test.ts`.

Live five-email Mailpit world play with a second observer watching a 10 s avatar after Alt+F4 was **not** re-executed as a graphical session in this phase. Equivalent state is proven by `gameplay_lease.test.ts` (no movement, PvE can damage, Play disabled, countdown, entry after release, no duplicate snapshot avatars) and `persistence.test.ts` (no session rebind).

## Email-reuse result

**Pass.** After recorded deletion, the same email registers a **new** Nakama user id. Isolation of items, gold, quests, names, and leases is `account_deletion.test.ts` plus gateway reuse in `gateway.test.ts` / `lifecycle_cert.test.ts`.

## Backup-replay result

**Pass (domain).** Restore-then-apply uses the **original user id**. A replacement account that reused the email is not deleted (`shouldReplayDeletion`). Live dump/restore of Postgres remains `scripts/test-backup.ps1` (Prompt 33).

## Release-export result

Release packaging command: `powershell -File scripts/export-client-release.ps1`. Requires Godot **4.7.1** export templates (`scripts/install-export-templates.ps1`). Runtime gateway URL is `--gateway-url=https://…` or `VIBECODE_AUTH_GATEWAY_URL`. Debug Alice/Bob and Mailpit copy are hidden when `OS.is_debug_build()` is false. This ACCT-09 run did **not** produce a new `client/exports/windows/small-mmorpg.exe` (templates are workstation-local).

## Clean checkout

Every command is listed in [ACCOUNT_SECURITY_TEST_REPORT.md](ACCOUNT_SECURITY_TEST_REPORT.md) and `scripts/test-account-lifecycle.ps1`.

```powershell
powershell -File scripts/setup.ps1
powershell -File scripts/content-build.ps1
powershell -File scripts/server-build.ps1
Set-Location auth-gateway; npm ci; npm run build
powershell -File scripts/backend-up.ps1
powershell -File scripts/test-server.ps1
powershell -File scripts/test-auth-gateway.ps1
powershell -File scripts/test-client.ps1
powershell -File scripts/export-client-release.ps1
```

Hermetic-only (no Docker): `powershell -File scripts/test-account-lifecycle.ps1`

## Known limitations

- Stay Signed In remains hidden.
- Link-dead clock starts at Nakama **detection**, not window-close time (15 s ping / 25 s pong wait).
- Nakama SDK `defaultkey` remains in `client/addons/com.heroiclabs.nakama` for debug/device auth.
- Production registration stays **CLOSED** until operators open it.
- Graphical five-email Mailpit play and live Postgres restart (`scripts/test-failure.ps1 -Live`) remain operator drills.

Foundation v1 exclusions in [../KNOWN_LIMITATIONS.md](../KNOWN_LIMITATIONS.md) still apply.
