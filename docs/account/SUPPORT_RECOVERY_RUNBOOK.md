# Support recovery runbook

How operators help a player who cannot sign in, without revealing emails or secrets.

Related: [PLAYER_ACCOUNT_GUIDE.md](PLAYER_ACCOUNT_GUIDE.md), [EMAIL_DELIVERY_RUNBOOK.md](EMAIL_DELIVERY_RUNBOOK.md), [ACCOUNT_DELETION_RUNBOOK.md](ACCOUNT_DELETION_RUNBOOK.md), [SESSION_AND_LEASE_RUNBOOK.md](SESSION_AND_LEASE_RUNBOOK.md), [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md).

## Never do

- Do not ask the player to paste a password, verification code, reset code, deletion code, access token, or refresh token into chat or tickets.
- Do not return an email address from support tools. `GET/POST /v1/support/lookup` is email-free by design.
- Do not use the Nakama console to reset a password by editing SQL.
- Do not disable production registration or volume-destroy data to “fix” one account.

## Identify the account

Players often forget which email they used. Take:

- Character display names
- Approximate signup day
- Support Recovery ID from Character Select (`VIBE-` plus 12 hex), if they can still open Account Settings

Operator lookup:

```http
POST /v1/support/lookup
x-support-key: <AUTH_SUPPORT_LOOKUP_SECRET>
```

Body may include character name or recovery id. The response includes status, verified flag, character names, and Nakama user id. **Never an email.** Every lookup is audited (`query_kind`, `query_hash`, `hit`, `user_id`).

If lookup misses, say you cannot find a matching account. Do not confirm or deny a guessed email.

## Common cases

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Generic login failure | Wrong password or unknown email | Point to Forgot Password. Same success copy either way. |
| Verification required | Never confirmed | Resend from the game. If mail failed, follow [EMAIL_DELIVERY_RUNBOOK.md](EMAIL_DELIVERY_RUNBOOK.md). |
| Account disabled | `disableTime` or `DISABLED` | Confirm in Nakama console; do not invent a re-enable from Godot. |
| Account deleting | Deletion saga in progress | Wait for status; do not start a second delete. |
| Rate limited | Public 429 | Tell them to wait. `retry_after_seconds` is in the error envelope. No lockout. |
| Cannot Play / countdown | Link-dead or live lease | Wait for countdown. Do not delete the lease by hand unless [SESSION_AND_LEASE_RUNBOOK.md](SESSION_AND_LEASE_RUNBOOK.md) stale-repair steps apply. |
| Name taken | Reservation still held | Soft-deleted names stay reserved for 7 days. |
| Wants export | Product path | Character Select → export. Gateway holds JSON 5 minutes. Restarting the gateway drops it. |
| Wants delete | Product path | Password + email code + `DELETE ACCOUNT`. Must not be in-world. |

## Password and email

Product recovery is the gateway. If the player can receive mail, they reset themselves. If they cannot receive mail and you have proven identity by recovery id + character names, an operator may use Nakama console / internal `replace_password` only through the signed `auth_gateway` RPC. Log the user id and request id. Never paste the new password into tickets.

Email change is player-driven. Do not “swap email” in SQL.

## After deletion

A new registration on the same email is a **new user id**. Do not restore old characters onto it. Backup replay of a recorded delete uses the **old user id** only ([ACCOUNT_DELETION_RUNBOOK.md](ACCOUNT_DELETION_RUNBOOK.md)).
