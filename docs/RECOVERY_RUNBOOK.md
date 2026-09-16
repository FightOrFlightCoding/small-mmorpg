# Recovery runbook

Short operator steps. Full incident notes: [RECOVERY.md](RECOVERY.md). Deploy order: [DEPLOYMENT.md](DEPLOYMENT.md). Domain list: `server/src/domain/recovery.ts`.

A backup is not accepted until restore into **`nakama_restore_drill`** matches public table counts (`scripts/test-backup.ps1`).

## Backup and restore

| Action | Command |
| --- | --- |
| Create | `powershell -File scripts/backup-create.ps1 -Environment local` |
| List | `powershell -File scripts/backup-list.ps1` |
| Restore-test (safe) | `powershell -File scripts/backup-restore-test.ps1 -Backup backups\<file>.dump` |
| Verify | `powershell -File scripts/backup-verify.ps1 -Database nakama_restore_drill -SourceDatabase nakama` |
| Restore local | `powershell -File scripts/backup-restore-local.ps1 -Backup backups\<file>.dump -ConfirmLocal RestoreLocal` |
| Staging / production | `scripts/backup-restore.ps1` requires `OVERWRITE-STAGING` or `OVERWRITE-PRODUCTION` |

Dumps are gitignored. Restore-test never writes `nakama`, `nakama_staging`, or `nakama_production`. Volume destroy is forbidden when environment `dataReset` is `forbidden`.

## Incidents

| Symptom | Action |
| --- | --- |
| Bad server binary | Redeploy previous `server/build/index.js` / `vibecode-nakama:3.40.0`. Keep the database. Smoke `vibecode_health` and one join. |
| Bad content package | Restore matching `server/src/generated/content.ts` and `client/content/bundle.json`. Clients with the other hash get `content_mismatch`. Do not migrate saves backward. |
| Failed migration | Keep `blockTransactions`. Restore the pre-migration dump into `nakama_restore_drill`, verify, then restore with the confirmation tokens above. |
| Corrupted location | Authorized GM `repair_invalid_location` returns the character to public-world spawn. |
| Stuck trade | Rejoin recovers a committing trade. Authorized GM `cancel_trade` unlocks without fabricating a commit. |
| Missing cave match | `find_or_create_starter_zone` falls back to the public world. Players are not stranded. |
| Incompatible client | Handshake/join: `client_too_old`, `client_too_new`, `protocol_mismatch`, `content_mismatch`. Ship a matching export. |
| Accidental item grant | Authorized GM `remove_test_item` with the instance id. |
| Accidental quest complete | Authorized GM `reset_quest`. |

## Maintenance window

1. `ops_set_maintenance` `{ "enabled": true, "rejectJoins": true, "blockTransactions": true, "reason": "…" }`
2. Backup
3. Content validate
4. Migration dry-run
5. Deploy server bundle and recreate Nakama
6. Apply migrations
7. Ship matching client
8. Smoke login + public-world join
9. Clear maintenance

## Local restart

```powershell
powershell -File scripts/dev-up.ps1
```

JS runtime is not hot-reloaded. After a content or server change, rebuild and recreate Nakama. Postgres data survives `dev-down` unless you run `backend-volume-destroy`.
