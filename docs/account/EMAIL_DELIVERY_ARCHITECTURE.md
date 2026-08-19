# Email delivery architecture

ACCT-02 implements a project-owned mailer behind the auth gateway. The Godot client never sends email and never receives provider keys.

Related: [AUTH_API_CATALOG.md](AUTH_API_CATALOG.md), [ACCOUNT_ARCHITECTURE.md](ACCOUNT_ARCHITECTURE.md), [../ENVIRONMENTS.md](../ENVIRONMENTS.md).

## Provider selection

`EmailProvider` is the only send interface (`auth-gateway/src/email/templates.ts`). Domain routes pick a `templateId`; they do not know which adapter is configured.

| Environment | Provider | Configuration |
| --- | --- | --- |
| Automated tests | In-memory fake | `EMAIL_PROVIDER=memory` |
| Local / automated_test Compose | Mailpit SMTP capture | `axllent/mailpit:v1.30.7`, SMTP `1025`, UI `8025` |
| Staging / production | SendGrid HTTP | `EMAIL_PROVIDER=sendgrid` and `SENDGRID_API_KEY` (gitignored) |

Staging and production refuse to start if the public base URL is not `https://`, if Nakama keys are the local defaults, if the provider is not SendGrid, or if HMAC secrets still contain `not-production`.

## Templates

Every template is plain text plus minimal HTML. None include passwords, access tokens, or extra personal fields.

| `templateId` | Use |
| --- | --- |
| `verify_email` | Registration / resend |
| `password_reset` | Recovery request |
| `password_changed` | After a successful reset |
| `email_change_confirmation` | Confirm the new address |
| `email_change_old_notice` | Notify the previous address (no code) |
| `account_deletion_confirmation` | Confirm deletion |
| `account_deleted` | After recorded delete |
| `email_verified` | After successful verification |
| `suspicious_session_invalidation` | Session revocation / logout-all notice |

Bodies include expiry time and a support address. Codes are grouped base32 (`XXXX-XXXX-XXXX-XXXX`). Confirmation links point at the gateway-hosted `/v1/confirm` page. The Godot verification scene can also accept the code manually.

## Failure handling

A Nakama account is created before verification mail is sent. If the provider fails, the gateway still returns `{ ok: true, verification_required: true }` and logs `email_send_failed` with request id and template only. It does not delete the account or write a dummy success challenge. Resend is generic whether or not the address exists.

Password-reset and resend responses are identical for unknown and known addresses.

## Local inspection

1. Start the stack: `powershell -File scripts/backend-up.ps1`
2. Open Mailpit at [http://127.0.0.1:8025](http://127.0.0.1:8025)
3. Register through `POST http://127.0.0.1:8787/v1/auth/register` or the Godot registration scene
4. Read the captured message. Enter the code via `POST /v1/auth/verify/confirm`, the hosted confirm page, or the Godot verification scene.

Do not put production SendGrid keys in Compose files or git.

## Logging

Logs may include `request_id`, `template`, and `purpose`. They must not include passwords, tokens, raw challenge codes, or full email bodies.
