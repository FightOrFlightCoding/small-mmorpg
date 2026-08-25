# Progression protocol catalog

PROG-01 allocates **no new opcodes**. Existing progression/ability traffic stays unchanged.

Related: [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md).

## Current client → server (keep)

| Opcode | Name | Intention | Authority |
| --- | --- | --- | --- |
| 9 | `ALLOCATE_ATTRIBUTES` | `{ attributeId, amount, requestId }` | Unspent points, class allow-list |
| 13 | `USE_ABILITY` | ability id, target, requestId | Ownership, range, resources, CD |
| 14 | `CANCEL_CAST` | requestId | Active cast |
| 15 | `ASSIGN_HOTBAR` | `{ slotIndex, abilityId?, requestId }` | Unlock list; client hotbar is not ownership |
| 16 | `UNLOCK_ABILITY` | `{ abilityId, requestId }` | Skill points, level, class tags, prereqs |

The client must never send level, XP amounts, derived totals, talent ranks as facts, damage/heal/crit/mana/cooldown outcomes, or respec results.

## Current server → client (keep)

| Opcode | Name | Body today |
| --- | --- | --- |
| 111 | `PROGRESSION_STATE` | class, level, XP, attributes, derived, unspent points |
| 112 | `ABILITY_STATE` | unlocked ids, hotbar (8), ranks, resources, cooldowns, cast, effects |
| 101 | `FULL_STATE` | includes progression + abilities |

## Planned later intents (unallocated)

Do not assign opcode numbers in PROG-01. A later phase must pick unused ids and update `protocol.ts`, `protocol.gd`, and [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md).

| Intent | Planned body (sketch) | Server authority |
| --- | --- | --- |
| Select branch | `{ branchId, requestId }` at level ≥ 5 if unset | Roster + level |
| Purchase class/branch node | `{ nodeId, requestId }` | Points, tier gates, one buyable active |
| Toggle auto-assign | `{ enabled, requestId }` | Flag only; allocations remain server-applied |
| Trainer respec | `{ npcId, requestId }` | Gold `50 × level`, refund free stats, skill points, branch |

GM `reset_attribute_allocation` / `reset_skill_allocation` remain debug/ops, not the player respec.

## Hotbar validity (later)

Active hotbar length **4**. Auto-attack is not a slot. Frenzy (`ability.warrior.frenzy`) is illegal on the active hotbar. Server rejects extra slots and unknown/unowned ids.
