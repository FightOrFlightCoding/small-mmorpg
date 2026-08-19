# Character state machine

Persistent character states and online-presence states. ACCT-05 owns the five-slot catalog, production classes, selection tickets, soft-delete/restore/purge, and the account gameplay lease.

## Persistent character states

```
ACTIVE
SOFT_DELETED
PURGED
```

Do not overload one boolean for the whole lifecycle. `status` is stored on the character record; `deletedAt` / `softDeleteExpiresAt` remain the timestamps.

| State | Meaning |
| --- | --- |
| `ACTIVE` | `deletedAt` is `0`. Counts toward `CHARACTER_SLOT_LIMIT` (**5**). Playable when the account and character pass selection gates. |
| `SOFT_DELETED` | `deletedAt > 0` and retention has not been purged. Hidden from Play. Name reservation stays `HELD`. Gameplay records are preserved. Restore is allowed while live count < 5, retention has not expired, and the reservation still belongs to this character. |
| `PURGED` | Idempotent purge removed gameplay records, released the name, dropped the roster id, and wrote a minimal `character_audit` row (`characterId`, `purgedAt`). Character Select does not show purged rows. |

Deletion requires the exact current display name (`confirmationName`) plus an optional idempotency key. There is no client-only permanent-delete button; account deletion still removes the Nakama user and every remaining object.

Retention is **7 days** (`SOFT_DELETE_RETENTION_MS`). `character_list` opportunistically purges expired rows. `character_purge` is the explicit idempotent command and recovers from a partial step job (`player` / `purge_<compactId>`).

## Classes

Production Character Select uses content IDs `class.warrior`, `class.marksman`, and `class.mage` with presentation keys, placeholder visuals, and **provisional** stats/loadouts. Numeric combat numbers still come from `class_progression`. Character Select does not hard-code class behavior.

Certification and systems-lab fixtures keep `test.class.vanguard` / `arcanist` / `warden`. Existing saves that already store those IDs are not rewritten. Prompt 18 records with an empty `classId` receive `class.warrior` (`legacyMigrationDefault`) without a second starter grant.

Class id is immutable after create.

## Names

Display names: 3–16 characters, letters, digits, spaces, hyphen, apostrophe; no leading/trailing separator; no repeated spaces. Canonical form is lowercase. Reservation is a project-owned `names` / `n_<encoded>` object (system user), written with create-if-absent OCC (`version` `*`) plus re-read token confirm. Search indexes are not the uniqueness mechanism. `Archer` / `archer` / `ARCHER` collide. `character_name_available` is advisory only.

Reservation value: `{ canonicalName, characterId, accountUserId, token, reservationState, createdAt, releasedAt, schemaVersion }`. Soft-delete keeps `HELD`. Purge deletes the object so the name can be reused.

## Online-presence and the account lease

```
OFFLINE
ENTERING
ONLINE
LEAVING
LINK_DEAD
DISCONNECTING
DESPAWNING
```

One account may have only one character in a live gameplay lease. `player` / `gameplay_lease` is written on match join (`ONLINE`) and set to `DISCONNECTING` on leave for the existing public **5s** / cave **60s** grace. Character Select maps `DISCONNECTING` to **link-dead** for that character and **account busy** for every other character. Play and delete are rejected while the lease is live. `playAvailableAt` is the server timestamp when the lease expires.

Match join still requires a short-lived single-use `selectionTicket`. Join metadata may carry `selectionTicket` or `transferTicket`, never an arbitrary `characterId`.

## Restricted departure

Target “Return to Character Select” remains later. Continue/Logout still leave the match, then return to login or character select through the existing shell.

## Soft-delete vs account delete

- Soft-delete is Character Select only, per character, typed name confirmation, 7-day retention, name held, gameplay preserved.
- Account recorded delete bypasses retention and removes all characters with the Nakama user.
