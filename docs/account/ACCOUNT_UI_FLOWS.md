# Account UI flows

ACCT-04 Godot shell for credential recovery and maintenance, plus ACCT-05 Character Select (five slots, production class cards, Recently Deleted). Gateway-hosted `/v1/confirm` pages remain for email links. Product email login goes through `AccountService` and the auth gateway. Debug Alice/Bob/device buttons remain, hidden in release.

## Login (`scenes/login/login.tscn`)

- Email, password, show/hide, Caps Lock hint where typing looks shifted, Remember Email, Login, Register, Forgot Password, **Forgot which email you used?**, server status, version, loading, field/global errors.
- Local Compose server hint includes Mailpit (`http://127.0.0.1:8025`); verification mail is not delivered to Gmail.
- Stay Signed In is hidden (`CredentialStore` unavailable).
- Debug: Alice, Bob, this machine (hidden in release).
- Forgot Password opens Forgot Password Request. The gateway call is `POST /v1/auth/password/reset/request` with generic copy whether or not the address exists.
- Forgot which email you used? opens the support-assisted help scene. It does not look up or mask an email.
- Success (verified) → import Nakama session → character scene.
- Unverified credentials → Email Verification.
- Disabled → Account Disabled.
- Gateway down → Server Unavailable.

## Registration (`scenes/login/register.tscn`)

- Email, password, confirm, show/hide, 15–128 guidance, live strength, Terms and Privacy checkboxes **unchecked** by default, placeholder document links, Register, Back to Login, field errors.
- Local Compose: Mailpit capture note (`http://127.0.0.1:8025`, not Gmail).
- Success → Email Verification. Duplicate email uses the generic “We could not create this account…” copy.

## Email verification (`scenes/login/verify.tscn`)

- Explanation, code field with paste, Verify, Resend with countdown, Change email (registration), Back to Login, delivery-delay copy.
- Local Compose captures mail in Mailpit (`http://127.0.0.1:8025`). The verify screen says so and offers **Open local inbox**. Codes are not delivered to Gmail.
- Success → Login.

## Forgot Password Request (`scenes/login/forgot_password.tscn`)

- Email, submit, resend, continue to code entry, back to Login, loading, duplicate-submit disabled.
- Success copy is always *If an account exists for that email, password-reset instructions have been sent.* plus 15-minute expiry guidance. The screen does not say whether the address is registered.

## Password Reset Code Entry (`scenes/login/password_reset_code.tscn`)

- Code field with paste, continue, resend with countdown, expiry guidance, back to Forgot Password.

## New Password (`scenes/login/password_reset_new.tscn`)

- New password, confirmation, show/hide, submit, expired-code copy, back to code entry.
- Confirm is `POST /v1/auth/password/reset/confirm`. The client never receives tokens and does not auto-login.

## Password Changed (`scenes/login/password_changed.tscn`)

- Clear success: password changed, all sessions signed out, Back to Login.
- Used after unauthenticated reset and after logged-in password change.

## Change Password (`scenes/login/change_password.tscn`)

- Requires an authenticated session. Current password, new password, confirmation, show/hide, loading, back to Character Select.
- Success revokes all sessions and opens Password Changed.

## Change Email (`scenes/login/change_email.tscn`)

- Requires an authenticated session. Current password, proposed new email, loading, back to Character Select.
- Success opens Email Change Verification. The old email stays active until confirm.

## Email Change Verification (`scenes/login/email_change_verify.tscn`)

- Code with paste, resend countdown, expiry copy, back navigation.
- Confirm does not auto-login. Success copy tells the player to sign in with the new address.

## Forgot Which Email Help (`scenes/login/forgot_email.tscn`)

- Title: **Forgot which email you used?**
- Explains inbox search, official sender, contacting support, non-secret identifiers such as character names, a private recovery/support ID when one is available, and that support will require additional verification.
- A character-name field does not call a reveal API. Status copy never includes an email or confirms that a character exists.

## Server Unavailable / Account Disabled

- Retry/back to Login. Disabled accounts cannot enter character select.

## Character select (`scenes/character`, `character.gd`)

- Five visible slot cards: name, class, level, placeholder class color, last location, last played, presence, Play, Delete.
- Link-dead copy is `Character still in world` / `Available in N seconds` from `playAvailableAt` vs `serverTimeMs`. Other live-lease characters show `Waiting for previous character to leave`. All Play buttons stay disabled until the lease clears, then the catalog refreshes and Play needs a new ticket.
- Create Character, Recently Deleted, Account Settings, Logout, server status, version.
- Creation: three content-driven class cards (Warrior / Marksman / Mage), name field, name rules, advisory availability, Create, Back, final confirmation. Creation is the only authoritative name reservation.
- Recently Deleted: name, class, level, time remaining, Restore (disabled without a free slot). No client-only permanent-delete button.
- Account Settings: change password, change email, logout-all. Permanent account deletion remains later.
- Unverified/disabled/deleting accounts never reach this scene through the email path; RPCs still enforce the playable-account guard.

## World HUD

- Character Select: opcode 32, wait for ack, then the character scene.
- Log out: same safe leave, then revoke current tokens, Login. Failed leave stays in-world.
- Quit Game: Quit Safely when allowed; otherwise warn about the ten-second hold, Cancel, or Quit Anyway.
- Session status: Entering world, Online, Returning to Character Select, Logging out, Connection lost, Character remains in world, Server unavailable.
- Settings persist non-credential preferences.
- Debug GM panel does not grant account authority.

## Shared screen rules

All recovery and maintenance screens provide a loading state, disabled duplicate submit, clear success, clear expiry, resend guidance where a challenge is involved, back navigation, password visibility controls on password fields, and paste support on code fields. None enumerate accounts.

## Later phases (do not implement here)

1. Account Settings: export, delete (password + email code + `DELETE ACCOUNT`).
2. Stay Signed In after OS credential-store certification on editor, exported Windows, and exported Linux.

## Error display rules

Show localized friendly text. Never show stack traces, SQL, internal RPC names, storage collections, provider errors, tokens, or server keys. Password-reset and forgotten-email must not reveal whether the address exists.
