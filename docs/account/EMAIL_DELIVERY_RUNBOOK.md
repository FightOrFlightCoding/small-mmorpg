# Email delivery runbook

Operational steps for verification, reset, email-change, and deletion mail.

Architecture: [EMAIL_DELIVERY_ARCHITECTURE.md](EMAIL_DELIVERY_ARCHITECTURE.md). Player copy: [PLAYER_ACCOUNT_GUIDE.md](PLAYER_ACCOUNT_GUIDE.md).

## Where mail is sent

| Environment | Provider | Inspection |
| --- | --- | --- |
| Automated tests | `EMAIL_PROVIDER=memory` | `auth-gateway/tests` |
| Automated-test Compose | Mailpit `axllent/mailpit:v1.30.7` SMTP `1025` | http://127.0.0.1:8125 |
| Local Compose | SendGrid HTTP | Player inbox; SendGrid dashboard. Never log the API key |
| Staging / production | SendGrid HTTP | Provider dashboard; never log the API key |

Staging/production refuse to start if the public base URL is not `https://`, if Nakama keys are local defaults, if the provider is not SendGrid, or if HMAC secrets contain `not-production`. Local SendGrid also refuses an empty API key or a localhost / `REPLACE_ME` from-address.

The Godot client never sends email and never receives provider keys. Release UI does not mention Mailpit or `127.0.0.1:8025`. Local debug UI tells players to check the real inbox.

## Templates

`verify_email`, `password_reset`, `password_changed`, `email_change_confirmation`, `email_change_old_notice`, `email_changed_old`, `email_changed_new`, `account_deletion_confirmation`, `account_deleted`, `email_verified`, `suspicious_session_invalidation`.

Bodies include expiry and a support address. Codes are grouped base32. Links use `/v1/confirm`. Passwords and session tokens never appear in templates.

## Failure modes

| Failure | Expected behavior | Operator step |
| --- | --- | --- |
| Provider error after register | Account kept `PENDING_VERIFICATION`; HTTP still `verification_required` | Player resends. Check SendGrid activity (or Mailpit on the automated-test stack). Do not delete the Nakama user. |
| Provider error after reset request | Generic success unchanged (no enumeration) | Same. Player can retry after the request limit (5 / 10 min per email hash). |
| Delayed mail | Client shows delay copy | Wait; junk folder; resend. |
| Gateway `/ready` `email: false` | Client Server Unavailable / banners | Restart gateway after provider health returns. Confirm `SENDGRID_API_KEY` and verified `EMAIL_FROM`. |
| Rate limit `provider` 20/60s | 429 generic retry | Wait. Do not raise limits to “push mail through.” |
| Hosted confirm for deletion | Does **not** delete | Player must confirm in the Godot client. |
| SendGrid rejects the from-address | Send fails; account still pending | Verify the sender in SendGrid. Do not switch back to Mailpit on the play stack. |

Logs may include `request_id`, `template`, `purpose`. They must not include passwords, tokens, raw codes, API keys, peppers, or full email bodies.

## Local check

```powershell
Copy-Item infra/.env.local.example infra/.env.local
# Edit SENDGRID_API_KEY and EMAIL_FROM, then:
powershell -File scripts/backend-up.ps1
```

Register through the client or `POST http://127.0.0.1:8787/v1/auth/register`. Open the real inbox. Paste the code in the Verify scene.

## Production checklist

1. `SENDGRID_API_KEY` only in the gateway environment, not in git or Godot.
2. `AUTH_GATEWAY_PUBLIC_BASE_URL` is HTTPS.
3. From-address and support address are real and verified.
4. Confirm a test registration, reset, email change, and deletion mail in staging before opening registration.
