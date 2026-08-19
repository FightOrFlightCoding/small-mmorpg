# Character state machine

Persistent character states and online-presence states. ACCT-01 does not change runtime behavior.

## Persistent character states (target)

```
ACTIVE
SOFT_DELETED
PURGED
```

Do not overload one boolean for the whole lifecycle.

## Current mapping

| Target | Current |
| --- | --- |
| `ACTIVE` | `deletedAt` missing or `0`. Counts toward `CHARACTER_SLOT_LIMIT` (**3**). |
| `SOFT_DELETED` | `deletedAt > 0`. Remains in roster list; hidden from ordinary play; name reservation held. No 7-day purge job. Restore if live count < 3. Character select UI: second Delete click confirms; the player does **not** type the character name. |
| `PURGED` | **Absent.** Soft-deleted rows are never anonymized or name-released automatically. Permanent account deletion (compatibility probe) removes the Nakama user and therefore the objects. |

Class is data-defined (`test.class.vanguard` / `arcanist` / `warden`) and already immutable after create. Target presentation IDs `class.warrior` / `class.marksman` / `class.mage` are a later content phase.

Name policy today: 3–16 characters, letters, digits, spaces, hyphen, apostrophe; canonical lowercase reservation. Target policy (ASCII letters, at most one separator, no digits/spaces) is **not** applied in ACCT-01.

## Online-presence states (target)

```
OFFLINE
ENTERING
ONLINE
LEAVING
LINK_DEAD
DESPAWNING
```

One account may have only one character in `ENTERING` | `ONLINE` | `LEAVING` | `LINK_DEAD` | `DESPAWNING`. A second device may view Character Select but must not Play while that lease exists. Play buttons must use a **server timestamp** for any countdown.

## Current mapping

| Target | Current |
| --- | --- |
| `OFFLINE` | Not in a match; no live player record (or grace expired and checkpointed). |
| `ENTERING` | Join in flight. Not a stored state. |
| `ONLINE` | Presence in the match. Party mirror uses `connectionState: "online"`. |
| `LEAVING` | Client shows “Leaving…” while `leave_match` runs. Not a server lease. Logout does not wait for a dedicated departure opcode. |
| `LINK_DEAD` | **Absent.** Unexpected socket loss keeps a **5s** public-world pose ghost (cave **60s** empty grace; party **60s** disconnect grace). Input is not globally rejected for 10 seconds with a server expiry timestamp. The character is omitted from snapshots immediately when disconnected. |
| `DESPAWNING` | Leave / grace expiry checkpoints and removes the entity. Not named. |

There is **no** account-wide active-character lease across matches. A second window as the same account is rejected from the **same** match (`already_in_match`) and from a second live match (`already_elsewhere`) unless transferring. That is not the target lease (Character Select Play disabled until lease clear).

## Restricted departure

Target “Return to Character Select” is allowed only when the character is not in a restricted state and only after server acknowledgement. Today Continue/Logout do not consult such a state machine.

## Soft-delete vs account delete

- Soft-delete is Character Select only, per character, keeps name for an undefined retention (no purge clock).
- Account recorded delete bypasses retention and removes all characters with the Nakama user.
