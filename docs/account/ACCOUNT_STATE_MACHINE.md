# Account state machine

Target distribution states vs persisted project status on `account_profile`.

## Target states

```
PENDING_VERIFICATION
ACTIVE
DISABLED
DELETION_PENDING
DELETING
DELETED
```

`DELETED` may exist only as a non-login deletion record or audit tombstone after the Nakama account has been removed. No deleted account may authenticate.

## Current mapping (ACCT-04)

| Target | Current |
| --- | --- |
| `PENDING_VERIFICATION` | Set on register. `verifiedAt` is 0. Login after valid credentials returns `EMAIL_VERIFICATION_REQUIRED` without tokens. Gameplay RPCs, match join, and chat reject `email_verification_required`. |
| `ACTIVE` | Set on successful verification with `verifiedAt`. Login returns Nakama tokens. Character and match operations allowed. |
| `DISABLED` | Nakama `disableTime` and/or profile `DISABLED`. Login returns `AUTH_ACCOUNT_DISABLED`. Gameplay rejects `account_disabled`. Password-reset **request** still returns the generic success copy and does not reveal this state. |
| `DELETION_PENDING` / `DELETING` | Profile status `DELETING` after a valid delete confirm freeze. Login returns `AUTH_ACCOUNT_DELETING` except deletion-status handling. Gameplay rejects `account_deleting`. Confirm and status may continue with a session bearer or `status_token`. |
| `DELETED` | Nakama recorded delete plus missing account. Login cannot succeed. Tombstone is keyed by original user id. |

Device/debug accounts with no email and no profile remain playable so Alice/Bob and e2e keep working.

## Allowed operations

| | Verify / resend | Password recovery | Change password / email | Create / select character | Join match / gameplay RPCs / chat / trade |
| --- | --- | --- | --- | --- | --- |
| `PENDING_VERIFICATION` | yes | request is generic; challenge may be issued | no | no | no |
| `ACTIVE` | n/a | yes | yes (recent session + current password) | yes | yes, if no conflicting lease |
| `DISABLED` | no | request is generic; login remains blocked | no | no | no |
| `DELETION_PENDING` / `DELETING` | no | request is generic; no new challenge | no | no | no |
| `DELETED` | no login | request is generic; no new challenge | no | no | no |

Unverified accounts with no live characters, no active match location, and no deletion in progress may be purged after `AUTH_UNVERIFIED_RETENTION_MS` (default seven days). Purge is idempotent and releases the email HMAC.

## Transitions

1. Register → `PENDING_VERIFICATION` (after uniqueness; duplicate email is a generic failure plus optional silent resend).
2. Confirm challenge → `ACTIVE`, `verified_at`, invalidate outstanding verification challenges, confirmation email.
3. Operator disable → `DISABLED`.
4. Product delete confirm → freeze `DELETING` → cancel transients → remove game data → remove indexes → revoke sessions → `nk.accountDeleteId(userId, true)` → complete (mail using email held only for the request). Same idempotency key resumes. Backup replay is by original user id.
5. Unverified cleanup → account removed; email reusable.
6. Password reset or logged-in password change → same `ACTIVE` (or pending) status, new password, all sessions revoked. User id and characters unchanged.
7. Email-change confirm → same user id, new canonical email and HMAC, all sessions revoked. Old email is free for a new account after Nakama unlink succeeds.
8. Forgotten-email help does not change account state.
