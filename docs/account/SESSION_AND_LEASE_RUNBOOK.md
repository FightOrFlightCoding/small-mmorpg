# Session and lease runbook

How sessions, selection tickets, and the ten-second link-dead hold behave.

Related: [CHARACTER_STATE_MACHINE.md](CHARACTER_STATE_MACHINE.md), [ACCOUNT_ARCHITECTURE.md](ACCOUNT_ARCHITECTURE.md), [PLAYER_ACCOUNT_GUIDE.md](PLAYER_ACCOUNT_GUIDE.md).

## Sessions

| Action | Gateway | Effect |
| --- | --- | --- |
| Login | `POST /v1/auth/login` | Access + refresh tokens; email sessions stay in Godot memory only |
| Refresh | `POST /v1/auth/refresh` | New pair; revoked/expired → Login. Limit 30/60s per IP |
| Logout current | `POST /v1/auth/logout` | That pair dies. Replay is safe. |
| Logout all | `POST /v1/auth/logout-all` | Password or recent JWT `iat`; every session dies; security email |

Failed logout-all must **not** clear the local session. Email Stay Signed In is off. Device-debug may still use `user://session_cache.json`.

Access tokens expire; the client refreshes with bounded retry. A dead refresh token returns to Login without a device reauth loop.

## Selection tickets

`character_select` issues a 300-second one-time ticket. Match join metadata may carry `selectionTicket` or `transferTicket`, never `characterId`. Replay or expiry is rejected. A new Play requires a new select.

## One character in the world

`player` / `gameplay_lease` `schemaVersion` **2**. One lease per account across public world and party caves.

| State | Meaning |
| --- | --- |
| `ENTERING` | Join in progress. Crash → timeout (~15 s) then stale repair |
| `ONLINE` | Live avatar |
| `LEAVING` | Opcode 32 acknowledged; client leaves after ack |
| `LINK_DEAD` | Disconnect detected; 10 s hold |
| `DESPAWNING` | Hold ended |

Second select while the lease is live: `account_busy` / countdown on every slot. Two Godot windows on one account cannot play two characters.

## Ten-second link-dead

Starts at **server detection**, not Alt+F4 click time. Nakama 3.40.0 defaults ping every **15 s** and wait **25 s** for a pong, so a frozen client or pulled cable can remain `ONLINE` until that wait ends. Clean closes can hit `matchLeave` immediately.

During the hold:

- Avatar remains in snapshots for other players
- No movement or player actions
- PvE can damage; death/respawn is server-side
- Trade cancels; party membership still uses the 60 s party grace
- Cave **instance** empty/rejoin grace stays 60 s; the **entity** is gone at 10 s
- Re-entry of the same or another character is blocked
- Character Select shows `playAvailableAt`

After `despawnAt`, the lease releases. Play needs a **new** ticket. No duplicate avatar.

Opcode **32** is the only safe in-world leave. Combat, death, casts, trades, transfers, and committing rewards deny it. Logout to Login must complete that path first or stay in-world.

## Stale lease

If the match is gone, `ENTERING` timed out, or the process restarted: repair immediately (do not wait 10 s). Logged as `stale_lease_repaired`. Next select can succeed. Public-world fallback still applies for missing caves.

Do not hand-edit `gameplay_lease` in SQL.

## Restarts

Nakama or Postgres restart: players re-login or refresh as needed; location + lease repair on next join. Controlled drill: `powershell -File scripts/test-failure.ps1 -Live` on a disposable stack.
