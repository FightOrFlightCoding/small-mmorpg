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

## Current mapping (ACCT-03)

| Target | Current |
| --- | --- |
| `PENDING_VERIFICATION` | Set on register. `verifiedAt` is 0. Login after valid credentials returns `EMAIL_VERIFICATION_REQUIRED` without tokens. Gameplay RPCs, match join, and chat reject `email_verification_required`. |
| `ACTIVE` | Set on successful verification with `verifiedAt`. Login returns Nakama tokens. Character and match operations allowed. |
| `DISABLED` | Nakama `disableTime` and/or profile `DISABLED`. Login returns `AUTH_ACCOUNT_DISABLED`. Gameplay rejects `account_disabled`. |
| `DELETION_PENDING` / `DELETING` | Profile status. Login returns `AUTH_ACCOUNT_DELETING`. Gameplay rejects `account_deleting`. Product delete UI remains a later phase. |
| `DELETED` | Nakama recorded delete plus missing account. Login cannot succeed. |

Device/debug accounts with no email and no profile remain playable so Alice/Bob and e2e keep working.

## Allowed operations

| | Verify / resend | Password recovery | Create / select character | Join match / gameplay RPCs / chat / trade |
| --- | --- | --- | --- | --- |
| `PENDING_VERIFICATION` | yes | yes | no | no |
| `ACTIVE` | n/a | yes | yes | yes, if no conflicting lease |
| `DISABLED` | no | support only | no | no |
| `DELETION_PENDING` / `DELETING` | no | no | no | no |
| `DELETED` | no login | no | no | no |

Unverified accounts with no live characters, no active match location, and no deletion in progress may be purged after `AUTH_UNVERIFIED_RETENTION_MS` (default seven days). Purge is idempotent and releases the email HMAC.

## Transitions

1. Register → `PENDING_VERIFICATION` (after uniqueness; duplicate email is a generic failure plus optional silent resend).
2. Confirm challenge → `ACTIVE`, `verified_at`, invalidate outstanding verification challenges, confirmation email.
3. Operator disable → `DISABLED`.
4. Product delete (later phase) → `DELETING` then recorded Nakama delete → `DELETED`.
5. Unverified cleanup → account removed; email reusable.
