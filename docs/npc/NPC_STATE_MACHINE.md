# NPC state machines (NPC-01)

These are the target state models for later NPC implementation. They do not alter the static NPC behavior accepted before NPC-01.

## Cosmetic movement

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `IDLE` | Server holds a stable pose. | `MOVING` on an authorized cosmetic route; `PAUSED_FOR_INTERACTION` on accepted interaction. |
| `MOVING` | Server advances a content/route-owned cosmetic pose; clients interpolate snapshots. | `IDLE` on destination/route stop; `PAUSED_FOR_INTERACTION` on accepted interaction. |
| `PAUSED_FOR_INTERACTION` | Movement is paused while an authorized interaction session is active. | `IDLE` or `MOVING` when the session closes, expires, or is invalidated. |

Movement is cosmetic: it does not create a combat target, collision body, threat entry, damageable state, or client-owned transform. The server must resolve interaction distance against the current authoritative pose.

## Interaction session

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `OPEN` | Server accepted an interaction request and issued/created a correlated session. | `ACTIVE`, `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `ACTIVE` | The session may present dialogue or an existing authorized service. | `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `CLOSED` | Normal terminal close; no further action may reuse the session. | Terminal. |
| `EXPIRED` | Time or disconnect terminal close. | Terminal. |
| `INVALIDATED` | NPC/zone/player/service precondition changed. | Terminal. |

Opening requires match presence, a live NPC instance in the same zone, server distance within the NPC range, and an eligible living player. Transitioning to a reward-bearing existing service re-runs that service's current server validation and idempotency; a presentation session is not a transaction authorization.

## Current implementation gap

The accepted runtime currently has request-correlated `INTERACT` and presentation pending IDs but no server-persisted or match-owned explicit session record. NPCs are static. This is intentional NPC-01 scope: add no session protocol/state or movement behavior here. The later owner must reconcile the target model with link-dead, transfer, safe leave, NPC despawn/content reload, and dialogue close events.
