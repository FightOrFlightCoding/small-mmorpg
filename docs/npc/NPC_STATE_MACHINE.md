# NPC state machines (NPC-02)

These are the target state models. Conflict closure added a match-owned interaction session record without cosmetic patrols.

## Cosmetic movement

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `IDLE` | Server holds a stable pose. Current runtime state for every NPC. | `MOVING` on an authorized cosmetic route; `PAUSED_FOR_INTERACTION` on accepted interaction. |
| `MOVING` | Server advances a content/route-owned cosmetic pose; clients interpolate snapshots. | `IDLE` on destination/route stop; `PAUSED_FOR_INTERACTION` on accepted interaction. |
| `PAUSED_FOR_INTERACTION` | Movement is paused while an authorized interaction session is active. | `IDLE` or `MOVING` when the session closes, expires, or is invalidated. |

Movement is cosmetic: it does not create a combat target, collision body, threat entry, damageable state, or client-owned transform. The server resolves interaction distance against the current authoritative pose. NPC-02 authors and validates routes; runtime poses stay `IDLE` at `homePosition` until a later named movement phase ticks snapshots.

## Interaction session

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `OPEN` | Server accepted an interaction request and issued/created a correlated session. | `ACTIVE`, `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `ACTIVE` | The session may present dialogue or an existing authorized service. Current successful `INTERACT` writes `active`. | `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `CLOSED` | Normal terminal close; no further action may reuse the session. Failed `INTERACT` marks `closed`. | Terminal. |
| `EXPIRED` | Time or disconnect terminal close. | Terminal. |
| `INVALIDATED` | NPC/zone/player/service precondition changed. | Terminal. |

Opening requires match presence, a live NPC instance in the same zone, server distance within the NPC range, and an eligible living player. Repeated `requestId` values replay the stored `INTERACTION_RESULT` and do not re-run `talk_to_npc`. Transitioning to a reward-bearing existing service re-runs that service's current server validation and idempotency; a presentation session is not a transaction authorization.

Match-owned `interactionSession` and `interactByRequestId` are not persistent storage records. NPC poses remain static on `FULL_STATE` until a later named movement phase adds snapshot updates.
