# NPC state machines (NPC-07)

These are the certified state models. Cosmetic route plans pause while any usable interaction session exists. Quest dialogue/marker state comes from the canonical quest log. Vendor buy is session-gated on that same live session. Movement is transient. Quest and merchant results persist.

## Cosmetic movement

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `IDLE` | Server holds a stable pose (stationary, dwell, or no legal next node). | `MOVING` on an authorized cosmetic route; `PAUSED_FOR_INTERACTION` when the first live session opens. |
| `MOVING` | Server owns a straight-line segment between authored waypoints; clients interpolate the plan. | `IDLE` on destination/route stop; `PAUSED_FOR_INTERACTION` when the first live session opens. |
| `PAUSED_FOR_INTERACTION` | Movement is frozen at the current interpolated pose and the paused plan is broadcast. | `IDLE` or `MOVING` when the last usable session closes, expires, or is invalidated (including disconnect, transfer, and leave). |

Movement is cosmetic: it does not create a combat target, collision body, threat entry, damageable state, or client-owned transform. The server resolves interaction distance against the current interpolated pose. Randomization may affect only the next authored route choice, speed within content bounds, dwell within content bounds, and initial start delay. NPCs never select arbitrary world positions. Plans are match-lifetime and are not persisted. A complete server or match restart may rebuild the NPC at `homePosition`.

## Interaction session

| State | Meaning | Allowed transitions |
| --- | --- | --- |
| `OPEN` | Server accepted an interaction request and issued a correlated session. | `ACTIVE`, `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `ACTIVE` | The session may present the current dialogue node and authorized service buttons. Successful `INTERACT` writes `active`. | `CLOSED`, `EXPIRED`, `INVALIDATED`. |
| `CLOSED` | Normal terminal close; no further action may reuse the session. Failed `INTERACT` or `INTERACTION_CLOSE` marks `closed`. | Terminal. |
| `EXPIRED` | TTL elapsed. | Terminal. |
| `INVALIDATED` | NPC/zone/player/service precondition changed (range, death, link-dead, disconnect, transfer, match leave). | Terminal. |

Opening requires match presence, character ownership, a live NPC instance in the same zone, server distance within the NPC range, an eligible living player, and the interact rate limit. Repeated `requestId` values replay the stored `INTERACTION_RESULT` and do not re-run `talk_to_npc`. Dialogue choice uses a new `requestId` against the live session. `VENDOR_BUY` uses a new `requestId` against the live session (same successful id may replay). Transitioning to a reward-bearing existing service re-runs that service's current server validation and idempotency; a presentation session is not a transaction authorization.

Match-owned `interactionSession`, `interactByRequestId`, `dialogueChoiceByRequestId`, and `interactionCloseByRequestId` are not persistent storage records. Cosmetic movement plans live on the match NPC and pause while any usable session targets that NPC. `refreshNpcPauses` runs from the match tick and from persistence leave/disconnect/transfer/link-dead despawn.

## Quest dialogue and markers

| Dialogue state | Meaning | Marker if this NPC binds the quest |
| --- | --- | --- |
| `available` | Prerequisites pass; not accepted. | `!` |
| `prerequisite_missing` | Offer exists but prerequisites fail. | none |
| `accepted` | Accepted, no partial objective progress. | `·` |
| `in_progress` | Accepted, at least one objective partially complete. | `·` |
| `ready` | All objectives satisfied; not turned in. | `?` |
| `completed` | Turned in. | none |

Marker priority on one NPC: ready, then available, then active incomplete, then none. Markers refresh after accept, objective progress, completion, login, zone join, `FULL_STATE`, and character switch. Completed quest status loads from character storage after restart; NPC pose does not.
