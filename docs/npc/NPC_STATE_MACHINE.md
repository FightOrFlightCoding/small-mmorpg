# NPC state machines (NPC-03)

These are the target state models. NPC-03 ticks cosmetic route plans. Interaction still does not pause movement.

## Cosmetic movement

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `IDLE` | Server holds a stable pose (stationary, dwell, or no legal next node). | `MOVING` on an authorized cosmetic route; `PAUSED_FOR_INTERACTION` via the pause API. |
| `MOVING` | Server owns a straight-line segment between authored waypoints; clients interpolate the plan. | `IDLE` on destination/route stop; `PAUSED_FOR_INTERACTION` via the pause API. |
| `PAUSED_FOR_INTERACTION` | Movement is frozen at the current interpolated pose. Pause/resume exist for later interaction; `INTERACT` does not enter this state in NPC-03. | `IDLE` or `MOVING` when resume is called. |

Movement is cosmetic: it does not create a combat target, collision body, threat entry, damageable state, or client-owned transform. The server resolves interaction distance against the current interpolated pose. Randomization may affect only the next authored route choice, speed within content bounds, dwell within content bounds, and initial start delay. NPCs never select arbitrary world positions. Plans are match-lifetime and are not persisted.

## Interaction session

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `OPEN` | Server accepted an interaction request and issued/created a correlated session. | `ACTIVE`, `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `ACTIVE` | The session may present dialogue or an existing authorized service. Current successful `INTERACT` writes `active`. | `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `CLOSED` | Normal terminal close; no further action may reuse the session. Failed `INTERACT` marks `closed`. | Terminal. |
| `EXPIRED` | Time or disconnect terminal close. | Terminal. |
| `INVALIDATED` | NPC/zone/player/service precondition changed. | Terminal. |

Opening requires match presence, a live NPC instance in the same zone, server distance within the NPC range, and an eligible living player. Repeated `requestId` values replay the stored `INTERACTION_RESULT` and do not re-run `talk_to_npc`. Transitioning to a reward-bearing existing service re-runs that service's current server validation and idempotency; a presentation session is not a transaction authorization.

Match-owned `interactionSession` and `interactByRequestId` are not persistent storage records. Cosmetic movement plans live on the match NPC and are not paused by `INTERACT` in this phase.
