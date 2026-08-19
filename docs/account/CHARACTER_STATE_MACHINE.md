# Character state machine

Persistent character states and online-presence states. ACCT-06 owns the account-wide active-character lease, safe departure, and the ten-second link-dead hold. ACCT-05 still owns the five-slot catalog, production classes, selection tickets, and soft-delete/restore/purge.

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
DESPAWNING
```

Legacy storage `DISCONNECTING` parses as `LINK_DEAD`.

One canonical server-only lease exists per account (`player` / `gameplay_lease`, `permissionWrite: 0`, `schemaVersion` **2**). Fields: `accountUserId`, `characterId`, `sessionId`, `socketOrPresenceId`, `matchId`, `zoneOrInstanceId`, `state`, `createdAt`, `updatedAt`, `disconnectDetectedAt`, `despawnAt`, `leaseVersion`, `serverInstanceIdentifier`, `schemaVersion`. Writes also keep `presenceState` / `playAvailableAt` aliases for Character Select.

Lease acquisition is atomic (OCC `storageWriteRetry`, create-if-absent `version` `*`). A second gameplay join while a live lease exists fails (`account_busy`, or `link_dead` for the leased character during the hold). Transfer joins reuse the existing `ONLINE` lease and retarget `matchId`; they do not acquire a second lease.

Join path: authenticate → select character → selection ticket → world destination → acquire `ENTERING` in `matchJoinAttempt` → join match → consume ticket → create entity → `FULL_STATE` → mark `ONLINE`. Failed or interrupted `ENTERING` is cleared immediately (`abortInterruptedJoin`) or after **15 s** (`ENTERING_TIMEOUT_MS`) via list/select/delete repair. An interrupted join must not leave a permanent `ENTERING` lease.

### Safe Return to Character Select

Opcode **32** `RETURN_TO_CHARACTER_SELECT`. Allowed only when the character is alive, not in combat, not casting, not trading, not transferring, and no committing reward is in progress. Denial messages are explicit (`Cannot leave safely while in combat.`).

When allowed: persist canonical state, cancel transients (trade unlock), remove the entity, broadcast despawn, mark lease `LEAVING`, acknowledge. The client must not change scenes until that ack. `matchLeave` then releases the lease. Logout to Login must complete this path, then revoke tokens. A failed safe departure must not show Login while a live lease remains.

### Unexpected disconnect (link-dead)

When the server detects lost presence and no safe leave was committed:

1. Mark lease `LINK_DEAD`.
2. Set `disconnectDetectedAt` to server time.
3. Set `despawnAt = disconnectDetectedAt + 10_000`.
4. Keep the entity in the match for **100 ticks** (`LINK_DEAD_TICKS`). Zero movement, interrupt casts, cancel trade immediately, reject gameplay commands, keep the body targetable, keep PvE combat and death running.
5. At the deadline: persist, despawn, release the lease.

The new socket is **not** rebound during those ten seconds. Character Select shows `Character still in world` / `Available in N seconds` using `playAvailableAt` and `character_list.serverTimeMs`. Every Play button on the account stays disabled. After release, the catalog refreshes and Play requires a **new** selection ticket.

### Death while link-dead

Normal server-authoritative death and the existing **3 s** auto-respawn timer still run. Disconnect does not revive. Death rewards/penalties are not duplicated. The lease still releases at the link-dead deadline (the corpse or respawned body stays until then). Health is not a persisted field; the next join uses `joinHealth` at the last checkpoint, same as any other completed death.

### Party, trade, cave

Unexpected disconnect cancels direct trade and unlocks offered items immediately. Temporary party membership follows the existing **60 s** `disconnect_grace` (not the 10 s entity hold). Party UI shows `disconnected`. Cave ownership and rejoin eligibility stay as Prompt 29 instance rules; the avatar is gone after 10 s, so a second cave presence cannot exist. Empty-cave instance timeout is independent of the entity hold.

### Stale leases

`nk.matchGet` missing, `ENTERING` timeout, `DESPAWNING`, and `matchTerminate` / empty-timeout repair the lease immediately and log `gameplay_lease repaired`. Location returns to the last public-world checkpoint. Do not wait ten seconds for a match that no longer exists. Valid leases for live matches are not cleared.

### Heartbeat limitation

The ten-second hold starts **after server disconnect detection**, not when the player closes a window. Frozen clients and physical cable loss wait for Nakama socket/presence timeout first. This repo does not override Nakama 3.40.0 socket ping settings (`infra/nakama/*.yml` only raises message size). Recorded defaults: `socket.ping_period_ms` **15000**, `socket.pong_wait_ms` **25000**. A silent or frozen client can therefore take up to **25 s** after the last pong before `matchLeave` runs; a clean websocket close can be detected immediately. `presence_lost` logs `disconnect_detected_at` and `despawn_at` in server time. Do not promise that the avatar disappears ten seconds after Alt+F4.

Match join still requires a short-lived single-use `selectionTicket`. Join metadata may carry `selectionTicket` or `transferTicket`, never an arbitrary `characterId`.

## Restricted departure

World HUD: Character Select (opcode 32), Log out (safe leave then token revoke), Quit Game (Quit Safely or Quit Anyway). Window close / Alt+F4 shows the same dialog when the platform delivers `NOTIFICATION_WM_CLOSE_REQUEST`. That callback is not an authoritative logout; a kill/crash is handled entirely by the server link-dead path.

## Soft-delete vs account delete

- Soft-delete is Character Select only, per character, typed name confirmation, 7-day retention, name held, gameplay preserved.
- Account recorded delete bypasses retention and removes all characters with the Nakama user.
