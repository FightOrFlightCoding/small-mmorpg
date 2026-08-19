# Account state machine

Target distribution states vs what the repository actually persists today. ACCT-01 does not implement the target states.

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

## Current mapping

| Target | Current |
| --- | --- |
| `PENDING_VERIFICATION` | **Absent.** Nakama `account.verifyTime` is observed (often `0` with no SMTP) but gameplay RPCs do not check it. Unverified accounts may create characters and join matches. |
| `ACTIVE` | **Implicit.** A Nakama user that can authenticate. There is no project `account_status` storage object. |
| `DISABLED` | **Partial.** Nakama `account.disableTime` / console disable exists but the Godot client has no product disable flow. |
| `DELETION_PENDING` | **Absent.** |
| `DELETING` | **Absent** as a durable project state. Recorded delete is a single `nk.accountDeleteId(userId, true)` call in the compatibility probe. |
| `DELETED` | **Nakama tombstone** when `recorded=true`. The project does not yet write its own tombstone (no raw email in that future row). |

## Allowed operations by target state (later phases)

| | Verify / resend | Password recovery | Create / select character | Join match / gameplay RPCs / chat / trade |
| --- | --- | --- | --- | --- |
| `PENDING_VERIFICATION` | yes | yes | no | no |
| `ACTIVE` | n/a | yes | yes | yes, if no conflicting lease |
| `DISABLED` | no | support only | no | no |
| `DELETION_PENDING` / `DELETING` | no | no | no | no |
| `DELETED` | no login | no | no | no |

Today every authenticated Nakama user is treated as `ACTIVE`.

## Transitions to implement later

1. Register → `PENDING_VERIFICATION` (after email uniqueness).
2. Confirm challenge → `ACTIVE`.
3. Operator disable → `DISABLED`; enable → `ACTIVE`.
4. Product delete (password + email challenge + typed `DELETE ACCOUNT` + idempotency key) → `DELETING` then recorded Nakama delete → `DELETED` tombstone.
5. Restart-safe: a crash in `DELETING` must resume, not restore a half-deleted account.

Email reuse after `DELETED` is proven at the Nakama layer in [NAKAMA_COMPATIBILITY_RESULTS.md](NAKAMA_COMPATIBILITY_RESULTS.md).
