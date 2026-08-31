# Progression protocol catalog

PROG-07 allocates opcode **38**. Existing progression/ability traffic stays. The client never sends XP amounts, levels, derived totals, gold costs, talent ranks as facts, or unlock lists.

Related: [PROTOCOL_CATALOG.md](../PROTOCOL_CATALOG.md).

## Current client → server

| Opcode | Name | Intention | Authority |
| --- | --- | --- | --- |
| 9 | `ALLOCATE_ATTRIBUTES` | `{ attributeId? or statId, amount, requestId }` | Production `stat.*` free points, any of the eight stats, no cap; test classes keep Foundation unspent attributes |
| 13 | `USE_ABILITY` | ability id, target, requestId | Ownership, range, resources, CD |
| 14 | `CANCEL_CAST` | requestId | Active cast |
| 15 | `ASSIGN_HOTBAR` | `{ slotIndex, abilityId?, requestId }` | Production: owned active, 4 slots, no duplicates, no passives. Foundation test classes: 8-slot unlock list |
| 16 | `UNLOCK_ABILITY` | `{ abilityId, requestId }` | Foundation skill-point path only. Production `class.*` → `unsupported_class` |
| 33 | `SELECT_BRANCH` | `{ branchId, requestId }` | Level ≥ 5, class roster, unset branch, safe-leave. Grants pending signature/capstone |
| 34 | `SET_AUTO_ASSIGN` | `{ enabled, requestId }` | Flag only; turning on does not spend existing points |
| 35 | `AUTO_ASSIGN_UNSPENT_POINTS` | `{ requestId }` | Spends all current unspent free points on the class template |
| 36 | `ALLOCATE_ATTRIBUTES_BATCH` | `{ allocations, requestId }` | Atomic confirmed multi-stat spend |
| 37 | `TRAINER_RESPEC` | `{ npcId, requestId }` | Trainer `respec` service; gold `50 × level`; refunds eligible points |
| 38 | `PURCHASE_TALENT` | `{ treeId, nodeId, requestedRank, requestId }` | Class/branch pools, tiers, prerequisites, derived ownership |

The client must never send level, XP amounts, derived totals, talent ranks as facts, damage/heal/crit/mana/cooldown outcomes, crit rolls, or respec results.

## Current server → client

| Opcode | Name | Body today |
| --- | --- | --- |
| 111 | `PROGRESSION_STATE` | class, level, XP, attributes, derived, unspent points, pending branch, purchased nodes, optional `events` |
| 112 | `ABILITY_STATE` | unlocked ids, hotbar (4 production / 8 test), `hotbarAssignments`, ranks, resources, cooldowns, cast, effects |
| 101 | `FULL_STATE` | includes progression + abilities |

Ephemeral progression `events` (xp/level/points/unlocks/cap) are included on the `PROGRESSION_STATE` for that grant. They are not storage authority.

GM `reset_attribute_allocation` / `reset_skill_allocation` remain debug/ops, not the player respec.


## Hotbar validity (later)

Active hotbar length **4**. Auto-attack is not a slot. Frenzy (`ability.warrior.frenzy`) is illegal on the active hotbar. Server rejects extra slots and unknown/unowned ids.
