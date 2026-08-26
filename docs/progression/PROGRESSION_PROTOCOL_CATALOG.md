# Progression protocol catalog

PROG-05 allocates opcodes **33–35**. Existing progression/ability traffic stays. The client never sends XP amounts, levels, or derived totals.

Related: [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md).

## Current client → server

| Opcode | Name | Intention | Authority |
| --- | --- | --- | --- |
| 9 | `ALLOCATE_ATTRIBUTES` | `{ attributeId, amount, requestId }` | Production `stat.*` free points; test classes keep Foundation unspent attributes |
| 13 | `USE_ABILITY` | ability id, target, requestId | Ownership, range, resources, CD |
| 14 | `CANCEL_CAST` | requestId | Active cast |
| 15 | `ASSIGN_HOTBAR` | `{ slotIndex, abilityId?, requestId }` | Unlock list; client hotbar is not ownership |
| 16 | `UNLOCK_ABILITY` | `{ abilityId, requestId }` | Skill points, level, class tags, prereqs (Foundation path) |
| 33 | `SELECT_BRANCH` | `{ branchId, requestId }` | Level ≥ 5, class roster, unset branch. Grants pending signature/capstone |
| 34 | `SET_AUTO_ASSIGN` | `{ enabled, requestId }` | Flag only; turning on does not spend existing points |
| 35 | `AUTO_ASSIGN_UNSPENT_POINTS` | `{ requestId }` | Spends all current unspent free points on the class template |

The client must never send level, XP amounts, derived totals, talent ranks as facts, damage/heal/crit/mana/cooldown outcomes, or respec results.

## Current server → client

| Opcode | Name | Body today |
| --- | --- | --- |
| 111 | `PROGRESSION_STATE` | class, level, XP, attributes, derived, unspent points, pending branch, optional `events` |
| 112 | `ABILITY_STATE` | unlocked ids, hotbar (8), ranks, resources, cooldowns, cast, effects |
| 101 | `FULL_STATE` | includes progression + abilities |

Ephemeral progression `events` (xp/level/points/unlocks/cap) are included on the `PROGRESSION_STATE` for that grant. They are not storage authority.

## Planned later intents (unallocated)

| Intent | Planned body (sketch) | Server authority |
| --- | --- | --- |
| Purchase class/branch node | `{ nodeId, requestId }` | Points, tier gates, one buyable active |
| Trainer respec | `{ npcId, requestId }` | Gold `50 × level`, refund free stats, skill points, branch |

GM `reset_attribute_allocation` / `reset_skill_allocation` remain debug/ops, not the player respec.

## Hotbar validity (later)

Active hotbar length **4**. Auto-attack is not a slot. Frenzy (`ability.warrior.frenzy`) is illegal on the active hotbar. Server rejects extra slots and unknown/unowned ids.
