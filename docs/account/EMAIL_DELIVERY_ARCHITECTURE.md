# Email delivery architecture

Outbound email is **not implemented**. ACCT-01 records that blocker so later verification, password recovery, email-change, and account-deletion confirmation can attach to one adapter.

## Current

- `infra/nakama/local.yml` has no SMTP block.
- Foundation v1 password recovery is console-assisted (`docs/SECURITY_MODEL.md`).
- Login copy tells the player that recovery is administrator-assisted.
- Nakama `verifyTime` is not used as a gameplay gate.
- The client never sends email through a project SMTP service.

## Target adapter (later phases)

One server-owned mailer, not the Godot client:

1. Canonicalize the destination with `canonicalizeEmail` (trim, basic syntax, max 254, lowercase; keep `+tags`; no Gmail-dot rules).
2. Render templates by `message_key` (verification, resend, password recovery, email-change, deletion confirmation, deletion-complete).
3. Put one-time codes only in the message body, never in query strings the client logs.
4. Store only hashed challenges server-side with expiry and attempt limits. Never persist the raw code in `user://`.
5. Deletion-complete mail must not require keeping the raw email on the `DELETED` tombstone (hash or one-shot send-then-forget).
6. Log `message_key`, user id, and request id. Do not log the address in full if policy forbids it; never log codes or passwords.
7. Password-reset and forgotten-email **responses to the client** are identical whether the HMAC lookup misses or hits.

## Local/dev

Until SMTP exists, automated tests may capture codes from a development-only sink gated by `developmentToolsEnabled`. Production must use a real provider configured via gitignored env, not committed secrets.

## Blocker

Email verification before character creation cannot go live until this adapter exists. Do not fake success or print codes in player-visible UI.
