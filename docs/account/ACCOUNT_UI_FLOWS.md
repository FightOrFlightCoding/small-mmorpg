# Account UI flows

ACCT-03 Godot shell for the normal account entry lifecycle. Gateway-hosted `/v1/confirm` pages remain for email links. Product email login goes through `AccountService` and the auth gateway. Debug Alice/Bob/device buttons remain, hidden in release.

## Login (`scenes/login/login.tscn`)

- Email, password, show/hide, Caps Lock hint where typing looks shifted, Remember Email, Login, Register, Forgot Password, Forgot Which Email?, server status, version, loading, field/global errors.
- Stay Signed In is hidden (`CredentialStore` unavailable).
- Debug: Alice, Bob, this machine (hidden in release).
- Forgot Password calls `POST /v1/auth/password-reset/request` with generic copy.
- Forgot Which Email? explains that support cannot reveal whether an address is registered.
- Success (verified) → import Nakama session → character scene.
- Unverified credentials → Email Verification.
- Disabled → Account Disabled.
- Gateway down → Server Unavailable.

## Registration (`scenes/login/register.tscn`)

- Email, password, confirm, show/hide, 15–128 guidance, live strength, Terms and Privacy checkboxes **unchecked** by default, placeholder document links, Register, Back to Login, field errors.
- Success → Email Verification. Duplicate email uses the generic “We could not create this account…” copy.

## Email verification (`scenes/login/verify.tscn`)

- Explanation, code field with paste, Verify, Resend with countdown, Change email (registration), Back to Login, delivery-delay copy.
- Success → Login.

## Server Unavailable / Account Disabled

- Retry/back to Login. Disabled accounts cannot enter character select.

## Character select (`scenes/character`, `character.gd`)

- Unchanged roster UX plus **Log out all sessions** with current-password confirmation.
- Logout current still returns to Login.
- Unverified/disabled/deleting accounts never reach this scene through the email path; RPCs still enforce the playable-account guard.

## World HUD

- Logout current → leave match → Login.
- Settings persist non-credential preferences.
- Debug GM panel does not grant account authority.

## Later phases (do not implement here)

1. Character Select with five slots, class cards, Recently Deleted, typed-name delete.
2. Play disabled while the server reports an active-character lease.
3. In-game Return to Character Select vs Quit as distinct server-acked operations.
4. Account Settings: export, delete (password + email code + `DELETE ACCOUNT`).
5. Stay Signed In after OS credential-store certification on editor, exported Windows, and exported Linux.

## Error display rules

Show localized friendly text. Never show stack traces, SQL, internal RPC names, storage collections, provider errors, tokens, or server keys. Password-reset and forgotten-email must not reveal whether the address exists.
