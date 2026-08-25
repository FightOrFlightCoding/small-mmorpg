# Account UI flows

ACCT-08 wraps accepted account and character operations in a project-owned design system (`DesignTokens`, `ShellTheme`, `Ux*` components). Lifecycle actions still go through `GameService` / `AccountService` / `NetworkService`. Gateway-hosted `/v1/confirm` pages remain for email links. Debug Alice/Bob/device buttons remain, hidden in release.

`AccountErrors` maps catalog codes to player copy. Unknown codes show `Something went wrong.` plus `Reference: <request ID>`. Dialogs never show raw backend codes or stack traces.

## Login (`scenes/login/login.tscn`)

- Autofocus email, Enter advances email → password → submit, explicit tab order, show/hide password, Caps Lock hint, Remember Email, Login loading spinner, Register, Forgot Password, **Forgot which email you used?**, server banners (maintenance, client update, email delay), version in debug builds, rate-limit countdown, field/global errors.
- Invalid credentials keep the email and clear the password. Generic copy only.
- Debug local Compose server hint includes Mailpit (`http://127.0.0.1:8025`); verification mail is not delivered to Gmail. Release hides Mailpit, Alice/Bob, and the local gateway URL.
- Stay Signed In is hidden (`CredentialStore` unavailable).
- Debug: Alice, Bob, this machine (hidden in release).
- Forgot Password opens Forgot Password Request. The gateway call is `POST /v1/auth/password/reset/request` with generic copy whether or not the address exists.
- Forgot which email you used? opens the support-assisted help scene. It does not look up or mask an email.
- Success (verified) → import Nakama session → character scene.
- Unverified credentials → Email Verification.
- Disabled → Account Disabled.
- Gateway down → Server Unavailable.

## Registration (`scenes/login/register.tscn`)

- Live local email syntax guidance, password guidance/confirm/visibility/strength, Terms and Privacy checkboxes **unchecked** by default, placeholder document links, field errors, form error summary, Register, Back to Login.
- Does not claim success until the server confirms. Duplicate email uses the generic “We could not create this account…” copy.
- Debug local Compose: Mailpit capture note (`http://127.0.0.1:8025`, not Gmail). Hidden in release.
- Success → Email Verification. Duplicate email uses the generic “We could not create this account…” copy.

## Email verification (`scenes/login/verify.tscn`)

- Explanation with a partially masked address only after the player supplied that email, one code field with paste and grouped formatting, Verify, Resend with countdown, expiry copy, Change email (registration), Back to Login, delivery-delay copy, email-provider outage banner.
- Back never skips to Character Select.
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

- Five visible slot cards (`UxCharacterCard` / `UxEmptySlot`): name, class glyph+label (not color-only), level, last location, last played, presence, Play, Delete.
- Link-dead copy is `Character still in world` / `Available in N seconds` from `playAvailableAt` vs `serverTimeMs`. Other live-lease characters show `Waiting for previous character to leave`. All Play buttons stay disabled until the lease clears, then the catalog refreshes and Play needs a new ticket. No client restart.
- Create Character, Recently Deleted, Account Settings, Logout, server status, client/server version in debug builds.
- Creation: three class cards with presentation summaries (Warrior close-range sword/shield, Marksman ranged bow, Mage staff/spell), name field, name rules, selected-state summary, Create, Cancel/Back, confirmation. No editable stats or starting-item lists. Creation is the only authoritative name reservation.
- Delete dialog: name, class, level, seven-day retention, immediate slot release, restore availability, exact-name field, destructive confirm.
- Recently Deleted: name, class, level, time remaining, Restore (disabled without a free slot, with full-slot copy). Purged rows disappear when the server list no longer includes them. No client-only permanent-delete button.
- Account Settings: verified email, account status, created date, registration mode, Support Recovery ID, Change password, Change email, Log out all sessions, Export my data. Permanent deletion is visually separated. Nakama user id is behind a developer-details toggle.
- Unverified/disabled/deleting accounts never reach this scene through the email path; RPCs still enforce the playable-account guard.

## Delete Account (`scenes/login/account_delete.tscn`)

- Irreversible warning covering five slots, live and recently deleted characters, inventory, equipment, gold, quests, settings, and parties. No restore. The email may later register a blank account.
- Current password, send confirmation code, email code, exact phrase `DELETE ACCOUNT`.
- Confirm is click-only (`FOCUS_CLICK`); Enter does not confirm. The button stays disabled until password, code, and phrase are valid.
- Success opens Account Deleted. Incomplete sagas show resume copy; the same idempotency key continues the job.

## Account Deleted (`scenes/login/account_deleted.tscn`)

- Clear success. Back to Login. No auto-login.

## World HUD

- Game Menu: Resume, Settings, Return to Character Select, Logout to Login, Quit Game. Return/logout show leave restrictions, session progress, and wait for server acknowledgement; they do not claim the character left first.
- HUD also keeps Character Select / Logout / Quit. Return uses opcode 32, waits for ack, then the character scene.
- Log out: same safe leave, then revoke current tokens, Login. Failed leave stays in-world.
- Quit Game: Quit Safely when allowed; otherwise warn about the ten-second hold, Cancel, or Quit Anyway.
- Session status: Entering world, Online, Returning to Character Select, Logging out, Connection lost, Character remains in world, Server unavailable.
- Settings persist non-credential preferences (including UI scale and text size).
- Debug GM panel does not grant account authority.

## Shared screen rules

All recovery and maintenance screens provide a loading state with a timeout message, disabled duplicate submit, clear success, clear expiry, resend guidance where a challenge is involved, back navigation that cannot skip verification or destructive confirm, password visibility on password fields, and paste support on code fields. Keyboard focus is visible. None enumerate accounts.

## Later phases (do not implement here)

1. Stay Signed In after OS credential-store certification on editor, exported Windows, and exported Linux.

## Error display rules

Show localized friendly text. Never show stack traces, SQL, internal RPC names, storage collections, provider errors, tokens, or server keys. Password-reset and forgotten-email must not reveal whether the address exists.
