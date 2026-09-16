# Recovery

Operator procedures for the nine Prompt 33 incidents. Related: [DEPLOYMENT.md](DEPLOYMENT.md), [ENVIRONMENTS.md](ENVIRONMENTS.md), [MIGRATIONS.md](MIGRATIONS.md). Domain list: `server/src/domain/recovery.ts` (`RECOVERY_PROCEDURES`).

A backup is **not** accepted until `scripts/test-backup.ps1` restores it into a **separate** database (`nakama_restore_drill`) and verification matches public table counts.

## Backups

| Action | Command |
| --- | --- |
| Create | `powershell -File scripts/backup-create.ps1 -Environment local` |
| List | `powershell -File scripts/backup-list.ps1` |
| Restore into a separate test database | `powershell -File scripts/backup-restore-test.ps1 -Backup backups\<file>.dump` |
| Verify restoration | `powershell -File scripts/backup-verify.ps1 -Database nakama_restore_drill -SourceDatabase nakama` |
| Restore local (destructive) | `powershell -File scripts/backup-restore-local.ps1 -Backup backups\<file>.dump -ConfirmLocal RestoreLocal` |
| Protect production | `powershell -File scripts/backup-restore.ps1 -Environment production -Backup <file> ` fails unless `-ConfirmToken OVERWRITE-PRODUCTION`. Staging needs `OVERWRITE-STAGING`. Volume destroy is forbidden when `dataReset` is `forbidden`. |

Dumps land in gitignored `backups/`. Restore-test never writes `nakama`, `nakama_staging`, or `nakama_production`.

## Scenarios

### Bad server deployment

Redeploy the previous `server/build/index.js` (or previous `vibecode-nakama:3.40.0` image). Keep the database. Smoke `vibecode_health` and one join. Do not apply a newer migration while rolling back the binary unless that migration is already on disk.

### Bad content package

Restore the previous generated pair (`server/src/generated/content.ts` and `client/content/bundle.json`) so hashes match. Clients with the new hash get `content_mismatch` until they update. Do not migrate saves backward.

### Failed migration

Leave `blockTransactions` on. Restore the pre-migration dump into `nakama_restore_drill`, verify, then restore local/staging only with the confirmation tokens above. Production restore requires `OVERWRITE-PRODUCTION`.

### Corrupted character location

Authorized GM `repair_invalid_location` returns the character to the public-world spawn. Audit records the reason.

### Interrupted trade

Rejoin recovers a committing trade. Authorized GM `cancel_trade` unlocks a stuck live trade without fabricating a commit.

### Missing cave match

`find_or_create_starter_zone` falls back to the public world when the cave match is gone (Prompt 29). Players are not stranded in a missing instance.

### Incompatible client

Handshake and join reject with `client_too_old`, `client_too_new`, `protocol_mismatch`, or `content_mismatch`. The client shows a fatal error and does not enter gameplay. Ship a matching export.

### Accidental item grant

Authorized GM `remove_test_item` with the instance id. The GM audit is the record of the correction.

### Accidentally completed quest

Authorized GM `reset_quest` returns the quest toward locked/accepted without fabricating rewards.

Tests: `server/tests/recovery.test.ts`, `server/tests/compatibility.test.ts`, `server/tests/maintenance.test.ts`, `client/tests/app/handshake_test.gd`.
