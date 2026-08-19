# Account UI flows

Current Godot shell vs the professional lifecycle UI. ACCT-01 does not change scenes, copy, or controls.

## Login / register (`scenes/login`, `login.gd`)

- Email and password `LineEdit`s; password and confirm use `secret = true`. No show/hide toggle. Pasting is whatever Godot allows (not blocked).
- Register requires matching confirm. Client `strip_edges` on email only; password is not trimmed or case-folded.
- Debug: Alice, Bob, this machine (hidden in release).
- Hint: password recovery is administrator-assisted.
- Success → character scene. Failure → recoverable dialog with sanitized copy.
- Cached session restore on ready.

Missing vs target: 15–128 advisory strength, common-password list, remembered email (optional), Stay Signed In bound to a verified OS store, verification-pending screen, support contact.

## Character select (`scenes/character`, `character.gd`)

- List, name field (max 16), class `OptionButton` from content, Create / Select / Delete / Restore / Continue / Logout.
- Delete: click twice on the same id (no typed name, no lease check).
- Soft-deleted rows remain in the list (restore button). No “Recently Deleted” section and no 7-day copy.
- Continue requires a selection ticket then `find_or_create_starter_zone`.
- Logout returns to Login (current session only).
- No Account Settings, no account delete, no Play disabled-for-lease countdown.

Classes shown are catalog ids (`test.class.*`), not warrior/marksman/mage cards.

## World HUD

- Logout → leave match (“Leaving…”) → Login. Not Return to Character Select.
- Settings persist non-credential preferences.
- Debug GM panel does not grant account authority.

## Target flows (later phases; do not implement here)

1. Register → check email → pending verification → login still limited.
2. Character Select with five slots, class cards, Recently Deleted, typed-name delete, restore.
3. Play disabled while server reports an active-character lease; countdown from **server expiry**, not local 10 s.
4. In-game: Return to Character Select (acked) vs Logout current vs Quit (link-dead unless already departed).
5. Account Settings: logout all, export, delete (password + email code + `DELETE ACCOUNT` + warning).

## Error display rules (already intended)

Show localized friendly text. Never show stack traces, SQL, internal RPC names, storage collections, provider errors, tokens, or server keys. Password-reset and forgotten-email must not reveal whether the address exists.
