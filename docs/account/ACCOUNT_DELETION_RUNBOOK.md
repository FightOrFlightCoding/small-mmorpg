# Account deletion runbook

Product deletion is a 7-phase idempotent saga. Related: [ACCOUNT_STORAGE_CATALOG.md](ACCOUNT_STORAGE_CATALOG.md), [SUPPORT_RECOVERY_RUNBOOK.md](SUPPORT_RECOVERY_RUNBOOK.md), [../RECOVERY_RUNBOOK.md](../RECOVERY_RUNBOOK.md).

## Player path

Character Select → Delete Account.

1. Current password
2. Email one-time code (15 minutes, five attempts)
3. Exact phrase `DELETE ACCOUNT`
4. Click-only confirm (Enter must not submit)
5. Same `Idempotency-Key` on request and confirm

Fences: no live gameplay lease (including `LINK_DEAD`), no trade, no transfer. Return to Character Select first. Hosted HTML `/v1/confirm` with `ACCOUNT_DELETION` **does not** delete.

While `DELETING`, login is `AUTH_ACCOUNT_DELETING`. Status may use `status_token` after sessions are revoked. Completion mail uses the address held only for the job.

## Saga phases

Owned on the system user: `account_deletion` / `d_<userId>`, `schemaVersion` **1**, `permissionWrite: 0`. No raw email in the tombstone.

| Phase | Effect |
| --- | --- |
| `freeze` | Profile `DELETING` |
| `cancel_transient` | Cancel live trade/transfer/party side effects required by the fence |
| `remove_game_data` | Wipe character/gameplay records and account gold |
| `remove_account_indexes` | HMAC index no longer points at this user |
| `revoke_sessions` | All refresh tokens die |
| `delete_nakama` | `nk.accountDeleteId(userId, true)` only |
| `complete` | Job finished; `account_deleted` mail |

Interrupt at any phase: the next confirm/status **resumes** `completedPhases`. Do not start a second job. Do not call recorded delete as the whole product path.

## Email reuse

After complete, the old email may register again. That is a **new** Nakama user id with an empty catalog, no old items, gold, quests, names, privileges, or lease.

## Backup replay

1. Take a dump **before** deletion (`scripts/backup-create.ps1`).
2. After deletion, restore into **`nakama_restore_drill`** (`scripts/backup-restore-test.ps1`), not production.
3. Apply recorded deletions by **original user id**.
4. `shouldReplayDeletion` is false for a later user who reused the email.
5. Unrelated accounts must remain.

Never replay delete-by-email.

## Operator mistakes

| Mistake | Result |
| --- | --- |
| Console delete without `record=true` | Tombstone/reuse behavior may not match product |
| SQL user delete | Forbidden |
| Confirming HTML `/v1/confirm` and assuming the account is gone | Account still exists |
| Restoring a backup over production to “undo” one delete | Can resurrect the deleted user **and** destroy later accounts; use drill DB |
